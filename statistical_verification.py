import sqlite3
import numpy as np
import json
import re
from scipy.stats import pearsonr, ttest_ind

def _parse_time_score(time_slot: str) -> float:
    if not time_slot: return 0.0
    score = 0.0
    popular_days = {"월": 1.2, "화": 1.0, "수": 1.1, "목": 1.0, "금": 0.8}
    for day, w in popular_days.items():
        if day in time_slot: score += w
    if any(f"{d}{p}" in time_slot for d in "월화수목금" for p in ["1", "2"]):
        score *= 0.85
    return min(score, 3.0)

def extract_group_cutoffs(conn, code, div, year, semester, fallback_min):
    # Retrieve all bids for this section
    bids = conn.execute("""
        SELECT mileage, major, success FROM mileage_bids
        WHERE course_code=? AND division=? AND year=? AND semester=?
    """, (code, div, year, semester)).fetchall()
    
    if not bids:
        return fallback_min, fallback_min # Fallback if no individual bids found
        
    major_bids = []
    non_major_bids = []
    
    for b_mileage, b_major, b_success in bids:
        # Major status: Y(Y) or Y(N) starts with 'Y'. Non-major starts with 'N'.
        is_maj = b_major and b_major.startswith('Y')
        bid_entry = {'mileage': float(b_mileage or 1.0), 'success': b_success == 'Y'}
        if is_maj:
            major_bids.append(bid_entry)
        else:
            non_major_bids.append(bid_entry)
            
    def get_group_cutoff(group_bids):
        if not group_bids:
            return fallback_min
        # Check if under-enrolled for this group
        success_count = sum(1 for b in group_bids if b['success'])
        if success_count == len(group_bids):
            return 1.0 # Everyone got in, cutoff is 1
            
        # Cutoff is the maximum of failed bids
        fails = [b['mileage'] for b in group_bids if not b['success']]
        if fails:
            return max(fails)
        # If no fails, get minimum of passes
        passes = [b['mileage'] for b in group_bids if b['success']]
        if passes:
            return min(passes)
        return fallback_min
        
    maj_cut = get_group_cutoff(major_bids)
    non_maj_cut = get_group_cutoff(non_major_bids)
    return maj_cut, non_maj_cut

def main():
    conn = sqlite3.connect("mileage_history.db")
    
    # 1. Fetch raw data
    query = """
        SELECT
            s.course_code, s.division, s.year, s.semester,
            s.capacity, s.applicants, s.max_allowed, s.major_ratio, s.min_mileage, s.avg_mileage, s.year_quotas,
            c.credits, c.time_slot, c.classification, c.dept, c.title
        FROM mileage_summary s
        LEFT JOIN courses c ON c.course_code = s.course_code AND c.division = s.division
        WHERE s.capacity > 0
    """
    rows = conn.execute(query).fetchall()
    
    raw_data = []
    for r in rows:
        code, div, year, semester, cap, app, max_al, major_ratio, min_mlg, avg_mlg, yq_json, credits, time_slot, classification, dept, title = r
        sem_sort = 1 if semester == "10" else 2
        year_int = int(year)
        
        # Sibling divisions counts
        sibling_rows = conn.execute("""
            SELECT capacity FROM mileage_summary 
            WHERE course_code=? AND year=? AND semester=? AND division !=?
        """, (code, year, semester, div)).fetchall()
        sibling_caps = [sr[0] for sr in sibling_rows]
        num_divs = len(sibling_caps) + 1
        
        existed_last_yr = conn.execute("""
            SELECT COUNT(*) FROM mileage_summary 
            WHERE course_code=? AND year=? AND semester=?
        """, (code, str(year_int - 1), semester)).fetchone()[0]
        
        raw_data.append({
            'course_code': code, 'division': div, 'year': year, 'semester': semester,
            'capacity': cap, 'applicants': app, 'max_allowed': max_al, 'major_ratio': major_ratio,
            'min_mileage': min_mlg, 'avg_mileage': avg_mlg, 'yq_json': yq_json, 'credits': credits, 
            'time_slot': time_slot, 'classification': classification, 'department': dept, 'title': title,
            'sibling_caps': sibling_caps, 'existed_last_year': existed_last_yr,
            'num_divisions': num_divs, 'year_int': year_int, 'sem_sort': sem_sort
        })
        
    raw_data.sort(key=lambda x: (x['year_int'], x['sem_sort']))
    print(f"데이터베이스 로드 완료: {len(raw_data)}개 분반")

    # 2. Re-construct 50 temporal features and split cutoffs
    history_store = {}
    records = []
    
    for row in raw_data:
        code = row['course_code']
        div = row['division']
        year = row['year']
        sem = row['semester']
        cap = row['capacity']
        app = row['applicants']
        max_al = row['max_allowed']
        major_ratio = row['major_ratio']
        credits = row['credits']
        time_slot = row['time_slot']
        classification = str(row['classification'] or "")
        dept = str(row['department'] or "")
        title = str(row['title'] or "")
        sibling_caps = row['sibling_caps']
        existed_last_yr = row['existed_last_year']
        yq_json = row['yq_json']
        
        # Pull separate cutoffs!
        maj_cut, non_maj_cut = extract_group_cutoffs(conn, code, div, year, sem, row['min_mileage'])
        
        # History lookup
        key = (code, div)
        hist = history_store.get(key, [])
        
        hist_avg_min = 12.0; hist_min_min = 1.0; hist_max_min = 36.0; hist_std_min = 0.0
        hist_last_min = 12.0; hist_last2_min = 12.0; hist_avg_avg = 12.0; hist_avg_max = 36.0
        hist_trend_min = 0.0; hist_avg_app_ratio = 1.0; hist_last_app_ratio = 1.0
        hist_max_app_ratio = 1.0; hist_under_enroll_rate = 0.0; hist_avg_app = 20.0
        hist_std_app = 0.0; hist_last_app = 20.0; hist_avg_cap = 30.0; hist_avg_mqr = 0.0
        
        if len(hist) > 0:
            hist_min_vals = [h['min_mileage'] for h in hist]
            hist_avg_vals = [h['avg_mileage'] for h in hist]
            hist_app_ratios = [h['app_ratio'] for h in hist]
            hist_apps = [h['applicants'] for h in hist]
            hist_caps = [h['capacity'] for h in hist]
            hist_mqrs = [h['mqr'] for h in hist]
            
            hist_avg_min = np.mean(hist_min_vals)
            hist_min_min = np.min(hist_min_vals)
            hist_max_min = np.max(hist_min_vals)
            hist_std_min = np.std(hist_min_vals) if len(hist) >= 2 else 0.0
            hist_last_min = hist_min_vals[-1]
            hist_last2_min = hist_min_vals[-2] if len(hist) >= 2 else hist_last_min
            hist_avg_avg = np.mean(hist_avg_vals)
            hist_avg_max = np.max(hist_avg_vals)
            hist_trend_min = hist_last_min - hist_avg_min
            
            hist_avg_app_ratio = np.mean(hist_app_ratios)
            hist_last_app_ratio = hist_app_ratios[-1]
            hist_max_app_ratio = np.max(hist_app_ratios)
            hist_under_enroll_rate = np.mean([1.0 if h['under_enrolled'] else 0.0 for h in hist])
            hist_avg_app = np.mean(hist_apps)
            hist_std_app = np.std(hist_apps) if len(hist) >= 2 else 0.0
            hist_last_app = hist_apps[-1]
            hist_avg_cap = np.mean(hist_caps)
            hist_avg_mqr = np.mean(hist_mqrs)
            
        mqr = 0.0
        if major_ratio:
            m = re.match(r"^(\d+)", str(major_ratio))
            if m: mqr = min(int(m.group(1)) / max(cap, 1), 1.0)
            
        yq_1_ratio = 0.0
        yq_4_ratio = 0.0
        has_yq = 0.0
        if yq_json:
            try:
                yq = json.loads(yq_json)
                q1 = float(yq.get('1', 0))
                q4 = float(yq.get('4', 0))
                total_q = sum(float(v) for v in yq.values())
                if total_q > 0:
                    yq_1_ratio = q1 / total_q
                    yq_4_ratio = q4 / total_q
                    has_yq = 1.0
            except:
                pass
                
        other_div_avg_cap = np.mean(sibling_caps) if len(sibling_caps) > 0 else 0.0
        other_div_total_cap = sum(sibling_caps)
        is_single_div = 1.0 if len(sibling_caps) == 0 else 0.0
        
        ts = time_slot or ""
        time_score = _parse_time_score(ts)
        is_morning = 1.0 if any(f"{d}1" in ts or f"{d}2" in ts for d in "월화수목금") else 0.0
        is_afternoon = 1.0 if any(f"{d}{p}" in ts for d in "월화수목금" for p in ["5", "6", "7", "8"]) else 0.0
        is_mon_wed = 1.0 if "월" in ts and "수" in ts else 0.0
        is_tue_thu = 1.0 if "화" in ts and "목" in ts else 0.0
        is_friday = 1.0 if "금" in ts else 0.0
        is_once_a_week = 1.0 if len(set(re.findall(r"[월화수목금]", ts))) == 1 else 0.0
        is_twice_a_week = 1.0 if len(set(re.findall(r"[월화수목금]", ts))) == 2 else 0.0
        is_online = 1.0 if "온라인" in ts or "블렌디드" in ts or "cyber" in ts.lower() else 0.0
        
        is_math_dept = 1.0 if "수학" in dept or "MAT" in code else 0.0
        is_stats_dept = 1.0 if "통계" in dept or "STA" in code else 0.0
        is_eco_dept = 1.0 if "경제" in dept or "ECO" in code else 0.0
        is_biz_dept = 1.0 if "경영" in dept or "BIZ" in code or "경영" in title else 0.0
        is_science_college = 1.0 if (is_math_dept or is_stats_dept or "이과" in dept or "상경" in dept) else 0.0
        
        sem_season = 1.0 if sem == "10" else 2.0
        year_recency = float(row['year_int'] - 2020)
        
        feat_dict = {
            'maj_cut': maj_cut,
            'non_maj_cut': non_maj_cut,
            # Features
            'feat_1_capacity': float(cap),
            'feat_2_max_allowed': float(max_al or 36),
            'feat_3_credits': float(credits or 3),
            'feat_4_is_required': 1.0 if "필" in classification or "기초" in classification or "전기" in classification else 0.0,
            'feat_5_is_gen_elective': 1.0 if "교선" in classification else 0.0,
            'feat_6_is_maj_elective': 1.0 if "전선" in classification else 0.0,
            'feat_7_num_divisions': float(row['num_divisions'] or 1),
            'feat_8_sem_season': sem_season,
            'feat_9_year_recency': year_recency,
            'feat_10_time_score': float(time_score),
            'feat_11_is_morning': is_morning,
            'feat_12_is_afternoon': is_afternoon,
            'feat_13_is_mon_wed': is_mon_wed,
            'feat_14_is_tue_thu': is_tue_thu,
            'feat_15_is_friday': is_friday,
            'feat_16_is_once_a_week': is_once_a_week,
            'feat_17_is_twice_a_week': is_twice_a_week,
            'feat_18_is_online': is_online,
            'feat_19_is_math_dept': is_math_dept,
            'feat_20_is_stats_dept': is_stats_dept,
            'feat_21_is_eco_dept': is_eco_dept,
            'feat_22_is_biz_dept': is_biz_dept,
            'feat_23_is_science_college': is_science_college,
            'feat_24_hist_avg_min': float(hist_avg_min),
            'feat_25_hist_min_min': float(hist_min_min),
            'feat_26_hist_max_min': float(hist_max_min),
            'feat_27_hist_std_min': float(hist_std_min),
            'feat_28_hist_last_min': float(hist_last_min),
            'feat_29_hist_last2_min': float(hist_last2_min),
            'feat_30_hist_avg_avg': float(hist_avg_avg),
            'feat_31_hist_avg_max': float(hist_avg_max),
            'feat_32_hist_trend_min': float(hist_trend_min),
            'feat_33_hist_avg_app_ratio': float(hist_avg_app_ratio),
            'feat_34_hist_last_app_ratio': float(hist_last_app_ratio),
            'feat_35_hist_max_app_ratio': float(hist_max_app_ratio),
            'feat_36_hist_under_enroll_rate': float(hist_under_enroll_rate),
            'feat_37_hist_avg_app': float(hist_avg_app),
            'feat_38_hist_std_app': float(hist_std_app),
            'feat_39_hist_last_app': float(hist_last_app),
            'feat_40_hist_avg_cap': float(hist_avg_cap),
            'feat_41_mqr': float(mqr),
            'feat_42_hist_avg_mqr': float(hist_avg_mqr),
            'feat_43_has_mq': 1.0 if mqr > 0 else 0.0,
            'feat_44_yq_1_ratio': float(yq_1_ratio),
            'feat_45_yq_4_ratio': float(yq_4_ratio),
            'feat_46_has_yq': has_yq,
            'feat_47_existed_last_year': float(1 if existed_last_yr and existed_last_yr > 0 else 0),
            'feat_48_sibling_avg_cap': float(other_div_avg_cap),
            'feat_49_sibling_total_cap': float(other_div_total_cap),
            'feat_50_is_single_div': is_single_div
        }
        
        records.append(feat_dict)
        
        # Update running history
        is_under = (app is not None and cap is not None and app <= cap)
        hist_entry = {
            'min_mileage': (maj_cut + non_maj_cut) / 2.0,
            'avg_mileage': float(avg_mlg or (maj_cut + non_maj_cut) / 2.0),
            'app_ratio': min((app or 0) / max(cap, 1), 5.0),
            'under_enrolled': is_under,
            'applicants': float(app or 0),
            'capacity': float(cap),
            'mqr': mqr
        }
        if key not in history_store:
            history_store[key] = []
        history_store[key].append(hist_entry)
        
    y_maj = np.array([r['maj_cut'] for r in records], dtype=np.float32)
    y_non = np.array([r['non_maj_cut'] for r in records], dtype=np.float32)
    
    # 4. Compare feature correlations between the two groups
    actual_features = [k for k in records[0].keys() if k.startswith("feat_")]
    
    print("\n" + "="*110)
    print(" [종합 가설검증 리포트] 50개 피처의 전공자 vs 비전공자 그룹 분기 유의성 검정 결과")
    print("="*110)
    print(f"{'번호':<4} | {'피처명':<30} | {'전공자 상관 (r_maj)':<20} | {'비전공자 상관 (r_non)':<20} | {'검증 의사결정'}")
    print("-"*110)
    
    decisions = []
    
    for idx, feat in enumerate(actual_features, 1):
        x = np.array([r[feat] for r in records], dtype=np.float32)
        unique_vals = np.unique(x)
        
        if len(unique_vals) <= 1:
            print(f"{idx:<4} | {feat:<30} | {'단일값':<20} | {'단일값':<20} | ❌ 양쪽 모두 무의 (DROP)")
            continue
            
        is_binary = len(unique_vals) == 2
        
        if is_binary:
            # T-test statistics as surrogate for correlation
            t_maj, p_maj = ttest_ind(y_maj[x == unique_vals[0]], y_maj[x == unique_vals[1]], equal_var=False)
            t_non, p_non = ttest_ind(y_non[x == unique_vals[0]], y_non[x == unique_vals[1]], equal_var=False)
            
            p_maj_sig = p_maj < 0.05
            p_non_sig = p_non < 0.05
            
            maj_str = f"t={t_maj:>6.2f} (sig)" if p_maj_sig else f"t={t_maj:>6.2f} (ns)"
            non_str = f"t={t_non:>6.2f} (sig)" if p_non_sig else f"t={t_non:>6.2f} (ns)"
        else:
            r_maj, p_maj = pearsonr(x, y_maj)
            r_non, p_non = pearsonr(x, y_non)
            
            p_maj_sig = p_maj < 0.05
            p_non_sig = p_non < 0.05
            
            maj_str = f"r={r_maj:>6.3f} (sig)" if p_maj_sig else f"r={r_maj:>6.3f} (ns)"
            non_str = f"r={r_non:>6.3f} (sig)" if p_non_sig else f"r={r_non:>6.3f} (ns)"
            
        # Decision logic:
        # 1. Significant for both
        # 2. Significant only for major
        # 3. Significant only for non-major
        # 4. Signs flip
        if np.isnan(p_maj): p_maj = 1.0; p_maj_sig = False
        if np.isnan(p_non): p_non = 1.0; p_non_sig = False
        
        decision_str = ""
        if p_maj_sig and p_non_sig:
            # Check for sign flip
            is_flip = False
            if not is_binary:
                is_flip = (r_maj * r_non < 0)
            else:
                is_flip = (t_maj * t_non < 0)
                
            if is_flip:
                decision_str = "🔥 부호 반전 (분리 필수!)"
            else:
                decision_str = "🟢 양쪽 모두 유의 (공통 활용)"
        elif p_maj_sig and not p_non_sig:
            decision_str = "🔵 전공자 전용 피처"
        elif not p_maj_sig and p_non_sig:
            decision_str = "🟡 비전공자 전용 피처"
        else:
            decision_str = "❌ 양쪽 모두 무의 (DROP)"
            
        print(f"{idx:<4} | {feat:<30} | {maj_str:<20} | {non_str:<20} | {decision_str}")
        decisions.append({
            'feature': feat,
            'decision': decision_str
        })
        
    selected_maj_feats = []
    selected_non_feats = []
    
    for idx, feat in enumerate(actual_features, 1):
        x = np.array([r[feat] for r in records], dtype=np.float32)
        unique_vals = np.unique(x)
        if len(unique_vals) <= 1: continue
        
        is_binary = len(unique_vals) == 2
        if is_binary:
            _, p_maj = ttest_ind(y_maj[x == unique_vals[0]], y_maj[x == unique_vals[1]], equal_var=False)
            _, p_non = ttest_ind(y_non[x == unique_vals[0]], y_non[x == unique_vals[1]], equal_var=False)
        else:
            _, p_maj = pearsonr(x, y_maj)
            _, p_non = pearsonr(x, y_non)
            
        if p_maj < 0.05 and not np.isnan(p_maj):
            selected_maj_feats.append(feat)
        if p_non < 0.05 and not np.isnan(p_non):
            selected_non_feats.append(feat)
            
    dual_feats = {
        'major_features': selected_maj_feats,
        'non_major_features': selected_non_feats
    }
    with open("selected_features_dual.json", "w") as f:
        json.dump(dual_feats, f, indent=2)
    print("✅ selected_features_dual.json 저장 완료.")
    
    conn.close()

if __name__ == "__main__":
    main()

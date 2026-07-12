import sqlite3
import numpy as np
import re
import json
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

def calculate_clean_cutoff(conn, code, div, year, semester, fallback_min_mileage) -> float:
    # Under-enrolled check
    row = conn.execute("""
        SELECT applicants, capacity FROM mileage_summary 
        WHERE course_code=? AND division=? AND year=? AND semester=?
    """, (code, div, year, semester)).fetchone()
    if row:
        app, cap = row
        if app is not None and cap is not None and app <= cap:
            return 1.0

    # Dropout filter logic
    row_fail_max = conn.execute("""
        SELECT MAX(mileage) FROM mileage_bids
        WHERE course_code=? AND division=? AND year=? AND semester=?
          AND (success IS NULL OR success != 'Y')
    """, (code, div, year, semester)).fetchone()
    
    if row_fail_max and row_fail_max[0] is not None:
        return float(row_fail_max[0])
        
    row_pass_min = conn.execute("""
        SELECT MIN(mileage) FROM mileage_bids
        WHERE course_code=? AND division=? AND year=? AND semester=?
          AND success = 'Y'
    """, (code, div, year, semester)).fetchone()
    
    if row_pass_min and row_pass_min[0] is not None:
        return float(row_pass_min[0])
        
    return float(fallback_min_mileage or 1.0)

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
            'num_divisions': num_divs,
            'year_int': year_int, 'sem_sort': sem_sort
        })
        
    # Sort chronologically to avoid data leakage
    raw_data.sort(key=lambda x: (x['year_int'], x['sem_sort']))
    print(f"데이터베이스 로드 완료: {len(raw_data)}개 분반")

    # 2. Re-construct 50 temporal features leak-free
    history_store = {} # (code, div) -> list of dicts: {'min_mileage', 'avg_mileage', 'app_ratio', 'under_enrolled', 'applicants', 'capacity', 'mqr'}
    
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
        
        # Clean cutoff
        y_cutoff = calculate_clean_cutoff(conn, code, div, year, sem, row['min_mileage'])
        
        # History lookup
        key = (code, div)
        hist = history_store.get(key, [])
        
        # Base/History variables default initialization
        hist_avg_min = 12.0; hist_min_min = 1.0; hist_max_min = 36.0; hist_std_min = 0.0
        hist_last_min = 12.0; hist_last2_min = 12.0; hist_avg_avg = 12.0; hist_avg_max = 36.0
        hist_trend_min = 0.0; hist_avg_app_ratio = 1.0; hist_last_app_ratio = 1.0
        hist_max_app_ratio = 1.0; hist_under_enroll_rate = 0.0; hist_avg_app = 20.0
        hist_std_app = 0.0; hist_last_app = 20.0; hist_avg_cap = 30.0; hist_avg_mqr = 0.0
        hist_n_semesters = 0
        
        if len(hist) > 0:
            hist_min_vals = [h['min_mileage'] for h in hist]
            hist_avg_vals = [h['avg_mileage'] for h in hist]
            hist_app_ratios = [h['app_ratio'] for h in hist]
            hist_apps = [h['applicants'] for h in hist]
            hist_caps = [h['capacity'] for h in hist]
            hist_mqrs = [h['mqr'] for h in hist]
            
            hist_n_semesters = len(hist)
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
            
        # Parse current quotas
        mqr = 0.0
        if major_ratio:
            m = re.match(r"^(\d+)", str(major_ratio))
            if m: mqr = min(int(m.group(1)) / max(cap, 1), 1.0)
            
        # Year Quotas
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
                
        # Sibling Divs
        other_div_avg_cap = np.mean(sibling_caps) if len(sibling_caps) > 0 else 0.0
        other_div_total_cap = sum(sibling_caps)
        is_single_div = 1.0 if len(sibling_caps) == 0 else 0.0
        
        # Time / Days
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
        
        # Dept/College categoricals
        is_math_dept = 1.0 if "수학" in dept or "MAT" in code else 0.0
        is_stats_dept = 1.0 if "통계" in dept or "STA" in code else 0.0
        is_eco_dept = 1.0 if "경제" in dept or "ECO" in code else 0.0
        is_biz_dept = 1.0 if "경영" in dept or "BIZ" in code or "경영" in title else 0.0
        is_science_college = 1.0 if (is_math_dept or is_stats_dept or "이과" in dept or "상경" in dept) else 0.0
        
        # Semester details
        sem_season = 1.0 if sem == "10" else 2.0
        year_recency = float(row['year_int'] - 2020)
        
        # Create record with exactly 50 named features!
        feat_dict = {
            'y_cutoff': y_cutoff,
            # Group A: Current settings (9)
            'feat_1_capacity': float(cap),
            'feat_2_max_allowed': float(max_al or 36),
            'feat_3_credits': float(credits or 3),
            'feat_4_is_required': 1.0 if "필" in classification or "기초" in classification or "전기" in classification else 0.0,
            'feat_5_is_gen_elective': 1.0 if "교선" in classification else 0.0,
            'feat_6_is_maj_elective': 1.0 if "전선" in classification else 0.0,
            'feat_7_num_divisions': float(row['num_divisions'] or 1),
            'feat_8_sem_season': sem_season,
            'feat_9_year_recency': year_recency,
            # Group B: Time slots (9)
            'feat_10_time_score': float(time_score),
            'feat_11_is_morning': is_morning,
            'feat_12_is_afternoon': is_afternoon,
            'feat_13_is_mon_wed': is_mon_wed,
            'feat_14_is_tue_thu': is_tue_thu,
            'feat_15_is_friday': is_friday,
            'feat_16_is_once_a_week': is_once_a_week,
            'feat_17_is_twice_a_week': is_twice_a_week,
            'feat_18_is_online': is_online,
            # Group C: Departments (5)
            'feat_19_is_math_dept': is_math_dept,
            'feat_20_is_stats_dept': is_stats_dept,
            'feat_21_is_eco_dept': is_eco_dept,
            'feat_22_is_biz_dept': is_biz_dept,
            'feat_23_is_science_college': is_science_college,
            # Group D: Hist cutlines (9)
            'feat_24_hist_avg_min': float(hist_avg_min),
            'feat_25_hist_min_min': float(hist_min_min),
            'feat_26_hist_max_min': float(hist_max_min),
            'feat_27_hist_std_min': float(hist_std_min),
            'feat_28_hist_last_min': float(hist_last_min),
            'feat_29_hist_last2_min': float(hist_last2_min),
            'feat_30_hist_avg_avg': float(hist_avg_avg),
            'feat_31_hist_avg_max': float(hist_avg_max),
            'feat_32_hist_trend_min': float(hist_trend_min),
            # Group E: Hist competition (8)
            'feat_33_hist_avg_app_ratio': float(hist_avg_app_ratio),
            'feat_34_hist_last_app_ratio': float(hist_last_app_ratio),
            'feat_35_hist_max_app_ratio': float(hist_max_app_ratio),
            'feat_36_hist_under_enroll_rate': float(hist_under_enroll_rate),
            'feat_37_hist_avg_app': float(hist_avg_app),
            'feat_38_hist_std_app': float(hist_std_app),
            'feat_39_hist_last_app': float(hist_last_app),
            'feat_40_hist_avg_cap': float(hist_avg_cap),
            # Group F: Quotas (6)
            'feat_41_mqr': float(mqr),
            'feat_42_hist_avg_mqr': float(hist_avg_mqr),
            'feat_43_has_mq': 1.0 if mqr > 0 else 0.0,
            'feat_44_yq_1_ratio': float(yq_1_ratio),
            'feat_45_yq_4_ratio': float(yq_4_ratio),
            'feat_46_has_yq': has_yq,
            # Group G: Siblings (4)
            'feat_47_existed_last_year': float(1 if existed_last_yr and existed_last_yr > 0 else 0),
            'feat_48_sibling_avg_cap': float(other_div_avg_cap),
            'feat_49_sibling_total_cap': float(other_div_total_cap),
            'feat_50_is_single_div': is_single_div
        }
        
        records.append(feat_dict)
        
        # Save current results in history for future semesters
        is_under = (app is not None and cap is not None and app <= cap)
        hist_entry = {
            'min_mileage': y_cutoff,
            'avg_mileage': float(avg_mlg or y_cutoff),
            'app_ratio': min((app or 0) / max(cap, 1), 5.0),
            'under_enrolled': is_under,
            'applicants': float(app or 0),
            'capacity': float(cap),
            'mqr': mqr
        }
        if key not in history_store:
            history_store[key] = []
        history_store[key].append(hist_entry)
        
    # Analyze the 50 features
    y = np.array([r['y_cutoff'] for r in records], dtype=np.float32)
    
    # Exclude target
    features = [f"feat_{i}_" for i in range(1, 51)]
    # Match actual keys
    actual_features = [k for k in records[0].keys() if k.startswith("feat_")]
    
    print("\n" + "="*95)
    print(f" [가설검증 리포트] 50개 전체 피처의 통계적 유의성 검정 결과 (대상: {len(records)}개 샘플)")
    print("="*95)
    print(f"{'번호':<4} | {'피처명':<30} | {'검정 방식':<10} | {'통계량/상관':<12} | {'p-value':<12} | {'유의여부 (α=5%)'}")
    print("-"*95)
    
    selected_features = []
    
    for idx, feat in enumerate(actual_features, 1):
        x = np.array([r[feat] for r in records], dtype=np.float32)
        
        # check type
        unique_vals = np.unique(x)
        is_binary = len(unique_vals) == 2
        
        # Avoid crash if all values are identical
        if len(unique_vals) <= 1:
            print(f"{idx:<4} | {feat:<30} | {'N/A':<10} | {0.0:<12.5f} | {1.0:<12.5e} | ❌ 무의함 (DROP - 단일값)")
            continue
            
        if is_binary:
            group0 = y[x == unique_vals[0]]
            group1 = y[x == unique_vals[1]]
            t_stat, p_val = ttest_ind(group0, group1, equal_var=False)
            method = "T-Test"
            stat_val = t_stat
        else:
            r_coef, p_val = pearsonr(x, y)
            method = "Pearson r"
            stat_val = r_coef
            
        is_sig = p_val < 0.05
        sig_str = "🟢 유의함 (PASS)" if is_sig else "❌ 무의함 (DROP)"
        
        # Handle nan p-values
        if np.isnan(p_val):
            p_val = 1.0
            sig_str = "❌ 무의함 (DROP)"
            
        if is_sig and not np.isnan(p_val):
            selected_features.append(feat)
            
        print(f"{idx:<4} | {feat:<30} | {method:<10} | {stat_val:<12.5f} | {p_val:<12.5e} | {sig_str}")
        
    print("="*95)
    print(f"검증 완료! 유의수준 5% 미만을 통과한 피처 개수: {len(selected_features)} / 50")
    print(f"최종 선택 피처: {selected_features}")
    print("="*95)
    
    # Save the selected features to JSON
    with open("selected_features_50.json", "w") as f:
        json.dump(selected_features, f, indent=2)
    print("✅ selected_features_50.json 저장 완료.")
    
    conn.close()

if __name__ == "__main__":
    main()

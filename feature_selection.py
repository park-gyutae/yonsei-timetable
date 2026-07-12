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
    
    # 1. Fetch all raw data joined with courses
    query = """
        SELECT
            s.course_code, s.division, s.year, s.semester,
            s.capacity, s.applicants, s.max_allowed, s.major_ratio, s.min_mileage, s.avg_mileage,
            c.credits, c.time_slot, c.classification
        FROM mileage_summary s
        LEFT JOIN courses c ON c.course_code = s.course_code AND c.division = s.division
        WHERE s.capacity > 0
    """
    rows = conn.execute(query).fetchall()
    
    # Since we can't use pandas, parse manually
    raw_data = []
    for r in rows:
        code, div, year, semester, cap, app, max_al, major_ratio, min_mlg, avg_mlg, credits, time_slot, classification = r
        sem_sort = 1 if semester == "10" else 2
        year_int = int(year)
        
        # Subqueries for num_divisions and existed_last_year
        num_divs = conn.execute("""
            SELECT COUNT(*) FROM mileage_summary 
            WHERE course_code=? AND year=? AND semester=?
        """, (code, year, semester)).fetchone()[0]
        
        existed_last_yr = conn.execute("""
            SELECT COUNT(*) FROM mileage_summary 
            WHERE course_code=? AND year=? AND semester=?
        """, (code, str(year_int - 1), semester)).fetchone()[0]
        
        raw_data.append({
            'course_code': code, 'division': div, 'year': year, 'semester': semester,
            'capacity': cap, 'applicants': app, 'max_allowed': max_al, 'major_ratio': major_ratio,
            'min_mileage': min_mlg, 'avg_mileage': avg_mlg, 'credits': credits, 'time_slot': time_slot,
            'classification': classification, 'num_divisions': num_divs, 'existed_last_year': existed_last_yr,
            'year_int': year_int, 'sem_sort': sem_sort
        })
        
    # Sort chronologically to simulate stream processing and avoid data leakage
    raw_data.sort(key=lambda x: (x['year_int'], x['sem_sort']))
    print(f"로드된 전체 분반 데이터 수: {len(raw_data)}개")

    # 2. Re-construct temporal features leak-free
    history_store = {} # (code, div) -> list of dicts: {'min_mileage', 'avg_mileage', 'app_ratio', 'under_enrolled'}
    
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
        classification = row['classification']
        min_mlg = row['min_mileage']
        avg_mlg = row['avg_mileage']
        num_divs = row['num_divisions']
        existed_last_yr = row['existed_last_year']
        
        # Calculate clean cutoff for target y
        y_cutoff = calculate_clean_cutoff(conn, code, div, year, sem, min_mlg)
        
        # Pull history strictly BEFORE this semester
        key = (code, div)
        hist = history_store.get(key, [])
        
        # Default fallback values (global or safe defaults)
        hist_avg_app_ratio = 1.0
        hist_avg_min_mileage = 12.0
        hist_avg_avg_mileage = 12.0
        hist_under_enroll_rate = 0.0
        hist_n_semesters = 0
        hist_std_min_mileage = 0.0
        hist_trend_min_mileage = 0.0
        
        if len(hist) > 0:
            hist_avg_app_ratio = np.mean([h['app_ratio'] for h in hist])
            hist_avg_min_mileage = np.mean([h['min_mileage'] for h in hist])
            hist_avg_avg_mileage = np.mean([h['avg_mileage'] for h in hist])
            hist_under_enroll_rate = np.mean([1.0 if h['under_enrolled'] else 0.0 for h in hist])
            hist_n_semesters = len(hist)
            if len(hist) >= 2:
                hist_std_min_mileage = np.std([h['min_mileage'] for h in hist])
            hist_trend_min_mileage = hist[-1]['min_mileage'] - hist_avg_min_mileage
            
        # Parse current features
        mqr = 0.0
        if major_ratio:
            m = re.match(r"^(\d+)", str(major_ratio))
            if m: mqr = min(int(m.group(1)) / max(cap, 1), 1.0)
            
        time_score = _parse_time_score(time_slot or "")
        is_req = 1 if classification and ("필" in str(classification) or "기초" in str(classification) or "전기" in str(classification)) else 0
        sem_season = 1 if row['semester'] == "10" else 2
        
        records.append({
            'y_cutoff': y_cutoff,
            # Features
            'capacity': float(cap),
            'mqr': float(mqr),
            'max_allowed': float(max_al or 36),
            'time_score': float(time_score),
            'is_req': float(is_req),
            'credits': float(credits or 3),
            'sem_season': float(sem_season),
            'num_divisions': float(num_divs or 1),
            'existed_last_year': float(1 if existed_last_yr and existed_last_yr > 0 else 0),
            'hist_avg_app_ratio': float(hist_avg_app_ratio),
            'hist_avg_min_mileage': float(hist_avg_min_mileage),
            'hist_avg_avg_mileage': float(hist_avg_avg_mileage),
            'hist_under_enroll_rate': float(hist_under_enroll_rate),
            'hist_n_semesters': float(hist_n_semesters),
            'hist_std_min_mileage': float(hist_std_min_mileage),
            'hist_trend_min_mileage': float(hist_trend_min_mileage)
        })
        
        # Update running history WITH this semester's clean data
        is_under = (app is not None and cap is not None and app <= cap)
        hist_entry = {
            'min_mileage': y_cutoff,
            'avg_mileage': float(avg_mlg or y_cutoff),
            'app_ratio': min((app or 0) / max(cap, 1), 5.0),
            'under_enrolled': is_under
        }
        if key not in history_store:
            history_store[key] = []
        history_store[key].append(hist_entry)
        
    # Convert records list of dicts to arrays for test
    y = np.array([r['y_cutoff'] for r in records], dtype=np.float32)
    
    features = [
        'capacity', 'mqr', 'max_allowed', 'time_score', 'is_req', 'credits',
        'sem_season', 'num_divisions', 'existed_last_year', 'hist_avg_app_ratio',
        'hist_avg_min_mileage', 'hist_avg_avg_mileage', 'hist_under_enroll_rate',
        'hist_n_semesters', 'hist_std_min_mileage', 'hist_trend_min_mileage'
    ]
    
    test_results = []
    
    print("\n" + "="*80)
    print(f" [가설검증 리포트] 각 피처별 유의성 검정 결과 (대상: {len(records)}개 샘플)")
    print("="*80)
    print(f"{'피처명':<25} | {'검정 방식':<15} | {'통계량':<12} | {'p-value':<12} | {'유의여부 (α=5%)'}")
    print("-"*80)
    
    selected_features = []
    
    for feat in features:
        x = np.array([r[feat] for r in records], dtype=np.float32)
        
        # Determine variable type
        unique_vals = np.unique(x)
        is_binary = len(unique_vals) == 2
        
        if is_binary:
            # Two-sample t-test
            group0 = y[x == unique_vals[0]]
            group1 = y[x == unique_vals[1]]
            t_stat, p_val = ttest_ind(group0, group1, equal_var=False)
            method = "T-Test"
            stat_val = t_stat
        else:
            # Pearson correlation
            r_coef, p_val = pearsonr(x, y)
            method = "Pearson r"
            stat_val = r_coef
            
        is_sig = p_val < 0.05
        sig_str = "🟢 유의함 (PASS)" if is_sig else "❌ 무의함 (DROP)"
        
        if is_sig:
            selected_features.append(feat)
            
        print(f"{feat:<25} | {method:<15} | {stat_val:<12.5f} | {p_val:<12.5e} | {sig_str}")
        
        test_results.append({
            'feature': feat,
            'method': method,
            'statistic': float(stat_val),
            'p_value': float(p_val),
            'significant': bool(is_sig)
        })
        
    print("="*80)
    print(f"선택된 최종 피처셋 ({len(selected_features)}개): {selected_features}")
    print("="*80)
    
    # Save the selected features to JSON
    with open("selected_features.json", "w") as f:
        json.dump(selected_features, f, indent=2)
    print("✅ selected_features.json 저장 완료.")
    
    conn.close()

if __name__ == "__main__":
    main()

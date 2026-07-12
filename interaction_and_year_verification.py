import sqlite3
import numpy as np
import re
from scipy.stats import f_oneway, pearsonr

def _parse_time_score(time_slot: str) -> float:
    if not time_slot: return 0.0
    score = 0.0
    popular_days = {"월": 1.2, "화": 1.0, "수": 1.1, "목": 1.0, "금": 0.8}
    for day, w in popular_days.items():
        if day in time_slot: score += w
    if any(f"{d}{p}" in time_slot for d in "월화수목금" for p in ["1", "2"]):
        score *= 0.85
    return min(score, 3.0)

def extract_grade_cutoffs(conn, code, div, year, semester, fallback_min):
    bids = conn.execute("""
        SELECT mileage, grade, success FROM mileage_bids
        WHERE course_code=? AND division=? AND year=? AND semester=?
    """, (code, div, year, semester)).fetchall()
    
    if not bids:
        return [fallback_min]*4
        
    # Group bids by grade (1, 2, 3, 4)
    grade_bids = {1: [], 2: [], 3: [], 4: []}
    for b_mileage, b_grade, b_success in bids:
        try:
            g = int(b_grade)
            if g in grade_bids:
                grade_bids[g].append({'mileage': float(b_mileage or 1.0), 'success': b_success == 'Y'})
        except:
            pass
            
    grade_cuts = []
    for g in [1, 2, 3, 4]:
        g_bids = grade_bids[g]
        if not g_bids:
            grade_cuts.append(fallback_min)
            continue
            
        success_count = sum(1 for b in g_bids if b['success'])
        if success_count == len(g_bids):
            grade_cuts.append(1.0)
            continue
            
        fails = [b['mileage'] for b in g_bids if not b['success']]
        if fails:
            grade_cuts.append(max(fails))
        else:
            passes = [b['mileage'] for b in g_bids if b['success']]
            grade_cuts.append(min(passes) if passes else fallback_min)
            
    return grade_cuts

def main():
    conn = sqlite3.connect("mileage_history.db")
    print("="*90)
    print(" [학년별 컷오프 & 교호작용 검증] 학년 정원 분할 및 상호작용 피처 통계적 가설 검정")
    print("="*90)

    # 1. Fetch raw data
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
    
    raw_data = []
    for r in rows:
        code, div, year, semester, cap, app, max_al, major_ratio, min_mlg, avg_mlg, credits, time_slot, classification = r
        raw_data.append({
            'course_code': code, 'division': div, 'year': year, 'semester': semester,
            'capacity': cap, 'applicants': app, 'max_allowed': max_al, 'major_ratio': major_ratio,
            'min_mileage': min_mlg, 'avg_mileage': avg_mlg, 'credits': credits, 
            'time_slot': time_slot, 'classification': classification
        })
        
    print(f"로드된 전체 분반 데이터 수: {len(raw_data)}개")

    # 2. Extract Grade cutoffs and check ANOVA
    g1_cuts, g2_cuts, g3_cuts, g4_cuts = [], [], [], []
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
        classification = str(row['classification'] or "")
        
        cuts = extract_grade_cutoffs(conn, code, div, year, sem, row['min_mileage'])
        g1_cuts.append(cuts[0])
        g2_cuts.append(cuts[1])
        g3_cuts.append(cuts[2])
        g4_cuts.append(cuts[3])
        
        mqr = 0.0
        if major_ratio:
            m = re.match(r"^(\d+)", str(major_ratio))
            if m: mqr = min(int(m.group(1)) / max(cap, 1), 1.0)
            
        app_ratio = min((app or 0) / max(cap, 1), 5.0)
        is_req = 1.0 if "필" in classification or "기초" in classification or "전기" in classification else 0.0
        
        # Interactions
        records.append({
            'y_overall': float(row['min_mileage']),
            'capacity': float(cap),
            'app_ratio': float(app_ratio),
            'mqr': float(mqr),
            'is_req': is_req,
            # Interaction terms
            'inter_cap_req': float(cap * is_req),
            'inter_app_req': float(app_ratio * is_req),
            'inter_mqr_req': float(mqr * is_req),
            'inter_cap_mqr': float(cap * mqr)
        })
        
    # Grade Cutoff ANOVA test
    g1 = np.array(g1_cuts)
    g2 = np.array(g2_cuts)
    g3 = np.array(g3_cuts)
    g4 = np.array(g4_cuts)
    
    f_stat, p_val = f_oneway(g1, g2, g3, g4)
    
    print("\n" + "-"*90)
    print(" [1단계 검정] 학년별(1, 2, 3, 4학년) 실질 커트라인 분포 차이 분석 (일원분산분석 - One-way ANOVA)")
    print(f"  - 1학년 평균 컷오프: {np.mean(g1):.4f} 점")
    print(f"  - 2학년 평균 컷오프: {np.mean(g2):.4f} 점")
    print(f"  - 3학년 평균 컷오프: {np.mean(g3):.4f} 점")
    print(f"  - 4학년 평균 컷오프: {np.mean(g4):.4f} 점")
    print(f"  - F-통계량: {f_stat:.5f} | p-value: {p_val:.5e}")
    if p_val < 0.05:
        print("  📢 결론: 학년별 커트라인은 통계적으로 극도로 유의미한 차이가 존재합니다! (학년별 컷 분리 타당)")
    else:
        print("  📢 결론: 학년별 커트라인은 유의미한 차이가 없습니다.")
    print("-"*90)

    # 3. Interaction significance testing
    print("\n [2단계 검정] 주요 교호작용(Interaction Term) 피처의 통계적 유의성 검정 (Pearson r)")
    print(f"{'교호작용 피처명':<30} | {'전체 컷과의 상관 (Pearson r)':<30} | {'p-value':<12} | {'유의여부'}")
    print("-"*90)
    
    y_overall = np.array([r['y_overall'] for r in records])
    interactions = ['inter_cap_req', 'inter_app_req', 'inter_mqr_req', 'inter_cap_mqr']
    
    for inter in interactions:
        x = np.array([r[inter] for r in records])
        r_val, p_val = pearsonr(x, y_overall)
        is_sig = p_val < 0.05
        sig_str = "🟢 유의함 (LGBM에 유용)" if is_sig else "❌ 무의함"
        print(f"{inter:<30} | r={r_val:>8.5f} | p-value={p_val:<10.3e} | {sig_str}")
        
    print("="*90 + "\n")
    conn.close()

if __name__ == "__main__":
    main()

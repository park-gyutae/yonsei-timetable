import sqlite3
import numpy as np
import scipy.stats as stats
import re

def _parse_time_score(time_slot: str) -> float:
    if not time_slot: return 0.0
    score = 0.0
    popular_days = {"월": 1.2, "화": 1.0, "수": 1.1, "목": 1.0, "금": 0.8}
    for day, w in popular_days.items():
        if day in time_slot:
            score += w
    if any(f"{d}{p}" in time_slot for d in "월화수목금" for p in ["1", "2"]):
        score *= 0.85
    return min(score, 3.0)

def test_base_features():
    conn = sqlite3.connect("mileage_history.db")
    print("="*75)
    print(" [기존 피처 검증] 모델 베이스 피처 통계 가설 검증")
    print("="*75)
    
    # 데이터 로드
    rows = conn.execute("""
        SELECT
            s.capacity, s.applicants, s.max_allowed, s.major_ratio,
            c.credits, c.time_slot, s.min_mileage
        FROM mileage_summary s
        LEFT JOIN courses c ON c.course_code = s.course_code AND c.division = s.division
        WHERE s.capacity > 0 AND s.min_mileage IS NOT NULL
    """).fetchall()

    cuts = []
    caps = []
    mqrs = []
    max_als = []
    app_ratios = []
    time_scores = []

    for row in rows:
        cap, app, max_al, major_ratio, credits, time_slot, cut = row
        
        # major quota ratio (mqr)
        mqr = 0.0
        if major_ratio:
            m = re.match(r"^(\d+)", str(major_ratio))
            if m:
                mqr = min(int(m.group(1)) / max(cap, 1), 1.0)
                
        app_ratio = min((app or 0) / max(cap, 1), 5.0)
        t_score = _parse_time_score(time_slot or "")
        
        cuts.append(cut)
        caps.append(cap)
        mqrs.append(mqr)
        max_als.append(max_al or 36)
        app_ratios.append(app_ratio)
        time_scores.append(t_score)

    cuts = np.array(cuts)
    caps = np.array(caps)
    mqrs = np.array(mqrs)
    max_als = np.array(max_als)
    app_ratios = np.array(app_ratios)
    time_scores = np.array(time_scores)

    print(f"분석 대상 샘플 수: {len(cuts)}개 분반\n")

    # 1. Capacity (정원)
    corr, p = stats.pearsonr(caps, cuts)
    print(f"[피처 1] capacity (수강 정원) - 커트라인 상관관계")
    print(f"  * Pearson R: {corr:.4f} | p-value: {p:.5e} ({'✅ 유의미함' if p<0.05 else '❌ 기각'})")
    
    # 2. MQR (전공자 T/O 비율)
    corr, p = stats.pearsonr(mqrs, cuts)
    print(f"\n[피처 2] mqr (전공자 T/O 비율) - 커트라인 상관관계")
    print(f"  * Pearson R: {corr:.4f} | p-value: {p:.5e} ({'✅ 유의미함' if p<0.05 else '❌ 기각'})")

    # 3. Max Allowed (최대 허용 마일리지)
    corr, p = stats.pearsonr(max_als, cuts)
    print(f"\n[피처 3] max_allowed (최대 투입 한도) - 커트라인 상관관계")
    print(f"  * Pearson R: {corr:.4f} | p-value: {p:.5e} ({'✅ 유의미함' if p<0.05 else '❌ 기각'})")

    # 4. App Ratio (경쟁률)
    corr, p = stats.pearsonr(app_ratios, cuts)
    print(f"\n[피처 4] app_ratio (경쟁률: 신청인원/정원) - 커트라인 상관관계")
    print(f"  * Pearson R: {corr:.4f} | p-value: {p:.5e} ({'✅ 유의미함' if p<0.05 else '❌ 기각'})")

    # 5. Time Score (시간대 선호도)
    corr, p = stats.pearsonr(time_scores, cuts)
    print(f"\n[피처 5] time_score (수업 시간대 선호 점수) - 커트라인 상관관계")
    print(f"  * Pearson R: {corr:.4f} | p-value: {p:.5e} ({'✅ 유의미함' if p<0.05 else '❌ 기각'})")

    print("\n" + "="*75)

if __name__ == "__main__":
    test_base_features()

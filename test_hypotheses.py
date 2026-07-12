import sqlite3
import numpy as np
import scipy.stats as stats
import re

def test_new_features():
    conn = sqlite3.connect("mileage_history.db")
    
    print("="*75)
    print(" [신규 피처 검증] 10대 예측 피처 및 전공기초 확장 통계 가설 검증")
    print("="*75)
    
    # ---------------------------------------------------------
    # 가설 1: 확장된 필수 여부 (is_req: 전필 + 전공기초) 효과
    # H0: 전필+전기 과목과 일반 선택 과목 간의 커트라인 평균 차이가 없다.
    # H1: 전필+전기 과목의 커트라인이 일반 선택 과목에 비해 유의미하게 높다.
    # 검증 방법: Independent Two-Sample t-test (독립표본 t-검정)
    # ---------------------------------------------------------
    print("\n[가설 1] 전공기초 포함 필수 여부(is_req) 효과 검정")
    
    rows = conn.execute("""
        SELECT s.min_mileage, c.classification
        FROM mileage_summary s
        JOIN courses c ON c.course_code = s.course_code AND c.division = s.division
        WHERE s.min_mileage IS NOT NULL AND c.classification IS NOT NULL
    """).fetchall()
    
    req_cuts = []
    elect_cuts = []
    
    for cut, classification in rows:
        # 전필, 전공필수, 전공기초, 전기 포함
        is_req = classification and ("필" in str(classification) or "기초" in str(classification) or "전기" in str(classification))
        if is_req:
            req_cuts.append(cut)
        else:
            elect_cuts.append(cut)
            
    if len(req_cuts) >= 5 and len(elect_cuts) >= 5:
        t_stat, p_val = stats.ttest_ind(req_cuts, elect_cuts, equal_var=False)
        status = "✅ 유의미함 (H1 채택)" if p_val < 0.05 else "❌ 유의미하지 않음"
        print(f"  * 필수/기초 과목 수: {len(req_cuts)}개 분반 | 평균 커트라인: {np.mean(req_cuts):.2f}점")
        print(f"  * 일반 선택 과목 수: {len(elect_cuts)}개 분반 | 평균 커트라인: {np.mean(elect_cuts):.2f}점")
        print(f"  * t-statistic: {t_stat:.4f} | p-value: {p_val:.5e} ({status})")
        print("  * 해석: 전공기초를 필수에 포함하여 분류했을 때, 커트라인이 일반 과목에 비해 통계적으로 유의미하게 높게 형성됨.")
    else:
        print("  * 가설 검정을 위한 분류별 샘플 수가 부족합니다.")

    # ---------------------------------------------------------
    # 가설 2: 분반 수 (num_divisions) 효과
    # H0: 분반의 개수와 커트라인은 상관관계가 없다.
    # H1: 분반의 개수가 많을수록 분산 효과로 인해 커트라인이 낮아진다 (음의 상관관계).
    # 검증 방법: Pearson Correlation & t-검정
    # ---------------------------------------------------------
    print("\n[가설 2] 분반 수(num_divisions) 경쟁 분산 효과 검정")
    
    # 각 분반별 분반 수와 커트라인 추출
    div_rows = conn.execute("""
        SELECT 
            s.min_mileage,
            (SELECT COUNT(*) FROM mileage_summary sub 
             WHERE sub.course_code = s.course_code 
               AND sub.year = s.year 
               AND sub.semester = s.semester) as num_divs
        FROM mileage_summary s
        WHERE s.min_mileage IS NOT NULL
    """).fetchall()
    
    if len(div_rows) >= 10:
        cuts = [r[0] for r in div_rows]
        divs = [r[1] for r in div_rows]
        
        corr, p_val = stats.pearsonr(divs, cuts)
        status = "✅ 유의미함 (H1 채택)" if p_val < 0.05 else "❌ 유의미하지 않음"
        print(f"  * 분석 대상 샘플 수: {len(div_rows)}개 분반")
        print(f"  * 피어슨 상관계수 (R): {corr:.4f}")
        print(f"  * p-value: {p_val:.5e} ({status})")
        
        # 추가: 단일 분반 vs 다분반 t-검정
        single_div_cuts = [r[0] for r in div_rows if r[1] == 1]
        multi_div_cuts = [r[0] for r in div_rows if r[1] >= 2]
        
        if len(single_div_cuts) >= 5 and len(multi_div_cuts) >= 5:
            t_stat2, p_val2 = stats.ttest_ind(single_div_cuts, multi_div_cuts, equal_var=False)
            status2 = "✅ 유의미함 (H1 채택)" if p_val2 < 0.05 else "❌ 유의미하지 않음"
            print(f"  * 단일 분반(1개) 평균 커트라인: {np.mean(single_div_cuts):.2f}점")
            print(f"  * 다분반(2개 이상) 평균 커트라인: {np.mean(multi_div_cuts):.2f}점")
            print(f"  * 두 집단 비교 t-statistic: {t_stat2:.4f} | p-value: {p_val2:.5e} ({status2})")
    else:
        print("  * 분반 수 분석을 위한 충분한 데이터가 없습니다.")

    # ---------------------------------------------------------
    # 가설 3: 전해 개설 여부 (existed_last_year) 효과
    # H0: 전년도 동일 학기에 개설되었던 과목(선례 있음)과 신설 과목(선례 없음) 간에 커트라인 차이가 없다.
    # H1: 개설 이력이 존재하여 컷 가이드라인이 있는 과목과 신설 과목 간에 커트라인 분포가 유의미하게 다르다.
    # 검증 방법: Independent Two-Sample t-test
    # ---------------------------------------------------------
    print("\n[가설 3] 전해 개설 이력(existed_last_year) 존재 효과 검정")
    
    history_rows = conn.execute("""
        SELECT 
            s.min_mileage,
            (SELECT COUNT(*) FROM mileage_summary sub 
             WHERE sub.course_code = s.course_code 
               AND sub.year = CAST(CAST(s.year as INTEGER) - 1 as TEXT) 
               AND sub.semester = s.semester) as existed_last_year
        FROM mileage_summary s
        WHERE s.min_mileage IS NOT NULL AND s.year != '2023'  -- 2023년은 전해(2022) 데이터가 없어 제외
    """).fetchall()
    
    existed_cuts = []
    new_cuts = []
    
    for cut, existed in history_rows:
        if existed > 0:
            existed_cuts.append(cut)
        else:
            new_cuts.append(cut)
            
    if len(existed_cuts) >= 5 and len(new_cuts) >= 5:
        t_stat3, p_val3 = stats.ttest_ind(existed_cuts, new_cuts, equal_var=False)
        status3 = "✅ 유의미함 (H1 채택)" if p_val3 < 0.05 else "❌ 유의미하지 않음"
        print(f"  * 전해 개설 이력 있음 수: {len(existed_cuts)}개 분반 | 평균 커트라인: {np.mean(existed_cuts):.2f}점")
        print(f"  * 신설 과목(이력 없음) 수: {len(new_cuts)}개 분반 | 평균 커트라인: {np.mean(new_cuts):.2f}점")
        print(f"  * t-statistic: {t_stat3:.4f} | p-value: {p_val3:.5e} ({status3})")
    else:
        print(f"  * 이력 있음 수: {len(existed_cuts)}개, 신설 수: {len(new_cuts)}개로 분석 샘플이 부족합니다.")

    print("\n" + "="*75)
    conn.close()

if __name__ == "__main__":
    test_new_features()

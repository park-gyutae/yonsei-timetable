import sqlite3
import json
import os
import math
import numpy as np
from sklearn.metrics import roc_auc_score, accuracy_score, brier_score_loss

# Add parent path to import models
import sys
sys.path.insert(0, os.path.abspath("../yonsei_mileage_engine"))

import config
from config import UserProfile
from models.tie_breaker import TieBreakerCalibrator
from models.cut_predictor import CutoffPredictor, CutoffResult

def parse_ratio(val):
    if not val:
        return 0.0
    try:
        parts = val.split('/')
        if len(parts) == 2:
            num = float(parts[0])
            den = float(parts[1])
            if den > 0:
                return num / den
        return float(val)
    except:
        return 0.0

def evaluate_tie_breakers():
    print("=" * 70)
    print(" [검증 1] 타이브레이커 가중치 성능 평가 (Heuristic vs Calibrated)")
    print("=" * 70)
    
    conn = sqlite3.connect("mileage_history.db")
    bids = conn.execute("SELECT course_code, division, year, semester, mileage, major, first_time, grad, applied_courses, earned_ratio, last_sem_ratio, success FROM mileage_bids").fetchall()
    conn.close()

    # Group bids by section
    from collections import defaultdict
    section_bids = defaultdict(list)
    for b in bids:
        key = (b[0], b[1], b[2], b[3])
        section_bids[key].append(b[4:])

    y_true = []
    
    # We will score each boundary bid using the privilege score formula
    scores_heur = []
    scores_cal = []
    scores_tour = []

    # Initialize three calibrators
    # 1. Force Heuristic weights by overriding weights dict
    calibrator_heur = TieBreakerCalibrator()
    calibrator_heur.weights = config.TIE_BREAKER_STAGE_WEIGHTS
    
    # 2. Automatically loads calibrated weights
    calibrator_cal = TieBreakerCalibrator()

    # 3. Tournament Calibrator
    calibrator_tour = TieBreakerCalibrator()

    for key, bids_in_sec in section_bids.items():
        fails = [b[0] for b in bids_in_sec if b[7] != 'Y']
        if not fails:
            continue
        cutoff = max(fails)
        
        # Bids exactly at cutoff
        boundary_bids = [b for b in bids_in_sec if b[0] == cutoff]
        
        # Check if mixed
        success_states = set(b[7] == 'Y' for b in boundary_bids)
        if len(success_states) <= 1:
            continue
            
        course_code, division, _, _ = key
        course_key = f"{course_code}-{division}"

        for b in boundary_bids:
            major_val = b[1]
            status = "YY" if major_val == 'Y(Y)' else ("YN" if major_val in ('Y(N)', 'N(Y)') else "NN")
            
            profile = UserProfile(
                student_id="test",
                major_status=status,
                applied_credits=(b[4] or 0) * 3,
                is_graduating=(b[3] == 'Y'),
                is_first_time=(b[2] == 'Y'),
                earned_credits=int(parse_ratio(b[5]) * config.GRAD_REQUIRED_CREDITS),
                enrolled_semesters=int(parse_ratio(b[6]) * config.GRAD_REQUIRED_SEMESTERS)
            )
            
            # Compute raw privilege scores
            s_heur = calibrator_heur._compute_stage_scores(profile)["total_score"]
            s_cal = calibrator_cal._compute_stage_scores(profile)["total_score"]
            
            res_tour = calibrator_tour.calibrate(
                base_prob=0.5,
                mileage=cutoff,
                cutoff_estimate=cutoff,
                user_profile=profile,
                course_key=course_key
            )
            s_tour = res_tour.privilege_score
            
            scores_heur.append(s_heur)
            scores_cal.append(s_cal)
            scores_tour.append(s_tour)
            y_true.append(1 if b[7] == 'Y' else 0)

    y_true = np.array(y_true)
    scores_heur = np.array(scores_heur)
    scores_cal = np.array(scores_cal)
    scores_tour = np.array(scores_tour)

    # Since they are scores, we can evaluate AUC-ROC
    auc_heur = roc_auc_score(y_true, scores_heur)
    auc_cal = roc_auc_score(y_true, scores_cal)
    auc_tour = roc_auc_score(y_true, scores_tour)

    # Evaluate accuracy by checking if score > threshold
    pred_heur = (scores_heur >= np.median(scores_heur)).astype(int)
    pred_cal = (scores_cal >= np.median(scores_cal)).astype(int)
    pred_tour = (scores_tour >= np.median(scores_tour)).astype(int)
    
    acc_heur = accuracy_score(y_true, pred_heur)
    acc_cal = accuracy_score(y_true, pred_cal)
    acc_tour = accuracy_score(y_true, pred_tour)

    print(f"평가 대상 샘플 수: {len(y_true)} 개")
    print(f"  * Heuristic Weights  - AUC: {auc_heur:.4f} | Accuracy (Median Split): {acc_heur:.4f}")
    print(f"  * Calibrated Weights - AUC: {auc_cal:.4f} | Accuracy (Median Split): {acc_cal:.4f}")
    print(f"  * Tournament Model   - AUC: {auc_tour:.4f} | Accuracy (Median Split): {acc_tour:.4f}")
    print("  => AUC-ROC의 상승은 경계선 동점자 판정의 실제 우선순위를 모델이 통계적으로 훨씬 정확하게 파악함을 뜻합니다.")

def evaluate_brier_scores():
    print("\n" + "=" * 70)
    print(" [검증 2] 확률 곡선 정확도 비교 (Symmetric vs Piecewise Asymmetric)")
    print("=" * 70)

    conn = sqlite3.connect("mileage_history.db")
    
    # Load all historical cutoffs per section
    cutoffs_raw = conn.execute("""
        SELECT course_code, division, min_mileage 
        FROM mileage_summary 
        WHERE capacity > 0 AND min_mileage IS NOT NULL
    """).fetchall()
    
    # Load historical under-enrollment rates
    under_rates_raw = conn.execute("""
        SELECT course_code, division, 
               AVG(CASE WHEN applicants <= capacity THEN 1.0 ELSE 0.0 END) as under_rate
        FROM mileage_summary
        WHERE capacity > 0
        GROUP BY course_code, division
    """).fetchall()
    under_rates = {(r[0], r[1]): float(r[2]) for r in under_rates_raw}
    
    from collections import defaultdict
    cutoffs_by_sec = defaultdict(list)
    for code, div, cut in cutoffs_raw:
        cutoffs_by_sec[(code, div)].append(float(cut))
        
    bids = conn.execute("SELECT course_code, division, mileage, success FROM mileage_bids").fetchall()
    conn.close()

    # Organize bids by section
    bids_by_sec = defaultdict(list)
    for b in bids:
        bids_by_sec[(b[0], b[1])].append((b[2], 1 if b[3] == 'Y' else 0))

    y_true = []
    p_symmetric = []
    p_asymmetric = []

    evaluated_sections = 0
    
    for key, cuts in cutoffs_by_sec.items():
        sec_bids = bids_by_sec.get(key, [])
        if len(sec_bids) < 5 or len(cuts) < 2:
            continue
            
        median = np.median(cuts)
        q10 = np.percentile(cuts, 10)
        q90 = np.percentile(cuts, 90)
        
        # Enforce ordering
        q10 = min(q10, median)
        q90 = max(q90, median)
        
        # 1. Symmetric curve
        half_spread = max(q90 - median, 1.0)
        k_sym = np.log(9.0) / half_spread
        
        # 2. Beta CDF Mixture Curve (our new implementation)
        p_under = under_rates.get(key, 0.0)
        result = CutoffResult(q10=q10, median=median, q90=q90, mean=median)
        
        for mlg, succ in sec_bids:
            # Symmetric prob
            z_sym = k_sym * (mlg - median)
            z_sym = max(-15, min(15, z_sym))
            prob_sym = 1.0 / (1.0 + math.exp(-z_sym))
            
            # Beta Mixture prob
            prob_asym = float(CutoffPredictor._beta_cdf_mixture_curve(np.array([mlg]), result, 36.0, p_under)[0])
            
            y_true.append(succ)
            p_symmetric.append(prob_sym)
            p_asymmetric.append(prob_asym)
            
        evaluated_sections += 1

    y_true = np.array(y_true)
    p_symmetric = np.array(p_symmetric)
    p_asymmetric = np.array(p_asymmetric)

    bs_sym = brier_score_loss(y_true, p_symmetric)
    bs_asym = brier_score_loss(y_true, p_asymmetric)

    print(f"평가 대상 분반 수: {evaluated_sections} 개 (총 입찰 건수: {len(y_true)} 개)")
    print(f"  * Symmetric Model Brier Score  : {bs_sym:.6f}")
    print(f"  * Beta Mixture Model Brier Score : {bs_asym:.6f}")
    improvement = (bs_sym - bs_asym) / bs_sym * 100
    print(f"  => Brier Score 개선도: {improvement:.2f}%")
    print("  => Brier Score가 낮을수록 실제 예측 성공 확률에 오차가 적고 정확히 밀착됨을 뜻합니다.")

def test_monotonicity():
    print("\n" + "=" * 70)
    print(" [검증 3] 확률 곡선의 단조 증가성(Monotonicity) 검증")
    print("=" * 70)
    
    # We will generate curves for 100 random quantiles and verify they never decrease
    np.random.seed(42)
    errors = 0
    for _ in range(100):
        median = np.random.uniform(5, 30)
        q10 = np.random.uniform(1, median)
        q90 = np.random.uniform(median, 36)
        
        res = CutoffResult(q10=q10, median=median, q90=q90, mean=median)
        probs = CutoffPredictor._beta_cdf_mixture_curve(np.arange(0, 37), res, 36.0, 0.0)
        
        # Check if monotonically increasing
        diffs = np.diff(probs)
        if (diffs < -1e-7).any():
            errors += 1
            
    print(f"단조 증가성 테스트 횟수: 100회")
    print(f"  * 실패 횟수: {errors}회")
    if errors == 0:
        print("  => ✅ 모든 가상 시나리오에서 확률 곡선의 단조 증가성이 유지됩니다.")
    else:
        print("  => ❌ 오류 발생: 단조 감소 구간이 발견되었습니다.")

if __name__ == "__main__":
    evaluate_tie_breakers()
    evaluate_brier_scores()
    test_monotonicity()

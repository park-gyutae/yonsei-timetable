import sqlite3
import json
import os
import numpy as np
from sklearn.linear_model import LogisticRegression

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

def main():
    db_path = "mileage_history.db"
    if not os.path.exists(db_path):
        db_path = "../yonsei-timetable/mileage_history.db"
        if not os.path.exists(db_path):
            raise FileNotFoundError("mileage_history.db not found.")

    conn = sqlite3.connect(db_path)
    
    # Fetch all bids
    query = """
        SELECT course_code, division, year, semester, mileage, major, first_time, grad, applied_courses, earned_ratio, last_sem_ratio, success
        FROM mileage_bids
    """
    bids = conn.execute(query).fetchall()
    conn.close()

    # Group bids by section
    from collections import defaultdict
    section_bids = defaultdict(list)
    for b in bids:
        key = (b[0], b[1], b[2], b[3]) # course_code, division, year, semester
        section_bids[key].append(b[4:]) # mileage, major, first_time, grad, applied_courses, earned_ratio, last_sem_ratio, success

    X_list = []
    y_list = []

    for key, bids_in_sec in section_bids.items():
        # Find maximum mileage among failed bids in this section
        fails = [b[0] for b in bids_in_sec if b[7] != 'Y']
        if not fails:
            continue
        cutoff = max(fails)
        
        # Bids exactly at cutoff
        boundary_bids = [b for b in bids_in_sec if b[0] == cutoff]
        
        # Check if there is active competition (i.e. both success and failure at cutoff)
        success_states = set(b[7] == 'Y' for b in boundary_bids)
        if len(success_states) <= 1:
            continue
            
        for b in boundary_bids:
            major_val = b[1]
            major_yy = 1.0 if major_val == 'Y(Y)' else 0.0
            major_yn = 1.0 if major_val in ('Y(N)', 'N(Y)') else 0.0
            applied_ratio = float(b[4] or 0) / 6.0 # Max courses is 6
            is_grad = 1.0 if b[3] == 'Y' else 0.0
            is_first = 1.0 if b[2] == 'Y' else 0.0
            earned_ratio = parse_ratio(b[5])
            sem_ratio = parse_ratio(b[6])
            
            X_list.append([major_yy, major_yn, applied_ratio, is_grad, is_first, earned_ratio, sem_ratio])
            y_list.append(1 if b[7] == 'Y' else 0)

    X = np.array(X_list)
    y = np.array(y_list)

    print(f"총 {len(y)}개의 경계 입찰 데이터로 로지스틱 회귀 학습을 시작합니다.")

    lr = LogisticRegression(fit_intercept=True, random_state=42)
    lr.fit(X, y)

    coefs = lr.coef_[0]
    intercept = lr.intercept_[0]

    # Calculate max possible score to normalize (YY and YN are mutually exclusive)
    # Max score = max(YY_coef, YN_coef, 0) + applied_coef + grad_coef + first_coef + earned_coef + sem_coef
    max_major_coef = max(coefs[0], coefs[1], 0.0)
    max_score = max_major_coef + sum(max(coefs[i], 0.0) for i in range(2, 7))

    print(f"학습된 raw 계수:")
    print(f"  Intercept: {intercept:.4f}")
    features = ['major_yy', 'major_yn', 'applied_credits_ratio', 'is_graduating', 'is_first_time', 'earned_credit_ratio', 'enrolled_semester_ratio']
    for f, coef in zip(features, coefs):
        print(f"  {f}: {coef:.4f}")

    print(f"이론상 최댓값 (Normalization factor): {max_score:.4f}")

    # Normalize weights so that maximum possible score is 1.0
    normalized_weights = {
        "major_yy": float(max(coefs[0], 0.0) / max_score),
        "major_yn": float(max(coefs[1], 0.0) / max_score),
        "applied_credits_ratio": float(max(coefs[2], 0.0) / max_score),
        "is_graduating": float(max(coefs[3], 0.0) / max_score),
        "is_first_time": float(max(coefs[4], 0.0) / max_score),
        "earned_credit_ratio": float(max(coefs[5], 0.0) / max_score),
        "enrolled_semester_ratio": float(max(coefs[6], 0.0) / max_score),
        "intercept": float(intercept),
        "scale_factor": float(max_score)
    }

    print("\n정규화된 가중치:")
    for k, v in normalized_weights.items():
        print(f"  {k}: {v:.4f}")

    # Save to file
    out_path = "calibrated_tie_breaker_weights.json"
    with open(out_path, "w") as f:
        json.dump(normalized_weights, f, indent=2)
    print(f"\n✅ {out_path} 저장 완료.")

if __name__ == "__main__":
    main()

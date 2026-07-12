import sqlite3
import numpy as np
import re
from sklearn.model_selection import train_test_split, GridSearchCV
from lightgbm import LGBMRegressor

def _parse_time_score(time_slot: str) -> float:
    if not time_slot: return 0.0
    score = 0.0
    popular_days = {"월": 1.2, "화": 1.0, "수": 1.1, "목": 1.0, "금": 0.8}
    for day, w in popular_days.items():
        if day in time_slot: score += w
    if any(f"{d}{p}" in time_slot for d in "월화수목금" for p in ["1", "2"]):
        score *= 0.85
    return min(score, 3.0)

def main():
    conn = sqlite3.connect("mileage_history.db")
    print("="*75)
    print(" [HPO 튜닝] LightGBM 최적 하이퍼파라미터 탐색 (GridSearchCV)")
    print("="*75)

    rows = conn.execute("""
        SELECT
            s.capacity, s.applicants, s.max_allowed, s.major_ratio,
            c.credits, c.time_slot, c.classification,
            s.min_mileage,
            (SELECT COUNT(*) FROM mileage_summary sub WHERE sub.course_code = s.course_code AND sub.year = s.year AND sub.semester = s.semester) as num_divisions,
            (SELECT COUNT(*) FROM mileage_summary sub WHERE sub.course_code = s.course_code AND sub.year = CAST(CAST(s.year as INTEGER) - 1 as TEXT) AND sub.semester = s.semester) as existed_last_year
        FROM mileage_summary s
        LEFT JOIN courses c ON c.course_code = s.course_code AND c.division = s.division
        WHERE s.capacity > 0 AND s.min_mileage IS NOT NULL
    """).fetchall()

    X_data, y_data = [], []
    for row in rows:
        (cap, app, max_al, major_ratio, credits, time_slot, classification, 
         min_mlg, num_divs, existed_last_yr) = row
         
        mqr = 0.0
        if major_ratio:
            m = re.match(r"^(\d+)", str(major_ratio))
            if m: mqr = min(int(m.group(1)) / max(cap, 1), 1.0)
                
        app_ratio = min((app or 0) / max(cap, 1), 5.0)
        t_score = _parse_time_score(time_slot or "")
        is_req = 1 if classification and ("필" in str(classification) or "기초" in str(classification) or "전기" in str(classification)) else 0
        sem_val = 2.0  # approximate
        
        X_data.append([
            float(cap), float(mqr), float(max_al or 36), float(app_ratio),
            float(t_score), float(is_req), float(credits or 3), float(sem_val),
            float(num_divs or 1), float(1 if existed_last_yr and existed_last_yr > 0 else 0)
        ])
        y_data.append(float(min_mlg))

    X = np.array(X_data, dtype=np.float32)
    y = np.array(y_data, dtype=np.float32)
    
    # Grid Search 파라미터 셋업
    param_grid = {
        'n_estimators': [100, 300, 500],
        'learning_rate': [0.01, 0.05, 0.1],
        'num_leaves': [15, 31, 63],
        'min_child_samples': [5, 10, 20],
        'subsample': [0.8],
        'colsample_bytree': [0.8]
    }
    
    print(f"데이터셋: {X.shape[0]}개 | 탐색 파라미터 조합 수: 81개")
    print("교차 검증(CV=3) HPO 튜닝 시작... (약 10~20초 소요 예상)")

    lgbm = LGBMRegressor(random_state=42, verbose=-1)
    grid = GridSearchCV(lgbm, param_grid, cv=3, scoring='neg_mean_absolute_error', n_jobs=-1)
    grid.fit(X, y)
    
    print("\n✅ 탐색 완료!")
    print(f"최고 성능(MAE) 점수: {-grid.best_score_:.4f}")
    print(f"최적 파라미터: {grid.best_params_}")

    # 현재 config.py에 설정된 base parameter 성능과 비교하기 위해 기본값도 계산
    base_lgbm = LGBMRegressor(
        n_estimators=300, learning_rate=0.05, num_leaves=31, 
        min_child_samples=5, subsample=0.8, colsample_bytree=0.8,
        random_state=42, verbose=-1
    )
    from sklearn.model_selection import cross_val_score
    base_scores = cross_val_score(base_lgbm, X, y, cv=3, scoring='neg_mean_absolute_error', n_jobs=-1)
    print(f"기존 하드코딩 파라미터 MAE: {-np.mean(base_scores):.4f}")

    print("===========================================================================")

if __name__ == "__main__":
    main()

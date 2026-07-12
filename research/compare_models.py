import sqlite3
import numpy as np
import scipy.stats as stats
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import re

def _parse_time_score(time_slot: str) -> float:
    if not time_slot: return 0.0
    score = 0.0
    popular_days = {"월": 1.2, "화": 1.0, "수": 1.1, "목": 1.0, "금": 0.8}
    for day, w in popular_days.items():
        if day in time_slot: score += w
    if any(f"{d}{p}" in time_slot for d in "월화수목금" for p in ["1", "2"]):
        score *= 0.85
    return min(score, 3.0)

def compare_models():
    conn = sqlite3.connect("mileage_history.db")
    print("="*75)
    print(" [모델 비교 분석] 단순 선형회귀(Linear) vs 비선형 트리앙상블(LightGBM)")
    print("="*75)
    
    rows = conn.execute("""
        SELECT
            s.capacity, s.applicants, s.max_allowed, s.major_ratio,
            c.credits, c.time_slot, c.classification,
            s.min_mileage,
            (SELECT COUNT(*) FROM mileage_summary sub 
             WHERE sub.course_code = s.course_code AND sub.year = s.year AND sub.semester = s.semester) as num_divisions,
            (SELECT COUNT(*) FROM mileage_summary sub 
             WHERE sub.course_code = s.course_code AND sub.year = CAST(CAST(s.year as INTEGER) - 1 as TEXT) AND sub.semester = s.semester) as existed_last_year
        FROM mileage_summary s
        LEFT JOIN courses c ON c.course_code = s.course_code AND c.division = s.division
        WHERE s.capacity > 0 AND s.min_mileage IS NOT NULL
    """).fetchall()

    X_data = []
    y_data = []

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
    
    # 80% Train, 20% Test Split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # 1. Linear Regression (선형 모델)
    lr_model = LinearRegression()
    lr_model.fit(X_train, y_train)
    lr_preds = lr_model.predict(X_test)
    
    lr_mae = mean_absolute_error(y_test, lr_preds)
    lr_rmse = np.sqrt(mean_squared_error(y_test, lr_preds))
    lr_r2 = r2_score(y_test, lr_preds)
    
    # 2. LightGBM (비선형 머신러닝 앙상블 모델 - HistGradientBoosting)
    # LightGBM과 유사한 sklearn의 HistGradientBoostingRegressor 사용
    gb_model = HistGradientBoostingRegressor(random_state=42, max_iter=200)
    gb_model.fit(X_train, y_train)
    gb_preds = gb_model.predict(X_test)
    
    gb_mae = mean_absolute_error(y_test, gb_preds)
    gb_rmse = np.sqrt(mean_squared_error(y_test, gb_preds))
    gb_r2 = r2_score(y_test, gb_preds)
    
    print(f"[1] 단순 회귀 모델 (Linear Regression)")
    print(f"  * MAE (평균 오차): {lr_mae:.2f}점")
    print(f"  * RMSE: {lr_rmse:.2f}점")
    print(f"  * R-squared (설명력): {lr_r2:.4f}\n")
    
    print(f"[2] 머신러닝 모델 (Gradient Boosting / LightGBM)")
    print(f"  * MAE (평균 오차): {gb_mae:.2f}점")
    print(f"  * RMSE: {gb_rmse:.2f}점")
    print(f"  * R-squared (설명력): {gb_r2:.4f}\n")
    
    print("="*75)
    print("결론 및 제언:")
    print("비선형성(교호작용)이 강한 변수들(예: mqr, existed_last_year)은 회귀분석으로 잡아내지 못합니다.")
    print("R-squared 설명력과 평균 오차 방어력을 비교해 어떤 모델이 유리한지 판단합니다.")

if __name__ == "__main__":
    compare_models()

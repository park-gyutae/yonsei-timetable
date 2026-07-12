"""
precompute.py — 듀얼 LightGBM 및 학년별 쿼터 분기 분위수 회귀 모델 사전 계산
================================================================================
selected_features_dual.json을 읽어 전공자/비전공자 분할 및 학년(1~4학년) 분할을 지원하는
총 8가지 가상 시나리오에 대응하는 듀얼 LightGBM 분위수 회귀 모델을 학습하고 
precomputed_curves.json에 다중 깊이의 P(m) 곡선을 사전 생성합니다.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import re
import sqlite3
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

DB_PATH   = Path(__file__).parent / "mileage_history.db"
OUT_PATH  = Path(__file__).parent / "precomputed_curves.json"
FEAT_PATH = Path(__file__).parent / "selected_features_dual.json"
ENGINE_PATH = Path(__file__).parent.parent / "yonsei_mileage_engine"

# 엔진 경로 추가
sys.path.insert(0, str(ENGINE_PATH))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("precompute")


# ---------------------------------------------------------------------------
# 데이터 구조 및 파싱 헬퍼
# ---------------------------------------------------------------------------

@dataclass
class SectionStats:
    course_code: str
    division: str
    median_cutoff: float
    q10: float
    q90: float
    mean_cutoff: float
    max_allowed: float
    capacity: float
    applicants: float
    major_quota_ratio: float
    n_semesters: int

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
    bids = conn.execute("""
        SELECT mileage, major, success FROM mileage_bids
        WHERE course_code=? AND division=? AND year=? AND semester=?
    """, (code, div, year, semester)).fetchall()
    
    if not bids:
        return fallback_min, fallback_min
        
    major_bids = []
    non_major_bids = []
    
    for b_mileage, b_major, b_success in bids:
        is_maj = b_major and b_major.startswith('Y')
        bid_entry = {'mileage': float(b_mileage or 1.0), 'success': b_success == 'Y'}
        if is_maj:
            major_bids.append(bid_entry)
        else:
            non_major_bids.append(bid_entry)
            
    def get_group_cutoff(group_bids):
        if not group_bids:
            return fallback_min
        success_count = sum(1 for b in group_bids if b['success'])
        if success_count == len(group_bids):
            return 1.0
            
        fails = [b['mileage'] for b in group_bids if not b['success']]
        if fails:
            return max(fails)
        passes = [b['mileage'] for b in group_bids if b['success']]
        if passes:
            return min(passes)
        return fallback_min
        
    maj_cut = get_group_cutoff(major_bids)
    non_maj_cut = get_group_cutoff(non_major_bids)
    return maj_cut, non_maj_cut

def extract_group_grade_bids(conn, code, div, year, semester):
    bids = conn.execute("""
        SELECT mileage, major, grade, success FROM mileage_bids
        WHERE course_code=? AND division=? AND year=? AND semester=?
    """, (code, div, year, semester)).fetchall()
    return bids

def calculate_clean_group_grade_cutoff(bids, target_major_group: str, target_grade: int, fallback_min: float) -> float:
    group_bids = []
    for mlg, maj, grd, succ in bids:
        is_maj = maj and maj.startswith('Y')
        is_target_maj = (target_major_group == 'major' and is_maj) or (target_major_group == 'non_major' and not is_maj)
        try:
            is_target_grd = int(grd) == target_grade
        except:
            is_target_grd = False
            
        if is_target_maj and is_target_grd:
            group_bids.append({'mileage': float(mlg or 1.0), 'success': succ == 'Y'})
            
    if not group_bids:
        return fallback_min
        
    success_count = sum(1 for b in group_bids if b['success'])
    if success_count == len(group_bids):
        return 1.0
        
    fails = [b['mileage'] for b in group_bids if not b['success']]
    if fails:
        return max(fails)
    passes = [b['mileage'] for b in group_bids if b['success']]
    if passes:
        return min(passes)
    return fallback_min

def build_features_for_sample(row, hist_list, sibling_caps, existed_last_yr, row_semester_str, target_grade, grade_capacity, grade_applicants) -> dict:
    code = row['course_code']
    cap = grade_capacity
    app_ratio = min(grade_applicants / max(cap, 1), 5.0)
    max_al = row['max_allowed']
    major_ratio = row['major_ratio']
    credits = row['credits']
    time_slot = row['time_slot']
    classification = str(row['classification'] or "")
    dept = str(row['dept'] or "")
    title = str(row['title'] or "")
    
    # Historical variables
    hist_avg_min = 12.0; hist_min_min = 1.0; hist_max_min = 36.0; hist_std_min = 0.0
    hist_last_min = 12.0; hist_last2_min = 12.0; hist_avg_avg = 12.0; hist_avg_max = 36.0
    hist_trend_min = 0.0; hist_avg_app_ratio = 1.0; hist_last_app_ratio = 1.0
    hist_max_app_ratio = 1.0; hist_under_enroll_rate = 0.0; hist_avg_app = 20.0
    hist_std_app = 0.0; hist_last_app = 20.0; hist_avg_cap = 30.0; hist_avg_mqr = 0.0
    
    if len(hist_list) > 0:
        hist_min_vals = [h['min_mileage'] for h in hist_list]
        hist_avg_vals = [h['avg_mileage'] for h in hist_list]
        hist_app_ratios = [h['app_ratio'] for h in hist_list]
        hist_apps = [h['applicants'] for h in hist_list]
        hist_caps = [h['capacity'] for h in hist_list]
        hist_mqrs = [h['mqr'] for h in hist_list]
        
        hist_avg_min = np.mean(hist_min_vals)
        hist_min_min = np.min(hist_min_vals)
        hist_max_min = np.max(hist_min_vals)
        hist_std_min = np.std(hist_min_vals) if len(hist_list) >= 2 else 0.0
        hist_last_min = hist_min_vals[-1]
        hist_last2_min = hist_min_vals[-2] if len(hist_list) >= 2 else hist_last_min
        hist_avg_avg = np.mean(hist_avg_vals)
        hist_avg_max = np.max(hist_avg_vals)
        hist_trend_min = hist_last_min - hist_avg_min
        
        hist_avg_app_ratio = np.mean(hist_app_ratios)
        hist_last_app_ratio = hist_app_ratios[-1]
        hist_max_app_ratio = np.max(hist_app_ratios)
        hist_under_enroll_rate = np.mean([1.0 if h['under_enrolled'] else 0.0 for h in hist_list])
        hist_avg_app = np.mean(hist_apps)
        hist_std_app = np.std(hist_apps) if len(hist_list) >= 2 else 0.0
        hist_last_app = hist_apps[-1]
        hist_avg_cap = np.mean(hist_caps)
        hist_avg_mqr = np.mean(hist_mqrs)
        
    mqr = 0.0
    if major_ratio:
        m = re.match(r"^(\d+)", str(major_ratio))
        if m: mqr = min(int(m.group(1)) / max(cap, 1), 1.0)
        
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
    
    sem_season = 1.0 if row_semester_str == "10" else 2.0
    year_recency = float(row['year_int'] - 2020)
    
    is_req = 1.0 if "필" in classification or "기초" in classification or "전기" in classification else 0.0
    
    yq_json = row['yq_json']
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
    
    return {
        'user_grade': float(target_grade),
        'feat_1_capacity': float(cap),
        'feat_2_max_allowed': float(max_al or 36),
        'feat_3_credits': float(credits or 3),
        'feat_4_is_required': is_req,
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
        'feat_46_has_yq': float(1.0 if row['yq_json'] else 0.0),
        'feat_47_existed_last_year': float(1 if existed_last_yr and existed_last_yr > 0 else 0),
        'feat_48_sibling_avg_cap': float(other_div_avg_cap),
        'feat_49_sibling_total_cap': float(other_div_total_cap),
        'feat_50_is_single_div': is_single_div,
        'feat_51_inter_cap_req': float(cap * is_req),
        'feat_52_inter_app_req': float(app_ratio * is_req),
        'feat_53_inter_mqr_req': float(mqr * is_req),
        'feat_54_inter_cap_mqr': float(cap * mqr)
    }


# ---------------------------------------------------------------------------
# 데이터 로드 및 듀얼 학습 데이터셋 빌드 (학년 분할 확장)
# ---------------------------------------------------------------------------

def load_training_data_dual(conn: sqlite3.Connection, selected_maj: list[str], selected_non: list[str]) -> tuple:
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
            'time_slot': time_slot, 'classification': classification, 'dept': dept, 'title': title,
            'sibling_caps': sibling_caps, 'existed_last_year': existed_last_yr,
            'num_divisions': num_divs, 'year_int': year_int, 'sem_sort': sem_sort
        })
        
    raw_data.sort(key=lambda x: (x['year_int'], x['sem_sort']))
    
    history_store = {}
    from collections import defaultdict
    dept_feat_accum = defaultdict(list)
    
    X_maj_rows, y_maj_rows = [], []
    X_non_rows, y_non_rows = [], []
    meta_rows = []
    
    for row in raw_data:
        code = row['course_code']
        div = row['division']
        year = row['year']
        sem = row['semester']
        cap = row['capacity']
        app = row['applicants']
        major_ratio = row['major_ratio']
        yq_json = row['yq_json']
        
        # Load bids for this section
        bids = extract_group_grade_bids(conn, code, div, year, sem)
        
        # Pull grade allocations if Year Quota exists
        yq = {}
        if yq_json:
            try: yq = json.loads(yq_json)
            except: pass
            
        key = (code, div)
        hist = history_store.get(key, [])
        
        # Build 4 training samples per section (one for each grade!)
        for g in [1, 2, 3, 4]:
            g_cap = float(yq.get(str(g), cap / 4.0)) if yq else float(cap / 4.0)
            g_app = float(sum(1 for b in bids if int(b[2]) == g)) if bids else float(app / 4.0)
            
            maj_cutoff_g = calculate_clean_group_grade_cutoff(bids, 'major', g, row['min_mileage'])
            non_cutoff_g = calculate_clean_group_grade_cutoff(bids, 'non_major', g, row['min_mileage'])
            
            feat_dict = build_features_for_sample(row, hist, row['sibling_caps'], row['existed_last_year'], sem, g, g_cap, g_app)
            
            prefix = code[:3] if len(code) >= 3 else "ALL"
            dept_feat_accum[prefix].append(feat_dict)
            dept_feat_accum["ALL"].append(feat_dict)
            
            X_maj_sample = [feat_dict[f] for f in selected_maj]
            X_non_sample = [feat_dict[f] for f in selected_non]
            
            X_maj_rows.append(X_maj_sample)
            y_maj_rows.append(float(maj_cutoff_g))
            
            X_non_rows.append(X_non_sample)
            y_non_rows.append(float(non_cutoff_g))
            
        # Update running history using section overall min
        is_under = (app is not None and cap is not None and app <= cap)
        mqr = 0.0
        if major_ratio:
            m = re.match(r"^(\d+)", str(major_ratio))
            if m: mqr = min(int(m.group(1)) / max(cap, 1), 1.0)
            
        hist_entry = {
            'min_mileage': float(row['min_mileage']),
            'avg_mileage': float(row['avg_mileage'] or row['min_mileage']),
            'app_ratio': min((app or 0) / max(cap, 1), 5.0),
            'under_enrolled': is_under,
            'applicants': float(app or 0),
            'capacity': float(cap),
            'mqr': mqr
        }
        if key not in history_store:
            history_store[key] = []
        history_store[key].append(hist_entry)
        
    dept_feature_means = {}
    for prefix, dicts in dept_feat_accum.items():
        if dicts:
            means = {}
            for f in dicts[0].keys():
                means[f] = float(np.mean([d[f] for d in dicts]))
            dept_feature_means[prefix] = means
            
    return (
        np.array(X_maj_rows, dtype=np.float32), np.array(y_maj_rows, dtype=np.float32),
        np.array(X_non_rows, dtype=np.float32), np.array(y_non_rows, dtype=np.float32),
        meta_rows,
        dept_feature_means
    )


# ---------------------------------------------------------------------------
# Section Stats (과거 전체 학기 기준 집계)
# ---------------------------------------------------------------------------

def load_section_stats(conn: sqlite3.Connection) -> Dict[str, SectionStats]:
    rows = conn.execute("""
        WITH real_summaries AS (
            SELECT
                s.course_code, s.division, s.year, s.semester,
                s.capacity, s.applicants, s.max_allowed, s.major_ratio, s.avg_mileage,
                COALESCE(
                    (SELECT MAX(b.mileage) FROM mileage_bids b 
                     WHERE b.course_code=s.course_code AND b.division=s.division 
                       AND b.year=s.year AND b.semester=s.semester 
                       AND (b.success IS NULL OR b.success != 'Y')),
                    (SELECT MIN(b.mileage) FROM mileage_bids b 
                     WHERE b.course_code=s.course_code AND b.division=s.division 
                       AND b.year=s.year AND b.semester=s.semester 
                       AND b.success = 'Y'),
                    s.min_mileage
                ) as real_cutoff
            FROM mileage_summary s
            WHERE s.capacity > 0
        )
        SELECT
            course_code, division,
            COUNT(*) as n_sem,
            AVG(real_cutoff) as avg_min,
            MIN(real_cutoff) as q10_proxy,
            MAX(real_cutoff) as q90_proxy,
            AVG(avg_mileage) as avg_avg,
            AVG(max_allowed) as avg_max_al,
            AVG(capacity) as avg_cap,
            AVG(applicants) as avg_app,
            AVG(CAST(SUBSTR(major_ratio, 1,
                CASE WHEN INSTR(major_ratio,'(')>0 THEN INSTR(major_ratio,'(')-1 ELSE LENGTH(major_ratio) END
            ) AS REAL) / MAX(capacity, 1)) as mqr
        FROM real_summaries
        GROUP BY course_code, division
    """).fetchall()

    result = {}
    for r in rows:
        code, div, n_sem, avg_min, q10p, q90p, avg_avg, avg_max_al, avg_cap, avg_app, mqr = r
        key = f"{code}-{div}"
        
        if n_sem >= 3:
            q10 = float(q10p or 0)
            q90 = float(q90p or avg_max_al or 36)
        else:
            center = float(avg_min or 0)
            q10 = max(0, center * 0.8)
            q90 = min(float(avg_max_al or 36), center * 1.2)

        result[key] = SectionStats(
            course_code=code,
            division=div,
            median_cutoff=float(avg_min or 0),
            q10=q10,
            q90=q90,
            mean_cutoff=float(avg_avg or avg_min or 0),
            max_allowed=float(avg_max_al or 36),
            capacity=float(avg_cap or 30),
            applicants=float(avg_app or 0),
            major_quota_ratio=float(mqr or 0),
            n_semesters=int(n_sem),
        )
    return result


# ---------------------------------------------------------------------------
# CDF 곡선 매핑
# ---------------------------------------------------------------------------

def logistic_prob_curve(
    cutoff: float,
    q10: float,
    q90: float,
    max_allowed: int,
    p_under: float = 0.0,
) -> List[float]:
    from scipy.special import betainc
    from scipy.optimize import minimize

    # Enforce bounds
    max_allowed = max(max_allowed, 1)
    q10 = np.clip(q10, 0.0, max_allowed)
    cutoff = np.clip(cutoff, 0.0, max_allowed)
    q90 = np.clip(q90, 0.0, max_allowed)

    q10 = min(q10, cutoff)
    q90 = max(q90, cutoff)

    x10 = q10 / max_allowed
    x50 = cutoff / max_allowed
    x90 = q90 / max_allowed

    if x90 - x10 < 1e-3:
        if x50 <= 1e-4:
            alpha, beta = 1.0, 50.0
        elif x50 >= 1.0 - 1e-4:
            alpha, beta = 50.0, 1.0
        else:
            beta = 20.0
            alpha = beta * x50 / (1.0 - x50)
    else:
        x10 = np.clip(x10, 1e-4, 1.0 - 1e-4)
        x50 = np.clip(x50, 1e-4, 1.0 - 1e-4)
        x90 = np.clip(x90, 1e-4, 1.0 - 1e-4)

        if x10 >= x50:
            x10 = x50 * 0.9
        if x90 <= x50:
            x90 = x50 + (1.0 - x50) * 0.1

        def loss(params):
            a, b = params
            l1 = (betainc(a, b, x10) - 0.1) ** 2
            l2 = (betainc(a, b, x50) - 0.5) ** 2
            l3 = (betainc(a, b, x90) - 0.9) ** 2
            return l1 + l2 + l3

        init_a = 4.0 if x50 > 0.5 else 2.0
        init_b = 2.0 if x50 > 0.5 else 4.0
        res = minimize(loss, [init_a, init_b], bounds=[(1.0, 100.0), (1.0, 100.0)], method='L-BFGS-B')
        alpha, beta = res.x[0], res.x[1]

    curve = []
    for m in range(max_allowed + 1):
        if m <= 0:
            p = 0.0
        else:
            x = np.clip(m / max_allowed, 0.0, 1.0)
            cdf = float(betainc(alpha, beta, x))
            p = p_under + (1.0 - p_under) * cdf
        curve.append(round(np.clip(p, 0.0, 1.0), 4))

    return curve


def build_dept_priors(section_stats: Dict[str, SectionStats]) -> dict:
    from collections import defaultdict
    groups = defaultdict(list)
    for s in section_stats.values():
        prefix = s.course_code[:3] if len(s.course_code) >= 3 else "ALL"
        groups[prefix].append(s.median_cutoff)

    priors = {}
    for prefix, vals in groups.items():
        priors[prefix] = {
            "median": float(np.mean(vals)),
            "q10":    float(np.percentile(vals, 10)),
            "q90":    float(np.percentile(vals, 90)),
        }
    return priors


# ---------------------------------------------------------------------------
# 실행 루프
# ---------------------------------------------------------------------------

def precompute(use_lgbm: bool = True, out_path: Path = OUT_PATH) -> None:
    if not DB_PATH.exists():
        logger.error("DB 없음: %s", DB_PATH)
        return

    if not FEAT_PATH.exists():
        logger.error("selected_features_dual.json이 없습니다.")
        return
        
    with open(FEAT_PATH, "r") as f:
        selected_feats_dual = json.load(f)
        
    # Append user_grade and interaction features to selected feature masks
    selected_maj = selected_feats_dual['major_features'] + ['user_grade', 'feat_51_inter_cap_req', 'feat_52_inter_app_req', 'feat_53_inter_mqr_req', 'feat_54_inter_cap_mqr']
    selected_non = selected_feats_dual['non_major_features'] + ['user_grade', 'feat_51_inter_cap_req', 'feat_52_inter_app_req', 'feat_53_inter_mqr_req', 'feat_54_inter_cap_mqr']
    
    logger.info("듀얼 모델 피처셋 로드 완료: 전공자 %d개, 비전공자 %d개", len(selected_maj), len(selected_non))

    conn = sqlite3.connect(DB_PATH)

    logger.info("학습 데이터 로드 및 38,808개 샘플 분리 중…")
    X_maj, y_maj, X_non, y_non, meta, dept_feature_means = load_training_data_dual(conn, selected_maj, selected_non)
    logger.info("  전공자 학습 데이터: %d 샘플 (피처 차원: %d)", len(y_maj), X_maj.shape[1])
    logger.info("  비전공자 학습 데이터: %d 샘플 (피처 차원: %d)", len(y_non), X_non.shape[1])

    # 듀얼 LightGBM 모델 학습
    maj_predictor = None
    non_predictor = None
    if use_lgbm and len(y_maj) >= 30:
        try:
            from models.cut_predictor import CutoffPredictor
            logger.info("  [1/2] 전공자 LightGBM 모델 훈련 시작…")
            maj_predictor = CutoffPredictor(use_lightgbm=True)
            maj_predictor.fit(X_maj, y_maj)
            
            logger.info("  [2/2] 비전공자 LightGBM 모델 훈련 시작…")
            non_predictor = CutoffPredictor(use_lightgbm=True)
            non_predictor.fit(X_non, y_non)
            
            logger.info("  듀얼 LightGBM 학습 완료 (최적 HPO 파라미터 및 교호작용 적용).")
        except ImportError as e:
            logger.warning("  LightGBM 임포트 실패. Baseline fallback 사용. %s", e)
            maj_predictor = None
            non_predictor = None

    logger.info("분반별 통계 집계 중…")
    section_stats = load_section_stats(conn)
    logger.info("  이력 있는 분반: %d개", len(section_stats))

    all_courses = conn.execute("""
        SELECT 
            c.course_code, c.division, c.credits, c.time_slot, c.classification, c.dept, c.title
        FROM courses c
    """).fetchall()
    logger.info("  전체 분반: %d개", len(all_courses))

    dept_priors = build_dept_priors(section_stats)
    curves_out = {}

    done = 0
    cold_start = 0

    for r in all_courses:
        course_code, division, credits, time_slot, classification, dept, title = r
        key = f"{course_code}-{division}"

        # ── 이력 있는 경우 ──────────────────────────────────────────────
        if key in section_stats:
            s = section_stats[key]

            # 1. Sibling divisions counts
            sibling_rows = conn.execute("""
                SELECT capacity FROM mileage_summary 
                WHERE course_code=? AND year='2025' AND semester='20' AND division !=?
            """, (course_code, division)).fetchall()
            sibling_caps = [sr[0] for sr in sibling_rows]
            num_divs = len(sibling_caps) + 1
            
            existed_last_yr = conn.execute("""
                SELECT COUNT(*) FROM mileage_summary 
                WHERE course_code=? AND year='2024' AND semester='20'
            """, (course_code,)).fetchone()[0]
            
            # Fetch full history list
            hist_rows = conn.execute("""
                SELECT applicants, capacity, min_mileage, avg_mileage FROM mileage_summary
                WHERE course_code=? AND division=?
                ORDER BY year, semester
            """, (course_code, division)).fetchall()
            
            hist_list = []
            for hr in hist_rows:
                hr_app, hr_cap, hr_min, hr_avg = hr
                is_under = (hr_app is not None and hr_cap is not None and hr_app <= hr_cap)
                maj_cutoff_hr, non_maj_cutoff_hr = extract_group_cutoffs(conn, course_code, division, '2025', '20', hr_min)
                hist_cutoff = (maj_cutoff_hr + non_maj_cutoff_hr) / 2.0
                
                mqr_hr = 0.0
                hist_list.append({
                    'min_mileage': hist_cutoff,
                    'avg_mileage': float(hr_avg or hist_cutoff),
                    'app_ratio': min((hr_app or 0) / max(hr_cap, 1), 5.0),
                    'under_enrolled': is_under,
                    'applicants': float(hr_app or 0),
                    'capacity': float(hr_cap),
                    'mqr': mqr_hr
                })
            
            # Load current quotas if active
            yq_json_current = conn.execute("""
                SELECT year_quotas FROM mileage_summary
                WHERE course_code=? AND division=? AND year='2025' AND semester='20'
            """, (course_code, division)).fetchone()
            yq_current = {}
            if yq_json_current and yq_json_current[0]:
                try: yq_current = json.loads(yq_json_current[0])
                except: pass

            max_al = int(s.max_allowed)
            
            # 8 가상 시나리오 추론: [Major / Non-major] x [Grade 1, 2, 3, 4]
            curves_out[key] = {
                "max_allowed": max_al,
                "n_semesters": s.n_semesters,
                "major": {},
                "non_major": {}
            }
            
            for maj_group, predictor_g, selected_g_feats, curve_dest in [
                ("major", maj_predictor, selected_maj, curves_out[key]["major"]),
                ("non_major", non_predictor, selected_non, curves_out[key]["non_major"])
            ]:
                for g in [1, 2, 3, 4]:
                    g_cap = float(yq_current.get(str(g), s.capacity / 4.0)) if yq_current else float(s.capacity / 4.0)
                    g_app = float(s.applicants / 4.0) # uniform approximation for cold future applicants
                    
                    mock_row = {
                        'course_code': course_code,
                        'capacity': s.capacity,
                        'max_allowed': s.max_allowed,
                        'major_ratio': f"{int(s.major_quota_ratio * s.capacity)}",
                        'credits': credits,
                        'time_slot': time_slot,
                        'classification': classification,
                        'dept': dept,
                        'title': title,
                        'yq_json': yq_json_current[0] if yq_json_current else None,
                        'year_sort': 2025,
                        'year_int': 2025,
                        'num_divisions': num_divs
                    }
                    
                    feat_dict = build_features_for_sample(mock_row, hist_list, sibling_caps, existed_last_yr, '20', g, g_cap, g_app)
                    
                    if predictor_g is not None:
                        X_inf = np.array([[feat_dict[f] for f in selected_g_feats]], dtype=np.float32)
                        try:
                            preds = predictor_g.predict_quantiles(X_inf)
                            q10_p = float(preds["q10"][0])
                            median_p = float(preds["median"][0])
                            q90_p = float(preds["q90"][0])
                            
                            q10_p = min(q10_p, median_p)
                            q90_p = max(q90_p, median_p)
                        except Exception:
                            q10_p, median_p, q90_p = s.q10, s.median_cutoff, s.q90
                    else:
                        q10_p, median_p, q90_p = s.q10, s.median_cutoff, s.q90
                        
                    p_under = float(feat_dict.get("feat_36_hist_under_enroll_rate", 0.0))
                    # Generate curve for this specific grade & major group
                    curve = logistic_prob_curve(median_p, q10_p, q90_p, max_al, p_under)
                    curve_dest[f"grade_{g}"] = {
                        "q10": round(q10_p, 2),
                        "median": round(median_p, 2),
                        "q90": round(q90_p, 2),
                        "prob_curve": curve
                    }

        # ── Cold-start: 이력 없음 → 피처 임퓨테이션 후 LightGBM 추론 ──────
        else:
            current_cap_row = conn.execute("""
                SELECT capacity, max_allowed, major_ratio, year_quotas FROM mileage_summary
                WHERE course_code=? AND division=?
                ORDER BY year DESC, semester DESC LIMIT 1
            """, (course_code, division)).fetchone()
            if current_cap_row:
                cap, max_al, major_ratio, yq_json = current_cap_row
                cap = float(cap or 30.0)
                max_al = int(max_al or 36)
            else:
                cap = 30.0
                max_al = 36
                major_ratio = None
                yq_json = None
                
            prefix = course_code[:3] if len(course_code) >= 3 else "ALL"
            dept_means = dept_feature_means.get(prefix, dept_feature_means.get("ALL", {}))
            
            curves_out[key] = {
                "max_allowed": max_al,
                "n_semesters": 0,
                "major": {},
                "non_major": {}
            }
            
            yq_current = {}
            if yq_json:
                try: yq_current = json.loads(yq_json)
                except: pass

            for maj_group, predictor_g, selected_g_feats, curve_dest in [
                ("major", maj_predictor, selected_maj, curves_out[key]["major"]),
                ("non_major", non_predictor, selected_non, curves_out[key]["non_major"])
            ]:
                for g in [1, 2, 3, 4]:
                    g_cap = float(yq_current.get(str(g), cap / 4.0)) if yq_current else float(cap / 4.0)
                    g_app = float(cap / 4.0) # Assume 1.0 competition ratio for cold-start
                    
                    mock_row = {
                        'course_code': course_code,
                        'capacity': cap,
                        'max_allowed': max_al,
                        'major_ratio': major_ratio,
                        'credits': credits,
                        'time_slot': time_slot,
                        'classification': classification,
                        'dept': dept,
                        'title': title,
                        'yq_json': yq_json,
                        'year_sort': 2025,
                        'year_int': 2025,
                        'num_divisions': 1
                    }
                    
                    feat_dict = build_features_for_sample(mock_row, [], [], 0, '20', g, g_cap, g_app)
                    
                    p_under = 0.0
                    if dept_means:
                        for k in feat_dict.keys():
                            if (k.startswith("feat_24_") or k.startswith("feat_25_") or k.startswith("feat_26_") or 
                                k.startswith("feat_27_") or k.startswith("feat_28_") or k.startswith("feat_29_") or 
                                k.startswith("feat_30_") or k.startswith("feat_31_") or k.startswith("feat_32_") or 
                                k.startswith("feat_33_") or k.startswith("feat_34_") or k.startswith("feat_35_") or 
                                k.startswith("feat_36_") or k.startswith("feat_37_") or k.startswith("feat_38_") or 
                                k.startswith("feat_39_") or k.startswith("feat_40_") or k == "feat_42_hist_avg_mqr"):
                                if k in dept_means:
                                    feat_dict[k] = dept_means[k]
                        p_under = float(feat_dict.get("feat_36_hist_under_enroll_rate", 0.0))
                    
                    if predictor_g is not None:
                        X_inf = np.array([[feat_dict[f] for f in selected_g_feats]], dtype=np.float32)
                        try:
                            preds = predictor_g.predict_quantiles(X_inf)
                            q10_p = float(preds["q10"][0])
                            median_p = float(preds["median"][0])
                            q90_p = float(preds["q90"][0])
                            q10_p = min(q10_p, median_p)
                            q90_p = max(q90_p, median_p)
                        except Exception:
                            prior = dept_priors.get(prefix, dept_priors.get("ALL", {"median": 15.0, "q10": 8.0, "q90": 25.0}))
                            q10_p, median_p, q90_p = prior["q10"], prior["median"], prior["q90"]
                    else:
                        prior = dept_priors.get(prefix, dept_priors.get("ALL", {"median": 15.0, "q10": 8.0, "q90": 25.0}))
                        q10_p, median_p, q90_p = prior["q10"], prior["median"], prior["q90"]
                        
                    curve = logistic_prob_curve(median_p, q10_p, q90_p, max_al, p_under)
                    curve_dest[f"grade_{g}"] = {
                        "q10": round(q10_p, 2),
                        "median": round(median_p, 2),
                        "q90": round(q90_p, 2),
                        "prob_curve": curve
                    }
            cold_start += 1

        done += 1
        if done % 500 == 0:
            logger.info("  처리: %d / %d (cold-start: %d)", done, len(all_courses), cold_start)

    logger.info("동점자 토너먼트용 경계선 경쟁자 스펙 추출 및 precomputed_competitors.json 생성 중…")
    precompute_competitors(conn)

    conn.close()

    output = {
        "meta": {
            "generated_at": datetime.now().isoformat(),
            "total_sections": len(curves_out),
            "cold_start_sections": cold_start,
            "model": "lgbm_quantile_dual_grade" if maj_predictor else "logistic_fallback",
            "engine_version": "1.4 (Dual-Model Grade-Specific Pipeline)",
        },
        "curves": curves_out,
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    size_mb = out_path.stat().st_size / 1_000_000
    logger.info(
        "완료: %d분반 | cold-start %d | 파일 크기 %.1f MB → %s",
        len(curves_out), cold_start, size_mb, out_path
    )


def precompute_competitors(conn: sqlite3.Connection):
    def parse_ratio(val):
        if not val: return 0.0
        try:
            parts = val.split('/')
            if len(parts) == 2:
                return float(parts[0]) / float(parts[1])
            return float(val)
        except:
            return 0.0

    bids = conn.execute("""
        SELECT course_code, division, year, semester, mileage, major, first_time, grad, applied_courses, earned_ratio, last_sem_ratio, success 
        FROM mileage_bids
    """).fetchall()
    
    from collections import defaultdict
    section_bids = defaultdict(list)
    for b in bids:
        key = (b[0], b[1], b[2], b[3])
        section_bids[key].append(b[4:])
        
    competitors_by_section = defaultdict(list)
    global_bids = []
    
    for key, bids_in_sec in section_bids.items():
        course_code, division, year, semester = key
        sec_key = f"{course_code}-{division}"
        
        fails = [b[0] for b in bids_in_sec if b[7] != 'Y']
        if not fails: continue
        cutoff = max(fails)
        
        boundary_bids = [b for b in bids_in_sec if b[0] == cutoff]
        
        for b in boundary_bids:
            major_val = b[1]
            major_code = 2 if major_val == 'Y(Y)' else (1 if major_val in ('Y(N)', 'N(Y)') else 0)
            applied_ratio = float(b[4] or 0.0) / 6.0
            is_grad = 1 if b[3] == 'Y' else 0
            is_first = 1 if b[2] == 'Y' else 0
            earned_ratio = parse_ratio(b[5])
            sem_ratio = parse_ratio(b[6])
            
            profile = [major_code, round(applied_ratio, 4), is_grad, is_first, round(earned_ratio, 4), round(sem_ratio, 4)]
            competitors_by_section[sec_key].append(profile)
            global_bids.append(profile)
            
    # Sample global bids for cold-start
    np.random.seed(42)
    global_sample_indices = np.random.choice(len(global_bids), min(500, len(global_bids)), replace=False)
    global_sample = [global_bids[idx] for idx in global_sample_indices]
    
    output_data = {
        "GLOBAL": global_sample
    }
    for sec_key, profiles in competitors_by_section.items():
        if len(profiles) > 100:
            indices = np.random.choice(len(profiles), 100, replace=False)
            profiles = [profiles[idx] for idx in indices]
        output_data[sec_key] = profiles
        
    out_path = Path("precomputed_competitors.json")
    with open(out_path, "w") as f:
        json.dump(output_data, f, indent=2)
    logger.info("  완료: precomputed_competitors.json 파일 크기 %.1f MB", out_path.stat().st_size / 1_000_000)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-lgbm", action="store_true", help="Disable LGBM and use baseline only")
    parser.add_argument("--out", type=str, help="Output JSON path")
    args = parser.parse_args()

    out_file = Path(args.out) if args.out else OUT_PATH
    precompute(use_lgbm=not args.no_lgbm, out_path=out_file)

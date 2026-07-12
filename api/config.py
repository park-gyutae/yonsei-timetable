"""
config.py — System-Wide Configuration
======================================
All hyperparameters, feature schemas, mileage rules, and logging
settings for the Yonsei Mileage Course Registration Engine.
"""

from __future__ import annotations

import logging
import sys
from dataclasses import dataclass, field
from typing import List

# ---------------------------------------------------------------------------
# Mileage Rules
# ---------------------------------------------------------------------------

MAX_TOTAL_MILEAGE: int = 72          # Maximum total mileage budget per student
MAX_PER_COURSE: int = 36             # Maximum mileage that can be bid on a single course
MIN_PER_COURSE: int = 0              # Minimum mileage bid per course (can be 0)
MILEAGE_STEP: int = 1                # Granularity of the mileage grid (integer points)

# ---------------------------------------------------------------------------
# Monte Carlo
# ---------------------------------------------------------------------------

MONTE_CARLO_RUNS: int = 10_000       # Number of MC simulation iterations
RANDOM_SEED: int = 42                # Global random seed for reproducibility

# ---------------------------------------------------------------------------
# LightGBM Quantile Regression
# ---------------------------------------------------------------------------

QUANTILE_ALPHAS: List[float] = [0.10, 0.50, 0.90]   # Q10, Q50 (median), Q90

LGBM_PARAMS_BASE: dict = {
    "objective": "regression",
    "n_estimators": 100,
    "learning_rate": 0.05,
    "num_leaves": 31,
    "min_child_samples": 20,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "random_state": RANDOM_SEED,
    "verbose": -1,
}

LGBM_PARAMS_QUANTILE: dict = {
    **LGBM_PARAMS_BASE,
    "objective": "quantile",
}

# ---------------------------------------------------------------------------
# Feature Schemas
# ---------------------------------------------------------------------------

# Raw columns expected in the input historical dataset
RAW_COLUMNS: List[str] = [
    "semester",          # e.g. "2024-1"
    "subject_code",      # e.g. "ECO3101"
    "section",           # e.g. "001"
    "professor",         # instructor name
    "day_of_week",       # "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"
    "start_hour",        # integer, e.g. 9 for 09:00
    "capacity",          # section enrollment cap
    "total_applicants",  # total mileage bids received
    "cutoff_mileage",    # actual cut-off mileage (target variable y)
    "major_quota",       # seats reserved for majors
    "department",        # e.g. "Economics"
    "credit_hours",      # e.g. 3
    "is_required",       # bool — required vs. elective
]

# Subject-level engineered features
SUBJECT_FEATURES: List[str] = [
    "subject_total_capacity",
    "subject_total_sections",
    "subject_mean_cutoff",
    "subject_std_cutoff",
    "subject_mean_applicants",
]

# Section-level engineered features
SECTION_FEATURES: List[str] = [
    "time_score",            # desirability score of time slot (0–1)
    "is_friday",             # bool: section meets on Friday
    "is_morning",            # bool: start_hour < 10
    "major_quota_ratio",     # major_quota / capacity
    "relative_time_rank",    # rank of time_score within subject (ascending = worse)
    "capacity_ratio",        # section capacity / subject_total_capacity
    "is_required",           # propagated from raw
    "credit_hours",          # propagated from raw
]

# All model features (union)
ALL_FEATURES: List[str] = SUBJECT_FEATURES + SECTION_FEATURES

# Target variable
TARGET_COLUMN: str = "cutoff_mileage"

# ---------------------------------------------------------------------------
# Tie-Breaker Calibration  (반영: 연세대 마일리지 7단계 동점자 처리 실제 규칙)
# ---------------------------------------------------------------------------
#
# 동점 처리 우선순위 (내려갈수록 tie가 남을 경우에만 적용)
#   1단계: 마일리지 점수          → 모델 입력 자체 (P(m) 곡선)
#   2단계: 전공 여부              Y(Y) > Y(N) > N(N)
#   3단계: 신청 학점 수           많을수록 유리 (단조 증가)
#   4단계: 졸업예정자 여부        Y > N
#   5단계: 초수강 여부            초수강(Y) > 재수강(N)
#   6단계: 기이수학점 비율        취득학점 / 졸업요구학점  (높을수록 유리)
#   7단계: 재학학기 비율          재학학기 / 졸업요구학기 (높을수록 유리)
#   (이후 랜덤 추첨)
#
# 각 단계에 부여하는 기여 가중치 (합산 → privilege_score ∈ [-∞, ∞] → sigmoid 변환).
# 단계 번호가 낮을수록 (더 중요한 기준일수록) 더 큰 가중치를 부여합니다.

TIE_BREAKER_STAGE_WEIGHTS: dict = {
    # 2단계 — 전공 여부
    "major_yy": 0.50,           # Y(Y): 제1전공자 (전공필수/선택)
    "major_yn": 0.25,           # Y(N): 복수/부전공자
    # N(N) 비전공자는 0

    # 3단계 — 신청 학점수 (단조 증가; 최대학점 대비 비율로 정규화)
    "applied_credits_ratio": 0.20,

    # 4단계 — 졸업예정자
    "is_graduating": 0.15,

    # 5단계 — 초수강 여부
    "is_first_time": 0.12,       # 초수강(Y) 보너스
    # 재수강은 0 (페널티 없이 단순히 보너스 미적용)

    # 6단계 — 기이수학점 비율  취득학점 / 졸업요구학점
    "earned_credit_ratio": 0.08,

    # 7단계 — 재학학기 비율  재학학기 / 졸업요구학기
    "enrolled_semester_ratio": 0.05,
}

# 정규화 기준값
GRAD_REQUIRED_CREDITS: int = 130        # 연세대 졸업요구학점 (일반적 기준)
GRAD_REQUIRED_SEMESTERS: int = 8        # 졸업요구 최소 재학학기
MAX_APPLIED_CREDITS: int = 24           # 한 학기 최대 신청 가능 학점 (8과목 × 3학점 기준)

# Sigmoid sharpness around cut-off boundary (higher = steeper transition)
TIE_BREAKER_SIGMOID_STEEPNESS: float = 5.0

# Mileage window around cut-off where tie-breaking is active (±window)
TIE_BREAKER_WINDOW: int = 3

# ---------------------------------------------------------------------------
# Optimizer
# ---------------------------------------------------------------------------

# Default preference weight when user does not specify one
DEFAULT_COURSE_WEIGHT: float = 1.0

# Minimum probability threshold below which we skip allocating mileage
MIN_USEFUL_PROB: float = 0.02

# ---------------------------------------------------------------------------
# Report / Output
# ---------------------------------------------------------------------------

REPORT_CREDIT_THRESHOLDS: List[int] = [3, 6, 9, 12, 15, 18]
JSON_REPORT_PATH: str = "report_output.json"
PDF_REPORT_PATH: str = "report_output.pdf"
PLOT_OUTPUT_PATH: str = "plots/"

# ---------------------------------------------------------------------------
# Cold-Start / Fallback
# ---------------------------------------------------------------------------

# When a course has fewer than this many historical observations, use fallback
COLD_START_THRESHOLD: int = 3

# Fallback values used when department-level data is also unavailable
GLOBAL_FALLBACK_CUTOFF_MEAN: float = 20.0
GLOBAL_FALLBACK_CUTOFF_STD: float = 8.0

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

LOG_LEVEL: int = logging.INFO
LOG_FORMAT: str = "%(asctime)s | %(levelname)-8s | %(name)-25s | %(message)s"
LOG_DATE_FORMAT: str = "%Y-%m-%d %H:%M:%S"


def setup_logging(level: int = LOG_LEVEL) -> None:
    """Configure root logger with a clean, consistent format."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE_FORMAT))
    root = logging.getLogger()
    root.setLevel(level)
    if not root.handlers:
        root.addHandler(handler)
    else:
        root.handlers = [handler]


# ---------------------------------------------------------------------------
# User Profile Schema (for documentation / validation)
# ---------------------------------------------------------------------------

@dataclass
class UserProfile:
    """
    연세대 마일리지 동점자 처리 7단계에 필요한 학생 프로필.

    Attributes
    ----------
    student_id : str
    major_status : str
        전공 여부 코드.
        'YY' = 제1전공자 (전공필수/선택 이수 목적)
        'YN' = 복수전공·부전공자
        'NN' = 비전공자 (교양·타과생)
    applied_credits : int
        이번 학기 마일리지 신청한 총 학점 수. 많을수록 3단계에서 유리.
    is_graduating : bool
        졸업예정자 여부 (4단계).
    is_first_time : bool
        해당 과목 초수강 여부. True=초수강, False=재수강 (5단계).
    earned_credits : int
        현재까지 취득한 총 학점 (6단계 기이수학점 비율 분자).
    enrolled_semesters : int
        현재까지 재학한 학기 수 (7단계 재학학기 비율 분자).
    """

    student_id: str = "anonymous"

    # 2단계: 전공 여부
    major_status: str = "NN"           # 'YY' | 'YN' | 'NN'

    # 3단계: 신청 학점수
    applied_credits: int = 15          # 이번 학기 마일리지 신청 총 학점

    # 4단계: 졸업예정자
    is_graduating: bool = False

    # 5단계: 초수강 여부 (과목별로 다를 수 있으므로 calibrate() 호출 시 override 가능)
    is_first_time: bool = True

    # 6단계: 기이수학점 비율
    earned_credits: int = 0            # 취득 학점

    # 7단계: 재학학기 비율
    enrolled_semesters: int = 1        # 재학 학기 수

    # ── 하위 호환성 유지 (구 버전 필드) ──────────────────────────────────
    # prev_semester_credits 는 earned_credits 로 통합되었으나 alias 제공
    @property
    def prev_semester_credits(self) -> int:
        return self.earned_credits

    @property
    def is_major(self) -> bool:
        """True if major_status is 'YY' or 'YN'."""
        return self.major_status in ("YY", "YN")


@dataclass
class CourseInfo:
    """Represents a single course-section the student wants to register."""

    course_id: str                     # Unique key e.g. "ECO3101-001"
    subject_code: str                  # e.g. "ECO3101"
    section: str                       # e.g. "001"
    credit_hours: int = 3
    is_critical: bool = False          # True = must-have; used in joint-failure calc
    preference_weight: float = DEFAULT_COURSE_WEIGHT  # User importance weight w_i
    min_bid: int = MIN_PER_COURSE
    max_bid: int = MAX_PER_COURSE
    features: dict = field(default_factory=dict)  # Engineered section features

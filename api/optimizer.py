"""
optimizer.py — Multi-Choice Knapsack Mileage Allocation Optimizer
=================================================================
Solves the constrained mileage allocation problem:

    max  Σ w_i · P_i(m_i)
    s.t. Σ m_i ≤ M_total          (budget constraint)
         0 ≤ m_i ≤ cap_i          (per-course mileage cap)
         m_i ∈ ℤ                   (integer bids)

This is a Multi-Choice Knapsack Problem (MCKP) solved via Dynamic
Programming over a discretised integer mileage grid.

Key classes
-----------
CourseEntry        : Holds a course's probability function, weight, and constraints.
OptimizationResult : Full solution including allocations, utility, and frontier.
MileageOptimizer   : DP solver with efficient frontier computation.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np

import config

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data Structures
# ---------------------------------------------------------------------------

@dataclass
class CourseEntry:
    """
    Represents a single course the student wants to bid on.

    Attributes
    ----------
    course_id : str
        Unique identifier (e.g. "ECO3101-001").
    prob_fn : Callable[[float], float]
        Function mapping mileage bid → acceptance probability.
        Must return a value in [0, 1].
    weight : float
        User-defined preference weight w_i > 0.
    min_bid : int
        Minimum mileage the student must/can allocate.
    max_bid : int
        Maximum mileage for this course (≤ MAX_PER_COURSE).
    credit_hours : int
        Credit hours gained if accepted (used in credit-weighted utility).
    """

    course_id: str
    prob_fn: Callable[[float], float]
    weight: float = config.DEFAULT_COURSE_WEIGHT
    min_bid: int = config.MIN_PER_COURSE
    max_bid: int = config.MAX_PER_COURSE
    credit_hours: int = 3

    def __post_init__(self) -> None:
        self.max_bid = min(self.max_bid, config.MAX_PER_COURSE)
        self.min_bid = max(self.min_bid, config.MIN_PER_COURSE)
        if self.weight <= 0:
            raise ValueError(f"Course weight must be > 0, got {self.weight}")

    def expected_utility(self, mileage: int) -> float:
        """Compute w_i · P_i(m_i) for a given mileage bid."""
        return self.weight * float(self.prob_fn(mileage))


@dataclass
class OptimizationResult:
    """
    Full result from the MileageOptimizer.

    Attributes
    ----------
    allocations : dict[str, int]
        Optimal mileage allocation per course.
    expected_utility : float
        Total expected utility Σ w_i · P_i(m_i*).
    probabilities : dict[str, float]
        P_i(m_i*) for each course under the optimal allocation.
    total_mileage_used : int
        Sum of allocations (≤ MAX_TOTAL_MILEAGE).
    efficient_frontier : list of (budget, utility) tuples
        Pareto-optimal utility at each total budget level.
    per_course_details : list of dicts
        Detailed breakdown per course.
    """

    allocations: Dict[str, int]
    expected_utility: float
    probabilities: Dict[str, float]
    total_mileage_used: int
    efficient_frontier: List[Tuple[int, float]] = field(default_factory=list)
    per_course_details: List[dict] = field(default_factory=list)
    risk_report: Optional[dict] = None

    def marginal_utility_summary(self) -> Dict[str, float]:
        """Return marginal utility per mileage point for each course."""
        return {
            cid: self.probabilities.get(cid, 0.0) * 1.0 / max(alloc, 1)
            for cid, alloc in self.allocations.items()
        }


# ---------------------------------------------------------------------------
# MileageOptimizer
# ---------------------------------------------------------------------------

class MileageOptimizer:
    """
    Solves the Multi-Choice Knapsack Problem for mileage allocation.

    The DP table has shape (n_courses + 1, M_total + 1) where each cell
    dp[i][m] represents the maximum total utility achievable using the
    first i courses with a total mileage budget of m points.

    Parameters
    ----------
    total_budget : int
        Total mileage budget M_total (default 72).
    per_course_cap : int
        Per-course hard cap (default 36).
    """

    def __init__(
        self,
        total_budget: int = config.MAX_TOTAL_MILEAGE,
        per_course_cap: int = config.MAX_PER_COURSE,
    ) -> None:
        self.total_budget = total_budget
        self.per_course_cap = per_course_cap
        self._courses: List[CourseEntry] = []

    # ------------------------------------------------------------------
    # Course Registration
    # ------------------------------------------------------------------

    def add_course(
        self,
        course_id: str,
        prob_fn: Callable[[float], float],
        weight: float = config.DEFAULT_COURSE_WEIGHT,
        min_bid: int = config.MIN_PER_COURSE,
        max_bid: int = config.MAX_PER_COURSE,
        credit_hours: int = 3,
    ) -> "MileageOptimizer":
        """
        Register a course to include in the optimization.

        Parameters
        ----------
        course_id : str
            Unique identifier.
        prob_fn : Callable
            Maps mileage bid → acceptance probability in [0, 1].
        weight : float
            User preference weight.
        min_bid : int
            Minimum mileage bid constraint.
        max_bid : int
            Maximum mileage bid (further capped at per_course_cap).
        credit_hours : int
            Credit hours for this course.

        Returns
        -------
        self (for method chaining)
        """
        effective_max = min(max_bid, self.per_course_cap)
        entry = CourseEntry(
            course_id=course_id,
            prob_fn=prob_fn,
            weight=weight,
            min_bid=min_bid,
            max_bid=effective_max,
            credit_hours=credit_hours,
        )
        self._courses.append(entry)
        logger.debug("Added course: %s (w=%.2f, bid=[%d,%d])", course_id, weight, min_bid, effective_max)
        return self

    def clear_courses(self) -> None:
        """Remove all registered courses."""
        self._courses = []

    # ------------------------------------------------------------------
    # Main Solver
    # ------------------------------------------------------------------

    def solve(
        self,
        compute_frontier: bool = True,
    ) -> OptimizationResult:
        """
        Run the DP knapsack solver to find the optimal mileage allocation.

        Uses a forward-pass DP with per-course, per-budget choice tables for
        clean O(n · M · cap) backtracking.

        Parameters
        ----------
        compute_frontier : bool
            If True, also compute the efficient frontier over all budget levels.

        Returns
        -------
        OptimizationResult
        """
        if not self._courses:
            raise ValueError("No courses registered. Call add_course() first.")

        n = len(self._courses)
        M = self.total_budget
        logger.info(
            "Running MCKP Optimizer: %d courses, budget=%d, per-course cap=%d.",
            n, M, self.per_course_cap,
        )

        # Pre-compute utility tables  utils[i][m] = w_i · P_i(m)
        utils = self._precompute_utilities()

        # Forward DP
        # dp[m]       = max total utility using first i courses with budget m
        # choice[i,m] = bid chosen for course i when total budget is m
        dp = np.full(M + 1, -np.inf)
        dp[0] = 0.0

        # Separate choice array per course (avoids aliasing bugs)
        choice: list[np.ndarray] = [
            np.full(M + 1, -1, dtype=np.int32) for _ in range(n)
        ]

        for i, course in enumerate(self._courses):
            new_dp = np.full(M + 1, -np.inf)
            new_ch = np.full(M + 1, -1, dtype=np.int32)

            for prev_m in range(M + 1):
                if dp[prev_m] == -np.inf:
                    continue
                for bid in range(course.min_bid, course.max_bid + 1):
                    used = prev_m + bid
                    if used > M:
                        break
                    val = dp[prev_m] + utils[i][bid]
                    if val > new_dp[used]:
                        new_dp[used] = val
                        new_ch[used] = bid

            dp = new_dp
            choice[i] = new_ch

        # Find optimal total budget
        best_budget = int(np.argmax(dp))
        best_utility = float(dp[best_budget])

        # Backtrack: walk courses in reverse, recover bid at each step
        allocations: Dict[str, int] = {}
        remaining = best_budget
        for i in range(n - 1, -1, -1):
            bid = int(choice[i][remaining])
            bid = max(bid, 0)   # guard against unreachable states
            allocations[self._courses[i].course_id] = bid
            remaining = max(remaining - bid, 0)

        # Acceptance probabilities at optimal bids
        probabilities: Dict[str, float] = {
            course.course_id: float(course.prob_fn(allocations[course.course_id]))
            for course in self._courses
        }

        details = self._build_details(allocations, probabilities)

        frontier: List[Tuple[int, float]] = []
        if compute_frontier:
            frontier = self._compute_efficient_frontier(utils)

        total_used = sum(allocations.values())
        logger.info(
            "Optimization complete: utility=%.4f, budget used=%d/%d.",
            best_utility, total_used, M,
        )

        return OptimizationResult(
            allocations=allocations,
            expected_utility=best_utility,
            probabilities=probabilities,
            total_mileage_used=total_used,
            efficient_frontier=frontier,
            per_course_details=details,
        )

    def solve_risk_constrained(
        self,
        target_credits: int,
        target_prob: float,
        ec_step: float = 0.1,
    ) -> OptimizationResult:
        """
        Credit-Augmented DP 기반 리스크 제약 최적화.

        DP 상태를 (budget, expected_credits_bucket) 2차원으로 확장합니다.
        이를 통해 DP 내부에서 직접 기대학점 분포를 추적하면서 utility를 최대화하는
        Pareto 최적 배분안 집합을 탐색하고, 그 중 P(Credits ≥ T) ≥ target_prob를
        만족하는 최고 utility 배분안을 선택합니다.

        기존 Lagrangian 방식의 근본적 한계(p(max_bid) >> p(mid_bid) 구간에서
        가중치를 아무리 조정해도 분산이 유도되지 않는 문제)를 원천 해결합니다.

        Parameters
        ----------
        target_credits : int
            최소 확보해야 할 학점 수 (예: 9).
        target_prob : float
            달성 목표 확률 (예: 0.85).
        ec_step : float
            기대학점 이산화 단위. 기본 0.1학점.
            작을수록 정밀하지만 메모리·속도 비용이 증가함.
        """
        if not self._courses:
            raise ValueError("No courses registered. Call add_course() first.")

        n = len(self._courses)
        M = self.total_budget
        max_ec = sum(c.credit_hours for c in self._courses)
        n_ec = int(max_ec / ec_step) + 2   # ec 버킷 수 (여유분 +2)

        logger.info(
            "Running Credit-Augmented DP: target_credits=%d, target_prob=%.2f, "
            "n_ec_buckets=%d (step=%.2f)",
            target_credits, target_prob, n_ec, ec_step,
        )

        # ── 2D DP 테이블 초기화 ────────────────────────────────────────────────
        # dp2d[m][ec_b] = budget m, expected_credits_bucket ec_b에서 달성 가능한 최대 utility
        NEG_INF = -np.inf
        dp2d = np.full((M + 1, n_ec), NEG_INF, dtype=np.float64)
        dp2d[0][0] = 0.0

        # 역추적용 테이블
        bid_table = [
            np.full((M + 1, n_ec), -1, dtype=np.int32) for _ in range(n)
        ]
        prev_ec_table = [
            np.full((M + 1, n_ec), -1, dtype=np.int32) for _ in range(n)
        ]

        # ── Forward DP ────────────────────────────────────────────────────────
        for i, course in enumerate(self._courses):
            new_dp = np.full((M + 1, n_ec), NEG_INF, dtype=np.float64)
            new_bid = np.full((M + 1, n_ec), -1, dtype=np.int32)
            new_prev = np.full((M + 1, n_ec), -1, dtype=np.int32)

            for prev_m in range(M + 1):
                for prev_ec_b in range(n_ec):
                    if dp2d[prev_m][prev_ec_b] == NEG_INF:
                        continue
                    prev_val = dp2d[prev_m][prev_ec_b]

                    for bid in range(course.min_bid, course.max_bid + 1):
                        used_m = prev_m + bid
                        if used_m > M:
                            break

                        p = float(course.prob_fn(bid))
                        # 이 과목이 기여하는 기대학점을 버킷으로 변환
                        delta_ec_b = int(round(p * course.credit_hours / ec_step))
                        new_ec_b = min(prev_ec_b + delta_ec_b, n_ec - 1)

                        val = prev_val + course.weight * p
                        if val > new_dp[used_m][new_ec_b]:
                            new_dp[used_m][new_ec_b] = val
                            new_bid[used_m][new_ec_b] = bid
                            new_prev[used_m][new_ec_b] = prev_ec_b

            dp2d = new_dp
            bid_table[i] = new_bid
            prev_ec_table[i] = new_prev

        # ── 후보 탐색: utility 내림차순으로 정렬, P(credits ≥ T) 검사 ─────────
        candidates = [
            (float(dp2d[m][ec_b]), m, ec_b)
            for m in range(M + 1)
            for ec_b in range(n_ec)
            if dp2d[m][ec_b] != NEG_INF
        ]
        candidates.sort(reverse=True)

        best_result: Optional[OptimizationResult] = None
        best_satisfaction = 0.0
        best_cand_utility = NEG_INF

        for cand_util, fin_m, fin_ec_b in candidates:
            # ── 역추적으로 배분안 복원 ───────────────────────────────────────
            allocations: Dict[str, int] = {}
            cur_m = fin_m
            cur_ec_b = fin_ec_b

            for i in range(n - 1, -1, -1):
                bid = int(bid_table[i][cur_m][cur_ec_b])
                prev_eb = int(prev_ec_table[i][cur_m][cur_ec_b])
                bid = max(bid, 0)
                allocations[self._courses[i].course_id] = bid
                cur_m = max(cur_m - bid, 0)
                cur_ec_b = prev_eb if prev_eb >= 0 else 0

            probabilities: Dict[str, float] = {
                course.course_id: float(course.prob_fn(allocations[course.course_id]))
                for course in self._courses
            }

            # ── 정확한 학점 달성 확률 계산 (DP Convolution) ─────────────────
            satisfaction = self._compute_credit_satisfaction(
                self._courses, probabilities, target_credits
            )

            # 최선 결과 추적
            if (
                best_result is None
                or (best_satisfaction < target_prob and satisfaction > best_satisfaction)
                or (satisfaction >= target_prob and cand_util > best_cand_utility)
            ):
                details = self._build_details(allocations, probabilities)
                true_utility = sum(
                    c.weight * probabilities[c.course_id] for c in self._courses
                )
                best_result = OptimizationResult(
                    allocations=allocations,
                    expected_utility=true_utility,
                    probabilities=probabilities,
                    total_mileage_used=sum(allocations.values()),
                    efficient_frontier=[],
                    per_course_details=details,
                )
                best_satisfaction = satisfaction
                best_cand_utility = cand_util

            if satisfaction >= target_prob:
                logger.info(
                    "  Constraint satisfied: P(Credits >= %d) = %.4f | "
                    "Utility=%.4f | Allocations: %s",
                    target_credits, satisfaction, cand_util,
                    {cid: bid for cid, bid in allocations.items()},
                )
                break

        # ── 최종 리포트 첨부 ──────────────────────────────────────────────────
        orig_utils = self._precompute_utilities()
        best_result.efficient_frontier = self._compute_efficient_frontier(orig_utils)
        best_result.risk_report = {
            "target_credits": target_credits,
            "target_prob": target_prob,
            "achieved_prob": round(best_satisfaction, 4),
        }

        return best_result

    # ------------------------------------------------------------------
    # Credit-Augmented DP Helper: 학점 달성 확률 계산
    # ------------------------------------------------------------------

    @staticmethod
    def _compute_credit_satisfaction(
        courses: List["CourseEntry"],
        probabilities: Dict[str, float],
        target_credits: int,
    ) -> float:
        """
        독립 베르누이 시행의 DP 합성곱으로
        P(Σ c_i·X_i ≥ target_credits)를 정밀 계산합니다.
        """
        max_possible = sum(c.credit_hours for c in courses)
        credit_dp = np.zeros(max_possible + 1)
        credit_dp[0] = 1.0

        for course in courses:
            p = probabilities[course.course_id]
            c_h = course.credit_hours
            new_dp = np.zeros(max_possible + 1)
            for j in range(max_possible + 1):
                if credit_dp[j] > 0:
                    if j + c_h <= max_possible:
                        new_dp[j + c_h] += credit_dp[j] * p
                    new_dp[j] += credit_dp[j] * (1.0 - p)
            credit_dp = new_dp

        return float(sum(credit_dp[j] for j in range(target_credits, max_possible + 1)))

    # ------------------------------------------------------------------
    # Efficient Frontier
    # ------------------------------------------------------------------

    def _compute_efficient_frontier(
        self,
        utils: List[np.ndarray],
    ) -> List[Tuple[int, float]]:
        """
        Compute max utility achievable at each budget level from 0 to M.

        Returns
        -------
        list of (budget, max_utility) tuples
        """
        n = len(self._courses)
        M = self.total_budget
        dp = np.full(M + 1, -np.inf)
        dp[0] = 0.0

        for i, course in enumerate(self._courses):
            new_dp = dp.copy()
            for m in range(M + 1):
                if dp[m] == -np.inf:
                    continue
                for bid in range(course.min_bid, course.max_bid + 1):
                    remaining = m + bid
                    if remaining > M:
                        break
                    val = dp[m] + utils[i][bid]
                    if val > new_dp[remaining]:
                        new_dp[remaining] = val
            dp = new_dp

        # Replace -inf with 0 (no feasible allocation = 0 utility)
        dp = np.where(dp == -np.inf, 0.0, dp)
        # Make monotone increasing (take cumulative max)
        dp = np.maximum.accumulate(dp)

        frontier = [(int(b), float(u)) for b, u in enumerate(dp)]
        return frontier

    # ------------------------------------------------------------------
    # Sensitivity / What-if Analysis
    # ------------------------------------------------------------------

    def what_if(
        self,
        fixed_allocations: Dict[str, int],
        freed_budget: int,
        target_course_id: str,
    ) -> Tuple[int, float]:
        """
        Given fixed allocations for all other courses, find the optimal
        bid for a specific target course using the freed budget.

        Parameters
        ----------
        fixed_allocations : dict
            {course_id: mileage} for all courses except target.
        freed_budget : int
            Additional mileage available for the target course.
        target_course_id : str
            The course to re-optimise.

        Returns
        -------
        (optimal_bid, expected_utility_gain) : tuple
        """
        target = next(
            (c for c in self._courses if c.course_id == target_course_id), None
        )
        if target is None:
            raise ValueError(f"Course {target_course_id!r} not registered.")

        best_bid = target.min_bid
        best_utility = 0.0
        for bid in range(target.min_bid, min(target.max_bid, freed_budget) + 1):
            u = target.expected_utility(bid)
            if u > best_utility:
                best_utility = u
                best_bid = bid

        return best_bid, best_utility

    # ------------------------------------------------------------------
    # Internal Helpers
    # ------------------------------------------------------------------

    def _precompute_utilities(self) -> List[np.ndarray]:
        """
        Pre-compute utility u[i][m] = w_i · P_i(m) for all courses and bids.
        Returns a list of 1-D arrays indexed by mileage.
        """
        utils: List[np.ndarray] = []
        for course in self._courses:
            arr = np.zeros(self.per_course_cap + 1)
            for m in range(course.min_bid, course.max_bid + 1):
                arr[m] = course.expected_utility(m)
            utils.append(arr)
        return utils

    def _build_details(
        self,
        allocations: Dict[str, int],
        probabilities: Dict[str, float],
    ) -> List[dict]:
        """Build per-course detail dicts for the result object."""
        details = []
        for course in self._courses:
            bid = allocations.get(course.course_id, 0)
            prob = probabilities.get(course.course_id, 0.0)
            details.append(
                {
                    "course_id": course.course_id,
                    "weight": course.weight,
                    "bid": bid,
                    "credit_hours": course.credit_hours,
                    "acceptance_prob": round(prob, 4),
                    "expected_utility": round(course.weight * prob, 4),
                    "expected_credits": round(prob * course.credit_hours, 2),
                }
            )
        return sorted(details, key=lambda d: -d["expected_utility"])

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def course_ids(self) -> List[str]:
        return [c.course_id for c in self._courses]

    def __repr__(self) -> str:
        return (
            f"MileageOptimizer("
            f"courses={len(self._courses)}, "
            f"budget={self.total_budget}, "
            f"cap={self.per_course_cap})"
        )

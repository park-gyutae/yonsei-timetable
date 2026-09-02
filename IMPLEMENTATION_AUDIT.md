# Yonsei Mileage — Internal Implementation Audit Report

**Document Purpose**: Internal technical reference for blog writing, based strictly on codebase inspection.  
**Repository Working Directory**: `/Users/parkqed/GitRepo/yonsei-timetable`  
**Core Modules Analyzed**: `research/precompute.py`, `yonsei_mileage_engine/models/cut_predictor.py`, `api/optimizer.py`, `yonsei_mileage_engine/simulator.py`, `research/audit_production_discrepancy_2026_2.py`, `research/decision_backtest_2026_2.py`.

---

## 1. End-to-End Architecture

The system operates as a five-stage pipeline:

```
┌───────────────────────────┐      ┌───────────────────────────┐      ┌───────────────────────────┐
│ Stage 1: Historical Data  │ ───► │ Stage 2: Dual LightGBM    │ ───► │ Stage 3: Beta CDF Mixture │
│ (mileage_history.db)      │      │ (Quantile Q10, Q50, Q90)  │      │ Curve Generation P_i(m)   │
└───────────────────────────┘      └───────────────────────────┘      └───────────────────────────┘
                                                                                    │
┌───────────────────────────┐      ┌───────────────────────────┐                    │
│ Stage 5: Monte Carlo Risk │ ◄─── │ Stage 4: Integer MCKP     │ ◄──────────────────┘
│ Post-Processing (10k)     │      │ DP Optimizer (72 Budget)  │
└───────────────────────────┘      └───────────────────────────┘
```

1. **Stage 1 (Historical Ingestion)**: Ingests historical section summaries and individual bid records into `mileage_history.db`.
2. **Stage 2 (Predictive Modeling)**: Trains dual LightGBM quantile regressors ($Q_{10}, Q_{50}, Q_{90}$) separately for Major ($Y$) and Non-Major ($N$) applicants across 4 grade levels.
3. **Stage 3 (Probability Curve Fitting)**: Fits continuous 2-parameter Beta CDF mixture curves $P_i(m) = p_{\text{under}} + (1-p_{\text{under}}) \cdot I_{m/36}(\alpha, \beta)$ anchored at predicted quantiles.
4. **Stage 4 (Constrained Optimization)**: Solves the Multi-Choice Knapsack Problem (MCKP) over integer grid $[0 \dots 36]$ with 72 total budget limit via Dynamic Programming in $O(K \cdot M \cdot \text{cap}) < 1\text{ ms}$.
5. **Stage 5 (Monte Carlo Risk Simulation)**: Simulates 10,000 Bernoulli trials over optimal allocations to compute Value at Risk (VaR 5%), Credit Yield distributions, and Plan B fallback recommendations.

---

## 2. Data & Features

### A. Raw Data Structure & Table Schemas
* **Database**: `mileage_history.db` (SQLite)
* **Tables**:
  - `courses`: Catalog info (`course_code`, `division`, `title`, `credits`, `time_slot`, `classification`, `dept`).
  - `mileage_summary`: Section outcomes (`course_code`, `division`, `year`, `semester`, `capacity`, `applicants`, `max_allowed`, `major_ratio`, `min_mileage`, `avg_mileage`, `year_quotas`).
  - `mileage_bids`: Individual bid records (`rank`, `mileage`, `major`, `grade`, `first_time`, `grad`, `applied_courses`, `success`).

### B. Semester Merging & Temporal Separation
* Historical data is loaded using temporal ordering:
  ```sql
  SELECT ... FROM mileage_summary ORDER BY year, semester
  ```
* For feature generation, `year_sort` and `year_int` are used to ensure feature matrices for semester $t$ are built strictly using historical summaries from semesters $< t$. Realized applicant counts from current semester $t$ are excluded during prospective precomputation.

### C. Major / Non-Major Classification
* In `mileage_bids`, `major` column values:
  - `Y(Y)`: Major applicant, First-time taking course.
  - `Y(N)`: Major applicant, Re-taking course.
  - `N(N)`: Non-major applicant.
* Bids where `major` starts with `'Y'` are classified as **Major** (`major`). All other bids are classified as **Non-Major** (`non_major`).

### D. Feature Pipeline & Definitions
File: `research/precompute.py` (lines 100–350, `build_features_for_sample()`) & `research/selected_features_dual.json`
- **Total Selected Features**: 46 primary features per sample.
- **5 Added Interaction & Grade Features**: `user_grade`, `feat_51_inter_cap_req`, `feat_52_inter_app_req`, `feat_53_inter_mqr_req`, `feat_54_inter_cap_mqr`.

| Feature Name | Meaning & Description | Exact Calculation / Source | Purpose / Rationale | Implementation Location |
| :--- | :--- | :--- | :--- | :--- |
| `feat_1_capacity` | Section Grade Quota | `float(g_cap)` (from `year_quotas` JSON or `cap / 4.0`) | Baseline capacity for target grade | `precompute.py:L260` |
| `feat_2_max_allowed` | Max Mileage Cap per Course | `float(max_al or 36)` | Maximum allowable bid for section | `precompute.py:L261` |
| `feat_3_credits` | Course Credit Hours | `float(credits or 3)` | Academic weight of section | `precompute.py:L262` |
| `feat_4_is_required` | Required Course Indicator | `1.0` if `'필'`/`'기초'` in `classification`, else `0.0` | Captures high competition for required courses | `precompute.py:L316` |
| `feat_7_num_divisions` | Number of Sibling Divisions | `len(sibling_caps) + 1` | Captures demand dilution across parallel sections | `precompute.py:L265` |
| `feat_10_time_score` | Timetable Popularity Score | Weighted score based on weekday/period popularity | Captures student schedule preference bias | `precompute.py:L298` |
| `feat_24_hist_avg_min` | Historical Mean Cutoff | `np.mean(hist_min_vals)` across past semesters | Primary historical cutoff baseline | `precompute.py:L236` |
| `feat_28_hist_last_min` | Most Recent Past Cutoff | `hist_min_vals[-1]` | Captures recent trend momentum | `precompute.py:L240` |
| `feat_33_hist_avg_app_ratio` | Historical Competition Ratio | `np.mean(hist_app_ratios)` ($App / Cap$) | Directly measures excess demand intensity | `precompute.py:L244` |
| `feat_36_hist_under_enroll_rate` | Historical Under-Enrollment Rate | Fraction of past semesters where $App \le Cap$ | Floor probability anchor for Beta mixture | `precompute.py:L247` |
| `feat_41_mqr` | Major Quota Ratio | $\text{Major Quota Capacity} / \text{Total Capacity}$ | Measures major protection barrier | `precompute.py:L255` |
| `feat_51_inter_cap_req` | Capacity $\times$ Required Interaction | `g_cap * is_req` | Interaction feature for required course capacity | `precompute.py:L320` |

### E. Missing Value & Preprocessing Handling
- Numeric features: Nulls replaced with domain defaults (e.g. `credits` defaults to 3, `max_allowed` defaults to 36, historical means default to department priors).
- Outliers: Feature `app_ratio` clipped to $[0.0, 5.0]$.

---

## 3. Cutoff Prediction Model

### A. Model Architecture & Count
* **Dual Model Design**: Separate LightGBM regressors trained for Major applicants (`maj_predictor`) and Non-Major applicants (`non_predictor`).
* **Quantile Regressors**: For each major predictor, 3 distinct quantile regressors ($Q_{10}, Q_{50}, Q_{90}$) and 1 mean regressor are fitted.
* **Total Models**: $2 \times 4 = 8$ trained LightGBM models.

### B. Hyperparameters & Training Data
* **Training Samples**: 38,808 sample rows (4 grade samples generated per section $\times$ historical semesters).
* **Objective Function**:
  - Quantiles: `objective: "quantile"`, `alpha: 0.10`, `0.50`, `0.90`
  - Mean: `objective: "regression"`
* **Hyperparameters** (`config.LGBM_PARAMS_BASE` & `precompute.py:L623`):
  - `learning_rate`: `0.05`
  - `num_leaves`: `31`
  - `min_child_samples`: `20`
  - `random_state`: `42`
  - `num_boost_round`: `100`

### C. Execution & Saved Artifact Format
* Predictors generate scalar predictions: $Q_{10}, Q_{50}, Q_{90}$.
* Output serialized into `precomputed_curves.json` under key `"{course_code}-{division}"`:
  ```json
  "major": {
    "grade_3": {
      "q10": 1.0,
      "median": 4.24,
      "q90": 35.35,
      "prob_curve": [0.0, 0.1000, 0.2105, ..., 1.0]
    }
  }
  ```

---

## 4. Q10/Q50/Q90 → P_i(m) Probability Curve Construction

### A. Mathematical Formulation & Beta Fitting
File: `research/precompute.py` (lines 510–571, `logistic_prob_curve()`) & `cut_predictor.py:L308`

Scalar predictions $Q_{10}, Q_{50}, Q_{90}$ are mapped to a continuous probability curve $P_i(m)$ for integer mileage grid $m \in [0 \dots \text{max\_allowed}]$ via a **Beta CDF Mixture Model**:

1. **Normalisation to $[0, 1]$**:
   $$x_{10} = \frac{Q_{10}}{\text{max\_allowed}}, \quad x_{50} = \frac{Q_{50}}{\text{max\_allowed}}, \quad x_{90} = \frac{Q_{90}}{\text{max\_allowed}}$$
2. **Parameter Optimization ($\alpha, \beta$)**:
   Parameters $(\alpha, \beta)$ of the Regularized Incomplete Beta Function $I_x(\alpha, \beta) = \text{betainc}(\alpha, \beta, x)$ are fitted using `scipy.optimize.minimize` (L-BFGS-B method) over loss function:
   $$\text{Loss}(\alpha, \beta) = (I_{x_{10}}(\alpha, \beta) - 0.1)^2 + (I_{x_{50}}(\alpha, \beta) - 0.5)^2 + (I_{x_{90}}(\alpha, \beta) - 0.9)^2$$
   Bounds: $\alpha, \beta \in [1.0, 100.0]$.
3. **Under-Enrollment Mixture Blending**:
   For $m \ge 1$:
   $$P_i(m) = p_{\text{under}} + (1 - p_{\text{under}}) \cdot I_{m/\text{max\_allowed}}(\alpha, \beta)$$
   For $m = 0$: $P_i(0) = 0.0$.
4. **Boundary & Monotonicity Enforcement**:
   - $Q_{10} = \min(Q_{10}, Q_{50})$, $Q_{90} = \max(Q_{90}, Q_{50})$.
   - Final curve values clipped to $[0.0, 1.0]$ and rounded to 4 decimal places.

### B. Real Course Example
Source: `CNT2109-01` (from `research/results/precomputed_curves_posthoc_fix.json`)
* **Inputs**: `max_allowed = 36`, `Q10 = 1.0`, `Q50 (Median) = 4.24`, `Q90 = 35.35`, `p_under = 0.0`.
* **Fitted Curve Output $P(m)$**:
  - $P(0) = 0.0000$
  - $P(1) = 0.1000$
  - $P(5) = 0.5765$
  - $P(10) = 0.8826$
  - $P(15) = 0.9774$
  - $P(20) = 0.9974$
  - $P(36) = 1.0000$

---

## 5. Mileage Optimization

### A. Exact Formulation & Parameters
File: `api/optimizer.py` & `yonsei_mileage_engine/optimizer.py`

$$\max_{\{m_i\}} \sum_{i=1}^{K} w_i \cdot P_i(m_i)$$

$$\text{subject to } \sum_{i=1}^{K} m_i \le M_{\text{total}} \quad (M_{\text{total}} = 72), \quad m_i \in \{0, 1, 2, \dots, 36\}$$

* **Objective Function Validation**: The expression $\max \sum w_i P_i(m_i)$ **exactly matches** the codebase implementation (`CourseEntry.expected_utility(m)` calculates $w_i \cdot P_i(m)$).
* **Course Priority Weights ($w_i$)**: Default $w_i = 1.0$. Users can set priority weights $w_i \in [0.1, 5.0]$.
* **Budget Limits**: Total budget $M_{\text{total}} = 72$, per-course cap $\text{cap}_i \le 36$.
* **0-Bid Allocation**: Permitted ($m_i = 0$ yields $P_i(0) = 0.0$).

### B. Dynamic Programming Solver Mechanics
* **DP State**: `dp[m]` stores the maximum total expected utility achievable using the first $i$ courses with a total budget of $m$ mileage points ($0 \le m \le 72$).
* **Choice Table**: `choice[i][m]` stores the integer bid chosen for course $i$ at budget level $m$.
* **Forward Transition**:
  $$\text{dp}_{\text{new}}[m + \text{bid}] = \max(\text{dp}_{\text{new}}[m + \text{bid}], \text{dp}_{\text{old}}[m] + w_i \cdot P_i(\text{bid}))$$
* **Backtracking**: Recovers optimal allocations by walking courses in reverse: $i = K-1 \dots 0$, retrieving `bid = choice[i][remaining_budget]`.
* **Time Complexity**: $O(K \cdot M \cdot \text{cap})$ inner operations. For $K=6$, $M=72$, $\text{cap}=36$, total operations $< 16,000$ ($< 1\text{ ms}$ execution).

---

## 6. Under-Enrolled Courses & Course Abandonment Limitations

### A. Under-Enrolled Course Mileage Overestimation
- If a course is actually under-enrolled ($App \le Cap$), its true cutoff is 1.0.
- If the model predicts a non-zero median (e.g. 5.0), $P_i(1) < 1.0$.
- **Mitigation in Code**: Blending $p_{\text{under}}$ ensures $P(1) \ge p_{\text{under}}$. However, if $p_{\text{under}} = 0.0$, $P(1)$ can remain low, causing the optimizer to over-allocate points (e.g. bidding 5 points instead of 1).

### B. Course Abandonment Mechanics
- Under tight budget constraints (72 points), the DP solver allocates points according to marginal utility $\Delta U_i / \Delta m_i$.
- If a course has a steep threshold (e.g., requiring 20 points to reach $P=0.5$), while other courses offer high utility at lower mileage, the optimizer allocates 0 or 1 point to the steep course, effectively abandoning it.
- **Code Safeguard Analysis**: `CourseEntry.min_bid` allows enforcing a minimum bid constraint per course. By default (`min_bid = 0`), the optimizer is unconstrained and free to abandon courses. This is an inherent property of unconstrained knapsack utility maximization.

---

## 7. Monte Carlo / Risk Analysis

File: `yonsei_mileage_engine/simulator.py` (`MonteCarloSimulator`)

### A. Simulation Mechanics
* **Random Variable**: Independent Bernoulli random variables $X_i \sim \text{Bernoulli}(P_i(\hat{m}_i))$ for each course $i$ evaluated at the optimal bid $\hat{m}_i$.
* **Iterations**: `n_runs = 10,000` (default `config.DEFAULT_SIMULATION_RUNS`).
* **Single Iteration Step**:
  1. Draws $X_i \in \{0, 1\}$ with probability $P_i(\hat{m}_i)$.
  2. Calculates total realized credits $\sum X_i \cdot \text{credits}_i$.
  3. Calculates total realized utility $\sum X_i \cdot w_i$.
  4. Tracks critical course failure events ($X_{\text{critical}} = 0$).

### B. Output Statistics Returned
- `expected_credits`, `credit_std`
- `credit_prob_table`: $P(\text{total\_credits} \ge N)$ for $N \in \{6, 9, 12, 15, 18\}$.
- `var_5pct`: Value at Risk (5th percentile utility outcome).
- `cvar_5pct`: Conditional Value at Risk (mean utility in worst 5% of simulation runs).
- `joint_failure_prob`: $P(\text{all critical courses fail simultaneously})$.
- `PlanBMatrix`: Generates recommended 2nd-round fallback courses if primary courses fail.

### C. Role in System Architecture
* **Diagnostic Post-Processing**: Monte Carlo simulation does **NOT** feed back into or alter the DP optimizer state. It is an independent post-processing risk diagnostic step that quantifies the variance and credit yield distribution of the optimizer's allocation.

---

## 8. Production Artifact Pipeline & 2026-2 Failure Analysis

### A. Data Flow Pipeline
$$\text{Trained Dual LightGBM} \longrightarrow \text{Quantile Predictions } Q_{10}, Q_{50}, Q_{90} \longrightarrow \text{Beta CDF Mixture Fitting} \longrightarrow \text{JSON Serialization} \longrightarrow \text{precomputed\_curves.json}$$

### B. Forensic Trace of the 2026-2 36-Point Fallback Incident
File: `research/precompute.py` (lines 750–761)

1. **Failure Location**: `precompute.py` line 751.
2. **Interface Mismatch (`AttributeError`)**:
   - `precompute.py` called: `preds = predictor_g.predict_quantiles(X_inf)`
   - However, `CutoffPredictor` in `cut_predictor.py` implemented `.predict_cutoff(X_inf)` and lacked `.predict_quantiles()`.
3. **Exception Capture**:
   - The resulting `AttributeError` was caught by a generic fallback block:
     ```python
     except Exception:
         q10_p, median_p, q90_p = s.q10, s.median_cutoff, s.q90
     ```
4. **Fallback Value Source**: `s.median_cutoff` (the multi-year historical section cutoff average from `mileage_history.db`).
5. **Why 36.0 Medians Appeared**: For historical courses that experienced high bids in prior years (2023–2025), `s.median_cutoff` was static 36.0.
6. **Silent Continuation**: The generic `except Exception:` swallowed the error, generated Beta curves anchored at static historical defaults (36.0), and successfully wrote `precomputed_curves.json` without process exit.
7. **Engineering Fix Implemented**:
   - Added native interface inspection: `hasattr(predictor_g, "predict_cutoff")`.
   - Added explicit fallback accounting into `meta` JSON (`meta.fallback_count`, `meta.fallback_pct`).
   - Post-hoc regression check confirmed fallback count dropped to **0.0%** (MAE **1.5822**).

---

## 9. Known Modeling & Optimization Limitations

1. **Synthetic Basket Proxy**: Generated catalog baskets represent structural profile families rather than tracked individual student logs.
2. **Empirical Tie-Break Approximation**: Cutoff tie-breaks use empirical group admission rates $r_i$ at cutoff.
3. **Under-Enrollment Dominance**: Evaluated under a semester regime where 85%+ of courses were under-enrolled.
4. **Single Prospective Semester**: 2026-2 is the only fully prospective semester evaluated to date.
5. **Reduced-Form Predictive Model**: Uses historical feature regression rather than structural game-theoretic equilibrium modeling.

---

## 10. Corrections Needed for Technical Blog

Assessment of 8 statements from current draft blog text:

| Blog Statement | Assessment | Technical Reason & Necessary Correction |
| :--- | :---: | :--- |
| **1. "Q10/Q50/Q90을 이용해 cutoff distribution을 만들었다."** | **대체로 정확하지만 단순화됨** | LightGBM outputs scalar point predictions for $Q_{10}, Q_{50}, Q_{90}$. These 3 points are used to fit a 2-parameter Beta CDF distribution $I_x(\alpha, \beta)$ via L-BFGS-B optimization, rather than defining a closed-form distribution directly. |
| **2. "P_i(m)은 CDF와 유사한 성공확률 곡선이다."** | **정확함** | $P_i(m)$ is explicitly modeled as a mixture model of a Regularized Incomplete Beta CDF $I_{m/36}(\alpha, \beta)$ and historical under-enrollment rate $p_{\text{under}}$, producing a monotonic CDF probability curve. |
| **3. "optimizer는 max Σ w_i P_i(m_i)를 푼다."** | **정확함** | `CourseEntry.expected_utility(m)` calculates $w_i \cdot P_i(m)$, and DP solves $\max \sum_{i=1}^K w_i \cdot P_i(m_i)$ subject to $\sum m_i \le 72$ and $0 \le m_i \le 36$. |
| **4. "문제는 MCKP이고 DP로 exact solution을 구한다."** | **정확함** | The allocation problem is structured as a Multi-Choice Knapsack Problem (MCKP) over integer grid $m_i \in \{0 \dots 36\}$, solved via forward Dynamic Programming over discrete integer budget array `dp[73]`. |
| **5. "Monte Carlo는 optimizer의 위험을 보정한다."** | **부정확함** | Monte Carlo simulation (`MonteCarloSimulator` in `simulator.py`) does **not** feed back into or alter the DP optimizer state. It is a post-processing diagnostic step that evaluates risk metrics (VaR, CVaR, Plan B matrix) of the computed allocation. |
| **6. "36 fallback은 serialization 단계에서 발생했다."** | **부정확함** | The 36.0 fallback did **not** occur inside JSON serialization (`json.dump`). It occurred in `research/precompute.py` line 751 inside an `except Exception:` block triggered by an `AttributeError` on prediction invocation. |
| **7. "fallback은 historical section cutoff를 사용했다."** | **정확함** | When the generic exception handler caught the interface mismatch in `precompute.py`, it substituted `s.median_cutoff` (multi-year historical section cutoff averages from `mileage_history.db`). |
| **8. "production bug는 probability curve를 pessimistic하게 만들었다."** | **정확함** | For courses with high historical cutoffs, `s.median_cutoff` was static 36.0. Substituted into `logistic_prob_curve()`, this generated probability curves where $P(m)$ remained near 0.0 for low/moderate mileages. |

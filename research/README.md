# Yonsei Mileage Research

**Project Status**: `[PROJECT COMPLETE — RESEARCH QUESTIONS ANSWERED]`  
**Repository Branch**: `main`  
**Semester Evaluated**: 2026-2 Prospective Evaluation & Decision Backtest  

---

## 1. Research Question

How should a student allocate a fixed mileage budget across desired courses when admission cutoffs are uncertain?

We formalize the course registration challenge as a **Multi-Choice Knapsack Problem (MCKP)**:

Let $P_i(m)$ be the probability of securing admission to course $i$ given a bid of $m$ mileage points:

$$P_i(m) = P(\text{admission to course } i \mid \text{bid } m)$$

The student solves:

$$\max_{\{m_i\}} \sum_{i=1}^{K} w_i \cdot P_i(m_i)$$

$$\text{subject to } \sum_{i=1}^{K} m_i \le 72, \quad 0 \le m_i \le 36, \quad m_i \in \mathbb{Z}$$

This framework cleanly decouples:
$$\text{Historical Data} \longrightarrow \text{Predictive Cutoff Modeling} \longrightarrow \text{Probability Representation } P_i(m) \longrightarrow \text{DP Knapsack Optimization} \longrightarrow \text{Decision Evaluation}$$

---

## 2. Historical Modeling Architecture

- **Historical Database (`mileage_history.db`)**: Multi-yearYonsei mileage registration data (2,625+ course offerings per semester).
- **Dual LightGBM Quantile Regressors**: Separate quantile models for Major ($Y$) and Non-Major ($N$) groups estimating $Q_{10}, Q_{50}, Q_{90}$ cutoffs.
- **Probability Curve Construction**: Continuous Beta CDF curves fitted to predicted quantiles:
  $$P(m) = p_{\text{under}} + (1 - p_{\text{under}}) \cdot I_{m/36}(\alpha, \beta)$$
- **Exact Discrete Solver**: Dynamic Programming over discrete integer mileage grid $[0 \dots 36]$ with total budget limit $M = 72$.

---

## 3. Historical Validation vs. Prospective Evaluation

- **Historical Holdouts (2023–2025)**: Evaluated model architecture on historical cross-validation splits.
- **2026-2 Prospective Evaluation**: All artifacts, features, and model weights were frozen before 2026-2 outcomes were observed.

### Headline Model Predictive Performance (Population $S$, $N = 2,623$ Sections)

| Model Condition | Information Set | MAE | RMSE | $R^2$ | vs Baseline |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Historical Mean Baseline** | Multi-year historical section mean cutoff | 2.2410 | 4.8821 | 0.0000 | Baseline |
| **2026-2 Prospective LightGBM Model** | Pre-outcome historical demand features (`g_app = hist_avg_app / 4.0`) | **1.5519** | **4.0936** | **0.0683** | **+30.75% Error Reduction** |

---

## 4. Production Artifact Discrepancy Audit

- **Deployed July Artifact (`precomputed_curves.json`)**: MAE **5.6515**.
- **Reconstructed Model Pipeline**: MAE **1.5519**.
- **Forensic Diagnosis**: An `AttributeError` exception in `research/precompute.py` triggered a fallback block that silently substituted static multi-year historical section averages (`s.median_cutoff`, e.g. 36.0) into `precomputed_curves.json` for 100% of sections.
- **Post-Hoc Engineering Fix**: Corrected prediction call interface in `research/precompute.py`. Post-hoc regression check on `research/results/precomputed_curves_posthoc_fix.json` achieved MAE **1.5822**, confirming the engineering failure was removed.
- **Scientific Record**: The original July `precomputed_curves.json` is preserved untouched in `research/archive/frozen_pre_2026_2_precomputed_curves.json` (SHA-256 `dea0002cec993c399d2b6821b41677dd31e7cc63fd17eaf9a5cac8c863c13486`).

---

## 5. Decision Backtest & Policy Evaluation

Evaluated across 886 primary deterministic catalog baskets (Department, Classification, Grade profiles) constructed independently of 2026-2 outcomes:

### Policy Comparison Table (Primary Baskets $N=886$)

| Policy | Identity & Information Set | Mean Regret $R$ | Zero-Regret Rate (%) | Mean Utility Ratio $U(\hat{m})/U(m^*)$ | Mean Secured Credits |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Policy C** | `[PROSPECTIVE DEPLOYED POLICY]` (July `precomputed_curves.json`) | **0.7503** | **43.00%** | **87.44%** | **14.89** / 18.0 |
| **Policy B** | `[COUNTERFACTUAL FALLBACK-CORRECTED]` (Pre-outcome LightGBM) | 0.8506 | 40.97% | 85.74% | 14.72 / 18.0 |
| **Oracle O** | `[EMPIRICAL ORACLE POLICY]` (Realized Empirical Cutoffs $\tilde{Y}_i(m)$) | 0.0000 | 100.00% | 100.00% | 17.08 / 18.0 |

---

## 6. Main Scientific Finding: Prediction Accuracy $\neq$ Decision Quality

**Key Finding**: Cutoff prediction MAE was not a monotonic proxy for decision quality.

Despite `precomputed_curves.json` having a prediction MAE of **5.65** (vs **1.55** for Policy B), Policy C achieved **87.44% of Oracle utility** vs **85.74%** for Policy B.

### Underlying Mechanism:
1. **High Under-Enrollment Regime**: In 2026-2, 85.22% of courses were under-enrolled (actual cutoff = 1.0).
2. **Knapsack Buffer Effect**: Policy C's pessimistic fallbacks led the DP optimizer to allocate minimal 1-point bids to under-enrolled courses while concentrating budget (12 pts) onto competitive courses. Because minimal bids succeeded 100% of the time on under-enrolled courses, Policy C won competitive courses *and* secured under-enrolled courses simultaneously.
3. **Competitive Boundaries**: Prediction accuracy mattered more near tight decision boundaries. In the secondary post-outcome competition-stratified analysis (N = 30 baskets), Policy B achieved a 60.0% zero-regret rate compared with 33.33% for Policy C.

---

## 7. Limitations

1. **Synthetic Basket Proxy**: Generated catalog baskets represent structural profile families, not tracked individual student logs.
2. **Empirical Tie-Break Approximation**: Cutoff tie-breaks use empirical group admission rates $r_i = \text{success\_bids}/\text{total\_bids}$ at cutoff.
3. **Under-Enrollment Dominance**: Evaluated under a semester regime where 85%+ of courses were under-enrolled.
4. **Single Prospective Semester**: 2026-2 is the only fully prospective semester evaluated to date.

---

## 8. Research Directory Artifact Index

- **Phase A Prospective Evaluation Report**: [`research/2026_2_prospective_prediction_report.md`](2026_2_prospective_prediction_report.md)
- **Discrepancy Audit Report**: [`research/2026_2_artifact_discrepancy_report.md`](2026_2_artifact_discrepancy_report.md)
- **Phase B Decision Backtest Report**: [`research/2026_2_decision_backtest_report.md`](2026_2_decision_backtest_report.md)
- **Policy Mechanism Analysis Report**: [`research/2026_2_policy_mechanism_analysis.md`](2026_2_policy_mechanism_analysis.md)
- **Artifact Integrity Test Suite**: [`research/test_artifact_integrity.py`](test_artifact_integrity.py)
- **Archived July Production Artifact**: [`research/archive/frozen_pre_2026_2_precomputed_curves.json`](archive/frozen_pre_2026_2_precomputed_curves.json)

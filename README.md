# Yonsei Mileage — Decision Support System for Course Registration

> **A decision-support and optimization system for allocating a fixed mileage budget across uncertain course registration outcomes at Yonsei University.**

---

## Architecture & System Overview

The Yonsei Mileage system addresses the multi-course registration problem where students must distribute a fixed budget of **72 integer mileage points** across desired courses without knowing future admission cutoffs.

```
┌───────────────────────────┐      ┌───────────────────────────┐      ┌───────────────────────────┐
│ Historical Mileage Data   │ ───► │ Dual LightGBM Regressors  │ ───► │ Continuous Probability    │
│ (2,625+ Sections / Sem)   │      │ (Quantile Q10, Q50, Q90)  │      │ Curve Representation P(m) │
└───────────────────────────┘      └───────────────────────────┘      └───────────────────────────┘
                                                                                    │
┌───────────────────────────┐      ┌───────────────────────────┐                    │
│ Realized Decision Quality │ ◄─── │ Discrete MCKP Optimizer   │ ◄──────────────────┘
│ (Empirical Oracle Replay) │      │ (Dynamic Programming)     │
└───────────────────────────┘      └───────────────────────────┘
```

### Mathematical Formulation

The core allocation engine formulates course registration as a **Multi-Choice Knapsack Problem (MCKP)**:

Let $P_i(m_i)$ be the acceptance probability curve for course $i$ given bid $m_i$:

$$\max_{\{m_i\}} \sum_{i=1}^{K} w_i \cdot P_i(m_i)$$

$$\text{subject to } \sum_{i=1}^{K} m_i \le 72, \quad 0 \le m_i \le 36, \quad m_i \in \mathbb{Z}$$

where $w_i > 0$ represents user priority weights, solved via integer Dynamic Programming over `dp[73]`.

---

## Prospective 2026-2 Research Validation Results

The frozen prediction and decision pipeline was prospectively evaluated on the newly observed 2026-2 semester outcomes:

| Evaluation Metric / Benchmark | Result |
| :--- | ---: |
| Historical-mean baseline MAE | 2.2410 |
| **2026-2 prospective model MAE** | **1.5519** |
| Original deployed artifact MAE | 5.6515 |
| **Deployed policy / empirical-oracle utility** | **87.44%** |
| **Primary baskets with identical Policy B/C utility** | **74.94%** |

### Key Scientific Insights

1. **Predictive Accuracy (+30.75% Error Reduction)**:
   The frozen pre-outcome LightGBM model pipeline achieved an MAE of **1.5519** on 2026-2 offerings, outperforming the historical mean baseline (MAE 2.2410) by **+30.75%**.
2. **Production Artifact Discrepancy Audit**:
   The original July deployed artifact (`precomputed_curves.json`) achieved MAE 5.6515. A forensic audit traced this gap to an offline exception fallback in `research/precompute.py` that overwrote model predictions with static historical section cutoffs. This original artifact is preserved untouched in `research/archive/frozen_pre_2026_2_precomputed_curves.json` as part of the scientific record.
3. **Prediction Error vs. Decision Quality Uncoupling**:
   Despite prediction MAE degradation (5.65 vs 1.55), the deployed policy achieved **87.44% of theoretical Oracle performance** across 886 primary pre-outcome catalog baskets. The Dynamic Programming optimizer's budget allocation structure buffered prediction errors on uncompetitive offerings.

---

## Product Features & Web Interface

- **Timetable Search & Visual Calendar**: Interactive schedule builder with real-time course overlap detection.
- **Historical Competition Analytics**: Detailed bid history breakdown by major status, grade level, and year quotas.
- **Automated Mileage Optimizer**: One-click MCKP solver generating optimal mileage allocation strategies and efficient frontiers.
- **Risk Analysis & Simulation**: Risk report detailing acceptance probabilities, marginal utility, and fallback alternatives.

---

## Repository Structure

```
.
├── api/                        # Vercel Serverless API routes & MCKP Optimizer
│   ├── index.py                # Main backend router
│   └── optimizer.py            # Dynamic Programming knapsack solver
├── models/                     # Cutoff regressor models
│   └── cut_predictor.py        # LightGBM quantile predictor (Q10, Q50, Q90)
├── research/                   # Complete scientific research pipeline
│   ├── README.md               # Detailed research workflow & scientific findings
│   ├── evaluate_2026_2.py      # Phase A prospective prediction evaluator
│   ├── audit_production_discrepancy_2026_2.py  # Forensic discrepancy audit
│   ├── decision_backtest_2026_2.py             # Phase B decision backtest engine
│   ├── analyze_policy_c_vs_b_mechanism.py      # Policy mechanism diagnostic analyzer
│   ├── test_artifact_integrity.py              # Automated artifact integrity test suite
│   ├── archive/                # Frozen scientific artifacts (July precomputed_curves.json)
│   └── results/                # Evaluation metrics JSONs and reports
├── mileage_history.db          # SQLite database containing historical mileage records
└── precomputed_curves.json     # Frozen July production precomputed curves
```

---

## AI Assistance Disclosure

Implementation was substantially AI-assisted; primary work centered on problem formulation, statistical modeling choices, prospective validation design, optimization formulation, failure forensic analysis, and system architecture.

---

## License

MIT License

# Portfolio Case Study: Yonsei Mileage Decision-Support System

## Executive Overview

**Yonsei Mileage** is an agentic decision-support and optimization system designed to solve the course registration challenge under uncertainty and budget constraints at Yonsei University.

Students face the challenge of distributing a fixed budget of **72 integer mileage points** across desired courses without knowing future admission cutoffs.

---

## System Architecture & Mathematical Formulation

The system formulates registration as a **Multi-Choice Knapsack Problem (MCKP)**:

Let $P_i(m_i)$ be the continuous acceptance probability curve for course $i$ given a bid of $m_i$ mileage points:

$$\max_{\{m_i\}} \sum_{i=1}^{K} w_i \cdot P_i(m_i)$$

$$\text{subject to } \sum_{i=1}^{K} m_i \le 72, \quad 0 \le m_i \le 36, \quad m_i \in \mathbb{Z}$$

where $w_i > 0$ represents user priority weights, solved via integer Dynamic Programming over `dp[73]`.

---

## Prospective 2026-2 Validation & Research Findings

All predictive models and decision pipelines were frozen before 2026-2 registration outcomes were observed.

### Key Validation Metrics

| Metric / Benchmark | Value |
| :--- | ---: |
| Historical-mean baseline MAE | 2.2410 |
| **2026-2 prospective model MAE** | **1.5519** |
| Original deployed artifact MAE | 5.6515 |
| **Deployed policy / empirical-oracle utility ratio** | **87.44%** |
| **Primary baskets with identical Policy B/C utility** | **74.94%** |

### 1. Prospective Predictive Power
The frozen pre-outcome LightGBM quantile regression model achieved an MAE of **1.5519** on 2026-2 offerings, outperforming the historical mean baseline (MAE 2.2410) by **+30.75%**.

### 2. Forensic Deployment Audit
The original July deployed artifact (`precomputed_curves.json`) yielded MAE 5.6515. A forensic audit traced this gap to an offline exception fallback in `research/precompute.py` that overwrote LightGBM predictions with static historical section cutoffs. The original artifact is preserved untouched as part of the scientific record.

### 3. Prediction Error vs. Decision Quality Uncoupling
Across 886 primary deterministic catalog baskets:
- **87.44% Oracle Utility**: Deployed Policy C achieved 87.44% of theoretical Oracle performance.
- **43.0% Zero-Regret Rate**: In 43.0% of catalog baskets, Policy C achieved 100% perfect allocation equal to the Oracle.
- **Decision Robustness**: In 74.94% of baskets, realized utility was identical between Policy B and Policy C. The Dynamic Programming optimizer's budget reallocation mechanism buffered prediction errors on uncompetitive offerings.

---

## Main Takeaway

> **Better prediction accuracy did not monotonically imply better decision quality.**  
> Prediction errors mattered most near tight competitive decision boundaries, while many large numerical errors were decision-irrelevant under widespread course under-enrollment.

---

## Project Role & AI-Assistance Disclosure

Implementation was substantially AI-assisted; primary work centered on:
- Problem formulation and mathematical modeling
- Statistical modeling choices and dual LightGBM quantile architecture
- Experimental design and prospective validation methodology
- Constrained optimization formulation (MCKP DP solver)
- Failure forensic analysis and diagnostic decomposition
- System architecture and portfolio documentation

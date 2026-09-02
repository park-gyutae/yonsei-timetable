# Forensic Artifact Discrepancy Analysis: CNT2109-01 Cutoff Prediction

**Document Date**: 2026-09-03  
**Target Course Section**: `CNT2109-01` (Advanced Network & Systems)  
**Investigation Purpose**: Technical forensic investigation of the prediction discrepancy between the production web application and the research post-hoc fix artifact.

---

## 1. Executive Summary

The production web application currently displays $Q_{10} = 36.0$, $Q_{50} = 36.0$, $Q_{90} = 36.0$ for `CNT2109-01`, whereas the research post-hoc fix pipeline yields $Q_{10} = 1.00$, $Q_{50} = 4.24$, $Q_{90} = 35.35$.

Forensic code tracing confirms that the production web application (`app.js:L555`) fetches `/precomputed_curves.json` directly from the repository root. This root file is the original July 10, 2026 production artifact, which suffered from an unhandled `AttributeError` exception in `research/precompute.py` during offline precomputation. This bug caused LightGBM predictions to fail silently and fall back to multi-year historical section averages (`s.median_cutoff = 36.0`).

Per scientific freeze directives, the root `precomputed_curves.json` was preserved in its un-fixed state to maintain scientific evaluation integrity. Therefore, the production web application is currently serving the **known broken July artifact**.

---

## 2. Production Artifact Specification

* **Loaded File**: `precomputed_curves.json` (Repository root)
* **Frontend Data Loader**: `app.js` line 555 (`const res = await fetch('/precomputed_curves.json');`)
* **File Creation Timestamp**: `2026-07-10T02:05:12.238236`
* **Engine Version Metadata**: `1.4 (Dual-Model Grade-Specific Pipeline)`
* **SHA-256 Checksum**: `dea0002cec993c399d2b6821b41677dd31e7cc63fd17eaf9a5cac8c863c13486` (Identical to `research/archive/frozen_pre_2026_2_precomputed_curves.json`)
* **Total Sections**: 3,136
* **Fallback Accounting in Metadata**: None (untracked in version 1.4)

---

## 3. Research Fixed Artifact Specification

* **File Location**: `research/results/precomputed_curves_posthoc_fix.json`
* **Generation Script**: `research/precompute.py` (via `NativeLightGBMCutoffPredictor` / `predict_cutoff` interface fix)
* **File Creation Timestamp**: `2026-09-03T04:14:24.624382`
* **Engine Version Metadata**: `1.5 (Post-Hoc Engineering Fix Pipeline)`
* **Total Sections**: 3,187
* **Fallback Accounting in Metadata**:
  - `total_quantile_predictions`: 25,496
  - `successful_model_predictions`: 25,496
  - `fallback_count`: 0
  - `fallback_pct`: 0.0%

---

## 4. CNT2109-01 Direct Comparison

| Metric / Parameter | Production Web App Artifact (`precomputed_curves.json`) | Research Post-Hoc Fixed Artifact (`precomputed_curves_posthoc_fix.json`) |
| :--- | :---: | :---: |
| **Artifact Generated At** | `2026-07-10T02:05:12` | `2026-09-03T04:14:24` |
| **Engine Version** | `1.4` (Broken Fallback) | `1.5` (Corrected Interface) |
| **$Q_{10}$ Quantile** | **36.00** | **1.00** |
| **$Q_{50}$ (Median)** | **36.00** | **4.24** |
| **$Q_{90}$ Quantile** | **36.00** | **35.35** |
| **Under-enrollment $p_{\text{under}}$** | 0.0000 | 0.0000 |
| **$P(m=0)$** | 0.0000 | 0.0000 |
| **$P(m=1)$** | **0.0000** | **0.1000** |
| **$P(m=5)$** | **0.0000** | **0.5765** |
| **$P(m=10)$** | **0.0000** | **0.8826** |
| **$P(m=15)$** | **0.0000** | **0.9774** |
| **$P(m=20)$** | **0.0000** | **0.9974** |
| **$P(m=36)$** | **1.0000** | **1.0000** |

---

## 5. Artifact Provenance

1. **Root `precomputed_curves.json`**:
   Generated on July 10, 2026 during the initial precomputation run prior to observing 2026-2 outcomes. It was deployed directly to the web application root.
2. **Archived `research/archive/frozen_pre_2026_2_precomputed_curves.json`**:
   Created during project closure by copying the exact July root `precomputed_curves.json`. Verified SHA-256 match guarantees zero modification.
3. **Research `research/results/precomputed_curves_posthoc_fix.json`**:
   Generated on September 3, 2026 after fixing the predictor call interface in `research/precompute.py`. This file lives inside `research/results/` and has **not** been copied over root `precomputed_curves.json`.

---

## 6. Root Cause Forensic Trace

The discrepancy between the two artifacts stems from the following execution path:

```
[July 10 Precomputation Run]
  └── precompute.py L751: predictor_g.predict_quantiles(X_inf)
        └── Raises AttributeError: CutoffPredictor has no attribute 'predict_quantiles'
              └── Caught by `except Exception:` (L759)
                    └── Assigns q10_p, median_p, q90_p = s.q10, s.median_cutoff, s.q90
                          └── For CNT2109-01, s.median_cutoff in DB was 36.0
                                └── logistic_prob_curve() generates P(m<36)=0.0, P(36)=1.0
                                      └── Serialized into root precomputed_curves.json
```

---

## 7. Relation to Known Fallback Bug

This discrepancy is **100% directly caused by the known fallback bug**.

- The `AttributeError` caused the precompute pipeline to bypass LightGBM model inference completely.
- `s.median_cutoff` for `CNT2109-01` in `mileage_history.db` was 36.0 (reflecting historical high-bidding semesters in 2023–2025).
- In the fixed engine (v1.5), `predict_cutoff` successfully runs LightGBM quantile models, producing the true predicted median cutoff of **4.24**.

---

## 8. Whether the Technical Blog Needs Correction

**YES**. The blog draft requires precise technical distinction:

- **Incorrect Draft Claim**: "In the live production web app, CNT2109-01 shows AI prediction $Q_{10}=1.00, Q_{50}=4.24, Q_{90}=35.35$."
- **Technically Accurate Formulation**:
  > "In the actual July production deployment, `CNT2109-01` displayed $Q_{10}=36, Q_{50}=36, Q_{90}=36$ because of an unhandled offline precomputation fallback bug. When the predictor interface is corrected, the pre-outcome LightGBM model predicts $Q_{10}=1.00, Q_{50}=4.24, Q_{90}=35.35$, yielding a continuous $P(m)$ curve where $P(1)=0.1000, P(5)=0.5765, P(10)=0.8826$."

---

## 9. Recommended Action

1. **Keep Production Root Intact during Research Freeze**: Preserve root `precomputed_curves.json` until final deployment sign-off to maintain scientific auditability.
2. **Blog Text Alignment**: Update blog copy to explicitly cite the July deployment fallback behavior versus the corrected model predictions.
3. **Post-Closure Production Update**: After research closure, replace root `precomputed_curves.json` with `research/results/precomputed_curves_posthoc_fix.json` if live web deployment updates are requested by the user.

---

### Final Classification Conclusion

**B. production이 known broken artifact를 사용 중**  
*(Production is currently serving the original July 10, 2026 artifact which contains the unhandled `AttributeError` fallback values).*

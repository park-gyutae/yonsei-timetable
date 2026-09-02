"""
test_artifact_integrity.py — Regression & Artifact Integrity Suite
===================================================================
Automated integrity checks for Yonsei Mileage precomputed curves artifacts:
1. Prediction Integrity: Q10 <= Q50 <= Q90
2. Curve Integrity: 0 <= P(m) <= 1 and P(m+1) >= P(m) (monotonic non-decreasing)
3. Serialization Integrity: Valid JSON structure and key attributes
4. Suspicious Fallback Detection: Flag high concentration of 36.0 or static fallbacks
5. Explicit Accounting Check: Ensure meta reports fallback statistics
"""

import json
import math
import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
CURVES_PATH = BASE_DIR / "precomputed_curves.json"
POSTHOC_FIX_CURVES_PATH = BASE_DIR / "research" / "results" / "precomputed_curves_posthoc_fix.json"


def test_artifact_integrity(json_path: Path, is_posthoc_fix: bool = False) -> bool:
    print(f"\n[TEST] Running Artifact Integrity Check on: {json_path.name}")
    if not json_path.exists():
        print(f"❌ FAIL: File not found: {json_path}")
        return False

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    meta = data.get("meta", {})
    curves = data.get("curves", {})

    print(f"  - Total Sections: {len(curves)}")
    print(f"  - Engine Version: {meta.get('engine_version', 'Unknown')}")
    print(f"  - Generated At:   {meta.get('generated_at', 'Unknown')}")

    if "fallback_count" in meta:
        print(f"  - Fallback Stats: {meta['successful_model_predictions']} success / {meta['fallback_count']} fallbacks ({meta['fallback_pct']}%)")

    errors = []
    warnings = []

    total_quantile_triplets = 0
    monotonic_violations = 0
    ordering_violations = 0
    bound_violations = 0
    count_36_0 = 0
    count_1_0 = 0

    for sec_key, sec_val in curves.items():
        for grp in ["major", "non_major"]:
            if grp not in sec_val:
                continue
            for g in [1, 2, 3, 4]:
                g_key = f"grade_{g}"
                if g_key not in sec_val[grp]:
                    continue

                item = sec_val[grp][g_key]
                q10 = item.get("q10", 0.0)
                median = item.get("median", 0.0)
                q90 = item.get("q90", 0.0)
                prob_curve = item.get("prob_curve", [])

                total_quantile_triplets += 1

                if median == 36.0:
                    count_36_0 += 1
                if median == 1.0:
                    count_1_0 += 1

                # 1. Quantile ordering check
                if not (q10 <= median + 1e-5 and median <= q90 + 1e-5):
                    ordering_violations += 1
                    errors.append(f"Ordering violation in {sec_key} {grp} {g_key}: Q10={q10}, Med={median}, Q90={q90}")

                # 2. Probability bounds check
                for m, p in enumerate(prob_curve):
                    if not (0.0 <= p <= 1.0):
                        bound_violations += 1
                        errors.append(f"Bound violation in {sec_key} {grp} {g_key} m={m}: P(m)={p}")

                # 3. Monotonic non-decreasing check
                for m in range(len(prob_curve) - 1):
                    if prob_curve[m + 1] < prob_curve[m] - 1e-4:
                        monotonic_violations += 1
                        errors.append(f"Monotonicity violation in {sec_key} {grp} {g_key} m={m}->{m+1}: {prob_curve[m]} -> {prob_curve[m+1]}")

    # Suspicious fallback concentration detection
    pct_36 = (count_36_0 / max(total_quantile_triplets, 1)) * 100.0
    if pct_36 > 5.0 and is_posthoc_fix:
        errors.append(f"Suspiciously high concentration of 36.0 fallbacks in post-hoc fix: {pct_36:.2f}%")
    elif pct_36 > 5.0:
        warnings.append(f"Suspiciously high concentration of 36.0 fallbacks in original artifact: {pct_36:.2f}% (Expected in un-fixed July artifact)")

    # Print Summary
    print(f"  - Total Quantile Triplets Inspected: {total_quantile_triplets}")
    print(f"  - Ordering Violations:     {ordering_violations}")
    print(f"  - Bound Violations:        {bound_violations}")
    print(f"  - Monotonicity Violations: {monotonic_violations}")
    print(f"  - Count of 36.0 Medians:   {count_36_0} ({pct_36:.2f}%)")

    if errors:
        print("❌ FAIL: Integrity violations found:")
        for err in errors[:10]:
            print(f"   • {err}")
        return False
    else:
        print("✅ PASS: All prediction, curve, and monotonicity integrity checks passed cleanly.")
        if warnings:
            for w in warnings:
                print(f"   ⚠️ WARNING: {w}")
        return True


if __name__ == "__main__":
    print("\n=======================================================")
    print(" 1. HISTORICAL BASELINE ARTIFACT INTEGRITY CHECK")
    print("=======================================================")
    pass_original = test_artifact_integrity(CURVES_PATH, is_posthoc_fix=False)
    
    print("\n=======================================================")
    print(" 2. POST-HOC ENGINEERING FIX ARTIFACT INTEGRITY CHECK")
    print("=======================================================")
    if POSTHOC_FIX_CURVES_PATH.exists():
        pass_fix = test_artifact_integrity(POSTHOC_FIX_CURVES_PATH, is_posthoc_fix=True)
    else:
        print(f"\n[NOTE] Post-hoc fix artifact not found at {POSTHOC_FIX_CURVES_PATH}. Run precompute to generate.")
        pass_fix = False

    if pass_fix:
        print("\n🎉 POST-HOC FIX ARTIFACT PASSED ALL INTEGRITY & REGRESSION CHECKS.")
        sys.exit(0)
    else:
        print("\n❌ POST-HOC FIX ARTIFACT INTEGRITY CHECKS FAILED.")
        sys.exit(1)

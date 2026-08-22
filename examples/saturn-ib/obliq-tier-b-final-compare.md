# final.json comparison (Phase 1/2 hard gate)

**Date:** 2026-08-19 (post Rot + First-Phase τ1_eff)  
**Reference:** `reference-1000s-final.json`  
**Model:** last finite from Obliq 1000 s @ **t≈810** (end-of-run NaN)

- Relative tol: **0.50%**
- Result: **FAIL** (fail=14, events 5/5 ok)

| Field | Ref | Model @810 | \|Δ\|/\|ref\| | Status |
|-------|-----|------------|-----------|--------|
| s2_h_m | 1.973e5 | 4.076e4 | 0.794 | FAIL |
| s2_Ve_y_mps | −7641 | **+7066** | 1.92 | FAIL |
| s2_Xe_y_m | −1.222e6 | 1.573e6 | 2.29 | FAIL |
| Events (5) | true | true | — | ok |

Artifacts: `/tmp/igm-matched/obliq-1000-*.json`, `igm-obliq-1000.csv`.

## Context vs isolated IGM

| Check | Result |
|-------|--------|
| Matched-input `Chi_Y` @ t=492.8 | **~0.02%** vs RTW (algebra OK) |
| Live dual harness Chi after enable | **still large** (mean \|dChi\| ~100°) |
| Live `L_y` @ enable | **much closer** (~5688 vs 5660) |
| Full trajectory | **worse** than prior tip[15,30] baseline (~h−4%); NaN ~810 |

Live miss is **not** the same as the old A_m / wrong-Rot bugs: isolated IGM matches when XS/VS/G/τ are frozen. Remaining drivers are live nav/XS, MF→τ1_eff vs RTW accel-filter RateLimiter, and closed-loop tip/FCC coupling once Chi diverges.

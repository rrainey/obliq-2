# Obliq Saturn-IB Tier B campaign status

**Date:** 2026-08-19  
**Goal:** `final.json` ≤ **0.5%** vs `reference-1000s-final.json` (MDL-first IGM).  
**Live plant:** Wave C pitch Ψ + tip `[15,30]` + **SMC off** + cut@T3≤5 / χ-freeze@5 + **G_S→Product15** (regen).

## Where we are (2026-08-19 evening)

| Check | Result |
|-------|--------|
| Isolated matched-input `Chi_Y` | **~0.02%** vs RTW @ t=492.8 |
| Fixes in plant | G_S, APᵀ, Rot_Y(−φ), First-Phase `τ1=RL(MF)·V_ex1` |
| Live dual IGM harness | `L_y` OK-ish; **Chi_Y still ~100° mean error** after enable |
| Full 1000 s vs ref | **FAIL**; last finite **t≈810**, h~41 km (worse than prior −4% baseline) |

**Prior best end-state** (pre–algebra fixes, tip[15,30]): h ~−4…−7%, Ve_y ~−12%.  
Isolated IGM is fixed; **live stack still loses** on nav/XS + MF filter vs RTW accel RateLimiter + closed-loop.

Report: `obliq-tier-b-final-compare.md`. Plan: `IGM_MATCHED_INPUT_PLAN.md`.

## Waves completed

| Wave | Scope | Outcome |
|------|--------|---------|
| **A** | δT ZOH; First Phase→Phase2; Add8 / Product15 Chi; T3 enable | Live Chi_Y/Z from S420 path |
| **B** | Art-τ; tip-band; cut@HSL; SMCY+SMCZ algebra | Tip `[15,30]`; SMC regresses Ve_y → **bypassed** |
| **C** | Chi→Ψ→FCC pitch; leave tip as fallback | Pitch OK via Θ_P=`elev_meas−90`; yaw closed-loop parked |

Constants of record (`as205Igm.ts`):

- `IGM_SMC_ENABLE = false`
- `IGM_TIP_ELEV_MIN/MAX_DEG = 15 / 30`
- `IGM_CHI_RATE_FREEZE_T3_S = 5` (RTW 15 deferred)
- Plant cut uses `IGM_T_HSL_S = 5` (RTW `IGM_CUTOFF_TGO_S = 0.04` deferred)

## Sweeps that did **not** beat the baseline

| Experiment | Result |
|------------|--------|
| Tip max 30.5 / 32 | Lofted; Ve_y worse |
| freeze@15 + cut@0.04 | Theta→85° tumble |
| freeze@5 + cut@0.04 | Extra burn collapsed Ve_y |
| Yaw: Euler Ψ + Chi_Z | NaN ~t557 |
| Yaw: raw `asin(Xb_y)` + Chi_Z | NaN; **Chi_Z = sat(asin,±45)** mismatch |
| Yaw: sat(asin)±45 + Kp_yaw=2 | Still NaN ~t692; Ve_y flips at IGM on |

## Open gates to ≤0.5%

1. **SMC ΔV fidelity** — V_S ZOH×0.625 ≠ RTW PIPA/Gain3; keep behind `IGM_SMC_ENABLE` until Tier B improves with flag on.
2. **Yaw / Chi_Z** — need H-1 yaw polarity + gated Chi_Z; offline: `chi-z-yaw-diagnose.csv`, `igm-chi-z-yaw-proxy.test.ts`.
3. **Late cutoff** — restore RTW 0.04 only when late Chi/Ψ window is stable.
4. **Navigation / gravity** — point-mass G_S; Xe packing vs ECEF; BodyToSM export vs ST-124.
5. **Lateral state** — `Xe_y` / `Ve_z` dominate remaining error budget.

## Key files

| Path | Role |
|------|------|
| `saturnIbObliqPlant.ts` | Nested plant + Chi→Ψ pitch FCC |
| `lvdcIgmPhase0.ts` / `igmProduct15Obliq.ts` / `igmSmcyObliq.ts` | LVDC IGM |
| `igmChiToPsi.ts` | MDL Chi→Ψ algebra |
| `LVDC_SFRAME_IGM_INVENTORY.md` | MDL inventory |
| `APOLLO_OBLIQ_GAP_MATRIX.md` | Gap matrix |
| `scripts/regen-saturnib-obliq-plant.sh` | Plant regen → viper |

## Done this pass

1. **This status doc**
2. **SMC ΔV:** `as_zoh` Gain3 wired; enable trial → Ve_y−29% (worse). Keep `IGM_SMC_ENABLE=false`. Need PIPA/specific-force, not thrust-only A_m.
3. **H-1 yaw polarity probe:** `H1_YAW_POLARITY_PROBE.md` + engines test — β_Y>0 ⇒ Mz<0 ⇒ future map `β_Y = +Kp·Ψ_Y` (not −Kp)

## Dual harness (batch-sim)

IGM Layer-1 trace lives in **viper/batch-sim** (primary):

- Schema: `igm_trace.h` / `igm_trace.c`
- CLI: `--igm-trace PATH [--igm-trace-dt 1.6]`
- Fill: `SaturnIBStack::FillIgmTrace` (RTW B/DWork + Obliq plant signals)
- Compare: `batch-sim/scripts/compare_igm_trace.py`

Use this before further tip/SMC/cutoff knobs — separates conversion from plant.

### Dual-trace findings (1000 s)

Report: `viper/batch-sim/igm-compare-1000.md`

| Item | Status |
|------|--------|
| Harness | Works both backends @ 1.6 s |
| **T1 countdown** | **Matches RTW** through First Phase (e.g. 278.9 @ t=500) |
| `igm_enable` | Fixed fill to use `igm_enable_gate` (was wrongly `nIGMMode≥1`) |
| Chi hold when IGM off | **Done** — Obliq Chi=0 pre-enable; RTW has Time-Tilt Chi (~−61) |
| Enable mismatches | 16 samples, late only (cutoff ~896: RTW cuts earlier) |
| **Chi_Y while enabled** | **Large miss** — RTW ~−55…−100°, Obliq ~+80…+170° then swings |
| T3 Phase2 countdown | Obliq lags (e.g. @900 RTW T3=0 / Obliq 25) |
| XS/VS/A | Large (plant/nav / accel-quant vs A_m) |

**Chi divergence (narrowed):** see `viper/batch-sim/IGM_CHI_DIVERGENCE.md`

1. ~~Missing APᵀ before Product15~~ — **fixed** (sign)
1b. ~~ΔV/S420 used A_m instead of G_S~~ — **fixed + regenerated into full plant**
2. **Still open after G_S:** at t≈500 RTW `chi_a≈0.42` / Chi_Y≈−54°; Obliq `chi_a≈−0.05` / Chi_Y≈−105°; `phi_T` off (~−1.555 vs −1.466)
3. **Gain1_h ≈ −2.7e4** at enable → T3_eff negative → `T_3_i_eff_pos` clamps to 0
4. Rate runaway ~t528 (cmd → tens of rad) — secondary to bad ΔV/φ
5. Pre-IGM: RTW Time-Tilt Chi vs Obliq hold 0 (known gap)

## Still open

- MDL block-map **φ_T / Product9–10 / ΔV** until `chi_a` matches RTW (not tip/SMC knobs)
- Point-mass vs `<S425>` J2+ G_S residual after φ/ΔV parity
- True PIPA/specific-force for SMC; yaw +Kp; cutoff 0.04; Xe packing

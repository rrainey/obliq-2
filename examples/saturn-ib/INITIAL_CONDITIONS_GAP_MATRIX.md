# Initial Conditions — MDL ↔ Obliq gap matrix

**Date:** 2026-08-19  
**Goal:** Same discipline as IGM matched-input: isolate `Initial Conditions` (`<S5>`), compare **block outputs**, then fix translation errors — do **not** chase live VS_y / tip until IC outports match.

## Why pause live tip / VS_y

Live padroll probe showed Obliq tip into **−Y_S** while RTW tips **+Z_S**. That can be guidance, DCM, *or* a bad pad IC / epoch. Piecemeal flight fixes without IC parity burn time (same lesson as IGM Transpose / Rot_Y / τ1).

## MDL subsystem (`saturn_ib_stack` / `<S5>`)

| Item | MDL |
|------|-----|
| Path | `Saturn_IB_Stack/Initial Conditions` |
| Ports | **In 3** / **Out 6** |
| Inports | `Launch Date`, `A_z_deg`, `CG_LLA_deg_m` |
| Outports | `theta_GMST_0_deg`, `ST124M_DCM`, `q_ECI_0`, `Xe_0_m`, `Vb_0_mps`, `V_ECI_0_mps` |

### Child chain (algebra that matters)

| Block / group | Role |
|---------------|------|
| `Date to JD` → `T to GMST` | Epoch → θ_GMST |
| `MES Transform` | Θ_E = λ_L + GMST; builds **MES** (Az=`A_z`) |
| `L/V Inertial Orientation` | **LVInert** = same Fcn as MES with **Az=100°** (Position 1) |
| `Initial Position and Velocity (Eqns. 3.4.3-4)` | `R_S_0`, `V_S_0` from R_L, A_z, φ, φ′ |
| `LLA to ECF` | WGS-84 geodetic → ECEF `r` |
| `Euler→DCM` + Earth rotation | Align ECEF→ECI at epoch (`Unary Minus` on GMST path) |
| `Product` | `Xe_0 = DCM_ECI←ECEF · r_ECEF` |
| `ω_E × r` → `Product1` | `V_ECI_0`; `Vb_0 = LIO · V_ECI` |
| `DCM→Quaternion` | `q_ECI_0` from **LIO** (trace/If Positive/Negative) |
| `To File` / Workspace | `saturn-MES-frame.mat`, `saturn-Launch-frame.mat` (MEL) |

RTW defaults (host): **LaunchDate = 1968-10-11 14:57:45**, `Position 1 Azimuth = 100°`, `A_z = 82.82°`.

## Obliq today (`buildInitialConditionsSubsystem`)

| Item | Obliq |
|------|-------|
| Sheet | Named children are **stubs** (`Date to JD`, `MES Transform`, `L/V Inertial Orientation`, Eqns 3.4, …) |
| Live data | Four **baked constants**: `r0_E`, `v0_b`, `q0_bE`, `MES_E_to_S` from `as205DefaultPadStateEci()` |
| Algebra home | TS helpers at **model-build** time — not a wired MDL-faithful subsystem |

Helpers:

| Helper | Covers |
|--------|--------|
| `as205InitialPosition.ts` | Eqns 3.4 `R_S`, `V_S` |
| `as205Mes.ts` | Date→JD, GMST, MES Fcn 11..33 |
| `as205EciPlant.ts` | `r_E=MESᵀ R_S`, LIO Az=`pad_roll`, `q=dcm(LIOᵀ)`, `v_b=LIO·v_E` |
| `as205PadFrames.ts` | Site + `pad_roll_L_deg=100` |

## Gap table

| # | MDL out / intermediate | Obliq | Status |
|---|------------------------|-------|--------|
| IC0 | **LaunchDate epoch** | `AS205_DEFAULT_LAUNCH_DATE` now **14:57:45** (= RTW) | **FIXED** (was 15:02:45; Δt=5 min → ~1.25° Θ_E) |
| IC1 | `theta_GMST_0_deg` | Computed inside `as205Mes` only; not an IC outport | Not exported / not compared |
| IC2 | `ST124M_DCM` / MES | Baked `MES` from default LaunchDate | Needs numeric match to RTW To File / B→MES |
| IC3 | `Xe_0_m` | Path A: `MESᵀ·R_S` vs Path B: LLA→WGS-84→ECI | **Dual-path (no choice yet):** ‖ΔXe‖ ≈ **57.5 m** @ RTW epoch — see below |
| IC4 | `V_ECI_0_mps` | Path A: `MESᵀ·V_S` vs Path B: `ω_E × Xe_0` | ‖ΔV‖ ≈ **3.7 mm/s** |
| IC5 | `Vb_0_mps` | Both: `LIO · V_ECI` (Az=100) | ‖ΔVb‖ ≈ **3.7 mm/s** |
| IC6 | `q_ECI_0` | Both: `dcmToQuat(LIOᵀ)` | **‖Δq‖ = 0** (same LIO) |

### Dual-path numeric gate (2026-08-19; RTW dump confirmed 2026-08-21)

Script: `npx tsx scripts/ic-dual-path-compare.ts` → `/tmp/ic-matched/ic-dual-path.json`  
RTW: `batch_sim … --ic-trace /tmp/ic-matched/rtw-ic.json`  
LaunchDate **14:57:45**, CG_LLA = pad + h=34.7 m.

| Quantity | Path A (Eqns 3.4) | Path B (LLA/WGS-84) | ‖A−B‖ | vs RTW `--ic-trace` |
|----------|------------------|-------------------------|-------|---------------------|
| ‖Xe‖ | 6373385.000 m | 6373327.476 m | **57.5 m** | **Path B ‖ΔXe‖ ~ 1e-9 m** |
| ‖Vb‖ | 408.971847 m/s | 408.968143 m/s | **0.0037 m/s** | **Path B ‖ΔVb‖ ~ 1e-13** |
| GMST / Θ_E | — | — | — | **bit-match helpers** |
| ST124M / MES | — | — | — | **‖F‖ ~ 1e-16 vs `as205DefaultMes`** |
| q_ECI_0 | LIOᵀ | LIOᵀ | **0 (A vs B)** | RTW Merge vs helper: **q0 sign differs**; \|q\|=1 — DCM is source of truth for now |

### Date→GMST emit fixes (2026-08-21)

Required for mdl2obliq `<S5>` / On Pad Product to leave ECEF:

1. Gain expr `1 / 240.0` evaluated (was NaN→1).  
2. Math `mod` → `a-b*floor(a/b)` (positive remainder; C `fmod` broke GMST).  
3. With fixes, smoke OUT22 Xe/Ve match RTW Path B / onpad (see `ON_PAD_MATCHED_COMPARE.md`).

**Translator decision (2026-08-19):** **Emit MDL wires as-is.** Both paths exist in `<S5>`; do not collapse to Path A or B in the emitter. Plant consumers follow whatever outport the MDL Line graph drives (`Xe_0` ← LLA→ECF→Product; Eqns 3.4 `R_S` remains available on its own path). **RTW dump confirms Path B is the live `Xe_0` algebra.**
| IC7 | Wired IC subsystem | Stubs + constants | **Structural gap** — plant never re-runs Date/MES from host `LaunchDate` |
| IC8 | Host `LaunchDate` input | `obliq-cgen` uses 14:57:45 but **does not feed** baked MES | Dead input until IC is live |

## First confirmed bug (IC0)

```text
RTW / batch-sim / SaturnStartupHelper / obliq-cgen stub:
  1968-10-11 14:57:45

Obliq AS205_DEFAULT_LAUNCH_DATE (as205Mes.ts):
  1968-10-11 15:02:45   // commented “Apollo 7 liftoff”; RTW intentionally uses GRR-ish −5 min
```

Comments in `SaturnIBStack.cpp` show 15:02:45 was tried and **replaced** with 14:57:45. Obliq kept the discarded epoch for MES bake.

## Matched-compare plan

See `IC_MATCHED_COMPARE_PLAN.md`. Order:

1. Align LaunchDate → re-bake MES / r0 / v0 / q0  
2. Dump RTW `<S5>` six outports at t=0 (stash or 1-step `batch_sim`)  
3. Compare Obliq helpers ↔ RTW per outport (table like IGM Probe B)  
4. Resolve IC3 path (WGS-84 vs R_L+MESᵀ) if residuals exceed tolerance  
5. Only then re-open live tip / VS_y

## Related tip-plane note (parked)

After pad-roll IC, IGM `A_m` still tips into −Y_S (RTW +Z_S). Revisit **after** IC outports match — tip may be downstream of bad MES/q0.

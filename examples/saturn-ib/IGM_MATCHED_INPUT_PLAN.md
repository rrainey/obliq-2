# Isolated IGM — matched-input block map

## Why not only more live dual-harness?

Live XS/VS already diverge. Matched-input freezes **RTW** `(XS, VS, T1, T3, …)` and
runs Obliq `igmChiPipeline` so the first mismatch is **IGM algebra / G**, not plant drift.

**1.6 s sampling:** Obliq’s intentional ZOH take does **not** matter for a frozen
sample (we inject RTW’s `T_1_i` / `T_3`). Revisit sampling only if closed-loop
timing still disagrees after algebra matches at frozen hits.

## Capture note

RTW `batch_sim` needs **absolute** `agc.rom_path` / `pad_load_file` (or cwd=`ApolloA`).
Missing ROM made 510 s runs appear hung. Smoke with absolute paths: **~325×**.

Artifact: `/tmp/igm-matched/igm-rtw.csv` (extended stash).  
Replay: `IGM_RTW_CSV=... jest __tests__/igm-matched-input-replay.test.ts`

## Probe A — point-mass G (old CSV)

`phi_T` Δ≈0.013 with matched XS; `χ_α` still ~5× small.

## Probe B — **RTW stashed G_S** @ t=492.8 (matched XS/VS/GS)

| Block | RTW | Obliq | Rel |
|-------|-----|-------|-----|
| `phi_iT` | 0.263 | 0.250 | 0.05 |
| `phi_T` | −1.463 | −1.475 | 0.009 |
| `T_star_l` | 402.9 | 404.0 | 0.003 |
| **`L_y` seed** | **5659** | **23985** | **3.2** |
| **`Vphi_x/z`** | 1337 / 2061 | −885 / −2300 | **~2** (≈same \|V\|, wrong xz rot) |
| **`Gphi_x`** | **−9.19** | **+9.50** | **~2 (sign)** |
| `Gphi_y` | 0.0102 | 0.0102 | **~0** ✓ |
| `dV0` / `χ_α` / `Gain1_h` | … | explode / 0.08 vs 0.43 | follow φ-frame |

### Interpretation

1. With true RTW `G_S`, **first serious break is φ-frame `Product9/10`** (Rot_Y·(AP·v)): xz components wrong; `Gphi_y` perfect.
2. **`L_y` seed** also wrong (Intermediate / multiport τ,T vs RTW) — drives Gain1_h explosion.
3. `χ_α` miss is **downstream** of bad `V_φ`/`G_φ` (and L_y), not tip/FCC.

## Rot fix (done)

`rotPhiY` / Product15 `Vt_*`/`Gt_*` now use RTW DCM
`[c,0,s; 0,1,0; -s,0,c]`. Matched-input @ t=492.8 after fix:

| Block | Rel | Notes |
|-------|-----|-------|
| `Gphi_x/y` | ~0 | **fixed** |
| `Vphi_*` / `dV0_z` | ~1–2% | residual from φ_iT |
| **`chi_a` from dV0** | **~0.9%** | **0.436 vs 0.432 — fixed** |
| `L_y` seed | **3.2** | still wrong → Gain1_h / two-pass χ_α |
| `chi_a_pipe` / Chi_Y | bad | poisoned by Gain1_h / T3_eff |

## First-Phase τ1_eff (done)

RTW mode 0 Multiport[0] = `RateLimit(M/F)·V_ex1`, not preset 286.9.  
Obliq: `MF_S_sat` → `MF_S_rate_lim` (±0.005/s) → `τ1_first = ·V_ex1` → Multiport.

Matched-input @ t=492.8 with τ1_eff≈531 s (from RTW L_y) + Multiport T1=286.9:

| Block | Rel |
|-------|-----|
| `L_y` / `phi_T` / `Vφ` / `Gφ` / `dV0` | ~0–0.6% |
| **`chi_a` (dV0 and pipe)** | **~0.2–0.6%** |
| **`Chi_Y`** | **~0.02%** (−51.702 vs −51.712) |
| `Gain1_h` | ~13% residual (78 vs 68) — minor vs Chi |

## Live τ1_eff check (done — OK)

Stash `rate_lim_mf`, `tau1_mp`, `T1_mp`… @ t=492.8:

| | RTW | Obliq |
|--|-----|-------|
| `rate_lim_mf` | 0.1284 | 0.1269 |
| `tau1_mp` | 531.0 | 524.9 |
| `L_y` | 5660 | 5688 |

**τ1_eff is not the live Chi problem.**

## Live Chi root cause + C_Eb trial

@ t=492.8 **before** C_Eb trial: VS_z −540 vs RTW +2373 (Z broken).

**Trial kept:** S-frame `v_E = C_bEᵀ · v_b` (`C_Eb` transpose). After:

| | RTW | Obliq C_Eb |
|--|-----|------------|
| `VS_z` / `Vphi_z` / `dV0_z` | 2373 / 2061 / 5221 | **2213 / 2062 / 5220** (~OK) |
| `VS_y` / `Vphi_y` | +48 / −6 | **−761 / −810** (still bad) |
| `chi_a` | 0.432 | 0.528 |
| `Chi_Y` | −52° | **+157°** (cmd rate still runs away) |

Z-channel S-frame is largely fixed; **lateral Y** and Chi cmd still open.

## Next

1. ~~Rot / τ1_eff / isolated Chi / C_Eb Z-fix~~ **done**
2. **Paused live VS_y / tip** — tip plane into −Y_S observed; chasing flight without IC parity is the wrong order
3. **Initial Conditions matched compare** — see `INITIAL_CONDITIONS_GAP_MATRIX.md` / `IC_MATCHED_COMPARE_PLAN.md` (LaunchDate IC0 fixed to RTW 14:57:45)
4. Resume lateral tip / full-model compare only after S5 outports match

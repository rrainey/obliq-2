# MDL inventory — S-Frame nav + IGM (Phase 0)

**Source of truth:** `saturn_ib_stack.mdl` (viper/simulink or obliq-2/saturn-1B).  
RTW consulted only for sample times / enable semantics.

## `LVDC S-Frame Position & Velocity Calculations`

| | |
|--|--|
| Ports | `[2, 6]` |
| Mask | `delta_T_sec = 1.6` |
| In 1 | `V_m_bar_mps` |
| In 2 | `T3` (sample 1.6) |

**Outports (parent → IGM mapping):**

| Out # | MDL signal | IGM inport |
|------:|------------|------------|
| 1 | `R_S_bar_m` / XYZ_S | `XS_m` |
| 2 | `V_S_bar_mps` | `XSdot_mps` |
| 3 | `G_S_bar_mps2` | `G_S_bar_mps2` |
| 4 | `A_m_bar_mps2` | `XYZdotdot_m_mps2` |
| 5 | `FoverM_mps2` | `FoverM_mps2` |
| 6 | `MoverF_S` | `MF_S` |

**Nested (MDL):** `Estimated Gravitational Acceleration (Eqns. 4.3.6-12)` — oblate/`J` terms; annotations cite EDD **4.3.x / 4.4.x**.

**Phase 0 Obliq:** point-mass \(G_S=-\mu X_S/\|X_S\|^3\); \(X_S=\mathrm{MES}\,r_E\); \(V_S=\mathrm{MES}\,C_{bE}v_b\); \(F/m\) from thrust/mass; full EDD gravity later.

## `LVDC Iterative Guidance Mode`

| | |
|--|--|
| Ports | `[8, 1, 1]` (Enable) |
| Enable | T3≥44 ∧ ¬cutoff (`LogicalOperator2`) |
| Cycle | **1.6 s** on guidance ports |

**Mask presets (excerpt):** T_3_i=116, tau presets 286.9 / 262.52, V_ex1/3, Mdot_1=243.687, Mdot_3=204.129, delta_T=1.6, AP DCM, …

**Children:** First Phase, Phase2*, Intermediate Parameters, Chi Steering, HSL Cutoff Timing, SMCY/SMCZ.

**Chi Steering (MDL):** Enable + DSM write `Chi_Y_deg` / `Chi_Z_deg` only — χ computed upstream.

## Parent wiring (LVDC sheet)

S-Frame outs 1–6 → IGM ins 1–6; T3 → in 7; Time-Tilt χ → in 8 (`Chi_minor_loop_sample`); IGM out → Memory → Chi→Ψ path.

## `IGM Intermediate Parameters` (Phase 1 algebra)

| | |
|--|--|
| Ports | `[4, 9]` |
| Ins | `tau_1_sec`, `T_1_i_sec`, `tau_3_sec`, `T_3_i_sec` |
| Outs | `L1`, `J1`, `S1`, `Q1`, `P1`, `U1`, `L_prime_3`, `L_prime_y`, `J_prime_3` |
| Annotations | eqn. 4.4.20–28; EDD I-14-17…I-14-18 |
| Obliq | Pure fn `igmIntermediateParameters.ts` + plant subsystem `IGM_Intermediate_Parameters` nested in `LVDC_IGM` |

**Next:** parent assembly of Chi_Y/Z from these coeffs + S-frame (atan2 / Product path), then Chi Steering DSM + elev/β.

## Chi_Y / Chi_Z assembly (parent IGM — dataflow)

Full path (MDL/RTW `<S356>`, not yet ported):

1. Mode multiport → `(τ1,T1,τ3,T3)` → **Intermediate Parameters** → `L1…J′3`
2. S-frame `Product18` (XS) + AP DCM + `V_T` / gravity terms → velocity-to-be-gained / attitude angles (`phi_T`, etc.)
3. Subsystem building `K_p`, `ΔX_V`, switches → commanded unit vector
4. Rotate by AP: `Product15` → `v`
5. **`Chi_Y = deg(atan2(-v_z, v_x) + SMCY)`**; **`Chi_Z = sat(deg(atan(v_y/√(1-v_y²))+SMCZ), ±45)`**
6. **IGM Chi Steering** Enable writes DSM `Chi_Y_deg` / `Chi_Z_deg`
7. Rate-limit → **Chi to Psi** → FCC

**Interim Obliq stub:** `Chi_Y ≈ deg(atan2(-Xb_S_z, Xb_S_x))` (thrust axis in S). Elev: `90 + Chi_Y`.

**S419 combos (ported in TS):** `igmChiAssembly.ts` → `L_y,J_y,S_y,Q_y,L/J` from Intermediate + T1/T3.  

**S420 progress (`igmChiAssembly.ts`):**
- **AP DCM** from RTW ConstB `<S413>` (orthonormal). MDL `MaskValueString` was line-wrap corrupted — do not use.
- `igmApRotateState`, `igmPhiIT`, φ_T / Rot_Y, `igmDeltaV` (Add9 / V_T), `Gain1_h`, `T3_eff`
- **ΔV / S420 use G_S** (MDL Product10), **not** A_m — see `IGM_CHI_MDL_GAP_MATRIX.md`
- **S419** combos + **S420** `K_p` / `ΔX_V` / χ̇ switches → `v_cmd` → **Product15** `APᵀ·v_cmd` → `Chi_Y/Z`
- `igmChiPipeline` returns full Product15 Chi (TS reference)
- **Chi Steering (Obliq):** nested `IGM_Product15_Chi` under LVDC — live K_p + Product15 → `Chi_Y/Z` / `Chi_cmd` (`igmProduct15Obliq.ts`; TS ref still in `igmChiAssembly`)
- **Wave A.1b Product15:** `Gain1_h` / `T3_eff` from φ-frame `dV0` (`igmChiPipeline`); φ_iT restored; `T_star = T1+T3_eff`
- **Plant elev when IGM on:** `elev = clamp(90 + Chi_Y, 15, 32)` Wave B Chi tip (30→h~144; 33→h~219; 32 toward ref 197)
- **Major cycle (Obliq Wave A.2):** `guid_elapsed` (enable-gated) → `zoh=floor(guid/1.6)*1.6`; discrete `T1=286.9−zoh`
- **Mode handoff (Wave A.3):** First Phase (RTW T1 IC=τ1=286.9 ✓); Phase2 when `T1≤1.6`
- **Art-τ (Wave B):** hold T3 until `zoh≥318.7`; blend `τ3_N→MF_S·V_ex3` with `(P_C/35)^4`; mode3+ `τ3=MF_S·V_ex3`
- **Add8 (Wave A.4):** Product15 exports φ `Gain1_h`/`T3_eff`; HSL/`bCutoff` on live `T3_eff`
- **Chi tip (Wave B/C):** `elev=clamp(90+Chi_Y, IGM_TIP_ELEV_MIN/MAX)` default **[15,30]**. Sweep: 30 best; 30.5/32 lofted; 30.2 non-monotonic worse h
- **χ-rate freeze / cutoff:** keep freeze@5 + cut@T3≤5. RTW freeze@15+cut@0.04 tumbled; freeze@5+cut@0.04 killed Ve_y. Flags: `IGM_CHI_RATE_FREEZE_T3_S`, `IGM_CUTOFF_TGO_S`
- **SMCY/SMCZ (Wave B):** algebra ported; **bypassed** (`IGM_SMC_ENABLE=false`). Gain3 wired **`as_zoh`** (A_m); enable trial still regresses Ve_y (−29%). RTW Gain3 is accel *quant* (specific force), not thrust-only A_m — next ΔV source must match PIPA.
- **Chi→Ψ→FCC (Wave C):** Pitch OK. Yaw parked after sat(asin)±45+Kp=2 still NaN (~t692, Ve_y flip). Diag: `chi-z-yaw-diagnose.csv`. Tip [15,30]; SMC off; cut@5.
- Still missing: DeltaT_b; H-1 yaw polarity / Chi_Z gate; RTW cutoff 0.04; SMC ΔV; S-frame gravity
- **Nesting:** double-nest port remap fixed — Product15 nests under LVDC (`docs/codegen-double-nest-vector-types.md`)

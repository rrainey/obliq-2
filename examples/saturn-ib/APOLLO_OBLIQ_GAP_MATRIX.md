# Apollo / Obliq gap matrix (living)

Maps `saturn_ib_stack` major subsystems → Obliq status for Phase 1.
Update as ports land. Detail: `SIMULINK_STACK_MAP.md`, `design/12-saturn-ib-block-gaps-implementation-plan.md`.

**Legend:** Done · Partial · Missing · Host (stays in `SaturnIBStack` / yaAGC / StableMember)

| Priority | Subsystem / contract | Obliq status | Notes |
|----------|----------------------|--------------|-------|
| P0 | Custom Variable Mass 6DoF (quaternion) | **Partial** | ECI + \(\dot I\omega\); diagonal \(I\) only |
| P0 | AS-205 / site constants | **Done** | `as205PadFrames`, presettings |
| P1 | Initial Position (Eqns 3.4.x) | **Done** | `as205InitialPosition` → 9.4+ ICs |
| P1 | MES E→S | **Done** | `as205Mes` |
| P1 | Body↔ECI quaternion / DCM | **Partial** | Live `C_bE` in 9.4+; not full MDL tree |
| P2 | BodyToSM Euler | **Partial** | `as205BodyToSm` + 9.6 loggers |
| P2 | H-1 engine cluster + TVC | **Partial** | `as205Engines`; equal outer gimbals; no differential roll |
| P2 | Aero F&M (CA/CN/CP) | **Partial** | Companion + 9.4/9.5/9.6: air-rel F&M with RTW CG LUT + CN Unary-Minus path |
| P2 | Earth gravity | **Partial** | Point-mass \(\mu\) only — need oblate |
| P2 | Mass-scheduled CG / full \(I\) LUTs | **Partial** | Aero + H-1 CG_x from RTW `<S122>`; full \(I\) LUT missing |
| P2 | LVDC S-frame pos/vel | **Partial** | Phase 0 `LVDC_SFrame_Nav` (point-mass G_S); full Eqns 4.3.6-12 later |
| P3 | FCC / filters / actuators | **Partial** | Phase 8 slices; not full IU |
| P3 | Open-loop χ / Table 2B | **Partial** | Companion: `Chi_Table2B_BetaP` (elev→Q→β_P); 9.5/9.6 WASM too; not TM-X-62831 App B yet |
| P3 | IGM | **Partial** | Waves A–C: art-τ; tip [15,30]; cut@T3≤5; Chi→Ψ pitch; **SMC bypassed** (`IGM_SMC_ENABLE`). Tier B best: h−4%/Ve_y−12%/Ve_x−1.7%. SMC ΔV + yaw Ψ open. `LVDC_SFRAME_IGM_INVENTORY.md` |
| P3 | Staging / IECO / OECO / S-IVB start | **Partial** | RTW T2/T3 timers: mass≤198489 → IECO+3.2 / OECO+6.2 → StageSep+1.38 / S-IVB+2.7 |
| P3 | S-IVB J-2 / ullage / APS / retros | **Partial** | J-2 Thrust-vs-Time + mdot scale live; host mass poke 137883 at sep. Missing: dual EOM IcNeedsLoading, ullage, J-2 gimbal |
| P3 | IMU / PIPA / CDU chain (OUT*, CM_IMU_*) | **Missing** | Needed for AGC closed loop |
| Host | yaAGC Colossus249 | **Host** | Not ported into Obliq |
| Host | StableMemberControl RTW | **Host** | 1 kHz; MATLAB dep |
| Host | Pad uplink / FDAI mapping | **Host** | `SaturnIBStack.cpp` |
| Tooling | `obliq:cgen` JSON→C project | **Done** | generic + `--profile saturn-ib-stack` stubs; `--compile` smoke |
| Tooling | `as205:compare-final` | **Done** | Primary-field 0.5% gate |
| Tooling | `lib_SaturnIBObliq` companion | **Done (spike)** | Same `SaturnIBStack` API; `-DSATURNIB_BACKEND=obliq` |
| Tooling | Obliq plant hierarchy | **Done** | `saturnIbObliqPlant.ts` mirrors MDL top + S-IB/IU shells; see `SATURN_IB_STACK_HIERARCHY.md` |
| Tooling | Live EOM in companion plant | **Done** | Root `EOM_6DoF_VarMass` + flatten ID uniquify fix |
| Tooling | Double-nest vector types in codegen | **Fixed** | Recursive port remap in `ModelFlattener`; regression in `model-flattening.test.ts`. See `docs/codegen-double-nest-vector-types.md` |
| Tooling | Full H-1 TVC under S-IB | **Done** | Root `H1_Engine_Cluster` (β_P/β_Y limits → F/M); MDL-named stub remains in S-IB shell |
| Tooling | Full plant → OUT11/12/events | **Partial** | OUT11 live; events from T2/T3; OUT12 mirrors OUT11 after StageSep (no S-IVB EOM yet) |
| Tooling | Air-rel aero in companion plant | **Partial** | Root `Aero_AirRel` F&M live (RTW CG/CN); elev PD + M on stable after polarity fixes |
| Tooling | Liftoff hold-down / burn clock | **Done** | `t_burṅ=bLiftoff`, mdot×liftoff, EOM enable=liftoff (no pre-liftoff freefall) |
| Tooling | Tier A residual vs TN Table 5 | **Partial** | Elev PD + M on: h RMS ~3.7 km, V ~132 m/s (ok). Report: `obliq-plant-tier-a-residual.md` |
| Tooling | Tier B vs reference-1000s-final | **Partial** | Events 5/5; fail=14; art-τ+tip30+cut@T3≤5 → h −4%, Ve_y −12%, Ve_x ~2%. Report: `obliq-tier-b-final-compare.md` |
| Tooling | Open-loop χ in companion plant | **Done** | Root `Chi_Table2B_ElevPd` (elev PD + R-damp, H-1 polarity); \|V_S\| via MES |

## Phase gates (reminder)

| Gate | Oracle | Metric |
|------|--------|--------|
| Tier A | `reference-1000s.csv` plant channels | Engineering residuals |
| Phase 1 Tier B | `reference-1000s-final.json` | ≤0.5% primary fields |
| Phase 2 | Dual-sim under TM-X-62831 params | ≤0.5% primary fields |
| Phase 3 | TM-X-62831 trajectory tables | ≤0.5% modeled outputs |
| Phase 4 | Obliq backend in `lib_SaturnIB` | Drop-in + gates still pass |

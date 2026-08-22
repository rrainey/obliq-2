# Saturn-IB migration slices (Phase 8)

Composition-only models that exercise the block gaps closed in Phases 0–7.
Source of truth: [`sliceModels.ts`](./sliceModels.ts).

JSON fixtures are written by the test suite to [`docs/sample-models/saturn/`](../../docs/sample-models/saturn/).

Load any fixture in the app: **My Models → Import** → choose a JSON file.

```bash
npm test -- --testPathPattern=saturn-ib-slices
```
## Slices

| ID | Name | Purpose |
|----|------|---------|
| 8.1 | gravity-ballistics | Radial free-fall with integrator x(0) + divide |
| 8.2 | 6dof-vacuum-kinematics | Quaternion kinematics only (body2quat + x(0) + DCM) |
| **EOM** | **6dof-varmass-quaternion-eom** | **Full 6-DOF variable-mass EOM (see SIXDOF_VARMASS_EOM.md)** |
| 8.3 | engine-thrust-timer | edge_detect → integrator reset → thrust lookup_1d |
| 8.4 | atmosphere-qbar | COESA atmosphere + ½ρV² |
| 8.5 | stage-enable-freeze | S-IB subsystem enable freezes propellant integrator after sep |
| 8.6 | fcc-filter | Attitude error through TF + limit |
| 8.7 | rate-modulator | relay + unit_delay bang-bang |
| 8.8 | chi-time-tilt | Pitch program LUT + rate_limiter |
| 8.9 | igm-mode-shell | nIGMMode via data_store read/write |
| 8.10 | open-loop-ascent-1d | Liftoff + thrust table + gravity + atmosphere (1D stack) |
| **9.1** | **open-loop-6dof-ascent** | **Sprint: EOM + burn + altitude/atmosphere/q̄ plots + displays** |
| **9.2** | **closed-loop-pitch-rate-damp** | **Sprint: Q feedback via TF+limit → My into EOM (pre-TVC skeleton)** |
| **9.3** | **open-loop-6dof-ascent-aero** | **Sprint: 9.1 + simple aero drag F_aero=−q̄·CdA·v̂ into EOM** |
| **9.4** | **open-loop-chi-6dof-ascent** | **ECI 6DoF + H-1 TVC (β_P/β_Y→F,M) + aero air-rel + χ → rate → β_P** |
| **9.5** | **open-loop-chi-table2b-ascent** | **Table 2B χ_c (elev=90+χ_c) on 9.4 plant; rate → β_P** |
| **9.6** | **chi-table2b-attitude-pd** | **Body→S elev PD → H-1 β_P + R-damp → β_Y; no free My** |

## Parameters

Selected AS-205 constants from `saturn-1B/AS205_presettings.m` are attached as model parameters on guidance-related slices.

## Validation baseline (important)

**Primary trajectory reference:** Chrysler **TN-AP-67-158** (*AS-205 Revised Launch Vehicle Reference Trajectory*), not the Simulink stack.

- Policy + quantity mapping: [`AS205_REFERENCE.md`](./AS205_REFERENCE.md)
- **Coordinate frames (Apollo IU §2):** [`APOLLO_COORDINATE_FRAMES.md`](./APOLLO_COORDINATE_FRAMES.md) — S/E/B; TN Space frame ≈ **S** (working assumption)
- **Simulink stack map:** [`SIMULINK_STACK_MAP.md`](./SIMULINK_STACK_MAP.md) — port order; TN residual while incomplete
- **`as205Mes.ts` / `as205EciPlant.ts` / `as205BodyToSm.ts` / `as205Aero.ts`:** MES, ECI pad, Body→SM, aero F&M
- **Simulink translation map:** [`SIMULINK_STACK_MAP.md`](./SIMULINK_STACK_MAP.md) — ECI/Body/SM path vs 9.x gaps
- CSV layout + compare helpers: [`as205Compare.ts`](./as205Compare.ts), `docs/sample-models/saturn/as205-reference/`
- Residual CLI (prefer frame-light fields):  
  `npm run as205:compare -- --model <logger.csv> --fields h_m,mass_kg`
- Simulink may **deviate** from TN; prefer TN; do not retune plant to Simulink without a decision

## 6-DOF variable-mass EOM

See **[SIXDOF_VARMASS_EOM.md](./SIXDOF_VARMASS_EOM.md)** for equations, IO, and limitations.

```bash
npm test -- --testPathPattern=sixdof-varmass-eom
```

## Not yet modeled (full stack still TBD)

- Full aero tables — 9.3 uses CdA drag; **9.4+** uses Simulink CA/CN/CP (air-relative v)
- Full inertia tensor (products of inertia) and mass-property LUTs
- Platform / IGM / differential roll TVC (9.6: elev PD → β_P + R-damp → β_Y)
- Full Apollo geospatial frames / IGM χ steering
- Per-engine H-1 masks + APS (cluster TVC ported in `as205Engines.ts` / 9.4+)
- Quantitative TN pass/fail windows (reference CSV digitized; residuals still qualitative)

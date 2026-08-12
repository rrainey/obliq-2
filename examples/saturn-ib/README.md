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
| **9.2** | **closed-loop-pitch-rate-damp** | **Sprint: Q feedback via TF+limit → My into EOM** |
| **9.3** | **open-loop-6dof-ascent-aero** | **Sprint: 9.1 + simple aero drag F_aero=−q̄·CdA·v̂ into EOM** |
| **9.4** | **open-loop-chi-6dof-ascent** | **Sprint: simplified χ time-tilt → Q_cmd → My on TN-class plant** |
| **9.5** | **open-loop-chi-table2b-ascent** | **Sprint: TN Table 2B χ_c (elev=90+χ_c) on 9.4 plant** |
| **9.6** | **chi-table2b-attitude-pd** | **Sprint: Table 2B elev + body-pitch PD (θ̂=∫Q); mass-LUT plant** |

## Parameters

Selected AS-205 constants from `saturn-1B/AS205_presettings.m` are attached as model parameters on guidance-related slices.

## Validation baseline (important)

**Primary trajectory reference:** Chrysler **TN-AP-67-158** (*AS-205 Revised Launch Vehicle Reference Trajectory*), not the Simulink stack.

- Policy + quantity mapping: [`AS205_REFERENCE.md`](./AS205_REFERENCE.md)
- **Coordinate frames (Apollo IU §2):** [`APOLLO_COORDINATE_FRAMES.md`](./APOLLO_COORDINATE_FRAMES.md) — S/E/B; TN Space frame ≈ **S** (working assumption)
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

- Full aero tables (CN, Cm, α-dependent moments) — 9.3/9.4 use constant-CdA drag only
- Full inertia tensor (products of inertia) and mass-property LUTs
- Platform / IGM / quaternion-Euler attitude (9.6 is body-pitch only: θ̂=∫Q)
- Full Apollo geospatial frames
- Full IGM χ steering
- Multi-engine H-1 cluster + APS
- Quantitative TN pass/fail windows (reference CSV digitized; residuals still qualitative)

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

## Parameters

Selected AS-205 constants from `saturn-1B/AS205_presettings.m` are attached as model parameters on guidance-related slices.

## 6-DOF variable-mass EOM

See **[SIXDOF_VARMASS_EOM.md](./SIXDOF_VARMASS_EOM.md)** for equations, IO, and limitations.

```bash
npm test -- --testPathPattern=sixdof-varmass-eom
```

## Not yet modeled (full stack still TBD)

- Full inertia tensor (products of inertia) and mass-property LUTs
- Closed-loop IGM chi steering
- Multi-engine H-1 cluster + APS
- Trajectory matching against AS-205 reference tables
- Quaternion renormalization / high-gain normalize

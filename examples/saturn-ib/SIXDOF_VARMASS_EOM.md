# 6-DOF Variable-Mass Quaternion EOM

Source: [`sixDofVarMassEom.ts`](./sixDofVarMassEom.ts)  
Fixture: `docs/sample-models/saturn/saturn-6dof-varmass-quaternion-eom.json`

## Equations

### Translation (body frame)

\[
\dot{\mathbf{v}}_b = \frac{\mathbf{F}_b}{m} - \boldsymbol{\omega}\times\mathbf{v}_b + \mathbf{g}_b
\]

### Rotation (principal axes)

\[
\mathbf{I}(m) = \mathbf{I}_{\mathrm{ref}}\frac{m}{m_{\mathrm{ref}}},\quad
\dot{\boldsymbol{\omega}} = \mathbf{I}^{-1}\bigl(\mathbf{M}_b - \boldsymbol{\omega}\times(\mathbf{I}\boldsymbol{\omega})\bigr)
\]

Diagonal \(\mathbf{I}=\mathrm{diag}(I_{xx},I_{yy},I_{zz})\) only (no products of inertia).

### Attitude

\[
\dot{\mathbf{q}}_{\mathrm{raw}} = \tfrac12\,\Omega(\boldsymbol{\omega})\,\hat{\mathbf{q}},\quad
\hat{\mathbf{q}} = \mathbf{q}_{\mathrm{raw}} / |\mathbf{q}_{\mathrm{raw}}|
\]

Implemented with **`body2quaternion_rates`** plus unit renormalization (demux → mag → divide → mux).
All attitude consumers (`body2quat`, DCM, outputs) use \(\hat{\mathbf{q}}\).

### Position

\[
\dot{\mathbf{r}}_i = C_{b\!\to i}\,\mathbf{v}_b
\]

\(C_{b\to i}\) from **`orientation_conversion`** `quat_to_dcm`.  
\(\mathbf{g}_b = C_{b\to i}^{\mathsf T}\,\mathbf{g}_i\) with

\[
\mathbf{g}_i = -\mu\,\mathbf{r}_i/|\mathbf{r}_i|^3.
\]

### Mass

\[
\dot m = -\dot m_{\mathrm{prop}}\quad(\dot m_{\mathrm{prop}}\ge 0)
\]

Mass integrator lower-limited to 1 kg.

## States (integrators)

| Name | Type | Meaning |
|------|------|---------|
| `r_i` | `double[3]` | Inertial position |
| `v_b` | `double[3]` | Body velocity |
| `omega_b` | `double[3]` | Body angular rate (P,Q,R) |
| `q_raw` | `double[4][1]` | Integrated quaternion (pre-normalize) |
| `q_hat` | `double[4][1]` | Unit quaternion (algebraic) |
| `mass` | `double` | Vehicle mass |

Integrators use **x(0)** external IC ports.

## Demo inputs (sources)

| Name | Default | Role |
|------|---------|------|
| `F_b` | `[0,0,0]` | Body force (N) |
| `M_b` | `[0,0,0]` | Body moment (N·m) |
| `mdot_prop` | `0` | Propellant burn rate (kg/s) |
| `r0_i`, `v0_b`, `omega0`, `q0`, `m0` | pad-like IC | Initial state |
| `Ixx_ref`, `Iyy_ref`, `Izz_ref`, `m_ref` | LV-ish | Reference inertia / mass |

Replace sources with **input ports** (see vehicle burn demo) to drop this sheet into a stage model.

## Vehicle burn demo

`buildSixDofVehicleBurnDemo()` wraps the EOM as subsystem **`EOM_6DoF_VarMass`**:

| Port | Dir | Type |
|------|-----|------|
| `F_b`, `M_b`, `mdot_prop` | in | body force/moment, burn rate |
| `r_i`, `v_b`, `omega_b`, `q`, `mass`, `r_mag` | out | states |

Parent: liftoff **edge_detect**, axial thrust LUT (`F=[T,0,0]`), \(\dot m \approx T/2550\).

Fixture: `docs/sample-models/saturn/saturn-6dof-vehicle-burn-demo.json`

## 9.1 Open-loop 6-DoF ascent (sprint model)

`buildSixDofOpenLoopAscent()` — integration slice for the “open-loop 6-DoF vehicle ascent” sprint:

| Piece | Role |
|-------|------|
| `EOM_6DoF_VarMass` | Full variable-mass quaternion EOM (subsystem) |
| Liftoff edge + burn timer | Starts thrust schedule at \(t=1\) s |
| Thrust LUT + mdot | Axial \(F_b=[T,0,0]\), \(\dot m \approx T/2550\) (~Isp 260 s) |
| Altitude / atmosphere | \(h=|r|-R_E\); COESA density (plot only) |
| Dynamic pressure | \(q=½\rho V^2\), \(V=|v_b|\) (plot only; **no aero force**) |
| Displays + loggers | \(|r|\), mass, thrust, altitude, \(q̄\), speed |

### Recommended sim settings

| Setting | Value |
|---------|-------|
| Time step | **0.05 s** |
| Duration | **180 s** |
| Integration | **RK4** |

### What you should see

- **Thrust** rises after liftoff, holds, then tails off by ~150–160 s  
- **Mass** decreases during burn  
- **\(|r|\) / altitude** increase under boost (order-of-magnitude stack, not AS-205 matched)  
- **\(q̄\)** peaks early in the dense atmosphere then falls  
- **Attitude** evolves from EOM IC body rate (no closed-loop moments)

Fixture: `docs/sample-models/saturn/saturn-9.1-open-loop-6dof-ascent.json`

```bash
npm test -- --testPathPattern=sixdof-varmass-eom
# My Models → Import → saturn-9.1-open-loop-6dof-ascent.json → Run Simulation
```

## 9.2 Closed-loop pitch-rate damping

`buildSixDofClosedLoopPitchRateDamp()` — FCC-style rate loop into EOM moments:

| Piece | Role |
|-------|------|
| Short axial boost | Open-loop \(F_b\), mdot (same pattern as 9.1, shorter table) |
| Demux \(\omega_b\) | Extract pitch rate \(Q\) |
| \(Q_{\mathrm{cmd}}-Q\) | Error (default \(Q_{\mathrm{cmd}}=0\) → damp to zero) |
| TF + gain + limit | 8.6-style filter → \(M_y\) (N·m), limited |
| \(M_b=[0,M_y,0]\) | Body pitch moment into EOM |

### Recommended sim settings

| Setting | Value |
|---------|-------|
| Time step | **0.02 s** |
| Duration | **60 s** |
| Integration | **RK4** |

### What you should see

- **Q** starts nonzero (EOM IC \(\omega_y\approx0.01\)) and **decays** under feedback  
- **My** opposes pitch rate early, then settles near 0  
- Short **thrust** pulse then coast; **|r|** still increases during boost  

Fixture: `docs/sample-models/saturn/saturn-9.2-closed-loop-pitch-rate-damp.json`

## 9.3 Open-loop 6-DoF ascent with aero drag

`buildSixDofOpenLoopAscentWithAero()` — plant step toward AS-205 trajectory shape:

| Piece | Role |
|-------|------|
| Same boost as 9.1 | Axial thrust + mdot into EOM |
| Atmosphere + \(q̄\) | COESA ρ, \(q=½\rho\|v_b\|^2\) |
| Simple drag | \(F_{\mathrm{aero}} = -q̄\,C_D A\,\hat{\mathbf{v}}_b\) |
| \(F_b = F_{\mathrm{thrust}}+F_{\mathrm{aero}}\) | Drag **coupled** into EOM (not plot-only) |

Default \(C_D A \approx 17\,\mathrm{m}^2\) (order-of-magnitude: \(D\approx6.6\,\mathrm{m}\), \(C_D\approx0.5\)).

### Recommended sim settings

| Setting | Value |
|---------|-------|
| Time step | **0.05 s** |
| Duration | **180 s** |
| Integration | **RK4** |

### What you should see

- Same qualitative boost as 9.1, but **drag magnitude** peaks near max-\(q̄\)
- Altitude/speed slightly lower than 9.1 vacuum-aero-less plant for the same thrust table
- Loggers for altitude, mass, \(q̄\), \(|v|\) ready for TN residual scripts

### Compare to TN-AP-67-158

Reference CSV: `docs/sample-models/saturn/as205-reference/as205_trajectory_reference.csv`  
(Table 5 S-IB, SI). Prefer **altitude** and **mass** first — TN velocity is space-fixed (~409 m/s at liftoff from Earth rate); 9.x body speed starts near zero.

**Do not “fix” the model to match Simulink** if Simulink and the TN disagree.

Fixture: `docs/sample-models/saturn/saturn-9.3-open-loop-6dof-ascent-aero.json`

## 9.4 Open-loop χ time-tilt on 6-DoF (+ aero)

`buildSixDofOpenLoopChiAscent()` — guidance-shaped plant for better \(h(t)\) vs TN:

| Piece | Role |
|-------|------|
| TN-class propulsion | Axial thrust ~**7 MN** (Table 5 order), \(\dot m \approx T/2550\), \(m_0\approx 586593\,\mathrm{kg}\) |
| Aero | \(F_{\mathrm{aero}} = -\bar q\,C_D A\,\hat{\mathbf{v}}_b\) |
| χ LUT + rate limiter | Open-loop pitch program (deg), ≲1 °/s slew (TN criterion) |
| \(Q_{\mathrm{cmd}}\approx\dot\chi\) | Discrete derivative via unit_delay / \(dt\) |
| Rate loop | \(Q_{\mathrm{cmd}}-Q\) → TF + gain + limit → \(M_y\) |
| Collectors | `maxSamples ≥ duration/dt` so CSV covers **full** run (not last 50 s only) |

χ table is a **simplified** time-tilt (90° → ~28° by staging), not full TN Table 2B polynomials.

### Recommended sim settings

| Setting | Value |
|---------|-------|
| Time step | **0.05 s** (matches \(Q_{\mathrm{cmd}}\) derivative \(dt\)) |
| Duration | **180 s** |
| Integration | **RK4** |

### What you should see

- **χ_cmd** holds near 90°, then tilts down through boost  
- **Q** tracks **Q_cmd** (negative during tilt); **My** commands pitch  
- **Altitude positive and climbing** during boost (not negative MSL)  
- **Mass** drops by hundreds of tonnes toward staging-class values  
- **CSV export** spans from ~liftoff through end of run (thousands of rows)  

**Do not fix to Simulink** if it disagrees with TN-AP-67-158.

### Residual report (after a run)

1. Export **all** logger data CSV from the app (columns like `time,log_altitude,log_mass,log_qbar`).  
2. From repo root:

```bash
npm run as205:compare -- --model path/to/export.csv --offset 1 --out residual-report.md
```

Prefer **altitude** and **mass** residuals first. Soft flags in the report are diagnostic only.

Fixture: `docs/sample-models/saturn/saturn-9.4-open-loop-chi-6dof-ascent.json`

## 9.5 TN Table 2B χ program on 9.4 plant

`buildSixDofOpenLoopChiAscentTable2B()` — same plant as 9.4; χ LUT from **TN-AP-67-158 Table 2B**.

| Piece | Role |
|-------|------|
| Table 2B χ_c | Digitized every ~2 s (see `as205ChiTable.ts`) |
| elev = 90 + χ_c | Practical map for rate generation (90° = vertical) |
| Rate loop | Unchanged: \(Q_{\mathrm{cmd}}=\mathrm{d(elev)}/\mathrm{d}t\) → My |

**Not included:** closed-loop attitude from quaternion, LVDC platform frames, or IGM.  
Those need an explicit geospatial/frame decision before wiring.

Fixture: `docs/sample-models/saturn/saturn-9.5-open-loop-chi-table2b-ascent.json`  
Reference CSV: `docs/sample-models/saturn/as205-reference/as205_table2b_chi.csv`

## Validation baseline

Trajectory comparison target: **TN-AP-67-158 (AS-205 revised launch reference)**.  
See [`AS205_REFERENCE.md`](./AS205_REFERENCE.md). Simulink is secondary and may disagree with the TN.

## Limitations (v1)

- Principal-axis inertia only; no \(I_{xy}\) etc.
- No thruster relative-velocity / plume force beyond user `F_b`
- 9.1 samples atmosphere for plots only; **9.3/9.4 add constant-\(C_D A\) drag** (no CN/Cm/α tables)
- 9.2 is pitch-rate damping only; **9.4 tracks \(\dot\chi\)**, not closed-loop attitude error
- χ program is simplified (not full TN Table 2B)
- Multi-engine / APS still TBD
- Quantitative TN residual pass/fail windows not yet declared (CSV digitized for S-IB Table 5)
- DCM convention assumed body→inertial; verify sign for a specific trajectory frame

## Run codegen test

```bash
npm test -- --testPathPattern=sixdof-varmass-eom
```

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

## Limitations (v1)

- Principal-axis inertia only; no \(I_{xy}\) etc.
- No thruster relative-velocity / plume force beyond user `F_b`
- No aero; couple `atmosphere` + aero tables externally
- DCM convention assumed body→inertial; verify sign for a specific trajectory frame

## Run codegen test

```bash
npm test -- --testPathPattern=sixdof-varmass-eom
```

# Simulink `saturn_ib_stack` ↔ obliq / EDD / TN map

**Source model:** `saturn-1B/saturn_ib_stack.mdl`  
**Goal:** Translate this stack into obliq; use **TN-AP-67-158** for validation of frame-light quantities; treat Simulink as a development aid that **may deviate** from the TN.

---

## Root I/O (Simulink)

| Port | Role |
|------|------|
| `LaunchDate` | Epoch → GMST / \(\theta_E\) for ECI |
| `A_z_deg` | Launch azimuth (E of N) |
| `CG_LLA_deg_m` | Site / CG lat-lon-alt |
| `q_ECItoSM` | Quaternion ECI → S (or related) |
| `T_L_prime_sec` | Timing |
| Outports | FDAI attitudes/rates, etc. |

Internal gotos of interest: `veh_q_ECI`, `PAD_q_ECI`, `q_ECI`, `V_ECI_mps`, `theta_GMST_rad`, S-IVB/CSM variants.

---

## Frame build-up (Simulink vs EDD vs 9.x)

```text
Simulink (translation target)
  LaunchDate ──► θ_E / GMST
  LLA, A_z  ──► Initial Position & Velocity (Eqns 3.4.x)
                    ├─► R_S_0_m, V_S_0_mps   (S-frame IC)
                    └─► E-Frame to S-Frame [MES] (Eqn 2.3.10)
  PAD_q_ECI / veh_q_ECI ──► Body ↔ ECI (quaternion DCM)
  Custom Variable Mass 6DoF (Quaternion) ──► EOM in body / inertial
  LVDC S-Frame Position & Velocity ──► navigation S outputs
  BodytoSM (EDD 2.3.3 / [MBS]) ──► attitude vs plumbline

EDD frames
  E = classical ECI (equinox)
  S = plumbline space-fixed at T_GRR (inertial after freeze)
  B = vehicle body (X forward / thrust)

TN-AP-67-158 (working assumption)
  “Space frame” ≈ S (not E)
  Validate now without S components: altitude, mass, q̄
```

| Concept | Simulink | EDD | 9.x plant today |
|---------|----------|-----|-----------------|
| Primary dynamics inertial | **ECI** (`veh_q_ECI`, Body↔ECI) | **E** | **ECI** (`r_i` in E; 9.4+) |
| Space / plumbline | `ECItoSM`, `R_S_0`, `V_S_0`, LVDC S-Frame | **S** | Pad IC via Initial Position; export `r_S=MES·r_E` |
| Body | 6DoF body axes + Body↔ECI | **B** | \(F_b=[T,0,0]\), \(M_y\), \(Q=\omega_y\); \(q_0=\mathrm{dcm}(\mathrm{MES}^\top)\) |
| ECI→S | Subsystem **E-Frame to s-Frame (MES)** Eqn 2.3.10; inputs Az, \(\phi_L\), \(\Theta_E\) | `[MES]` | **Ported** + constant MES in plant |
| Body→S | `BODYtoSM` / Euler from EDD 2.3.3 | `[MBS]` | Not ported (elev PD only) |
| Pad Earth rate | In Initial Position (`omega_E_rps`, note mask stores \(\omega/\pi\)) | — | SI \(\omega\) in `as205PadFrames` |
| Gravity | Earth Gravity Model (oblate options) | G-system usage in IU | Point-mass \(\mu\) only |
| Epoch | `LaunchDate` (Apollo 7 actual in your mdl) | \(T_{\mathrm{GRR}}\) | MES library uses `AS205_DEFAULT_LAUNCH_DATE`; plant not ECI yet |

**Important:** 9.x is **not** a 1:1 port of this build-up yet. Same AS-205 site numbers and TN tables ≠ same frame pipeline as Simulink.

---

## Key Simulink subsystems (translation order)

| Priority | Subsystem / block | Port / signal | obliq status |
|----------|-------------------|---------------|--------------|
| P0 | `Custom Variable Mass 6DoF (Quaternion)` | Body-axis EOM, \(q\), \(\mathbf{r}\), \(\mathbf{v}\) | **ECI plant** (9.4+): `r_i` in E, body \(v/\omega\), \(q_{bE}\) |
| P0 | Site / AS-205 constants | `A_z`, \(\phi_L\), \(R_L\), … | `AS205_presettings.m` / `as205PadFrames.ts` |
| P1 | `Initial Position and Velocity (Eqns 3.4…)` | `R_S_0_m`, `V_S_0_mps` | **Ported** (`as205InitialPosition.ts` → 9.4/9.5/9.6 ICs) |
| P1 | `Body to ECI` / `ECItoBODY` | `BODYtoECI`, `veh_q_ECI` | Not as full ECI world |
| P1 | `E-Frame to s-Frame (MES)` | DCM E→S | **Ported** (`as205Mes.ts`); helpers `eciToS` / `sToEci` / pad→E |
| P2 | `BODYtoSM Transform` | \(\Phi,\Theta,\Psi\) body vs S | Not ported |
| P2 | `LVDC S-Frame Position & Velocity` | Nav S state | Not ported |
| P2 | `Earth Gravity Model` | \(g\) | Point mass only |
| P3 | FCC / IGM / staging | Full stack | Phase 8 slices only |

---

## MES (E→S) — ported (`as205Mes.ts`)

Subsystem **E-Frame to s-Frame (MES matrix)** (Eqn **2.3.10**):

- Inputs: **Az**, \(\phi_L\) (geodetic), \(\Theta_E\) (via SinCos).  
- Annotation: \(u(1)=\sin A_z\), \(u(2)=\sin\phi_L\), \(u(3)=\sin\Theta_E\), \(u(4)=\cos A_z\), \(u(5)=\cos\phi_L\), \(u(6)=\cos\Theta_E\).  
- Fcn elements → reshape 9×1→3×3 (column-major of \(\{M_{ij}\}\)).  
- Mask: DCM transforming **E → S** ⇒ \(\mathbf{v}_S = [\mathrm{MES}]\,\mathbf{v}_E\).

**Epoch chain (also ported):**

```text
LaunchDate [Y,M,D,h,m,s] ──► Date to JD (Meeus/Vallado)
  ──► T = (JD − 2451545)/36525
  ──► GMST sec (IAU poly) → deg = mod(sec,86400)/240
  ──► Θ_E = λ_L + θ_GMST   (MES Transform Sum2)
```

After \(T_{\mathrm{GRR}}\), **MES is constant**.

**Epoch policy (matches your Simulink stack):**

| Quantity | Source |
|----------|--------|
| Site, \(A_z\), \(\phi_L\), \(R_L\), guidance presettings | **TN-AP-67-158** (`AS205_presettings.m`) |
| Trajectory residual golden | **TN-AP-67-158** (never-flown revised L/V ref.) |
| `LaunchDate` → GMST / \(\Theta_E\) / MES | **Apollo 7 actual** liftoff (`AS205_DEFAULT_LAUNCH_DATE`) |

TN parameters were not what Apollo 7 flew; LaunchDate was substituted with flown values so astronomy/MES is realistic. Residual still targets the TN tables used to validate Simulink. Flown Apollo 7 trajectory doc deferred.

**Initial Position** produces **S-frame** pad state:

- `R_S_0_m` from \(R_L\) and site angles  
- `V_S_0_mps` from Earth rate (mask `omega_E_rps` ≈ \(\omega_E/\pi\))

Pad → ECI offline: `padStateSToEci(R_S, V_S, MES)` for the future ECI 6DoF step.

---

## Validation policy (aligned with frame assumptions)

### Use against TN **now** (no Space-frame components required)

- Altitude  
- Mass  
- \(q̄\) (aero-model caveat)  
- Thrust / longitudinal accel when digitized  

### Defer until Simulink ECI→S / SM path is in obliq

- TN space-fixed velocity & path angle  
- Space-frame position components  
- Full \(\mathbf{v}\) residual in S or E  

CLI: prefer  
`npm run as205:compare -- --model … --fields h_m,mass_kg`

---

## Recommended translation sequence

1. **Keep residual focus** on \(h\), mass while porting.  
2. ~~**Port Initial Position (S)**~~ — **done** (`as205InitialPosition.ts`).  
3. ~~**Port MES**~~ — **done** (`as205Mes.ts`).  
4. ~~**ECI 6DoF**~~ — **done** (`as205EciPlant.ts` + 9.4/9.5/9.6): \(r_E\), \(v_b=V_S\), \(q_0=\mathrm{dcm}(\mathrm{MES}^\top)\); loggers `log_X_S/Y_S/Z_S`.  
5. Body→SM / LVDC S-frame nav; live \(v_S\) export (type-prop mat×vec order).

### MES formulas (implemented)

```text
M11 = cφ cΘ     M12 = cφ sΘ     M13 = sφ
M21 = sφ sAz cΘ − cAz sΘ
M22 = sφ sAz sΘ + cAz cΘ
M23 = −cφ sAz
M31 = −sφ cAz cΘ − sAz sΘ
M32 = −sφ cAz sΘ + sAz cΘ
M33 = cφ cAz
Θ_E = λ_L + θ_GMST
```


### Initial Position formulas (implemented)

```text
δφ = φ_L − φ_L′
R_S = R_L · [ cos δφ,  sin δφ · sin A_z,  −sin δφ · cos A_z ]
V_S = R_L · ω_E · cos φ_L′ · [ 0,  cos A_z,  sin A_z ]
ω_E = (Simulink mask omega_E_rps) · π  ≈ 7.292e-5 rad/s
```

Unlike a pure `[R_L,0,0]` placement, \(R_S\) has small transverse components from geodetic vs geocentric latitude (plumbline vs geocentric radius).

---

## File pointers

| Path | Content |
|------|---------|
| `saturn-1B/saturn_ib_stack.mdl` | Full Simulink stack |
| `saturn-1B/AS205_presettings.m` | Site / guidance constants |
| `as205PadFrames.ts` | Site constants + older ECEF-path pad helper |
| `as205InitialPosition.ts` | Simulink \(R_S_0\), \(V_S_0\) |
| `as205Mes.ts` | `[MES]` E→S, Date→JD, GMST, \(\Theta_E\) |
| `as205EciPlant.ts` | Pad \(r_E\), \(v_b\), \(q_{bE}\) for ECI 6DoF |
| `APOLLO_COORDINATE_FRAMES.md` | EDD S/E/B definitions |
| `AS205_REFERENCE.md` | TN residual policy |

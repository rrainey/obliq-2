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
| Primary dynamics inertial | **ECI** (`veh_q_ECI`, Body↔ECI) | **E** | Integrates in **S-like** triad (`as205PadFrames`) |
| Space / plumbline | `ECItoSM`, `R_S_0`, `V_S_0`, LVDC S-Frame | **S** | Partial pad S IC; not full MES |
| Body | 6DoF body axes + Body↔ECI | **B** | \(F_b=[T,0,0]\), \(M_y\), \(Q=\omega_y\) |
| ECI→S | Subsystem **E-Frame to s-Frame (MES)** Eqn 2.3.10; inputs Az, \(\phi_L\), \(\Theta_E\) | `[MES]` | **Not ported** |
| Body→S | `BODYtoSM` / Euler from EDD 2.3.3 | `[MBS]` | Not ported (elev PD only) |
| Pad Earth rate | In Initial Position (`omega_E_rps`, note mask stores \(\omega/\pi\)) | — | SI \(\omega\) in `as205PadFrames` |
| Gravity | Earth Gravity Model (oblate options) | G-system usage in IU | Point-mass \(\mu\) only |
| Epoch | `LaunchDate` | \(T_{\mathrm{GRR}}\) | **Not used** |

**Important:** 9.x is **not** a 1:1 port of this build-up yet. Same AS-205 site numbers and TN tables ≠ same frame pipeline as Simulink.

---

## Key Simulink subsystems (translation order)

| Priority | Subsystem / block | Port / signal | obliq status |
|----------|-------------------|---------------|--------------|
| P0 | `Custom Variable Mass 6DoF (Quaternion)` | Body-axis EOM, \(q\), \(\mathbf{r}\), \(\mathbf{v}\) | Partial: `sixDofVarMassEom.ts` (body EOM + quat); inertial frame still simplified |
| P0 | Site / AS-205 constants | `A_z`, \(\phi_L\), \(R_L\), … | `AS205_presettings.m` / `as205PadFrames.ts` |
| P1 | `Initial Position and Velocity (Eqns 3.4…)` | `R_S_0_m`, `V_S_0_mps` | Partial S pad; not Simulink Fcn chain |
| P1 | `Body to ECI` / `ECItoBODY` | `BODYtoECI`, `veh_q_ECI` | Not as full ECI world |
| P1 | `E-Frame to s-Frame (MES)` | DCM E→S | **Not ported** (needed for Space-frame components) |
| P2 | `BODYtoSM Transform` | \(\Phi,\Theta,\Psi\) body vs S | Not ported |
| P2 | `LVDC S-Frame Position & Velocity` | Nav S state | Not ported |
| P2 | `Earth Gravity Model` | \(g\) | Point mass only |
| P3 | FCC / IGM / staging | Full stack | Phase 8 slices only |

---

## MES (E→S) — Simulink structure (for later port)

Subsystem **E-Frame to s-Frame (MES matrix)** (Eqn **2.3.10**):

- Inputs: **Az**, \(\phi_L\), \(\Theta_E\) (via SinCos of angles).  
- Annotation maps \(u(1)=\sin A_z\), \(u(2)=\sin\phi_L\), …  
- Builds 3×3 DCM elements with Fcn blocks, reshape 9×1→3×3.

After \(T_{\mathrm{GRR}}\), **MES is constant** (epoch only fixes \(\Theta_E\) and thus S axes in E).

**Initial Position** produces **S-frame** pad state:

- `R_S_0_m` from \(R_L\) and site angles  
- `V_S_0_mps` from Earth rate (mask `omega_E_rps` ≈ \(\omega_E/\pi\) so \(\omega_E=\texttt{omega\_E\_rps}\cdot\pi \approx 7.29\times 10^{-5}\,\mathrm{rad/s}\))

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
2. **Port Initial Position (S)** Fcn chain to match Simulink `R_S_0` / `V_S_0` bit-closer (optional cross-check vs `as205PadFrames`).  
3. **Port MES** with \(\Theta_E\) from LaunchDate (or fixed test epoch).  
4. **Run 6DoF with ECI state** like Simulink (`r_ECI`, `v` body or ECI, `q_ECI`) and export S via MES for TN Space-frame columns.  
5. Body→SM / LVDC S-frame nav last among plant items.

---

## File pointers

| Path | Content |
|------|---------|
| `saturn-1B/saturn_ib_stack.mdl` | Full Simulink stack |
| `saturn-1B/AS205_presettings.m` | Site / guidance constants |
| `as205PadFrames.ts` | Current S-like pad IC (not full MES) |
| `APOLLO_COORDINATE_FRAMES.md` | EDD S/E/B definitions |
| `AS205_REFERENCE.md` | TN residual policy |

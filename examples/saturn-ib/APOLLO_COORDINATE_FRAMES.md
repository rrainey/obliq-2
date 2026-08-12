# Apollo-era coordinate frames (Saturn IB)

**Primary source:** *Saturn IB Instrument Unit* documentation  
file `satinstunitibm_1.pdf` (local), **Section 2 — Reference Systems and Transformations**, pages **I-2-1 … I-2-?** (PDF pp. ~29–44).

Cross-refs in that section:

- NASA OMSF SE 008-001-1, *Project Apollo Coordinate System Standards* (June 1965)  
- S-system ≡ Apollo Standard Coordinate System **13** (LV navigation)  
- E-system ≡ Apollo Standard Coordinate System **4** (geocentric inertial)  
- B-system translatable to Apollo Standard **8a** (Saturn I/IB structural body)

**Policy for obliq Saturn work:** Prefer this document + TN-AP-67-158 over ad-hoc frames. Simulink site→ECI is secondary unless it matches these definitions.

### TN “Space frame” ≈ **S-system** (working assumption)

**Project decision (pending explicit TN call-out):** In TN-AP-67-158, references to the **Space frame** / space-fixed trajectory state are treated as the **EDD/IU S-frame (plumbline)**, not the E-system (vernal equinox).

| System | Space-fixed (EDD)? | Axis definition | Role vs TN |
|--------|--------------------|-----------------|------------|
| **S** | **Yes** — frozen at \(T_{\mathrm{GRR}}\); non-rotating ⇒ **inertial** | Local vertical + platform azimuth (downrange) at GRR | **TN “Space frame” (assumed)** |
| **E** | Yes | Vernal equinox / north pole (Apollo Std 4 / classical ECI) | Celestial ECI; Simulink `veh_q_ECI` world |
| **G** | Yes (GRR meridian) | Launch meridian at GRR | Gravity/drag intermediate |
| **A** | No | Earth-fixed site meridian | Rotating Earth |

**Why S fits the TN wording better than E alone**

1. EDD explicitly calls **S space-fixed** (orientation fixed to the celestial sphere after freeze) — so it **is** inertial in the EDD sense, even though axes are **site-defined** at GRR.  
2. TN “space-fixed” path angle / velocity / position listings for ascent are naturally expressed with **local vertical and downrange**, which are exactly **\(X_S\)** and **\(Z_S\)**.  
3. No TN line yet found that equates “Space frame” to equinox/E; if one appears, update this note.

**E remains important:** classical ECI and the Simulink primary inertial (`Body to ECI`, `veh_q_ECI`). **S ↔ E** is a **fixed** rotation after GRR (launch site + azimuth + epoch at \(T_{\mathrm{GRR}}\)). Building that transform is time-based only in the sense that **\(T_{\mathrm{GRR}}\) / launch epoch fixes the S axes in E**; after freeze, both frames are inertial and the DCM is constant.

**Table 2B \(\chi_c\)** (from inertial vertical, negative downrange) lives in the **S pitch plane** (\(X_S\)–\(Z_S\)). Steering closes in **B** (via gimbals / `[MBS]` in the full IU stack).

---

## Classes of frames

| Class | Meaning |
|-------|---------|
| **Space-fixed** | Orientation fixed to the celestial sphere (stars); origin may move |
| **Earth-fixed** | Orientation fixed to the rotating Earth |
| **Vehicle-fixed** | Orientation fixed to the launch vehicle |

All “proper” systems below are **right-handed orthogonal** triads (except the **P** gimbal axes, which are non-orthogonal).

---

## Named systems (Section 2.2)

### S — Plumbline (space-fixed) — *navigation / “inertial vertical”*

| | |
|--|--|
| Origin | Geocenter |
| **\(X_S\)** | Parallel to **plumbline at launch site at \(T_{\mathrm{GRR}}\)**, positive **opposite gravity** (local “up”) |
| **\(Z_S\)** | Parallel to **platform azimuth**, positive **downrange** |
| **\(Y_S\)** | Completes RH triad |

- Identical to **Apollo Standard Coordinate System 13** (LV navigation).  
- At GRR, platform gimbals align with the S-system (Fig. 2-5).  
- **This is the natural home for Table 2B \(\chi_c\)** (“from inertial vertical, negative downrange”): vertical ≈ \(X_S\), downrange ≈ \(Z_S\), pitch plane ≈ \(X_S\)–\(Z_S\).

### 4 — Target plane (space-fixed) — *IGM intermediate*

| | |
|--|--|
| Origin | Geocenter |
| **\(X_4\)** | Intersection of **desired orbit plane** and equator, positive toward **descending node** of desired orbit |
| **\(Z_4\)** | In desired orbit plane, **90° downrange** from \(X_4\) |
| **\(Y_4\)** | RH |

Used in IGM calculations.

### V — Injection plane (space-fixed) — *IGM velocity-to-be-gained*

| | |
|--|--|
| Origin | Geocenter |
| **\(X_V\)** | In desired orbit plane at angle \(-\theta_T\) from \(X_4\) in the \(X_4\)–\(Z_4\) plane; through predicted insertion |
| **\(Z_V\)** | In orbit plane, 90° downrange from \(X_V\) |

IGM velocity-to-be-gained / time-to-go use V-frame quantities (many terms zero at insertion).

### G — Gravitational (space-fixed)

| | |
|--|--|
| Origin | Geocenter |
| **\(X_G\)** | Toward intersection of **launch-site meridian at \(T_{\mathrm{GRR}}\)** and equator |
| **\(Y_G\)** | Along Earth spin axis, positive toward **south** pole |
| **\(Z_G\)** | RH |

Used for gravitational and drag accelerations in the IU flight program.

### E — Ephemeral / geocentric inertial (space-fixed) — **TN inertial (assumed)**

| | |
|--|--|
| Origin | Geocenter |
| **\(X_E\)** | Toward **vernal equinox** |
| **\(Z_E\)** | Earth spin axis, positive **north** |
| **\(Y_E\)** | RH |

- Identical to **Apollo Standard Coordinate System 4** (geocentric inertial).  
- Matches the usual **ECI** definition (\(X\) vernal equinox, \(Z\) north).  
- **Working assumption:** TN-AP-67-158 space-fixed / inertial trajectory state is in (or equivalent to) **E**.

### A — Telemetry station (earth-fixed)

| | |
|--|--|
| Origin | Geocenter |
| **\(X_A\)** | Toward intersection of **launch-site meridian** and equator |
| **\(Y_A\)** | Spin axis, positive **south** |
| **\(Z_A\)** | RH |

Earth-fixed counterpart of the G-style meridian construction (meridian epoch differs: \(T_{\mathrm{as}}\) vs \(T_{\mathrm{GRR}}\) in Fig. 2-2).

### B — Body (vehicle-fixed) — *attitude / steering*

| | |
|--|--|
| Origin | Geometric center of the **Instrument Unit** |
| **\(X_B\)** | Longitudinal vehicle axis, positive toward the **spacecraft** (forward / thrust) |
| **\(Z_B\)** | Through **Position I** (fin 1 / Position I looking upward — Fig. 2-3) |
| **\(Y_B\)** | RH |
| Rotations | About \(X_B,Y_B,Z_B\): **roll, pitch, yaw** respectively |

- Translatable along \(X_B\) to **Apollo Standard 8a** (Saturn I/IB structural body).  
- Attitude error commands are implemented in the **B-system**.  
- Aligns with AIAA-style body: **\(+X\) thrust**, pitch about **\(Y\)**, yaw about **\(Z\)**.

### P — Inertial platform gimbals (non-orthogonal)

- Gimbal angles \(\theta_x,\theta_y,\theta_z\) (outer, inner, middle) = Euler angles.  
- Constructed from translated S and B axes; at GRR, P axes parallel to S.  
- Line of nodes is **downrange at liftoff**.  
- IGM steering in **4-system** → expressed as gimbal angles → attitude errors converted to **B-system** roll/pitch/yaw (Eq. 8.3.2).

---

## Transformation matrices (Section 2.3)

Naming: **`M` + from-system + to-system** transforms a vector **from** the second letter **to** the third  
(e.g. **`[MBS]`**: B → S; **`[MSG]`**: S → G).

| Matrix | From → To | Role (summary) |
|--------|-----------|----------------|
| `[MSG]` | S → G | Two rotations (\(A=-90^\circ\) about \(X_S\), then \(\phi_L'\) about new \(Z\)) |
| `[MG4]` | G → 4 | Orbit-plane / node setup (\(-\Lambda\), \(-i\)) |
| `[MBS]` | **B → S** | Attitude: three rotations by gimbal angles \(-\theta_x,-\theta_z,-\theta_y\) |
| `[M4V]` | 4 → V | Single rotation about \(Y_4\) through \(-\theta_T\) |
| `[MS4]` | S → 4 | `[MG4][MSG]` |
| `[MGA]` | G → A | Earth rotation about \(Y_G\) through \(\Omega_R\) |
| `[MSA]` | S → A | `[MGA][MSG]` |
| `[MSV]` | S → V | `[M4V][MS4]` |
| `[MEG]` | E → G | Equinox / meridian (\(\theta_E\), then \(-90^\circ\)) |
| `[MES]` | E → S | Via G (see doc: composition with transpose as stated in §2.3.10) |

*(Element formulas are in Eqs. 2.3.1–2.3.10 of the IU document; not recopied here.)*

---

## Mapping to user stack and obliq 9.x

| Concept | User / standard | IU doc | 9.x plant today |
|---------|-----------------|--------|-----------------|
| Body \(+X\) thrust | AIAA forward | **\(X_B\)** toward spacecraft | \(\mathbf{F}_b=[T,0,0]\) |
| Pitch axis | \(+Y\), +pitch up | **\(Y_B\)**, pitch about \(Y_B\) | \(M_y\), \(Q=\omega_y\) |
| True ECI | Vernal equinox / north | **E-system** | **Not used** |
| ECF-like | Greenwich / site meridian | **A-system** (site meridian) | **Not used** |
| Nav “inertial vertical + downrange” | — | **S-system** (\(X_S\) up, \(Z_S\) downrange) | Approximated only as elev schedule |
| Site → inertial | Simulink astronomy | **`[MEG]` / `[MES]`** + site angles | **Not used** |
| Pad IC | ECF→ECI at epoch | S/E related by launch geometry | Demo: \(\mathbf{r}\parallel +X_i\), identity quat |

### Implication for Table 2B / late \(\Delta h\)

- **TN trajectory state** (position, space-fixed velocity, path angle): assume **E**.  
- **Table 2B \(\chi_c\)** (vertical / downrange): geometric directions that define **S** at GRR; expressed in **E** once site + azimuth + epoch are known.  
- Pitch/steering still closes in **B** (and platform vs **S**).

9.x currently:

1. Puts “up” along a **demo radial** at \(t=0\) (not E, not S).  
2. Commands elev via **body pitch about \(Y_b\)** with elev \(=90+\chi_c\).  
3. Never builds pad **E** ICs, **S** from launch geometry, or **`[MBS]`** / **`[MES]`**.

Until **E** (TN inertial state) and **S** (local vertical/downrange for \(\chi\)) are consistent at the pad, tight elev tracking can still **mis-aim thrust** even if body axes are AIAA-correct.

---

## Plant implementation status

| Step | Status |
|------|--------|
| TN inertial ≡ **E** | Working assumption |
| Pad **S** IC: \(r=[R_L,0,0]\), \(v=\) Earth rate in S, B‖S | **Implemented** (`as205PadFrames.ts` → 9.4/9.5/9.6) |
| Full E state + epoch / `[MES]` for vector residual vs TN | **Not yet** (altitude/mass still comparable) |
| Table 2B pitch strictly in \(X_S\)–\(Z_S\) with certified \(M_y\) sign | Partial (elev schedule + body \(Y\); sign/plane still under residual review) |
| `pad_roll_L` applied to \(q_0\) | **Not yet** |

Site constants: `AS205_presettings.m` / `AS205_PAD` (LC-34, \(A_z\), \(R_L\)).

---

## File reference

| Local path | Content |
|------------|---------|
| `~/Downloads/satinstunitibm_1.pdf` | IU manual; Section 2 pp. ~29–44 |
| This note | Working summary for obliq Saturn migration |

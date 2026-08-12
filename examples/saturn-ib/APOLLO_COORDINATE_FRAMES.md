# Apollo-era coordinate frames (Saturn IB)

**Primary source:** *Saturn IB Instrument Unit* documentation  
file `satinstunitibm_1.pdf` (local), **Section 2 — Reference Systems and Transformations**, pages **I-2-1 … I-2-?** (PDF pp. ~29–44).

Cross-refs in that section:

- NASA OMSF SE 008-001-1, *Project Apollo Coordinate System Standards* (June 1965)  
- S-system ≡ Apollo Standard Coordinate System **13** (LV navigation)  
- E-system ≡ Apollo Standard Coordinate System **4** (geocentric inertial)  
- B-system translatable to Apollo Standard **8a** (Saturn I/IB structural body)

**Policy for obliq Saturn work:** Prefer this document + TN-AP-67-158 over ad-hoc frames. Simulink site→ECI is secondary unless it matches these definitions.

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

### E — Ephemeral / geocentric inertial (space-fixed)

| | |
|--|--|
| Origin | Geocenter |
| **\(X_E\)** | Toward **vernal equinox** |
| **\(Z_E\)** | Earth spin axis, positive **north** |
| **\(Y_E\)** | RH |

- Identical to **Apollo Standard Coordinate System 4** (geocentric inertial).  
- Matches the usual **ECI** definition (\(X\) vernal equinox, \(Z\) north).

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

TN Table 2B \(\chi_c\) (from vertical, negative downrange) lives naturally in the **S-frame pitch plane** (\(X_S\)–\(Z_S\)), not in a random body elev integral.

9.x currently:

1. Puts “up” along a **demo radial** at \(t=0\) (not full E or S).  
2. Commands elev via **body pitch about \(Y_b\)** with elev \(=90+\chi_c\).  
3. Never builds **`[MBS]`** or pad **S/E** from launch site + azimuth.

Until pad **S-frame** (or E→S) ICs and **B↔S** attitude are wired, tight elev tracking can still **mis-aim thrust relative to true downrange / gravity turn** even if body axes are “AIAA-correct.”

---

## Recommended next plant step (when authorized)

1. Confirm TN-AP-67-158 “inertial” ≡ **S** and/or **E** as used above.  
2. Set pad IC in **S**: \(X_S\) local vertical, \(Z_S\) downrange (azimuth), Earth rate in S or via E.  
3. Identity B‖S at GRR/liftoff (platform align), then Table 2B pitch as rotation in \(X_S\)–\(Z_S\) about **\(Y_S\)** (≡ \(Y_B\) at align).  
4. Keep thrust on **\(X_B\)**; use **`[MBS]`** (or quaternion equivalent) for \(\mathbf{r},\mathbf{v}\) in S/E.

That reuses this document’s matrices rather than inventing frames.

---

## File reference

| Local path | Content |
|------------|---------|
| `~/Downloads/satinstunitibm_1.pdf` | IU manual; Section 2 pp. ~29–44 |
| This note | Working summary for obliq Saturn migration |

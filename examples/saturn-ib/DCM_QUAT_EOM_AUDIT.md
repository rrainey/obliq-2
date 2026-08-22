# Audit: DCM→quat + 6DoF EOM (MDL vs Obliq)

**Date:** 2026-08-19  
**Why:** Attitude IC and EOM errors compound over the full run; gate these before chasing tip/VS.

---

## 1. DCM → quaternion (IC `<S32>`)

### MDL / RTW

Aerospace **DCM2Quaternion**: `trace(DCM) > 0` → Positive Trace, else Negative Trace (max diagonal).

Positive (\(T=A_{11}+A_{22}+A_{33}>0\)):

\[
q_0=\tfrac12\sqrt{T+1},\quad
s=\tfrac12/\sqrt{T+1},\quad
q_{1,2,3}=(A_{23}-A_{32},\; A_{31}-A_{13},\; A_{12}-A_{21})\,s
\]

Scalar-first \([q_0,q_1,q_2,q_3]\). DCM for quat IC comes from **L/V Inertial Orientation**, not from the IC Euler→DCM block (that one is for ECEF↔ECI position).

### Obliq

`orientation_conversion` / `dcm_to_quat` and `as205EciPlant.dcmToQuat`: **same Shepperd formulas**.

| Topic | Match? |
|-------|--------|
| Pad LIO **trace** \(T\) | \(T\approx-0.70<0\) → **Negative Trace** (not Positive) |
| Negative Trace algebra (same DCM in) | **Yes** — Obliq ≡ RTW on pad when both convert **LIOᵀ** or both **LIO** |
| Which DCM is wired | **Fork:** RTW converts **LIO**; Obliq plant converts **LIOᵀ** → \(q_0\) flips sign |
| `as205EciPlant` \(q_0\ge 0\) flip | Extra vs RTW; on pad Obliq already has \(q_0>0\) from LIOᵀ |

### Two different “negatives” (do not confuse)

1. **Trace \(T=A_{11}+A_{22}+A_{33}\)** — property of the **DCM**, selects Positive vs Negative **branch**. Pad LIO: \(T<0\).
2. **Scalar \(q_0\)** — output of DCM→quat. On Negative Trace, \(q_0\) is an **off-diagonal** term (e.g. \((A_{31}-A_{13})s\)), not \(\tfrac12\sqrt{T+1}\), so it can be ±.  
   RTW `DCM2Quat(LIO)` → \(q_0\approx-0.273\); Obliq `dcmToQuat(LIOᵀ)` → \(q_0\approx+0.273\).

Both pipelines still recover the same \(v_E\) if Ve uses the matching DCM extract (Obliq \(C(q)v_b\) vs MDL \(\mathrm{Transpose}(\mathrm{ASB}(q))v_b\)).

### Locked decisions (2026-08-19)

| Item | Decision |
|------|----------|
| DCM→quat algorithm | `orientation_conversion` / Shepperd (do not expand If/±trace) |
| **IC + EOM attitude wiring** | **MDL wire-as-is:** `DCM2Quat(LIO)`; \(V_e=\mathrm{Transpose}(\mathrm{ASB\_DCM})\,V_b\) |
| Obliq hand-port `dcmToQuat(LIOᵀ)` | Legacy; translator / new IC helper use LIO; EOM adapter uses Transpose |

---

## 2. Custom Variable Mass 6DoF (Quaternion)

### MDL

**Two instances:** S-IB and S-IVB (`MaskType = 6DoF EoM (Body Axis)`).

Critical parent wiring (S-IB):

| Port / signal | MDL practice |
|---------------|--------------|
| Forces | `m·g_b + F_aero + F_engines` (**gravity as force outside**) |
| `m_dot`, `I_dot` into 6DoF | **Grounded (0)** |
| mass / I | **Vehicle Mass Properties** (mass integrator + Ixx/Iyy/Izz LUTs, diagonal) |
| Gravity model | GM + **J2** → \(g_b\) → ×m |
| Attitude | soft \(k_{\mathrm{quat}}\) normalization in \(\dot q\) |
| Ve / Xe | `Transpose(ASB_DCM)·Vb` / integrate |

### Obliq (`sixDofVarMassEom.ts` / plant `EOM_6DoF_VarMass`)

| Piece | Status |
|-------|--------|
| \(\dot v_b=F/m-\omega\times v+g_b\) | Implemented (g **inside**) |
| \(\dot r=C_{bi}v_b\), quat rates, principal \(I\propto m\) | Implemented |
| Soft \(k_{\mathrm{quat}}\) | **Hard** \(\hat q=q/\|q\|\) instead |
| External mass/I ports; grounded İ | **Not** the MDL contract |
| J2 | Separate / partial (`as205J2`) — not identical force path |
| Second EOM + ω₀ handoff (S-IVB) | **Missing** |

### Highest compounding risks

1. **DCM sense** — ASB `Quaternion2DCM` + transpose vs Obliq `quat_to_dcm` must be proven equivalent for \(\dot r\) and \(g_b\).
2. **Gravity placement** — MDL: \(F\) includes \(mg_b\); Obliq: \(g\) inside \(\dot v\). Blind EXPAND **double-counts** gravity.
3. **İ / I schedule** — MDL grounds İ and uses mass LUTs; Obliq continuous \(I\propto m\) + \(\dot I\omega\).
4. **Dual EOM / staging** — S-IVB separate 6DoF + ω₀ IC.

### Locked EOM EXPAND policies (2026-08-19) — **implemented in plant**

| Policy | Choice | Code |
|--------|--------|------|
| Gravity | Force-path: \(F_{\mathrm{aug}}=F+m g_b\), \(\dot v=F_{\mathrm{aug}}/m-\omega\times v\) | `EOM_MDL_ADAPTER.forcePathGravity` |
| İ | **İω = 0** (MDL grounds `I_dot`) | `zeroIdot` |
| I schedule | Still \(I\propto m\) inside EOM (LUT external I = follow-up) | noted gap |
| Attitude / Ve | mdlWire IC + \(\dot r=C_{ib}v_b\); plant aero/χ/S-frame use \(C_{bE}=\mathrm{Transpose}(\mathrm{quat\_to\_dcm})\) | `veViaTranspose` + `mdlWireAttitude` |

### Live plant status

**Reverted to legacy IC/attitude** after 330 s mdlWire smoke tumbled (elev→−81°, Q≈1.8 rad/s).  
`EOM_MDL_ADAPTER` + `as205MdlWirePadStateEci()` remain **opt-in APIs** for translator work; do not enable on live plant until elev/β polarity is fixed.

Smoke artifacts (failure reference): `/tmp/igm-matched/igm-obliq-mdlwire-smoke.csv`.

---

---

## 3. Verification tests (queued)

| ID | Check |
|----|-------|
| Q1 | Pad LIO DCM→quat: Obliq vs RTW Positive (unit) |
| Q2 | Random SO(3) with \(T>0\): bit-close quat |
| E1 | Same \(q\): Obliq `quat_to_dcm` vs MDL `Transpose(Quaternion2DCM)` on \(\dot r\) |
| E2 | Vacuum coast fixed-mass |
| E3 | Force-path gravity vs internal \(g\) (no double count) |
| E4 | İ=0 + LUT I vs \(I\propto m\) short burn |

---

## Related

- `INITIAL_CONDITIONS_GAP_MATRIX.md` — Xe dual-path  
- `SIXDOF_VARMASS_EOM.md` — Obliq EOM equations  
- mdl2obliq: `orientation_conversion` already maps Quaternion2DCM / DCM2Quaternion SourceTypes

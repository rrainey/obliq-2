# Isolated Initial Conditions — matched compare

Mirror of `IGM_MATCHED_INPUT_PLAN.md` for `<S5> Initial Conditions`.

## Why not only live dual-harness?

Live XS/VS / tip already diverge after liftoff. Matched IC freezes **RTW** epoch + site inputs and compares **S5 outports** so the first mismatch is **IC algebra / path**, not guidance or EOM drift.

## Capture

RTW `batch_sim` (cwd with AGC ROM / pad load, or absolute paths in JSON):

```bash
mkdir -p /tmp/ic-matched
npm run ic:dual-path   # from obliq-2 — Path A vs B closed-form
~/src/viper/batch-sim/build-rtw/batch_sim \
  ~/src/viper/batch-sim/examples/AS-205-reference.json \
  --run-time 0.05 \
  --ic-trace /tmp/ic-matched/rtw-ic.json
```

`--ic-trace` writes `<S5>` outs from RTW BlockIO (`FillIcTrace`):  
`theta_GMST_0`, `theta_E`, `ST124M_DCM`, `LIO_DCM`, `q_ECI_0`, `Xe_0`, `Vb_0`, `V_ECI_0`.

Artifact: `/tmp/ic-matched/rtw-ic.json` (+ `ic-dual-path.json` from helpers).

Replay: `__tests__/ic-matched-compare.test.ts`.

## Probe order

| Probe | Inputs frozen | Compare | Pass bar |
|-------|---------------|---------|----------|
| **A — epoch** | LaunchDate, λ_L | JD, GMST, Θ_E | bit-identical deg within 1e-9 |
| **B — MES / LIO** | A_z, pad_roll=100, φ, Θ_E | 9 DCM elements | ~1e-12 ortho; vs RTW ~1e-9 |
| **C — Eqns 3.4** | R_L, A_z, φ, φ′, ω | R_S_0, V_S_0 | existing unit tests |
| **D — Xe_0** | site LLA + epoch | Obliq `MESᵀ R_S` vs RTW LLA→ECF→ECI | quantify; decide if path must change |
| **E — V / Vb / q** | Xe, LIO, ω | V_ECI, Vb_0, q_ECI_0 | after D |

## Known before first dump

- **IC0 LaunchDate:** Obliq default was 15:02:45; RTW 14:57:45 — fix Obliq to RTW epoch first.
- **IC3 path fork:** Obliq never runs WGS-84 `LLA to ECF`; residual may remain after epoch fix.

## Done when

All six MDL outports within agreed tol vs RTW at t=0 **with the same LaunchDate / LLA / A_z**, and plant bake uses that epoch. Then resume live tip / VS_y.

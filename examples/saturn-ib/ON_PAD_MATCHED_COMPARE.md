# On Pad (`<S8>`) — matched compare

**Date:** 2026-08-21  
**Depends on:** Initial Conditions Path B lock (`IC_MATCHED_COMPARE_PLAN.md`).

## What On Pad is

| Item | Detail |
|------|--------|
| MDL | `Saturn_IB_Stack/On Pad` (`<S8>`) |
| Nested IC | `<S74>` — same LLA→ECF→ECI algebra as `<S5>`, but **GMST input is live** (`θ_GMST(t) = θ_GMST₀ + ω_E·t`) |
| Root outs | `OUT22`: lat, lon, h, Xe[3], Ve[3] (pad reference) |
| Also | ECI→LLA (`<S72>`), Earth gravity, centrifugal accel, quat→DCM, …

mdl2obliq outports: `lat_deg, lon_deg, h_m, Xe_m, Ve_mps, alpha_deg, Vb_mps, q_ECI, …`

## Capture

```bash
mkdir -p /tmp/ic-matched
~/src/viper/batch-sim/build-rtw/batch_sim \
  ~/src/viper/batch-sim/examples/AS-205-reference.json \
  --run-time 0.05 \
  --ic-trace /tmp/ic-matched/rtw-ic.json \
  --onpad-trace /tmp/ic-matched/rtw-onpad.json
```

## RTW dump vs Path B / `<S5>` (t ≈ 0.01 s)

| Check | Result |
|-------|--------|
| lat / lon vs CG_LLA | **match** (Δlat ~1e-7°, Δlon = 0) |
| h vs CG_LLA[2]=34.7 m | **Δh ≈ +0.70 m** (ECI→LLA ellipsoidal round-trip) |
| \|Xe\| | **6373327.476 m** (= Path B / S5) |
| ‖Xe_onpad − Xe_S5‖ | **≈ 4.09 m** — explained by **ΔGMST = ω_E·0.01 s ≈ 4.18e-5°** (live GMST on On Pad) |
| ‖Ve_onpad − V_ECI_S5‖ | **≈ 0.30 mm/s** (same cause) |
| LIO / q vs S5 | **LIO ‖Δ‖ ~ 1e-15**; q matches S5 (incl. q0 sign) |
| Vb | Reconstructed as **LIO·Ve** (BlockIO `Product1_l` is *not* pad Vb) |

## Interpretation

1. **On Pad nested IC is the same Path B algebra as `<S5>`**, evaluated at **current** GMST, not freeze-at-epoch.
2. **OUT22 LLA** recovers pad lat/lon; height shows a **~0.7 m** WGS-84 round-trip bias — document, do not “fix” unless RTW and Obliq disagree with each other.
3. Obliq plant today often **passthrough** pad LLA/h for OUT22; full On Pad (gravity / centrifugal / ECI↔LLA) is the next structural gap after numeric OUT22/IC agreement.

## Closed-form helper (2026-08-21)

`as205OnPadStateAtTime(t)` + `npm run onpad:dual-path` → `/tmp/ic-matched/onpad-dual-path.json`

| vs RTW `--onpad-trace` @ t=0.01 | Residual |
|--------------------------------|----------|
| GMST | ~0 (10+ digits) |
| ‖ΔXe‖ | **~1e-9 m** |
| ‖ΔVe‖ | **~1e-13 m/s** |
| lat / lon | **match** |
| Δh (helper vs RTW) | **~4 mm** |
| Δh (RTW vs CG 34.7) | **~0.70 m** round-trip |
| q | q0 sign vs Merge (same as `<S5>`); \|q\|=1 |

## mdl2obliq root `Out22` (2026-08-21)

Emit post-pass `wireRootOut22`: packs On_Pad `lat/lon/h/Xe/Ve` → root `Out22` `double[9]`.  
Adapter copies `model->outputs.Out22` → ExtY `OUT22`.

Smoke (`obliq:cgen --profile saturn-ib-stack`):

| Field | Result |
|-------|--------|
| lat / lon / h | **match** RTW onpad |
| Xe / Ve @ clock=0 (1 step) | **‖Δ‖=0 vs RTW `<S5>` / Path B** |
| Xe / Ve @ clock=0.01 (2 steps) | **‖ΔXe‖=0 vs RTW `--onpad-trace`** |

### Date→GMST emit fixes (2026-08-21)

1. Gain `1 / 240.0` evaluated (was NaN→1).  
2. Math `mod` → `a-b*floor(a/b)` (positive remainder; C `fmod` broke GMST).  
3. `fmod` allowed in evaluate validator/codegen if used elsewhere.

Note: Obliq clock is sampled at the start of the algebraic pass; after N steps of dt, live GMST uses `(N-1)*dt`. Compare RTW onpad @ t=0.01 to Obliq smoke `--duration 0.02`.

## Pass bar (this slice)

- [x] RTW `--onpad-trace` produces valid Xe  
- [x] lat/lon match CG_LLA  
- [x] Xe/Ve consistent with S5 + ωΔt  
- [x] Closed-form helper matches RTW dump (Xe/Ve/LLA)  
- [x] Root Out22 wired + adapter OUT22 pack  
- [x] Date→GMST fixed; Out22 Xe/Ve are ECI and match RTW  
- [ ] Optional: On Pad MES / gravity / Ab at t=0

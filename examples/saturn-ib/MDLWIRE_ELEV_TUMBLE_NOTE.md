# Offline note: mdlWire plant tumble (330 s smoke)

**Date:** 2026-08-19  
**Live plant:** reverted to **legacy** IC/EOM. This note is for offline debug only.

## Symptom

With `as205MdlWirePadStateEci()` + `EOM_MDL_ADAPTER` + `mdlWireAttitude` on aero/χ/S-frame:

| t | elev (BodyToSM_Theta) | Q (rad/s) |
|---|----------------------|-----------|
| 300 | 90° | 0 |
| 320 | ~54° | ~1.07 |
| 330 | **−81°** | **~1.83** |

Pad VS @1.6 still matched RTW. Tip `atan2(A_y,A_z)` @320 ≈ **−144°** (RTW ~0° into +Z).

## Hypothesis (not yet proven)

1. **elev / β_P polarity** — elev = asin((MES·C_bE)[0][0]) with  
   `C_bE = Transpose(quat_to_dcm(q))` and `q = dcmToQuat(LIO)`.  
   PD: `β_P ∝ (elev_cmd − elev_meas)`. Tip moment from +β_P may now **increase** elev error (sign flip vs legacy LIOᵀ quat).

2. **Ve transpose in EOM** — `veViaTranspose` changes \(\dot r\) pairing; less likely to alone cause elev dive in 30 s, but couples into aero/q̄.

3. **Tip plane** — even before tumble, A_m was not into +Z_S (same class of issue as pre-mdlWire −Y tip).

## Next probes (offline; do not enable on live plant)

1. Freeze attitude at pad; command `β_P = +2°` open-loop; compare Δelev sign for **legacy vs mdlWire** C_bE.  
2. Same with elev PD enabled; log `elev_cmd`, `elev_meas`, `β_P`, `Xb_S`.  
3. Try mdlWire IC **without** `veViaTranspose` (attitude-only) to isolate EOM ṙ.

## API to use when retrying

```ts
as205MdlWirePadStateEci()
buildEomSubsystemBlock(..., { physics: EOM_MDL_ADAPTER })
buildAeroAirRelSubsystem(..., { mdlWireAttitude: true })
// etc.
```

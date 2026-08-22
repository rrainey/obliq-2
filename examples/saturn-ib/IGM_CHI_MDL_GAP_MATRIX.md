# IGM Chi / ΔV / Product15 — MDL block→Obliq gap matrix

**Source of truth:** `saturn_ib_stack.mdl` → `LVDC Iterative Guidance Mode` (`<S356>`).  
**Cross-check:** RTW `Saturn_IB_Stack.c` (sample hit 1.6 s).

Methodology note: a true block-by-block translation should make missing
`Math Function5` (transpose) or `Unary Minus` a checklist failure. The APᵀ
miss and the G-vs-A miss below both happened because this path was still
equation-/trace-driven in places, not structural.

## Terminal Product15 / Chi_Y/Z (MDL sheet)

| MDL block | Op / Inputs | Role | Obliq | Status |
|-----------|-------------|------|-------|--------|
| `From23` (Goto `MS4` / AP const) | — | AP DCM into transpose | `P15_AP_DCM` / `IGM_AP_DCM` | OK (const) |
| **`Math Function5`** | **`transpose`** | APᵀ before Product15 | `P15_AP_DCM_T` / `IGM_AP_DCM_T` | **Fixed** (was AP·v) |
| `Mux` | 3 | v_cmd = [cα cβ, sβ, −sα cβ] | `v_cmd` evaluate + mux | OK |
| `SinCos` / `SinCos1` | aerolib | sin/cos of χ_α_cmd / χ_β_cmd | `cos`/`sin` in evaluate | OK |
| `Product16` | × | cos(α)·cos(β) → Mux[1] | in v_cmd[0] | OK |
| `Product17` + **`Unary Minus1`** | × then − | −sin(α)·cos(β) → Mux[3] | v_cmd[2] sign | OK |
| `Product15` | mat×vec | F′_S = APᵀ · v_cmd | `Product15` matrix_multiply | OK after APᵀ |
| `Demux2` | 3 | v_x, v_y, v_z | demux Product15 | OK |
| **`Unary Minus`** | − | −v_z into atan2 | in `atan2(-vz,vx)` | OK |
| `Trig Function5` | atan2 | Chi_Y rad (+ SMCY) | Chi_Y evaluate | OK |
| `Divide4` + `Trig Function2` | atan(v_y/√(1−v_y²)) | Chi_Z rad (+ SMCZ) | Chi_Z evaluate | OK |
| `+/- 45 degree limit` | sat | Chi_Z deg | sat in TS / plant | OK |
| `Angle Conversion*` | rad→deg | DSM write path | ×180/π | OK |

## χ_α / χ_β from ΔV

| MDL block | Op / Inputs | Role | Obliq | Status |
|-----------|-------------|------|-------|--------|
| `Demux1` | 3 | ΔV components after Add10 | dVx/dVy/dVz | OK shape |
| `Divide3` | */ | ΔV_x / ΔV_z | `atan(dVx/dVz)` | OK |
| `Trig Function4` | atan | **χ_α** | `chi_a_rad` | OK formula |
| `Divide2` | */ | ΔV_y / √(ΔV_x²+ΔV_z²) | `chi_b` | OK |
| `Trig Function3` | atan | **χ_β** | `chi_b_rad` | OK |
| `Add12` | **`+---`** | χ_α − rateΔ − φ_T − π/2 | `chi_a_cmd` | OK |
| `const` | `pi/2` | Add12 port 4 | `π/2` | OK |
| `Add14` | `+-` | χ_β − rateΔ | `chi_b_cmd` | OK |

## Estimated Velocity-to-be-gained (`<S384>`) — **structural miss**

| MDL block | Op / Inputs | Role | Obliq | Status |
|-----------|-------------|------|-------|--------|
| In `V_TV_bar` | const `[0,0,V_T]` | target vel | `IGM_V_T_MPS` on z | OK |
| In `G_TV_bar` | const `[Xdotdot_VGT,0,0]` = **[-9.251,0,0]** | target “G” | `IGM_XDOTDOT_VGT` | OK value |
| In `V_V_bar` | Product9 = Rot_φ·(AP·V_S) | V in φ | `Vt_*` from Rot·(AP·VS) | OK |
| In **`G_V_bar`** | **Product10 = Rot_φ·(AP·G_S)** | **gravity in φ** | `Gt_*` from Rot·(AP·G_S) | **Fixed** (was A_m) |
| `Add8` | ++ | G_T + G_V | half-sum in evaluate | OK shape |
| `Gain` | 0.5 | ½(G_T+G_V) | `0.5*(…)` | OK |
| `Product12` | × | T★ · ½(G_T+G) | in dV evaluate | OK |
| **`Add9`** | **`+--`** | **ΔV′ = V_T − V − T★·½(G_T+G)** | `igmDeltaV` / dV0* | OK shape; **wrong G input** |

RTW (`<S384>/Add9`):

```text
Add9 = V_T - Product9(V_φ) - T_star * 0.5 * (G_TV + Product10(G_φ))
```

`Product10` input is S-frame **gravitational** accel (`rtb_Add1_p` from `<S425>`),
**not** `XYZdotdot` / PIPA / `A_m`.

## Outer Add10 (ΔV used for χ_α)

| MDL block | Op | Role | Obliq | Status |
|-----------|-----|------|-------|--------|
| `Add10` | `+-` | ΔV_χ = ΔV′ − (Gain5_k·Gain1_h)·½(G_T+G) | recompute dV at T1+T3_eff | Equiv. **if same G** |
| Gain1_h path | from raw Add9 | (|ΔV′|²/L_y − L_y)/2 | `Gain1_h` from dV0 | OK |

## S420 quadratic / rate terms

| MDL / RTW | Uses | Obliq | Status |
|-----------|------|-------|--------|
| `ΔX_V`, χ̇_β nums | Product8(R_φ), Product9(V_φ), **Product10(G_φ)** | R, V, **G from G_S** | **Fixed** |

## Pre-IGM / out of scope here

| Item | Notes |
|------|-------|
| Time-Tilt → Chi DSM | RTW writes ~−40…−61° before enable; Obliq holds 0 |
| S-frame G model | Obliq point-mass; RTW J2/J3/J4 (`<S425>`) — residual after G-wire fix |
| SMCY/SMCZ | Bypassed; Gain3 still A_m/quant issue |

## Fix order

1. ~~Wire **G_S** (not `A_m`) into Product15 ΔV / S420 gravity slots.~~ **done** (`G_S_mps2` port; LVDC wires `G_S_bar_mps2`).  
2. Keep APᵀ on terminal Product15.  
3. **Next:** regen plant JSON + dual IGM trace; compare `chi_a_rad` / `dVx,dVz` at t≈500.  
4. Only then chase J2 gravity (`<S425>`) / residual Add10 numerics.

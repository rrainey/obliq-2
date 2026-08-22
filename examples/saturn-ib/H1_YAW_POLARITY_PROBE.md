# H-1 yaw polarity probe (no Chi_Z closed loop)

## Plant TVC (as205Engines)

Undeflected thrust +X. Yaw gimbal `β_Y`:

- `F ≈ T · […, sin(β_Y), …]`
- About CG with `CG_x > 0`: **`Mz ≈ −(T/2)·CG_x·sin(β_Y)`** (outer half)

Verified in `__tests__/as205-engines.test.ts`:

| β_Y | Fy | Mz |
|-----|----|----|
| +2° | >0 | **<0** |
| −2° | <0 | **>0** |

## Implication for Ψ_Y → β_Y

If attitude error **Ψ_Y > 0** means nose is to +Y of Chi_Z cmd, a restoring yaw moment is **Mz < 0** under this sign convention → need **β_Y > 0**.

Therefore the FCC map should be closer to:

```text
β_Y = +Kp_yaw · Ψ_Y_rad + Kd · R
```

not the pitch-style `β_Y = −Kp · Ψ_Y` used in the failed closed-loop attempts.

Pitch remains `β_P = −Kp · Ψ_P` (elev e ≈ −Ψ_P).

## Status

- Chi_Z closed-loop **parked** (NaN even with sat asin + Kp=2).
- Next yaw retry: sat(Θ_Y,±45) + **`+Kp_yaw·Ψ_Y`** + soft Kp + optional Chi_Z enable delay after IGM on.
- Rate-only `β_Y = +Kd·R` on the live plant is unchanged (stable damping polarity).

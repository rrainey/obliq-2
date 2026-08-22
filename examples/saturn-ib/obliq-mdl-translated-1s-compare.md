# MDL→Obliq full-stack status

## Recent translator fixes

| Fix | Effect |
|-----|--------|
| Quat normalize Constant default **1** | \|q\|≈1 through tumble onset |
| COESA ports **T,a,P,ρ** + q̄=`½ρV²` | aero no longer blows at <1 s |
| Constant vector mask tokens (`mpr_deg`) | H-1 mount clocking 0/−90/−180/−270 |
| EOM C vs TS residual | **PASS** (max \|Δ\|~1e−19) |

## Codegen parity progress (not flight diagnosis)

| Fix | Effect on generated C |
|-----|------------------------|
| TransferFcn Num/Den | Actuators 3rd-order; FCC poles match RTW |
| DstPort `trigger`/`enable` → enable pin −1 | Cleared 52× `MULTIPLE_INPUT`; timers no longer fan-in |
| EnableEvaluator `flattenedName` | Enable exprs compile against scoped signals |

Probe (`/tmp/mdl2obliq/cgen-fs5`): rates at t=10 dropped ~100× vs TF-only build; NaN ~32 s (was ~25 s). Remaining gaps: sheet_label (~24), lookup monotonicity (6), residual unwired enables (~34).

See `RTW_VS_OBLIQ_CODEGEN_DISPARITY.md`.

# saturn_ib_stack_translated compile progress

| Build | Errors | Notes |
|-------|--------|-------|
| cgen5 | 464 | baseline after quat/sincos/DSM |
| cgen6 | 292 | portName match, Product wired |
| cgen9 | 217 | MES SinCos vector + Mux[6] + Fcn u(i) |
| cgen10 | 152 | units passthrough, euler vector |
| cgen14 | 43 | scalar×vector broadcast |
| cgen16 | 22 | Mux9 parent-aware 3x3 vs flat[9] |
| cgen19 | 9 | multi-wire type prefer dimensional |
| **cgen27** | **0** | **clean compile + smoke ok** |

## Success (2026-08-19)

```bash
npx tsx scripts/mdl-emit.ts saturn-1B/saturn_ib_stack.mdl --out /tmp/mdl2obliq
npx tsx scripts/obliq-cgen.ts /tmp/mdl2obliq/saturn_ib_stack_translated.json \
  --out /tmp/mdl2obliq/cgen27 --name saturn_ib_stack_translated --compile
# → libsaturn_ib_stack_translated.a + saturn_ib_stack_translated_smoke
# smoke ok steps=10 time=0.05
```

## Next: RTW ↔ Obliq batch_sim compare

Hook `saturn_ib_stack_translated` into batch_sim against FTW/RTW trajectories.

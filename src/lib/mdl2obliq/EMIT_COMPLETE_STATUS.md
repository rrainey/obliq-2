# Goal: emit complete MDL → Obliq-2 C model + RTW compare

**Status 2026-08-19 — compile green; batch compare pipeline live**

## Done

| Step | Result |
|------|--------|
| Map every block in `Saturn_IB_Stack` | **3444 / 3444** `mapBlock` OK (no stubs) |
| Strict emit JSON | `/tmp/mdl2obliq/saturn_ib_stack_translated.json` |
| CLI | `npx tsx scripts/mdl-emit.ts saturn-1B/saturn_ib_stack.mdl --out /tmp/mdl2obliq` |
| **Clean C compile** | **cgen27: 0 errors**, `libsaturn_ib_stack_translated.a` + smoke |
| Smoke | `smoke ok steps=10 time=0.05` |
| RTW adapter profile | `--profile saturn-ib-stack` wires LaunchDate/A_z/CG/q + outs |
| Batch final.json | smoke writes `final-ic.json` + `final.json` (`--duration` / `--out`) |
| Compare vs FTW | `scripts/compare-final-json.ts` vs `reference-1000s-final.json` |

### Compile path (reproduce)

```bash
npx tsx scripts/mdl-emit.ts saturn-1B/saturn_ib_stack.mdl --out /tmp/mdl2obliq
npx tsx scripts/obliq-cgen.ts /tmp/mdl2obliq/saturn_ib_stack_translated.json \
  --out /tmp/mdl2obliq/cgen-batch --name saturn_ib_stack_translated \
  --profile saturn-ib-stack --dt 0.005 --compile
/tmp/mdl2obliq/cgen-batch/build/saturn_ib_stack_translated_smoke \
  --duration 1 --out /tmp/mdl2obliq/obliq-1s-final.json
npx tsx scripts/compare-final-json.ts \
  --ref ~/src/viper/ApolloA/reference-1000s-final.json \
  --model /tmp/mdl2obliq/obliq-1s-final.json \
  --out /tmp/mdl2obliq/compare-1s-vs-rtw1000.md
```

### First comparative result (1 s vs 1000 s reference)

- **Pipeline works**: final.json emitted; compare report written.
- **bLiftoff** matches `true` at 1 s.
- Trajectory / attitude / later events **FAIL** vs 1000 s FTW (expected at 1 s; also Xe_z currently blows up ~1e33 — EOM/IC wiring still wrong for numeric drop-in).

See `COMPILE_PROGRESS.md` for error-count history (464 → 0).

## Remaining for numeric drop-in FTW

1. **Integrator IC timing** — pad `Initial_Conditions_Product` must load into `xe_ye_ze` before/at first step (today IC snapshot is zeros; live Xe comes late/unstable).
2. **Xe_z blow-up** — diagnose stage enable / force path / DCM after 1 s.
3. **Out11 PortDimensions** — MDL outport lacks dims; emit as bus/vector from upstream mux.
4. **Long run** — 1000 s batch once IC/EOM stable; gate with `--rel 0.005`.
5. Warnings: array-bounds on some Mux Fcn indices; unused LUT tables.

## Intentionally deferred

- Artificial elev/tip laws on hand plant
- mdlWire on live `saturnIbObliqPlant` (tumbles until polarity fixed)

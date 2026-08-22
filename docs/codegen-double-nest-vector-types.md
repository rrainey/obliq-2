# Double-nested subsystem vector type loss

**Status:** **Fixed** (2026-08-18) — recursive port remap in `ModelFlattener.removeSubsystemPorts`  
**Area:** `ModelFlattener` (was misdiagnosed as TypePropagator alone)  
**Seen:** 2026-08-18 (Saturn-IB Obliq plant / LVDC IGM Product15 attempt)  
**Regression:** `__tests__/codegen/model-flattening.test.ts` → `double-nested matrix_multiply keeps vector type`

## Symptom

When a **vector-producing** block (`matrix_multiply`, `mux` → `double[3]`, etc.) lives in a subsystem that is itself nested inside another subsystem (depth ≥ 2 from the model root), generated C treats the signal as a **scalar**. Downstream `demux` then fails to compile:

```text
error: subscripted value is neither array nor pointer nor vector
  model->signals.…_V_AP[0] = …
```

Flattened names still show the nesting (e.g. `LVDC_IGM_IGM_Product15_Chi_V_AP`), but the **declared type** is wrong.

## Workarounds in use today (not acceptable long-term)

| Location | Workaround |
|----------|------------|
| `saturnIbObliqPlant.ts` | Live EOM / H-1 / aero placed as **root siblings** instead of under S-IB Stage; stage shell is stubs only |
| IGM Product15 | Cannot nest `IGM_Product15_Chi` under `LVDC_IGM`; must inline or hoist to root |

Comments already call this out:

```1134:1138:examples/saturn-ib/saturnIbObliqPlant.ts
/**
 * S-IB Stage: Simulink-named stub children for structure.
 * Live EOM + H-1 + aero are **root siblings** (see buildSaturnIbObliqPlant) because
 * codegen currently loses vector types through double-nested subsystems.
 */
```

## Why it must be fixed

1. **MDL parity** — Saturn-IB (and any real model) uses deep subsystem trees; forcing everything to root defeats the flattener’s purpose.
2. **IGM / Product15** — Chi path needs `AP·(R,V,A)` → demux inside LVDC; nesting is the natural structure.
3. **Correctness** — Silent scalarization is worse than a hard error if it ever “compiles” with wrong math.

## Root cause (fixed)

`removeSubsystemPorts` remapped **one** subsystem boundary only. A wire
`root → Outer → Inner → matrix_multiply` stopped at the dissolved `Outer__Inner`
subsystem id (`non-existent target block`), so `matrix_multiply` had **no typed
inputs** and `getOutputType` fell back to scalar `double`.

**Fix:** `resolveSourceThroughSubsystems` / `resolveTargetThroughSubsystems`
walk nested port maps until a real flattened leaf block.

## Acceptance criteria

1. ~~Regression test: root → Outer → Inner `matrix_multiply` → `double[3]`~~ **Done**
2. Depth 3+ port chains (covered by recursive resolve; add explicit test if needed)
3. Saturn plant can move EOM/H-1/aero back under S-IB Stage (follow-up)
4. `IGM_Product15_Chi` can nest under `LVDC_IGM` (follow-up — resume Product15)

## Related

- Gap matrix / Saturn notes: hoist workarounds until this lands
- `examples/saturn-ib/igmProduct15Obliq.ts` — written assuming inline/hoist until this fix

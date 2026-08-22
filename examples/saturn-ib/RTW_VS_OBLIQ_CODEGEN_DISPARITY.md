# RTW vs Obliq codegen disparity catalog

Focus: **what differs in the two generated models / C**, not flight trajectory diagnosis.
Artifacts compared:

| Side | Path |
|------|------|
| RTW | `/home/riley/src/viper/lib_SaturnIB/Saturn_IB_Stack_grt_malloc_rtw/Saturn_IB_Stack.c` (~13k LOC) |
| Obliq | `/tmp/mdl2obliq/cgen-fs3/saturn_ib_stack_translated.c` (~15k LOC) |
| Manifest | `/tmp/mdl2obliq/cgen-fs3/cgen-manifest.json` (198 warnings) |
| MDL | `/home/riley/src/viper/simulink/saturn_ib_stack.mdl` |

**Bottom line:** 6DoF plant algebra (ω̇, q̄ on S-IB, quat normalize) is largely aligned. The large structural gaps are in **control/actuator TransferFcn parameter emission**, **wiring (multi-input / Goto)**, and **enable gating**. Those alone are enough for the stacks to diverge even when the EOM RHS matches.

---

## Matches (should be similar — and are)

| Area | RTW | Obliq | Notes |
|------|-----|-------|-------|
| S-IB ω̇ | `I` diagonal → `rt_MatDivRR_Dbl` of net torque | `inertia_diag_pack` → element-wise `1/I_i` | Equivalent for principal-axis I |
| Idot | zeros concatenated then selected | `Ground` → Idot slots | Same |
| Body accel Sum | `v×ω + F/m` | same Sum shape | Same |
| S-IB q̄ | `0.5 * V² * SFunction_o4(ρ)` | `0.5 * ρ * V * V` | Same |
| Quat normalize | `1.0 - \|q\|²` then Fcn qdot | Constant=1 − DotProduct | Same shape |
| H-1 mount clocking | — | `0/−90/−180/−270` after `mpr_deg` fix | Aligned with mask intent |
| Isolated EOM C↔TS | — | max\|Δ\| ~1e−19 | Plant core OK |

---

## Critical mismatches (code / model structure)

### 1. TransferFcn parameters dropped → wrong dynamics (highest impact)

**MDL** (`A Actuator`):

```text
BlockType    TransferFcn
Name         "A Actuator"
Denominator  "[0.00001942 0.0007963 0.05576 1]"
```

**Obliq JSON:** `parameters: {}`  
**cgen-manifest:** 64× `INVALID_TF_NUMERATOR` / `INVALID_TF_DENOMINATOR` across **32** TF blocks (all H-1 A/B actuators, FCC attitude/rate/accel filters, body-rate gyros, rate modulators, J-2 actuators).

**Generated C:**

| | RTW | Obliq |
|---|-----|-------|
| A Actuator order | **3** states (`AActuator_CSTATE[3]`) | **1** state |
| Poles / gain | e.g. `5.15e4`, `-41`, `-2.87e3`, … | fallback `ẋ = 1·u − 1·x` (τ≈1 s) |
| FCC Transfer Fcn3 | pole **6.313…**, out = `6.313·x` | same 1/(s+1) fallback |

**Root cause in translator:** `TransferFcn` is marked `MAPPED` in `coverage.ts` but has **no `case` in `mapper.ts`**. The default branch emits:

```ts
return { type: e.obliqType, name, parameters: {} }  // drops Numerator/Denominator
```

So Obliq C cannot resemble RTW for any path through actuators or FCC filters until TF params are mapped.

---

### 2. MULTIPLE_INPUT_CONNECTIONS (wiring fan-in) — **fixed**

**Was:** 52× fan-in errors (timers, Chi, IGM, …).

**Cause:** MDL `DstPort "trigger"` / `"enable"` was parsed as `Number(...)→NaN→1`, colliding with data Inport 1 (e.g. both `bStart→trigger` and `Clock→1` on Timer Initialization).

**Fix:** `parseMdl` keeps `dstSpecial`; `emitObliq` routes those wires to enable pin `targetPortIndex: -1`. `EnableEvaluator` uses `flattenedName` for enable source exprs.

**Now (cgen-fs5):** `MULTIPLE_INPUT` = **0**. Tests: `__tests__/mdl2obliq-trigger-enable.test.ts`.

---

### 3. Goto/From (sheet_label) broken

**22** connections reference non-existent `sheet_label_source_*` / `sheet_label_sink_*` (cross-sheet tags between S-IB, S-IVB, IU/LVDC). Those wires are missing or dangling in Obliq vs RTW’s resolved Goto/From network.

---

### 4. Enabled subsystems: enable pin unwired

**27** unique enabled subsystems report *“has enable input but no enable wire connected”* (listed twice in manifest → 54). Includes:

- `S_IB_Stage`, `S_IVB_Stage`  
- All H-1 Triggered Timer inits, retrorockets  
- IGM, IGM Chi Steering, SMCY/SMCZ, Chi Time-Tilt store  
- T1–T4 Timer Initialization  

Obliq init sets `enable_states.* = 1` and leaves them on. RTW gates derivatives to zero when a stage/subsystem is disabled (`/* zero derivatives to prevent integration while disabled */`). Structural difference: both stages / IGM / timer inits can run concurrently in Obliq.

---

### 5. FCC gain lookup tables not strictly increasing

**6** `LOOKUP_NOT_MONOTONIC` warnings: `a0_deg_deg`, `a0_roll`, `a1_*`, S-IV variants. RTW interpolates the same breakpoints; Obliq codegen rejects or mishandles non-monotonic axes → gain schedule path differs.

---

### 6. Multi-rate vs single-rate (secondary)

RTW sample hits: **0.005 s**, **0.04 s**, **0.8 s**, **1.6 s**.  
Obliq smoke/batch: everything stepped at **0.005 s** (no `rtmIsSampleHit` gating). Discrete Memory/UnitDelay and LVDC/IGM cadence will not match RTW even if continuous algebra matched.

---

## Explicitly *not* the main plant gap

Earlier suspicion that RTW `rt_MatDivRR_Dbl` vs Obliq `1/I_i` was a plant bug is **not** a material mismatch here: RTW builds a **diagonal** I (`Ixx,0,0 / 0,Iyy,0 / 0,0,Izz`) then MatDiv; Obliq packs the same diagonals. Isolated EOM residual already PASSed.

S-IVB dynamic pressure → `Ground2` (0) in Obliq matches RTW’s S-IVB `urhoV2 = V² * 0.0 * 0.5` during S-IB flight.

---

## Priority fix order (translator / model graph)

1. **`TransferFcn` Num/Den mapping** — **Done**.  
2. **`MULTIPLE_INPUT` / DstPort `trigger`\|`enable`** — **Done**.  
3. **UI validation parity (2026-08-20)** — **Done for the reported 25**:
   - Hierarchical sheet labels (nested global Goto)
   - `RelationalOperator`/`Logic` → `bool`
   - Mux vector→scalar demux expand (Out11 → `double[25]`)
   - Enable-pin bool cast on trigger lines
   - Empty subsystem `outputPorts` (no phantom `y`)
   - `mdl:emit` runs `validateModelTypeCompatibilityMultiSheet` and **exits 1** on errors (`--skip-validate` escape)
4. **Remaining Obliq validation (~40)** — Demux1–5 scalar inputs + Product/Sum type prop inside engines/FCC (not the original From/Mux/enable set).  
5. **FCC lookup monotonicity** — 6× `LOOKUP_NOT_MONOTONIC` (codegen warnings).  
6. **Optional:** multi-rate sample hits.

Import latest: `/tmp/mdl2obliq/saturn_ib_stack_translated.json`

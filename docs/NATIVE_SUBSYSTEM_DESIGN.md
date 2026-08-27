# Native Subsystem — Design Note

**Status:** Draft for implementation  
**Date:** 2026-08-27  
**Palette name:** Native Subsystem  
**JSON `codeGenStrategy`:** `native`  
**Native code root (app / Wasm):** `~/.obliq/native/`  

---

## 1. Goal

Allow a developer to replace an Obliq subsystem body with **hand-written C** that implements the **same ABI** Obliq already generates for **segregated (atomic) subsystems**, while the parent model only sees a typed port boundary.

Primary use case: surgically fork the Saturn **LVDC** (today flattened inside `saturn_ib_stack`) into a Native Subsystem so boost-to-orbit guidance can be debugged in C without fighting block semantics.

---

## 2. Decisions (locked)

| Topic | Decision |
|-------|----------|
| Scheduling | **Atomic** — one opaque evaluation hit per sample (same as `segregated_atomic`) |
| Data across boundary | **Ports only** (v1). No Obliq data-store / Goto accessors inside native C |
| C ABI | **Identical** to segregated subsystem modules from `SubsystemCodeGenerator` |
| Visibility | Parent graph shows **one** Native Subsystem block + its ports; internal LVDC hierarchy lives only in C |
| App native store | `~/.obliq/native/<module>/` |
| Export build | Per-export `native/` → `libnative.a` linked into the simulation |
| Authoring | Skeleton download **and** fork-from-generated **and** drop-in existing tree |
| Generated JSON | All generated subsystems set **`showPortNames: true`** (Obliq JSON / mdl2obliq going forward) |

If a future ABI must differ from segregated, that delta needs an explicit justification in this doc.

---

## 3. Relationship to existing strategies

| `codeGenStrategy` | Parent sees | Body |
|-------------------|-------------|------|
| `flatten` (default) | Inlined blocks | Generated from blocks |
| `segregated` / `segregated_atomic` | Opaque call | Generated `.c`/`.h` module |
| **`native`** | Opaque call (**same call sites**) | **User** `.c`/`.h` under `native/<module>/` |

Implementation intent: treat `native` like `segregated_atomic` in `ModelFlattener` / parent codegen (placeholder block, input copy, `*_compute_outputs`, state sync), but **skip** `SubsystemCodeGenerator` for the body and **link** `libnative` instead.

---

## 4. C ABI (must match segregated)

For module sanitized name `Name` (e.g. `LVDC`):

### 4.1 Types (header)

```c
typedef struct { /* typed input ports */ } Name_inputs_t;
typedef struct { /* typed output ports */ } Name_outputs_t;
typedef struct { /* internal signals; may be minimal for native */ } Name_signals_t;
typedef struct { /* continuous / discrete states */ } Name_states_t;

typedef struct {
    Name_inputs_t  inputs;
    Name_outputs_t outputs;
    Name_signals_t signals;
    Name_states_t  states;
    int enabled;  /* 1=enabled, 0=disabled (frozen outs when 0) */
} Name_t;
```

Port field types use Obliq declarations (`double`, `double[3]`, `double[3][3]`, `bool`, …).

### 4.2 Functions

```c
void Name_init(Name_t* model);
void Name_compute_outputs(Name_t* model);
void Name_compute_derivatives(const Name_t* model, Name_states_t* derivatives); /* if hasState */
void Name_reset_states(Name_t* model); /* if hasResetInput */
```

Parent call pattern (unchanged from segregated):

1. Copy wire values → `model->Name.inputs.*`
2. Set `model->Name.enabled` if enable port present
3. If enabled: `Name_compute_outputs(&model->Name)`
4. Downstream reads `model->Name.outputs.*`
5. RK4 stages also call `Name_compute_derivatives` when `hasState`

**No new macros required for v1** beyond what segregated bodies already assume (`dt` passed at parent init into model context as today). If LVDC needs sample-tick / enable-scope helpers, add thin wrappers in the native public header that mirror existing flattened-model helpers — document any addition here.

---

## 5. Block / JSON shape

```json
{
  "type": "subsystem",
  "name": "LVDC",
  "parameters": {
    "codeGenStrategy": "native",
    "nativeModule": "lvdc",
    "showEnableInput": true,
    "sampleTimeSec": 1.6,
    "inputPorts": [
      { "name": "…", "dataType": "double[3]" }
    ],
    "outputPorts": [
      { "name": "…", "dataType": "double" }
    ]
  }
}
```

**v1 requirement:** every port carries an explicit `dataType` (string or `{name, dataType}` objects). Validator rejects missing types. This feeds type propagation and avoids bare-`double` demux issues on the boundary.

Empty inner `sheets` are allowed for a pure native block (ports-only shell). Fork workflow may keep sheets temporarily for port sync, then clear or ignore them when strategy is `native`.

---

## 6. Directory layout

### 6.1 App / Wasm (`~/.obliq/native/`)

```text
~/.obliq/native/
  CMakeLists.txt                 # builds libnative.a / libnative for Wasm
  lvdc/
    lvdc.h                       # public ABI (identical shape to segregated)
    lvdc.c                       # implementation (forked or hand-written)
    CMakeLists.txt               # OBJECT/STATIC for this module
    README.md                    # optional provenance (fork date, source model)
```

### 6.2 Exported desktop cgen

```text
<export>/
  saturn_ib_stack.c / .h         # parent (Obliq-generated)
  native/
    CMakeLists.txt               # → libnative.a
    lvdc/                        # copy or symlink of module sources
  CMakeLists.txt                 # target_link_libraries(... native)
```

Developer contract for export: drop matching module sources + cmake fragment into `native/`; top-level build links `libnative.a`.

---

## 7. LVDC fork workflow (Saturn)

Goal: parent model exposes **one** Native Subsystem; C retains today’s LVDC hierarchy (flattened inside the module).

1. **Isolate in Obliq**  
   On `saturn_ib_stack.json`, set the LVDC (or `LVDA_LVDC` / agreed root) subsystem  
   `codeGenStrategy` → **`segregated_atomic`**.  
   Ensure boundary ports are explicitly typed.

2. **Regenerate full stack cgen**  
   Parent now calls `LVDC_compute_outputs` (name TBD from sanitize) instead of inlining.  
   Emit `LVDC.c` / `LVDC.h` via existing `SubsystemCodeGenerator`.

3. **Promote to native**  
   Copy generated module → `~/.obliq/native/lvdc/` (or export `native/lvdc/`).  
   Optionally strip unused `signals` fields later; **do not** change the public function signatures.

4. **Swap strategy**  
   Set that subsystem to `codeGenStrategy: "native"`, `nativeModule: "lvdc"`.  
   Clear or ignore inner sheets for editing in the UI (implementation detail).

5. **Rebuild**  
   Parent links `libnative`; iterate on `lvdc.c` with normal C tooling.

At step 4 the **C-language interface must look identical** to step 2. Any rename (`LVDC_t` vs `lvdc_t`) must be an explicit, documented choice — default is **keep segregated sanitized names**.

---

## 8. Skeleton generation (v1 deliverable)

At Native Subsystem creation (UI) or via CLI:

**Inputs:** module id, sanitized C name, port list + types, flags (`hasEnable`, `hasState`, `hasReset`).

**Outputs** under `~/.obliq/native/<module>/`:

| File | Content |
|------|---------|
| `<name>.h` | structs + prototypes (same shape as `SubsystemCodeGenerator`) |
| `<name>.c` | `init` zeros structs; `compute_outputs` empty/stub; derivatives stub if stateful |
| `CMakeLists.txt` | `add_library(<module> OBJECT …)` |
| update `~/.obliq/native/CMakeLists.txt` | `add_subdirectory` + aggregate into `native` static lib |

CLI sketch:

```bash
npx ts-node scripts/generate-native-skeleton.ts \
  --module lvdc --name LVDC \
  --in "R_S:double[3]" --out "Chi_Y_deg:double" \
  --enable --stateful
```

Fork helper (follow-on): `--from-segregated-dir /tmp/.../LVDC` copies generated files into native root.

---

## 9. Codegen / flattener checklist

- [ ] `ModelFlattener`: `codeGenStrategy === 'native'` → opaque placeholder like segregated; record `NativeSubsystemInfo` (ports, module id, sanitized name, enable/state flags). **Do not** run internal block flatten for body.
- [ ] Parent `HeaderGenerator` / state struct: embed `Name_t Name;` like segregated.
- [ ] Parent `InitFunctionGenerator`: call `Name_init`.
- [ ] Parent `AlgebraicEvaluator`: same input-copy + `Name_compute_outputs` as segregated.
- [ ] Parent `RK4Generator` / derivatives: call `Name_compute_derivatives` when `hasState`.
- [ ] `CodeGenerator`: for native modules, emit `#include "native/<module>/<name>.h"` (or install interface include path) and link `native`; **do not** emit body `.c`.
- [ ] Export cmake template: add `native/` subdirectory + `libnative`.
- [ ] Wasm build: compile objects from `~/.obliq/native/**` into the Wasm link (v1: system-wide root).
- [ ] Validator: require typed ports; unknown `nativeModule` / missing `~/.obliq/native/<module>/<name>.h` → error (or warning in editor until build).

---

## 10. Non-goals (v1)

- Data-store / Goto bridging into native C  
- Hot-reload of native `.c` without rebuild  
- Multiple conflicting modules with the same sanitized symbol in one process  
- GUI block diagram inside a native subsystem  

---

## 11. Implementation order

1. **This design note** (done).  
2. **Skeleton generator** + `~/.obliq/native` cmake aggregate (no full editor polish).  
3. **Flattener / parent codegen** recognition of `native` (call sites ≡ segregated).  
4. **Saturn experiment:** segregated_atomic isolate → copy to native → flip strategy.  
5. Editor: Native Subsystem create dialog (typed ports + download skeleton).  

**Saturn gate status (2026-08-27):** `LVDA_LVDC` segregated_atomic is **bit-identical** vs flatten on tm904/lla through t_flight 620 (sep/IGM Chi + terminal Add12/Add14 latch). Practical UI/export checklist for the Native dialog: [`LVDA_LVDC_SEGREGATED_STATUS.md`](./LVDA_LVDC_SEGREGATED_STATUS.md) §7.

---

## 12. Open items (non-blocking)

- Exact LVDC root block name in `saturn_ib_stack.json` for the surgical cut — **`LVDA_LVDC`** is the working root.  
- Whether forked `signals_t` stays fat (generated) or is slimmed once hand-edited.  
- Model-scoped native override later (`<project>/.obliq/native` shadowing `~/.obliq/native`).  
- ~~Late flatten↔seg χ at t_flight ≈610–615~~ — closed (terminal Chi latch in segregated modules).  

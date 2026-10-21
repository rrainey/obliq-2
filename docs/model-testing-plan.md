# Testing Generated Code: Assertions, a Test Runner, and Model References

Status: plan, decisions confirmed, not yet implemented (October 2026).

## Goal

A model that will be deployed as C code (the **deployable**) should be testable by any number of separate **test models**. Each test model:

- embeds the deployable;
- drives its inputs;
- states what its outputs must do;
- runs with its own duration, time step and integrator;
- passes or fails, in the editor and from the command line.

Two features deliver this:

- **Part A, test verdicts:** an Assert block and a headless test runner. They are useful on their own, in any model, and are built first.
- **Part B, model references:** a block that embeds another saved model, read-only, edited by opening that model in its own tab.

### Deliberately out of scope

These are left out to keep the number of new ideas small for users:

- Editing an embedded model in place from its parent.
- Changing an embedded model's parameters per instance.
- Marking a subsystem as the "deployable" part of a model and exporting only it ("option 1"). This is deferred until there is a clear need.
- Bundling a test model with its dependencies on export.
- A WASM-based runner. The runner uses the native C toolchain.

---

## Part A: Test verdicts

### A1. The Assert block

A sink block in the **Display & Logging** group. When the simulation runs, it checks a condition at every major time step and records whether it ever failed.

**Inputs and modes** (one block type with a Mode parameter, not three block types):

| Mode | Inputs | Fails when |
|---|---|---|
| Within bounds | `u` | `u < Lower` or `u > Upper` |
| Near expected | `u`, `expected` | `|u − expected| > AbsTol + RelTol·|expected|` |
| True | `u` (bool or number) | `u` is false or 0 |

Vectors and matrices are checked element by element; the block fails if any element fails.

**Other parameters:**
- **Check from / until (s):** the check window. The defaults are 0 and ∞. A step response, for example, only has to settle after 2 s.
- **On failure:** *Record and continue* (the default), or *Stop simulation*.

**What it records:**
- the number of failed steps;
- the time of the first failure;
- the failing value at that time;
- the worst violation margin;
- the number of steps checked.

A block that checked no steps reports **not checked**, not passed. This catches a check window that lies beyond the run's duration.

**Generated C:**
- Each Assert adds a small struct to the model struct, plus a model-wide `assert_failures` count and a `stop_requested` flag.
- The check runs inside `evaluate_algebraic`. RK4 snapshots the model before its intermediate stages and restores it afterwards, so only the full-step evaluation is kept. No extra guard is needed, but this needs a test.
- Blocks with a sample time check only on the steps where they run.
- The header gets a results table: `<model>_assert_count()` and `<model>_assert_result(model, i, &r)`. Each entry carries the block name, the sheet path, the status and the recorded values.

**WASM:**
- `wasm_get_assert_count` and `wasm_get_assert_result_*` are exported, plus `wasm_stop_requested`.
- They must be added to `EXPORTED_FUNCTIONS` in both compile routes and both test harnesses.
- `CODEGEN_VERSION` must be bumped.
- The worker's step loop, the main-thread fallback loop and `ServerWasmExecutor` all check `stop_requested`.

**Exported C (Generate Code):** Assert code is wrapped in `#ifdef OBLIQ_ASSERTS`, which is off by default. Test checks therefore never run in deployed code, but a user can turn them on in their own build.

**Registering the block:** follow the Random Noise commit (`bd37e5f`, 17 files). An Assert is a sink, so it also needs the sink lists in:
- `signalTypePropagation.ts`, about 7 places;
- `CodeGenerationValidator` (allowed orphans);
- `multiSheetTypeValidator`;
- `useWireValidation`;
- `ModelFlattener`'s no-output check;
- `autoLayout`'s `SINK_TYPES`;
- the model-builder validate handler and `automations` minimum-input lists;
- the MCP `block-types.ts`;
- `docs/blocks-reference.md`.

### A2. Results in the editor

- After a run, the toolbar shows a summary, for example **"Tests: 5 passed, 1 failed"**, or nothing if the model has no Assert blocks.
- Clicking the summary opens a **Test Results** panel listing each Assert:
  - its status;
  - its sheet path;
  - the first failure time and value.
- Each row navigates to the block, reusing the validation dialog's navigator.
- Assert blocks show a green or red badge until the model is edited or run again.
- A run stopped by an Assert says so, for example "Stopped at t = 3.42 s: Assert `AltitudeHolds` failed".

### A3. Headless test runner

```
npm run obliq:test -- [model name | model id | path.json] ... [--all] [--json] [--junit out.xml]
```

**How it works:**
- It builds natively, extending `__tests__/support/nativeCgen.ts`. That needs gcc and cmake only, with no Docker and no server.
- It generates a `main` that:
  - runs the model with its saved `globalSettings` (time step, duration, integrator);
  - stops early if `stop_requested` is set;
  - prints the assert results table as JSON.
- Step count: `round(duration / dt)` is used everywhere. The browser now uses `floor` and `ServerWasmExecutor` uses `ceil`; both change to match.
- Models are resolved from the local store (`getStorage()`), so model references (Part B) resolve the same way they do for the editor.

**Selecting models and reporting results:**
- `--all` runs every stored model that contains an Assert block.
- The output is a one-line summary per model and a failure list.
- `--json` gives machine-readable results. `--junit` writes JUnit XML for CI.

**Exit codes:**
- `0` when every Assert in every model passed.
- `1` when any Assert failed or was not checked.
- `2` when a model could not be built.

**Native and browser results:** they come from the same generated C, but different compilers can differ in the last bits. Assert tolerances absorb this, and the runner's own tests run one model both ways to check.

**Later:** a `test` action on `/api/automations`, and an MCP `run_tests` tool, wrapping the same runner.

### A4. Milestones

1. Assert block, generated C and the results table, with native tests for:
   - each mode;
   - the check window;
   - stopping early;
   - RK4 minor stages not counting;
   - multi-rate models.
2. WASM exports, Run results, the Test Results panel and block badges.
3. `obliq:test` with `--json` and `--junit`.
4. Add Assert-based tests to the FPV reference model's Telemetry sheet. Examples:
   - it arms;
   - it reaches the commanded altitude within a set error;
   - attitude follows the stick within a set error.

   This exercises the feature end to end, and gives the CHANGELOG a concrete example.

---

## Part B: Model references

### B1. What a user sees

- A **Model Reference** block in the Subsystems group.
- Its config dialog has:
  - a model picker;
  - a version choice: **Latest** (the default) or **Pinned to version N**.
- The block's ports are the referenced model's top-level Input Port and Output Port blocks. These are the same ports that model's own generated C exposes, so a test drives the deployable's real interface.
- The block renders like a subsystem but with:
  - a distinct icon;
  - the referenced model's name;
  - a version badge: `latest` or `v12`;
  - a warning badge when pinned and a newer version exists (for example "v15 available"), with an **Update to latest** action.
- **Open Model**, on double-click, the context menu and the config dialog, opens the referenced model in a new browser tab. A pinned reference opens `?version=N`, which is read-only. Nothing is edited in place.
- When a referenced model is saved in another tab, open parents that track **Latest** refresh its ports and show a brief notice. If a port disappears, its wires are flagged by validation, not deleted.
- **Missing references:** if the referenced model is missing (deleted, or a model imported without it), the block shows **Missing model** and keeps its last-known ports and wires. Choose model re-points it.

### B2. Data stored in the parent model

The block reuses `type: 'subsystem'`, so existing port handling, type checking and code generation for segregated modules apply. It is marked by:

```jsonc
"parameters": {
  "modelRef": { "modelId": "<uuid>", "version": null },   // null = latest; N = pinned
  "inputPorts": [...], "outputPorts": [...],               // last-known interface (cache)
  "modelRefName": "Motor ESC",                             // last-known name, for missing-model display
  "codeGenStrategy": "segregated_atomic",
  "sheets": []
}
```

**Latest** means the model's current saved file, which is what Save writes. Unsaved edits and autosaves in another tab are never used.

### B3. Resolving references (server side)

- Add a single **`loadModelForBuild(modelId, version)`**. It replaces the three duplicated `loadModelSource` copies (generate-code, compile-wasm, compile-wasm-stream) and the automations loader, and is also used by `obliq:test`.
- It loads the model, then recursively resolves each model reference into an in-memory expanded model:
  - the referenced model's sheets go into the block's `sheets`;
  - its parameters and module name are attached.
- It enforces:
  - **Cycles** (A embeds B embeds A) are an error naming the chain.
  - **Depth** is limited to 8.
  - A pinned version that no longer exists is an error.
- The WASM cache key includes the content hash of every resolved reference, so editing the deployable rebuilds its test models.

### B4. Code generation changes

The flattener already compiles intra-model references as `segregated_atomic` shared modules (`ModelFlattener.analyzeSegregatedSubsystem`). A resolved model reference goes through the same path, with four changes:

1. **Parameters belong to the referenced model.** Today a module uses the *host* model's parameters as global `#define PARAM_*`. For a model reference:
   - the module uses its own model's parameters;
   - they are emitted inside its `.c`/`.h` under a module prefix (`<Module>_PARAM_*`), so two models with a parameter of the same name do not collide.
   This is the largest codegen change.
2. **Module names** come from the referenced model's name, made unique if two different models share a name. Two references to the same model and version share one module. References to two different versions of the same model get separate modules.
3. **Sample time:** the referenced model's blocks run at the host's rate unless they set their own. The referenced model's own `globalSettings` (time step, integrator) are ignored when embedded; the test model's settings govern. The config dialog says so.
4. **`WasmCodeGenerator.resolveSubsystemOutput`** must resolve references. It reads `parameters.sheets` directly today, which is already a gap for intra-model references.

Data stores and Goto/From labels never cross a model boundary. Intra-model references inside the referenced model keep working, because each module is flattened against its own sheets.

### B5. Editor changes

- **Store:** hold a `referencedModels` cache in `modelStore`. It is not saved and holds each referenced model's interface: ports, port types and name. It is filled on load and refreshed through each referenced model's existing `/events` SSE stream.
- **Validation and type propagation:** use the cache for model references, as they now use the definition for intra-model references.
- **Save:** the save payload is unchanged. Only `parameters.modelRef` and the cached ports are new, and both live on the block.
- **Deleting a model:** deleting a model that others reference warns and lists the dependents. This needs a `model_dependencies` table in `obliq.db`, updated on every save and by `writeInPlace`.
- **Export:** exporting a model with references warns that the referenced models must be exported too. Bundling is left for later.
- **Import:** an import whose references don't resolve shows them as Missing model.

### B6. Known gap: tested C vs. exported C

A test model runs the deployable as a **module** inside its host. Generate Code on the deployable produces its **top-level** C, from a different generator path (`CodeGenerator` vs `SubsystemCodeGenerator`). Both are generated from the same block modules and are covered by existing codegen tests, but they are not byte-for-byte the same code.

This should be closed later. One way is to make the deployable's exported C a module plus a thin stepping wrapper, so the shipped code is exactly the tested code. A cheaper interim check: `obliq:test` can run a deployable standalone with recorded inputs and compare it with the same inputs through a test model.

### B7. Model Builder API and MCP

- **Model Builder:** add `addModelReference(sheet, modelId, version?)` and `setModelReferenceVersion`. The parameter validator must accept `modelRef`, and `addBlock` must not create default sheets for it.
- **MCP:** a matching `add_model_reference` tool.

This allows scripted test-model generation, as the FPV builder does today.

### B8. Milestones

1. `loadModelForBuild` with reference resolution, cycle detection and cache keys. Codegen changes 1–4. Native tests: a deployable with parameters, embedded twice in a test model with Assert blocks, built and run.
2. Editor:
   - the Model Reference block and its config dialog;
   - the `referencedModels` cache and validation;
   - Open Model in a new tab;
   - live refresh;
   - missing-model display.
3. Version pinning UI, the dependency table and delete/export warnings.
4. Model Builder and MCP support.
5. **Reference example:** split the FPV quadcopter into:
   - a deployable flight controller model;
   - a test model, the current sim with the airframe, sensors and Assert blocks;
   - one or two focused tests, such as a rate-loop step response against the controller alone.

   This depends on reference-model seeding learning to remap model ids between the seeded files.

## Order of work

Part A milestones 1–3 come first. They are independent and useful immediately. Part B follows, with A4 and B8.5 together as the end-to-end demonstration.

## Decisions (confirmed 2026-10-21)

1. **Assert blocks in the C export:** compiled out unless `OBLIQ_ASSERTS` is defined.
2. **Default version for a new model reference:** Latest, with pinning available.
3. **Tests changing the deployable's parameters:** not in this plan; possibly later.
4. **The tested-vs-exported C gap (B6):** accepted for now. It is documented, and there is an interim comparison test.
5. **The test runner:** uses the native toolchain, not WASM/Docker.

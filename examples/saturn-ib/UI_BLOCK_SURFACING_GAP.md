# UI surfacing gap analysis (mdl2obliq / Saturn blocks)

**Question:** Are newly created block types fully surfaced in the UI? Have property updates on existing blocks been reflected in config panels?

**Answer (short):** Almost everything you need for browsing/editing the imported stack already has a config modal **except** one new type (`inertia_diag_pack`) and several **new parameters** on existing blocks that the UI either ignores or can wipe on Save.

---

## 1. New block type: `inertia_diag_pack`

| Layer | Status |
|-------|--------|
| `InertiaDiagPackBlockModule` + factory | Present |
| `blockTypeRegistry` / `BlockTypes` | **Missing** |
| Block library sidebar | **Missing** |
| Config modal | **Missing** (no params today — optional) |
| `createBlock` / schema enum | **Missing** |

**Impact for UI editing:** Blocks already in the translated model still render and codegen. You **cannot** add a new one from the library, and double-click may not open a dedicated config (falls through `canConfigure`). Fixed ports: `I`, `I_dot` → `I_Idot` (`double[6]`). No tunable parameters.

**Priority:** High for first-class status (registry + library). Config optional until parameters exist.

---

## 2. Existing blocks — property gaps (Saturn / mdl2obliq)

### Critical if you edit these blocks in the UI

| Block | New / used params | Config UI today | Risk if you Save |
|-------|-------------------|-----------------|------------------|
| **`evaluate`** | `outputType: 'bool'` (RelationalOperator / Logic from mdl2obliq) | Edits `numInputs` + `expression` only | **`EvaluateConfig.handleSave` calls `onUpdate({ numInputs, expression })` — drops `outputType`.** Re-saving a bool compare can break enable pins again. |
| **`multiply`** | `ops` (`*/`, `/**`, `/*`), `numInputs` | **No MultiplyConfig at all** | Cannot view/edit divide-vs-multiply port pattern; double-click may not configure |
| **`sheet_label_sink`** | `tagVisibility` (`local` / `global`) | Only `signalName` | Global Goto semantics not editable; Save keeps other params via spread — **OK if you don’t need to change visibility** |
| **`mux`** | `fillOrder: 'column'` (Create 3×3); expanded `cols`/`outputType` after emit demux | Shape editors exist | **`fillOrder` not exposed**; vector expand is emit-time, not a mux property |
| **`atmosphere`** | Port order **T, a, P, ρ** (module) | Model / extrapolation only | Registry + help text still imply **T, P, ρ, a**; table arrays not editable in UI |

### Already fully surfaced (no action for your UI session)

| Block | Notes |
|-------|--------|
| `transfer_function` | Numerator / denominator / order already in `TransferFunctionConfig` |
| `integrator`, `unit_delay`, `discrete_transform` | Dedicated configs |
| `sum`, `demux`, `condition`, `trig`, ports, source, TF, lookups, orientation, units, limit/relay/rate_limiter/quantizer/selector, data stores, subsystem, sheet_label_source | Config present |

### No-config OK (no parameters)

`divide`, `sign`, `clock`, `abs`, `uminus`, `matrix_multiply`, `transpose`, `mag`, `cross`, `dot`, `if`, `body2quaternion_rates`, `no_connection`

---

## 3. Practical guidance while you edit in the UI

**Safe to edit properties of:** TF, integrators, gains/scale, sums (signs), lookups, saturations, sheet **source** signal names, most aerospace conversion blocks.

**Be careful:**

1. **Do not Save** an `evaluate` that is a translated Relational/Logic bool (`outputType: 'bool'`) unless Config is fixed first — Save strips `outputType`.
2. **`multiply` with `ops`** — inspect in JSON if you need to change `*/` vs `**`; no panel yet.
3. **`inertia_diag_pack`** — leave as-is; cannot create from library.
4. Prefer capturing structural edits in your separate notes file; avoid bulk “open and Save” on evaluates.

---

## 4. Recommended UI work (priority)

| P | Item | Work |
|---|------|------|
| P0 | **EvaluateConfig preserve + edit `outputType`** | Merge on Save: `{ ...block.parameters, numInputs, expression, outputType }`; add Select `double` \| `bool` |
| P0 | **Register `inertia_diag_pack`** | `BlockTypes`, registry ports/category, library Aerospace entry |
| P1 | **MultiplyConfig** | `numInputs` + per-port `*`/`/` (`ops` string) |
| P1 | **SheetLabelSinkConfig `tagVisibility`** | Select local/global; update help text for global cross-subsystem |
| P2 | **MuxConfig `fillOrder`** | row \| column |
| P2 | **Atmosphere registry + Config** | Align port labels/docs to T,a,P,ρ; optional table editors |
| P3 | **modelSchema block `type` enum** | Sync with full registry (stale ~15 types) |

---

## 5. Bottom line

- **Not all new types are surfaced:** `inertia_diag_pack` is codegen-only.
- **Several property updates are not in the UI**, and **Evaluate Save is actively unsafe** for bool evaluates from the translator.
- TF and most longstanding blocks are fine for property editing during your UI session.

When you want, we can implement P0 (Evaluate preserve + inertia registry/library) before or after your editing pass.

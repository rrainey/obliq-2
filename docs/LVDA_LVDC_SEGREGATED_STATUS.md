# LVDA_LVDC Segregated Atomic — Status Gate

**Date:** 2026-08-27  
**Goal before Native extract:** Flatten vs `segregated_atomic` A/B on `saturn_ib_stack` → bit-identical (or explained) `tm904` / LLA through powered flight.  
**Related:** [`NATIVE_SUBSYSTEM_DESIGN.md`](./NATIVE_SUBSYSTEM_DESIGN.md), snapshot `native-snapshots/lvda-lvdc/`.

---

## 1. Where we are (executive)

| Item | Status |
|------|--------|
| `LVDA_LVDC` `codeGenStrategy: segregated_atomic` | Working in viper JSON + obliq-cgen |
| Crossing Goto/From → typed ports | Auto-promoted (MES_DCM, Xe/Ve pad/SIB/SIVB, bLiftoff__tag, …) |
| Nested enables inside module | On module (`LVDA_LVDC_evaluate_enable_states`) |
| Chi_* DSM | Module-local (not parent_ds) |
| Pre-sep / sep / ullage / LES | **Bit-identical** flatten ↔ segregated |
| Modes / event hooks | **Match** (sep, ullage jettison, LES, mode 0→1→2→3) |
| First IGM Chi write (~t_flight 188 / t_sim 488) through powered flight | **Bit-identical** after c1h + terminal latch |
| Late terminal window t_flight **610–615** | **Closed** — IGM Add12/Add14 latch now in `SubsystemCodeGenerator` |
| tm904 / LLA full A/B (t_flight ≤620) | **Bit-identical** (2026-08-27 post-latch regen) |
| Closer to NASA-TM-X-62831 than flatten? | **Same** as flatten (A/B identical); shared TM residuals remain |

**Verdict:** Segregated LVDA_LVDC is **A/B-parity with flatten** on tm904/lla for the AS-205 ExtIn run. Ready for Native fork from `native-snapshots/lvda-lvdc/` (refresh after latch).

---

## 2. A/B method (repro)

```bash
# Flatten baseline (strategy flatten on LVDA_LVDC — use a flatten JSON or temporarily flip)
npx tsx scripts/obliq-cgen.ts \
  /home/riley/src/viper/lib_SaturnIBObliq/model/saturn_ib_stack.json \
  --out /tmp/verify-lvdc-segatomic-cgen \
  --profile saturn-ib-stack --name saturn_ib_stack

# Probes live under /tmp/verify-lvdc-{flatten,segatomic}-cgen/build/
# tm904_probe, lla_probe, igm_kick_probe, sep_ab_probe, p18_probe, …
```

Artifacts used for the latest gate (2026-08-27):

| Path | Role |
|------|------|
| `/tmp/verify-lvdc-flatten-cgen/` | Flatten A |
| `/tmp/verify-lvdc-segatomic-cgen/` | Segregated B (post c1h regen) |
| `/tmp/ab-lvdc-tm/tm_{f,l}2.csv` | tm904 A/B |
| `/tmp/ab-lvdc-tm/lla_{f,l}2.csv` | LLA A/B |
| `/tmp/ab-lvdc-tm/igm_{f,l}2.csv` | IGM Chi kick A/B |
| `viper/.../model/as205-reference/tm_x_62831_*.csv` | NASA TM reference |

Latest segatomic manifest `generatedAt`: `2026-08-27T16:26:23Z`.

---

## 3. Closed defects (this campaign)

### c1g — post-sep ~5 m h drift
- **Cause:** S_IVB `IcNeedsLoading` ordered before live `Body_to_ECI` / Stage_Sep CG switch (Module↔enable topo).
- **Fix:** Cycle-break + restore IC-after-driver semantics; integrator `showInitPort` deps.

### c1h — Chi drift from ~t_sim 490 (first IGM write)
- **Symptom:** χ_Y / χ_Z differed ~1.6e-4° at first epsilon_prime write; Demux/Product18 ~8 m class.
- **Cause:** After Stage_Sep, parent topo **cycle-breaks** enable-scoped plant → LVDA edges so enable_bool / IC stay correct. That deferred `S_IVB_Xe` / `S_IVB_Ve` **after** `LVDA_LVDC_compute_outputs`, so crossing ports lagged **one plant step** (~5–6 m).
- **Fix:** `AlgebraicEvaluator.generatePreSegregatedInputRefresh` — before input memcpy:
  1. Publish integrator/unit_delay **state→signal only** (no `IcNeedsLoading`).
  2. Recompute the DF cone into those ports (quat→DCM→Transpose→Ve Product), stopping at non-DF roots so the whole plant is not pulled in.
  3. Keep Module↔enable cycle break + post-segregated enable_bool refresh as before.
- **Result:** bit-identical through first IGM Chi / midcourse; late terminal still open until latch port (below).

### Late-run — terminal χ snap (t_flight ≈605+)
- **Symptom:** First algebra diff at t_sim **905.605** (Add12/Add14/P15/Chi); flatten held Add12 constant after second terminal major; segregated kept updating → χ dive (~−29° by 615).
- **Cause:** IGM terminal **Add12/Add14 latch** lived only in parent `AlgebraicEvaluator` (flatten). `SubsystemCodeGenerator` never emitted it into `LVDA_LVDC.c`.
- **Fix:** Shared helper `src/lib/codegen/igmTerminalChiLatch.ts`; wired into both AlgebraicEvaluator and SubsystemCodeGenerator. Latch after 2nd major with `Add8≤15` (Position_Correction Compare).
- **Result:** term / tm904 / lla A/B **bit-identical** through t_flight 620.

Other earlier fixes still in tree (RateLimiter `sampleTimeSec`, same-step ActionPort / SwitchCase alignment, bStageSep self-feedback, bLiftoff From vs Memory5, etc.).

---

## 4. Open (non-A/B)

- Shared TM-X-62831 residuals (both builds): late CHIY bias vs TM, altitude/Vs table residuals — model/preset fidelity, not segregated parity.
- `codeGenStrategy: "native"` end-to-end UI + export cmake (see §7).
- Optional: express terminal latch as model blocks instead of codegen special-case.

---

## 5. Guidance presets (context)

TN/AP Table 3B-style params are in the stack JSON / `PARAM_*` in `LVDA_LVDC.h` (e.g. `Xdotdot_VGT_mps2=-9.15`, `T3_FM_sec=5`, `A0/A1=0`, `phi_L_prime_deg=28.360795` geocentric). These move **both** flatten and segregated vs the TM equally; they do **not** explain flatten≠seg rows.

---

## 6. Native extract readiness

| Prerequisite | State |
|--------------|-------|
| Segregated ABI compile + run | Yes |
| Crossing ports typed / promoted | Yes (auto) |
| Snapshot for fork | `native-snapshots/lvda-lvdc/{LVDA_LVDC.c,h}` (refresh after late-run fix) |
| Parent call site ≡ future native | Largely (input copy, DSM sync, `*_compute_outputs`, `time`/`dt`/`sample_tick`) |
| `codeGenStrategy: "native"` end-to-end | **Not done** — flattener recognizes `native` as opaque; UI/validator/export cmake still incomplete |
| parent_ds macros for crossing DSM | Deferred (Chi stays module-local — fine for LVDC fork) |

**Recommended Native cut:** keep generating `LVDA_LVDC` as `segregated_atomic` until late A/B is understood; then copy module → `~/.obliq/native/lvdc/` (or keep sanitized name `LVDA_LVDC`), flip strategy to `native` + `nativeModule`.

---

## 7. Notes for the UI Development Agent

Primary design doc: [`docs/NATIVE_SUBSYSTEM_DESIGN.md`](./NATIVE_SUBSYSTEM_DESIGN.md). This section is a **practical UI/export checklist** against the current codebase.

### 7.1 Current UI surface (extend, don’t replace)

| File | Role today |
|------|------------|
| `src/components/SubsystemConfig.tsx` | Strategy select: `flatten` \| `segregated` \| `segregated_atomic` only |
| `src/lib/blockParameterValidator.ts` | `validStrategies` omits `native`; subsystem `parameters[]` gated to segregated* |
| `src/lib/modelSchema.ts` | `CodeGenStrategySchema` enum — **must** add `'native'` |
| `src/lib/blockTypeRegistry.ts` / `blockFactory.ts` | Defaults `codeGenStrategy: 'flatten'` |
| `src/app/models/[id]/page.tsx` | Hosts `<SubsystemConfig />` |

Wasm path (`src/lib/wasm/codegen/WasmCodeGenerator.ts`) only special-cases segregated* — native must get the same opaque treatment as segregated_atomic once codegen lands.

### 7.2 Native Subsystem Config dialog (suggested UX)

Add strategy option **Native** with description: *“Opaque atomic call; body is hand-written C under `~/.obliq/native/<module>/` (same ABI as segregated atomic).”*

When `codeGenStrategy === 'native'`:

1. **`nativeModule`** (required string) — directory / cmake module id under `~/.obliq/native/` (e.g. `lvdc`). Validate non-empty, filesystem-safe.
2. **Typed ports required** — prefer `{ name, dataType }[]` (or keep string ports + per-port type editor). Design doc: reject missing `dataType` for native.
3. **`showEnableInput` / `sampleTimeSec`** — same as today; parent still syncs enable + multi-rate.
4. **Inner sheets** — allow empty or read-only “ports-only shell”; do not force the user to keep the full LVDC diagram once forked. Optional: “Clear sheets” when switching to native (confirm).
5. **Subsystem `parameters[]`** — either hide for native (params live in C `PARAM_*` / headers) **or** document that Obliq subsystem parameters are *not* injected into native bodies in v1.
6. **Actions (high value):**
   - **Download skeleton** → calls skeleton generator (CLI or API) into browser download zip / writes via backend to `~/.obliq/native/<module>/`.
   - **Fork from segregated** → copy last-exported / uploaded `Name.c`+`Name.h` into native root (Saturn path: start from `native-snapshots/lvda-lvdc/` or export tree).
   - **Open module path** — show resolved `~/.obliq/native/<module>/` (read-only hint).
7. **Validation messaging:** missing `~/.obliq/native/<module>/<SanitizedName>.h` → editor **warning**; hard error at C export / Wasm build.

Sanitized C name today comes from the **block name** (`LVDA_LVDC` → `LVDA_LVDC_t`). Default Native fork should **keep that name** so parent call sites stay identical (`LVDA_LVDC_compute_outputs`). If UI offers rename, warn that parent + cmake symbols must match.

### 7.3 C-code export enhancements

Segregated already emits sibling `LVDA_LVDC.c` / `.h` and links them in the export `CMakeLists.txt` (`scripts/obliq-cgen.ts` / CodeGenerator). For native:

| Enhancement | Detail |
|-------------|--------|
| Skip body emit | Do **not** run `SubsystemCodeGenerator` for native modules |
| Include path | `#include` public header from `native/<module>/` (or install iface) |
| CMake | Export tree gets `native/CMakeLists.txt` → `libnative.a`; top-level `target_link_libraries(sim native)` |
| Copy or symlink | Package `~/.obliq/native/<module>/` sources into `<export>/native/<module>/` |
| Manifest | Record `nativeModules: [{ block, nativeModule, sanitizedName }]` in cgen-manifest |
| Pre-segregated refresh | Parent-side (already in `AlgebraicEvaluator`); **no UI** — but export smoke should still exercise Stage_Sep→IGM |

Desktop CLI already used for Saturn: `scripts/obliq-cgen.ts --profile saturn-ib-stack`. Prefer extending that path so UI “Export C” and CLI stay aligned.

### 7.4 ABI facts the UI should not invent

Parent already syncs into the module struct (segregated / future native):

- `time`, `dt`, `sample_tick`
- Shared DSM intersection (Chi_* are **module-local** for LVDA_LVDC — parent still mirrors names that intersect)
- Typed `inputs.*` / reads `outputs.*`

Live LVDA crossing **inputs** (post auto-promote) include: `Theta_deg[3]`, `V_m_bar_mps[3]`, `MES_DCM[3][3]`, `PAD_*/S_IVB_*/Xe/Ve`, `bLiftoff`, `bLiftoff__tag`, propellant dry, etc. Outputs include Stage_Sep / ullage / engine discretes, `Psi_deg`, guidance vectors — see `native-snapshots/lvda-lvdc/LVDA_LVDC.h`.

Any Native Config “port sync from sheets” tool must preserve these types; demux-scalar soft warnings already exist for boundary mistakes.

### 7.5 What not to block on for v1 UI

- parent_ds macros  
- Hot-reload of `.c` without rebuild  
- Editing LVDC block graph while strategy is `native`  
- Closing the t_flight 610+ A/B (codegen chase; not a dialog requirement)

### 7.6 Suggested acceptance for UI PR

1. User can set subsystem → Native, set `nativeModule`, save JSON round-trip (`modelSchema` + validator).  
2. Export (or CLI) produces parent that **links** `libnative` and does not regenerate the module body.  
3. Skeleton download produces compilable stub matching §4 of the Native design doc.  
4. Existing flatten / segregated_atomic paths unchanged (SubsystemConfig regression).  
5. Optional: Wasm build discovers `~/.obliq/native` (may land in a follow-up if desktop export is first).

---

## 8. Next engineering step

1. ~~Late-run chase~~ **done** (terminal Add12/Add14 latch in segregated modules).  
2. ~~Refresh `native-snapshots/lvda-lvdc/`~~ **done** (post-latch).  
3. **UI agent:** Native Config + export per §7.  
4. Optional: Native flattener/export codegen recognition of `native` (design doc §9).

---

## 9. Key code pointers

| Concern | Location |
|---------|----------|
| Pre-segregated input refresh | `src/lib/codegen/AlgebraicEvaluator.ts` (`generatePreSegregatedInputRefresh`, `generateFrozenStatePublish`, `isModuleEnableCycleSource`) |
| Post-segregated enable refresh | same file (`generatePostSegregatedEnablePredicateRefresh`) |
| IGM terminal Chi latch (Add12/Add14) | `src/lib/codegen/igmTerminalChiLatch.ts` → AlgebraicEvaluator + SubsystemCodeGenerator |
| Crossing tag → ports | `src/lib/codegen/crossingTagPorts.ts`, ModelFlattener promote |
| Module enables / RateLimiter Ts | `src/lib/codegen/SubsystemCodeGenerator.ts`, `withFlattenedSampleParams` |
| Native design | `docs/NATIVE_SUBSYSTEM_DESIGN.md` |
| Fork snapshot | `native-snapshots/lvda-lvdc/` |

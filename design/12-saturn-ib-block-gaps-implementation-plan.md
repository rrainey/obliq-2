# Saturn-IB Port: Phased Block Gap Implementation Plan

**Status:** Planning  
**Date:** 2026-08-09  
**Context:** Gap analysis of `saturn-1B/saturn_ib_stack_test.mdl` vs current obliq-2 block library.  
**Goal:** Add the minimum new blocks and platform features needed to reconstruct the Apollo/Saturn-IB simulation as an obliq-2 model, with testable interfaces at each phase.

---

## 1. Objectives and success criteria

### 1.1 Objectives

1. Close **P0/P1 block gaps** identified in the Saturn-IB review so continuous plant, sensors, FCC, and eventually LVDC IGM can be expressed without Simulink.
2. Prefer **small, composable blocks** over one mega “Saturn” block.
3. Every new block ships with:
   - `IBlockModule` (codegen + type propagation)
   - Registry / library / optional config UI
   - Unit tests (codegen / ports / types)
   - WASM harness tests where behavior is time- or state-dependent
4. Unlock **migration milestones** that can be demonstrated independently of full IGM.

### 1.2 Success criteria (end state)

| Milestone | Demonstrable model |
|-----------|-------------------|
| M1 Plant | Fixed-mass 6DoF + Earth gravity + vacuum thrust table |
| M2 Aero | M1 + atmosphere + q̄ + simple aero force |
| M3 Propulsion sequence | Multi-engine thrust with start timers / decay |
| M4 FCC | Attitude error filters + actuators (continuous TF) |
| M5 Discrete control | Rate modulator (relay) + rate-limited χ commands |
| M6 Guidance kernel | Time-tilt + shared guidance state + IGM mode variables |
| M7 Full stack | Staged S-IB / S-IVB + IU + open-loop then closed-loop IGM |

### 1.3 Non-goals (this plan)

- Automatic `.mdl` → obliq importer
- Pixel-perfect Aerospace Blockset COESA equivalence (table approximation is OK for M2)
- Full multi-rate solver framework (per-block sample interval is enough)
- Graphite/PR stack execution of this plan (implementation is separate)

---

## 2. Dependency graph

```
Phase 0  Existing-capability audit (integrator x(0), subsystem enable)
    │
    ▼
Phase 1  Discrete hold: unit_delay  ─────────────────────────────┐
    │                                                              │
    ▼                                                              │
Phase 2  Arithmetic completeness: divide, product ops, sign        │
    │                                                              │
    ▼                                                              │
Phase 3  Discontinuities: relay, rate_limiter, quantizer  ◄────────┤
    │                         (unit_delay used by relay tests)     │
    ▼                                                              │
Phase 4  Signal plumbing: selector, (optional reshape)             │
    │                                                              │
    ▼                                                              │
Phase 5  Shared state: data_store  (model-scoped named signals)    │
    │                                                              │
    ▼                                                              │
Phase 6  Hybrid timing: rising-edge subsystem / trigger mode       │
    │                                                              │
    ▼                                                              │
Phase 7  Environment: atmosphere (COESA tables)                    │
    │                                                              │
    ▼                                                              │
Phase 8  Saturn-IB vertical slices (models, not new primitives)
```

**Why this order**

| Phase | Unblocks Saturn-IB need |
|-------|-------------------------|
| 1 unit_delay | IGM last-χ, SMCY/SMCZ, MF history, modulator memory |
| 2 divide/sign | Gravity model `*/` products, aero, guidance algebra without evaluate-only workarounds |
| 3 relay/rate_limiter/quantizer | SACS derived rate modulators, χ rate limit, PIPA/resolver |
| 4 selector | Vector component picks without demux sprawl |
| 5 data_store | `nIGMMode`, `tau_*`, S-frame state across IU sheets |
| 6 trigger | Engine start / stage timers (17 TriggerPorts in MDL) |
| 7 atmosphere | Dynamic pressure, Mach, aero moments |
| 8 slices | End-to-end reconstruction using only supported blocks |

**Already largely present (Phase 0, not net-new blocks)**

- Integrator **x(0)** external IC (`showInitPort`) — verify + harness coverage
- Integrator enable / reset / limits
- Subsystem enable (hold outputs when disabled)
- `orientation_conversion`, `body2quaternion_rates`, `transfer_function`, lookups, matrix ops

---

## 3. Standard delivery checklist (every new block)

For each block type `foo`:

| Layer | Work |
|-------|------|
| Module | `src/lib/blocks/FooBlockModule.ts` implementing `IBlockModule` |
| Factory | Case + `getSupportedBlockTypes()` in `BlockModuleFactory.ts` |
| Registry | `BlockTypes` + registry entry in `blockTypeRegistry.ts` |
| UI | `BlockLibrarySidebar.tsx`; config dialog if parameters are non-trivial |
| Schema | Extend model schema / migration if block `type` enum is strict |
| Types | Type propagation + connection validation |
| Direct feedthrough | Implement `isDirectFeedthrough()` correctly for loop analysis |
| Docs | Entry in `docs/blocks-reference.md` |
| MCP | Block type docs if MCP catalogs types |
| Unit tests | `__tests__/foo-block.test.ts` (codegen, ports, types) |
| Harness tests | `__tests__/harness/` or wasm integration where timing/state matters |

---

## 4. Phase 0 — Existing capability hardening

**Goal:** Confirm 6DoF-critical paths already work; fix gaps without new block types.

### 4.1 Integrator external IC (x(0))

| Item | Spec |
|------|------|
| Status | **Done (P0)** — x(0) is left-side **data port 1** (not control port −3) |
| Expected behavior | At `t=0`, state ← connected init signal (or 0 if unconnected); parameter `initialValue` ignored when port shown |
| Reset interaction | Rising-edge reset **re-samples x(0)** when `showInitPort`; else uses `initialValue` |
| Control ports | Enable = −1 (top), Reset = −2 (bottom) only |

**Tasks**

1. Document x(0) semantics in `docs/blocks-reference.md`.
2. If reset currently ignores x(0), change reset path to:  
   `if (showInitPort && init connected) state = current_init_input; else state = initialValue`.
3. Vector/matrix IC type must match integrator signal type.

**Verification tests**

| ID | Type | Assertion |
|----|------|-----------|
| P0-I1 | Unit | Codegen with `showInitPort` uses `initSignalExpr` in `generateInitialization` |
| P0-I2 | Unit | Port count / labels include x(0) when enabled |
| P0-I3 | Harness | Constant 3.0 → x(0), input 0 → output holds ~3.0 over [0,1]s |
| P0-I4 | Harness | Vector IC `double[3]` initializes three states |
| P0-I5 | Harness | Rising reset with x(0)=5 reloads 5 (after semantics fix) |
| P0-I6 | Unit | Connection validation rejects non-integrator init ports |

### 4.2 Subsystem enable for stage freeze

| ID | Type | Assertion |
|----|------|-----------|
| P0-S1 | Harness | Disabled subsystem freezes integrator state and holds last outputs |
| P0-S2 | Harness | Re-enable resumes integration from frozen state |

---

## 5. Phase 1 — Unit Delay / Memory

**Block type id:** `unit_delay`  
**Library category:** Dynamic Systems / Discrete  
**Saturn-IB role:** Memory blocks (25), UnitDelay (1), discrete IGM history

### 5.1 Interface

```
Ports:
  in  [0]  : T   (scalar | vector | matrix; same T as out)
  out [0]  : T   delayed by one sample

Parameters:
  initialValue: number | number[] | number[][] | string (C99 init)
                default: 0 (broadcast to shape of input)
  sampleInterval: number  (seconds)
                  default: 0
                  semantics: 0 means “every simulation step” (inherit model dt)
                  >0 means update only when model->time crosses next sample boundary
                    (same pattern as discrete_transform)

Direct feedthrough: false  (output depends on prior state only)
requiresState: true
```

**State (codegen)**

```c
// For scalar T=double example:
double unitDelayName_state;           // last output
double unitDelayName_next_sample_time; // if sampleInterval > 0
```

**Algorithm (each step)**

1. `y = state` (output first — unit delay)
2. If sample due (or every step if `sampleInterval == 0`):  
   `state = u`

**Algebraic loops:** Because `isDirectFeedthrough() === false`, loops that only close through unit_delay are legal (classic z⁻¹ break).

### 5.2 UI

- Config: initial value editor (reuse source-style scalar/vector if available), sample interval.
- Icon: classic 1/z or “z⁻¹”.

### 5.3 Verification tests

| ID | Type | Assertion |
|----|------|-----------|
| P1-U1 | Unit | `isDirectFeedthrough` is false |
| P1-U2 | Unit | State struct members generated; init code sets `initialValue` |
| P1-U3 | Unit | Output type equals input type for double / double[3] / double[2][2] |
| P1-H1 | Harness | Step: u=0 for t&lt;0.5, u=1 after; y lags one step (dt=0.1) |
| P1-H2 | Harness | initialValue=2 → first sample y=2 |
| P1-H3 | Harness | sampleInterval=0.2, dt=0.1: state updates only every other step |
| P1-H4 | Harness | Vector delay preserves components |
| P1-H5 | Harness | Feedback: y = unit_delay(y + 1) counts 0,1,2,… (ramp) |

**Exit criteria:** P1-H1, P1-H2, P1-H5 green; used as dependency for Phase 3 relay tests.

---

## 6. Phase 2 — Arithmetic completeness

### 6.1 Divide block

**Block type id:** `divide`  
**Category:** Math  
**Saturn-IB role:** Hundreds of Product blocks with `*/` inputs (gravity, aero, IGM)

#### Interface

```
Ports:
  num [0] : T
  den [1] : T   (or scalar broadcast — see rules)
  out [0] : T

Parameters:
  none (v1)

Element-wise division.
Type rules (v1 — keep simple):
  - Same shape T / T → T
  - Vector/matrix ÷ scalar → same shape (broadcast)
  - Scalar ÷ vector: reject in validation (or define later)

Direct feedthrough: true
```

**Codegen**

- Scalar: `out = num / den` (document IEEE division by zero behavior; no trap)
- Vector/matrix: element-wise loop
- Optional later: `divideByZero: 'ieee' | 'saturate'` — not in v1

#### Verification

| ID | Type | Assertion |
|----|------|-----------|
| P2-D1 | Unit | Codegen scalar and vector loops |
| P2-D2 | Unit | Type reject on incompatible shapes |
| P2-H1 | Harness | 6/2 = 3 |
| P2-H2 | Harness | `[2,4,6] / 2 = [1,2,3]` |
| P2-H3 | Harness | Chain with sum/scale matches hand calculation |

### 6.2 Product / multiply ops extension (optional same phase)

If preferred over a separate divide block: extend `multiply` with parameter:

```
parameters.ops: string  // e.g. "**/" meaning in0*in1/in2
parameters.numInputs: number
```

**Recommendation:** Ship dedicated `divide` first (clearer ports, fewer config bugs). Defer multi-op Product to Phase 2.1 if Saturn port still has noisy wiring.

### 6.3 Sign (Signum)

**Block type id:** `sign`  
**Category:** Math  
**Saturn-IB role:** 3 Signum blocks

```
Ports: in[0] → out[0], type-preserving numeric (output same base type; bool input rejected)
Semantics (element-wise):
  y = (u > 0) ? 1 : (u < 0) ? -1 : 0
Direct feedthrough: true
```

| ID | Type | Assertion |
|----|------|-----------|
| P2-S1 | Unit | Codegen for scalar + vector |
| P2-H1 | Harness | inputs −2,0,5 → −1,0,1 |

### 6.4 Logic / relational (evaluate-first policy)

**Decision:** Do **not** add AND/OR/NOT or Relational blocks in Phase 2 if `evaluate` covers scalar cases.

| Gap | Policy |
|-----|--------|
| Two-signal compare | `evaluate`: `in(0) <= in(1)` |
| AND/OR/NOT | `evaluate`: `in(0) && in(1)` |
| Compare to constant | existing `condition` |

**Add dedicated blocks only if** vectorized logic becomes common in IGM (track as Phase 2.2 stretch).

**Exit criteria:** Gravity-style expression `mu * r / (r_mag^3)` buildable with sum/multiply/divide/mag/evaluate without Product `*/` workarounds for binary divide.

---

## 7. Phase 3 — Discontinuities and command limiting

### 7.1 Relay (hysteresis)

**Block type id:** `relay`  
**Category:** Discontinuities  
**Saturn-IB role:** Derived Rate Modulator / SACS (6 relays)

#### Interface

```
Ports:
  in  [0] : double (scalar v1; vector later)
  out [0] : double

Parameters:
  onThreshold:  number   // Switch on when u >= onThreshold (rising path)
  offThreshold: number   // Switch off when u <= offThreshold
  onOutput:     number   default 1
  offOutput:    number   default 0
  initialOn:    boolean  default false

Constraints:
  onThreshold >= offThreshold  (classic hysteresis; equal ⇒ no deadband)

State: bool is_on
Direct feedthrough: true  (output can depend on u and state; still DF for ordering —
  document that algebraic loops through relay are possible; prefer unit_delay in feedback)
```

**Algorithm**

```
if is_on:
  if u <= offThreshold: is_on = false
else:
  if u >= onThreshold: is_on = true
y = is_on ? onOutput : offOutput
```

#### Verification

| ID | Type | Assertion |
|----|------|-----------|
| P3-R1 | Unit | State member + init from `initialOn` |
| P3-R2 | Unit | Validation error if onThreshold &lt; offThreshold |
| P3-H1 | Harness | Ramp u: switches on at +on, off at −off (or configured thresholds) |
| P3-H2 | Harness | Hysteresis: values between thresholds keep prior state |
| P3-H3 | Harness | Mini rate-modulator: error → relay → (optional unit_delay) matches expected pulse pattern |

### 7.2 Rate Limiter

**Block type id:** `rate_limiter`  
**Category:** Discontinuities  
**Saturn-IB role:** χ rate limit (±0.005, ±12), dynamic rate limiter subsystem

#### Interface

```
Ports:
  in  [0] : double (scalar v1; vector element-wise later)
  out [0] : double

Parameters:
  risingSlewLimit:  number   // max dy/dt (units per second), must be > 0
  fallingSlewLimit: number   // min dy/dt, must be < 0  (Simulink style)
  initialOutput:    number   default 0
  // Optional later: sampleInterval for discrete rate limit

State: last_output
Direct feedthrough: true
requiresState: true
```

**Algorithm (fixed-step dt)**

```
max_delta = risingSlewLimit * dt
min_delta = fallingSlewLimit * dt   // negative
delta = u - last_output
delta = clamp(delta, min_delta, max_delta)
y = last_output + delta
last_output = y
```

**Note:** Codegen must use actual simulation `dt` (model step), not a hardcoded constant — same source as integrator RK4 step.

#### Verification

| ID | Type | Assertion |
|----|------|-----------|
| P3-L1 | Unit | State + init |
| P3-H1 | Harness | Step input 0→10, rise limit 2/s, dt=0.1 → reaches 10 in 5s |
| P3-H2 | Harness | Falling limit −2/s for downward step |
| P3-H3 | Harness | Sine input amplitude clipped in slope, not amplitude |

### 7.3 Quantizer

**Block type id:** `quantizer`  
**Category:** Discontinuities / Sensors  
**Saturn-IB role:** PIPA pulses, D/A, fine resolver

#### Interface

```
Ports: in → out, type-preserving element-wise
Parameters:
  quantum: number  // step size > 0
Semantics:
  y = quantum * floor(u / quantum + 0.5)   // round to nearest (Simulink Quantizer default)
  // Document alternative floor mode later if needed
Direct feedthrough: true
```

| ID | Type | Assertion |
|----|------|-----------|
| P3-Q1 | Unit | Codegen uses floor/round pattern |
| P3-H1 | Harness | quantum=0.5: 1.2 → 1.0, 1.3 → 1.5 |
| P3-H2 | Harness | Round-trip scale (m/s → pulses → m/s) matches table within 1 quantum |

**Exit criteria:** Construct “derived rate modulator” sheet from relay + gain + unit_delay; χ command path with rate_limiter.

---

## 8. Phase 4 — Signal plumbing

### 8.1 Selector

**Block type id:** `selector`  
**Category:** Matrix / Signal Attributes  
**Saturn-IB role:** 20 Selector blocks (pick DCM rows/cols, vector components)

#### Interface (v1 — fixed indices)

```
Ports:
  in  [0] : vector double[N] or matrix double[R][C]
  out [0] : scalar | vector | matrix depending on selection

Parameters:
  // Vector mode:
  indices: number[]   // 0-based indices into vector → output double[K] or scalar if K=1

  // Matrix mode:
  selectionMode: 'elements' | 'rows' | 'columns'
  rowIndices: number[]
  colIndices: number[]

Validation: all indices in range after type propagation known
Direct feedthrough: true
```

**v1 simplification:** Support **vector indices only** first (covers most 6DoF “pick u,v,w” cases). Matrix row/col as v1.1 if needed.

| ID | Type | Assertion |
|----|------|-----------|
| P4-S1 | Unit | double[3] indices [2,0] → double[2] type |
| P4-S2 | Unit | Out-of-range index fails validation |
| P4-H1 | Harness | Source [10,20,30], select [1] → 20 |
| P4-H2 | Harness | Select [0,2] → [10,30] |

### 8.2 Reshape (defer if mux/demux sufficient)

**Block type id:** `reshape` — only if porting friction is high.

```
Parameters: outputRows, outputCols  // product must equal input element count
```

Skip in first pass; track as Phase 4.1.

---

## 9. Phase 5 — Model-scoped data stores

**Problem:** Sheet labels are subsystem-local; IGM uses Data Store Memory for modes and shared navigation state across deep hierarchy.

### 9.1 Design choice

**Recommended approach: model-level named signal registry** (not per-block Simulink Data Store trio as three block types with opaque globals).

#### Blocks

| Type | Role |
|------|------|
| `data_store_write` | Input port → write named store |
| `data_store_read` | Output port ← read named store |

Optional: declaration-only `data_store` block for initial value + type (or declare on first write / model parameters panel).

#### Interface

```
data_store_write:
  Ports: in[0] : T
  Parameters:
    storeName: string   // valid C identifier, unique type per name
  No output (or pass-through optional v2)

data_store_read:
  Ports: out[0] : T
  Parameters:
    storeName: string
  Direct feedthrough: depends on write-before-read ordering

Model-level:
  model.dataStores?: Array<{
    name: string
    dataType: string      // double, double[3], ...
    initialValue: string  // C99 initializer
  }>
```

#### Codegen semantics

1. Flattening pass collects all store names; emit `model->data_stores.<name>`.
2. **Execution order:** treat write as defining a signal; read as consumer. Same-step write→read allowed if topological order places write first; **read-before-write same step uses previous step value** (register semantics) — implement via:

```
// Preferred safe semantics (Simulink-like for DSM):
// At step start: (optional) nothing
// On write: data_stores.X = u
// On read: y = data_stores.X
// Ordering from global sort; forbid algebraic loop write↔read without delay
```

3. Validation: every read has ≥1 write OR declared initial value; single type per name.

#### Saturn-IB store names to support early

From MDL: `nIGMMode`, `nHSLActive`, `nTerminalSteeringMode`, `T_3_i_sec`, `tau_1_sec`, `tau_3_sec`, `SMCY_rad`, `SMCZ_rad`, `Chi_*_deg`, `XYZ_S_m`, `XYZdot_Sg_mps`, `DeltaT_b_sec`, `alpha_f`, …

### 9.2 Verification

| ID | Type | Assertion |
|----|------|-----------|
| P5-1 | Unit | Flattening emits store struct members |
| P5-2 | Unit | Type conflict two writes different types → validation error |
| P5-3 | Harness | Sheet A write 42, Sheet B (via subsystem) read 42 same model |
| P5-4 | Harness | Cross-subsystem: IU sheet writes mode, engine sheet reads mode |
| P5-5 | Harness | Read before any write returns initialValue |
| P5-6 | Unit | Invalid storeName rejected |

**Exit criteria:** Two-sheet model shares `nIGMMode` without parent wiring every signal.

---

## 10. Phase 6 — Triggered / edge-enabled subsystems

**Saturn-IB role:** Engine timers, T1–T4, stage timers (TriggerPort × 17)

### 10.1 Design choice

Extend **subsystem** rather than invent a free-floating TriggerPort block:

```
subsystem.parameters:
  showEnableInput: boolean          // existing — level sensitive
  enableMode: 'level' | 'rising_edge' | 'either'   // new, default 'level'
  showTriggerInput: boolean         // alternative explicit trigger port
  triggerType: 'rising' | 'falling' | 'either'
  resetOnTrigger: boolean           // re-run init of internal states on edge
```

**Recommended v1:** single optional **trigger** port (rising edge):

| Mode | Behavior |
|------|----------|
| Level enable (existing) | enable=0 → freeze states & hold outputs |
| Rising trigger | On edge: if `resetOnTrigger`, re-init internal states; run subsystem while “latched active” **or** run for one “shot” |

Timers in Saturn model typically: trigger starts a clock that accumulates. That is:

```
triggered subsystem {
  clock - t0 → time_since_start
}
```

So **resetOnTrigger + enable latched until parent clears** may be more than needed. Minimum viable:

**MVP trigger semantics**

1. Subsystem has `showTriggerInput`.
2. Internal **edge detector state** on parent: `prev_trigger`.
3. On rising edge: set `triggered_this_step = true` and **reset child integrators/unit_delays/discrete** to ICs.
4. Child still runs every step after that (like always-enabled) unless also has enable.

**Better MVP matching “Triggered Timer” pattern**

Expose a small **`edge_detect`** block + existing enable:

```
edge_detect: u → pulse (1 for one step on rising edge)
```

Then timer subsystem: enable or reset from pulse. This avoids complex subsystem state machines.

#### Recommendation

| Priority | Deliverable |
|----------|-------------|
| 6a | `edge_detect` block (simple, testable) |
| 6b | Integrator / unit_delay already have reset — wire edge → reset |
| 6c | Optional: subsystem `resetOnEnable` rising edge |

### 10.2 edge_detect interface

```
Block type: edge_detect
Ports: in[0] bool/double → out[0] double (1.0 pulse one step, else 0.0)
Parameters:
  edge: 'rising' | 'falling' | 'either'
  threshold: number default 0.5  // for numeric inputs
State: prev_value
Direct feedthrough: true for output pulse (uses prev state)
```

### 10.3 Verification

| ID | Type | Assertion |
|----|------|-----------|
| P6-E1 | Harness | 0,0,1,1,0 → pulses on first 1 only (rising) |
| P6-E2 | Harness | Falling edge mode |
| P6-T1 | Harness | edge → integrator reset; integrates after start event |
| P6-T2 | Harness | “Time since engine start”: clock − captured_t0 after edge |

**Exit criteria:** One H-1 engine sheet: edge start → thrust lookup(f(t_since_start)).

---

## 11. Phase 7 — Atmosphere model

**Block type id:** `atmosphere`  
**Category:** Aerospace / Environment  
**Saturn-IB role:** 2× COESA Atmosphere Model → ρ, a, T, P for aero & dynamic pressure

### 11.1 Interface

```
Ports:
  altitude_m [0] : double   // geometric altitude above MSL (document)
  // outputs (fixed set v1):
  temperature_K [0]
  pressure_Pa   [1]
  density_kgpm3 [2]
  speed_of_sound_mps [3]

Parameters:
  model: 'coesa1976' | 'table'
  // if table:
  altitudeBreakpoints: number[]
  temperatureValues / pressureValues / densityValues / sosValues
  extrapolation: 'clamp' | 'extrapolate'

Direct feedthrough: true
```

**Implementation strategy**

1. **v1 `table` mode:** precomputed COESA 1976 columns embedded as default tables (0–80 km or 0–1000 km as needed for LEO ascent). Use existing 1D lookup interpolation logic (share code with Lookup1D).
2. **v2 `coesa1976`:** analytic layers (optional; higher fidelity, more code).

Dynamic pressure remains a **user subsystem**: `q = 0.5 * density * mag(V_rel)^2` (matches aerolib Dynamic Pressure usage).

### 11.2 Verification

| ID | Type | Assertion |
|----|------|-----------|
| P7-1 | Unit | Output port count 4; types double |
| P7-2 | Unit | Table monotonic altitude validation |
| P7-H1 | Harness | h=0 → ρ ≈ 1.225 kg/m³, T ≈ 288.15 K (tolerance 1%) |
| P7-H2 | Harness | h=11000 m → Tropospause region T≈216.65 K |
| P7-H3 | Harness | Monotonic pressure decrease with altitude |
| P7-H4 | Comparison | Spot-check 5 altitudes vs published COESA table |
| P7-H5 | Integration | density → q_bar with constant V matches ½ρV² |

**Exit criteria:** S-IB aero sheet can compute q̄ and scale CN tables.

---

## 12. Phase 8 — Saturn-IB vertical slices (integration, not primitives)

No new blocks required if Phases 1–7 complete. Build models as regression fixtures under e.g. `examples/saturn-ib/` or `docs/sample-models/saturn/`.

| Slice | Uses | Acceptance |
|-------|------|------------|
| **8.1 Gravity + ballistics** | evaluate, divide, mag, integrator, matrix | Free-fall / circular orbit drift bound |
| **8.2 6DoF vacuum** | body2quat, orientation, integrator x(0), matrix | Quaternion ‖q‖≈1; no thrust coast |
| **8.3 Thrust table engine** | lookup_1d, edge_detect, clock | Thrust profile vs time matches table |
| **8.4 Atmosphere + aero** | atmosphere, lookup_2d | q̄ peaks mid-ascent qualitatively |
| **8.5 Stage enable** | subsystem enable | S-IB freeze after sep |
| **8.6 FCC filters** | transfer_function, limit | Step response matches TF analytic |
| **8.7 Rate modulator** | relay, unit_delay, gain | Limit-cycle bounds |
| **8.8 χ time-tilt** | lookup_1d, rate_limiter | AS205-style pitch program |
| **8.9 IGM state shell** | data_store_*, unit_delay, evaluate | Mode transitions nIGMMode 0→1→… |
| **8.10 Full open-loop ascent** | composition | Altitude/velocity within loose band vs AS205 trajectory |

**AS205 parameters** map to model parameters from `AS205_presettings.m` (`V_T_mps`, `R_T_m`, `A_z_deg`, `epsilon_*`, etc.).

---

## 13. Test strategy summary

### 13.1 Layers

```
Unit (jest, no Docker)
  - generateComputation string contracts
  - getOutputType / port counts / isDirectFeedthrough
  - parameter validation

Harness (Docker + Emscripten WASM)  [__tests__/harness]
  - time series behavior
  - state across steps
  - multi-block systems

Integration fixtures
  - Phase 8 JSON models + golden CSV snippets (optional)
```

### 13.2 Harness conventions for new blocks

```typescript
// Pattern for every stateful block
it('P1-H1 unit_delay lags one step', async () => {
  const model = harness.createTestModel({ /* ... */ })
  const compiled = await harness.generateAndCompile(model, 'unit_delay_lag')
  const results = await harness.runSimulation(compiled, { duration: 1.0, dt: 0.1 })
  // assert y[k] == u[k-1]
})
```

### 13.3 Tolerances

| Quantity | Default abs/rel tol |
|----------|---------------------|
| Exact discrete (delay, relay state) | exact or 1e-12 |
| Continuous integrator | 1e-6 relative for RK4 moderate dt |
| Atmosphere table | 1% vs reference points |
| TF step response | 1e-3 relative after settling |

### 13.4 CI recommendation

- Unit tests: always on PR  
- Harness tests: tagged `wasm` / nightly if Docker cost high; **required** for Phases 1, 3, 5, 6, 7 before merge of those phases

---

## 14. Effort estimate (rough)

| Phase | New block types | Est. engineering | Risk |
|-------|-----------------|------------------|------|
| 0 Hardening | 0 | 1–2 d | Low |
| 1 unit_delay | 1 | 2–3 d | Low–med (sample time) |
| 2 divide + sign | 2 | 1–2 d | Low |
| 3 relay, rate_limiter, quantizer | 3 | 3–5 d | Med (dt access, hysteresis) |
| 4 selector | 1 | 1–2 d | Low |
| 5 data_store | 2 (+ model schema) | 5–8 d | **High** (flattening, order) |
| 6 edge_detect (+ subsystem opts) | 1 | 2–3 d | Med |
| 7 atmosphere | 1 | 3–5 d | Med (table fidelity) |
| 8 slices | 0 | ongoing | Med (physics debugging) |

**Critical path:** Phase 1 → 3 → 5 → 6 for guidance/FCC; Phase 7 can parallelize after Phase 2 with plant work.

---

## 15. Suggested implementation tickets (checklist)

### Phase 0
- [ ] P0.1 Document integrator x(0) + reset semantics  
- [ ] P0.2 Reset-from-x(0) if agreed  
- [ ] P0.3 Tests P0-I1…I6, P0-S1…S2  

### Phase 1
- [ ] P1.1 `UnitDelayBlockModule` + factory/registry/UI  
- [ ] P1.2 Codegen state + sampleInterval  
- [ ] P1.3 Tests P1-U*, P1-H*  
- [ ] P1.4 blocks-reference + MCP  

### Phase 2
- [x] P2.1 `DivideBlockModule`  
- [x] P2.2 `SignBlockModule`  
- [x] P2.3 Tests P2-*  
- [ ] P2.4 Gravity sample model (optional fixture)  

### Phase 3
- [x] P3.1 `RelayBlockModule`  
- [x] P3.2 `RateLimiterBlockModule` (dt-correct)  
- [x] P3.3 `QuantizerBlockModule`  
- [x] P3.4 Tests P3-* (unit); mini rate-modulator fixture deferred  


### Phase 4
- [x] P4.1 `SelectorBlockModule` (vector v1)  
- [x] P4.2 Tests P4-*  

### Phase 5
- [x] P5.1 Model schema `dataStores[]`  
- [x] P5.2 Write/Read modules  
- [x] P5.3 Flattener + codegen (data_stores struct, init)  
- [x] P5.4 Validation (storeName, indices)  
- [x] P5.5 Tests P5-* (unit); multi-sheet harness deferred  

### Phase 6
- [x] P6.1 `EdgeDetectBlockModule`  
- [ ] P6.2 Engine timer fixture (lookup thrust) — deferred  
- [x] P6.3 Tests P6-* (unit)  

### Phase 7
- [x] P7.1 COESA default tables  
- [x] P7.2 `AtmosphereBlockModule`  
- [x] P7.3 Tests P7-* (unit); q̄ subsystem fixture deferred  

### Phase 8
- [x] P8.1 Gravity + ballistics slice (codegen)  
- [x] P8.2 6DoF vacuum quaternion kinematics (body2quat + x(0) + DCM)  
- [x] P8.3 Engine thrust timer (edge_detect + lookup)  
- [x] P8.4 Atmosphere + q̄  
- [x] P8.5 Stage enable freeze (subsystem enable)  
- [x] P8.6 FCC filter TF + limit  
- [x] P8.7 Rate modulator (relay + unit_delay)  
- [x] P8.8 χ time-tilt + rate_limiter  
- [x] P8.9 IGM mode shell (data_store nIGMMode)  
- [x] P8.10 1D open-loop ascent (thrust + gravity + atmosphere)  
- [x] P8.11 AS205 parameters on relevant slices  
- [x] Fixtures: `examples/saturn-ib/sliceModels.ts`, `docs/sample-models/saturn/`  
- [x] **6-DOF variable-mass quaternion EOM sheet** (`examples/saturn-ib/sixDofVarMassEom.ts`)  




---

## 16. Interface quick reference (all new blocks)

| type | inputs | outputs | state | key parameters |
|------|--------|---------|-------|----------------|
| `unit_delay` | 1 (T) | 1 (T) | yes | `initialValue`, `sampleInterval` |
| `divide` | 2 (num, den) | 1 | no | — |
| `sign` | 1 | 1 | no | — |
| `relay` | 1 | 1 | yes (bool) | `onThreshold`, `offThreshold`, `onOutput`, `offOutput`, `initialOn` |
| `rate_limiter` | 1 | 1 | yes | `risingSlewLimit`, `fallingSlewLimit`, `initialOutput` |
| `quantizer` | 1 | 1 | no | `quantum` |
| `selector` | 1 | 1 | no | `indices` |
| `data_store_write` | 1 | 0 | model store | `storeName` |
| `data_store_read` | 0 | 1 | model store | `storeName` |
| `edge_detect` | 1 | 1 (pulse) | yes | `edge`, `threshold` |
| `atmosphere` | 1 (h) | 4 (T,P,ρ,a) | no | `model`, tables |

---

## 17. Open decisions (resolve before Phase 5–6)

1. **Data store ordering:** same-step write→read vs always previous-step (register)?  
   - *Recommendation:* topological same-step; forbid cycles without `unit_delay`.
2. **Rate limiter dt:** only fixed-step host dt, or variable?  
   - *Recommendation:* fixed-step only (matches current sim).
3. **Relay on vectors:** needed for Saturn?  
   - *Recommendation:* scalar v1.
4. **Atmosphere range:** ascent to ~200 km vs LEO 1000 km tables?  
   - *Recommendation:* 0–200 km default; clamp above.
5. **Integrator reset vs x(0):** sample x(0) on reset?  
   - *Recommendation:* yes, when `showInitPort` and connected.

---

## 18. Related documents

- Gap analysis (conversation / prior review of `saturn_ib_stack_test.mdl`)
- `docs/adding-new-block-types.md` — mechanical checklist per block
- `docs/blocks-reference.md` — user-facing block docs
- `__tests__/harness/README.md` — WASM verification harness
- `AS205_presettings.m` — guidance parameters for Phase 8
- `design/11-Unifying-simulation-with-Wasm.md` — execution backend assumptions

---

*End of plan. Implementation should proceed phase-by-phase with exit criteria tests green before starting the next phase’s dependent work (Phase 7 may parallel plant slices after Phase 2).*

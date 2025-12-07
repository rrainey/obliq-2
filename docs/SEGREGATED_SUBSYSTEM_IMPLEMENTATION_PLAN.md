# Segregated Subsystem Code Generation - Implementation Plan

## Overview

This document describes the implementation plan for "Segregated" subsystems, which generate their own independent C code modules instead of being flattened into the parent model.

### Key Design Decisions (from previous discussion)

| Aspect | Decision |
|--------|----------|
| **Execution timing** | Time-locked (same timestep as parent) |
| **Execution order** | Evaluate algebraic → Compute derivatives → Integration → Update |
| **Algebraic loops** | Detect and reject (error) |
| **Code structure** | Separate .c/.h files, own ModelState (composed into parent) |
| **Enable behavior** | Frozen state, retain last outputs when disabled |
| **"Segregated, atomic"** | Deferred to future implementation |
| **Nesting** | Each subsystem has own strategy; Flatten-inside-Segregated allowed |

### RK4 Integration Strategy

For segregated subsystems with RK4 integration:
1. At each RK4 stage (k1, k2, k3, k4):
   - Parent calls `subsystem_compute_outputs()`
   - Parent calls `subsystem_compute_derivatives()`
2. After all 4 stages: Update all states (parent + subsystem) simultaneously

Subsystem functions become "callable units" invoked by the parent's RK4 orchestrator.

---

## Phase 1: Foundation - Subsystem Detection & Analysis

### Task 1.1: Create SubsystemInfo Interface

**File:** `src/lib/codegen/SubsystemInfo.ts` (new file)

**Description:** Define the data structure that captures all information about a segregated subsystem needed for code generation.

> **Naming Convention:** We use "Subsystem" (not "SegregatedSubsystem") in C typedefs and structure names since only segregated subsystems generate these structures—flattened subsystems are inlined into the parent.

```typescript
export interface SubsystemInfo {
  // Identity
  subsystemId: string
  subsystemName: string           // Original block name
  sanitizedName: string           // C-safe identifier

  // Structure
  sheets: Sheet[]                 // Internal sheets (already flattened if nested)
  flattenedModel: FlattenedModel  // Pre-flattened internal model

  // Port mappings
  inputPorts: SubsystemPort[]     // {name, type, index}
  outputPorts: SubsystemPort[]

  // Special ports
  hasEnableInput: boolean
  hasResetInput?: boolean         // For integrators inside

  // State info
  hasState: boolean               // Has stateful blocks (integrator, TF)
  stateCount: number              // Total state variables

  // Parent context
  parentPath: string[]            // Path to this subsystem in hierarchy
  enableScope: string | null      // Which enable controls this
}

export interface SubsystemPort {
  name: string
  sanitizedName: string
  dataType: string                // 'double', 'double[3]', etc.
  index: number
}
```

**Test:** Unit test that validates the interface structure and required fields.

**Verification:**
- Create a test model with a segregated subsystem
- Verify SubsystemInfo is correctly populated

---

### Task 1.2: Extend ModelFlattener to Detect Segregated Subsystems

**File:** `src/lib/codegen/ModelFlattener.ts`

**Description:** Modify `flattenSubsystems()` to detect subsystems with `codeGenStrategy === 'segregated'` and NOT flatten them. Instead, collect them separately for independent code generation.

**Changes:**
1. Add `segregatedSubsystems: SubsystemInfo[]` to `FlattenedModel`
2. In `flattenSubsystems()`, check `block.parameters?.codeGenStrategy`
3. If 'segregated':
   - Create a sub-ModelFlattener for the subsystem's internal sheets
   - Flatten internal content (respecting nested strategies)
   - Store in `segregatedSubsystems` array
   - Create a "placeholder" block for the subsystem in parent
4. If 'flatten' or undefined: Current behavior (recursive flatten)

**Key Code Changes:**

```typescript
// In FlattenedModel interface
export interface FlattenedModel {
  // ... existing fields

  /** Segregated subsystems that generate their own C modules */
  segregatedSubsystems: SubsystemInfo[]
}

// In flattenSubsystems method
if (block.type === 'subsystem') {
  const strategy = block.parameters?.codeGenStrategy || 'flatten'

  if (strategy === 'segregated') {
    // Don't flatten - collect for separate code generation
    const subsystemInfo = this.analyzeSegregatedSubsystem(block, subsystemPath, parentEnableScope)
    this.segregatedSubsystems.push(subsystemInfo)

    // Keep subsystem as a block (placeholder for calling functions)
    const flattenedBlock: FlattenedBlock = {
      block: { ...block },
      flattenedName: this.generateFlattenedName(block.name, subsystemPath),
      subsystemPath: [...subsystemPath],
      enableScope: parentEnableScope,
      originalSheetId: sheet.id,
      originalId: block.id,
      isSegregated: true  // NEW: Mark as segregated
    }
    flattenedBlocks.push(flattenedBlock)

  } else {
    // Current behavior - flatten recursively
    // ... existing code
  }
}
```

**Test:**
```typescript
describe('Segregated Subsystem Detection', () => {
  test('should NOT flatten segregated subsystem', () => {
    const subsystem = createBlock('sub1', 'subsystem', 'SegSub', {
      codeGenStrategy: 'segregated',
      sheets: [sheetWithBlocks]
    })
    const result = flattener.flattenModel([mainSheet])

    // Subsystem should be preserved as a block
    expect(result.model.blocks.find(b => b.block.id === 'sub1')).toBeDefined()
    expect(result.model.blocks.find(b => b.isSegregated)).toBeDefined()

    // Internal blocks should NOT be in parent's block list
    expect(result.model.blocks.find(b => b.block.name === 'InternalSum')).toBeUndefined()

    // Segregated info should be collected
    expect(result.model.segregatedSubsystems).toHaveLength(1)
    expect(result.model.segregatedSubsystems[0].subsystemName).toBe('SegSub')
  })

  test('should still flatten regular subsystems', () => {
    const subsystem = createBlock('sub1', 'subsystem', 'FlatSub', {
      codeGenStrategy: 'flatten', // or undefined
      sheets: [sheetWithBlocks]
    })
    const result = flattener.flattenModel([mainSheet])

    // Internal blocks SHOULD be in parent's block list
    expect(result.model.blocks.find(b => b.flattenedName === 'FlatSub_InternalSum')).toBeDefined()

    // No segregated subsystems
    expect(result.model.segregatedSubsystems).toHaveLength(0)
  })
})
```

**Verification:**
- Run existing flattening tests - all should pass
- New tests verify segregated detection

---

### Task 1.3: Create analyzeSegregatedSubsystem Helper

**File:** `src/lib/codegen/ModelFlattener.ts`

**Description:** Implement the helper method that analyzes a segregated subsystem and creates its `SubsystemInfo`.

**Implementation:**

```typescript
private analyzeSegregatedSubsystem(
  block: BlockData,
  parentPath: string[],
  parentEnableScope: string | null
): SubsystemInfo {
  const subSheets = block.parameters?.sheets as Sheet[] || []

  // Create a sub-flattener for the subsystem's internal structure
  const subFlattener = new ModelFlattener(this.options)
  const subResult = subFlattener.flattenModel(subSheets, block.name)

  // Extract port information
  const inputPorts = this.extractSubsystemPorts(subResult.model, 'input_port', block.parameters?.inputPorts)
  const outputPorts = this.extractSubsystemPorts(subResult.model, 'output_port', block.parameters?.outputPorts)

  // Check for stateful blocks
  const hasState = subResult.model.blocks.some(b =>
    b.block.type === 'transfer_function' || b.block.type === 'integrator'
  )
  const stateCount = this.countStateVariables(subResult.model)

  return {
    subsystemId: block.id,
    subsystemName: block.name,
    sanitizedName: CCodeBuilder.sanitizeIdentifier(block.name),
    sheets: subSheets,
    flattenedModel: subResult.model,
    inputPorts,
    outputPorts,
    hasEnableInput: block.parameters?.showEnableInput ?? false,
    hasResetInput: this.hasResetBlocks(subResult.model),
    hasState,
    stateCount,
    parentPath,
    enableScope: parentEnableScope
  }
}
```

**Test:** Verify port extraction and state detection.

---

## Phase 2: Subsystem Code Generation

### Task 2.1: Create SubsystemCodeGenerator Class

**File:** `src/lib/codegen/SubsystemCodeGenerator.ts` (new file)

**Description:** New generator class that produces independent C modules for segregated subsystems.

**Structure:**

```typescript
export interface SubsystemCodeResult {
  header: string                    // subsystem_name.h
  source: string                    // subsystem_name.c
  subsystemName: string
  warnings: string[]
}

export class SubsystemCodeGenerator {
  private info: SubsystemInfo
  private typeMap: Map<string, string>

  constructor(info: SubsystemInfo) {
    this.info = info
    // Type propagation happens internally
    this.typeMap = this.propagateTypes()
  }

  generate(): SubsystemCodeResult {
    const header = this.generateHeader()
    const source = this.generateSource()

    return {
      header,
      source,
      subsystemName: this.info.sanitizedName,
      warnings: []
    }
  }

  private generateHeader(): string { /* ... */ }
  private generateSource(): string { /* ... */ }
}
```

**Test:**
```typescript
test('should generate valid C header for segregated subsystem', () => {
  const info = createSubsystemInfo(...)
  const generator = new SubsystemCodeGenerator(info)
  const result = generator.generate()

  expect(result.header).toContain(`#ifndef ${info.sanitizedName.toUpperCase()}_H`)
  expect(result.header).toContain(`typedef struct { ... } ${info.sanitizedName}_t;`)
  expect(result.header).toContain(`void ${info.sanitizedName}_init(`)
})
```

---

### Task 2.2: Generate Subsystem Header File

**File:** `src/lib/codegen/SubsystemCodeGenerator.ts`

**Description:** Generate the .h file for a segregated subsystem containing:
- Include guard
- Input/output structs
- Signal struct
- State struct
- Main subsystem struct (model_t equivalent)
- Function prototypes

**Generated Header Structure:**

```c
#ifndef SUBSYSTEM_NAME_H
#define SUBSYSTEM_NAME_H

#include <stdint.h>
#include <stdbool.h>
#include <math.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Input ports */
typedef struct {
    double In1;
    double In2;
} subsystem_name_inputs_t;

/* Output ports */
typedef struct {
    double Out1;
} subsystem_name_outputs_t;

/* Internal signals */
typedef struct {
    double Sum1;
    double Gain1;
} subsystem_name_signals_t;

/* State variables */
typedef struct {
    double Integrator1_states[1];
} subsystem_name_states_t;

/* Main subsystem structure */
typedef struct {
    subsystem_name_inputs_t inputs;
    subsystem_name_outputs_t outputs;
    subsystem_name_signals_t signals;
    subsystem_name_states_t states;
    int enabled;  /* Enable state */
} subsystem_name_t;

/* Function prototypes */
void subsystem_name_init(subsystem_name_t* sub);
void subsystem_name_compute_outputs(subsystem_name_t* sub);
void subsystem_name_compute_derivatives(
    subsystem_name_t* sub,
    subsystem_name_states_t* derivatives
);

#ifdef __cplusplus
}
#endif

#endif /* SUBSYSTEM_NAME_H */
```

**Key Functions:**
- `subsystem_name_init()` - Initialize to default state
- `subsystem_name_compute_outputs()` - Algebraic evaluation only
- `subsystem_name_compute_derivatives()` - For RK4 integration

**Test:** Validate generated header parses correctly (syntax check).

---

### Task 2.3: Generate Subsystem Source File

**File:** `src/lib/codegen/SubsystemCodeGenerator.ts`

**Description:** Generate the .c file with implementation of all subsystem functions.

**Generated Source Structure:**

```c
#include "subsystem_name.h"
#include <string.h>

/* Initialize subsystem */
void subsystem_name_init(subsystem_name_t* sub) {
    memset(&sub->inputs, 0, sizeof(sub->inputs));
    memset(&sub->outputs, 0, sizeof(sub->outputs));
    memset(&sub->signals, 0, sizeof(sub->signals));
    memset(&sub->states, 0, sizeof(sub->states));
    sub->enabled = 1;

    /* Block-specific initialization */
    /* ... integrator initial conditions, etc. */
}

/* Compute outputs (algebraic evaluation) */
void subsystem_name_compute_outputs(subsystem_name_t* sub) {
    /* Copy inputs to signals */
    sub->signals.In1 = sub->inputs.In1;

    /* Evaluate blocks in topological order */
    sub->signals.Sum1 = sub->signals.In1 + sub->signals.In2;
    sub->signals.Gain1 = 2.0 * sub->signals.Sum1;

    /* For integrators, output = current state */
    sub->signals.Integrator1 = sub->states.Integrator1_states[0];

    /* Copy to outputs */
    sub->outputs.Out1 = sub->signals.Gain1;
}

/* Compute state derivatives */
void subsystem_name_compute_derivatives(
    subsystem_name_t* sub,
    subsystem_name_states_t* derivatives
) {
    memset(derivatives, 0, sizeof(*derivatives));

    /* Integrator derivative = input */
    derivatives->Integrator1_states[0] = sub->signals.Integrator1_input;
}
```

**Test:** Compile generated code with a C compiler to verify correctness.

---

### Task 2.4: Handle Integrator Reset in Subsystem

**File:** `src/lib/codegen/SubsystemCodeGenerator.ts`

**Description:** Generate reset handling for integrators within segregated subsystems.

**Additional Function:**

```c
/* Reset integrator states (called when reset signal triggers) */
void subsystem_name_reset_states(subsystem_name_t* sub) {
    /* Reset integrators to their initial conditions */
    sub->states.Integrator1_states[0] = 0.0;  /* Or configured IC */
}
```

**Test:** Verify reset function is generated when integrators with reset exist.

---

## Phase 3: Parent-Level Integration

### Task 3.1: Modify HeaderGenerator for Composed State

**File:** `src/lib/codegen/HeaderGenerator.ts`

**Description:** Include segregated subsystem states within the parent model struct.

**Changes:**

```c
/* Parent model structure */
typedef struct {
    parent_inputs_t inputs;
    parent_outputs_t outputs;
    parent_signals_t signals;
    parent_states_t states;

    /* Segregated subsystem instances */
    subsystem1_t subsystem1;           /* NEW */
    subsystem2_t subsystem2;           /* NEW */

    enable_states_t enable_states;
    double time;
    double dt;
    int use_rk4;
} parent_t;
```

**Implementation:**

```typescript
private generateModelStructure(): string {
  const members: string[] = []

  // ... existing members ...

  // Add segregated subsystem instances
  for (const sub of this.model.segregatedSubsystems) {
    members.push(`    ${sub.sanitizedName}_t ${sub.sanitizedName};`)
  }

  // ... rest of members ...
}
```

**Also add includes:**

```c
/* Include segregated subsystem headers */
#include "subsystem1.h"
#include "subsystem2.h"
```

**Test:** Verify parent header includes subsystem types.

---

### Task 3.2: Modify InitFunctionGenerator

**File:** `src/lib/codegen/InitFunctionGenerator.ts`

**Description:** Call subsystem init functions from parent init.

**Changes:**

```c
void parent_init(parent_t* model, double dt) {
    /* ... existing initialization ... */

    /* Initialize segregated subsystems */
    subsystem1_init(&model->subsystem1);
    subsystem2_init(&model->subsystem2);

    /* ... rest of init ... */
}
```

**Test:** Verify subsystem init calls are generated.

---

### Task 3.3: Modify AlgebraicEvaluator for Subsystem Output Calls

**File:** `src/lib/codegen/AlgebraicEvaluator.ts`

**Description:** When evaluating a segregated subsystem block, call its `compute_outputs()` function instead of inlining its logic.

**Changes:**

```typescript
private generateBlockComputations(executionOrder: FlattenedBlock[]): string {
  // ...
  for (const block of executionOrder) {
    if (block.isSegregated) {
      code += this.generateSegregatedSubsystemCall(block)
      continue
    }
    // ... existing block handling ...
  }
}

private generateSegregatedSubsystemCall(block: FlattenedBlock): string {
  const subInfo = this.model.segregatedSubsystems.find(
    s => s.subsystemId === block.originalId
  )
  if (!subInfo) return ''

  const safeName = subInfo.sanitizedName
  let code = `\n    /* Segregated subsystem: ${block.block.name} */\n`

  // Copy inputs to subsystem
  for (const port of subInfo.inputPorts) {
    const inputExpr = this.getInputExpressionForPort(block, port.index)
    code += `    model->${safeName}.inputs.${port.sanitizedName} = ${inputExpr};\n`
  }

  // Check enable before computing outputs
  if (subInfo.hasEnableInput) {
    const enableExpr = this.getEnableExpression(block)
    code += `    model->${safeName}.enabled = ${enableExpr};\n`
    code += `    if (model->${safeName}.enabled) {\n`
    code += `        ${safeName}_compute_outputs(&model->${safeName});\n`
    code += `    }\n`
  } else {
    code += `    ${safeName}_compute_outputs(&model->${safeName});\n`
  }

  // Copy outputs to parent signals
  for (const port of subInfo.outputPorts) {
    code += `    model->signals.${safeName}_${port.sanitizedName} = `
    code += `model->${safeName}.outputs.${port.sanitizedName};\n`
  }

  return code
}
```

**Generated Code Example:**

```c
/* Segregated subsystem: Controller */
model->Controller.inputs.Error = model->signals.Sum1;
model->Controller.inputs.Reference = model->inputs.Setpoint;
model->Controller.enabled = model->signals.EnableSignal > 0.5;
if (model->Controller.enabled) {
    Controller_compute_outputs(&model->Controller);
}
model->signals.Controller_Output = model->Controller.outputs.Output;
```

**Test:** Verify subsystem call generates correct input/output mapping.

---

### Task 3.4: Modify RK4Generator for Subsystem Derivatives

**File:** `src/lib/codegen/RK4Generator.ts`

**Description:** Call subsystem derivative functions during RK4 stages.

**Key Insight:** The parent's `model_derivatives()` function must call each segregated subsystem's `compute_derivatives()` function.

**Changes:**

```c
void parent_derivatives(
    double t,
    const parent_inputs_t* inputs,
    const parent_signals_t* signals,
    const parent_states_t* current_states,
    parent_states_t* state_derivatives,
    /* Segregated subsystem state pointers */
    subsystem1_t* subsystem1,
    subsystem1_states_t* subsystem1_derivs
) {
    /* ... parent state derivatives ... */

    /* Compute subsystem derivatives */
    if (subsystem1->enabled) {
        subsystem1_compute_derivatives(subsystem1, subsystem1_derivs);
    } else {
        memset(subsystem1_derivs, 0, sizeof(*subsystem1_derivs));
    }
}
```

**Alternative Design (Simpler):**

Keep subsystem derivatives inside the parent model struct and have the parent compute them:

```c
void parent_derivatives(parent_t* model, parent_derivatives_t* derivs) {
    /* Parent derivatives */
    // ...

    /* Subsystem derivatives */
    if (model->Controller.enabled) {
        Controller_compute_derivatives(&model->Controller, &derivs->Controller);
    }
}
```

This requires a `parent_derivatives_t` struct that contains:
```c
typedef struct {
    parent_states_t parent;
    subsystem1_states_t subsystem1;
    subsystem2_states_t subsystem2;
} parent_derivatives_t;
```

**Test:** Verify derivative calls are generated for subsystems with state.

---

### Task 3.5: Modify StateIntegrator for Subsystem State Updates

**File:** `src/lib/codegen/StateIntegrator.ts`

**Description:** Update RK4 integration to include subsystem states.

**Changes for RK4:**

```c
/* Calculate k1 = f(t, y) */
parent_derivatives(model, &k1);  /* Computes all derivatives including subsystems */

/* Calculate k2 = f(t + h/2, y + h/2 * k1) */
/* Update subsystem temporary states */
for (int i = 0; i < 1; i++) {
    temp_states.Controller.Integrator1_states[i] =
        model->Controller.states.Integrator1_states[i] + half_h * k1.Controller.Integrator1_states[i];
}
/* Temporarily update subsystem states for k2 evaluation */
subsystem1_states_t temp_sub1_states;
memcpy(&temp_sub1_states, &model->Controller.states, sizeof(temp_sub1_states));
// ... apply k1 offsets ...
```

**Simpler approach:** Have subsystem maintain temp states internally during RK4:

```c
/* RK4 for parent with subsystems */
parent_derivatives_t k1, k2, k3, k4;

/* k1 */
parent_derivatives(model, &k1);

/* k2: advance states by h/2 * k1 */
parent_apply_temp_states(model, &k1, half_h);
parent_derivatives(model, &k2);

/* k3: advance states by h/2 * k2 */
parent_apply_temp_states(model, &k2, half_h);
parent_derivatives(model, &k3);

/* k4: advance states by h * k3 */
parent_apply_temp_states(model, &k3, h);
parent_derivatives(model, &k4);

/* Final update */
parent_apply_rk4_update(model, &k1, &k2, &k3, &k4, h);
```

**Test:** Create model with integrator in segregated subsystem, verify correct integration.

---

### Task 3.6: Handle Enable/Disable for Subsystems

**File:** `src/lib/codegen/AlgebraicEvaluator.ts`, `src/lib/codegen/StateIntegrator.ts`

**Description:** When a segregated subsystem is disabled:
- Freeze state (don't integrate)
- Retain last outputs (don't recompute)

**Implementation:**

```c
/* In algebraic evaluation */
if (model->Controller.enabled) {
    Controller_compute_outputs(&model->Controller);
}
/* If disabled, outputs remain at their previous values */

/* In integration */
if (model->Controller.enabled) {
    /* Integrate subsystem states */
    model->Controller.states.Integrator1_states[0] += ...;
}
/* If disabled, states remain frozen */
```

**Test:** Disable a subsystem mid-simulation, verify state freezes.

---

## Phase 4: Code Generator Orchestration

### Task 4.1: Modify CodeGenerator to Produce Multiple Files

**File:** `src/lib/codegen/CodeGenerator.ts`

**Description:** Update the main CodeGenerator to return multiple code files for segregated subsystems.

**Changes:**

```typescript
export interface CodeGenerationResult {
  header: string
  source: string
  warnings: string[]
  stats: { ... }

  /** NEW: Segregated subsystem code files */
  subsystemFiles: SubsystemCodeResult[]
}

generate(sheets: Sheet[], parameters: ModelParameter[]): CodeGenerationResult {
  // ... existing flattening ...

  // Generate subsystem code
  const subsystemFiles: SubsystemCodeResult[] = []
  for (const subInfo of model.segregatedSubsystems) {
    const subGenerator = new SubsystemCodeGenerator(subInfo)
    const subResult = subGenerator.generate()
    subsystemFiles.push(subResult)
  }

  // Generate parent code (with subsystem calls)
  const header = headerGenerator.generate()
  const source = this.generateSource(model, typeMap)

  return {
    header,
    source,
    warnings,
    stats,
    subsystemFiles
  }
}
```

**Test:** Generate code for model with segregated subsystem, verify multiple files returned.

---

### Task 4.2: Update WasmCodeGenerator

**File:** `src/lib/wasm/codegen/WasmCodeGenerator.ts`

**Description:** Handle segregated subsystems in WASM compilation:
- Concatenate all source files for single WASM module
- Or compile subsystems separately (future enhancement)

**Simple approach for now:** Concatenate all C code into single compilation unit:

```typescript
generateWasm(sheets: Sheet[], parameters: ModelParameter[]): WasmCodeGenerationResult {
  const baseResult = super.generate(sheets, parameters)

  // Combine all subsystem headers
  let combinedHeader = ''
  for (const sub of baseResult.subsystemFiles) {
    combinedHeader += sub.header + '\n'
  }
  combinedHeader += baseResult.header

  // Combine all subsystem sources
  let combinedSource = ''
  for (const sub of baseResult.subsystemFiles) {
    combinedSource += sub.source + '\n'
  }
  combinedSource += baseResult.source

  // ... generate WASM from combined code ...
}
```

**Test:** WASM compilation with segregated subsystems produces working module.

---

## Phase 5: Testing

### Task 5.1: Unit Tests for Subsystem Detection

**File:** `__tests__/codegen/segregated-subsystem-detection.test.ts` (new file)

**Test Cases:**
- Detect `codeGenStrategy: 'segregated'`
- Don't flatten segregated subsystem internals
- Correctly extract input/output port info
- Detect stateful blocks within subsystem
- Handle nested subsystems (flatten-inside-segregated)

---

### Task 5.2: Unit Tests for SubsystemCodeGenerator

**File:** `__tests__/codegen/subsystem-code-generator.test.ts` (new file)

**Test Cases:**
- Generate valid header file structure
- Generate valid source file structure
- Handle various input/output types (scalar, vector, matrix)
- Generate correct init function
- Generate correct compute_outputs function
- Generate correct compute_derivatives function
- Handle integrator reset

---

### Task 5.3: Integration Tests for Full Generation

**File:** `__tests__/codegen/segregated-integration.test.ts` (new file)

**Test Cases:**
- Generate parent code that calls subsystem functions
- Correct state composition in parent struct
- RK4 integration includes subsystem states
- Enable/disable behavior works correctly
- Generated code compiles with C compiler

---

### Task 5.4: Manual Verification

**Test Model:** Create a test model in the UI with:
- Parent with input/output ports
- Segregated subsystem with:
  - Sum block
  - Gain block
  - Integrator
- Connect subsystem output back to create feedback loop (through parent)

**Verification Steps:**
1. Set subsystem to `codeGenStrategy: 'segregated'`
2. Generate code
3. Verify separate .h/.c files for subsystem
4. Compile with `emcc` for WASM
5. Run simulation
6. Compare results with flattened version (should be identical)

---

## Implementation Order

| Priority | Task | Estimated Effort | Dependencies |
|----------|------|------------------|--------------|
| 1 | Task 1.1: SubsystemInfo interface | Small | None |
| 2 | Task 1.2: Extend ModelFlattener | Medium | 1.1 |
| 3 | Task 1.3: analyzeSegregatedSubsystem helper | Medium | 1.1 |
| 4 | Task 2.1: SubsystemCodeGenerator class | Medium | 1.3 |
| 5 | Task 2.2: Generate subsystem header | Medium | 2.1 |
| 6 | Task 2.3: Generate subsystem source | Large | 2.2 |
| 7 | Task 3.1: Modify HeaderGenerator | Small | 1.2 |
| 8 | Task 3.2: Modify InitFunctionGenerator | Small | 3.1 |
| 9 | Task 3.3: Modify AlgebraicEvaluator | Medium | 2.3 |
| 10 | Task 3.4: Modify RK4Generator | Medium | 2.3, 3.3 |
| 11 | Task 3.5: Modify StateIntegrator | Medium | 3.4 |
| 12 | Task 3.6: Enable/disable handling | Small | 3.3, 3.5 |
| 13 | Task 4.1: Modify CodeGenerator | Medium | All Phase 3 |
| 14 | Task 2.4: Integrator reset handling | Small | 2.3 |
| 15 | Task 4.2: Update WasmCodeGenerator | Medium | 4.1 |
| 16 | Task 5.1-5.4: All testing | Large | All above |

---

## Success Criteria

1. **Compilation:** Generated C code compiles without errors
2. **Correctness:** Simulation results match flattened version
3. **Isolation:** Subsystem code is self-contained (no dependencies on parent internals)
4. **RK4:** State integration works correctly with RK4 method
5. **Enable:** Disable behavior freezes state and outputs
6. **WASM:** Generated WASM module runs correctly in browser
7. **Tests:** All automated tests pass

---

## Future Enhancements (Not in Scope)

- **Segregated, atomic:** Subsystem executes as atomic unit with local solver
- **Parallel execution:** Multiple segregated subsystems execute in parallel
- **Code optimization:** Dead code elimination, inlining
- **Copy/paste support:** Preserving codeGenStrategy across copy operations

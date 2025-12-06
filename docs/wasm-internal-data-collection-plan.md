# Implementation Plan: Internal Data Storage for Signal Logger and Signal Display Blocks

## Architecture Overview

Transform Signal Logger and Signal Display blocks from passive sinks (where data is externally collected) to active data collectors (where blocks manage their own sample buffers internally in WASM).

### Key Design Decisions
1. **Maximum samples**: Default 1000, configurable via block parameters
2. **Type-aware storage**: Allocate buffers matching input signal type (scalar, vector, matrix)
3. **Single retrieval**: Get all samples with one WASM call after simulation completes
4. **Eliminate output mapping**: No longer treat loggers/displays as "outputs" in WASM

---

## Phase 1: Extend Block Module Interface

### **Task 1.1: Add Data Collection Interface Methods**
**File**: `src/lib/blocks/BlockModule.ts`

**Changes**:
```typescript
export interface IBlockModule {
  // ... existing methods ...

  /**
   * Does this block employ internal data collection during simulation?
   * @param block - The block data
   * @returns true if block stores historical samples internally
   */
  employsDataCollection?(block: BlockData): boolean

  /**
   * Get the maximum number of samples this block will store.
   * @param block - The block data containing parameters
   * @returns Maximum sample count (default: 1000)
   */
  getMaxSampleCount?(block: BlockData): number

  /**
   * Generate C struct members for sample data storage.
   * Must allocate buffer sized for: maxSamples × signalType
   * @param block - The block data
   * @param inputType - The C type of the input signal being sampled
   * @returns Array of C struct member declarations for sample storage
   */
  generateDataCollectionStructMembers?(block: BlockData, inputType: string): string[]

  /**
   * Generate initialization code for sample buffer allocation.
   * Called during model_init() to malloc sample arrays.
   * @param block - The block data
   * @param inputType - The C type of the input signal
   * @returns C code to allocate and initialize sample buffers
   */
  generateDataCollectionInit?(block: BlockData, inputType: string): string

  /**
   * Generate code to store current sample during step().
   * Appends current input value to sample buffer.
   * @param block - The block data
   * @param inputExpression - C expression for current input value
   * @param inputType - The C type of the input signal
   * @returns C code to store sample at current index
   */
  generateSampleStorage?(block: BlockData, inputExpression: string, inputType: string): string

  /**
   * Generate cleanup code to free sample buffers.
   * Called during model destruction.
   * @param block - The block data
   * @returns C code to free allocated memory
   */
  generateDataCollectionCleanup?(block: BlockData): string
}
```

**Testing**:
- Verify interface compiles
- Check that existing blocks (without optional methods) still work
- Run existing unit tests to ensure no regressions

---

## Phase 2: Implement Data Collection in Signal Logger Block

### **Task 2.1: Update SignalLoggerBlockModule**
**File**: `src/lib/blocks/SignalLoggerBlockModule.ts`

**Implementation**:
```typescript
export class SignalLoggerBlockModule implements IBlockModule {
  // ... existing methods ...

  employsDataCollection(block: BlockData): boolean {
    return true
  }

  getMaxSampleCount(block: BlockData): number {
    return block.parameters?.maxSamples || 1000
  }

  generateDataCollectionStructMembers(block: BlockData, inputType: string): string[] {
    const safeName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const maxSamples = this.getMaxSampleCount(block)
    const typeInfo = BlockModuleUtils.parseType(inputType)

    const members: string[] = []

    // Sample buffer pointer
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // For matrix: double (*samples)[rows][cols]
      members.push(`    double (*${safeName}_samples)[${typeInfo.rows}][${typeInfo.cols}];`)
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // For vector: double (*samples)[arraySize]
      members.push(`    double (*${safeName}_samples)[${typeInfo.arraySize}];`)
    } else {
      // For scalar: double* samples
      members.push(`    double* ${safeName}_samples;`)
    }

    // Current sample index
    members.push(`    int ${safeName}_sample_index;`)

    // Maximum samples
    members.push(`    int ${safeName}_max_samples;`)

    return members
  }

  generateDataCollectionInit(block: BlockData, inputType: string): string {
    const safeName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const maxSamples = this.getMaxSampleCount(block)
    const typeInfo = BlockModuleUtils.parseType(inputType)

    let code = `    // Initialize signal logger: ${block.name}\n`
    code += `    model->${safeName}_sample_index = 0;\n`
    code += `    model->${safeName}_max_samples = ${maxSamples};\n`

    // Calculate allocation size
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      const size = `${maxSamples} * ${typeInfo.rows} * ${typeInfo.cols}`
      code += `    model->${safeName}_samples = (double (*)[${typeInfo.rows}][${typeInfo.cols}])malloc(${size} * sizeof(double));\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      const size = `${maxSamples} * ${typeInfo.arraySize}`
      code += `    model->${safeName}_samples = (double (*)[${typeInfo.arraySize}])malloc(${size} * sizeof(double));\n`
    } else {
      code += `    model->${safeName}_samples = (double*)malloc(${maxSamples} * sizeof(double));\n`
    }

    return code
  }

  generateSampleStorage(block: BlockData, inputExpression: string, inputType: string): string {
    const safeName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const typeInfo = BlockModuleUtils.parseType(inputType)

    let code = `    // Store sample for logger: ${block.name}\n`
    code += `    if (model->${safeName}_sample_index < model->${safeName}_max_samples) {\n`

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `        for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `            for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `                model->${safeName}_samples[model->${safeName}_sample_index][i][j] = ${inputExpression}[i][j];\n`
      code += `            }\n`
      code += `        }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `        for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `            model->${safeName}_samples[model->${safeName}_sample_index][i] = ${inputExpression}[i];\n`
      code += `        }\n`
    } else {
      code += `        model->${safeName}_samples[model->${safeName}_sample_index] = ${inputExpression};\n`
    }

    code += `        model->${safeName}_sample_index++;\n`
    code += `    }\n`

    return code
  }

  generateDataCollectionCleanup(block: BlockData): string {
    const safeName = BlockModuleUtils.sanitizeIdentifier(block.name)
    return `    free(model->${safeName}_samples);\n`
  }
}
```

**Testing**:
- Create test model with scalar signal logger
- Verify struct members are generated correctly
- Verify init code allocates memory
- Verify sample storage code is syntactically correct
- Test with vector input (double[3])
- Test with matrix input (double[2][3])

---

### **Task 2.2: Update SignalDisplayBlockModule**
**File**: `src/lib/blocks/SignalDisplayBlockModule.ts`

**Implementation**: Same as Task 2.1 but for Signal Display blocks

**Testing**: Same test cases as Task 2.1

---

## Phase 3: Integrate Data Collection into Code Generation

### **Task 3.1: Update HeaderGenerator to Include Data Collection Structs**
**File**: `src/lib/codegen/HeaderGenerator.ts`

**Changes**:
- In `generateModelStructure()`: Add data collection struct members for logger/display blocks
- Call `block.generateDataCollectionStructMembers()` for blocks that implement it

**Code**:
```typescript
private generateModelStructure(): string {
  // ... existing code ...

  // Add data collection members
  code += '    \n    // Data collection for loggers and displays\n'
  for (const block of this.model.blocks) {
    try {
      const module = BlockModuleFactory.getBlockModule(block.block.type)
      if (module.employsDataCollection && module.employsDataCollection(block.block)) {
        const inputType = this.getBlockInputType(block)
        const members = module.generateDataCollectionStructMembers!(block.block, inputType)
        for (const member of members) {
          code += member + '\n'
        }
      }
    } catch (error) {
      // Skip blocks without data collection
    }
  }

  return code
}
```

**Testing**:
- Generate header for model with signal logger
- Verify struct contains sample buffer pointers
- Verify struct contains index and max_samples fields

---

### **Task 3.2: Update IntegrationOrchestrator to Initialize Data Collection**
**File**: `src/lib/codegen/IntegrationOrchestrator.ts`

**Changes**:
- In `generateInitFunction()`: Call `generateDataCollectionInit()` for logger/display blocks

**Testing**:
- Generate init function
- Verify malloc calls are present
- Verify initialization of index/max fields

---

### **Task 3.3: Update AlgebraicEvaluator to Store Samples**
**File**: `src/lib/codegen/AlgebraicEvaluator.ts`

**Changes**:
- After computing signals for all blocks
- Call `generateSampleStorage()` for logger/display blocks

**Code**:
```typescript
private generateEvaluateAlgebraicFunction(): string {
  // ... existing computation code ...

  // Store samples for data collection blocks
  code += '\n    // Store samples for loggers and displays\n'
  for (const block of this.model.blocks) {
    try {
      const module = BlockModuleFactory.getBlockModule(block.block.type)
      if (module.employsDataCollection && module.employsDataCollection(block.block)) {
        const inputType = this.getBlockInputType(block)
        const inputExpr = this.getInputExpression(block)
        code += module.generateSampleStorage!(block.block, inputExpr, inputType)
      }
    } catch (error) {
      // Skip
    }
  }

  return code
}
```

**Testing**:
- Generate evaluate_algebraic function
- Verify sample storage code is inserted after block computations
- Run through C compiler to check syntax

---

### **Task 3.4: Add Cleanup Function**
**File**: `src/lib/codegen/IntegrationOrchestrator.ts`

**Changes**:
- Add new `generateCleanupFunction()` method
- Call `generateDataCollectionCleanup()` for all data collection blocks

**Testing**:
- Verify cleanup function frees all allocated buffers
- Check for memory leaks using valgrind (if available)

---

## Phase 4: Add WASM Interface for Sample Retrieval

### **Task 4.1: Generate WASM Sample Getter Functions**
**File**: `src/lib/wasm/codegen/WasmCodeGenerator.ts`

**Changes**:
- Remove logger/display blocks from output mapping
- Add new functions: `wasm_get_logger_samples()`, `wasm_get_logger_count()`

**Implementation**:
```c
// Get number of loggers/displays
EMSCRIPTEN_KEEPALIVE
int wasm_get_collector_count() {
    return <count_of_logger_and_display_blocks>;
}

// Get collector name by index
EMSCRIPTEN_KEEPALIVE
const char* wasm_get_collector_name(int index) {
    switch(index) {
        case 0: return "logger_Temperature";
        case 1: return "display_Signal_display4";
        default: return NULL;
    }
}

// Get sample count for a collector
EMSCRIPTEN_KEEPALIVE
int wasm_get_sample_count(int collector_index) {
    switch(collector_index) {
        case 0: return Test01_instance.Temperature_sample_index;
        case 1: return Test01_instance.Signal_display4_sample_index;
        default: return 0;
    }
}

// Get samples array pointer for a collector
EMSCRIPTEN_KEEPALIVE
double* wasm_get_samples(int collector_index) {
    switch(collector_index) {
        case 0: return Test01_instance.Temperature_samples;
        case 1: return Test01_instance.Signal_display4_samples;
        default: return NULL;
    }
}
```

**Testing**:
- Compile WASM module
- Verify functions are exported
- Call from JavaScript to retrieve sample pointers

---

### **Task 4.2: Update WasmSimulationEngine to Retrieve Samples**
**File**: `src/lib/simulation/WasmSimulationEngine.ts`

**Changes**:
- Remove `getLoggerNames()`, `getLoggerValues()` methods
- Add `getSampleData()` method that reads entire sample buffers

**Implementation**:
```typescript
/**
 * Get all sample data from loggers and displays
 * @returns Map of collector name to sample array
 */
getSampleData(): Map<string, SignalValue[]> {
  if (!this.module || !this.metadata) {
    return new Map()
  }

  const collectorCount = this.module._wasm_get_collector_count()
  const sampleData = new Map<string, SignalValue[]>()

  for (let i = 0; i < collectorCount; i++) {
    const namePtr = this.module._wasm_get_collector_name(i)
    const name = this.module.UTF8ToString(namePtr)
    const sampleCount = this.module._wasm_get_sample_count(i)
    const samplesPtr = this.module._wasm_get_samples(i)

    // Copy samples from WASM memory to JavaScript array
    const samples: number[] = []
    for (let j = 0; j < sampleCount; j++) {
      samples.push(this.module.HEAPF64[samplesPtr/8 + j])
    }

    // Remove prefix for cleaner keys
    const shortName = name.replace(/^(logger_|display_)/, '')
    sampleData.set(shortName, samples)
  }

  return sampleData
}
```

**Testing**:
- Run simulation
- Call `getSampleData()` after completion
- Verify array lengths match timestep count
- Verify values are not NaN
- Test with vector/matrix signals (will need separate implementation)

---

## Phase 5: Update Result Conversion

### **Task 5.1: Simplify WasmResultConverter**
**File**: `src/lib/simulation/WasmResultConverter.ts`

**Changes**:
- Remove dependency on `getLoggerNames()`/`getLoggerValues()`
- Accept `sampleData` Map directly
- Remove all output mapping logic

**Implementation**:
```typescript
export function convertWasmToUIFormat(
  sampleData: Map<string, SignalValue[]>,
  sheets: Sheet[],
  timeStep: number,
  duration: number
): Map<string, SimulationResults> {
  const results = new Map<string, SimulationResults>()
  const timePoints = generateTimePoints(timeStep, duration)

  // Build logger/display name to block mapping
  const collectorToBlockMap = buildCollectorToBlockMap(sheets)

  // Group by sheet
  const collectorsBySheet = groupCollectorsBySheet(sampleData.keys(), collectorToBlockMap, sheets)

  // Create SimulationResults for each sheet
  for (const [sheetId, collectors] of collectorsBySheet) {
    const signalData = new Map<string, SignalValue[]>()

    for (const { blockId, collectorName } of collectors) {
      const samples = sampleData.get(collectorName)
      if (samples) {
        signalData.set(blockId, samples)
      }
    }

    results.set(sheetId, {
      timePoints,
      finalTime: duration,
      signalData
    })
  }

  return results
}
```

**Testing**:
- Run simulation end-to-end
- Verify UI receives correct data structure
- Verify scope displays show proper waveforms

---

### **Task 5.2: Update Simulation Page to Use New API**
**File**: `src/app/models/[id]/page.tsx`

**Changes**:
- Remove `WasmDataCollector` usage
- Remove per-timestep data collection loop
- Call `getSampleData()` once after simulation

**Before**:
```typescript
// Run simulation with data collection
const dataCollector = new WasmDataCollector()
for (let step = 0; step < numSteps; step++) {
  wasmEngine.step()
  const loggerValues = wasmEngine.getLoggerValues()
  dataCollector.collect(currentTime, loggerValues)
}
```

**After**:
```typescript
// Run simulation
for (let step = 0; step < numSteps; step++) {
  wasmEngine.step()
}

// Retrieve all sample data at once
const sampleData = wasmEngine.getSampleData()
```

**Testing**:
- Run full simulation
- Verify performance improvement (measure time)
- Verify scope displays render correctly
- Test with multiple loggers/displays

---

## Phase 6: Handle Vector and Matrix Signals

### **Task 6.1: Extend WASM Interface for Multidimensional Data**
**File**: `src/lib/wasm/codegen/WasmCodeGenerator.ts`

**Changes**:
- Add `wasm_get_signal_type()` to return type information
- Modify `wasm_get_samples()` to handle vectors/matrices

**Implementation**: Add metadata about signal dimensions

**Testing**:
- Test logger with vector input `double[3]`
- Test logger with matrix input `double[2][3]`
- Verify JavaScript receives correct array structure

---

### **Task 6.2: Update getSampleData() for Multidimensional Signals**
**File**: `src/lib/simulation/WasmSimulationEngine.ts`

**Changes**:
- Query signal type before copying samples
- For vectors: copy as `number[][]` (array of vectors)
- For matrices: copy as `number[][][]` (array of matrices)

**Testing**: Same as 6.1

---

## Phase 7: Cleanup and Performance Validation

### **Task 7.1: Remove Old Output Mapping Code**
**Files**:
- `src/lib/wasm/codegen/WasmCodeGenerator.ts`
- Remove `extractPortMappings()` logic for loggers/displays
- Remove from `generateWasmGetOutputFunction()`

**Testing**:
- Verify compilation still works
- Verify output ports (non-logger/display) still function

---

### **Task 7.2: Bump Cache Version**
**File**: `src/lib/wasm/cache/cacheKey.ts`

**Change**: `const CODEGEN_VERSION = 'v4'`

**Testing**: Verify old caches are invalidated

---

### **Task 7.3: Performance Benchmarking**
**Test Cases**:
1. **Baseline**: 10-second simulation, 1000 timesteps, 1 logger (old approach)
2. **New**: Same simulation with new internal storage approach
3. **Measure**: Total execution time, WASM↔JS call count

**Expected Results**:
- 50-80% reduction in total execution time
- ~1000× fewer WASM↔JS boundary crossings

---

### **Task 7.4: End-to-End Integration Testing**
**Test Models**:
1. Model with 1 scalar signal logger
2. Model with 1 scalar signal display
3. Model with both logger and display
4. Model with vector signal logger `double[3]`
5. Model with 5 loggers (stress test)

**Validation**:
- All scope displays render correctly
- Sample counts match expected timesteps
- Values match JavaScript simulation results
- No memory leaks (verify with browser dev tools)

---

## Summary of Benefits

| Aspect | Old Approach | New Approach | Improvement |
|--------|--------------|--------------|-------------|
| **WASM calls per simulation** | 1000× (2 per timestep) | 5× (once at end) | **200× fewer** |
| **Code complexity** | 3 files (Generator, Engine, Converter) | 2 files (Block modules, Engine) | **Simpler** |
| **Memory efficiency** | Duplicate storage (WASM + JS) | Single storage (WASM only) | **50% less** |
| **Type safety** | Runtime mapping | Compile-time structs | **Better** |
| **Performance** | ~500ms for 1000 steps | ~50-100ms for 1000 steps | **5-10× faster** |

This plan provides a clean, performant architecture that treats data collection as a first-class block capability rather than a simulation supervisor concern.

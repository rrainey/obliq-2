# Block Test Harness

A test framework for validating C code generation by compiling and executing generated code.

## Overview

The BlockTestHarness provides:

1. **Model Creation** - Simplified API for creating test models with blocks and connections
2. **Code Generation** - Uses WasmCodeGenerator to produce C code
3. **Compilation** - Compiles C to WASM using Docker/Emscripten
4. **Execution** - Runs simulations and collects time-series results
5. **Assertions** - Utilities for validating output values

## Prerequisites

- Docker installed and running
- The Emscripten Docker image built: `npm run wasm:build-docker`

## Quick Start

```typescript
import { createHarness } from '@/__tests__/harness'

describe('My Block Tests', () => {
  let harness: BlockTestHarness

  jest.setTimeout(300000) // 5 minutes for Docker compilation

  beforeEach(() => {
    harness = createHarness()
  })

  afterEach(async () => {
    await harness.cleanup()
  })

  it('should compute correctly', async () => {
    // 1. Create a test model
    const model = harness.createTestModel({
      blocks: [{
        type: 'source',
        name: 'MySource',
        parameters: {
          signalType: 'constant',
          value: 42.0
        }
      }],
      outputs: ['MySource']
    })

    // 2. Generate and compile
    const compiled = await harness.generateAndCompile(model, 'my_test')

    // 3. Run simulation
    const results = await harness.runSimulation(compiled, {
      duration: 1.0,
      dt: 0.1
    })

    // 4. Assert results
    harness.assertFinalOutput(results, 'out_0', 42.0)
  })
})
```

## API Reference

### `createHarness()`

Factory function to create a new BlockTestHarness instance.

### `harness.createTestModel(def: TestModelDef): Sheet[]`

Creates a test model from a simplified definition.

**TestModelDef:**
```typescript
{
  blocks: TestBlock[]       // Blocks to include
  connections?: TestConnection[]  // Explicit connections
  outputs?: string[]        // Block names to auto-wire to outputs
  inputs?: string[]         // Block names to create as input ports
}
```

**TestBlock:**
```typescript
{
  type: string              // Block type (e.g., 'source', 'sum', 'scale')
  name: string              // Unique block name
  parameters?: Record<string, any>  // Block-specific parameters
}
```

**TestConnection:**
```typescript
{
  from: string | { block: string; port: number }
  to: string | { block: string; port: number }
}
```

### `harness.generateAndCompile(sheets, modelName?): Promise<CompiledModel>`

Generates C code and compiles to WASM using Docker.

Returns a `CompiledModel` with:
- `module` - The loaded WASM module
- `inputMap` - Map of input port names to indices
- `outputMap` - Map of output port names to indices
- `outputDir` - Path to generated files (for debugging)

### `harness.runSimulation(compiled, config): Promise<SimulationResult>`

Runs a simulation and collects results.

**SimulationConfig:**
```typescript
{
  duration: number          // Total simulation time
  dt?: number               // Time step (default: 0.01)
  inputs?: Record<string, number>  // Constant input values
  inputSchedule?: Array<{   // Time-varying inputs
    time: number
    inputs: Record<string, number>
  }>
  recordEvery?: number      // Record every N steps (default: 1)
}
```

**SimulationResult:**
```typescript
{
  times: number[]           // Time values
  outputs: Map<string, number[]>  // Output time series
  finalTime: number         // Final simulation time
  stepCount: number         // Number of steps executed
}
```

### Assertion Methods

#### `harness.assertOutputAt(results, time, outputName, expected, tolerance?)`

Assert output value at a specific time.

#### `harness.assertFinalOutput(results, outputName, expected, tolerance?)`

Assert the final output value.

#### `harness.assertOutputSequence(results, outputName, sequence, tolerance?)`

Assert output matches a sequence of time-value pairs.

#### `harness.getOutputAt(results, time, outputName): number`

Get the output value at a specific time.

### `harness.cleanup()`

Clean up generated files after test completes.

## Examples

### Testing a Step Signal

```typescript
const model = harness.createTestModel({
  blocks: [{
    type: 'source',
    name: 'Step',
    parameters: {
      signalType: 'step',
      stepTime: 1.0,
      stepValue: 5.0
    }
  }],
  outputs: ['Step']
})

const compiled = await harness.generateAndCompile(model)
const results = await harness.runSimulation(compiled, { duration: 3.0 })

harness.assertOutputAt(results, 0.5, 'out_0', 0.0)  // Before step
harness.assertOutputAt(results, 1.5, 'out_0', 5.0)  // After step
```

### Testing Block Combinations

```typescript
const model = harness.createTestModel({
  blocks: [
    { type: 'source', name: 'Src', parameters: { value: 10 } },
    { type: 'scale', name: 'Gain', parameters: { gain: 2.0 } }
  ],
  connections: [
    { from: 'Src', to: 'Gain' }
  ],
  outputs: ['Gain']
})

const compiled = await harness.generateAndCompile(model)
const results = await harness.runSimulation(compiled, { duration: 1.0 })

harness.assertFinalOutput(results, 'out_0', 20.0)  // 10 * 2 = 20
```

### Using Input Ports

```typescript
const model = harness.createTestModel({
  inputs: ['a', 'b'],
  blocks: [
    { type: 'sum', name: 'Add', parameters: { signs: '++' } }
  ],
  connections: [
    { from: 'a', to: { block: 'Add', port: 0 } },
    { from: 'b', to: { block: 'Add', port: 1 } }
  ],
  outputs: ['Add']
})

const compiled = await harness.generateAndCompile(model)
const results = await harness.runSimulation(compiled, {
  duration: 1.0,
  inputs: { a: 3, b: 7 }
})

harness.assertFinalOutput(results, 'out_0', 10.0)  // 3 + 7 = 10
```

## Debugging

If a test fails, check the generated files in `harness.getOutputDir()`:
- `{modelName}.h` - Generated header
- `{modelName}.c` - Generated source
- `{modelName}_wasm.c` - WASM wrapper
- `{modelName}.js` - Compiled WASM loader
- `{modelName}.wasm` - Compiled WebAssembly

## Running Tests

```bash
# Run all harness tests
npm test -- --testPathPattern=harness

# Run specific test file
npm test -- __tests__/harness/SourceBlock.harness.test.ts
```

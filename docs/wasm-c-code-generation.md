# C Code Generation for WebAssembly

## Overview

This document specifies how to extend the existing C code generator to produce Wasm-compatible code while maintaining compatibility with embedded targets.

## Dual-Target Strategy

We maintain a **single C codebase** that compiles for both:
1. **WebAssembly** (for browser simulation)
2. **Embedded targets** (Arduino, PlatformIO, bare metal)

This is achieved through conditional compilation and a thin interface layer.

## Architecture

```
Model JSON
    ↓
CodeGenerator (existing)
    ↓
    ├─→ Core Model Code (shared)
    │   ├─ model_evaluate_algebraic()
    │   ├─ model_step()
    │   ├─ integrate_states()
    │   └─ Block implementations
    │
    └─→ Interface Layer (target-specific)
        ├─ Wasm Interface (model_wasm.c)
        │   ├─ model_init()
        │   ├─ model_set_input()
        │   ├─ model_get_output()
        │   └─ model_get_scope_data()
        │
        └─ Embedded Interface (model_embedded.c)
            ├─ setup()
            ├─ loop()
            └─ Hardware-specific I/O
```

## Generated File Structure

For a model named "Vehicle":

### Shared Files (both targets)
```
vehicle_model.h       - Core structs and types
vehicle_model.c       - Core simulation logic
vehicle_blocks.c      - Block implementations
vehicle_integration.c - RK4/Euler integration
```

### Wasm-Specific Files
```
vehicle_wasm.c        - Wasm interface layer
vehicle_wasm.h        - Wasm interface declarations
```

### Embedded-Specific Files
```
vehicle_embedded.c    - Arduino/PlatformIO interface
vehicle_embedded.h    - Hardware I/O declarations
```

## Core Header File (`vehicle_model.h`)

This file is **identical** for both Wasm and embedded:

```c
#ifndef VEHICLE_MODEL_H
#define VEHICLE_MODEL_H

#include <stdint.h>
#include <stdbool.h>
#include <math.h>
#include <string.h>

// Configuration
#define MODEL_NAME "Vehicle"
#define MODEL_DT 0.01
#define MAX_SCOPE_SAMPLES 1000

// Input structure (auto-generated from input ports)
typedef struct {
    double throttle;        // Input port: throttle
    double brake;           // Input port: brake
    double steering_angle;  // Input port: steering_angle
} vehicle_inputs_t;

// Output structure (auto-generated from output ports)
typedef struct {
    double vehicle_speed;   // Output port: vehicle_speed
    double engine_rpm;      // Output port: engine_rpm
    double wheel_angle;     // Output port: wheel_angle
} vehicle_outputs_t;

// State structure (auto-generated from stateful blocks)
typedef struct {
    // Transfer function states (one per TF block)
    double tf_engine_states[2];     // EngineModel transfer function
    double tf_suspension_states[4]; // SuspensionModel transfer function
    
    // Enable states for subsystems
    bool subsystem_controller_enabled;
} vehicle_states_t;

// Signal structure (auto-generated from intermediate signals)
typedef struct {
    double engine_torque;    // Signal: Sum1 output
    double wheel_force;      // Signal: Multiply2 output
    double acceleration;     // Signal: Divide1 output
    // ... all intermediate signals
} vehicle_signals_t;

// Scope/logger structure (auto-generated from Signal Logger blocks)
typedef struct {
    double* buffer;
    int capacity;
    int count;
} scope_buffer_t;

typedef struct {
    scope_buffer_t speed_logger;
    scope_buffer_t rpm_logger;
    // ... one per Signal Logger block
} vehicle_scope_data_t;

// Main model structure
typedef struct {
    double time;
    double dt;
    
    vehicle_inputs_t inputs;
    vehicle_outputs_t outputs;
    vehicle_states_t states;
    vehicle_signals_t signals;
    vehicle_scope_data_t scope_data;
} vehicle_model_t;

// Core simulation functions (used by both targets)
void vehicle_evaluate_algebraic(
    const vehicle_inputs_t* inputs,
    const vehicle_states_t* states,
    vehicle_signals_t* signals,
    vehicle_outputs_t* outputs
);

void vehicle_integrate_states(
    vehicle_model_t* model,
    double dt
);

void vehicle_step(vehicle_model_t* model);

void vehicle_init_states(vehicle_states_t* states);

#endif // VEHICLE_MODEL_H
```

## Core Implementation (`vehicle_model.c`)

This is the main simulation logic, **identical for both targets**:

```c
#include "vehicle_model.h"

// Initialize state variables to their initial values
void vehicle_init_states(vehicle_states_t* states) {
    // Zero all states
    memset(states, 0, sizeof(vehicle_states_t));
    
    // Set non-zero initial conditions if specified
    // (auto-generated from block parameters)
    
    // All subsystems enabled by default
    states->subsystem_controller_enabled = true;
}

// Algebraic evaluation - compute all signals and outputs from inputs and states
void vehicle_evaluate_algebraic(
    const vehicle_inputs_t* inputs,
    const vehicle_states_t* states,
    vehicle_signals_t* signals,
    vehicle_outputs_t* outputs
) {
    // Block execution in topological order
    
    // Sum1: engine_torque = throttle + brake_force
    signals->engine_torque = inputs->throttle - inputs->brake * 0.8;
    
    // TransferFunction1: engine dynamics (using current state)
    // Output = C * x + D * u  (state-space representation)
    signals->engine_output = states->tf_engine_states[0] * 1.0 + 
                            signals->engine_torque * 0.5;
    
    // Multiply2: wheel_force = engine_output * gear_ratio
    const double gear_ratio = 3.5; // Parameter from block
    signals->wheel_force = signals->engine_output * gear_ratio;
    
    // ... more block computations
    
    // Final outputs
    outputs->vehicle_speed = signals->vehicle_speed_final;
    outputs->engine_rpm = signals->engine_output * 1000.0;
    outputs->wheel_angle = inputs->steering_angle;
}

// State derivatives for integration (RK4)
void vehicle_compute_derivatives(
    const vehicle_inputs_t* inputs,
    const vehicle_states_t* states,
    const vehicle_signals_t* signals,
    vehicle_states_t* derivatives
) {
    // Transfer function state derivatives
    // dx/dt = A*x + B*u
    
    // Engine transfer function: (s + 2) / (s^2 + 3s + 1)
    // State-space: A = [[0, 1], [-1, -3]], B = [[0], [1]], C = [2, 1], D = 0
    const double* x = states->tf_engine_states;
    const double u = signals->engine_torque;
    
    derivatives->tf_engine_states[0] = x[1];
    derivatives->tf_engine_states[1] = -1.0 * x[0] - 3.0 * x[1] + 1.0 * u;
    
    // ... more state derivatives
}

// RK4 integration
void vehicle_integrate_states(
    vehicle_model_t* model,
    double dt
) {
    // Only integrate enabled subsystems
    if (!model->states.subsystem_controller_enabled) {
        return; // Skip integration for disabled subsystem
    }
    
    vehicle_states_t k1, k2, k3, k4;
    vehicle_states_t temp_states;
    vehicle_signals_t temp_signals;
    vehicle_outputs_t temp_outputs;
    
    // k1 = f(t, y)
    vehicle_compute_derivatives(&model->inputs, &model->states, 
                               &model->signals, &k1);
    
    // k2 = f(t + dt/2, y + k1*dt/2)
    // temp_states = states + k1 * (dt/2)
    for (int i = 0; i < sizeof(vehicle_states_t)/sizeof(double); i++) {
        ((double*)&temp_states)[i] = ((double*)&model->states)[i] + 
                                    ((double*)&k1)[i] * dt * 0.5;
    }
    vehicle_evaluate_algebraic(&model->inputs, &temp_states, 
                              &temp_signals, &temp_outputs);
    vehicle_compute_derivatives(&model->inputs, &temp_states, 
                               &temp_signals, &k2);
    
    // k3 = f(t + dt/2, y + k2*dt/2)
    for (int i = 0; i < sizeof(vehicle_states_t)/sizeof(double); i++) {
        ((double*)&temp_states)[i] = ((double*)&model->states)[i] + 
                                    ((double*)&k2)[i] * dt * 0.5;
    }
    vehicle_evaluate_algebraic(&model->inputs, &temp_states, 
                              &temp_signals, &temp_outputs);
    vehicle_compute_derivatives(&model->inputs, &temp_states, 
                               &temp_signals, &k3);
    
    // k4 = f(t + dt, y + k3*dt)
    for (int i = 0; i < sizeof(vehicle_states_t)/sizeof(double); i++) {
        ((double*)&temp_states)[i] = ((double*)&model->states)[i] + 
                                    ((double*)&k3)[i] * dt;
    }
    vehicle_evaluate_algebraic(&model->inputs, &temp_states, 
                              &temp_signals, &temp_outputs);
    vehicle_compute_derivatives(&model->inputs, &temp_states, 
                               &temp_signals, &k4);
    
    // y_new = y + (dt/6) * (k1 + 2*k2 + 2*k3 + k4)
    for (int i = 0; i < sizeof(vehicle_states_t)/sizeof(double); i++) {
        ((double*)&model->states)[i] += (dt / 6.0) * (
            ((double*)&k1)[i] + 
            2.0 * ((double*)&k2)[i] + 
            2.0 * ((double*)&k3)[i] + 
            ((double*)&k4)[i]
        );
    }
}

// Main step function
void vehicle_step(vehicle_model_t* model) {
    // 1. Evaluate algebraic relationships
    vehicle_evaluate_algebraic(&model->inputs, &model->states, 
                              &model->signals, &model->outputs);
    
    // 2. Integrate states
    vehicle_integrate_states(model, model->dt);
    
    // 3. Update time
    model->time += model->dt;
    
    // 4. Log scope data
    if (model->scope_data.speed_logger.count < model->scope_data.speed_logger.capacity) {
        model->scope_data.speed_logger.buffer[model->scope_data.speed_logger.count++] = 
            model->outputs.vehicle_speed;
    }
    // ... log other signals
}
```

## Wasm Interface Layer (`vehicle_wasm.c`)

This file provides the **JavaScript-callable interface**:

```c
#include "vehicle_model.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

#include <stdlib.h>

// Initialize a new model instance
EMSCRIPTEN_KEEPALIVE
void* vehicle_model_init(double dt) {
    vehicle_model_t* model = (vehicle_model_t*)malloc(sizeof(vehicle_model_t));
    if (!model) return NULL;
    
    // Initialize fields
    model->time = 0.0;
    model->dt = dt;
    
    // Initialize states
    vehicle_init_states(&model->states);
    
    // Allocate scope buffers
    model->scope_data.speed_logger.capacity = MAX_SCOPE_SAMPLES;
    model->scope_data.speed_logger.count = 0;
    model->scope_data.speed_logger.buffer = 
        (double*)malloc(MAX_SCOPE_SAMPLES * sizeof(double));
    
    model->scope_data.rpm_logger.capacity = MAX_SCOPE_SAMPLES;
    model->scope_data.rpm_logger.count = 0;
    model->scope_data.rpm_logger.buffer = 
        (double*)malloc(MAX_SCOPE_SAMPLES * sizeof(double));
    
    // Zero inputs
    memset(&model->inputs, 0, sizeof(vehicle_inputs_t));
    
    return model;
}

// Set input by index
EMSCRIPTEN_KEEPALIVE
void vehicle_model_set_input(void* handle, int index, double value) {
    vehicle_model_t* model = (vehicle_model_t*)handle;
    if (!model) return;
    
    // Auto-generated from input port order
    switch(index) {
        case 0: model->inputs.throttle = value; break;
        case 1: model->inputs.brake = value; break;
        case 2: model->inputs.steering_angle = value; break;
        default: break;
    }
}

// Get output by index
EMSCRIPTEN_KEEPALIVE
double vehicle_model_get_output(void* handle, int index) {
    vehicle_model_t* model = (vehicle_model_t*)handle;
    if (!model) return 0.0;
    
    // Auto-generated from output port order
    switch(index) {
        case 0: return model->outputs.vehicle_speed;
        case 1: return model->outputs.engine_rpm;
        case 2: return model->outputs.wheel_angle;
        default: return 0.0;
    }
}

// Set all inputs at once (more efficient)
EMSCRIPTEN_KEEPALIVE
void vehicle_model_set_inputs(void* handle, const double* inputs, int count) {
    vehicle_model_t* model = (vehicle_model_t*)handle;
    if (!model || !inputs) return;
    
    if (count > 0) model->inputs.throttle = inputs[0];
    if (count > 1) model->inputs.brake = inputs[1];
    if (count > 2) model->inputs.steering_angle = inputs[2];
}

// Get all outputs at once (more efficient)
EMSCRIPTEN_KEEPALIVE
void vehicle_model_get_outputs(void* handle, double* outputs, int count) {
    vehicle_model_t* model = (vehicle_model_t*)handle;
    if (!model || !outputs) return;
    
    if (count > 0) outputs[0] = model->outputs.vehicle_speed;
    if (count > 1) outputs[1] = model->outputs.engine_rpm;
    if (count > 2) outputs[2] = model->outputs.wheel_angle;
}

// Get scope data for a logger
EMSCRIPTEN_KEEPALIVE
double* vehicle_model_get_scope_data(void* handle, int logger_index, int* length) {
    vehicle_model_t* model = (vehicle_model_t*)handle;
    if (!model || !length) {
        if (length) *length = 0;
        return NULL;
    }
    
    // Auto-generated from Signal Logger blocks
    switch(logger_index) {
        case 0: // speed_logger
            *length = model->scope_data.speed_logger.count;
            return model->scope_data.speed_logger.buffer;
        case 1: // rpm_logger
            *length = model->scope_data.rpm_logger.count;
            return model->scope_data.rpm_logger.buffer;
        default:
            *length = 0;
            return NULL;
    }
}

// Clear scope data
EMSCRIPTEN_KEEPALIVE
void vehicle_model_clear_scope_data(void* handle) {
    vehicle_model_t* model = (vehicle_model_t*)handle;
    if (!model) return;
    
    model->scope_data.speed_logger.count = 0;
    model->scope_data.rpm_logger.count = 0;
}

// Step simulation
EMSCRIPTEN_KEEPALIVE
void vehicle_model_step(void* handle) {
    vehicle_model_t* model = (vehicle_model_t*)handle;
    if (!model) return;
    
    vehicle_step(model);
}

// Get current simulation time
EMSCRIPTEN_KEEPALIVE
double vehicle_model_get_time(void* handle) {
    vehicle_model_t* model = (vehicle_model_t*)handle;
    return model ? model->time : 0.0;
}

// Cleanup
EMSCRIPTEN_KEEPALIVE
void vehicle_model_destroy(void* handle) {
    vehicle_model_t* model = (vehicle_model_t*)handle;
    if (!model) return;
    
    // Free scope buffers
    free(model->scope_data.speed_logger.buffer);
    free(model->scope_data.rpm_logger.buffer);
    
    // Free model
    free(model);
}
```

## Emscripten Compilation Command

```bash
emcc \
  vehicle_model.c \
  vehicle_wasm.c \
  -o vehicle_model.js \
  -s WASM=1 \
  -s EXPORTED_FUNCTIONS='[
    "_vehicle_model_init",
    "_vehicle_model_destroy",
    "_vehicle_model_set_input",
    "_vehicle_model_set_inputs",
    "_vehicle_model_get_output",
    "_vehicle_model_get_outputs",
    "_vehicle_model_get_scope_data",
    "_vehicle_model_clear_scope_data",
    "_vehicle_model_step",
    "_vehicle_model_get_time",
    "_malloc",
    "_free"
  ]' \
  -s EXPORTED_RUNTIME_METHODS='[
    "ccall",
    "cwrap",
    "getValue",
    "setValue",
    "HEAPF64"
  ]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME='createVehicleModelModule' \
  -s INITIAL_MEMORY=16MB \
  -s MAXIMUM_MEMORY=256MB \
  -O2 \
  -lm
```

## TypeScript Type Generation

Along with C code, generate TypeScript types:

```typescript
// vehicle_model.d.ts (auto-generated)

export interface VehicleModelInputs {
  throttle: number
  brake: number
  steering_angle: number
}

export interface VehicleModelOutputs {
  vehicle_speed: number
  engine_rpm: number
  wheel_angle: number
}

export interface VehicleModelModule {
  _vehicle_model_init(dt: number): number
  _vehicle_model_destroy(handle: number): void
  _vehicle_model_set_input(handle: number, index: number, value: number): void
  _vehicle_model_set_inputs(handle: number, inputs: number, count: number): void
  _vehicle_model_get_output(handle: number, index: number): number
  _vehicle_model_get_outputs(handle: number, outputs: number, count: number): void
  _vehicle_model_get_scope_data(handle: number, loggerIndex: number, lengthPtr: number): number
  _vehicle_model_clear_scope_data(handle: number): void
  _vehicle_model_step(handle: number): void
  _vehicle_model_get_time(handle: number): number
  _malloc(size: number): number
  _free(ptr: number): void
  HEAPF64: Float64Array
  getValue(ptr: number, type: string): number
  setValue(ptr: number, value: number, type: string): void
}

export function createVehicleModelModule(): Promise<VehicleModelModule>
```

## Code Generator Updates

### New Generator Class: `WasmCodeGenerator`

```typescript
// lib/codegen/WasmCodeGenerator.ts

export class WasmCodeGenerator extends BaseCodeGenerator {
  
  generateWasmInterface(): string {
    const modelName = this.sanitizeName(this.model.name)
    
    return `
// Wasm interface for ${this.model.name}
// Auto-generated - do not edit

#include "${modelName}_model.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

#include <stdlib.h>

${this.generateInitFunction()}

${this.generateSetInputFunctions()}

${this.generateGetOutputFunctions()}

${this.generateScopeDataFunctions()}

${this.generateStepFunction()}

${this.generateDestroyFunction()}
`
  }
  
  private generateInitFunction(): string {
    const modelName = this.sanitizeName(this.model.name)
    const inputInit = this.getInputPortNames().map(name => 
      `model->inputs.${name} = 0.0;`
    ).join('\n    ')
    
    return `
EMSCRIPTEN_KEEPALIVE
void* ${modelName}_model_init(double dt) {
    ${modelName}_model_t* model = (${modelName}_model_t*)malloc(sizeof(${modelName}_model_t));
    if (!model) return NULL;
    
    model->time = 0.0;
    model->dt = dt;
    
    ${modelName}_init_states(&model->states);
    
    ${this.generateScopeBufferAllocation()}
    
    ${inputInit}
    
    return model;
}
`
  }
  
  private generateSetInputFunctions(): string {
    const modelName = this.sanitizeName(this.model.name)
    const inputPorts = this.getInputPorts()
    
    const switchCases = inputPorts.map((port, index) => 
      `case ${index}: model->inputs.${port.name} = value; break;`
    ).join('\n        ')
    
    return `
EMSCRIPTEN_KEEPALIVE
void ${modelName}_model_set_input(void* handle, int index, double value) {
    ${modelName}_model_t* model = (${modelName}_model_t*)handle;
    if (!model) return;
    
    switch(index) {
        ${switchCases}
        default: break;
    }
}

EMSCRIPTEN_KEEPALIVE
void ${modelName}_model_set_inputs(void* handle, const double* inputs, int count) {
    ${modelName}_model_t* model = (${modelName}_model_t*)handle;
    if (!model || !inputs) return;
    
    ${inputPorts.map((port, i) => 
      `if (count > ${i}) model->inputs.${port.name} = inputs[${i}];`
    ).join('\n    ')}
}
`
  }
  
  // ... similar methods for outputs, scope data, etc.
}
```

## Index Map Generation

Generate JavaScript index maps for efficient lookup:

```typescript
// vehicle_model_maps.ts (auto-generated)

export const INPUT_INDEX_MAP = {
  'throttle': 0,
  'brake': 1,
  'steering_angle': 2,
} as const

export const OUTPUT_INDEX_MAP = {
  'vehicle_speed': 0,
  'engine_rpm': 1,
  'wheel_angle': 2,
} as const

export const LOGGER_INDEX_MAP = {
  'SpeedLogger': 0,
  'RPMLogger': 1,
} as const

export type InputName = keyof typeof INPUT_INDEX_MAP
export type OutputName = keyof typeof OUTPUT_INDEX_MAP
export type LoggerName = keyof typeof LOGGER_INDEX_MAP
```

## Optimization Strategies

### 1. Minimize Exported Functions
Only export what JavaScript needs:
- Model lifecycle (init, destroy)
- I/O (set_input, get_output)
- Simulation (step)
- Scope data access

Internal functions stay private → smaller binary.

### 2. Use Struct Packing
```c
// Efficient memory layout
typedef struct __attribute__((packed)) {
    double throttle;
    double brake;
    double steering_angle;
} vehicle_inputs_t;
```

### 3. Batch Operations
Prefer array operations over individual calls:
```c
// Good: One call
set_inputs(model, [0.5, 0.2, 0.1], 3)

// Bad: Three calls
set_input(model, 0, 0.5)
set_input(model, 1, 0.2)
set_input(model, 2, 0.1)
```

### 4. Reuse Temp Buffers
```c
// Allocate once during init
typedef struct {
    // ... other fields
    vehicle_states_t temp_states;  // Reused in RK4
    vehicle_signals_t temp_signals;
} vehicle_model_t;
```

## Testing Strategy

### Unit Tests for Code Generation
```typescript
describe('WasmCodeGenerator', () => {
  it('should generate valid init function', () => {
    const model = createTestModel()
    const generator = new WasmCodeGenerator(model)
    const code = generator.generateWasmInterface()
    
    expect(code).toContain('EMSCRIPTEN_KEEPALIVE')
    expect(code).toContain('model_init')
    expect(code).toMatch(/void\* \w+_model_init\(double dt\)/)
  })
})
```

### Compilation Tests
```typescript
describe('Wasm Compilation', () => {
  it('should compile without errors', async () => {
    const model = createTestModel()
    const { sourceCode, headerCode, wasmInterface } = generateCCode(model)
    
    // Write to temp directory
    const tempDir = await createTempDir()
    await writeFile(`${tempDir}/model.h`, headerCode)
    await writeFile(`${tempDir}/model.c`, sourceCode)
    await writeFile(`${tempDir}/wasm.c`, wasmInterface)
    
    // Compile
    const result = await exec(`emcc ${tempDir}/model.c ${tempDir}/wasm.c -o ${tempDir}/model.js ...`)
    
    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
  })
})
```

### Runtime Tests
```typescript
describe('Wasm Runtime', () => {
  it('should execute simulation correctly', async () => {
    const wasmModule = await loadCompiledWasm('test_model')
    const handle = wasmModule._model_init(0.01)
    
    wasmModule._model_set_input(handle, 0, 5.0)  // throttle
    wasmModule._model_step(handle)
    
    const speed = wasmModule._model_get_output(handle, 0)
    
    expect(speed).toBeGreaterThan(0)
    expect(speed).toBeLessThan(100)
    
    wasmModule._model_destroy(handle)
  })
})
```

## Conclusion

This dual-target approach provides:

✅ **Single C codebase** for both Wasm and embedded
✅ **Clean separation** between core logic and interface
✅ **Easy testing** - core logic testable independently
✅ **Optimal performance** - no unnecessary abstractions
✅ **Type safety** - auto-generated TypeScript types

The key insight is that **95% of the code is shared**, only the thin interface layer differs between targets.

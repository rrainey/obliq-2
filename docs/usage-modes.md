# Code Generation Usage Modes

## Overview

The obliq-2 code generation system supports two distinct deployment scenarios:
1. **Embedded/Standalone C Code** - For embedded systems and external simulations
2. **Browser WASM** - For in-browser simulation with optional Web Worker multi-threading

Both modes share identical core C code generation, ensuring consistent numerical results across platforms.

## Mode 1: Embedded/Standalone C Code

### Use Case
Deploy generated C code to embedded systems, real-time systems, or standalone simulations outside the browser.

### Generated Files

When you use the "Generate Code" button, you receive:
- **`{model}.h`** - Header file with type definitions and function prototypes
- **`{model}.c`** - Implementation file with complete simulation logic

### Dependencies

**Only standard C libraries** - no external frameworks required:
- `stdint.h` - Integer types
- `stdbool.h` - Boolean type
- `stdlib.h` - Memory allocation
- `string.h` - Memory operations
- `math.h` - Mathematical functions

### Compilation Examples

**Desktop/Server (GCC)**:
```bash
gcc -std=c99 -O2 -lm -o simulation my_model.c main.c
```

**ARM Cortex-M (Embedded)**:
```bash
arm-none-eabi-gcc -std=c99 -O2 \
  -mcpu=cortex-m4 \
  -mthumb \
  -mfloat-abi=hard \
  -mfpu=fpv4-sp-d16 \
  -o firmware.elf \
  my_model.c main.c \
  startup.c system.c
```

**ESP32 (IoT)**:
```bash
xtensa-esp32-elf-gcc -std=c99 -O2 \
  -mlongcalls \
  -o app.elf \
  my_model.c main.c
```

**RISC-V**:
```bash
riscv64-unknown-elf-gcc -std=c99 -O2 \
  -march=rv32imc \
  -mabi=ilp32 \
  -o firmware.elf \
  my_model.c main.c
```

### Integration Example

```c
#include "my_model.h"
#include <stdio.h>

int main() {
    // Declare and initialize model
    my_model_t model;
    my_model_init(&model, 0.01);  // 10ms timestep

    // Simulation loop
    for (int step = 0; step < 1000; step++) {
        // Set inputs (e.g., from sensors)
        model.inputs.setpoint = 1.0;
        model.inputs.feedback = read_sensor();

        // Execute one simulation step
        my_model_step(&model);

        // Read outputs (e.g., send to actuators)
        write_actuator(model.outputs.control);

        // Optional: Log data
        if (step % 100 == 0) {
            printf("t=%.3f, output=%.3f\n",
                   model.time,
                   model.outputs.control);
        }

        // Wait for next timestep (e.g., 10ms)
        delay_ms(10);
    }

    return 0;
}
```

### Key Features

- ✅ **No runtime dependencies**: Runs on bare metal
- ✅ **Deterministic execution**: Fixed memory allocation, predictable timing
- ✅ **Thread-safe**: Reentrant code with no global state (pass model as parameter)
- ✅ **Platform-independent**: Runs on x86, ARM, RISC-V, MIPS, etc.
- ✅ **Small footprint**: Minimal code size, suitable for constrained devices
- ✅ **Real-time capable**: Suitable for hard real-time systems

### Memory Considerations

All memory is allocated in the model struct - no dynamic allocation during execution:
```c
typedef struct {
    double time;           // Current simulation time
    double dt;            // Time step
    inputs_t inputs;      // Input values
    outputs_t outputs;    // Output values
    signals_t signals;    // Intermediate signals
    states_t states;      // State variables (for dynamic blocks)
    enable_states_t enable_states;  // Subsystem enable flags
} my_model_t;
```

Stack usage is minimal - typically a few hundred bytes for temporary variables in computation functions.

## Mode 2: Browser WASM Compilation

### Use Case
Run high-performance simulations in web browsers with optional Web Worker multi-threading for responsive UI.

### Generated Files

For WASM compilation, the system generates three files:
- **`{model}.h`** - Header file (identical to Mode 1)
- **`{model}.c`** - Implementation file (identical to Mode 1)
- **`{model}_wasm.c`** - **WASM wrapper** with Emscripten-specific exports

### The WASM Wrapper

The `{model}_wasm.c` file provides:
- Emscripten `EMSCRIPTEN_KEEPALIVE` macros for JavaScript interop
- Simplified API for browser consumption
- Data collection for signal displays and loggers
- Global model instance management

**Important**: This file is **only used for browser compilation**. It is not needed for embedded deployment and contains no code that affects the core simulation logic.

### Emscripten Compilation

**Basic WASM compilation**:
```bash
emcc -O2 \
  -s WASM=1 \
  -s EXPORTED_FUNCTIONS='["_wasm_init", "_wasm_step", "_wasm_get_time"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall", "cwrap"]' \
  -lm \
  -o model.js \
  my_model.c my_model_wasm.c
```

**With SIMD optimization** (faster vector/matrix operations):
```bash
emcc -O3 \
  -msimd128 \
  -s WASM=1 \
  -lm \
  -o model.js \
  my_model.c my_model_wasm.c
```

**With debugging symbols**:
```bash
emcc -O0 -g \
  -s WASM=1 \
  -s ASSERTIONS=1 \
  -lm \
  -o model.js \
  my_model.c my_model_wasm.c
```

### Browser Integration (Main Thread)

```typescript
// Load compiled WASM module
const wasmModule = await createModule({
  wasmBinary: wasmArrayBuffer,
  print: console.log,
  printErr: console.error
})

// Initialize simulation
wasmModule._wasm_init(0.01)  // 10ms timestep

// Run simulation loop
const numSteps = 1000
for (let i = 0; i < numSteps; i++) {
  wasmModule._wasm_step(0.01)
}

// Retrieve sample data from loggers/displays
const sampleData = retrieveSampleData(wasmModule)
console.log('Simulation complete:', sampleData)
```

### Web Worker Multi-Threading (Phase 7 Feature)

For long-running simulations that would block the UI, use Web Worker execution:

```typescript
import {
  createWorkerSimulation,
  isWorkerSimulationAvailable
} from '@/lib/simulation/SimulationEngineFactory'

// Check if Web Workers are available
if (!isWorkerSimulationAvailable()) {
  console.warn('Web Workers not available, falling back to main thread')
  // Use main thread execution...
  return
}

// Create worker manager
const worker = createWorkerSimulation()
if (!worker) {
  throw new Error('Failed to create worker')
}

try {
  // Initialize worker with compiled WASM
  await worker.initialize(
    wasmDataBase64,  // Base64-encoded .wasm file
    jsDataBase64,    // Base64-encoded .js glue code
    metadata         // Input/output mappings
  )

  // Run simulation with progress callbacks
  const result = await worker.run(
    {
      timeStep: 0.01,
      duration: 10.0,
      progressInterval: 50  // Update every 50ms
    },
    (progress) => {
      // Update UI with progress
      console.log(`Progress: ${progress.progress.toFixed(1)}%`)
      console.log(`Step: ${progress.step}/${progress.totalSteps}`)
      console.log(`Time: ${progress.time.toFixed(3)}s`)
      updateProgressBar(progress.progress)
    }
  )

  if (result.wasStopped) {
    console.log('Simulation was cancelled by user')
  } else {
    console.log(`Simulation completed at t=${result.finalTime}`)
  }

  // Retrieve all sample data
  const sampleData = await worker.getResults()
  displayResults(sampleData)

} catch (error) {
  console.error('Worker simulation failed:', error)
  // Optionally fall back to main thread
} finally {
  // Clean up worker
  worker.terminate()
}
```

### Web Worker Architecture

```
┌────────────────────────────────────────────────┐
│           Main Thread (UI)                     │
│  ┌──────────────────────────────────────────┐ │
│  │  React Components                        │ │
│  │  - SimulationSettingsPanel               │ │
│  │  - Progress Bar (updates every 50ms)     │ │
│  │  - Stop Button                           │ │
│  │  - Results Visualization                 │ │
│  └──────────────────────────────────────────┘ │
└────────────┬───────────────────────────────────┘
             │ postMessage({ type: 'run', payload: {...} })
             ▼
┌────────────────────────────────────────────────┐
│           Web Worker Thread                    │
│  ┌──────────────────────────────────────────┐ │
│  │  WASM Module Instance                    │ │
│  │  - _wasm_init(dt)                        │ │
│  │  - _wasm_step(dt)  [1000s of iterations]│ │
│  │  - _wasm_get_samples()                   │ │
│  └──────────────────────────────────────────┘ │
│             ▲                                  │
│             │ Every 50ms: postMessage({        │
│             │   type: 'progress',              │
│             │   progress: 45.2%                │
│             │ })                               │
└─────────────────────────────────────────────────┘
```

### Webpack Configuration (Next.js)

To enable Web Workers in Next.js, configure webpack:

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Enable Web Workers with webpack 5
      config.output.webassemblyModuleFilename = 'static/wasm/[modulehash].wasm'

      // Enable experimental features
      config.experiments = {
        ...config.experiments,
        asyncWebAssembly: true,
        layers: true,
        topLevelAwait: true
      }

      // Set global object for worker context
      config.output.globalObject = 'self'
    }
    return config
  }
}

module.exports = nextConfig
```

### User Preference (localStorage)

The Web Worker feature is opt-in. User preference is stored:

```typescript
// Enable Web Workers
localStorage.setItem('obliq-use-workers', 'true')

// Disable Web Workers (default)
localStorage.setItem('obliq-use-workers', 'false')
```

Users can toggle this in the **Simulation Settings Panel** via a checkbox.

## Comparison: Mode 1 vs Mode 2

| Aspect | Mode 1: Embedded/Standalone | Mode 2: Browser WASM |
|--------|---------------------------|---------------------|
| **Files needed** | `.h` + `.c` | `.h` + `.c` + `_wasm.c` |
| **Dependencies** | Standard C only | Emscripten required |
| **Compilation** | Any C99 compiler | Emscripten (`emcc`) |
| **Target platform** | Embedded, desktop, server | Web browser |
| **Threading** | Native OS threads | Web Workers |
| **Memory model** | Direct memory access | WASM linear memory |
| **Performance** | Native speed | ~95-98% of native |
| **Binary size** | ~10-50 KB | ~100-500 KB (with JS glue) |
| **Startup time** | Instant | ~10-100ms (module loading) |
| **Debugging** | GDB, JTAG | Browser DevTools, source maps |
| **Distribution** | Binary executable | WASM + JS bundle |

## Which Mode Should You Use?

### Choose Mode 1 (Embedded/Standalone) if:
- ✅ Deploying to microcontrollers or embedded systems
- ✅ Building desktop or server applications
- ✅ Need hard real-time guarantees
- ✅ Want minimal dependencies and small binary size
- ✅ Target platform is not a web browser
- ✅ Need to integrate with existing C/C++ codebases

### Choose Mode 2 (Browser WASM) if:
- ✅ Running simulations in web applications
- ✅ Need interactive browser-based visualization
- ✅ Want cross-platform web deployment
- ✅ Users access via web browser
- ✅ Can benefit from Web Worker multi-threading
- ✅ Want rapid prototyping without compilation setup

## Important Guarantees

1. **Core C code is identical**: Both modes use the same `{model}.c` and `{model}.h` files
2. **Numerical results match**: Identical IEEE 754 floating-point behavior across modes
3. **WASM wrapper is isolated**: Only in `{model}_wasm.c`, doesn't affect core logic
4. **Zero cross-contamination**: Embedded code has **no** Emscripten dependencies
5. **Web Worker is browser-only**: Doesn't modify generated C code at all

## Frequently Asked Questions

### Q: Do I need to worry about Emscripten for embedded deployment?
**A**: No. The `.h` and `.c` files have zero Emscripten dependencies. You can completely ignore `{model}_wasm.c`.

### Q: Can I use the same generated code for both modes?
**A**: Yes! The core `.h` and `.c` files are identical. Just add `{model}_wasm.c` when compiling for WASM.

### Q: Will Web Workers work on all browsers?
**A**: Modern browsers (Chrome 87+, Firefox 89+, Safari 16.4+, Edge 91+) support Web Workers. The system automatically falls back to main thread execution if unavailable.

### Q: Does threading affect numerical results?
**A**: No. The simulation is inherently sequential. Web Workers only affect *where* the simulation runs (main thread vs worker thread), not *how* it computes results.

### Q: Can I use SIMD in embedded mode?
**A**: SIMD acceleration is Emscripten-specific (`-msimd128` flag). For embedded, use platform-specific SIMD intrinsics (ARM NEON, x86 SSE) if needed.

### Q: How do I handle fixed-point math for embedded?
**A**: The generated code uses `double` by default. You can modify the generated code to use fixed-point types, or configure the code generator to emit fixed-point operations directly (future feature).

## File Structure Summary

```
Generated Code/
├── my_model.h          # Header (BOTH modes)
├── my_model.c          # Implementation (BOTH modes)
└── my_model_wasm.c     # WASM wrapper (Mode 2 ONLY)

Embedded Deployment:
└── Use: my_model.h + my_model.c

Browser Deployment:
└── Use: my_model.h + my_model.c + my_model_wasm.c → compile with emcc
```

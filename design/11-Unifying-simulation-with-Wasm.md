# Unifying Simulation with WebAssembly

## Overview

This document describes the WebAssembly (WASM) simulation architecture that provides high-performance simulation execution by compiling simulation models to native code. The WASM approach offers significant performance improvements over the JavaScript simulation engine while maintaining identical numerical results.

## Architecture

### High-Level Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Model JSON    │────>│  C Code Gen     │────>│  Emscripten     │
│   (sheets,      │     │  (HeaderGen,    │     │  Compiler       │
│   blocks,       │     │  AlgebraicEval, │     │  (Docker)       │
│   connections)  │     │  StateIntegr)   │     │                 │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         v
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Browser       │<────│   WASM Module   │<────│  .wasm + .js    │
│   Simulation    │     │   Instance      │     │  (cached in     │
│   Results       │     │                 │     │   Supabase)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Components

#### 1. Code Generation Layer (`/lib/codegen/`)

The code generation layer transforms simulation models into C code:

- **`ModelFlattener.ts`** - Flattens multi-sheet hierarchical models into a single execution graph
- **`TypePropagator.ts`** - Propagates data types through connections (scalar, vector, matrix)
- **`HeaderGenerator.ts`** - Generates C header files with struct definitions
- **`AlgebraicEvaluator.ts`** - Generates code for computing block outputs
- **`StateIntegrator.ts`** - Generates RK4 integration code for stateful blocks
- **`InitFunctionGenerator.ts`** - Generates model initialization code
- **`CleanupGenerator.ts`** - Generates memory cleanup code for data collection

#### 2. Compilation Layer (`/app/api/compile-wasm-stream/`)

The compilation layer handles WASM compilation via SSE streaming:

```typescript
// Compilation flow
1. Receive model JSON
2. Generate C code (header + source)
3. Check Supabase cache for existing WASM
4. If cache miss: compile via Docker/Emscripten
5. Store compiled WASM in Supabase
6. Stream progress to client via SSE
7. Return WASM binary and JS glue code
```

#### 3. Caching Layer (`/lib/wasm/cache/`)

Intelligent caching reduces compilation time for unchanged models:

- **`cacheKey.ts`** - Generates deterministic cache keys from model structure
- **`SupabaseCacheManager.ts`** - Manages cache storage and retrieval
- **`streamingCache.ts`** - Handles SSE streaming for compilation progress

Cache key format: `{modelId}-{contentHash}-{optimizationLevel}[-debug]`

#### 4. Simulation Layer (`/lib/simulation/`)

The simulation layer manages WASM execution:

- **`WasmSimulationEngine.ts`** - Main engine for WASM-based simulation
- **`WasmResultConverter.ts`** - Converts WASM outputs to UI format
- **`WasmDataCollector.ts`** - Collects signal data during simulation

### Data Types

The WASM simulation supports all data types from the TypeScript simulation:

| Type | C Representation | Example |
|------|------------------|---------|
| Scalar double | `double` | `3.14` |
| Scalar int | `int` | `42` |
| Scalar bool | `bool` | `true` |
| Vector | `double[N]` | `double[3]` |
| Matrix | `double[M][N]` | `double[3][4]` |

Type propagation ensures transfer functions and other blocks correctly inherit types from their inputs.

### Generated C Code Structure

```c
// Header file (model_name.h)
typedef struct {
    double port_name;    // Input ports
} model_name_inputs_t;

typedef struct {
    double port_name;    // Output ports
} model_name_outputs_t;

typedef struct {
    double block_name;   // Internal signals
} model_name_signals_t;

typedef struct {
    double tf_name_states[N];  // Transfer function states
} model_name_states_t;

typedef struct {
    model_name_inputs_t inputs;
    model_name_outputs_t outputs;
    model_name_signals_t signals;
    model_name_states_t states;
    enable_states_t enable_states;
    // Data collection buffers (for loggers/displays)
    double* logger_name_times;
    double* logger_name_values;
    int logger_name_count;
    int logger_name_capacity;
    double time;
    double dt;
    int use_rk4;
} model_name_t;

// Function prototypes
void model_name_init(model_name_t* model, double dt);
void model_name_evaluate_algebraic(model_name_t* model);
void model_name_step(model_name_t* model);
void model_name_derivatives(...);  // For RK4 integration
void model_name_cleanup(model_name_t* model);  // Free data collection buffers
```

### Integration Methods

The WASM simulation supports two integration methods:

#### Euler Integration (Simple)
```c
state_new = state + dt * derivative
```

#### RK4 Integration (Default)
```c
k1 = f(t, y)
k2 = f(t + dt/2, y + dt/2 * k1)
k3 = f(t + dt/2, y + dt/2 * k2)
k4 = f(t + dt, y + dt * k3)
state_new = state + dt/6 * (k1 + 2*k2 + 2*k3 + k4)
```

The `use_rk4` flag in the model struct controls which method is used.

## Compilation Pipeline

### Docker-Based Compilation

Compilation uses a Docker container with Emscripten:

```dockerfile
FROM emscripten/emsdk:3.1.51
# Pre-configured with:
# - Emscripten compiler
# - WASM optimization tools
# - Standard C library
```

### Emscripten Flags

```bash
emcc -O2 \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORTED_RUNTIME_METHODS=['cwrap','ccall','getValue','setValue'] \
  -s EXPORTED_FUNCTIONS=['_malloc','_free','_model_init',...] \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s ENVIRONMENT='web' \
  model.c -o model.js
```

### Cache Management

The caching system uses Supabase Storage:

```
wasm-cache/
  └── {cache_key}/
      ├── module.wasm    # Compiled WebAssembly
      └── module.js      # JavaScript glue code
```

Cache versioning (`CODEGEN_VERSION` in `cacheKey.ts`) ensures recompilation when code generation changes.

## Block Module System

Each block type has a dedicated module implementing `IBlockModule`:

```typescript
interface IBlockModule {
  // Code generation
  generateComputation(block: BlockData, inputs: string[], inputTypes: string[]): string
  getOutputType(block: BlockData, inputTypes: string[]): string
  generateStructMember(block: BlockData, outputType: string): string | null
  requiresState(block: BlockData): boolean
  generateStateStructMembers(block: BlockData, outputType: string): string[]
  generateInitialization?(block: BlockData): string

  // Data collection (for loggers/displays)
  employsDataCollection?(block: BlockData): boolean
  generateDataCollectionStructMembers?(block: BlockData, inputType: string): string[]
  generateDataCollectionInit?(block: BlockData, inputType: string): string
  generateSampleStorage?(block: BlockData, inputExpr: string, inputType: string): string
  generateDataCollectionCleanup?(block: BlockData): string

  // Port management
  getInputPortCount(block: BlockData): number
  getOutputPortCount(block: BlockData): number
  isDirectFeedthrough?(block: BlockData): boolean
}
```

### Supported Block Types

| Block Type | Has State | Data Collection | Vector/Matrix |
|------------|-----------|-----------------|---------------|
| source | No | No | Yes |
| scale | No | No | Yes |
| sum | No | No | Yes |
| multiply | No | No | Yes |
| transfer_function | Yes | No | Yes |
| signal_display | No | Yes | Yes |
| signal_logger | No | Yes | Yes |
| input_port | No | No | Yes |
| output_port | No | No | Yes |
| lookup_1d | No | No | Scalar only |
| lookup_2d | No | No | Scalar only |
| mux | No | No | Yes |
| demux | No | No | Yes |

## Data Collection

Signal Display and Signal Logger blocks collect samples during simulation:

### Memory Management

```c
// Initialization
model->logger_times = (double*)malloc(capacity * sizeof(double));
model->logger_values = (double*)malloc(capacity * element_size);
model->logger_count = 0;
model->logger_capacity = capacity;

// Sample storage (in evaluate_algebraic)
if (model->logger_count < model->logger_capacity) {
    model->logger_times[model->logger_count] = model->time;
    memcpy(&model->logger_values[model->logger_count * element_count],
           &input_signal, element_size);
    model->logger_count++;
}

// Cleanup
free(model->logger_times);
free(model->logger_values);
```

### Retrieval API

```javascript
// Get collected data from WASM
const count = Module._wasm_get_logger_count();
const times = new Float64Array(Module.HEAPF64.buffer, timesPtr, count);
const values = new Float64Array(Module.HEAPF64.buffer, valuesPtr, count * elementCount);
```

## Performance Characteristics

### Compilation Time

| Model Size | First Compile | Cached Load |
|------------|--------------|-------------|
| Simple (5 blocks) | ~3-5 seconds | <100ms |
| Medium (20 blocks) | ~5-8 seconds | <100ms |
| Complex (50+ blocks) | ~10-15 seconds | <100ms |

### Simulation Speed

Benchmarks comparing TypeScript vs WASM (steps per second):

| Scenario | TypeScript | WASM | Speedup |
|----------|------------|------|---------|
| Minimal model | ~145K | ~2M+ | ~14x |
| 10-block chain | ~60K | ~500K | ~8x |
| 50-block chain | ~29K | ~200K | ~7x |
| Transfer functions | ~17K | ~150K | ~9x |

## Error Handling

### Compilation Errors

Compilation errors are streamed to the client with details:

```typescript
{
  type: 'error',
  message: 'Compilation failed',
  details: 'model.c:42: error: undeclared identifier "foo"'
}
```

### Runtime Errors

WASM runtime errors are caught and reported:

- Memory allocation failures
- Stack overflow
- Invalid memory access
- Numerical errors (NaN, Infinity)

## Testing Strategy

### Unit Tests

- Block module tests (`__tests__/codegen/`)
- Type propagation tests
- Cache key generation tests

### Integration Tests

- Cross-validation with TypeScript simulation
- Multi-sheet model tests
- Vector/matrix operation tests

### Performance Tests

- Steps per second benchmarks
- Memory usage monitoring
- Long-duration stability tests

## Advanced Features (Phase 7)

### SIMD Optimization (Implemented)

The compilation API supports SIMD optimization via the `-msimd128` Emscripten flag:

```typescript
// Request body with SIMD enabled
{
  modelId: 'uuid',
  optimizationLevel: 'O2',
  enableSimd: true
}
```

When SIMD is enabled:
- The `-msimd128` flag is added to the emcc command
- Cache keys include `-simd` suffix for separate caching
- Matrix and vector operations can benefit from SIMD instructions

**Browser Support**: SIMD is supported in:
- Chrome 91+
- Firefox 89+
- Safari 16.4+
- Edge 91+

### Planned Features

1. **Threading** - Web Workers for parallel block execution
2. **Streaming Compilation** - Progressive module loading
3. **Adaptive Optimization** - Auto-select O0 vs O3 based on model complexity

### Potential Improvements

- Ahead-of-time compilation for known models
- Incremental compilation for model changes
- GPU acceleration for matrix operations

## Files Reference

### Core Files

| File | Purpose |
|------|---------|
| `lib/codegen/ModelFlattener.ts` | Flatten multi-sheet models |
| `lib/codegen/TypePropagator.ts` | Type inference and propagation |
| `lib/codegen/HeaderGenerator.ts` | C header generation |
| `lib/codegen/AlgebraicEvaluator.ts` | Block computation code |
| `lib/codegen/StateIntegrator.ts` | RK4 integration code |
| `lib/codegen/InitFunctionGenerator.ts` | Initialization code |
| `lib/wasm/cache/cacheKey.ts` | Cache key generation |
| `lib/wasm/cache/SupabaseCacheManager.ts` | Cache storage |
| `lib/simulation/WasmSimulationEngine.ts` | WASM execution |

### API Routes

| Route | Purpose |
|-------|---------|
| `/api/compile-wasm-stream` | SSE compilation endpoint |
| `/api/compile-wasm` | Direct compilation endpoint |
| `/api/cache-maintenance` | Cache management |

### Test Files

| File | Purpose |
|------|---------|
| `__tests__/wasm/validation/CrossValidation.test.ts` | TypeScript baseline tests |
| `__tests__/wasm/validation/PerformanceBenchmark.test.ts` | Performance metrics |
| `__tests__/wasm/validation/BrowserCompatibility.test.ts` | WASM feature detection |
| `__tests__/wasm/cache/cacheKey.test.ts` | Cache key tests |

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v28 | Dec 2, 2025 | Added SIMD optimization support (-msimd128), full MatrixMultiplyBlockModule implementation |
| v27 | Nov 30, 2025 | Fixed RK4 evaluate_algebraic calls, vector support |
| v26 | Nov 30, 2025 | Added use_rk4 field |
| v25 | Nov 30, 2025 | Fixed getBlockModule typo |
| v24 | Nov 29, 2025 | RK4 state integration fixes |
| v17-v23 | Nov 24-29, 2025 | Vector/matrix support iterations |
| v17 | Nov 24, 2025 | Initial Phase 3 optimizations |

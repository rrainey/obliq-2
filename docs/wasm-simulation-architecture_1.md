# WebAssembly Simulation Architecture

## Overview

Replace the current JavaScript simulation engine with WebAssembly-compiled C code to ensure perfect fidelity between interactive simulation and embedded deployment while maintaining fast iteration cycles.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Client)                          │
│                                                                   │
│  ┌────────────────────┐         ┌──────────────────────────┐   │
│  │   React UI         │         │   Wasm Module Manager     │   │
│  │  - Canvas          │────────▶│   - Compile on demand     │   │
│  │  - Controls        │         │   - Cache compiled Wasm   │   │
│  │  - Charts          │◀────────│   - Manage memory         │   │
│  └────────────────────┘         └──────────┬───────────────┘   │
│                                             │                     │
│                                             ▼                     │
│                                  ┌────────────────────┐          │
│                                  │  Wasm Module       │          │
│                                  │  - model_init()    │          │
│                                  │  - model_step()    │          │
│                                  │  - get_outputs()   │          │
│                                  │  - get_scope_data()│          │
│                                  └────────────────────┘          │
└───────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────┐
│                    Next.js Backend (Server)                    │
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐    │
│  │   Wasm Compilation Service                            │    │
│  │   /api/compile-wasm                                   │    │
│  │   - Receives model JSON                               │    │
│  │   - Generates C code (existing codegen)               │    │
│  │   - Compiles to Wasm with Emscripten                  │    │
│  │   - Returns .wasm binary + JS glue                    │    │
│  │   - Caches compiled modules                           │    │
│  └──────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Wasm Compilation Service (Server-Side)

**Location:** `app/api/compile-wasm/route.ts`

**Purpose:** Convert model JSON to executable Wasm module

**Flow:**
```typescript
POST /api/compile-wasm
{
  "modelId": "uuid",
  "modelJson": {...},  // Optional, for preview mode
  "optimizationLevel": "O2"  // O0, O1, O2, O3
}

Response:
{
  "wasmUrl": "/wasm-cache/model-{id}-{hash}.wasm",
  "jsGlueUrl": "/wasm-cache/model-{id}-{hash}.js",
  "compilationTime": 850,  // milliseconds
  "cacheHit": false
}
```

**Implementation:**
```typescript
// app/api/compile-wasm/route.ts
import { exec } from 'child_process'
import { promisify } from 'util'
import { generateCCode } from '@/lib/codeGeneration'
import { hashModel } from '@/lib/utils/modelHash'

const execAsync = promisify(exec)

export async function POST(request: Request) {
  const { modelId, modelJson, optimizationLevel = 'O2' } = await request.json()
  
  // 1. Generate hash for caching
  const modelHash = hashModel(modelJson)
  const cacheKey = `${modelId}-${modelHash}`
  
  // 2. Check cache
  const cachedWasm = await checkWasmCache(cacheKey)
  if (cachedWasm) {
    return Response.json({
      wasmUrl: cachedWasm.wasmUrl,
      jsGlueUrl: cachedWasm.jsGlueUrl,
      cacheHit: true
    })
  }
  
  // 3. Generate C code
  const { sourceCode, headerCode } = generateCCode(modelJson)
  
  // 4. Write to temp directory
  const tempDir = `/tmp/wasm-build-${cacheKey}`
  await fs.mkdir(tempDir, { recursive: true })
  await fs.writeFile(`${tempDir}/model.c`, sourceCode)
  await fs.writeFile(`${tempDir}/model.h`, headerCode)
  
  // 5. Compile with Emscripten
  const emccCommand = `
    emcc ${tempDir}/model.c \
      -o ${tempDir}/model.js \
      -s WASM=1 \
      -s EXPORTED_FUNCTIONS='["_model_init","_model_step","_model_set_input","_model_get_output","_model_get_scope_data","_malloc","_free"]' \
      -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","getValue","setValue"]' \
      -s ALLOW_MEMORY_GROWTH=1 \
      -s MODULARIZE=1 \
      -s EXPORT_NAME='createModelModule' \
      -${optimizationLevel} \
      -lm
  `
  
  const startTime = Date.now()
  await execAsync(emccCommand)
  const compilationTime = Date.now() - startTime
  
  // 6. Move to public cache directory
  const publicDir = `public/wasm-cache`
  await fs.mkdir(publicDir, { recursive: true })
  await fs.rename(`${tempDir}/model.wasm`, `${publicDir}/${cacheKey}.wasm`)
  await fs.rename(`${tempDir}/model.js`, `${publicDir}/${cacheKey}.js`)
  
  // 7. Cache metadata
  await cacheWasmMetadata(cacheKey, {
    modelId,
    modelHash,
    compilationTime,
    timestamp: Date.now()
  })
  
  return Response.json({
    wasmUrl: `/wasm-cache/${cacheKey}.wasm`,
    jsGlueUrl: `/wasm-cache/${cacheKey}.js`,
    compilationTime,
    cacheHit: false
  })
}
```

### 2. C Code Generation Updates

**Location:** `lib/codegen/WasmCodeGenerator.ts`

**Purpose:** Generate C code optimized for Wasm compilation

**Key Differences from Embedded Code:**
- Export JavaScript-callable interface functions
- Use emscripten-friendly memory management
- Add scope data access functions
- Simplified I/O (no hardware dependencies)

**Additional Generated Functions:**
```c
// model_wasm_interface.c

// Initialize model with parameters
EMSCRIPTEN_KEEPALIVE
void* model_init(double dt) {
    model_t* model = (model_t*)malloc(sizeof(model_t));
    model->dt = dt;
    model->time = 0.0;
    
    // Initialize states
    memset(&model->states, 0, sizeof(model->states));
    
    // Initialize signals
    memset(&model->signals, 0, sizeof(model->signals));
    
    return model;
}

// Set a specific input by index
EMSCRIPTEN_KEEPALIVE
void model_set_input(void* handle, int input_index, double value) {
    model_t* model = (model_t*)handle;
    
    switch(input_index) {
        case 0: model->inputs.throttle = value; break;
        case 1: model->inputs.brake = value; break;
        // Auto-generated from model input ports
    }
}

// Get a specific output by index
EMSCRIPTEN_KEEPALIVE
double model_get_output(void* handle, int output_index) {
    model_t* model = (model_t*)handle;
    
    switch(output_index) {
        case 0: return model->outputs.vehicle_speed;
        case 1: return model->outputs.engine_rpm;
        // Auto-generated from model output ports
        default: return 0.0;
    }
}

// Get scope data for a specific signal logger
EMSCRIPTEN_KEEPALIVE
double* model_get_scope_data(void* handle, int logger_index, int* length) {
    model_t* model = (model_t*)handle;
    
    // Return pointer to logger buffer
    switch(logger_index) {
        case 0:
            *length = model->logger0_count;
            return model->logger0_buffer;
        // Auto-generated from Signal Logger blocks
        default:
            *length = 0;
            return NULL;
    }
}

// Step simulation
EMSCRIPTEN_KEEPALIVE
void model_step(void* handle) {
    model_t* model = (model_t*)handle;
    
    // Call existing step function
    model_evaluate_algebraic(&model->inputs, &model->states, 
                           &model->signals, &model->outputs,
                           &model->enable_states);
    integrate_states(model);
    model->time += model->dt;
    
    // Update signal loggers
    update_signal_loggers(model);
}

// Cleanup
EMSCRIPTEN_KEEPALIVE
void model_destroy(void* handle) {
    free(handle);
}
```

### 3. Client-Side Wasm Manager

**Location:** `lib/simulation/WasmSimulationEngine.ts`

**Purpose:** Load, manage, and interact with Wasm modules

**Implementation:**
```typescript
// lib/simulation/WasmSimulationEngine.ts

export class WasmSimulationEngine {
  private module: any
  private modelHandle: number
  private compilationPromise: Promise<void> | null = null
  
  constructor(
    private modelId: string,
    private modelJson: any,
    private config: SimulationConfig
  ) {}
  
  async initialize(): Promise<void> {
    // 1. Request compilation (with caching)
    const response = await fetch('/api/compile-wasm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: this.modelId,
        modelJson: this.modelJson,
        optimizationLevel: 'O2'
      })
    })
    
    const { wasmUrl, jsGlueUrl, compilationTime } = await response.json()
    
    console.log(`Wasm ${compilationTime < 100 ? 'cached' : 'compiled'} in ${compilationTime}ms`)
    
    // 2. Load the Wasm module
    const createModule = await import(jsGlueUrl)
    this.module = await createModule.default()
    
    // 3. Initialize model instance
    this.modelHandle = this.module._model_init(this.config.dt)
    
    // 4. Set initial inputs
    this.setInputs(this.config.initialInputs || {})
  }
  
  setInputs(inputs: Record<string, number>): void {
    const inputMap = this.getInputIndexMap()
    
    for (const [name, value] of Object.entries(inputs)) {
      const index = inputMap[name]
      if (index !== undefined) {
        this.module._model_set_input(this.modelHandle, index, value)
      }
    }
  }
  
  step(): SimulationStepResult {
    const startTime = performance.now()
    
    // Call Wasm step function
    this.module._model_step(this.modelHandle)
    
    // Get outputs
    const outputs = this.getOutputs()
    
    const stepTime = performance.now() - startTime
    
    return {
      time: this.getCurrentTime(),
      outputs,
      stepTime
    }
  }
  
  getOutputs(): Record<string, number> {
    const outputMap = this.getOutputIndexMap()
    const outputs: Record<string, number> = {}
    
    for (const [name, index] of Object.entries(outputMap)) {
      outputs[name] = this.module._model_get_output(this.modelHandle, index)
    }
    
    return outputs
  }
  
  getScopeData(loggerName: string): number[] {
    const loggerIndex = this.getLoggerIndex(loggerName)
    const lengthPtr = this.module._malloc(4)
    
    const dataPtr = this.module._model_get_scope_data(
      this.modelHandle,
      loggerIndex,
      lengthPtr
    )
    
    const length = this.module.getValue(lengthPtr, 'i32')
    this.module._free(lengthPtr)
    
    if (length === 0) return []
    
    // Copy data from Wasm memory to JavaScript array
    const data = new Float64Array(
      this.module.HEAPF64.buffer,
      dataPtr,
      length
    )
    
    return Array.from(data)
  }
  
  getCurrentTime(): number {
    // Access model->time directly from Wasm memory
    // (Would need to export a getter function)
    return this.module._model_get_time(this.modelHandle)
  }
  
  destroy(): void {
    if (this.modelHandle) {
      this.module._model_destroy(this.modelHandle)
      this.modelHandle = 0
    }
  }
  
  // Helper methods to map names to indices (generated from model)
  private getInputIndexMap(): Record<string, number> {
    // Generated from model input ports
    return {
      'throttle': 0,
      'brake': 1,
      // ...
    }
  }
  
  private getOutputIndexMap(): Record<string, number> {
    // Generated from model output ports
    return {
      'vehicle_speed': 0,
      'engine_rpm': 1,
      // ...
    }
  }
  
  private getLoggerIndex(name: string): number {
    const loggerMap: Record<string, number> = {
      'SpeedLogger': 0,
      'RPMLogger': 1,
      // ...
    }
    return loggerMap[name] ?? -1
  }
}
```

### 4. React Integration

**Location:** `components/SimulationControls.tsx` (updated)

**Purpose:** Use Wasm engine instead of JavaScript engine

**Implementation:**
```typescript
// components/SimulationControls.tsx

'use client'

import { useState, useEffect, useRef } from 'react'
import { WasmSimulationEngine } from '@/lib/simulation/WasmSimulationEngine'
import { Button } from '@/components/ui/button'

export function SimulationControls({ model }: { model: any }) {
  const [engine, setEngine] = useState<WasmSimulationEngine | null>(null)
  const [isCompiling, setIsCompiling] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [simulationData, setSimulationData] = useState<any>({})
  
  const animationFrameRef = useRef<number>()
  
  // Initialize engine when model changes
  useEffect(() => {
    initializeEngine()
    return () => {
      engine?.destroy()
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [model.id])
  
  async function initializeEngine() {
    setIsCompiling(true)
    try {
      const newEngine = new WasmSimulationEngine(
        model.id,
        model.data,
        {
          dt: 0.01,
          initialInputs: {}
        }
      )
      
      await newEngine.initialize()
      setEngine(newEngine)
    } catch (error) {
      console.error('Failed to initialize Wasm engine:', error)
      // Fallback to JavaScript engine if Wasm fails
    } finally {
      setIsCompiling(false)
    }
  }
  
  function runSimulation() {
    if (!engine || isRunning) return
    
    setIsRunning(true)
    
    const step = () => {
      const result = engine.step()
      
      setSimulationData(prev => ({
        ...prev,
        outputs: result.outputs,
        time: result.time
      }))
      
      // Continue if not at end time
      if (result.time < 10.0) {  // 10 second simulation
        animationFrameRef.current = requestAnimationFrame(step)
      } else {
        setIsRunning(false)
      }
    }
    
    step()
  }
  
  function stopSimulation() {
    setIsRunning(false)
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
  }
  
  function resetSimulation() {
    stopSimulation()
    initializeEngine()
    setSimulationData({})
  }
  
  return (
    <div className="flex gap-2">
      {isCompiling ? (
        <Button disabled>
          <Loader className="mr-2 h-4 w-4 animate-spin" />
          Compiling...
        </Button>
      ) : (
        <>
          <Button onClick={runSimulation} disabled={isRunning || !engine}>
            {isRunning ? 'Running...' : 'Run'}
          </Button>
          <Button onClick={stopSimulation} disabled={!isRunning}>
            Stop
          </Button>
          <Button onClick={resetSimulation} disabled={isRunning}>
            Reset
          </Button>
        </>
      )}
      
      {simulationData.time && (
        <div className="ml-4 flex items-center text-sm text-gray-600">
          Time: {simulationData.time.toFixed(3)}s
        </div>
      )}
    </div>
  )
}
```

## Performance Optimizations

### 1. Aggressive Caching

**Cache Key Strategy:**
```typescript
// lib/utils/modelHash.ts
export function hashModel(model: any): string {
  // Hash only the parts that affect compiled code
  const relevantData = {
    blocks: model.sheets.flatMap(s => s.blocks.map(b => ({
      type: b.type,
      parameters: b.parameters
    }))),
    connections: model.sheets.flatMap(s => s.connections)
  }
  
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(relevantData))
    .digest('hex')
    .substring(0, 16)
}
```

**Cache Locations:**
- **Browser:** IndexedDB for compiled Wasm modules (persistent across sessions)
- **Server:** Redis or file system for compiled .wasm files
- **CDN:** For frequently used models

**Cache Invalidation:**
- Only when model structure changes (not positions, names, etc.)
- Keep last 10 versions per model
- Clear on explicit user request

### 2. Incremental Compilation

For rapid iteration during model editing:

```typescript
// Only recompile changed subsystems
async function incrementalCompile(
  oldModel: Model,
  newModel: Model
): Promise<WasmModule> {
  const changedSubsystems = findChangedSubsystems(oldModel, newModel)
  
  if (changedSubsystems.length === 0) {
    // Use cached module
    return getCachedModule(oldModel)
  }
  
  if (changedSubsystems.length < 3 && oldModel.sheets.length > 5) {
    // Compile only changed subsystems and link
    return compileAndLink(newModel, changedSubsystems)
  } else {
    // Full recompilation
    return fullCompile(newModel)
  }
}
```

### 3. Parallel Compilation

For multi-sheet models:

```typescript
// Compile subsystems in parallel
async function parallelCompile(model: Model): Promise<WasmModule> {
  const subsystemPromises = model.sheets.map(sheet =>
    compileSubsystem(sheet)
  )
  
  const subsystemModules = await Promise.all(subsystemPromises)
  
  // Link all subsystems together
  return linkModules(subsystemModules)
}
```

### 4. Wasm Optimization Levels

**O0 (Development):**
- Fast compilation (~200ms for medium model)
- No optimization
- Easier debugging with source maps

**O2 (Production):**
- Slower compilation (~1-2s for medium model)
- 2-3x faster execution
- Smaller binary size

**Strategy:**
- Use O0 during active editing
- Upgrade to O2 when user clicks "Run Simulation"
- Cache both versions

## Server Setup

### Emscripten Installation

**Docker Approach (Recommended):**
```dockerfile
# Dockerfile.emscripten
FROM node:20-alpine

# Install Emscripten
RUN apk add --no-cache python3 cmake ninja git

WORKDIR /opt
RUN git clone https://github.com/emscripten-core/emsdk.git
WORKDIR /opt/emsdk
RUN ./emsdk install latest
RUN ./emsdk activate latest

ENV PATH="/opt/emsdk:/opt/emsdk/upstream/emscripten:${PATH}"

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

**Direct Installation:**
```bash
# On development machine
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

### Next.js Configuration

```typescript
// next.config.js
module.exports = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      }
    }
    
    // Allow loading .wasm files
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    }
    
    return config
  },
  
  // Serve wasm-cache directory
  async rewrites() {
    return [
      {
        source: '/wasm-cache/:path*',
        destination: '/api/wasm-cache/:path*',
      },
    ]
  },
}
```

## User Experience Improvements

### 1. Progressive Enhancement

```typescript
// Graceful fallback to JavaScript engine
async function getSimulationEngine(model: Model): Promise<SimulationEngine> {
  try {
    const wasmEngine = new WasmSimulationEngine(model)
    await wasmEngine.initialize()
    return wasmEngine
  } catch (error) {
    console.warn('Wasm compilation failed, using JavaScript engine:', error)
    return new JavaScriptSimulationEngine(model)
  }
}
```

### 2. Compilation Progress

```typescript
// Show progress during compilation
export async function POST(request: Request) {
  // Use Server-Sent Events for progress
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()
  
  // Start compilation in background
  compileWasm(modelJson, {
    onProgress: (stage, percent) => {
      writer.write(`data: ${JSON.stringify({ stage, percent })}\n\n`)
    }
  }).then(result => {
    writer.write(`data: ${JSON.stringify({ done: true, ...result })}\n\n`)
    writer.close()
  })
  
  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    }
  })
}
```

UI Display:
```
Compiling model to WebAssembly...
├─ Generating C code          [████████████████████] 100%
├─ Running Emscripten         [████████░░░░░░░░░░░░]  45%
└─ Optimizing binary          [░░░░░░░░░░░░░░░░░░░░]   0%
```

### 3. Pre-warming

```typescript
// Pre-compile on model open
useEffect(() => {
  // Start compilation immediately when editor loads
  // User won't notice if they're editing
  const precompilePromise = precompileModel(model.id, model.data)
  
  // Use it when they click "Run"
  return () => {
    precompilePromise.then(module => wasmCache.set(model.id, module))
  }
}, [model.id])
```

## Migration Path

### Phase 1: Parallel Implementation (Weeks 1-2)
- Implement Wasm compilation service
- Create WasmSimulationEngine alongside existing JavaScript engine
- Add feature flag to switch between engines
- No UI changes

### Phase 2: Opt-in Beta (Weeks 3-4)
- Add "Use WebAssembly Engine" checkbox in settings
- Show compilation status
- Collect performance metrics
- Fix issues

### Phase 3: Default with Fallback (Weeks 5-6)
- Make Wasm the default engine
- Keep JavaScript engine as fallback
- Show warning if Wasm unavailable
- Monitor error rates

### Phase 4: Wasm Only (Week 7+)
- Remove JavaScript simulation engine
- Simplify codebase
- Archive old simulation code

## Testing Strategy

### Unit Tests
```typescript
describe('WasmSimulationEngine', () => {
  it('should compile and run simple sum model', async () => {
    const model = createSumModel()
    const engine = new WasmSimulationEngine(model)
    await engine.initialize()
    
    engine.setInputs({ input1: 3, input2: 4 })
    const result = engine.step()
    
    expect(result.outputs.sum).toBe(7)
  })
  
  it('should handle transfer function with RK4', async () => {
    const model = createTransferFunctionModel()
    const engine = new WasmSimulationEngine(model)
    await engine.initialize()
    
    // Run 100 steps
    for (let i = 0; i < 100; i++) {
      engine.step()
    }
    
    const scopeData = engine.getScopeData('output')
    expect(scopeData).toHaveLength(100)
  })
})
```

### Integration Tests
```typescript
describe('Wasm vs JavaScript Comparison', () => {
  it('should produce identical results', async () => {
    const model = createComplexModel()
    
    const jsEngine = new JavaScriptSimulationEngine(model)
    const wasmEngine = new WasmSimulationEngine(model)
    await wasmEngine.initialize()
    
    // Run both for 1000 steps
    const jsResults = []
    const wasmResults = []
    
    for (let i = 0; i < 1000; i++) {
      jsResults.push(jsEngine.step())
      wasmResults.push(wasmEngine.step())
    }
    
    // Compare outputs (allow small floating point differences)
    for (let i = 0; i < 1000; i++) {
      expect(wasmResults[i].outputs).toBeCloseTo(jsResults[i].outputs, 10)
    }
  })
})
```

### Performance Benchmarks
```typescript
describe('Performance', () => {
  it('should benchmark compilation time', async () => {
    const model = createLargeModel(100) // 100 blocks
    
    const start = performance.now()
    const engine = new WasmSimulationEngine(model)
    await engine.initialize()
    const compilationTime = performance.now() - start
    
    expect(compilationTime).toBeLessThan(2000) // < 2 seconds
  })
  
  it('should benchmark simulation speed', async () => {
    const model = createLargeModel(100)
    const engine = new WasmSimulationEngine(model)
    await engine.initialize()
    
    const start = performance.now()
    for (let i = 0; i < 10000; i++) {
      engine.step()
    }
    const totalTime = performance.now() - start
    const stepsPerSecond = 10000 / (totalTime / 1000)
    
    expect(stepsPerSecond).toBeGreaterThan(50000) // > 50k steps/sec
  })
})
```

## Error Handling

### Compilation Errors
```typescript
try {
  await engine.initialize()
} catch (error) {
  if (error instanceof WasmCompilationError) {
    // Show user-friendly error with line numbers
    showError({
      title: 'Model Compilation Failed',
      message: error.message,
      details: error.diagnostics,
      suggestion: 'Check your transfer function parameters'
    })
  }
}
```

### Runtime Errors
```typescript
// Catch Wasm runtime exceptions
try {
  engine.step()
} catch (error) {
  if (error instanceof WasmRuntimeError) {
    // Numerical instability, division by zero, etc.
    showError({
      title: 'Simulation Error',
      message: 'Numerical instability detected',
      suggestion: 'Try reducing the time step or checking your model for divide-by-zero conditions'
    })
    
    // Reset simulation
    engine.destroy()
    await engine.initialize()
  }
}
```

## Security Considerations

### Wasm Sandbox
- Wasm runs in browser sandbox (no file system access)
- Cannot make network requests
- Memory isolated from main JavaScript heap
- Safe to run untrusted models

### Server-Side Compilation
- Limit compilation time (kill after 30 seconds)
- Limit model size (max 10,000 blocks)
- Rate limit compilation requests (10 per minute per user)
- Validate C code doesn't contain system calls

### Cache Security
- Use cryptographic hashes for cache keys
- Validate Wasm modules before caching
- Set cache expiration (30 days)
- Implement cache size limits per user

## Monitoring and Analytics

### Metrics to Track
```typescript
// Log compilation metrics
await logMetric('wasm_compilation', {
  modelId,
  blockCount: model.blocks.length,
  compilationTime,
  cacheHit: Boolean,
  optimizationLevel: string,
  wasmSize: number,
  timestamp: Date.now()
})

// Log simulation performance
await logMetric('wasm_simulation_performance', {
  modelId,
  stepsPerSecond: number,
  averageStepTime: number,
  peakMemoryUsage: number,
  timestamp: Date.now()
})
```

### Dashboard Queries
- Average compilation time by model size
- Cache hit rate over time
- Simulation performance percentiles
- Error rates and types
- Browser compatibility issues

## Future Enhancements

### SIMD Optimization
```c
// Use SIMD for vector/matrix operations
#ifdef __wasm_simd128__
#include <wasm_simd128.h>

void matrix_multiply_simd(double* A, double* B, double* C, int n) {
  // 2-4x faster than scalar code
}
#endif
```

### Multi-threading
```typescript
// Use Web Workers for parallel simulation
const workers = await createWorkerPool(4)
await runSimulationParallel(model, workers)
```

### Adaptive Optimization
```typescript
// Recompile with higher optimization if simulation is long
if (simulationTime > 10.0 && optimizationLevel === 'O0') {
  console.log('Long simulation detected, recompiling with O2...')
  await recompileWithOptimization('O2')
}
```

### Wasm Streaming
```typescript
// Compile Wasm while downloading
const response = await fetch(wasmUrl)
const module = await WebAssembly.compileStreaming(response)
```

## Conclusion

The WebAssembly approach provides:
- **Perfect Fidelity**: Simulation matches deployed code exactly
- **Great Performance**: 5-10x faster than JavaScript for numerical code
- **Good UX**: 1-2 second compilation for cached models
- **No Infrastructure**: No Docker, SSH, or containers needed
- **Browser-Based**: Works offline, no server needed for simulation
- **Secure**: Sandboxed execution
- **Maintainable**: Single C codebase for Wasm and embedded

The main trade-off is 1-2 seconds of initial compilation time, but aggressive caching makes this a one-time cost per model version.

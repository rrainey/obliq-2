# WASM Compilation API

REST API endpoint for compiling models to WebAssembly.

The source is `src/app/api/compile-wasm/route.ts`. The browser editor uses the streamed variant, `POST /api/compile-wasm-stream`. `ServerWasmExecutor` (automations and MCP) and `WasmSimulationEngine` use this endpoint.

## Endpoint

```
POST /api/compile-wasm
```

## Request

### Headers

```
Content-Type: application/json
Authorization: Bearer <api_token>
```

The request must have authentication. Use one of these:
- An API token from the `/tokens` page, in the `Authorization` header.
- The local session cookie that `GET /api/session` sets. A same-origin `fetch` in the browser sends it.

### Body

```typescript
{
  modelId: string             // Required: UUID of the model to compile
  version?: number            // Optional: saved version. 0 = the autosave. If you omit it, the current model file is used.
  optimizationLevel?: string  // Optional: 'O0' | 'O1' | 'O2' | 'O3' (default: 'O2')
  noCache?: boolean           // Optional: skip the cache lookup and compile again (default: false)
}
```

Model references in the model are expanded from the local store before code generation.

### Example Request

```bash
curl -X POST http://localhost:3000/api/compile-wasm \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "modelId": "550e8400-e29b-41d4-a716-446655440000",
    "optimizationLevel": "O2"
  }'
```

## Response

### Success Response (200 OK)

After a compilation (`cacheHit: false`):

```typescript
{
  wasmData: string         // Base64-encoded WASM binary
  jsData: string           // Base64-encoded JavaScript glue code
  metadata: {
    modelName: string      // Name of the compiled model
    version: number        // Model version used
    cacheKey: string       // Cache key for this compilation
    cacheHit: false
    compilationTime: number   // Time taken to compile, in milliseconds
    wasmSize: number       // Size of WASM binary in bytes
    jsSize: number         // Size of JS glue code in bytes
    optimizationLevel: string  // Optimization level used
    blockCount: number     // Number of blocks in the model
    inputMap: Array<[string, number]>   // Input port name-to-index mapping
    outputMap: Array<[string, number]>  // Output port name-to-index mapping
  }
}
```

From the cache (`cacheHit: true`), `metadata` contains the stored cache metadata (`modelHash`, `compilationTime`, `optimizationLevel`, `wasmSize`, `jsSize`, `blockCount`), and also `cacheHit`, `retrievalTime` (milliseconds), `modelName` and `cacheKey`. It does not contain `version`, `inputMap` or `outputMap`.

### Example Response

```json
{
  "wasmData": "AGFzbQEAAAABhYCAgAABYAF/AX...",
  "jsData": "dmFyIE1vZHVsZT17fTshZnVuY3Rpb...",
  "metadata": {
    "modelName": "SimpleModel",
    "version": 1,
    "cacheKey": "v38-550e8400-e29b-41d4-a716-446655440000-a1b2c3d4e5f67890-O2",
    "cacheHit": false,
    "compilationTime": 2450,
    "wasmSize": 25600,
    "jsSize": 14080,
    "optimizationLevel": "O2",
    "blockCount": 5,
    "inputMap": [["a", 0], ["b", 1]],
    "outputMap": [["result", 0]]
  }
}
```

## Error Responses

All errors have this body (`src/lib/apiErrorHandler.ts`):

```typescript
{
  success: false
  error: string        // Message
  code: string         // For example 'VALIDATION_ERROR', 'NOT_FOUND', 'INTERNAL_ERROR'
  details?: object
  timestamp: string    // ISO 8601
}
```

### 400 Bad Request

**Missing Required Fields**:
```json
{
  "success": false,
  "error": "Missing required fields: modelId",
  "code": "VALIDATION_ERROR",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

Other 400 errors:
- `Invalid JSON in request body`
- `Invalid model ID format` (`details.providedModelId`)
- `Invalid optimization level. Must be O0, O1, O2, or O3` (`details.providedLevel`)
- `Invalid model structure: missing or invalid sheets data` (`details.modelId`, `details.modelName`)

### 401 Unauthorized

The request has no valid API token and no valid session cookie.

### 404 Not Found

- `Model not found` (`details.modelId`)
- `Version 5 not found for this model` (`details.modelId`, `details.requestedVersion`)
- The model file of a linked model is missing (`details.filePath`)

### 422 Unprocessable Entity

- The model file is not a valid model.
- A model reference in the model cannot be resolved.

### 500 Internal Server Error

**Code Generation Failed**:
```json
{
  "success": false,
  "error": "Failed to generate C code",
  "code": "INTERNAL_ERROR",
  "details": {
    "modelId": "...",
    "originalError": "..."
  }
}
```

**Compilation Failed**:
```json
{
  "success": false,
  "error": "WASM compilation failed: /workspace/model.c:42:5: error: ...",
  "code": "INTERNAL_ERROR",
  "details": {
    "modelId": "...",
    "modelName": "...",
    "emccError": "...",
    "command": "emcc"
  }
}
```

## Optimization Levels

| Level | Description | Compile Time | Size | Speed |
|-------|-------------|--------------|------|-------|
| O0 | No optimization | Fast | Largest | Slowest |
| O1 | Basic optimization | Medium | Medium | Medium |
| O2 | Full optimization | Slow | Small | Fast |
| O3 | Aggressive optimization | Slowest | Smallest | Fastest |

**Recommendation**: Use `O2` for production, `O0` for development/debugging.

## Caching

The API caches compiled WASM modules with `FileCacheManager` (`src/lib/wasm/cache/`):
- **Cache Key Format**: `{CODEGEN_VERSION}-{modelId}-{modelHash}-{optimizationLevel}[-euler][-debug]`. `-euler` is added when the model uses Euler integration. `-debug` is added when `debugMath` is on.
- **Files**: `<OBLIQ_HOME>/cache/wasm/<cacheKey>/module.wasm` and `module.js`. `OBLIQ_HOME` is `~/.config/obliq-2` by default.
- **Metadata**: the `wasm_cache` table in `<OBLIQ_HOME>/obliq.db` (SQLite).

For more information, see `src/lib/wasm/cache/README.md`.

### Cache Hit Behavior

When a cache hit occurs:
1. The WASM and JS files are read from the cache folder.
2. The response has `cacheHit: true`.
3. No compilation occurs.

### Cache Miss Behavior

When a cache miss occurs:
1. C code is generated from the model.
2. The files are written to a temporary directory.
3. Emscripten compiles them in the `obliq-emscripten:latest` Docker container.
4. The result is stored in the cache.
5. The response has `cacheHit: false`.

### Cache Invalidation

A different cache key, and thus a new compilation, occurs when:
- The model structure changes (blocks, block names, parameters, connections).
- A different optimization level is requested.
- The integration algorithm or the `debugMath` setting changes.
- `CODEGEN_VERSION` in `cacheKey.ts` changes.

**Note**: UI properties (positions, colors) do not affect the cache key.

## Usage Example

### JavaScript/TypeScript

```typescript
async function compileModel(modelId: string): Promise<{
  wasmModule: ArrayBuffer
  jsCode: string
  metadata: any
}> {
  const response = await fetch('/api/compile-wasm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      modelId,
      optimizationLevel: 'O2'
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Compilation failed: ${error.error}`)
  }

  const data = await response.json()

  // Decode base64 to binary
  const wasmModule = Uint8Array.from(atob(data.wasmData), c => c.charCodeAt(0)).buffer
  const jsCode = atob(data.jsData)

  return {
    wasmModule,
    jsCode,
    metadata: data.metadata
  }
}

// Usage
const { wasmModule, jsCode, metadata } = await compileModel('550e8400-...')
console.log(`Compiled ${metadata.modelName} (${metadata.wasmSize} bytes)`)
console.log(`Cache hit: ${metadata.cacheHit}`)
```

### Loading and Running Compiled Module

```typescript
// Create a Blob URL for the JS glue code
const jsBlob = new Blob([jsCode], { type: 'application/javascript' })
const jsUrl = URL.createObjectURL(jsBlob)

// Dynamically import the module
const { default: createModule } = await import(jsUrl)

// Instantiate with WASM binary
const Module = await createModule({
  wasmBinary: wasmModule
})

// Initialize model
Module._wasm_init(0.01) // 10ms timestep

// Set inputs
Module._wasm_set_input(0, 2.0) // First input = 2.0
Module._wasm_set_input(1, 3.0) // Second input = 3.0

// Run simulation step
Module._wasm_step(0.01)

// Get outputs
const result = Module._wasm_get_output(0)
console.log('Result:', result)

// Get simulation time
const time = Module._wasm_get_time()
console.log('Time:', time)

// Clean up
URL.revokeObjectURL(jsUrl)
```

The full list of exported functions is in `src/lib/wasm/wasmExports.ts`.

## Timeout

- Maximum compilation time: **30 seconds**.
- If the compilation takes longer, the API returns a 500 error.

## Security Considerations

1. **Authentication**: The API accepts only an API token or the local session cookie.
2. **Sandboxing**: Emscripten runs in a Docker container (`docker run --rm`).
3. **Temp File Cleanup**: The temporary directory is deleted after compilation, also after an error.
4. **Timeout Protection**: A 30-second timeout stops long compilations.
5. **Input Validation**: The API validates the model ID, the optimization level and the model structure before it compiles.

## Metrics

The API writes one row to the `wasm_compilation_metrics` table in `<OBLIQ_HOME>/obliq.db` for each cache hit and each successful compilation. The row contains the model ID, cache hit, compilation time, block count and optimization level. `FileCacheManager.getCacheStats()` gives the entry count, total size, average compilation time and 24-hour hit rate. `POST /api/cache-maintenance` runs cleanup and LRU eviction.

## Troubleshooting

### "Docker image not found"
```bash
docker build -t obliq-emscripten:latest -f __tests__/wasm/docker/Dockerfile.emscripten __tests__/wasm/docker
```

### "Compilation timeout"
- Use lower optimization level (`O0` instead of `O2`)
- Reduce model complexity
- Check Docker resource limits

### "Out of memory"
Increase Docker memory limit:
```bash
# Docker Desktop: Settings → Resources → Memory
```

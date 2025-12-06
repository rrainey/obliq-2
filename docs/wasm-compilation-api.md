# WASM Compilation API

REST API endpoint for compiling models to WebAssembly.

## Endpoint

```
POST /api/compile-wasm
```

## Request

### Headers

```
Content-Type: application/json
```

### Body

```typescript
{
  modelId: string          // Required: UUID of the model to compile
  version?: number         // Optional: Model version (defaults to latest)
  optimizationLevel?: string  // Optional: 'O0' | 'O1' | 'O2' | 'O3' (default: 'O2')
}
```

### Example Request

```bash
curl -X POST http://localhost:3000/api/compile-wasm \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "550e8400-e29b-41d4-a716-446655440000",
    "optimizationLevel": "O2"
  }'
```

## Response

### Success Response (200 OK)

```typescript
{
  wasmData: string         // Base64-encoded WASM binary
  jsData: string           // Base64-encoded JavaScript glue code
  metadata: {
    modelName: string      // Name of the compiled model
    version: number        // Model version used
    cacheKey: string       // Cache key for this compilation
    cacheHit: boolean      // Whether result was from cache
    compilationTime?: number  // Time taken to compile (if not cached)
    retrievalTime?: number    // Time taken to retrieve from cache
    wasmSize: number       // Size of WASM binary in bytes
    jsSize: number         // Size of JS glue code in bytes
    optimizationLevel: string  // Optimization level used
    blockCount: number     // Number of blocks in the model
    inputMap: Array<[string, number]>   // Input port name-to-index mapping
    outputMap: Array<[string, number]>  // Output port name-to-index mapping
  }
}
```

### Example Response

```json
{
  "wasmData": "AGFzbQEAAAABhYCAgAABYAF/AX...",
  "jsData": "dmFyIE1vZHVsZT17fTshZnVuY3Rpb...",
  "metadata": {
    "modelName": "SimpleModel",
    "version": 1,
    "cacheKey": "550e8400-e29b-41d4-a716-446655440000-a1b2c3d4e5f67890-O2",
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

### 400 Bad Request

**Missing Required Fields**:
```json
{
  "error": "Missing required fields: modelId",
  "type": "validation_error",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

**Invalid Model ID Format**:
```json
{
  "error": "Invalid model ID format",
  "type": "validation_error",
  "details": {
    "providedModelId": "not-a-uuid"
  }
}
```

**Invalid Optimization Level**:
```json
{
  "error": "Invalid optimization level. Must be O0, O1, O2, or O3",
  "type": "validation_error",
  "details": {
    "providedLevel": "O4"
  }
}
```

**Invalid Model Structure**:
```json
{
  "error": "Invalid model structure: missing or invalid sheets data",
  "type": "validation_error",
  "details": {
    "modelId": "...",
    "modelName": "..."
  }
}
```

### 404 Not Found

**Model Not Found**:
```json
{
  "error": "Model not found",
  "type": "not_found",
  "details": {
    "modelId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Version Not Found**:
```json
{
  "error": "Version 5 not found for this model",
  "type": "not_found",
  "details": {
    "modelId": "...",
    "requestedVersion": 5
  }
}
```

### 500 Internal Server Error

**Code Generation Failed**:
```json
{
  "error": "Failed to generate C code",
  "type": "internal_error",
  "details": {
    "modelId": "...",
    "originalError": "..."
  }
}
```

**Compilation Failed**:
```json
{
  "error": "WASM compilation failed: /workspace/model.c:42:5: error: ...",
  "type": "internal_error",
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

The API automatically caches compiled WASM modules using:
- **Cache Key Format**: `{modelId}-{modelHash}-{optimizationLevel}[-debug]`
- **Storage**: Supabase Storage (`wasm-cache` bucket)
- **Metadata**: PostgreSQL (`wasm_cache_metadata` table)

### Cache Hit Behavior

When a cache hit occurs:
1. WASM and JS files retrieved from Supabase Storage (typically <200ms)
2. Metadata returned with `cacheHit: true`
3. No compilation performed
4. Speedup: 10-60x faster than compiling

### Cache Miss Behavior

When a cache miss occurs:
1. C code generated from model
2. Files written to temporary directory
3. Emscripten compilation via Docker (typically 1-3 seconds)
4. Result stored in cache for future requests
5. Metadata returned with `cacheHit: false`

### Cache Invalidation

Cache is invalidated when:
- Model structure changes (blocks, connections, parameters)
- Different optimization level requested
- Model version changes

**Note**: UI properties (positions, colors) don't affect cache key.

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

## Performance Characteristics

### Compilation Time

| Model Size | Optimization | Time (First) | Time (Cached) |
|------------|--------------|--------------|---------------|
| Small (5-10 blocks) | O0 | ~0.8s | ~100ms |
| Small (5-10 blocks) | O2 | ~1.5s | ~100ms |
| Medium (20-50 blocks) | O0 | ~1.2s | ~150ms |
| Medium (20-50 blocks) | O2 | ~2.5s | ~150ms |
| Large (100+ blocks) | O0 | ~2.0s | ~200ms |
| Large (100+ blocks) | O2 | ~4.0s | ~200ms |

### Timeout

- Maximum compilation time: **30 seconds**
- If exceeded, returns 500 error
- Recommend using `O0` for very large models during development

## Rate Limiting

Currently no rate limiting implemented. Future versions may add:
- Per-user limits
- IP-based throttling
- Authenticated API keys

## Security Considerations

1. **Model Access**: API uses Supabase RLS policies to ensure users can only compile models they have access to
2. **Sandboxing**: Emscripten runs in Docker container with limited resources
3. **Temp File Cleanup**: Temporary files deleted after compilation
4. **Timeout Protection**: 30-second timeout prevents long-running compilations
5. **Input Validation**: All inputs validated before processing

## Monitoring & Analytics

The API logs metrics to `wasm_compilation_metrics` table:
- Cache hit rate
- Compilation times
- Model sizes
- Error rates
- User activity

Access via Supabase dashboard or query directly:

```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_compilations,
  SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) as cache_hits,
  AVG(compilation_time_ms) FILTER (WHERE NOT cache_hit) as avg_compile_time
FROM wasm_compilation_metrics
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## Troubleshooting

### "Docker image not found"
```bash
docker build -t obliq-emscripten:latest -f __tests__/wasm/docker/Dockerfile.emscripten __tests__/wasm/docker
```

### "Supabase connection failed"
Check environment variables:
```bash
echo $NEXT_PUBLIC_SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
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

## Future Enhancements

- [ ] Streaming compilation progress (Server-Sent Events)
- [ ] Pre-warming (compile when model editor opens)
- [ ] CDN integration for cached modules
- [ ] Custom Emscripten flags support
- [ ] Multi-threaded WASM support
- [ ] Source map generation for debugging

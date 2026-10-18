# WASM Module Cache

Caches compiled WebAssembly modules so that a model is only recompiled when its
structure or compile options change.

## Storage

- **Files**: `<OBLIQ_HOME>/cache/wasm/<cacheKey>/module.wasm` and `module.js`
  (`OBLIQ_HOME` defaults to `~/.config/obliq-2`)
- **Metadata**: the `wasm_cache` table in `<OBLIQ_HOME>/obliq.db` (model id/hash,
  optimization level, sizes, compile time, last access, access count)
- **Metrics**: the `wasm_compilation_metrics` and `wasm_simulation_metrics` tables

The schema is created automatically (`src/lib/server/storage/db.ts`). The cache
is disposable: deleting `cache/wasm/` is safe. Rows whose files have vanished are
dropped on the next lookup.

## Usage (server-side only)

```typescript
import { FileCacheManager, generateCacheKey, hashModel } from '@/lib/wasm/cache'

const cache = new FileCacheManager()
const cacheKey = generateCacheKey(modelId, modelStructure, { optimizationLevel: 'O2' })

const hit = await cache.get(cacheKey)
if (!hit) {
  const { wasmData, jsData } = await compile(...)
  await cache.store(cacheKey, modelId, wasmData, jsData, {
    modelHash: hashModel(modelStructure),
    compilationTime,
    optimizationLevel: 'O2',
    wasmSize: wasmData.length,
    jsSize: jsData.length,
    blockCount,
  })
}
```

## FileCacheManager API

| Method | Description |
|--------|-------------|
| `get(key)` | Returns `{ wasmData, jsData, metadata }` or `null`; updates access metrics |
| `store(key, modelId, wasm, js, metadata)` | Writes files atomically and upserts metadata |
| `exists(key)` / `getMetadata(key)` | Metadata lookups without reading files |
| `delete(key)` | Removes files and metadata |
| `cleanupOldEntries(days = 30)` | Deletes entries not accessed in `days` |
| `evictLRU(maxEntries = 1000, maxSizeMB = 500)` | Evicts least-recently-used entries until both limits hold |
| `getCacheStats()` | Entry count, total MB, average compile time, 24h hit rate |
| `logCompilationMetric(...)` / `logSimulationMetric(...)` | Append metrics rows |

`POST /api/cache-maintenance` exposes cleanup/eviction/stats over HTTP.

## Cache keys

`cacheKey.ts` provides `generateCacheKey`, `hashModel`, `isValidCacheKey`,
`parseCacheKey`, and `shortCacheKey`. Keys hash the model structure (sheets,
blocks, connections, parameters) plus compile options. Cosmetic changes such as
block positions don't invalidate the cache.

## Tests

```bash
npm run test:wasm:cache   # cacheKey unit tests + storage/FileCacheManager tests
```

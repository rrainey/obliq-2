# WASM Cache Infrastructure

This module provides caching infrastructure for compiled WebAssembly modules using Supabase Storage and PostgreSQL.

## Overview

The WASM cache system minimizes compilation time by storing compiled modules and reusing them when the same model is simulated multiple times. It uses:

- **Supabase Storage**: Stores compiled `.wasm` and `.js` files
- **PostgreSQL**: Stores metadata, access metrics, and analytics
- **Content-Addressed Keys**: Ensures identical models produce identical cache keys

## Quick Start

### 1. Set Up Database Schema

Run the database migration scripts:

```bash
# From Supabase Dashboard SQL Editor or via CLI
psql -h localhost -p 54322 -U postgres -d postgres < database-scripts/04-wasm-cache.sql
psql -h localhost -p 54322 -U postgres -d postgres < database-scripts/05-wasm-storage-bucket.sql
```

Or apply via Supabase dashboard:
1. Go to SQL Editor
2. Run `04-wasm-cache.sql`
3. Run `05-wasm-storage-bucket.sql`

### 2. Configure Environment Variables

Add to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Use the Cache Manager

```typescript
import { SupabaseCacheManager, generateCacheKey } from '@/lib/wasm/cache'

// Create cache manager
const cacheManager = new SupabaseCacheManager()

// Generate cache key from model
const cacheKey = generateCacheKey(modelId, modelStructure, {
  optimizationLevel: 'O2'
})

// Check if cached
const exists = await cacheManager.exists(cacheKey)

if (exists) {
  // Retrieve from cache
  const cached = await cacheManager.get(cacheKey)
  if (cached) {
    const { wasmData, jsData, metadata } = cached
    // Use cached module...
  }
} else {
  // Compile and store
  const { wasmData, jsData } = await compileToWasm(model)
  await cacheManager.store(cacheKey, modelId, wasmData, jsData, {
    modelHash: hashModel(modelStructure),
    compilationTime: Date.now() - startTime,
    optimizationLevel: 'O2',
    wasmSize: wasmData.length,
    jsSize: jsData.length,
    blockCount: modelStructure.sheets.flatMap(s => s.blocks).length
  })
}
```

## API Reference

### Cache Key Generation

#### `generateCacheKey(modelId, model, options?)`

Generates a deterministic cache key for a model.

```typescript
const cacheKey = generateCacheKey(
  '550e8400-e29b-41d4-a716-446655440000', // Model UUID
  { sheets: [...] },                        // Model structure
  {
    optimizationLevel: 'O2',                // Optional, default: 'O2'
    includeDebugInfo: false                 // Optional, default: false
  }
)
// Returns: "550e8400-e29b-41d4-a716-446655440000-a1b2c3d4e5f67890-O2"
```

**Parameters:**
- `modelId` (string): Unique identifier for the model
- `model` (ModelStructure): The model sheets with blocks and connections
- `options` (CacheKeyOptions): Optional compilation options

**Returns:** A cache key string in format: `{modelId}-{hash}-{opt}[-debug]`

#### `hashModel(model)`

Creates a content-addressed hash of a model structure.

```typescript
const hash = hashModel({ sheets: [...] })
// Returns: "a1b2c3d4e5f67890" (16-character hex)
```

Only includes structure-relevant data (blocks, connections, parameters), ignoring UI properties like positions.

#### `isValidCacheKey(cacheKey)`

Validates a cache key format.

```typescript
isValidCacheKey('model-id-0123456789abcdef-O2') // true
isValidCacheKey('invalid-key')                  // false
```

#### `parseCacheKey(cacheKey)`

Parses a cache key into its components.

```typescript
const parsed = parseCacheKey('model-id-a1b2c3d4e5f67890-O2-debug')
// Returns:
// {
//   modelId: 'model-id',
//   hash: 'a1b2c3d4e5f67890',
//   optimizationLevel: 'O2',
//   debugInfo: true
// }
```

#### `shortCacheKey(cacheKey)`

Creates a shortened version for display.

```typescript
shortCacheKey('model-id-0123456789abcdef-O2')
// Returns: "01234567...O2"
```

### SupabaseCacheManager

#### Constructor

```typescript
const cacheManager = new SupabaseCacheManager(supabaseUrl?, supabaseKey?)
```

**Parameters:**
- `supabaseUrl` (optional): Falls back to `NEXT_PUBLIC_SUPABASE_URL`
- `supabaseKey` (optional): Falls back to `SUPABASE_SERVICE_ROLE_KEY`

#### `get(cacheKey)`

Retrieve a cached WASM module.

```typescript
const cached = await cacheManager.get(cacheKey)
if (cached) {
  const { wasmData, jsData, metadata } = cached
  // wasmData: Buffer
  // jsData: Buffer
  // metadata: { modelHash, compilationTime, optimizationLevel, wasmSize, jsSize, blockCount }
}
```

**Returns:** `CachedWasmModule | null`

#### `store(cacheKey, modelId, wasmData, jsData, metadata)`

Store a compiled WASM module.

```typescript
await cacheManager.store(
  cacheKey,
  modelId,
  Buffer.from(wasmBinary),
  Buffer.from(jsGlueCode),
  {
    modelHash: 'a1b2c3d4e5f67890',
    compilationTime: 1500,
    optimizationLevel: 'O2',
    wasmSize: 25600,
    jsSize: 15200,
    blockCount: 10
  }
)
```

#### `exists(cacheKey)`

Check if a cache entry exists.

```typescript
const exists = await cacheManager.exists(cacheKey)
```

**Returns:** `boolean`

#### `getMetadata(cacheKey)`

Get metadata without downloading files.

```typescript
const metadata = await cacheManager.getMetadata(cacheKey)
// Returns: CacheMetadata | null
```

#### `getSignedUrls(cacheKey, expiresIn?)`

Get signed URLs for direct download.

```typescript
const urls = await cacheManager.getSignedUrls(cacheKey, 3600)
if (urls) {
  const { wasmUrl, jsUrl } = urls
  // Use URLs to download files directly
}
```

**Parameters:**
- `cacheKey` (string)
- `expiresIn` (number): Expiration in seconds (default: 3600)

**Returns:** `{ wasmUrl: string; jsUrl: string } | null`

#### `getCacheStats()`

Get cache statistics.

```typescript
const stats = await cacheManager.getCacheStats()
// Returns:
// {
//   totalEntries: 150,
//   totalSizeMB: 45.2,
//   avgCompilationTime: 1500,
//   cacheHitRate: 85.5
// }
```

#### `cleanupOldEntries(daysOld?)`

Clean up old cache entries.

```typescript
const deletedCount = await cacheManager.cleanupOldEntries(30)
console.log(`Deleted ${deletedCount} old entries`)
```

**Parameters:**
- `daysOld` (number): Age threshold in days (default: 30)

**Returns:** Number of entries deleted

#### `logCompilationMetric(metric)`

Log a compilation event.

```typescript
await cacheManager.logCompilationMetric({
  modelId: 'model-uuid',
  userId: 'user-uuid',
  cacheHit: true,
  compilationTime: 1500,
  blockCount: 10,
  optimizationLevel: 'O2'
})
```

#### `logSimulationMetric(metric)`

Log a simulation performance event.

```typescript
await cacheManager.logSimulationMetric({
  modelId: 'model-uuid',
  userId: 'user-uuid',
  cacheKey,
  stepsExecuted: 1000,
  totalTimeMs: 50,
  avgStepTimeUs: 50,
  peakMemoryMb: 10,
  browserInfo: { userAgent: '...', platform: '...' }
})
```

## Database Schema

### Tables

#### `wasm_cache_metadata`

Stores metadata about cached WASM modules.

**Columns:**
- `id` (UUID): Primary key
- `cache_key` (TEXT): Unique cache key
- `model_id` (UUID): Model identifier
- `model_hash` (TEXT): Content hash
- `wasm_path` (TEXT): Storage path for WASM file
- `js_path` (TEXT): Storage path for JS file
- `compilation_time_ms` (INTEGER): Compilation duration
- `optimization_level` (TEXT): O0, O1, O2, or O3
- `wasm_size_bytes` (INTEGER): WASM file size
- `js_size_bytes` (INTEGER): JS file size
- `block_count` (INTEGER): Number of blocks in model
- `created_at` (TIMESTAMPTZ): Creation timestamp
- `last_accessed_at` (TIMESTAMPTZ): Last access timestamp
- `access_count` (INTEGER): Number of times accessed

**Indexes:**
- `idx_wasm_cache_model_hash`: Fast lookup by model
- `idx_wasm_cache_key`: Fast lookup by cache key
- `idx_wasm_cache_created_at`: Cleanup queries
- `idx_wasm_cache_accessed_at`: Cleanup queries

#### `wasm_compilation_metrics`

Tracks compilation requests for analytics.

**Columns:**
- `id` (UUID): Primary key
- `model_id` (UUID): Model identifier
- `user_id` (UUID): User who requested compilation
- `cache_hit` (BOOLEAN): Whether cache was hit
- `compilation_time_ms` (INTEGER): Time taken (if compiled)
- `block_count` (INTEGER): Number of blocks
- `optimization_level` (TEXT): Optimization level used
- `error_message` (TEXT): Error message if failed
- `error_details` (JSONB): Additional error info
- `created_at` (TIMESTAMPTZ): Timestamp

#### `wasm_simulation_metrics`

Tracks simulation performance.

**Columns:**
- `id` (UUID): Primary key
- `model_id` (UUID): Model identifier
- `user_id` (UUID): User who ran simulation
- `cache_key` (TEXT): Cache key used
- `steps_executed` (INTEGER): Number of simulation steps
- `total_time_ms` (INTEGER): Total simulation time
- `avg_step_time_us` (FLOAT): Average step time in microseconds
- `peak_memory_mb` (FLOAT): Peak memory usage
- `browser_info` (JSONB): Browser/environment info
- `created_at` (TIMESTAMPTZ): Timestamp

### Views

#### `wasm_cache_stats`

Aggregated cache statistics.

```sql
SELECT * FROM wasm_cache_stats;
```

#### `wasm_cache_hit_rate_daily`

Daily cache hit rate for last 30 days.

```sql
SELECT * FROM wasm_cache_hit_rate_daily;
```

#### `wasm_most_accessed`

Top 50 most frequently accessed cache entries.

```sql
SELECT * FROM wasm_most_accessed;
```

### Functions

#### `increment_access_count(cache_key)`

Atomically updates access count and timestamp.

```sql
SELECT increment_access_count('model-id-hash-O2');
```

#### `cleanup_old_wasm_cache(days_old)`

Removes entries older than specified days.

```sql
SELECT * FROM cleanup_old_wasm_cache(30);
```

#### `get_wasm_storage_stats()`

Returns storage usage statistics.

```sql
SELECT * FROM get_wasm_storage_stats();
```

## Testing

### Unit Tests

Run cache key generation tests:

```bash
npm run test:wasm:cache
```

Tests cover:
- ✅ Cache key generation
- ✅ Model hashing
- ✅ Cache key validation
- ✅ Cache key parsing
- ✅ Deterministic hashing

### Integration Tests

Run tests with actual Supabase:

```bash
npm run test:wasm:cache:integration
```

Prerequisites:
- Supabase running locally or configured
- Database schema applied
- Environment variables set

Tests cover:
- ✅ Store and retrieve operations
- ✅ Metadata queries
- ✅ Signed URL generation
- ✅ Statistics aggregation
- ✅ Metric logging

## Performance

### Cache Hit Benefits

- **First compilation**: ~1-3 seconds (depending on model size)
- **Cache hit**: ~50-200ms (network download time)
- **Speedup**: 10-60x faster

### Storage Costs

Assuming:
- Average WASM: 200KB
- Average JS: 50KB
- 1000 unique models
- 10,000 cache hits/month

**Supabase Free Tier:**
- Storage: 1GB (250MB used = 25%)
- Egress: 2GB (2.5GB = over by 0.5GB)

**Cost** (if over free tier):
- Storage: $0.005/month
- Egress: $0.225/month
- **Total**: ~$0.23/month

## Best Practices

### 1. Use Content-Addressed Keys

Always use `generateCacheKey()` - never manually construct keys. This ensures:
- Identical models produce identical keys
- Different models never collide
- Optimization level is tracked

### 2. Handle Cache Misses Gracefully

```typescript
const cached = await cacheManager.get(cacheKey)
if (cached) {
  // Use cached version
} else {
  // Compile and store
  const compiled = await compile(model)
  await cacheManager.store(cacheKey, modelId, ...)
}
```

### 3. Log Metrics

Always log compilation and simulation metrics for analytics:

```typescript
await cacheManager.logCompilationMetric({
  modelId,
  cacheHit: !!cached,
  compilationTime: cached ? undefined : compilationTime,
  blockCount,
  optimizationLevel
})
```

### 4. Use Signed URLs for Client Downloads

For browser clients, use signed URLs to avoid RLS overhead:

```typescript
const urls = await cacheManager.getSignedUrls(cacheKey)
if (urls) {
  // Download directly in browser
  const wasmResponse = await fetch(urls.wasmUrl)
  const wasmArrayBuffer = await wasmResponse.arrayBuffer()
}
```

### 5. Clean Up Periodically

Schedule cleanup of old entries:

```typescript
// Run weekly or monthly
const deleted = await cacheManager.cleanupOldEntries(30)
console.log(`Cleaned up ${deleted} old cache entries`)
```

## Troubleshooting

### "Supabase URL and Service Role Key are required"

**Solution**: Set environment variables in `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### "Failed to download WASM" or "Failed to download JS"

**Possible causes:**
1. Storage bucket not created
2. RLS policies not configured
3. Files were never uploaded

**Solution**:
1. Run `05-wasm-storage-bucket.sql`
2. Check bucket exists in Supabase dashboard
3. Verify files exist using `getMetadata()`

### Cache always misses

**Possible causes:**
1. Model structure changing slightly (positions, IDs)
2. Cache key not being stored properly

**Solution**:
1. Ensure `hashModel()` only uses structure-relevant data
2. Check database for stored entries
3. Verify cache key format with `isValidCacheKey()`

### High egress costs

**Solution**:
1. Enable browser-side IndexedDB caching
2. Increase CDN cache TTL
3. Use signed URLs with longer expiration
4. Consider self-hosting for high-traffic scenarios

## Migration

### From Local File Cache

If you have an existing file-based cache:

```typescript
// 1. Load existing cache entries
const entries = fs.readdirSync('/old-cache')

// 2. Upload to Supabase
for (const entry of entries) {
  const cacheKey = extractCacheKey(entry)
  const wasmData = fs.readFileSync(`/old-cache/${cacheKey}.wasm`)
  const jsData = fs.readFileSync(`/old-cache/${cacheKey}.js`)

  await cacheManager.store(cacheKey, modelId, wasmData, jsData, metadata)
}
```

## Future Enhancements

- [ ] Browser-side IndexedDB caching
- [ ] Automatic cache warming for popular models
- [ ] Compression for storage (gzip)
- [ ] Differential caching for similar models
- [ ] Multi-region replication

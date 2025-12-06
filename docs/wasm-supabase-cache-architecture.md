# Supabase Storage Caching Architecture for WebAssembly

## Overview

This document describes the caching strategy using Supabase Storage to minimize Wasm compilation time and provide fast, scalable access to compiled modules.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Backend                          │
│                                                               │
│  ┌────────────────────────────────────────────────────┐     │
│  │  Supabase Storage Bucket: wasm-cache               │     │
│  │                                                      │     │
│  │  /{cache_key}.wasm        - Compiled Wasm binary   │     │
│  │  /{cache_key}.js          - Emscripten JS glue     │     │
│  │  /{cache_key}.wasm.map    - Source maps (optional) │     │
│  └────────────────────────────────────────────────────┘     │
│                                                               │
│  ┌────────────────────────────────────────────────────┐     │
│  │  Postgres Table: wasm_cache_metadata               │     │
│  │                                                      │     │
│  │  - cache_key (PK)                                  │     │
│  │  - model_id                                         │     │
│  │  - model_hash                                       │     │
│  │  - wasm_path                                        │     │
│  │  - js_path                                          │     │
│  │  - compilation_time_ms                              │     │
│  │  - optimization_level                               │     │
│  │  - wasm_size_bytes                                  │     │
│  │  - created_at                                       │     │
│  │  - last_accessed_at                                 │     │
│  │  - access_count                                     │     │
│  └────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────┘
                            ▲
                            │
┌───────────────────────────┴───────────────────────────────────┐
│                    Application Server                          │
│  ┌────────────────────────────────────────────────────┐      │
│  │  Compilation Service                                │      │
│  │  - Generates C code                                 │      │
│  │  - Compiles to Wasm via Emscripten                 │      │
│  │  - Uploads to Supabase Storage                      │      │
│  │  - Updates metadata table                           │      │
│  └────────────────────────────────────────────────────┘      │
└───────────────────────────────────────────────────────────────┘
                            ▲
                            │
┌───────────────────────────┴───────────────────────────────────┐
│                      Browser (Client)                          │
│  ┌────────────────────────────────────────────────────┐      │
│  │  IndexedDB Cache (Optional)                        │      │
│  │  - Stores frequently used modules locally           │      │
│  │  - Reduces network requests                         │      │
│  └────────────────────────────────────────────────────┘      │
└───────────────────────────────────────────────────────────────┘
```

## Database Schema

```sql
-- Wasm cache metadata table
CREATE TABLE wasm_cache_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  model_id UUID NOT NULL,
  model_hash TEXT NOT NULL,
  wasm_path TEXT NOT NULL,
  js_path TEXT NOT NULL,
  source_map_path TEXT,
  compilation_time_ms INTEGER NOT NULL,
  optimization_level TEXT NOT NULL CHECK (optimization_level IN ('O0', 'O1', 'O2', 'O3')),
  wasm_size_bytes INTEGER NOT NULL,
  js_size_bytes INTEGER NOT NULL,
  block_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  access_count INTEGER DEFAULT 0,
  user_id UUID REFERENCES auth.users(id),
  
  CONSTRAINT valid_paths CHECK (
    wasm_path LIKE 'wasm-cache/%' AND
    js_path LIKE 'wasm-cache/%'
  )
);

-- Indexes for fast lookup
CREATE INDEX idx_wasm_cache_model_hash ON wasm_cache_metadata(model_id, model_hash);
CREATE INDEX idx_wasm_cache_key ON wasm_cache_metadata(cache_key);
CREATE INDEX idx_wasm_cache_created_at ON wasm_cache_metadata(created_at);
CREATE INDEX idx_wasm_cache_accessed_at ON wasm_cache_metadata(last_accessed_at);

-- Row Level Security
ALTER TABLE wasm_cache_metadata ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read all cache entries (compilation is deterministic)
CREATE POLICY "Anyone can read cache metadata"
  ON wasm_cache_metadata FOR SELECT
  USING (true);

-- Policy: Only service role can insert/update
CREATE POLICY "Service role can manage cache"
  ON wasm_cache_metadata FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Compilation metrics table
CREATE TABLE wasm_compilation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  cache_hit BOOLEAN NOT NULL,
  compilation_time_ms INTEGER,
  block_count INTEGER NOT NULL,
  optimization_level TEXT NOT NULL,
  error_message TEXT,
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_compilation_metrics_created_at ON wasm_compilation_metrics(created_at);
CREATE INDEX idx_compilation_metrics_model ON wasm_compilation_metrics(model_id);

-- Simulation performance metrics
CREATE TABLE wasm_simulation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  cache_key TEXT NOT NULL,
  steps_executed INTEGER NOT NULL,
  total_time_ms INTEGER NOT NULL,
  avg_step_time_us FLOAT NOT NULL,
  peak_memory_mb FLOAT,
  browser_info JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_simulation_metrics_created_at ON wasm_simulation_metrics(created_at);
```

## Supabase Storage Configuration

```typescript
// Bucket configuration
const WASM_CACHE_BUCKET = 'wasm-cache'

const bucketConfig = {
  public: false,  // Require authentication
  fileSizeLimit: 52428800,  // 50MB max file size
  allowedMimeTypes: [
    'application/wasm',
    'application/javascript',
    'application/json'  // For source maps
  ]
}

// RLS Policies on bucket
// 1. Anyone authenticated can download from wasm-cache (read-only)
// 2. Only service role can upload to wasm-cache
```

## Cache Key Generation

```typescript
// lib/cache/cacheKey.ts

import crypto from 'crypto'

export interface ModelStructure {
  sheets: Array<{
    blocks: Array<{
      type: string
      parameters?: Record<string, any>
    }>
    connections: Array<any>
  }>
}

export function generateCacheKey(
  modelId: string,
  modelJson: ModelStructure,
  optimizationLevel: string = 'O2'
): string {
  const hash = hashModel(modelJson)
  return `${modelId}-${hash}-${optimizationLevel}`
}

export function hashModel(model: ModelStructure): string {
  // Extract only structure-relevant data
  const relevantData = {
    blocks: model.sheets.flatMap(s => 
      s.blocks.map(b => ({
        type: b.type,
        parameters: b.parameters
      }))
    ),
    connections: model.sheets.flatMap(s => s.connections)
  }
  
  const jsonStr = JSON.stringify(relevantData, Object.keys(relevantData).sort())
  
  return crypto
    .createHash('sha256')
    .update(jsonStr)
    .digest('hex')
    .substring(0, 16)
}
```

## Cache Manager Implementation

```typescript
// lib/cache/SupabaseCacheManager.ts

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { generateCacheKey, hashModel } from './cacheKey'

export interface CacheMetadata {
  modelHash: string
  compilationTime: number
  optimizationLevel: string
  wasmSize: number
  jsSize: number
  blockCount: number
}

export interface CachedWasmModule {
  wasmData: Buffer
  jsData: Buffer
  metadata: CacheMetadata
}

export class SupabaseCacheManager {
  private supabase: SupabaseClient
  private bucket = 'wasm-cache'
  
  constructor(supabaseUrl?: string, supabaseKey?: string) {
    this.supabase = createClient(
      supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  
  async get(cacheKey: string): Promise<CachedWasmModule | null> {
    try {
      // 1. Check metadata exists
      const { data: metadata, error: metadataError } = await this.supabase
        .from('wasm_cache_metadata')
        .select('*')
        .eq('cache_key', cacheKey)
        .single()
      
      if (metadataError || !metadata) {
        return null
      }
      
      // 2. Download Wasm file
      const { data: wasmData, error: wasmError } = await this.supabase.storage
        .from(this.bucket)
        .download(`${cacheKey}.wasm`)
      
      if (wasmError) {
        console.error('Failed to download Wasm:', wasmError)
        return null
      }
      
      // 3. Download JS file
      const { data: jsData, error: jsError } = await this.supabase.storage
        .from(this.bucket)
        .download(`${cacheKey}.js`)
      
      if (jsError) {
        console.error('Failed to download JS:', jsError)
        return null
      }
      
      // 4. Update access metrics
      await this.updateAccessMetrics(cacheKey)
      
      // 5. Convert Blob to Buffer
      const wasmBuffer = Buffer.from(await wasmData.arrayBuffer())
      const jsBuffer = Buffer.from(await jsData.arrayBuffer())
      
      return {
        wasmData: wasmBuffer,
        jsData: jsBuffer,
        metadata: {
          modelHash: metadata.model_hash,
          compilationTime: metadata.compilation_time_ms,
          optimizationLevel: metadata.optimization_level,
          wasmSize: metadata.wasm_size_bytes,
          jsSize: metadata.js_size_bytes,
          blockCount: metadata.block_count
        }
      }
    } catch (error) {
      console.error('Cache retrieval error:', error)
      return null
    }
  }
  
  async store(
    cacheKey: string,
    modelId: string,
    wasmData: Buffer,
    jsData: Buffer,
    metadata: CacheMetadata
  ): Promise<void> {
    try {
      // 1. Upload Wasm file
      const { error: wasmError } = await this.supabase.storage
        .from(this.bucket)
        .upload(`${cacheKey}.wasm`, wasmData, {
          contentType: 'application/wasm',
          upsert: true,
          cacheControl: '3600' // 1 hour cache
        })
      
      if (wasmError) throw wasmError
      
      // 2. Upload JS file
      const { error: jsError } = await this.supabase.storage
        .from(this.bucket)
        .upload(`${cacheKey}.js`, jsData, {
          contentType: 'application/javascript',
          upsert: true,
          cacheControl: '3600'
        })
      
      if (jsError) throw jsError
      
      // 3. Store metadata
      const { error: metadataError } = await this.supabase
        .from('wasm_cache_metadata')
        .upsert({
          cache_key: cacheKey,
          model_id: modelId,
          model_hash: metadata.modelHash,
          wasm_path: `${this.bucket}/${cacheKey}.wasm`,
          js_path: `${this.bucket}/${cacheKey}.js`,
          compilation_time_ms: metadata.compilationTime,
          optimization_level: metadata.optimizationLevel,
          wasm_size_bytes: metadata.wasmSize,
          js_size_bytes: metadata.jsSize,
          block_count: metadata.blockCount
        })
      
      if (metadataError) throw metadataError
      
    } catch (error) {
      console.error('Cache storage error:', error)
      throw error
    }
  }
  
  async exists(cacheKey: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('wasm_cache_metadata')
      .select('cache_key')
      .eq('cache_key', cacheKey)
      .single()
    
    return !error && !!data
  }
  
  async getMetadata(cacheKey: string): Promise<CacheMetadata | null> {
    const { data, error } = await this.supabase
      .from('wasm_cache_metadata')
      .select('*')
      .eq('cache_key', cacheKey)
      .single()
    
    if (error || !data) return null
    
    return {
      modelHash: data.model_hash,
      compilationTime: data.compilation_time_ms,
      optimizationLevel: data.optimization_level,
      wasmSize: data.wasm_size_bytes,
      jsSize: data.js_size_bytes,
      blockCount: data.block_count
    }
  }
  
  private async updateAccessMetrics(cacheKey: string): Promise<void> {
    await this.supabase
      .from('wasm_cache_metadata')
      .update({
        last_accessed_at: new Date().toISOString(),
        access_count: this.supabase.rpc('increment', { row_id: cacheKey })
      })
      .eq('cache_key', cacheKey)
  }
  
  async cleanupOldEntries(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)
    
    // Get old entries
    const { data: oldEntries } = await this.supabase
      .from('wasm_cache_metadata')
      .select('cache_key')
      .lt('last_accessed_at', cutoffDate.toISOString())
    
    if (!oldEntries || oldEntries.length === 0) {
      return 0
    }
    
    // Delete from storage
    for (const entry of oldEntries) {
      await this.supabase.storage
        .from(this.bucket)
        .remove([`${entry.cache_key}.wasm`, `${entry.cache_key}.js`])
    }
    
    // Delete metadata
    await this.supabase
      .from('wasm_cache_metadata')
      .delete()
      .lt('last_accessed_at', cutoffDate.toISOString())
    
    return oldEntries.length
  }
  
  async getCacheStats(): Promise<{
    totalEntries: number
    totalSizeMB: number
    avgCompilationTime: number
    cacheHitRate: number
  }> {
    const { data: metadata } = await this.supabase
      .from('wasm_cache_metadata')
      .select('wasm_size_bytes, js_size_bytes, compilation_time_ms')
    
    const { data: metrics } = await this.supabase
      .from('wasm_compilation_metrics')
      .select('cache_hit')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    
    const totalSize = metadata?.reduce(
      (sum, m) => sum + m.wasm_size_bytes + m.js_size_bytes,
      0
    ) || 0
    
    const avgTime = metadata?.reduce(
      (sum, m) => sum + m.compilation_time_ms,
      0
    ) / (metadata?.length || 1)
    
    const cacheHits = metrics?.filter(m => m.cache_hit).length || 0
    const totalRequests = metrics?.length || 1
    
    return {
      totalEntries: metadata?.length || 0,
      totalSizeMB: totalSize / 1024 / 1024,
      avgCompilationTime: avgTime,
      cacheHitRate: (cacheHits / totalRequests) * 100
    }
  }
}
```

## Compilation API with Supabase Caching

```typescript
// app/api/compile-wasm/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { SupabaseCacheManager } from '@/lib/cache/SupabaseCacheManager'
import { generateCacheKey } from '@/lib/cache/cacheKey'
import { compileToWasm } from '@/lib/compilation/wasmCompiler'
import { generateCCode } from '@/lib/codeGeneration'

export async function POST(request: NextRequest) {
  try {
    const { modelId, modelJson, optimizationLevel = 'O2' } = await request.json()
    
    // 1. Generate cache key
    const cacheKey = generateCacheKey(modelId, modelJson, optimizationLevel)
    
    // 2. Check cache
    const cacheManager = new SupabaseCacheManager()
    const cached = await cacheManager.get(cacheKey)
    
    if (cached) {
      // Log cache hit
      await logCompilationMetric({
        modelId,
        cacheHit: true,
        blockCount: modelJson.sheets.flatMap(s => s.blocks).length,
        optimizationLevel
      })
      
      return NextResponse.json({
        cacheKey,
        wasmUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/wasm-cache/${cacheKey}.wasm`,
        jsUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/wasm-cache/${cacheKey}.js`,
        compilationTime: cached.metadata.compilationTime,
        cacheHit: true
      })
    }
    
    // 3. Compile
    const startTime = Date.now()
    
    const { sourceCode, headerCode, wasmInterface } = generateCCode(modelJson)
    const { wasmData, jsData } = await compileToWasm(
      sourceCode,
      headerCode,
      wasmInterface,
      { optimizationLevel }
    )
    
    const compilationTime = Date.now() - startTime
    
    // 4. Store in cache
    await cacheManager.store(cacheKey, modelId, wasmData, jsData, {
      modelHash: hashModel(modelJson),
      compilationTime,
      optimizationLevel,
      wasmSize: wasmData.length,
      jsSize: jsData.length,
      blockCount: modelJson.sheets.flatMap(s => s.blocks).length
    })
    
    // 5. Log compilation
    await logCompilationMetric({
      modelId,
      cacheHit: false,
      compilationTime,
      blockCount: modelJson.sheets.flatMap(s => s.blocks).length,
      optimizationLevel
    })
    
    return NextResponse.json({
      cacheKey,
      wasmUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/wasm-cache/${cacheKey}.wasm`,
      jsUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/wasm-cache/${cacheKey}.js`,
      compilationTime,
      cacheHit: false
    })
    
  } catch (error) {
    console.error('Compilation error:', error)
    
    // Log error
    await logCompilationMetric({
      modelId: request.json().then(j => j.modelId),
      cacheHit: false,
      blockCount: 0,
      optimizationLevel: 'O2',
      error: error.message
    })
    
    return NextResponse.json(
      { error: 'Compilation failed', details: error.message },
      { status: 500 }
    )
  }
}
```

## Cache Cleanup Job

Use Supabase Edge Functions for scheduled cleanup:

```typescript
// supabase/functions/cleanup-wasm-cache/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  
  // Delete entries older than 30 days
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 30)
  
  const { data: oldEntries } = await supabase
    .from('wasm_cache_metadata')
    .select('cache_key')
    .lt('last_accessed_at', cutoffDate.toISOString())
  
  if (oldEntries && oldEntries.length > 0) {
    // Delete from storage
    for (const entry of oldEntries) {
      await supabase.storage
        .from('wasm-cache')
        .remove([`${entry.cache_key}.wasm`, `${entry.cache_key}.js`])
    }
    
    // Delete metadata
    await supabase
      .from('wasm_cache_metadata')
      .delete()
      .lt('last_accessed_at', cutoffDate.toISOString())
    
    return new Response(
      JSON.stringify({ deleted: oldEntries.length }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }
  
  return new Response(
    JSON.stringify({ deleted: 0 }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
```

**Schedule in Supabase:**
```sql
-- Create a pg_cron job to run daily
SELECT cron.schedule(
  'cleanup-wasm-cache',
  '0 2 * * *', -- 2 AM daily
  $$
  SELECT net.http_post(
    url:='https://your-project.supabase.co/functions/v1/cleanup-wasm-cache',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb
  ) AS request_id;
  $$
);
```

## Browser-Side Caching (Optional)

For frequently used models, cache in IndexedDB:

```typescript
// lib/cache/BrowserCacheManager.ts

export class BrowserCacheManager {
  private db: IDBDatabase | null = null
  private readonly DB_NAME = 'obliq-wasm-cache'
  private readonly STORE_NAME = 'modules'
  
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 1)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: 'cacheKey' })
        }
      }
    })
  }
  
  async get(cacheKey: string): Promise<{ wasm: ArrayBuffer; js: string } | null> {
    if (!this.db) await this.init()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readonly')
      const store = transaction.objectStore(this.STORE_NAME)
      const request = store.get(cacheKey)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        if (request.result) {
          resolve({
            wasm: request.result.wasm,
            js: request.result.js
          })
        } else {
          resolve(null)
        }
      }
    })
  }
  
  async store(cacheKey: string, wasm: ArrayBuffer, js: string): Promise<void> {
    if (!this.db) await this.init()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite')
      const store = transaction.objectStore(this.STORE_NAME)
      const request = store.put({
        cacheKey,
        wasm,
        js,
        timestamp: Date.now()
      })
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
}
```

## Performance Optimizations

### 1. Signed URLs for Faster Access

```typescript
// Generate signed URL for faster direct access (bypasses RLS)
const { data: signedUrl } = await supabase.storage
  .from('wasm-cache')
  .createSignedUrl(`${cacheKey}.wasm`, 3600) // 1 hour expiry

// Client can download directly without authentication
const response = await fetch(signedUrl.signedUrl)
const wasmData = await response.arrayBuffer()
```

### 2. CDN Caching

Configure Supabase Storage with CDN:
- Set aggressive cache headers (1 hour+)
- Files are immutable (content-addressed by hash)
- Cache at edge locations for global performance

### 3. Parallel Downloads

```typescript
// Download Wasm and JS in parallel
const [wasmResponse, jsResponse] = await Promise.all([
  fetch(wasmUrl),
  fetch(jsUrl)
])

const [wasmData, jsData] = await Promise.all([
  wasmResponse.arrayBuffer(),
  jsResponse.text()
])
```

## Monitoring and Analytics

### Cache Hit Rate Dashboard

```sql
-- Daily cache hit rate
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_requests,
  SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) as cache_hits,
  ROUND(100.0 * SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) / COUNT(*), 2) as hit_rate
FROM wasm_compilation_metrics
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Storage Usage

```sql
-- Total storage used by cache
SELECT 
  COUNT(*) as total_entries,
  ROUND(SUM(wasm_size_bytes + js_size_bytes) / 1024.0 / 1024.0, 2) as total_mb,
  ROUND(AVG(wasm_size_bytes) / 1024.0, 2) as avg_wasm_kb,
  ROUND(AVG(compilation_time_ms), 0) as avg_compile_ms
FROM wasm_cache_metadata;
```

### Most Accessed Models

```sql
-- Top 10 most accessed cache entries
SELECT 
  cache_key,
  model_id,
  access_count,
  ROUND(wasm_size_bytes / 1024.0, 2) as wasm_kb,
  last_accessed_at
FROM wasm_cache_metadata
ORDER BY access_count DESC
LIMIT 10;
```

## Cost Analysis

### Supabase Storage Pricing (as of 2024)
- **Storage:** $0.021/GB/month
- **Egress:** $0.09/GB
- **Free Tier:** 1GB storage, 2GB egress

### Estimated Costs

**Assumptions:**
- Average Wasm module: 200KB
- Average JS glue: 50KB
- 1000 unique models cached
- 10,000 cache hits/month

**Storage Cost:**
- Total storage: 250MB
- Cost: $0.021 * 0.25 = **$0.005/month**

**Egress Cost:**
- Cache hits: 10,000 * 250KB = 2.5GB
- Cost: $0.09 * 2.5 = **$0.225/month**

**Total: ~$0.23/month** (well within free tier)

## Migration from Local/Redis Cache

1. **Export existing cache** (if any)
2. **Upload to Supabase Storage**
3. **Populate metadata table**
4. **Update API to use SupabaseCacheManager**
5. **Remove old cache infrastructure**

## Backup and Disaster Recovery

- Supabase automatically backs up storage
- Point-in-time recovery available
- Cache can be rebuilt from scratch if lost (deterministic compilation)
- Consider periodic exports of frequently-used modules

## Conclusion

Supabase Storage provides:
- **Scalability**: Handles storage and bandwidth automatically
- **Security**: Built-in RLS and authentication
- **Performance**: CDN-backed, global distribution
- **Cost-effective**: Pay only for what you use
- **Simplicity**: No separate cache service to manage
- **Reliability**: Automatic backups and redundancy

This architecture eliminates the need for Redis while providing better scalability and easier management.

/**
 * Supabase Cache Manager for WASM Modules
 *
 * Handles storage and retrieval of compiled WASM modules using Supabase Storage.
 * Provides caching to minimize compilation time and improve performance.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

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

export interface CacheStats {
  totalEntries: number
  totalSizeMB: number
  avgCompilationTime: number
  cacheHitRate: number
}

/**
 * Manager for WASM cache operations using Supabase Storage and PostgreSQL
 */
export class SupabaseCacheManager {
  private supabase: SupabaseClient
  private bucket = 'wasm-cache'

  /**
   * Create a new cache manager
   *
   * @param supabaseUrl - Supabase project URL (optional, falls back to env)
   * @param supabaseKey - Supabase service role key (optional, falls back to env)
   */
  constructor(supabaseUrl?: string, supabaseKey?: string) {
    const url = supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      throw new Error(
        'Supabase URL and Service Role Key are required. ' +
        'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
      )
    }

    this.supabase = createClient(url, key)
  }

  /**
   * Retrieve a cached WASM module
   *
   * @param cacheKey - The cache key to look up
   * @returns The cached module or null if not found
   */
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

      // 2. Download WASM file
      const { data: wasmData, error: wasmError } = await this.supabase.storage
        .from(this.bucket)
        .download(`${cacheKey}.wasm`)

      if (wasmError) {
        console.error('Failed to download WASM:', wasmError)
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

  /**
   * Store a compiled WASM module in the cache
   *
   * @param cacheKey - The cache key
   * @param modelId - The model UUID
   * @param wasmData - Compiled WASM binary
   * @param jsData - Emscripten JS glue code
   * @param metadata - Compilation metadata
   */
  async store(
    cacheKey: string,
    modelId: string,
    wasmData: Buffer,
    jsData: Buffer,
    metadata: CacheMetadata
  ): Promise<void> {
    try {
      // 1. Upload WASM file
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

  /**
   * Check if a cache entry exists
   *
   * @param cacheKey - The cache key to check
   * @returns True if the entry exists
   */
  async exists(cacheKey: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('wasm_cache_metadata')
      .select('cache_key')
      .eq('cache_key', cacheKey)
      .single()

    return !error && !!data
  }

  /**
   * Get metadata for a cached entry without downloading the files
   *
   * @param cacheKey - The cache key
   * @returns Metadata or null if not found
   */
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

  /**
   * Get signed URLs for direct download (bypasses RLS)
   *
   * @param cacheKey - The cache key
   * @param expiresIn - Expiration time in seconds (default: 1 hour)
   * @returns Signed URLs for WASM and JS files
   */
  async getSignedUrls(
    cacheKey: string,
    expiresIn: number = 3600
  ): Promise<{ wasmUrl: string; jsUrl: string } | null> {
    try {
      const { data: wasmUrl, error: wasmError } = await this.supabase.storage
        .from(this.bucket)
        .createSignedUrl(`${cacheKey}.wasm`, expiresIn)

      const { data: jsUrl, error: jsError } = await this.supabase.storage
        .from(this.bucket)
        .createSignedUrl(`${cacheKey}.js`, expiresIn)

      if (wasmError || jsError || !wasmUrl || !jsUrl) {
        return null
      }

      return {
        wasmUrl: wasmUrl.signedUrl,
        jsUrl: jsUrl.signedUrl
      }
    } catch (error) {
      console.error('Error creating signed URLs:', error)
      return null
    }
  }

  /**
   * Update access metrics for a cache entry
   *
   * @param cacheKey - The cache key
   */
  private async updateAccessMetrics(cacheKey: string): Promise<void> {
    try {
      await this.supabase.rpc('increment_access_count', {
        cache_key_param: cacheKey
      })
    } catch (error) {
      // Don't fail the whole operation if metrics update fails
      console.warn('Failed to update access metrics:', error)
    }
  }

  /**
   * Clean up old cache entries
   *
   * @param daysOld - Age threshold in days (default: 30)
   * @returns Number of entries deleted
   */
  async cleanupOldEntries(daysOld: number = 30): Promise<number> {
    try {
      const { data, error } = await this.supabase.rpc('cleanup_old_wasm_cache', {
        days_old: daysOld
      })

      if (error) throw error

      return data?.[0]?.deleted_count || 0
    } catch (error) {
      console.error('Cleanup error:', error)
      return 0
    }
  }

  /**
   * Get cache statistics
   *
   * @returns Aggregated cache statistics
   */
  async getCacheStats(): Promise<CacheStats> {
    try {
      // Get metadata stats
      const { data: metadata } = await this.supabase
        .from('wasm_cache_metadata')
        .select('wasm_size_bytes, js_size_bytes, compilation_time_ms')

      // Get metrics from last 24 hours
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: metrics } = await this.supabase
        .from('wasm_compilation_metrics')
        .select('cache_hit')
        .gte('created_at', cutoff)

      const totalSize =
        metadata?.reduce(
          (sum, m) => sum + m.wasm_size_bytes + m.js_size_bytes,
          0
        ) || 0

      const avgTime =
        metadata?.reduce((sum, m) => sum + m.compilation_time_ms, 0) /
          (metadata?.length || 1) || 0

      const cacheHits = metrics?.filter(m => m.cache_hit).length || 0
      const totalRequests = metrics?.length || 1

      return {
        totalEntries: metadata?.length || 0,
        totalSizeMB: totalSize / 1024 / 1024,
        avgCompilationTime: avgTime,
        cacheHitRate: (cacheHits / totalRequests) * 100
      }
    } catch (error) {
      console.error('Error getting cache stats:', error)
      return {
        totalEntries: 0,
        totalSizeMB: 0,
        avgCompilationTime: 0,
        cacheHitRate: 0
      }
    }
  }

  /**
   * Log a compilation metric
   *
   * @param metric - The metric data to log
   */
  async logCompilationMetric(metric: {
    modelId: string
    userId?: string
    cacheHit: boolean
    compilationTime?: number
    blockCount: number
    optimizationLevel: string
    errorMessage?: string
    errorDetails?: any
  }): Promise<void> {
    try {
      await this.supabase.from('wasm_compilation_metrics').insert({
        model_id: metric.modelId,
        user_id: metric.userId || null,
        cache_hit: metric.cacheHit,
        compilation_time_ms: metric.compilationTime || null,
        block_count: metric.blockCount,
        optimization_level: metric.optimizationLevel,
        error_message: metric.errorMessage || null,
        error_details: metric.errorDetails || null
      })
    } catch (error) {
      console.warn('Failed to log compilation metric:', error)
    }
  }

  /**
   * Log a simulation performance metric
   *
   * @param metric - The metric data to log
   */
  async logSimulationMetric(metric: {
    modelId: string
    userId?: string
    cacheKey: string
    stepsExecuted: number
    totalTimeMs: number
    avgStepTimeUs: number
    peakMemoryMb?: number
    browserInfo?: any
  }): Promise<void> {
    try {
      await this.supabase.from('wasm_simulation_metrics').insert({
        model_id: metric.modelId,
        user_id: metric.userId || null,
        cache_key: metric.cacheKey,
        steps_executed: metric.stepsExecuted,
        total_time_ms: metric.totalTimeMs,
        avg_step_time_us: metric.avgStepTimeUs,
        peak_memory_mb: metric.peakMemoryMb || null,
        browser_info: metric.browserInfo || null
      })
    } catch (error) {
      console.warn('Failed to log simulation metric:', error)
    }
  }
}

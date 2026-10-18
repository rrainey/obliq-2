/**
 * File Cache Manager for WASM Modules
 *
 * Stores compiled modules under <OBLIQ_HOME>/cache/wasm/<cacheKey>/ with
 * metadata and metrics in SQLite. Drop-in replacement for the former
 * SupabaseCacheManager (same public methods, minus signed URLs).
 */

import * as fs from 'fs'
import * as path from 'path'
import { getStorage, type Storage } from '@/lib/server/storage'
import { writeFileAtomic } from '@/lib/server/storage/fileIO'

export interface CacheMetadata {
  modelHash: string
  compilationTime: number
  optimizationLevel: string
  enableSimd?: boolean
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

interface CacheRow {
  cache_key: string
  model_id: string
  model_hash: string
  optimization_level: string
  compilation_time_ms: number
  wasm_size_bytes: number
  js_size_bytes: number
  block_count: number
  created_at: string
  last_accessed_at: string
  access_count: number
}

function toMetadata(row: CacheRow): CacheMetadata {
  return {
    modelHash: row.model_hash,
    compilationTime: row.compilation_time_ms,
    optimizationLevel: row.optimization_level,
    wasmSize: row.wasm_size_bytes,
    jsSize: row.js_size_bytes,
    blockCount: row.block_count,
  }
}

export class FileCacheManager {
  constructor(private readonly storage: Storage = getStorage()) {}

  private get db() {
    return this.storage.db
  }

  private files(cacheKey: string) {
    const dir = this.storage.paths.wasmCacheEntryDir(cacheKey)
    return { dir, wasm: path.join(dir, 'module.wasm'), js: path.join(dir, 'module.js') }
  }

  private row(cacheKey: string): CacheRow | null {
    return (this.db.prepare('SELECT * FROM wasm_cache WHERE cache_key = ?').get(cacheKey) as CacheRow) ?? null
  }

  async get(cacheKey: string): Promise<CachedWasmModule | null> {
    try {
      const row = this.row(cacheKey)
      if (!row) return null
      const files = this.files(cacheKey)
      let wasmData: Buffer
      let jsData: Buffer
      try {
        wasmData = fs.readFileSync(files.wasm)
        jsData = fs.readFileSync(files.js)
      } catch {
        // Metadata without files (e.g. cache dir was cleared by hand): drop the stale row.
        this.db.prepare('DELETE FROM wasm_cache WHERE cache_key = ?').run(cacheKey)
        return null
      }
      this.db
        .prepare('UPDATE wasm_cache SET access_count = access_count + 1, last_accessed_at = ? WHERE cache_key = ?')
        .run(new Date().toISOString(), cacheKey)
      return { wasmData, jsData, metadata: toMetadata(row) }
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
    const files = this.files(cacheKey)
    writeFileAtomic(files.wasm, wasmData)
    writeFileAtomic(files.js, jsData)
    const timestamp = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO wasm_cache (cache_key, model_id, model_hash, optimization_level, compilation_time_ms,
                                 wasm_size_bytes, js_size_bytes, block_count, created_at, last_accessed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           model_id = excluded.model_id, model_hash = excluded.model_hash,
           optimization_level = excluded.optimization_level,
           compilation_time_ms = excluded.compilation_time_ms,
           wasm_size_bytes = excluded.wasm_size_bytes, js_size_bytes = excluded.js_size_bytes,
           block_count = excluded.block_count, created_at = excluded.created_at,
           last_accessed_at = excluded.last_accessed_at`
      )
      .run(cacheKey, modelId, metadata.modelHash, metadata.optimizationLevel, metadata.compilationTime,
           metadata.wasmSize, metadata.jsSize, metadata.blockCount, timestamp, timestamp)
  }

  async exists(cacheKey: string): Promise<boolean> {
    return this.row(cacheKey) !== null
  }

  async getMetadata(cacheKey: string): Promise<CacheMetadata | null> {
    const row = this.row(cacheKey)
    return row ? toMetadata(row) : null
  }

  async cleanupOldEntries(daysOld: number = 30): Promise<number> {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString()
    const keys = this.db
      .prepare('SELECT cache_key FROM wasm_cache WHERE last_accessed_at < ?')
      .all(cutoff) as Array<{ cache_key: string }>
    for (const { cache_key } of keys) await this.delete(cache_key)
    return keys.length
  }

  /** Evict least-recently-used entries until both limits are satisfied. */
  async evictLRU(maxEntries: number = 1000, maxSizeMB: number = 500): Promise<number> {
    const rows = this.db
      .prepare('SELECT cache_key, wasm_size_bytes, js_size_bytes FROM wasm_cache ORDER BY last_accessed_at ASC, created_at ASC')
      .all() as Array<Pick<CacheRow, 'cache_key' | 'wasm_size_bytes' | 'js_size_bytes'>>
    const maxBytes = maxSizeMB * 1024 * 1024
    let count = rows.length
    let totalBytes = rows.reduce((sum, r) => sum + r.wasm_size_bytes + r.js_size_bytes, 0)
    let evicted = 0
    for (const r of rows) {
      if (count <= maxEntries && totalBytes <= maxBytes) break
      await this.delete(r.cache_key)
      count--
      totalBytes -= r.wasm_size_bytes + r.js_size_bytes
      evicted++
    }
    return evicted
  }

  async delete(cacheKey: string): Promise<void> {
    fs.rmSync(this.files(cacheKey).dir, { recursive: true, force: true })
    this.db.prepare('DELETE FROM wasm_cache WHERE cache_key = ?').run(cacheKey)
  }

  async getCacheStats(): Promise<CacheStats> {
    const agg = this.db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(wasm_size_bytes + js_size_bytes), 0) AS bytes,
                COALESCE(AVG(compilation_time_ms), 0) AS avg_ms
         FROM wasm_cache`
      )
      .get() as { n: number; bytes: number; avg_ms: number }
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const hits = this.db
      .prepare('SELECT COUNT(*) AS total, COALESCE(SUM(cache_hit), 0) AS hits FROM wasm_compilation_metrics WHERE created_at >= ?')
      .get(cutoff) as { total: number; hits: number }
    return {
      totalEntries: agg.n,
      totalSizeMB: Math.round((agg.bytes / 1024 / 1024) * 100) / 100,
      avgCompilationTime: Math.round(agg.avg_ms),
      cacheHitRate: hits.total > 0 ? hits.hits / hits.total : 0,
    }
  }

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
      this.db
        .prepare(
          `INSERT INTO wasm_compilation_metrics (model_id, cache_hit, compilation_time_ms, block_count,
                                                 optimization_level, error_message, error_details, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(metric.modelId, metric.cacheHit ? 1 : 0, metric.compilationTime ?? null, metric.blockCount,
             metric.optimizationLevel, metric.errorMessage ?? null,
             metric.errorDetails != null ? JSON.stringify(metric.errorDetails) : null, new Date().toISOString())
    } catch (error) {
      console.warn('Failed to log compilation metric:', error)
    }
  }

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
      this.db
        .prepare(
          `INSERT INTO wasm_simulation_metrics (model_id, cache_key, steps_executed, total_time_ms,
                                                avg_step_time_us, peak_memory_mb, browser_info, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(metric.modelId, metric.cacheKey, metric.stepsExecuted, metric.totalTimeMs, metric.avgStepTimeUs,
             metric.peakMemoryMb ?? null, metric.browserInfo != null ? JSON.stringify(metric.browserInfo) : null,
             new Date().toISOString())
    } catch (error) {
      console.warn('Failed to log simulation metric:', error)
    }
  }
}

/**
 * Cache Maintenance API
 *
 * Endpoint: POST /api/cache-maintenance
 *
 * Performs periodic cache maintenance:
 * - LRU eviction to keep cache size under limits
 * - Cleanup of old entries
 *
 * This endpoint should be called periodically (e.g., via cron job)
 *
 * Request body (optional):
 * {
 *   maxEntries?: number,     // Maximum cache entries (default: 1000)
 *   maxSizeMB?: number,      // Maximum cache size in MB (default: 500)
 *   daysOld?: number         // Delete entries older than this (default: 30)
 * }
 *
 * Response:
 * - 200: { lruEvicted: number, oldEntriesDeleted: number, totalEvicted: number }
 * - 401: Unauthorized (requires valid API key)
 * - 500: Maintenance failed
 */

import { NextRequest, NextResponse } from 'next/server'
import { SupabaseCacheManager } from '@/lib/wasm/cache'

// Simple API key authentication for cron jobs
// In production, use a proper secret management system
const MAINTENANCE_API_KEY = process.env.CACHE_MAINTENANCE_API_KEY

export async function POST(request: NextRequest) {
  try {
    // Verify API key for security
    const apiKey = request.headers.get('x-api-key')
    if (MAINTENANCE_API_KEY && apiKey !== MAINTENANCE_API_KEY) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body (optional parameters)
    let maxEntries = 1000
    let maxSizeMB = 500
    let daysOld = 30

    try {
      const body = await request.json()
      if (body.maxEntries !== undefined) maxEntries = body.maxEntries
      if (body.maxSizeMB !== undefined) maxSizeMB = body.maxSizeMB
      if (body.daysOld !== undefined) daysOld = body.daysOld
    } catch {
      // Body is optional, use defaults
    }

    console.log(`[cache-maintenance] Starting maintenance...`)
    console.log(`[cache-maintenance] Parameters: maxEntries=${maxEntries}, maxSizeMB=${maxSizeMB}, daysOld=${daysOld}`)

    const cacheManager = new SupabaseCacheManager()

    // 1. Run LRU eviction
    console.log(`[cache-maintenance] Running LRU eviction...`)
    const lruEvicted = await cacheManager.evictLRU(maxEntries, maxSizeMB)
    console.log(`[cache-maintenance] LRU evicted ${lruEvicted} entries`)

    // 2. Clean up old entries
    console.log(`[cache-maintenance] Cleaning up entries older than ${daysOld} days...`)
    const oldEntriesDeleted = await cacheManager.cleanupOldEntries(daysOld)
    console.log(`[cache-maintenance] Deleted ${oldEntriesDeleted} old entries`)

    const totalEvicted = lruEvicted + oldEntriesDeleted

    console.log(`[cache-maintenance] Maintenance complete: ${totalEvicted} total entries removed`)

    return NextResponse.json({
      success: true,
      lruEvicted,
      oldEntriesDeleted,
      totalEvicted,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[cache-maintenance] Maintenance failed:', error)
    return NextResponse.json(
      {
        error: 'Cache maintenance failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

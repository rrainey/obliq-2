/**
 * Cache Maintenance API
 *
 * Endpoint: POST /api/cache-maintenance
 *
 * Performs periodic cache maintenance:
 * - LRU eviction to keep cache size under limits
 * - Cleanup of old entries
 *
 * Authentication is always necessary. The route accepts one of these:
 * - `Authorization: Bearer <api token>` or the local session cookie, as the
 *   other routes do (authenticateRequest)
 * - `x-api-key: <key>`, when the environment variable
 *   CACHE_MAINTENANCE_API_KEY is set and the key is the same. This is for a
 *   scheduled job that has no API token.
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
 * - 400: A body value is not a number of zero or more
 * - 401: Not authenticated
 * - 500: Maintenance failed
 */

import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { FileCacheManager } from '@/lib/wasm/cache'
import { authenticateRequest } from '@/lib/apiAuthMiddleware'

export const runtime = 'nodejs'

/** True when the request has the maintenance key of the environment. */
function hasMaintenanceKey(request: NextRequest): boolean {
  // Read at request time, so that a test or a restart-free change applies
  const expected = process.env.CACHE_MAINTENANCE_API_KEY
  const given = request.headers.get('x-api-key')
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  try {
    // Authentication is always necessary: this route deletes cache entries
    if (!hasMaintenanceKey(request) && !(await authenticateRequest(request)).authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body (optional parameters)
    let maxEntries = 1000
    let maxSizeMB = 500
    let daysOld = 30

    let body: Record<string, unknown> = {}
    try {
      body = (await request.json()) ?? {}
    } catch {
      // Body is optional, use defaults
    }
    for (const key of ['maxEntries', 'maxSizeMB', 'daysOld'] as const) {
      const value = body[key]
      if (value === undefined) continue
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return NextResponse.json(
          { error: `${key} must be a number of zero or more` },
          { status: 400 }
        )
      }
      if (key === 'maxEntries') maxEntries = value
      else if (key === 'maxSizeMB') maxSizeMB = value
      else daysOld = value
    }

    console.log(`[cache-maintenance] Starting maintenance...`)
    console.log(`[cache-maintenance] Parameters: maxEntries=${maxEntries}, maxSizeMB=${maxSizeMB}, daysOld=${daysOld}`)

    const cacheManager = new FileCacheManager()

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

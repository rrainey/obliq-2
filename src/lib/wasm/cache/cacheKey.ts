/**
 * Cache Key Generation for WASM Modules
 *
 * Generates deterministic cache keys based on model structure and compilation options.
 * Cache keys are content-addressed to ensure identical models produce identical keys.
 */

import crypto from 'crypto'
import type { Sheet } from '@/types/canvas'

/**
 * Code generation version - increment this to invalidate all cached WASM modules
 * when code generation logic changes in a way that affects the output.
 *
 * History:
 * - v1: Initial implementation
 * - v2: Added Signal Display block support to output mapping
 * - v3: Fixed block name sanitization for logger/display outputs
 * - v4: Internal data collection with malloc/free for Signal Logger and Display blocks
 * - v5: Fixed cleanup function generation (conditional based on data collectors)
 * - v6: Fixed cleanup function synchronization by checking actual generated header
 * - v7: Added data collection functions and wasm_cleanup to EXPORTED_FUNCTIONS
 * - v8: Added debug logging to diagnose cleanup function generation mismatch
 * - v9: Added detailed block-level logging to identify mismatch cause
 * - v10: Fixed CleanupFunctionGenerator to use correct BlockModuleFactory.getBlockModule() method
 */
const CODEGEN_VERSION = 'v10'

export interface ModelStructure {
  sheets: Sheet[]
}

export interface CacheKeyOptions {
  optimizationLevel?: 'O0' | 'O1' | 'O2' | 'O3'
  includeDebugInfo?: boolean
}

/**
 * Generate a deterministic cache key for a model
 *
 * @param modelId - Unique identifier for the model
 * @param model - The model structure (sheets with blocks and connections)
 * @param options - Compilation options that affect the generated code
 * @returns A unique cache key string
 */
export function generateCacheKey(
  modelId: string,
  model: ModelStructure,
  options: CacheKeyOptions = {}
): string {
  const { optimizationLevel = 'O2', includeDebugInfo = false } = options

  const hash = hashModel(model)
  const debugSuffix = includeDebugInfo ? '-debug' : ''

  return `${CODEGEN_VERSION}-${modelId}-${hash}-${optimizationLevel}${debugSuffix}`
}

/**
 * Hash a model structure to create a content-addressed identifier
 *
 * This function:
 * 1. Extracts only structure-relevant data (blocks, connections, parameters)
 * 2. Sorts keys to ensure deterministic JSON serialization
 * 3. Generates a SHA-256 hash
 * 4. Returns the first 16 characters for brevity
 *
 * @param model - The model structure to hash
 * @returns A 16-character hex hash
 */
export function hashModel(model: ModelStructure): string {
  // Extract only structure-relevant data
  // Ignore UI-specific properties like positions, colors, etc.
  const relevantData = {
    blocks: model.sheets.flatMap(sheet =>
      sheet.blocks.map(block => ({
        id: block.id,
        type: block.type,
        name: block.name,
        parameters: block.parameters || {}
      }))
    ),
    connections: model.sheets.flatMap(sheet =>
      sheet.connections.map(conn => ({
        id: conn.id,
        source: conn.source,
        sourcePortIndex: conn.sourcePortIndex,
        target: conn.target,
        targetPortIndex: conn.targetPortIndex
      }))
    )
  }

  // Sort object keys to ensure deterministic JSON stringification
  const sortedKeys = Object.keys(relevantData).sort()
  const sortedData: any = {}
  sortedKeys.forEach(key => {
    sortedData[key] = relevantData[key as keyof typeof relevantData]
  })

  // Generate JSON string with sorted keys
  const jsonStr = JSON.stringify(sortedData, (key, value) => {
    // For objects, sort their keys
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sortedObj: any = {}
      Object.keys(value).sort().forEach(k => {
        sortedObj[k] = value[k]
      })
      return sortedObj
    }
    return value
  })

  // Create hash
  const hash = crypto
    .createHash('sha256')
    .update(jsonStr)
    .digest('hex')

  // Return first 16 characters for brevity while maintaining uniqueness
  return hash.substring(0, 16)
}

/**
 * Validate a cache key format
 *
 * @param cacheKey - The cache key to validate
 * @returns True if the cache key has valid format
 */
export function isValidCacheKey(cacheKey: string): boolean {
  // Format: {version}-{modelId}-{hash}-{opt}[-debug]
  // Example: v2-550e8400-e29b-41d4-a716-446655440000-a1b2c3d4e5f67890-O2
  // Example: v2-test-model-id-0123456789abcdef-O0
  const pattern = /^v\d+-.+-[a-f0-9]{16}-O[0-3](-debug)?$/
  return pattern.test(cacheKey)
}

/**
 * Parse a cache key into its components
 *
 * @param cacheKey - The cache key to parse
 * @returns Parsed components or null if invalid
 */
export function parseCacheKey(cacheKey: string): {
  version: string
  modelId: string
  hash: string
  optimizationLevel: string
  debugInfo: boolean
} | null {
  if (!isValidCacheKey(cacheKey)) {
    return null
  }

  const parts = cacheKey.split('-')
  const debugInfo = cacheKey.endsWith('-debug')
  const version = parts[0] // v1, v2, etc.

  // Format with debug: version-modelId-hash-opt-debug
  // Format without: version-modelId-hash-opt
  if (debugInfo) {
    const optLevel = parts[parts.length - 2] // O2, O3, etc.
    const hash = parts[parts.length - 3] // 16-char hex
    const modelId = parts.slice(1, -3).join('-')
    return { version, modelId, hash, optimizationLevel: optLevel, debugInfo: true }
  } else {
    const optLevel = parts[parts.length - 1]
    const hash = parts[parts.length - 2]
    const modelId = parts.slice(1, -2).join('-')
    return { version, modelId, hash, optimizationLevel: optLevel, debugInfo: false }
  }
}

/**
 * Generate a short cache key for display purposes
 *
 * @param cacheKey - The full cache key
 * @returns Shortened version for display
 */
export function shortCacheKey(cacheKey: string): string {
  const parsed = parseCacheKey(cacheKey)
  if (!parsed) return cacheKey

  return `${parsed.hash.substring(0, 8)}...${parsed.optimizationLevel}`
}

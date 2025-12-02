/**
 * Cache Key Generation for WASM Modules
 *
 * Generates deterministic cache keys based on model structure and compilation options.
 * Cache keys are content-addressed to ensure identical models produce identical keys.
 */

import crypto from 'crypto'
import type { Sheet } from '@/lib/simulationEngine'

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
 * - v11: Added vector/matrix support - wasm_get_element_size function for non-scalar signals
 * - v12: Fixed wasm_get_samples() pointer cast and wasm_get_output() to work with vectors
 * - v13: Fixed TransferFunctionBlockModule to use inputTypes parameter for vector/matrix support
 * - v14: Fixed RK4Generator to use typeMap for correct vector/matrix type propagation in derivatives
 * - v15: Fixed StateIntegrator to use typeMap for correct vector/matrix RK4 integration
 * - v16: Fixed wasm_get_output() to filter out vector/matrix outputs (only supports scalars)
 * - v17: Phase 3 Performance Optimizations (reverted due to breaking data collection)
 * - v18: Fixed UTF8ToString export for collector name string conversion
 * - v19: Reverted Phase 3 optimization flags that broke data collection
 * - v20: Debug fresh compile to investigate zeros in vector sample collection
 * - v21: Fixed InitFunctionGenerator to use typeMap for correct vector buffer allocation
 * - v22: Added debug logging to InitFunctionGenerator to verify typeMap usage
 * - v23: Force fresh compile after server restart
 * - v24: Added generate() entry point logging to InitFunctionGenerator
 * - v25: Fixed getModuleGenerator -> getBlockModule typo in InitFunctionGenerator
 * - v26: Added use_rk4 field to model struct and initialized it to 1 (RK4)
 * - v27: Removed spurious evaluate_algebraic calls from RK4 substeps that caused extra sample storage
 * - v28: Added SIMD optimization support (-msimd128 flag)
 */
const CODEGEN_VERSION = 'v28'

export interface ModelStructure {
  sheets: Sheet[]
}

export interface CacheKeyOptions {
  optimizationLevel?: 'O0' | 'O1' | 'O2' | 'O3'
  includeDebugInfo?: boolean
  enableSimd?: boolean
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
  const { optimizationLevel = 'O2', includeDebugInfo = false, enableSimd = false } = options

  const hash = hashModel(model)
  const debugSuffix = includeDebugInfo ? '-debug' : ''
  const simdSuffix = enableSimd ? '-simd' : ''

  return `${CODEGEN_VERSION}-${modelId}-${hash}-${optimizationLevel}${simdSuffix}${debugSuffix}`
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
        sourceBlockId: conn.sourceBlockId,
        sourcePortIndex: conn.sourcePortIndex,
        targetBlockId: conn.targetBlockId,
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
  // Format: {version}-{modelId}-{hash}-{opt}[-simd][-debug]
  // Example: v28-550e8400-e29b-41d4-a716-446655440000-a1b2c3d4e5f67890-O2
  // Example: v28-test-model-id-0123456789abcdef-O2-simd
  // Example: v28-test-model-id-0123456789abcdef-O0-simd-debug
  const pattern = /^v\d+-.+-[a-f0-9]{16}-O[0-3](-simd)?(-debug)?$/
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
  enableSimd: boolean
  debugInfo: boolean
} | null {
  if (!isValidCacheKey(cacheKey)) {
    return null
  }

  const parts = cacheKey.split('-')
  const debugInfo = cacheKey.endsWith('-debug')
  const enableSimd = cacheKey.includes('-simd')
  const version = parts[0] // v1, v2, etc.

  // Calculate suffix count to determine where modelId ends
  let suffixCount = 2 // hash, opt level
  if (enableSimd) suffixCount++
  if (debugInfo) suffixCount++

  // Extract components from the end
  const hash = parts[parts.length - suffixCount]
  const optLevel = parts[parts.length - suffixCount + 1]
  const modelId = parts.slice(1, parts.length - suffixCount).join('-')

  return { version, modelId, hash, optimizationLevel: optLevel, enableSimd, debugInfo }
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

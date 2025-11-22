/**
 * WASM Cache Module
 *
 * Exports cache management utilities for compiled WebAssembly modules.
 */

export { SupabaseCacheManager } from './SupabaseCacheManager'
export type { CacheMetadata, CachedWasmModule, CacheStats } from './SupabaseCacheManager'

export {
  generateCacheKey,
  hashModel,
  isValidCacheKey,
  parseCacheKey,
  shortCacheKey
} from './cacheKey'
export type { ModelStructure, CacheKeyOptions } from './cacheKey'

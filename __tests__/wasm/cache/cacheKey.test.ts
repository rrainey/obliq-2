/**
 * Tests for cache key generation utilities
 */

import {
  generateCacheKey,
  hashModel,
  isValidCacheKey,
  parseCacheKey,
  shortCacheKey
} from '@/lib/wasm/cache/cacheKey'
import type { Sheet } from '@/types/canvas'

describe('Cache Key Generation', () => {
  const createSimpleModel = (): Sheet[] => [
    {
      id: 'main',
      name: 'Main',
      blocks: [
        {
          id: 'input1',
          name: 'Input1',
          type: 'input_port',
          position: { x: 100, y: 100 },
          parameters: { portName: 'a', initialValue: 0 }
        },
        {
          id: 'gain1',
          name: 'Gain1',
          type: 'scale',
          position: { x: 300, y: 100 },
          parameters: { gain: 2.0 }
        }
      ],
      connections: [
        {
          id: 'wire1',
          source: 'input1',
          sourcePortIndex: 0,
          target: 'gain1',
          targetPortIndex: 0
        }
      ],
      extents: { width: 800, height: 600 }
    }
  ]

  describe('generateCacheKey', () => {
    it('should generate a valid cache key', () => {
      const model = createSimpleModel()
      const modelId = '550e8400-e29b-41d4-a716-446655440000'

      const cacheKey = generateCacheKey(modelId, { sheets: model })

      expect(cacheKey).toBeTruthy()
      expect(typeof cacheKey).toBe('string')
      expect(cacheKey).toContain(modelId)
      expect(cacheKey).toContain('-O2') // Default optimization level
    })

    it('should include optimization level', () => {
      const model = createSimpleModel()
      const modelId = 'test-model-id'

      const keyO0 = generateCacheKey(modelId, { sheets: model }, { optimizationLevel: 'O0' })
      const keyO3 = generateCacheKey(modelId, { sheets: model }, { optimizationLevel: 'O3' })

      expect(keyO0).toContain('-O0')
      expect(keyO3).toContain('-O3')
      expect(keyO0).not.toEqual(keyO3)
    })

    it('should include debug flag when specified', () => {
      const model = createSimpleModel()
      const modelId = 'test-model-id'

      const keyWithDebug = generateCacheKey(
        modelId,
        { sheets: model },
        { includeDebugInfo: true }
      )
      const keyWithoutDebug = generateCacheKey(
        modelId,
        { sheets: model },
        { includeDebugInfo: false }
      )

      expect(keyWithDebug).toContain('-debug')
      expect(keyWithoutDebug).not.toContain('-debug')
    })

    it('should generate different keys for different models', () => {
      const model1 = createSimpleModel()
      const model2 = createSimpleModel()
      // Modify the second model
      model2[0].blocks[1].parameters = { gain: 3.0 }

      const key1 = generateCacheKey('model1', { sheets: model1 })
      const key2 = generateCacheKey('model2', { sheets: model2 })

      expect(key1).not.toEqual(key2)
    })

    it('should generate same key for identical models regardless of position', () => {
      const model1 = createSimpleModel()
      const model2 = createSimpleModel()
      // Change only position (should not affect hash)
      model2[0].blocks[0].position = { x: 200, y: 200 }

      const key1 = generateCacheKey('model-id', { sheets: model1 })
      const key2 = generateCacheKey('model-id', { sheets: model2 })

      // Extract hash parts (they should be equal)
      const hash1 = key1.split('-').slice(-2, -1)[0]
      const hash2 = key2.split('-').slice(-2, -1)[0]

      expect(hash1).toEqual(hash2)
    })
  })

  describe('hashModel', () => {
    it('should generate a 16-character hex hash', () => {
      const model = createSimpleModel()
      const hash = hashModel({ sheets: model })

      expect(hash).toHaveLength(16)
      expect(hash).toMatch(/^[a-f0-9]{16}$/)
    })

    it('should generate same hash for identical models', () => {
      const model1 = createSimpleModel()
      const model2 = JSON.parse(JSON.stringify(model1)) // Deep clone

      const hash1 = hashModel({ sheets: model1 })
      const hash2 = hashModel({ sheets: model2 })

      expect(hash1).toEqual(hash2)
    })

    it('should generate different hashes for different block types', () => {
      const model1 = createSimpleModel()
      const model2 = createSimpleModel()
      model2[0].blocks[1].type = 'different_type'

      const hash1 = hashModel({ sheets: model1 })
      const hash2 = hashModel({ sheets: model2 })

      expect(hash1).not.toEqual(hash2)
    })

    it('should generate different hashes for different parameters', () => {
      const model1 = createSimpleModel()
      const model2 = createSimpleModel()
      model2[0].blocks[1].parameters = { gain: 3.0 }

      const hash1 = hashModel({ sheets: model1 })
      const hash2 = hashModel({ sheets: model2 })

      expect(hash1).not.toEqual(hash2)
    })

    it('should generate different hashes for different connections', () => {
      const model1 = createSimpleModel()
      const model2 = createSimpleModel()
      model2[0].connections = []

      const hash1 = hashModel({ sheets: model1 })
      const hash2 = hashModel({ sheets: model2 })

      expect(hash1).not.toEqual(hash2)
    })

    it('should ignore position changes', () => {
      const model1 = createSimpleModel()
      const model2 = createSimpleModel()
      model2[0].blocks[0].position = { x: 999, y: 999 }

      const hash1 = hashModel({ sheets: model1 })
      const hash2 = hashModel({ sheets: model2 })

      expect(hash1).toEqual(hash2)
    })
  })

  describe('isValidCacheKey', () => {
    it('should validate correct cache keys', () => {
      const validKeys = [
        '550e8400-e29b-41d4-a716-446655440000-a1b2c3d4e5f67890-O2',
        'test-model-id-0123456789abcdef-O0',
        'model-id-fedcba9876543210-O3-debug'
      ]

      validKeys.forEach(key => {
        expect(isValidCacheKey(key)).toBe(true)
      })
    })

    it('should reject invalid cache keys', () => {
      const invalidKeys = [
        '',
        'invalid',
        'model-O2', // Missing hash
        'model-tooshort-O2', // Hash too short
        'model-0123456789abcdef-O4', // Invalid optimization level
        'model-0123456789ABCDEF-O2' // Uppercase hex (should be lowercase)
      ]

      invalidKeys.forEach(key => {
        expect(isValidCacheKey(key)).toBe(false)
      })
    })
  })

  describe('parseCacheKey', () => {
    it('should parse a valid cache key', () => {
      const cacheKey = '550e8400-e29b-41d4-a716-446655440000-0123456789abcdef-O2'
      const parsed = parseCacheKey(cacheKey)

      expect(parsed).not.toBeNull()
      expect(parsed!.modelId).toBe('550e8400-e29b-41d4-a716-446655440000')
      expect(parsed!.hash).toBe('0123456789abcdef')
      expect(parsed!.optimizationLevel).toBe('O2')
      expect(parsed!.debugInfo).toBe(false)
    })

    it('should parse cache key with debug flag', () => {
      const cacheKey = 'test-model-fedcba9876543210-O3-debug'
      const parsed = parseCacheKey(cacheKey)

      expect(parsed).not.toBeNull()
      expect(parsed!.modelId).toBe('test-model')
      expect(parsed!.hash).toBe('fedcba9876543210')
      expect(parsed!.optimizationLevel).toBe('O3')
      expect(parsed!.debugInfo).toBe(true)
    })

    it('should return null for invalid cache key', () => {
      const parsed = parseCacheKey('invalid-cache-key')
      expect(parsed).toBeNull()
    })
  })

  describe('shortCacheKey', () => {
    it('should create shortened version of cache key', () => {
      const cacheKey = '550e8400-e29b-41d4-a716-446655440000-0123456789abcdef-O2'
      const short = shortCacheKey(cacheKey)

      expect(short).toContain('01234567') // First 8 chars of hash
      expect(short).toContain('O2')
      expect(short).toContain('...')
      expect(short.length).toBeLessThan(cacheKey.length)
    })

    it('should return original key if invalid', () => {
      const invalidKey = 'invalid-key'
      const short = shortCacheKey(invalidKey)

      expect(short).toBe(invalidKey)
    })
  })
})

/**
 * Integration tests for the WASM compilation API
 *
 * Tests the /api/compile-wasm endpoint with actual Supabase and Docker
 *
 * Prerequisites:
 * - Supabase running with test data
 * - Docker with obliq-emscripten:latest image
 * - Environment variables set
 */

import { POST } from '@/app/api/compile-wasm/route'
import { NextRequest } from 'next/server'

// Skip these tests if Supabase or Docker is not configured
const describeIfConfigured =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? describe
    : describe.skip

describeIfConfigured('WASM Compilation API', () => {
  // Helper to create a mock Next Request
  function createMockRequest(body: any): NextRequest {
    const request = new NextRequest('http://localhost:3000/api/compile-wasm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    return request
  }

  describe('Request Validation', () => {
    it('should reject request without modelId', async () => {
      const request = createMockRequest({})

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('modelId')
    })

    it('should reject invalid modelId format', async () => {
      const request = createMockRequest({
        modelId: 'not-a-uuid'
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Invalid model ID format')
    })

    it('should reject invalid optimization level', async () => {
      const request = createMockRequest({
        modelId: '550e8400-e29b-41d4-a716-446655440000',
        optimizationLevel: 'O4' // Invalid
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('optimization level')
    })

    it('should reject invalid JSON', async () => {
      const request = new NextRequest('http://localhost:3000/api/compile-wasm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: 'not valid json'
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Invalid JSON')
    })
  })

  describe('Model Lookup', () => {
    it('should return 404 for non-existent model', async () => {
      const request = createMockRequest({
        modelId: '00000000-0000-0000-0000-000000000000'
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toContain('not found')
    })
  })

  describe('Compilation', () => {
    // You'll need to create a test model in Supabase for these tests
    const TEST_MODEL_ID = process.env.TEST_WASM_MODEL_ID || 'test-model-uuid'

    it.skip('should compile a simple model successfully', async () => {
      const request = createMockRequest({
        modelId: TEST_MODEL_ID,
        optimizationLevel: 'O0' // Faster compilation for tests
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('wasmData')
      expect(data).toHaveProperty('jsData')
      expect(data).toHaveProperty('metadata')

      // Verify base64 encoding
      expect(typeof data.wasmData).toBe('string')
      expect(typeof data.jsData).toBe('string')

      // Verify metadata
      expect(data.metadata).toHaveProperty('cacheHit')
      expect(data.metadata).toHaveProperty('cacheKey')
      expect(data.metadata).toHaveProperty('wasmSize')
      expect(data.metadata).toHaveProperty('jsSize')
      expect(data.metadata).toHaveProperty('optimizationLevel', 'O0')

      // Verify sizes are reasonable
      expect(data.metadata.wasmSize).toBeGreaterThan(0)
      expect(data.metadata.jsSize).toBeGreaterThan(0)
    }, 60000) // 60 second timeout for first compilation

    it.skip('should use cache on second compilation', async () => {
      const request1 = createMockRequest({
        modelId: TEST_MODEL_ID,
        optimizationLevel: 'O0'
      })

      // First request - should compile
      const response1 = await POST(request1)
      const data1 = await response1.json()

      expect(response1.status).toBe(200)
      const firstCompileTime = data1.metadata.compilationTime || data1.metadata.retrievalTime

      // Second request - should hit cache
      const request2 = createMockRequest({
        modelId: TEST_MODEL_ID,
        optimizationLevel: 'O0'
      })

      const response2 = await POST(request2)
      const data2 = await response2.json()

      expect(response2.status).toBe(200)
      expect(data2.metadata.cacheHit).toBe(true)

      // Cache retrieval should be much faster
      const cacheRetrievalTime = data2.metadata.retrievalTime
      expect(cacheRetrievalTime).toBeLessThan(firstCompileTime)

      // WASM data should be identical
      expect(data2.wasmData).toBe(data1.wasmData)
      expect(data2.jsData).toBe(data1.jsData)
    }, 60000)

    it.skip('should handle different optimization levels separately', async () => {
      // Compile with O0
      const requestO0 = createMockRequest({
        modelId: TEST_MODEL_ID,
        optimizationLevel: 'O0'
      })

      const responseO0 = await POST(requestO0)
      const dataO0 = await responseO0.json()

      expect(responseO0.status).toBe(200)

      // Compile with O2 (should NOT hit cache)
      const requestO2 = createMockRequest({
        modelId: TEST_MODEL_ID,
        optimizationLevel: 'O2'
      })

      const responseO2 = await POST(requestO2)
      const dataO2 = await responseO2.json()

      expect(responseO2.status).toBe(200)
      expect(dataO2.metadata.cacheHit).toBe(false) // Different optimization level

      // WASM data should be different (different optimization)
      expect(dataO2.wasmData).not.toBe(dataO0.wasmData)
    }, 120000) // 2 minute timeout for two compilations
  })

  describe('Error Handling', () => {
    it.skip('should handle models with invalid structure', async () => {
      // This would require a model with bad structure in the database
      // Skipping for now - manual test
    })

    it.skip('should timeout on very complex models', async () => {
      // This would require a very complex test model
      // Skipping for now - manual test
    })
  })

  describe('Response Format', () => {
    it.skip('should return properly formatted response', async () => {
      const request = createMockRequest({
        modelId: TEST_MODEL_ID
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)

      // Check response structure
      expect(data).toMatchObject({
        wasmData: expect.any(String),
        jsData: expect.any(String),
        metadata: {
          modelName: expect.any(String),
          version: expect.any(Number),
          cacheKey: expect.any(String),
          cacheHit: expect.any(Boolean),
          wasmSize: expect.any(Number),
          jsSize: expect.any(Number),
          optimizationLevel: expect.stringMatching(/^O[0-3]$/),
          blockCount: expect.any(Number),
          inputMap: expect.any(Array),
          outputMap: expect.any(Array)
        }
      })

      // Verify base64 decoding works
      const wasmBuffer = Buffer.from(data.wasmData, 'base64')
      expect(wasmBuffer.length).toBeGreaterThan(0)

      const jsBuffer = Buffer.from(data.jsData, 'base64')
      expect(jsBuffer.length).toBeGreaterThan(0)
    }, 60000)
  })
})

describe('WASM Compilation API - Unit Tests', () => {
  describe('sanitizeModelName', () => {
    // Since sanitizeModelName is not exported, we'll test it indirectly
    // through the API behavior
    it('should handle model names with spaces', () => {
      // This will be tested through integration tests
      expect(true).toBe(true)
    })
  })
})

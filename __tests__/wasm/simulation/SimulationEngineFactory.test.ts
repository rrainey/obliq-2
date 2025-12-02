/**
 * Tests for SimulationEngineFactory
 *
 * Tests the factory pattern for creating WASM simulation engines.
 * As of Phase 6, WASM is the only supported simulation engine.
 */

import {
  createSimulationEngine,
  getWasmPreference,
  setWasmPreference,
  isWasmAvailable,
  getEngineType,
  CreateEngineOptions
} from '@/lib/simulation/SimulationEngineFactory'
import { WasmSimulationEngine } from '@/lib/simulation/WasmSimulationEngine'

// Mock fetch for WASM tests
global.fetch = jest.fn()

describe('SimulationEngineFactory', () => {
  describe('Preference Management (Deprecated)', () => {
    it('should always return true for getWasmPreference', () => {
      // WASM is now always enabled
      expect(getWasmPreference()).toBe(true)
    })

    it('setWasmPreference should be a no-op', () => {
      // This should not throw and should log a message
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      setWasmPreference(false)
      expect(consoleSpy).toHaveBeenCalledWith(
        '[SimulationEngineFactory] WASM is now the only simulation engine'
      )
      consoleSpy.mockRestore()

      // Should still return true
      expect(getWasmPreference()).toBe(true)
    })
  })

  describe('WASM Availability', () => {
    it('should detect WebAssembly support', () => {
      const available = isWasmAvailable()
      // In Jest/Node environment, WebAssembly is available
      expect(available).toBe(true)
    })

    it('should return false on server-side', () => {
      const originalWindow = global.window
      // @ts-ignore
      delete global.window

      const available = isWasmAvailable()
      expect(available).toBe(false)

      global.window = originalWindow
    })
  })

  describe('Engine Type Detection', () => {
    it('should always return wasm for getEngineType', () => {
      const engine = new WasmSimulationEngine('test-model-id')
      const type = getEngineType(engine)
      expect(type).toBe('wasm')
    })
  })

  describe('Factory - WASM Engine Creation', () => {
    it('should create WASM engine with modelId', async () => {
      const options: CreateEngineOptions = {
        modelId: 'test-model-id',
        config: { timeStep: 0.01, duration: 1.0 }
      }

      // Mock the initialize method to avoid actual WASM compilation
      const mockInitialize = jest.fn().mockResolvedValue(undefined)
      WasmSimulationEngine.prototype.initialize = mockInitialize

      const engine = await createSimulationEngine(options)
      expect(engine).toBeInstanceOf(WasmSimulationEngine)
      expect(getEngineType(engine)).toBe('wasm')
      expect(mockInitialize).toHaveBeenCalledWith(0.01, {
        optimizationLevel: undefined
      })
    })

    it('should pass WASM options to engine', async () => {
      const options: CreateEngineOptions = {
        modelId: 'test-model-id',
        config: { timeStep: 0.02, duration: 1.0 },
        wasmOptions: {
          enableLeakDetection: true,
          memoryLimit: 1024 * 1024,
          optimizationLevel: 'O2'
        }
      }

      const mockInitialize = jest.fn().mockResolvedValue(undefined)
      WasmSimulationEngine.prototype.initialize = mockInitialize

      const engine = await createSimulationEngine(options)
      expect(engine).toBeInstanceOf(WasmSimulationEngine)
      expect(mockInitialize).toHaveBeenCalledWith(0.02, {
        optimizationLevel: 'O2'
      })
    })

    it('should use default timeStep when not provided', async () => {
      const options: CreateEngineOptions = {
        modelId: 'test-model-id'
      }

      const mockInitialize = jest.fn().mockResolvedValue(undefined)
      WasmSimulationEngine.prototype.initialize = mockInitialize

      await createSimulationEngine(options)
      expect(mockInitialize).toHaveBeenCalledWith(0.01, {
        optimizationLevel: undefined
      })
    })
  })
})

// Integration tests (require actual WASM compilation)
const describeIntegration =
  process.env.TEST_WASM_INTEGRATION === 'true' && process.env.TEST_WASM_MODEL_ID
    ? describe
    : describe.skip

describeIntegration('SimulationEngineFactory Integration', () => {
  const TEST_MODEL_ID = process.env.TEST_WASM_MODEL_ID!

  describe('WASM Engine Creation and Initialization', () => {
    it('should create and initialize WASM engine successfully', async () => {
      const options: CreateEngineOptions = {
        modelId: TEST_MODEL_ID,
        config: { timeStep: 0.01, duration: 1.0 }
      }

      const engine = await createSimulationEngine(options)
      expect(engine).toBeInstanceOf(WasmSimulationEngine)

      // Verify engine is initialized
      expect(engine.isInitialized()).toBe(true)

      // Clean up
      engine.destroy()
    }, 60000)

    it('should create WASM engine with custom optimization level', async () => {
      const options: CreateEngineOptions = {
        modelId: TEST_MODEL_ID,
        config: { timeStep: 0.01, duration: 1.0 },
        wasmOptions: {
          optimizationLevel: 'O2'
        }
      }

      const engine = await createSimulationEngine(options)
      expect(engine).toBeInstanceOf(WasmSimulationEngine)

      engine.destroy()
    }, 60000)
  })

  describe('Feature Flag Workflow', () => {
    it('should always create WASM engine regardless of preference', async () => {
      // Even if someone tries to disable WASM, it should still create WASM engine
      setWasmPreference(false)

      const options: CreateEngineOptions = {
        modelId: TEST_MODEL_ID,
        config: { timeStep: 0.01, duration: 1.0 }
      }

      const engine = await createSimulationEngine(options)
      expect(getEngineType(engine)).toBe('wasm')

      engine.destroy()
    }, 60000)
  })
})

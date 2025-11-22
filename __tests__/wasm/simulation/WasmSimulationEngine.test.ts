/**
 * Tests for WasmSimulationEngine
 *
 * These tests require:
 * - Supabase with test model
 * - Docker with obliq-emscripten:latest
 * - API server running (for integration tests)
 */

import { WasmSimulationEngine } from '@/lib/simulation/WasmSimulationEngine'

// Mock fetch for unit tests
global.fetch = jest.fn()

describe('WasmSimulationEngine', () => {
  describe('Constructor', () => {
    it('should create instance with model ID', () => {
      const engine = new WasmSimulationEngine('test-model-id')
      expect(engine).toBeInstanceOf(WasmSimulationEngine)

      const state = engine.getState()
      expect(state.isInitialized).toBe(false)
      expect(state.isRunning).toBe(false)
      expect(state.time).toBe(0)
    })
  })

  describe('Initialization', () => {
    let mockFetch: jest.MockedFunction<typeof fetch>

    beforeEach(() => {
      mockFetch = global.fetch as jest.MockedFunction<typeof fetch>
      mockFetch.mockClear()
    })

    it('should throw error if already initialized', async () => {
      const engine = new WasmSimulationEngine('test-model-id')

      // Mock successful compilation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          wasmData: btoa('fake-wasm'),
          jsData: btoa('export default () => ({ _wasm_init: () => {} })'),
          metadata: {
            modelName: 'Test',
            version: 1,
            cacheKey: 'test-key',
            cacheHit: false,
            compilationTime: 100,
            wasmSize: 1000,
            jsSize: 500,
            optimizationLevel: 'O2',
            blockCount: 5,
            inputMap: [],
            outputMap: []
          }
        })
      } as Response)

      // First initialization should succeed (but will fail on module load in this test)
      try {
        await engine.initialize(0.01)
      } catch (e) {
        // Expected to fail on module load in test environment
      }

      // Second initialization should throw
      await expect(engine.initialize(0.01)).rejects.toThrow('already initialized')
    })

    it('should throw error if compilation fails', async () => {
      const engine = new WasmSimulationEngine('test-model-id')

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'Model not found'
        })
      } as Response)

      await expect(engine.initialize(0.01)).rejects.toThrow('Failed to compile WASM')
    })

    it('should call API with correct parameters', async () => {
      const engine = new WasmSimulationEngine('test-model-id')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          wasmData: btoa('fake-wasm'),
          jsData: btoa('export default () => ({ _wasm_init: () => {} })'),
          metadata: {
            modelName: 'Test',
            version: 1,
            cacheKey: 'test-key',
            cacheHit: false,
            compilationTime: 100,
            wasmSize: 1000,
            jsSize: 500,
            optimizationLevel: 'O2',
            blockCount: 5,
            inputMap: [],
            outputMap: []
          }
        })
      } as Response)

      try {
        await engine.initialize(0.01, { optimizationLevel: 'O0' })
      } catch (e) {
        // Expected to fail on module load
      }

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/compile-wasm',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelId: 'test-model-id',
            optimizationLevel: 'O0'
          })
        })
      )
    })
  })

  describe('State Management', () => {
    it('should throw error when calling methods before initialization', () => {
      const engine = new WasmSimulationEngine('test-model-id')

      expect(() => engine.setInputs({ a: 1.0 })).toThrow('not initialized')
      expect(() => engine.step()).toThrow('not initialized')
      expect(() => engine.getOutputs()).toThrow('not initialized')
    })

    it('should return state snapshot', () => {
      const engine = new WasmSimulationEngine('test-model-id')
      const state = engine.getState()

      expect(state).toMatchObject({
        time: 0,
        timeStep: 0.01,
        isInitialized: false,
        isRunning: false,
        inputs: {},
        outputs: {}
      })

      // State should be immutable (snapshot)
      expect(Object.isFrozen(state)).toBe(false) // Not frozen, but is a copy
    })
  })

  describe('Metadata', () => {
    it('should return null metadata before initialization', () => {
      const engine = new WasmSimulationEngine('test-model-id')
      expect(engine.getMetadata()).toBeNull()
    })
  })

  describe('Cleanup', () => {
    it('should allow destroy before initialization', () => {
      const engine = new WasmSimulationEngine('test-model-id')
      expect(() => engine.destroy()).not.toThrow()

      const state = engine.getState()
      expect(state.isInitialized).toBe(false)
    })

    it('should clear state on destroy', () => {
      const engine = new WasmSimulationEngine('test-model-id')
      engine.destroy()

      const state = engine.getState()
      expect(state.isInitialized).toBe(false)
      expect(engine.getMetadata()).toBeNull()
    })
  })
})

// Integration tests (require actual API and WASM compilation)
const describeIntegration =
  process.env.TEST_WASM_INTEGRATION === 'true' && process.env.TEST_WASM_MODEL_ID
    ? describe
    : describe.skip

describeIntegration('WasmSimulationEngine Integration', () => {
  const TEST_MODEL_ID = process.env.TEST_WASM_MODEL_ID!
  let engine: WasmSimulationEngine

  beforeEach(() => {
    engine = new WasmSimulationEngine(TEST_MODEL_ID)
  })

  afterEach(() => {
    engine.destroy()
  })

  describe('Full Lifecycle', () => {
    it('should initialize, run, and destroy successfully', async () => {
      // Initialize
      await engine.initialize(0.01)

      const state = engine.getState()
      expect(state.isInitialized).toBe(true)
      expect(state.time).toBe(0)

      const metadata = engine.getMetadata()
      expect(metadata).not.toBeNull()
      expect(metadata!.modelName).toBeTruthy()

      // Set inputs
      const inputName = Array.from(metadata!.inputMap.keys())[0]
      if (inputName) {
        engine.setInput(inputName, 1.0)
      }

      // Step
      engine.step()
      expect(engine.getTime()).toBeCloseTo(0.01, 10)

      // Get outputs
      const outputs = engine.getOutputs()
      expect(outputs).toBeDefined()

      // Destroy
      engine.destroy()
      expect(engine.getState().isInitialized).toBe(false)
    }, 60000)

    it('should handle cache hit on second initialization', async () => {
      // First engine
      const engine1 = new WasmSimulationEngine(TEST_MODEL_ID)
      await engine1.initialize(0.01, { optimizationLevel: 'O0' })

      const metadata1 = engine1.getMetadata()
      const cacheKey1 = metadata1!.cacheKey

      engine1.destroy()

      // Second engine (should hit cache)
      const engine2 = new WasmSimulationEngine(TEST_MODEL_ID)
      const start = Date.now()
      await engine2.initialize(0.01, { optimizationLevel: 'O0' })
      const elapsed = Date.now() - start

      const metadata2 = engine2.getMetadata()

      expect(metadata2!.cacheKey).toBe(cacheKey1)
      expect(metadata2!.cacheHit).toBe(true)
      expect(elapsed).toBeLessThan(1000) // Should be very fast

      engine2.destroy()
    }, 60000)
  })

  describe('Simulation', () => {
    beforeEach(async () => {
      await engine.initialize(0.01)
    })

    it('should execute multiple steps', () => {
      for (let i = 0; i < 10; i++) {
        engine.step()
      }

      expect(engine.getTime()).toBeCloseTo(0.1, 10)
    })

    it('should update outputs after step', () => {
      const metadata = engine.getMetadata()!

      // Set inputs
      metadata.inputMap.forEach((index, name) => {
        engine.setInput(name, 1.0)
      })

      // Step
      engine.step()

      // Get outputs
      const outputs = engine.getOutputs()

      // Outputs should be defined
      metadata.outputMap.forEach((index, name) => {
        expect(outputs[name]).toBeDefined()
      })
    })

    it('should run simulation for duration', async () => {
      const duration = 1.0 // 1 second

      let stepCount = 0
      const finalTime = await engine.run(duration, () => {
        stepCount++
      })

      expect(finalTime).toBeCloseTo(duration, 1)
      expect(stepCount).toBe(100) // 1.0 / 0.01 = 100 steps
    })

    it('should stop running simulation', async () => {
      // Start long simulation
      const runPromise = engine.run(10.0) // 10 seconds

      // Stop after short delay
      setTimeout(() => engine.stop(), 100)

      const finalTime = await runPromise

      // Should have stopped early
      expect(finalTime).toBeLessThan(10.0)
    })

    it('should reset simulation', async () => {
      // Run for some time
      engine.step()
      engine.step()
      engine.step()

      expect(engine.getTime()).toBeGreaterThan(0)

      // Reset
      await engine.reset()

      expect(engine.getTime()).toBe(0)

      // Should be able to run again
      engine.step()
      expect(engine.getTime()).toBeCloseTo(0.01, 10)
    })
  })

  describe('Input/Output', () => {
    beforeEach(async () => {
      await engine.initialize(0.01)
    })

    it('should set and get individual input', () => {
      const metadata = engine.getMetadata()!
      const inputNames = Array.from(metadata.inputMap.keys())

      if (inputNames.length > 0) {
        const inputName = inputNames[0]

        engine.setInput(inputName, 2.5)

        const state = engine.getState()
        expect(state.inputs[inputName]).toBe(2.5)
      }
    })

    it('should set multiple inputs at once', () => {
      const metadata = engine.getMetadata()!
      const inputNames = Array.from(metadata.inputMap.keys())

      if (inputNames.length >= 2) {
        engine.setInputs({
          [inputNames[0]]: 1.0,
          [inputNames[1]]: 2.0
        })

        const state = engine.getState()
        expect(state.inputs[inputNames[0]]).toBe(1.0)
        expect(state.inputs[inputNames[1]]).toBe(2.0)
      }
    })

    it('should warn on unknown input', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      engine.setInput('nonexistent_input', 1.0)

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown input'),
        'nonexistent_input'
      )

      consoleSpy.mockRestore()
    })

    it('should get individual output', () => {
      const metadata = engine.getMetadata()!
      const outputNames = Array.from(metadata.outputMap.keys())

      if (outputNames.length > 0) {
        engine.step()

        const outputName = outputNames[0]
        const value = engine.getOutput(outputName)

        expect(typeof value).toBe('number')
      }
    })

    it('should throw on unknown output', () => {
      expect(() => engine.getOutput('nonexistent_output')).toThrow('Unknown output')
    })
  })
})

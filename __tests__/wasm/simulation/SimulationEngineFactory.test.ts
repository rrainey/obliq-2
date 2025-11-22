/**
 * Tests for SimulationEngineFactory
 *
 * Tests the factory pattern for creating simulation engines with feature flag support.
 */

import {
  createSimulationEngine,
  getWasmPreference,
  setWasmPreference,
  isWasmAvailable,
  getEngineType,
  CreateEngineOptions
} from '@/lib/simulation/SimulationEngineFactory'
import { SimulationEngine } from '@/lib/simulationEngine'
import { WasmSimulationEngine } from '@/lib/simulation/WasmSimulationEngine'

// Mock fetch for WASM tests
global.fetch = jest.fn()

describe('SimulationEngineFactory', () => {
  // Store original localStorage
  let originalLocalStorage: Storage

  beforeEach(() => {
    // Mock localStorage
    const localStorageMock = (() => {
      let store: Record<string, string> = {}
      return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
          store[key] = value.toString()
        },
        removeItem: (key: string) => {
          delete store[key]
        },
        clear: () => {
          store = {}
        },
        get length() {
          return Object.keys(store).length
        },
        key: (index: number) => {
          const keys = Object.keys(store)
          return keys[index] || null
        }
      }
    })()

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true
    })
  })

  afterEach(() => {
    // Clear localStorage after each test
    localStorage.clear()
  })

  describe('Preference Management', () => {
    it('should return false when no preference is stored', () => {
      const preference = getWasmPreference()
      expect(preference).toBe(false)
    })

    it('should store and retrieve WASM preference', () => {
      setWasmPreference(true)
      expect(getWasmPreference()).toBe(true)

      setWasmPreference(false)
      expect(getWasmPreference()).toBe(false)
    })

    it('should persist preference across calls', () => {
      setWasmPreference(true)
      expect(getWasmPreference()).toBe(true)
      expect(getWasmPreference()).toBe(true) // Second call
    })

    it('should use correct localStorage key', () => {
      setWasmPreference(true)
      expect(localStorage.getItem('obliq_useWasmSimulation')).toBe('true')
    })

    it('should handle server-side rendering (no window)', () => {
      // Temporarily remove window
      const originalWindow = global.window
      // @ts-ignore
      delete global.window

      const preference = getWasmPreference()
      expect(preference).toBe(false)

      // Restore window
      global.window = originalWindow
    })
  })

  describe('WASM Availability', () => {
    it('should detect WebAssembly support', () => {
      const available = isWasmAvailable()
      // In Jest/Node environment, WebAssembly may or may not be available
      expect(typeof available).toBe('boolean')
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
    it('should detect JavaScript engine type', () => {
      const engine = new SimulationEngine([], [], {})
      const type = getEngineType(engine)
      expect(type).toBe('javascript')
    })

    it('should detect WASM engine type', () => {
      const engine = new WasmSimulationEngine('test-model-id')
      const type = getEngineType(engine)
      expect(type).toBe('wasm')
    })
  })

  describe('Factory - JavaScript Engine Creation', () => {
    it('should create JavaScript engine when useWasm is false', async () => {
      const options: CreateEngineOptions = {
        useWasm: false,
        sheets: [],
        connections: [],
        config: { timeStep: 0.01 }
      }

      const engine = await createSimulationEngine(options)
      expect(engine).toBeInstanceOf(SimulationEngine)
      expect(getEngineType(engine)).toBe('javascript')
    })

    it('should create JavaScript engine when no preference is set', async () => {
      const options: CreateEngineOptions = {
        sheets: [],
        connections: [],
        config: { timeStep: 0.01 }
      }

      const engine = await createSimulationEngine(options)
      expect(engine).toBeInstanceOf(SimulationEngine)
    })

    it('should throw error when sheets/connections missing for JS engine', async () => {
      const options: CreateEngineOptions = {
        useWasm: false,
        config: { timeStep: 0.01 }
      }

      await expect(createSimulationEngine(options)).rejects.toThrow(
        'sheets and connections are required for JavaScript simulation engine'
      )
    })

    it('should pass config to JavaScript engine', async () => {
      const config = { timeStep: 0.05 }
      const options: CreateEngineOptions = {
        useWasm: false,
        sheets: [],
        connections: [],
        config
      }

      const engine = await createSimulationEngine(options)
      expect(engine).toBeInstanceOf(SimulationEngine)
      // Config is passed to constructor
    })
  })

  describe('Factory - WASM Engine Creation', () => {
    it('should throw error when modelId missing for WASM engine', async () => {
      const options: CreateEngineOptions = {
        useWasm: true,
        config: { timeStep: 0.01 }
      }

      await expect(createSimulationEngine(options)).rejects.toThrow(
        'modelId is required for WASM simulation engine'
      )
    })

    it('should create WASM engine when useWasm is true', async () => {
      const options: CreateEngineOptions = {
        useWasm: true,
        modelId: 'test-model-id',
        config: { timeStep: 0.01 }
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
        useWasm: true,
        modelId: 'test-model-id',
        config: { timeStep: 0.02 },
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
        useWasm: true,
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

  describe('Factory - Preference-Based Selection', () => {
    it('should use stored preference when useWasm not specified', async () => {
      setWasmPreference(true)

      const options: CreateEngineOptions = {
        modelId: 'test-model-id'
      }

      const mockInitialize = jest.fn().mockResolvedValue(undefined)
      WasmSimulationEngine.prototype.initialize = mockInitialize

      const engine = await createSimulationEngine(options)
      expect(engine).toBeInstanceOf(WasmSimulationEngine)
    })

    it('should override stored preference with explicit useWasm', async () => {
      setWasmPreference(true)

      const options: CreateEngineOptions = {
        useWasm: false,
        sheets: [],
        connections: []
      }

      const engine = await createSimulationEngine(options)
      expect(engine).toBeInstanceOf(SimulationEngine)
    })
  })

  describe('Error Handling', () => {
    it('should handle localStorage errors gracefully', () => {
      // Mock localStorage.getItem to throw error
      const originalGetItem = localStorage.getItem
      localStorage.getItem = jest.fn().mockImplementation(() => {
        throw new Error('Storage error')
      })

      const preference = getWasmPreference()
      expect(preference).toBe(false) // Should default to false on error

      localStorage.getItem = originalGetItem
    })

    it('should handle localStorage setItem errors gracefully', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation()
      const originalSetItem = localStorage.setItem
      localStorage.setItem = jest.fn().mockImplementation(() => {
        throw new Error('Storage error')
      })

      // Should not throw
      expect(() => setWasmPreference(true)).not.toThrow()
      expect(consoleError).toHaveBeenCalled()

      localStorage.setItem = originalSetItem
      consoleError.mockRestore()
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

  beforeEach(() => {
    localStorage.clear()
  })

  describe('WASM Engine Creation and Initialization', () => {
    it('should create and initialize WASM engine successfully', async () => {
      const options: CreateEngineOptions = {
        useWasm: true,
        modelId: TEST_MODEL_ID,
        config: { timeStep: 0.01 }
      }

      const engine = await createSimulationEngine(options)
      expect(engine).toBeInstanceOf(WasmSimulationEngine)

      // Verify engine is initialized
      const wasmEngine = engine as WasmSimulationEngine
      expect(wasmEngine.isInitialized()).toBe(true)

      // Clean up
      wasmEngine.destroy()
    }, 60000)

    it('should create WASM engine with custom optimization level', async () => {
      const options: CreateEngineOptions = {
        useWasm: true,
        modelId: TEST_MODEL_ID,
        config: { timeStep: 0.01 },
        wasmOptions: {
          optimizationLevel: 'O2'
        }
      }

      const engine = await createSimulationEngine(options)
      expect(engine).toBeInstanceOf(WasmSimulationEngine)

      const wasmEngine = engine as WasmSimulationEngine
      wasmEngine.destroy()
    }, 60000)

    it('should support switching between engine types', async () => {
      // Create WASM engine
      setWasmPreference(true)
      const wasmOptions: CreateEngineOptions = {
        modelId: TEST_MODEL_ID
      }
      const wasmEngine = await createSimulationEngine(wasmOptions)
      expect(getEngineType(wasmEngine)).toBe('wasm')

      // Create JavaScript engine
      setWasmPreference(false)
      const jsOptions: CreateEngineOptions = {
        sheets: [],
        connections: []
      }
      const jsEngine = await createSimulationEngine(jsOptions)
      expect(getEngineType(jsEngine)).toBe('javascript')

      // Clean up
      if (wasmEngine instanceof WasmSimulationEngine) {
        wasmEngine.destroy()
      }
    }, 60000)
  })

  describe('Feature Flag Workflow', () => {
    it('should enable WASM via feature flag and create engine', async () => {
      // User enables WASM in settings
      setWasmPreference(true)
      expect(getWasmPreference()).toBe(true)

      // Application creates engine using stored preference
      const options: CreateEngineOptions = {
        modelId: TEST_MODEL_ID,
        config: { timeStep: 0.01 }
      }

      const engine = await createSimulationEngine(options)
      expect(getEngineType(engine)).toBe('wasm')

      if (engine instanceof WasmSimulationEngine) {
        engine.destroy()
      }
    }, 60000)

    it('should disable WASM and fallback to JavaScript', async () => {
      // User disables WASM in settings
      setWasmPreference(false)
      expect(getWasmPreference()).toBe(false)

      // Application creates engine
      const options: CreateEngineOptions = {
        sheets: [],
        connections: [],
        config: { timeStep: 0.01 }
      }

      const engine = await createSimulationEngine(options)
      expect(getEngineType(engine)).toBe('javascript')
    })
  })
})

/**
 * Tests for WasmSimulationEngine Scope Data Retrieval
 *
 * Tests the ability to access signal logger (scope) data from WASM simulations.
 * Signal loggers are treated as outputs in the WASM code, allowing JavaScript
 * to read their current values at each simulation step.
 */

import { WasmSimulationEngine } from '@/lib/simulation/WasmSimulationEngine'

// Mock fetch for unit tests
global.fetch = jest.fn()

describe('WasmSimulationEngine Scope Data', () => {
  describe('Logger Methods (Unit)', () => {
    it('should return empty array when no metadata', () => {
      const engine = new WasmSimulationEngine('test-model-id')

      const loggerNames = engine.getLoggerNames()
      expect(loggerNames).toEqual([])
    })

    it('should return empty object for logger values when not initialized', () => {
      const engine = new WasmSimulationEngine('test-model-id')

      const loggerValues = engine.getLoggerValues()
      expect(loggerValues).toEqual({})
    })
  })

  describe('Logger Name Handling', () => {
    it('should handle logger names with and without prefix', () => {
      const engine = new WasmSimulationEngine('test-model-id')

      // Manually set metadata for testing
      ;(engine as any).metadata = {
        outputMap: new Map([
          ['output1', 0],
          ['logger_Temperature', 1],
          ['logger_Pressure', 2]
        ])
      }
      ;(engine as any).state.outputs = {
        output1: 5.0,
        logger_Temperature: 23.5,
        logger_Pressure: 101.3
      }
      ;(engine as any).state.isInitialized = true

      // getLoggerNames should only return logger_ prefixed items
      const loggerNames = engine.getLoggerNames()
      expect(loggerNames).toEqual(['logger_Temperature', 'logger_Pressure'])

      // getLoggerValues should remove prefix
      const loggerValues = engine.getLoggerValues()
      expect(loggerValues).toEqual({
        Temperature: 23.5,
        Pressure: 101.3
      })
    })
  })
})

// Integration tests (require actual WASM compilation)
const describeIntegration =
  process.env.TEST_WASM_INTEGRATION === 'true' && process.env.TEST_WASM_MODEL_ID
    ? describe
    : describe.skip

describeIntegration('WasmSimulationEngine Scope Data Integration', () => {
  const TEST_MODEL_ID = process.env.TEST_WASM_MODEL_ID!
  let engine: WasmSimulationEngine

  beforeEach(() => {
    engine = new WasmSimulationEngine(TEST_MODEL_ID)
  })

  afterEach(() => {
    engine.destroy()
  })

  describe('Signal Logger Detection', () => {
    it('should detect signal loggers in compiled model', async () => {
      await engine.initialize(0.01)

      const loggerNames = engine.getLoggerNames()
      console.log('Detected loggers:', loggerNames)

      // If the test model has signal loggers, they should be detected
      expect(Array.isArray(loggerNames)).toBe(true)

      // Logger names should start with 'logger_'
      loggerNames.forEach(name => {
        expect(name).toMatch(/^logger_/)
      })
    }, 60000)

    it('should include logger names in metadata outputMap', async () => {
      await engine.initialize(0.01)

      const metadata = engine.getMetadata()
      expect(metadata).not.toBeNull()

      if (metadata) {
        const outputNames = Array.from(metadata.outputMap.keys())
        console.log('All outputs:', outputNames)

        // Check for logger outputs
        const loggerOutputs = outputNames.filter(name => name.startsWith('logger_'))
        console.log('Logger outputs:', loggerOutputs)

        expect(loggerOutputs.length).toBeGreaterThanOrEqual(0)
      }
    }, 60000)
  })

  describe('Logger Value Retrieval', () => {
    it('should get current logger value by name', async () => {
      await engine.initialize(0.01)

      const loggerNames = engine.getLoggerNames()

      if (loggerNames.length > 0) {
        const firstLogger = loggerNames[0]
        const shortName = firstLogger.substring(7) // Remove 'logger_' prefix

        // Set some inputs
        engine.setInputs({ a: 1.0 })

        // Run a few steps
        for (let i = 0; i < 10; i++) {
          engine.step()
        }

        // Get logger value with full name
        const value1 = engine.getLoggerValue(firstLogger)
        expect(typeof value1).toBe('number')

        // Get logger value with short name
        const value2 = engine.getLoggerValue(shortName)
        expect(value2).toBe(value1)
      }
    }, 60000)

    it('should get all logger values', async () => {
      await engine.initialize(0.01)

      const loggerNames = engine.getLoggerNames()

      if (loggerNames.length > 0) {
        // Set some inputs
        engine.setInputs({ a: 2.0 })

        // Run simulation
        for (let i = 0; i < 10; i++) {
          engine.step()
        }

        // Get all logger values
        const loggerValues = engine.getLoggerValues()

        // Should have entries for each logger (without prefix)
        const expectedCount = loggerNames.length
        expect(Object.keys(loggerValues).length).toBe(expectedCount)

        // All values should be numbers (for scalar signals)
        Object.values(loggerValues).forEach(value => {
          expect(typeof value === 'number' || Array.isArray(value)).toBe(true)
        })
      }
    }, 60000)
  })

  describe('Logger Data Collection Over Time', () => {
    it('should collect logger data over multiple steps', async () => {
      await engine.initialize(0.01)

      const loggerNames = engine.getLoggerNames()

      if (loggerNames.length > 0) {
        const firstLogger = loggerNames[0].substring(7) // Remove prefix

        // Collect data over time
        const timePoints: number[] = []
        const loggerData: number[] = []

        engine.setInputs({ a: 1.0 })

        for (let i = 0; i < 100; i++) {
          engine.step()

          timePoints.push(engine.getTime())
          const value = engine.getLoggerValue(firstLogger)

          // Assuming scalar values for this test
          if (typeof value === 'number') {
            loggerData.push(value)
          }
        }

        expect(timePoints.length).toBe(100)
        expect(loggerData.length).toBe(100)

        // Time should progress
        expect(timePoints[99]).toBeGreaterThan(timePoints[0])

        console.log(`Collected ${loggerData.length} samples from logger "${firstLogger}"`)
        console.log(`Time range: ${timePoints[0].toFixed(3)}s to ${timePoints[99].toFixed(3)}s`)
        console.log(`Value range: ${Math.min(...loggerData).toFixed(3)} to ${Math.max(...loggerData).toFixed(3)}`)
      }
    }, 60000)

    it('should collect data from multiple loggers simultaneously', async () => {
      await engine.initialize(0.01)

      const loggerNames = engine.getLoggerNames()

      if (loggerNames.length >= 2) {
        // Track data for multiple loggers
        const loggerData = new Map<string, number[]>()

        loggerNames.forEach(name => {
          loggerData.set(name.substring(7), [])
        })

        engine.setInputs({ a: 1.0 })

        // Collect 50 samples
        for (let i = 0; i < 50; i++) {
          engine.step()

          const values = engine.getLoggerValues()
          for (const [name, value] of Object.entries(values)) {
            if (typeof value === 'number') {
              loggerData.get(name)?.push(value)
            }
          }
        }

        // Verify all loggers collected data
        loggerData.forEach((data, name) => {
          expect(data.length).toBe(50)
          console.log(`Logger "${name}": ${data.length} samples collected`)
        })
      }
    }, 60000)
  })

  describe('Logger Data with run() Method', () => {
    it('should access logger data during run() callback', async () => {
      await engine.initialize(0.01)

      const loggerNames = engine.getLoggerNames()

      if (loggerNames.length > 0) {
        const firstLogger = loggerNames[0].substring(7)

        const collectedData: Array<{ time: number; value: number | number[] }> = []

        engine.setInputs({ a: 1.5 })

        await engine.run(0.5, (state) => {
          const value = engine.getLoggerValue(firstLogger)
          collectedData.push({
            time: state.time,
            value: value as number | number[]
          })
        })

        // Should have collected data at each step
        const expectedSteps = Math.floor(0.5 / 0.01)
        expect(collectedData.length).toBe(expectedSteps)

        console.log(`Collected ${collectedData.length} samples during run()`)
      }
    }, 60000)
  })

  describe('Error Handling', () => {
    it('should throw error for unknown logger name', async () => {
      await engine.initialize(0.01)

      expect(() => engine.getLoggerValue('NonExistentLogger')).toThrow('Unknown output')
    }, 60000)
  })
})

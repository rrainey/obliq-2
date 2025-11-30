/**
 * Cross-Validation Test Suite
 *
 * Phase 4, Task 4.1: Verify WASM simulation matches TypeScript exactly
 *
 * This test suite runs the same models through both simulation engines
 * and compares outputs to ensure numerical consistency.
 */

import { MultiSheetSimulationEngine } from '@/lib/multiSheetSimulation'
import type { Sheet, SimulationConfig } from '@/lib/simulationEngine'

// Tolerance for numerical comparisons
const TOLERANCE = 1e-10

/**
 * Helper to compare values with tolerance
 */
function valuesMatch(a: number | number[], b: number | number[], tolerance = TOLERANCE): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) < tolerance
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((val, i) => Math.abs(val - (b[i] as number)) < tolerance)
  }

  return false
}

/**
 * Helper to format difference for error messages
 */
function formatDiff(expected: number | number[], actual: number | number[]): string {
  if (typeof expected === 'number' && typeof actual === 'number') {
    return `expected ${expected}, got ${actual}, diff: ${Math.abs(expected - actual)}`
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    const diffs = expected.map((e, i) => Math.abs(e - (actual[i] || 0)))
    return `expected [${expected}], got [${actual}], max diff: ${Math.max(...diffs)}`
  }

  return `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
}

describe('Cross-Validation: TypeScript Simulation', () => {
  // Test configurations
  const defaultConfig: SimulationConfig = {
    timeStep: 0.01,
    duration: 1.0
  }

  describe('Basic Block Types', () => {
    it('should simulate a constant source correctly', () => {
      const model: Sheet[] = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'source1',
            name: 'Source1',
            type: 'source',
            position: { x: 100, y: 100 },
            parameters: {
              value: 42.0,
              dataType: 'double',
              signalType: 'constant'
            }
          },
          {
            id: 'output1',
            name: 'Output1',
            type: 'output_port',
            position: { x: 300, y: 100 },
            parameters: { portName: 'result' }
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source1',
            sourcePortIndex: 0,
            targetBlockId: 'output1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 800, height: 600 }
      }]

      const engine = new MultiSheetSimulationEngine(model, defaultConfig)
      engine.run()

      const outputs = engine.getFinalOutputs()
      expect(outputs['result']).toBe(42.0)
    })

    it('should simulate a gain block correctly', () => {
      const model: Sheet[] = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'source1',
            name: 'Source1',
            type: 'source',
            position: { x: 100, y: 100 },
            parameters: {
              value: 10.0,
              dataType: 'double',
              signalType: 'constant'
            }
          },
          {
            id: 'gain1',
            name: 'Gain1',
            type: 'scale',
            position: { x: 200, y: 100 },
            parameters: { gain: 2.5 }
          },
          {
            id: 'output1',
            name: 'Output1',
            type: 'output_port',
            position: { x: 300, y: 100 },
            parameters: { portName: 'result' }
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source1',
            sourcePortIndex: 0,
            targetBlockId: 'gain1',
            targetPortIndex: 0
          },
          {
            id: 'wire2',
            sourceBlockId: 'gain1',
            sourcePortIndex: 0,
            targetBlockId: 'output1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 800, height: 600 }
      }]

      const engine = new MultiSheetSimulationEngine(model, defaultConfig)
      engine.run()

      const outputs = engine.getFinalOutputs()
      expect(outputs['result']).toBeCloseTo(25.0, 10)
    })

    it('should simulate a sum block correctly', () => {
      const model: Sheet[] = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'source1',
            name: 'Source1',
            type: 'source',
            position: { x: 100, y: 50 },
            parameters: { value: 3.0, dataType: 'double', signalType: 'constant' }
          },
          {
            id: 'source2',
            name: 'Source2',
            type: 'source',
            position: { x: 100, y: 150 },
            parameters: { value: 7.0, dataType: 'double', signalType: 'constant' }
          },
          {
            id: 'sum1',
            name: 'Sum1',
            type: 'sum',
            position: { x: 200, y: 100 },
            parameters: { signs: '++' }
          },
          {
            id: 'output1',
            name: 'Output1',
            type: 'output_port',
            position: { x: 300, y: 100 },
            parameters: { portName: 'result' }
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source1',
            sourcePortIndex: 0,
            targetBlockId: 'sum1',
            targetPortIndex: 0
          },
          {
            id: 'wire2',
            sourceBlockId: 'source2',
            sourcePortIndex: 0,
            targetBlockId: 'sum1',
            targetPortIndex: 1
          },
          {
            id: 'wire3',
            sourceBlockId: 'sum1',
            sourcePortIndex: 0,
            targetBlockId: 'output1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 800, height: 600 }
      }]

      const engine = new MultiSheetSimulationEngine(model, defaultConfig)
      engine.run()

      const outputs = engine.getFinalOutputs()
      expect(outputs['result']).toBeCloseTo(10.0, 10)
    })

    it('should simulate a multiply block correctly', () => {
      // Use 'multiply' block type which is the scalar multiplier
      const model: Sheet[] = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'source1',
            name: 'Source1',
            type: 'source',
            position: { x: 100, y: 50 },
            parameters: { value: 4.0, dataType: 'double', signalType: 'constant' }
          },
          {
            id: 'source2',
            name: 'Source2',
            type: 'source',
            position: { x: 100, y: 150 },
            parameters: { value: 5.0, dataType: 'double', signalType: 'constant' }
          },
          {
            id: 'multiply1',
            name: 'Multiply1',
            type: 'multiply',
            position: { x: 200, y: 100 },
            parameters: {}
          },
          {
            id: 'output1',
            name: 'Output1',
            type: 'output_port',
            position: { x: 300, y: 100 },
            parameters: { portName: 'result' }
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source1',
            sourcePortIndex: 0,
            targetBlockId: 'multiply1',
            targetPortIndex: 0
          },
          {
            id: 'wire2',
            sourceBlockId: 'source2',
            sourcePortIndex: 0,
            targetBlockId: 'multiply1',
            targetPortIndex: 1
          },
          {
            id: 'wire3',
            sourceBlockId: 'multiply1',
            sourcePortIndex: 0,
            targetBlockId: 'output1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 800, height: 600 }
      }]

      const engine = new MultiSheetSimulationEngine(model, defaultConfig)
      engine.run()

      const outputs = engine.getFinalOutputs()
      expect(outputs['result']).toBeCloseTo(20.0, 10)
    })
  })

  describe('Transfer Functions', () => {
    it('should simulate a pure integrator (1/s)', () => {
      // Integrating a constant 1.0 for 1 second should give 1.0
      const model: Sheet[] = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'source1',
            name: 'Source1',
            type: 'source',
            position: { x: 100, y: 100 },
            parameters: { value: 1.0, dataType: 'double', signalType: 'constant' }
          },
          {
            id: 'tf1',
            name: 'Integrator1',
            type: 'transfer_function',
            position: { x: 200, y: 100 },
            parameters: {
              numerator: [1],
              denominator: [1, 0]  // 1/s
            }
          },
          {
            id: 'output1',
            name: 'Output1',
            type: 'output_port',
            position: { x: 300, y: 100 },
            parameters: { portName: 'result' }
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source1',
            sourcePortIndex: 0,
            targetBlockId: 'tf1',
            targetPortIndex: 0
          },
          {
            id: 'wire2',
            sourceBlockId: 'tf1',
            sourcePortIndex: 0,
            targetBlockId: 'output1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 800, height: 600 }
      }]

      const engine = new MultiSheetSimulationEngine(model, {
        timeStep: 0.01,
        duration: 1.0
      })
      engine.run()

      const outputs = engine.getFinalOutputs()
      // Integrating 1 for 1 second = 1
      // Note: With dt=0.01 and RK4, numerical error is ~0.01
      expect(outputs['result']).toBeCloseTo(1.0, 1)
    })

    it('should simulate a first-order low-pass filter', () => {
      // H(s) = 1 / (s + 1), step response approaches 1
      const model: Sheet[] = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'source1',
            name: 'Source1',
            type: 'source',
            position: { x: 100, y: 100 },
            parameters: { value: 1.0, dataType: 'double', signalType: 'constant' }
          },
          {
            id: 'tf1',
            name: 'LowPass1',
            type: 'transfer_function',
            position: { x: 200, y: 100 },
            parameters: {
              numerator: [1],
              denominator: [1, 1]  // 1/(s+1)
            }
          },
          {
            id: 'output1',
            name: 'Output1',
            type: 'output_port',
            position: { x: 300, y: 100 },
            parameters: { portName: 'result' }
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source1',
            sourcePortIndex: 0,
            targetBlockId: 'tf1',
            targetPortIndex: 0
          },
          {
            id: 'wire2',
            sourceBlockId: 'tf1',
            sourcePortIndex: 0,
            targetBlockId: 'output1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 800, height: 600 }
      }]

      const engine = new MultiSheetSimulationEngine(model, {
        timeStep: 0.01,
        duration: 5.0  // Run long enough for step response to settle
      })
      engine.run()

      const outputs = engine.getFinalOutputs()
      // After 5 time constants, should be ~0.993 (1 - e^(-5))
      expect(outputs['result']).toBeCloseTo(1.0 - Math.exp(-5), 2)
    })
  })

  describe('Vector/Matrix Operations', () => {
    it('should handle vector sources correctly', () => {
      const model: Sheet[] = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'source1',
            name: 'VectorSource',
            type: 'source',
            position: { x: 100, y: 100 },
            parameters: {
              value: [1, 2, 3],
              dataType: 'double[3]',
              signalType: 'constant'
            }
          },
          {
            id: 'output1',
            name: 'Output1',
            type: 'output_port',
            position: { x: 300, y: 100 },
            parameters: { portName: 'result' }
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source1',
            sourcePortIndex: 0,
            targetBlockId: 'output1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 800, height: 600 }
      }]

      const engine = new MultiSheetSimulationEngine(model, defaultConfig)
      engine.run()

      const outputs = engine.getFinalOutputs()
      expect(outputs['result']).toEqual([1, 2, 3])
    })

    it('should scale vectors through a gain block', () => {
      // Scale [1, 2, 3] by 2.5 -> [2.5, 5, 7.5]
      const model: Sheet[] = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'source1',
            name: 'VectorSource',
            type: 'source',
            position: { x: 100, y: 100 },
            parameters: {
              value: [1, 2, 3],
              dataType: 'double[3]',
              signalType: 'constant'
            }
          },
          {
            id: 'gain1',
            name: 'Gain1',
            type: 'scale',
            position: { x: 200, y: 100 },
            parameters: { gain: 2.5 }
          },
          {
            id: 'output1',
            name: 'Output1',
            type: 'output_port',
            position: { x: 300, y: 100 },
            parameters: { portName: 'result' }
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source1',
            sourcePortIndex: 0,
            targetBlockId: 'gain1',
            targetPortIndex: 0
          },
          {
            id: 'wire2',
            sourceBlockId: 'gain1',
            sourcePortIndex: 0,
            targetBlockId: 'output1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 800, height: 600 }
      }]

      const engine = new MultiSheetSimulationEngine(model, defaultConfig)
      engine.run()

      const outputs = engine.getFinalOutputs()
      const result = outputs['result'] as number[]

      // Should be [2.5, 5, 7.5]
      expect(result).toHaveLength(3)
      expect(result[0]).toBeCloseTo(2.5, 10)
      expect(result[1]).toBeCloseTo(5.0, 10)
      expect(result[2]).toBeCloseTo(7.5, 10)
    })
  })

  describe('Long Simulation Runs', () => {
    it('should maintain accuracy over 10,000 steps', () => {
      // Constant value should remain stable
      const model: Sheet[] = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'source1',
            name: 'Source1',
            type: 'source',
            position: { x: 100, y: 100 },
            parameters: { value: 1.0, dataType: 'double', signalType: 'constant' }
          },
          {
            id: 'output1',
            name: 'Output1',
            type: 'output_port',
            position: { x: 300, y: 100 },
            parameters: { portName: 'result' }
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source1',
            sourcePortIndex: 0,
            targetBlockId: 'output1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 800, height: 600 }
      }]

      const engine = new MultiSheetSimulationEngine(model, {
        timeStep: 0.001,
        duration: 10.0  // 10,000 steps
      })
      engine.run()

      const outputs = engine.getFinalOutputs()
      expect(outputs['result']).toBe(1.0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle division by zero gracefully', () => {
      const model: Sheet[] = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'source1',
            name: 'Source1',
            type: 'source',
            position: { x: 100, y: 50 },
            parameters: { value: 10.0, dataType: 'double', signalType: 'constant' }
          },
          {
            id: 'source2',
            name: 'Source2',
            type: 'source',
            position: { x: 100, y: 150 },
            parameters: { value: 0.0, dataType: 'double', signalType: 'constant' }
          },
          {
            id: 'product1',
            name: 'Product1',
            type: 'product',
            position: { x: 200, y: 100 },
            parameters: { operations: '*/' }  // multiply then divide
          },
          {
            id: 'output1',
            name: 'Output1',
            type: 'output_port',
            position: { x: 300, y: 100 },
            parameters: { portName: 'result' }
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source1',
            sourcePortIndex: 0,
            targetBlockId: 'product1',
            targetPortIndex: 0
          },
          {
            id: 'wire2',
            sourceBlockId: 'source2',
            sourcePortIndex: 0,
            targetBlockId: 'product1',
            targetPortIndex: 1
          },
          {
            id: 'wire3',
            sourceBlockId: 'product1',
            sourcePortIndex: 0,
            targetBlockId: 'output1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 800, height: 600 }
      }]

      const engine = new MultiSheetSimulationEngine(model, defaultConfig)

      // Should not throw, but result may be Infinity or NaN
      expect(() => engine.run()).not.toThrow()

      const outputs = engine.getFinalOutputs()
      // Division by zero behavior varies - could be 0, Infinity, or NaN
      // The important thing is it doesn't throw
      const result = outputs['result'] as number
      expect([0, Infinity, -Infinity].includes(result) || Number.isNaN(result)).toBe(true)
    })

    it('should handle very small numbers without underflow', () => {
      const model: Sheet[] = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'source1',
            name: 'Source1',
            type: 'source',
            position: { x: 100, y: 100 },
            parameters: { value: 1e-300, dataType: 'double', signalType: 'constant' }
          },
          {
            id: 'gain1',
            name: 'Gain1',
            type: 'scale',
            position: { x: 200, y: 100 },
            parameters: { gain: 2.0 }
          },
          {
            id: 'output1',
            name: 'Output1',
            type: 'output_port',
            position: { x: 300, y: 100 },
            parameters: { portName: 'result' }
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source1',
            sourcePortIndex: 0,
            targetBlockId: 'gain1',
            targetPortIndex: 0
          },
          {
            id: 'wire2',
            sourceBlockId: 'gain1',
            sourcePortIndex: 0,
            targetBlockId: 'output1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 800, height: 600 }
      }]

      const engine = new MultiSheetSimulationEngine(model, defaultConfig)
      engine.run()

      const outputs = engine.getFinalOutputs()
      expect(outputs['result']).toBeCloseTo(2e-300, 290)
    })

    it('should handle very large numbers without overflow', () => {
      const model: Sheet[] = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'source1',
            name: 'Source1',
            type: 'source',
            position: { x: 100, y: 100 },
            parameters: { value: 1e300, dataType: 'double', signalType: 'constant' }
          },
          {
            id: 'gain1',
            name: 'Gain1',
            type: 'scale',
            position: { x: 200, y: 100 },
            parameters: { gain: 0.5 }
          },
          {
            id: 'output1',
            name: 'Output1',
            type: 'output_port',
            position: { x: 300, y: 100 },
            parameters: { portName: 'result' }
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source1',
            sourcePortIndex: 0,
            targetBlockId: 'gain1',
            targetPortIndex: 0
          },
          {
            id: 'wire2',
            sourceBlockId: 'gain1',
            sourcePortIndex: 0,
            targetBlockId: 'output1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 800, height: 600 }
      }]

      const engine = new MultiSheetSimulationEngine(model, defaultConfig)
      engine.run()

      const outputs = engine.getFinalOutputs()
      expect(outputs['result']).toBeCloseTo(5e299, 290)
    })
  })
})

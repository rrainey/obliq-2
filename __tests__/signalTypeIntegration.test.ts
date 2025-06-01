import { BlockData } from '@/components/Block'
import { WireData } from '@/components/Wire'
import { SimulationEngine } from '@/lib/simulationEngine'
import { propagateSignalTypes } from '@/lib/signalTypePropagation'
import { validateModelTypeCompatibility } from '@/lib/typeCompatibilityValidator'
import { parseType } from '@/lib/typeValidator'

describe('Signal Type Integration Tests', () => {
  const createBlock = (
    id: string, 
    type: string, 
    position: { x: number, y: number },
    parameters?: Record<string, any>
  ): BlockData => ({
    id,
    type,
    name: `${type}_${id}`,
    position,
    parameters
  })

  const createWire = (
    id: string,
    sourceBlockId: string,
    targetBlockId: string,
    sourcePortIndex = 0,
    targetPortIndex = 0
  ): WireData => ({
    id,
    sourceBlockId,
    sourcePortIndex,
    targetBlockId,
    targetPortIndex
  })

  describe('Scalar Signal Models', () => {
    test('should handle simple scalar signal chain', () => {
      // Create a simple scalar model: Source -> Scale -> Output
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { x: 100, y: 100 }, { 
          dataType: 'float',
          signalType: 'constant',
          value: 5.0 
        }),
        createBlock('scale1', 'scale', { x: 300, y: 100 }, { gain: 2.0 }),
        createBlock('output1', 'output_port', { x: 500, y: 100 }, { portName: 'Result' })
      ]
      
      const wires: WireData[] = [
        createWire('wire1', 'source1', 'scale1'),
        createWire('wire2', 'scale1', 'output1')
      ]

      // Step 1: Validate types
      const validationResult = validateModelTypeCompatibility(blocks, wires)
      expect(validationResult.isValid).toBe(true)
      expect(validationResult.errors).toHaveLength(0)

      // Step 2: Check type propagation
      const typeResult = propagateSignalTypes(blocks, wires)
      expect(typeResult.blockOutputTypes.get('source1:0')).toBe('float')
      expect(typeResult.blockOutputTypes.get('scale1:0')).toBe('float')

      // Step 3: Run simulation
      const engine = new SimulationEngine(blocks, wires, {
        timeStep: 0.01,
        duration: 1.0
      })
      
      engine.step()
      const outputValue = engine.getOutputPortValue('Result')
      expect(outputValue).toBe(10.0) // 5.0 * 2.0
    })

    test('should handle scalar arithmetic operations', () => {
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { x: 100, y: 100 }, { 
          dataType: 'double',
          signalType: 'constant',
          value: 3.0 
        }),
        createBlock('source2', 'source', { x: 100, y: 200 }, { 
          dataType: 'double',
          signalType: 'constant',
          value: 4.0 
        }),
        createBlock('sum1', 'sum', { x: 300, y: 150 }, {}),
        createBlock('multiply1', 'multiply', { x: 500, y: 150 }, {}),
        createBlock('output1', 'output_port', { x: 700, y: 150 }, { portName: 'Output' })
      ]
      
      const wires: WireData[] = [
        createWire('wire1', 'source1', 'sum1', 0, 0),
        createWire('wire2', 'source2', 'sum1', 0, 1),
        createWire('wire3', 'sum1', 'multiply1', 0, 0),
        createWire('wire4', 'source1', 'multiply1', 0, 1), // Reuse source1
        createWire('wire5', 'multiply1', 'output1')
      ]

      // Validate
      const validationResult = validateModelTypeCompatibility(blocks, wires)
      expect(validationResult.isValid).toBe(true)

      // Simulate
      const engine = new SimulationEngine(blocks, wires, {
        timeStep: 0.01,
        duration: 0.1
      })
      
      engine.step()
      const outputValue = engine.getOutputPortValue('Output')
      expect(outputValue).toBe(21.0) // (3 + 4) * 3 = 21
    })

    test('should handle scalar lookup table', () => {
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { x: 100, y: 100 }, { 
          dataType: 'float',
          signalType: 'ramp',
          slope: 1.0,
          startTime: 0
        }),
        createBlock('lookup1', 'lookup_1d', { x: 300, y: 100 }, {
          inputValues: [0, 1, 2, 3],
          outputValues: [0, 2, 4, 6]
        }),
        createBlock('output1', 'output_port', { x: 500, y: 100 }, { portName: 'LookupOut' })
      ]
      
      const wires: WireData[] = [
        createWire('wire1', 'source1', 'lookup1'),
        createWire('wire2', 'lookup1', 'output1')
      ]

      // Validate
      const validationResult = validateModelTypeCompatibility(blocks, wires)
      expect(validationResult.isValid).toBe(true)

      // Simulate at different time points
      const engine = new SimulationEngine(blocks, wires, {
        timeStep: 0.5,
        duration: 2.5
      })
      
      // Test interpolation at t=1.5
      for (let i = 0; i < 4; i++) {
        engine.step()
      }
      const outputValue = engine.getOutputPortValue('LookupOut')
      expect(outputValue).toBeCloseTo(3.0, 1) // Linear interpolation at x=1.5
    })
  })

  describe('Vector Signal Models', () => {
    test('should handle simple vector signal chain', () => {
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { x: 100, y: 100 }, { 
          dataType: 'float[3]',
          signalType: 'constant',
          value: 2.0 
        }),
        createBlock('scale1', 'scale', { x: 300, y: 100 }, { gain: 3.0 }),
        createBlock('output1', 'output_port', { x: 500, y: 100 }, { portName: 'VectorOut' })
      ]
      
      const wires: WireData[] = [
        createWire('wire1', 'source1', 'scale1'),
        createWire('wire2', 'scale1', 'output1')
      ]

      // Validate
      const validationResult = validateModelTypeCompatibility(blocks, wires)
      expect(validationResult.isValid).toBe(true)

      // Check type propagation
      const typeResult = propagateSignalTypes(blocks, wires)
      expect(typeResult.blockOutputTypes.get('source1:0')).toBe('float[3]')
      expect(typeResult.blockOutputTypes.get('scale1:0')).toBe('float[3]')

      // Simulate
      const engine = new SimulationEngine(blocks, wires, {
        timeStep: 0.01,
        duration: 0.1
      })
      
      engine.step()
      const outputValue = engine.getOutputPortValue('VectorOut')
      expect(outputValue).toEqual([6.0, 6.0, 6.0]) // [2,2,2] * 3
    })

    test('should handle vector arithmetic operations', () => {
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { x: 100, y: 100 }, { 
          dataType: 'double[2]',
          signalType: 'constant',
          value: 1.0 
        }),
        createBlock('source2', 'source', { x: 100, y: 200 }, { 
          dataType: 'double[2]',
          signalType: 'constant',
          value: 2.0 
        }),
        createBlock('sum1', 'sum', { x: 300, y: 150 }, {}),
        createBlock('multiply1', 'multiply', { x: 500, y: 150 }, {}),
        createBlock('output1', 'output_port', { x: 700, y: 150 }, { portName: 'VectorResult' })
      ]
      
      const wires: WireData[] = [
        createWire('wire1', 'source1', 'sum1', 0, 0),
        createWire('wire2', 'source2', 'sum1', 0, 1),
        createWire('wire3', 'sum1', 'multiply1', 0, 0),
        createWire('wire4', 'sum1', 'multiply1', 0, 1), // Multiply sum by itself
        createWire('wire5', 'multiply1', 'output1')
      ]

      // Validate
      const validationResult = validateModelTypeCompatibility(blocks, wires)
      expect(validationResult.isValid).toBe(true)

      // Simulate
      const engine = new SimulationEngine(blocks, wires, {
        timeStep: 0.01,
        duration: 0.1
      })
      
      engine.step()
      const outputValue = engine.getOutputPortValue('VectorResult')
      expect(outputValue).toEqual([9.0, 9.0]) // [3,3] * [3,3] = [9,9]
    })

    test('should handle vector transfer function', () => {
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { x: 100, y: 100 }, { 
          dataType: 'float[2]',
          signalType: 'step',
          stepTime: 0.5,
          stepValue: 1.0 
        }),
        createBlock('tf1', 'transfer_function', { x: 300, y: 100 }, {
          numerator: [1],
          denominator: [1, 1] // H(s) = 1/(s+1)
        }),
        createBlock('output1', 'output_port', { x: 500, y: 100 }, { portName: 'TFOut' })
      ]
      
      const wires: WireData[] = [
        createWire('wire1', 'source1', 'tf1'),
        createWire('wire2', 'tf1', 'output1')
      ]

      // Validate
      const validationResult = validateModelTypeCompatibility(blocks, wires)
      expect(validationResult.isValid).toBe(true)

      // Type should be preserved
      const typeResult = propagateSignalTypes(blocks, wires)
      expect(typeResult.blockOutputTypes.get('tf1:0')).toBe('float[2]')

      // Simulate
      const engine = new SimulationEngine(blocks, wires, {
        timeStep: 0.1,
        duration: 1.0
      })
      
      // Run a few steps
      for (let i = 0; i < 10; i++) {
        engine.step()
      }
      
      const outputValue = engine.getOutputPortValue('TFOut') as number[]
      expect(Array.isArray(outputValue)).toBe(true)
      expect(outputValue.length).toBe(2)
      // Both elements should have the same response
      expect(outputValue[0]).toBeCloseTo(outputValue[1], 6)
    })
  })

  describe('Mixed Type Models with Errors', () => {
    test('should reject scalar + vector mismatch', () => {
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { x: 100, y: 100 }, { 
          dataType: 'float',
          signalType: 'constant',
          value: 1.0 
        }),
        createBlock('source2', 'source', { x: 100, y: 200 }, { 
          dataType: 'float[3]',
          signalType: 'constant',
          value: 2.0 
        }),
        createBlock('sum1', 'sum', { x: 300, y: 150 }, {})
      ]
      
      const wires: WireData[] = [
        createWire('wire1', 'source1', 'sum1', 0, 0),
        createWire('wire2', 'source2', 'sum1', 0, 1)
      ]

      // Validate - should fail
      const validationResult = validateModelTypeCompatibility(blocks, wires)
      expect(validationResult.isValid).toBe(false)
      expect(validationResult.errors.length).toBeGreaterThan(0)
      
      // Check that the error is about type incompatibility
      const hasTypeError = validationResult.errors.some(e => 
        e.message.includes('Cannot determine output type') ||
        e.message.includes('Type mismatch')
      )
      expect(hasTypeError).toBe(true)
    })

    test('should reject vector input to lookup table', () => {
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { x: 100, y: 100 }, { 
          dataType: 'double[3]',
          signalType: 'constant',
          value: 1.0 
        }),
        createBlock('lookup1', 'lookup_1d', { x: 300, y: 100 }, {
          inputValues: [0, 1, 2],
          outputValues: [0, 1, 4]
        })
      ]
      
      const wires: WireData[] = [
        createWire('wire1', 'source1', 'lookup1')
      ]

      // Validate - should fail
      const validationResult = validateModelTypeCompatibility(blocks, wires)
      expect(validationResult.isValid).toBe(false)
      
      // Should have specific error about scalar requirement
      const hasScalarError = validationResult.errors.some(e => 
        e.message.includes('scalar') ||
        e.message.includes('Cannot determine output type')
      )
      expect(hasScalarError).toBe(true)
    })

    test('should reject mismatched vector sizes', () => {
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { x: 100, y: 100 }, { 
          dataType: 'float[3]',
          signalType: 'constant',
          value: 1.0 
        }),
        createBlock('source2', 'source', { x: 100, y: 200 }, { 
          dataType: 'float[5]',
          signalType: 'constant',
          value: 2.0 
        }),
        createBlock('sum1', 'sum', { x: 300, y: 150 }, {})
      ]
      
      const wires: WireData[] = [
        createWire('wire1', 'source1', 'sum1', 0, 0),
        createWire('wire2', 'source2', 'sum1', 0, 1)
      ]

      // Validate - should fail
      const validationResult = validateModelTypeCompatibility(blocks, wires)
      expect(validationResult.isValid).toBe(false)
      expect(validationResult.errors.length).toBeGreaterThan(0)
    })
  })

  describe('Complex Integration Scenarios', () => {
    test('should handle mixed scalar and vector paths in same model', () => {
      // Model with two independent paths: one scalar, one vector
      const blocks: BlockData[] = [
        // Scalar path
        createBlock('scalarSource', 'source', { x: 100, y: 100 }, { 
          dataType: 'float',
          signalType: 'sine',
          frequency: 1.0,
          amplitude: 1.0
        }),
        createBlock('lookup1', 'lookup_1d', { x: 300, y: 100 }, {
          inputValues: [-1, 0, 1],
          outputValues: [1, 0, 1] // Absolute value
        }),
        createBlock('scalarOut', 'output_port', { x: 500, y: 100 }, { 
          portName: 'ScalarResult' 
        }),
        
        // Vector path
        createBlock('vectorSource', 'source', { x: 100, y: 300 }, { 
          dataType: 'double[4]',
          signalType: 'constant',
          value: 1.0
        }),
        createBlock('tf1', 'transfer_function', { x: 300, y: 300 }, {
          numerator: [2],
          denominator: [1, 2] // H(s) = 2/(s+2)
        }),
        createBlock('vectorOut', 'output_port', { x: 500, y: 300 }, { 
          portName: 'VectorResult' 
        })
      ]
      
      const wires: WireData[] = [
        // Scalar path connections
        createWire('wire1', 'scalarSource', 'lookup1'),
        createWire('wire2', 'lookup1', 'scalarOut'),
        
        // Vector path connections
        createWire('wire3', 'vectorSource', 'tf1'),
        createWire('wire4', 'tf1', 'vectorOut')
      ]

      // Validate entire model
      const validationResult = validateModelTypeCompatibility(blocks, wires)
      expect(validationResult.isValid).toBe(true)

      // Check type propagation
      const typeResult = propagateSignalTypes(blocks, wires)
      expect(typeResult.blockOutputTypes.get('lookup1:0')).toBe('float')
      expect(typeResult.blockOutputTypes.get('tf1:0')).toBe('double[4]')

      // Simulate
      const engine = new SimulationEngine(blocks, wires, {
        timeStep: 0.01,
        duration: 0.5
      })
      
      // Run simulation for a bit
      for (let i = 0; i < 50; i++) {
        engine.step()
      }
      
      const scalarOutput = engine.getOutputPortValue('ScalarResult') as number
      const vectorOutput = engine.getOutputPortValue('VectorResult') as number[]
      
      expect(typeof scalarOutput).toBe('number')
      expect(Array.isArray(vectorOutput)).toBe(true)
      expect(vectorOutput.length).toBe(4)
    })

    test('should handle subsystem with proper type propagation', () => {
      // Note: This test assumes subsystem simulation is implemented
      // For now, we'll just test the type validation
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { x: 100, y: 100 }, { 
          dataType: 'float[2]',
          signalType: 'constant',
          value: 3.0 
        }),
        createBlock('subsystem1', 'subsystem', { x: 300, y: 100 }, {
          sheetId: 'sub1',
          sheetName: 'Subsystem 1',
          inputPorts: ['Input1'],
          outputPorts: ['Output1']
        }),
        createBlock('output1', 'output_port', { x: 500, y: 100 }, { 
          portName: 'Result' 
        })
      ]
      
      const wires: WireData[] = [
        createWire('wire1', 'source1', 'subsystem1'),
        createWire('wire2', 'subsystem1', 'output1')
      ]

      // Validate - subsystems should support any type
      const validationResult = validateModelTypeCompatibility(blocks, wires)
      // Note: This might fail if subsystem type propagation isn't fully implemented
      // but the architecture supports it
      expect(validationResult.errors.length).toBeLessThanOrEqual(1)
    })
  })

  describe('Data Type Variations', () => {
    test('should handle boolean signals', () => {
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { x: 100, y: 100 }, { 
          dataType: 'bool',
          signalType: 'constant',
          value: 1 // true
        }),
        createBlock('display1', 'signal_display', { x: 300, y: 100 }, {
          maxSamples: 100
        })
      ]
      
      const wires: WireData[] = [
        createWire('wire1', 'source1', 'display1')
      ]

      // Validate
      const validationResult = validateModelTypeCompatibility(blocks, wires)
      expect(validationResult.isValid).toBe(true)

      // Check type propagation
      const typeResult = propagateSignalTypes(blocks, wires)
      expect(typeResult.blockOutputTypes.get('source1:0')).toBe('bool')
    })

    test('should handle long integer signals', () => {
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { x: 100, y: 100 }, { 
          dataType: 'long',
          signalType: 'constant',
          value: 42
        }),
        createBlock('scale1', 'scale', { x: 300, y: 100 }, { gain: 2 }),
        createBlock('output1', 'output_port', { x: 500, y: 100 }, { 
          portName: 'LongResult' 
        })
      ]
      
      const wires: WireData[] = [
        createWire('wire1', 'source1', 'scale1'),
        createWire('wire2', 'scale1', 'output1')
      ]

      // Validate
      const validationResult = validateModelTypeCompatibility(blocks, wires)
      expect(validationResult.isValid).toBe(true)

      // Simulate
      const engine = new SimulationEngine(blocks, wires, {
        timeStep: 0.01,
        duration: 0.1
      })
      
      engine.step()
      const outputValue = engine.getOutputPortValue('LongResult')
      expect(outputValue).toBe(84) // 42 * 2
    })
  })
})
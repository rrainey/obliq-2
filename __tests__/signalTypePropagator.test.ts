// lib/__tests__/signalTypePropagation.test.ts

import {
  propagateSignalTypes,
  calculateMatrixMultiplyOutputType
} from '@/lib/signalTypePropagation'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'

describe('signalTypePropagation', () => {
  const createBlock = (
    id: string, 
    type: string, 
    parameters?: Record<string, any>
  ): BlockData => ({
    id,
    type,
    name: `${type}_${id}`,
    position: { x: 0, y: 0 },
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

  describe('basic propagation', () => {
    it('should propagate types from source blocks', () => {
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { dataType: 'float' }),
        createBlock('sum1', 'sum')
      ]
      const wires: WireData[] = [
        createWire('wire1', 'source1', 'sum1')
      ]

      const result = propagateSignalTypes(blocks, wires)
      
      expect(result.errors).toHaveLength(0)
      expect(result.blockOutputTypes.get('source1:0')).toBe('float')
      expect(result.signalTypes.get('wire1')?.type).toBe('float')
    })

    it('should propagate array types', () => {
      const blocks: BlockData[] = [
        createBlock('input1', 'input_port', { dataType: 'double[3]' }),
        createBlock('scale1', 'scale', { gain: 2 })
      ]
      const wires: WireData[] = [
        createWire('wire1', 'input1', 'scale1')
      ]

      const result = propagateSignalTypes(blocks, wires)
      
      expect(result.errors).toHaveLength(0)
      expect(result.blockOutputTypes.get('input1:0')).toBe('double[3]')
      expect(result.blockOutputTypes.get('scale1:0')).toBe('double[3]')
    })
  })

describe('arithmetic blocks', () => {
  test('should validate matching types for sum block', () => {
    const blocks: BlockData[] = [
      createBlock('source1', 'source', { dataType: 'float' }),
      createBlock('source2', 'source', { dataType: 'float' }),
      createBlock('sum1', 'sum')
    ]
    const wires: WireData[] = [
      createWire('wire1', 'source1', 'sum1', 0, 0),
      createWire('wire2', 'source2', 'sum1', 0, 1)
    ]

    const result = propagateSignalTypes(blocks, wires)
    
    expect(result.errors).toHaveLength(0)
    expect(result.blockOutputTypes.get('sum1:0')).toBe('float')
  })

  test('should detect incompatible vector size mismatch in sum block', () => {
    const blocks: BlockData[] = [
      createBlock('source1', 'source', { dataType: 'double[3]' }),
      createBlock('source2', 'source', { dataType: 'double[4]' }),
      createBlock('sum1', 'sum')
    ]
    const wires: WireData[] = [
      createWire('wire1', 'source1', 'sum1', 0, 0),
      createWire('wire2', 'source2', 'sum1', 0, 1)
    ]

    const result = propagateSignalTypes(blocks, wires)

    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].message).toContain('Cannot determine output type')
    expect(result.errors[0].blockId).toBe('sum1')
  })

  test('should handle vector addition', () => {
    const blocks: BlockData[] = [
      createBlock('source1', 'source', { dataType: 'float[3]' }),
      createBlock('source2', 'source', { dataType: 'float[3]' }),
      createBlock('sum1', 'sum')
    ]
    const wires: WireData[] = [
      createWire('wire1', 'source1', 'sum1', 0, 0),
      createWire('wire2', 'source2', 'sum1', 0, 1)
    ]

    const result = propagateSignalTypes(blocks, wires)
    
    expect(result.errors).toHaveLength(0)
    expect(result.blockOutputTypes.get('sum1:0')).toBe('float[3]')
  })

  test('should broadcast scalar + vector (Simulink-style)', () => {
    const blocks: BlockData[] = [
      createBlock('source1', 'source', { dataType: 'float' }),
      createBlock('source2', 'source', { dataType: 'float[3]' }),
      createBlock('sum1', 'sum')
    ]
    const wires: WireData[] = [
      createWire('wire1', 'source1', 'sum1', 0, 0),
      createWire('wire2', 'source2', 'sum1', 0, 1)
    ]

    const result = propagateSignalTypes(blocks, wires)

    expect(result.errors).toHaveLength(0)
    expect(result.blockOutputTypes.get('sum1:0')).toBe('float[3]')
  })

  test('sum of elements: single vector input → scalar base type', () => {
    const blocks: BlockData[] = [
      createBlock('source1', 'source', { dataType: 'double[3]' }),
      createBlock('sum1', 'sum', { signs: '+', numInputs: 1 })
    ]
    const wires: WireData[] = [createWire('wire1', 'source1', 'sum1', 0, 0)]

    const result = propagateSignalTypes(blocks, wires)

    expect(result.errors).toHaveLength(0)
    expect(result.blockOutputTypes.get('sum1:0')).toBe('double')
  })

  test('sum of elements: single matrix input → scalar base type', () => {
    const blocks: BlockData[] = [
      createBlock('source1', 'source', { dataType: 'double[3][3]' }),
      createBlock('sum1', 'sum', { signs: '+', numInputs: 1 })
    ]
    const wires: WireData[] = [createWire('wire1', 'source1', 'sum1', 0, 0)]

    const result = propagateSignalTypes(blocks, wires)

    expect(result.errors).toHaveLength(0)
    expect(result.blockOutputTypes.get('sum1:0')).toBe('double')
  })

  test('element-wise: two double[3] inputs → double[3] output', () => {
    const blocks: BlockData[] = [
      createBlock('source1', 'source', { dataType: 'double[3]' }),
      createBlock('source2', 'source', { dataType: 'double[3]' }),
      createBlock('sum1', 'sum', { signs: '+-', numInputs: 2 })
    ]
    const wires: WireData[] = [
      createWire('wire1', 'source1', 'sum1', 0, 0),
      createWire('wire2', 'source2', 'sum1', 0, 1)
    ]

    const result = propagateSignalTypes(blocks, wires)

    expect(result.errors).toHaveLength(0)
    expect(result.blockOutputTypes.get('sum1:0')).toBe('double[3]')
  })
})

describe('matrix_multiply scalar × vector', () => {
  test('calculateMatrixMultiplyOutputType covers scalar×vector and reverse', () => {
    expect(calculateMatrixMultiplyOutputType('double', 'double[3]')).toBe('double[3]')
    expect(calculateMatrixMultiplyOutputType('double[3]', 'double')).toBe('double[3]')
    expect(calculateMatrixMultiplyOutputType('double', 'double')).toBe('double')
    expect(calculateMatrixMultiplyOutputType('double[3]', 'double[3]')).toBe('double[3]')
    expect(calculateMatrixMultiplyOutputType('double[3]', 'double[4]')).toBeNull()
  })

  test('propagates scalar × vector through matrix_multiply (9.3 aero path)', () => {
    // D_mag (scalar) * v_hat (vector) → D_vec (vector) → uminus → sum with F_thrust
    const blocks: BlockData[] = [
      createBlock('dmag', 'source', { dataType: 'double' }),
      createBlock('vhat', 'source', { dataType: 'double[3]' }),
      createBlock('fthrust', 'source', { dataType: 'double[3]' }),
      createBlock('dvec', 'matrix_multiply'),
      createBlock('faero', 'uminus'),
      createBlock('fb', 'sum', { signs: '++', numInputs: 2 })
    ]
    const wires: WireData[] = [
      createWire('w1', 'dmag', 'dvec', 0, 0),
      createWire('w2', 'vhat', 'dvec', 0, 1),
      createWire('w3', 'dvec', 'faero'),
      createWire('w4', 'fthrust', 'fb', 0, 0),
      createWire('w5', 'faero', 'fb', 0, 1)
    ]

    const result = propagateSignalTypes(blocks, wires)

    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    expect(result.blockOutputTypes.get('dvec:0')).toBe('double[3]')
    expect(result.blockOutputTypes.get('faero:0')).toBe('double[3]')
    expect(result.blockOutputTypes.get('fb:0')).toBe('double[3]')
  })
})

describe('lookup blocks', () => {
  test('should accept scalar inputs for lookup_1d', () => {
    const blocks: BlockData[] = [
      createBlock('source1', 'source', { dataType: 'float' }),
      createBlock('lookup1', 'lookup_1d')
    ]
    const wires: WireData[] = [
      createWire('wire1', 'source1', 'lookup1')
    ]

    const result = propagateSignalTypes(blocks, wires)
    
    expect(result.errors).toHaveLength(0)
    expect(result.blockOutputTypes.get('lookup1:0')).toBe('float')
  })

  test('should reject vector inputs for lookup_1d', () => {
    const blocks: BlockData[] = [
      createBlock('source1', 'source', { dataType: 'float[3]' }),
      createBlock('lookup1', 'lookup_1d')
    ]
    const wires: WireData[] = [
      createWire('wire1', 'source1', 'lookup1')
    ]

    const result = propagateSignalTypes(blocks, wires)
    
    expect(result.errors.length).toBeGreaterThan(0)
    // Primary error might be about unable to determine output type
    // or specific scalar requirement
    const error = result.errors[0]
    expect(
      error.message.includes('Cannot determine output type') ||
      error.message.includes('requires scalar inputs') ||
      error.message.includes('scalar')
    ).toBe(true)
    
    // Check if there's a more specific error about scalar requirement
    const scalarError = result.errors.find(e => 
      e.message.includes('requires scalar inputs')
    )
    if (scalarError) {
      expect(scalarError.blockId).toBe('lookup1')
    }
  })

  test('should handle lookup_2d with two scalar inputs', () => {
    const blocks: BlockData[] = [
      createBlock('source1', 'source', { dataType: 'double' }),
      createBlock('source2', 'source', { dataType: 'double' }),
      createBlock('lookup2', 'lookup_2d')
    ]
    const wires: WireData[] = [
      createWire('wire1', 'source1', 'lookup2', 0, 0),
      createWire('wire2', 'source2', 'lookup2', 0, 1)
    ]

    const result = propagateSignalTypes(blocks, wires)
    
    expect(result.errors).toHaveLength(0)
    expect(result.blockOutputTypes.get('lookup2:0')).toBe('double')
  })
})

  describe('transfer function blocks', () => {
    it('should preserve scalar type through transfer function', () => {
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { dataType: 'double' }),
        createBlock('tf1', 'transfer_function', { 
          numerator: [1], 
          denominator: [1, 1] 
        })
      ]
      const wires: WireData[] = [
        createWire('wire1', 'source1', 'tf1')
      ]

      const result = propagateSignalTypes(blocks, wires)
      
      expect(result.errors).toHaveLength(0)
      expect(result.blockOutputTypes.get('tf1:0')).toBe('double')
    })

    it('should handle vector inputs for transfer function', () => {
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { dataType: 'float[2]' }),
        createBlock('tf1', 'transfer_function', { 
          numerator: [1], 
          denominator: [1, 1] 
        })
      ]
      const wires: WireData[] = [
        createWire('wire1', 'source1', 'tf1')
      ]

      const result = propagateSignalTypes(blocks, wires)
      
      expect(result.errors).toHaveLength(0)
      expect(result.blockOutputTypes.get('tf1:0')).toBe('float[2]')
    })
  })

  describe('complex models', () => {
    it('should propagate through chain of blocks', () => {
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { dataType: 'float' }),
        createBlock('scale1', 'scale', { gain: 2 }),
        createBlock('tf1', 'transfer_function', { 
          numerator: [1], 
          denominator: [1, 1] 
        }),
        createBlock('output1', 'output_port')
      ]
      const wires: WireData[] = [
        createWire('wire1', 'source1', 'scale1'),
        createWire('wire2', 'scale1', 'tf1'),
        createWire('wire3', 'tf1', 'output1')
      ]

      const result = propagateSignalTypes(blocks, wires)
      
      expect(result.errors).toHaveLength(0)
      expect(result.blockOutputTypes.get('scale1:0')).toBe('float')
      expect(result.blockOutputTypes.get('tf1:0')).toBe('float')
    })

    it('should handle parallel paths with type checking', () => {
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { dataType: 'double[4]' }),
        createBlock('source2', 'source', { dataType: 'double[4]' }),
        createBlock('scale1', 'scale', { gain: 2 }),
        createBlock('scale2', 'scale', { gain: 3 }),
        createBlock('sum1', 'sum')
      ]
      const wires: WireData[] = [
        createWire('wire1', 'source1', 'scale1'),
        createWire('wire2', 'source2', 'scale2'),
        createWire('wire3', 'scale1', 'sum1', 0, 0),
        createWire('wire4', 'scale2', 'sum1', 0, 1)
      ]

      const result = propagateSignalTypes(blocks, wires)
      
      expect(result.errors).toHaveLength(0)
      expect(result.blockOutputTypes.get('sum1:0')).toBe('double[4]')
    })
  })

  describe('error handling', () => {
    it('should report invalid dataType in source block', () => {
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { dataType: 'invalid_type' })
      ]
      const wires: WireData[] = []

      const result = propagateSignalTypes(blocks, wires)
      
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].message).toContain('Invalid data type')
    })

    it('should handle disconnected blocks gracefully', () => {
      const blocks: BlockData[] = [
        createBlock('source1', 'source', { dataType: 'float' }),
        createBlock('sum1', 'sum'), // No inputs connected
        createBlock('output1', 'output_port')
      ]
      const wires: WireData[] = []

      const result = propagateSignalTypes(blocks, wires)
      
      // Should not crash, but sum block won't have determined type
      expect(result.blockOutputTypes.has('sum1:0')).toBe(false)
    })

    it('should handle cycles in the graph', () => {
      const blocks: BlockData[] = [
        createBlock('sum1', 'sum'),
        createBlock('scale1', 'scale', { gain: 2 })
      ]
      const wires: WireData[] = [
        createWire('wire1', 'sum1', 'scale1'),
        createWire('wire2', 'scale1', 'sum1') // Creates a cycle
      ]

      // Should not crash or infinite loop
      const result = propagateSignalTypes(blocks, wires)
      expect(result).toBeDefined()
    })

    it('should type integrators in a feedback loop via x(0) ports', () => {
      // Minimal free-fall: ṙ = v, v̇ = -mu/r² with external ICs
      const blocks: BlockData[] = [
        createBlock('mu', 'source', { dataType: 'double', signalType: 'constant', value: 1 }),
        createBlock('r0', 'source', { dataType: 'double', signalType: 'constant', value: 1 }),
        createBlock('v0', 'source', { dataType: 'double', signalType: 'constant', value: 0 }),
        createBlock('r', 'integrator', { showInitPort: true, initialValue: 0 }),
        createBlock('v', 'integrator', { showInitPort: true, initialValue: 0 }),
        createBlock('r_sq', 'multiply', { numInputs: 2 }),
        createBlock('mu_over_r2', 'divide'),
        createBlock('accel', 'uminus'),
        createBlock('r_out', 'output_port'),
        createBlock('v_out', 'output_port'),
        createBlock('a_out', 'output_port'),
      ]
      const wires: WireData[] = [
        createWire('w_r0', 'r0', 'r', 0, 1),
        createWire('w_v0', 'v0', 'v', 0, 1),
        createWire('w_v_to_r', 'v', 'r', 0, 0),
        createWire('w_a_to_v', 'accel', 'v', 0, 0),
        createWire('w_r_mul0', 'r', 'r_sq', 0, 0),
        createWire('w_r_mul1', 'r', 'r_sq', 0, 1),
        createWire('w_mu_div', 'mu', 'mu_over_r2', 0, 0),
        createWire('w_rsq_div', 'r_sq', 'mu_over_r2', 0, 1),
        createWire('w_div_um', 'mu_over_r2', 'accel', 0, 0),
        createWire('w_r_out', 'r', 'r_out'),
        createWire('w_v_out', 'v', 'v_out'),
        createWire('w_a_out', 'accel', 'a_out'),
      ]

      const result = propagateSignalTypes(blocks, wires)

      expect(result.blockOutputTypes.get('r:0')).toBe('double')
      expect(result.blockOutputTypes.get('v:0')).toBe('double')
      expect(result.blockOutputTypes.get('accel:0')).toBe('double')
      expect(result.signalTypes.get('w_v_to_r')?.type).toBe('double')
      expect(result.signalTypes.get('w_a_to_v')?.type).toBe('double')
      expect(result.signalTypes.get('w_r_out')?.type).toBe('double')
      for (const w of wires) {
        expect(result.signalTypes.has(w.id)).toBe(true)
      }
    })

  })
})

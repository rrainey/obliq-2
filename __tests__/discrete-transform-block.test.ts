// __tests__/discrete-transform-block.test.ts

import { DiscreteTransformBlockModule } from '@/lib/blocks/DiscreteTransformBlockModule'
import { BlockData } from '@/components/BlockNode'

describe('Discrete Transform Block (Z-Transform)', () => {
  describe('Code Generation', () => {
    test('should generate pure gain code for single coefficient case', () => {
      const block: BlockData = {
        id: 'dtf1',
        name: 'SimpleGain',
        type: 'discrete_transform',
        position: { x: 0, y: 0 },
        parameters: {
          numerator: [2],
          denominator: [1],
          sampleInterval: 0.01
        }
      }

      const module = new DiscreteTransformBlockModule()
      const code = module.generateComputation(block, ['model->signals.Input1'], ['double'])

      expect(code).toContain('Discrete transfer function block: SimpleGain')
      expect(code).toContain('model->signals.SimpleGain = model->signals.Input1 * 2')
    })

    test('should generate first-order difference equation code', () => {
      const block: BlockData = {
        id: 'dtf1',
        name: 'FirstOrder',
        type: 'discrete_transform',
        position: { x: 0, y: 0 },
        parameters: {
          numerator: [1],
          denominator: [1, -0.5],
          sampleInterval: 0.01
        }
      }

      const module = new DiscreteTransformBlockModule()
      const code = module.generateComputation(block, ['model->signals.Input1'], ['double'])

      expect(code).toContain('Discrete transfer function block: FirstOrder')
      expect(code).toContain('Sample interval: 0.01s')
      expect(code).toContain('next_sample_time')
      expect(code).toContain('new_output')
      expect(code).toContain('output_history')
    })

    test('should generate code with numerator dynamics', () => {
      const block: BlockData = {
        id: 'dtf1',
        name: 'WithNumerator',
        type: 'discrete_transform',
        position: { x: 0, y: 0 },
        parameters: {
          numerator: [1, 0.5],
          denominator: [1, -0.8],
          sampleInterval: 0.02
        }
      }

      const module = new DiscreteTransformBlockModule()
      const code = module.generateComputation(block, ['model->signals.Input1'], ['double'])

      expect(code).toContain('input_history')
      expect(code).toContain('output_history')
      expect(code).toContain('0.5')  // b1 coefficient
      expect(code).toContain('-0.8') // -a1 coefficient (negated in feedback)
    })

    test('should handle vector input', () => {
      const block: BlockData = {
        id: 'dtf1',
        name: 'VectorDTF',
        type: 'discrete_transform',
        position: { x: 0, y: 0 },
        parameters: {
          numerator: [1],
          denominator: [1, -0.5],
          sampleInterval: 0.01
        }
      }

      const module = new DiscreteTransformBlockModule()
      const code = module.generateComputation(block, ['model->signals.VectorInput'], ['double[3]'])

      expect(code).toContain('Vector discrete transfer function update')
      expect(code).toContain('for (int _idx = 0; _idx < 3; _idx++)')
    })

    test('should handle matrix input', () => {
      const block: BlockData = {
        id: 'dtf1',
        name: 'MatrixDTF',
        type: 'discrete_transform',
        position: { x: 0, y: 0 },
        parameters: {
          numerator: [1],
          denominator: [1, -0.5],
          sampleInterval: 0.01
        }
      }

      const module = new DiscreteTransformBlockModule()
      const code = module.generateComputation(block, ['model->signals.MatrixInput'], ['double[2][3]'])

      expect(code).toContain('Matrix discrete transfer function update')
      expect(code).toContain('for (int _row = 0; _row < 2; _row++)')
      expect(code).toContain('for (int _col = 0; _col < 3; _col++)')
    })
  })

  describe('State Generation', () => {
    test('should generate state struct members for first-order system', () => {
      const block: BlockData = {
        id: 'dtf1',
        name: 'FirstOrder',
        type: 'discrete_transform',
        position: { x: 0, y: 0 },
        parameters: {
          numerator: [1],
          denominator: [1, -0.5],
          sampleInterval: 0.01
        }
      }

      const module = new DiscreteTransformBlockModule()
      const members = module.generateStateStructMembers(block, 'double')

      expect(members).toContain('    double FirstOrder_next_sample_time;')
      expect(members.some(m => m.includes('FirstOrder_output_history'))).toBe(true)
    })

    test('should generate state for vector output', () => {
      const block: BlockData = {
        id: 'dtf1',
        name: 'VectorDTF',
        type: 'discrete_transform',
        position: { x: 0, y: 0 },
        parameters: {
          numerator: [1, 0.5],
          denominator: [1, -0.8],
          sampleInterval: 0.01
        }
      }

      const module = new DiscreteTransformBlockModule()
      const members = module.generateStateStructMembers(block, 'double[3]')

      expect(members.some(m => m.includes('[3]'))).toBe(true)
    })

    test('should not generate state for pure gain', () => {
      const block: BlockData = {
        id: 'dtf1',
        name: 'PureGain',
        type: 'discrete_transform',
        position: { x: 0, y: 0 },
        parameters: {
          numerator: [5],
          denominator: [1],
          sampleInterval: 0.01
        }
      }

      const module = new DiscreteTransformBlockModule()
      const members = module.generateStateStructMembers(block, 'double')

      expect(members).toHaveLength(0)
    })
  })

  describe('Initialization', () => {
    test('should generate initialization code', () => {
      const block: BlockData = {
        id: 'dtf1',
        name: 'FirstOrder',
        type: 'discrete_transform',
        position: { x: 0, y: 0 },
        parameters: {
          numerator: [1],
          denominator: [1, -0.5],
          sampleInterval: 0.01
        }
      }

      const module = new DiscreteTransformBlockModule()
      const code = module.generateInitialization(block)

      expect(code).toContain('Initialize discrete transfer function: FirstOrder')
      expect(code).toContain('next_sample_time = 0.0')
      expect(code).toContain('memset')
    })

    test('should not generate initialization for pure gain', () => {
      const block: BlockData = {
        id: 'dtf1',
        name: 'PureGain',
        type: 'discrete_transform',
        position: { x: 0, y: 0 },
        parameters: {
          numerator: [5],
          denominator: [1],
          sampleInterval: 0.01
        }
      }

      const module = new DiscreteTransformBlockModule()
      const code = module.generateInitialization(block)

      expect(code).toBe('')
    })
  })

  describe('Block Properties', () => {
    test('should report correct input/output port counts', () => {
      const block: BlockData = {
        id: 'dtf1',
        name: 'Test',
        type: 'discrete_transform',
        position: { x: 0, y: 0 },
        parameters: {}
      }

      const module = new DiscreteTransformBlockModule()

      expect(module.getInputPortCount(block)).toBe(1)
      expect(module.getOutputPortCount(block)).toBe(1)
    })

    test('should report direct feedthrough when b0 is non-zero', () => {
      const block: BlockData = {
        id: 'dtf1',
        name: 'Test',
        type: 'discrete_transform',
        position: { x: 0, y: 0 },
        parameters: {
          numerator: [1, 0.5],
          denominator: [1, -0.8]
        }
      }

      const module = new DiscreteTransformBlockModule()
      expect(module.isDirectFeedthrough?.(block)).toBe(true)
    })

    test('should report no direct feedthrough when b0 is zero', () => {
      const block: BlockData = {
        id: 'dtf1',
        name: 'Test',
        type: 'discrete_transform',
        position: { x: 0, y: 0 },
        parameters: {
          numerator: [0, 1],
          denominator: [1, -0.8]
        }
      }

      const module = new DiscreteTransformBlockModule()
      expect(module.isDirectFeedthrough?.(block)).toBe(false)
    })

    test('should report state required for dynamic systems', () => {
      const block: BlockData = {
        id: 'dtf1',
        name: 'Test',
        type: 'discrete_transform',
        position: { x: 0, y: 0 },
        parameters: {
          numerator: [1],
          denominator: [1, -0.5]
        }
      }

      const module = new DiscreteTransformBlockModule()
      expect(module.requiresState(block)).toBe(true)
    })

    test('should report no state required for pure gain', () => {
      const block: BlockData = {
        id: 'dtf1',
        name: 'Test',
        type: 'discrete_transform',
        position: { x: 0, y: 0 },
        parameters: {
          numerator: [5],
          denominator: [1]
        }
      }

      const module = new DiscreteTransformBlockModule()
      expect(module.requiresState(block)).toBe(false)
    })

    test('should output same type as input', () => {
      const block: BlockData = {
        id: 'dtf1',
        name: 'Test',
        type: 'discrete_transform',
        position: { x: 0, y: 0 },
        parameters: {}
      }

      const module = new DiscreteTransformBlockModule()

      expect(module.getOutputType(block, ['double'])).toBe('double')
      expect(module.getOutputType(block, ['double[3]'])).toBe('double[3]')
      expect(module.getOutputType(block, ['double[2][3]'])).toBe('double[2][3]')
    })
  })
})

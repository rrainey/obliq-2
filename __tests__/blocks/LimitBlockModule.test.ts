// __tests__/blocks/LimitBlockModule.test.ts
// Tests for C code generation only (JS simulation engine removed)

import { LimitBlockModule } from '@/lib/blocks/LimitBlockModule'
import { BlockData } from '@/components/BlockNode'

describe('LimitBlockModule', () => {
  const module = new LimitBlockModule()

  const createBlock = (name: string, lowerLimit = -1, upperLimit = 1): BlockData => ({
    id: `${name}-id`,
    type: 'limit',
    name,
    position: { x: 0, y: 0 },
    parameters: { lowerLimit, upperLimit }
  })

  describe('Port configuration', () => {
    test('has exactly 1 input port', () => {
      const block = createBlock('Limit1')
      expect(module.getInputPortCount(block)).toBe(1)
    })

    test('has exactly 1 output port', () => {
      const block = createBlock('Limit1')
      expect(module.getOutputPortCount(block)).toBe(1)
    })

    test('input port is labeled "Input"', () => {
      const block = createBlock('Limit1')
      expect(module.getInputPortLabels?.(block)).toEqual(['Input'])
    })

    test('output port is labeled "Output"', () => {
      const block = createBlock('Limit1')
      expect(module.getOutputPortLabels?.(block)).toEqual(['Output'])
    })
  })

  describe('State requirements', () => {
    test('does not require state (stateless block)', () => {
      const block = createBlock('Limit1')
      expect(module.requiresState(block)).toBe(false)
    })

    test('generates no state struct members', () => {
      const block = createBlock('Limit1')
      expect(module.generateStateStructMembers(block, 'double')).toEqual([])
    })
  })

  describe('Type propagation', () => {
    test('output type matches scalar input type', () => {
      const block = createBlock('Limit1')
      expect(module.getOutputType(block, ['double'])).toBe('double')
      expect(module.getOutputType(block, ['float'])).toBe('float')
      expect(module.getOutputType(block, ['long'])).toBe('long')
    })

    test('output type matches vector input type', () => {
      const block = createBlock('Limit1')
      expect(module.getOutputType(block, ['double[3]'])).toBe('double[3]')
      expect(module.getOutputType(block, ['float[5]'])).toBe('float[5]')
    })

    test('output type matches matrix input type', () => {
      const block = createBlock('Limit1')
      expect(module.getOutputType(block, ['double[2][3]'])).toBe('double[2][3]')
      expect(module.getOutputType(block, ['float[4][4]'])).toBe('float[4][4]')
    })

    test('defaults to double when no inputs', () => {
      const block = createBlock('Limit1')
      expect(module.getOutputType(block, [])).toBe('double')
    })
  })

  describe('generateComputation - C code generation', () => {
    describe('Scalar limiting', () => {
      test('generates scalar limit code', () => {
        const block = createBlock('Limit1', -5, 5)
        const code = module.generateComputation(
          block,
          ['model->signals.Input'],
          ['double']
        )

        expect(code).toContain('Limit block: Limit1')
        expect(code).toContain('lower = -5')
        expect(code).toContain('upper = 5')
        expect(code).toContain('fmax(-5, fmin(5, model->signals.Input))')
      })

      test('generates code with negative limits', () => {
        const block = createBlock('Limit1', -10, -2)
        const code = module.generateComputation(
          block,
          ['model->signals.X'],
          ['double']
        )

        expect(code).toContain('fmax(-10, fmin(-2, model->signals.X))')
      })
    })

    describe('Vector limiting', () => {
      test('generates vector limit code with loop', () => {
        const block = createBlock('Limit1', 0, 100)
        const code = module.generateComputation(
          block,
          ['model->signals.Vec'],
          ['double[4]']
        )

        expect(code).toContain('for (int i = 0; i < 4; i++)')
        expect(code).toContain('fmax(0, fmin(100, model->signals.Vec[i]))')
      })
    })

    describe('Matrix limiting', () => {
      test('generates matrix limit code with nested loops', () => {
        const block = createBlock('Limit1', -1, 1)
        const code = module.generateComputation(
          block,
          ['model->signals.Mat'],
          ['double[3][2]']
        )

        expect(code).toContain('for (int i = 0; i < 3; i++)')
        expect(code).toContain('for (int j = 0; j < 2; j++)')
        expect(code).toContain('fmax(-1, fmin(1, model->signals.Mat[i][j]))')
      })
    })

    describe('No input handling', () => {
      test('generates default output when no inputs', () => {
        const block = createBlock('Limit1')
        const code = module.generateComputation(block, [], [])

        expect(code).toContain('0.0')
        expect(code).toContain('No input')
      })
    })
  })

  describe('Struct member generation', () => {
    test('generates scalar struct member', () => {
      const block = createBlock('Limit1')
      const member = module.generateStructMember(block, 'double')
      expect(member).toContain('double Limit1')
    })

    test('generates vector struct member', () => {
      const block = createBlock('Limit1')
      const member = module.generateStructMember(block, 'double[3]')
      expect(member).toContain('double Limit1[3]')
    })

    test('generates matrix struct member', () => {
      const block = createBlock('Limit1')
      const member = module.generateStructMember(block, 'double[2][4]')
      expect(member).toContain('double Limit1[2][4]')
    })
  })
})

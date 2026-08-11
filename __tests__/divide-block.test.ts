// __tests__/divide-block.test.ts

import { DivideBlockModule } from '@/lib/blocks/DivideBlockModule'
import { BlockData } from '@/components/BlockNode'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'
import { validateBlockOperation } from '@/lib/typeCompatibilityValidator'

describe('Divide Block (P2)', () => {
  const module = new DivideBlockModule()

  const block = (): BlockData => ({
    id: 'div1',
    name: 'Div1',
    type: 'divide',
    position: { x: 0, y: 0 },
    parameters: {}
  })

  describe('Registration and ports', () => {
    test('is registered in factory', () => {
      expect(BlockModuleFactory.isSupported('divide')).toBe(true)
      expect(BlockModuleFactory.getSupportedBlockTypes()).toContain('divide')
    })

    test('has two inputs and one output', () => {
      expect(module.getInputPortCount(block())).toBe(2)
      expect(module.getOutputPortCount(block())).toBe(1)
      expect(module.getInputPortLabels(block())).toEqual(['num', 'den'])
    })

    test('is direct feedthrough', () => {
      expect(module.isDirectFeedthrough(block())).toBe(true)
    })
  })

  describe('Code generation (P2-D1)', () => {
    test('scalar divide', () => {
      const code = module.generateComputation(
        block(),
        ['model->signals.A', 'model->signals.B'],
        ['double', 'double']
      )
      expect(code).toContain('Divide block: Div1')
      expect(code).toContain('model->signals.Div1 = model->signals.A / model->signals.B')
    })

    test('vector / scalar broadcasts denominator', () => {
      const code = module.generateComputation(
        block(),
        ['model->signals.V', 'model->signals.S'],
        ['double[3]', 'double']
      )
      expect(code).toContain('for (int i = 0; i < 3; i++)')
      expect(code).toContain('model->signals.Div1[i] = model->signals.V[i] / model->signals.S')
    })

    test('vector / vector element-wise', () => {
      const code = module.generateComputation(
        block(),
        ['model->signals.A', 'model->signals.B'],
        ['double[3]', 'double[3]']
      )
      expect(code).toContain('model->signals.Div1[i] = model->signals.A[i] / model->signals.B[i]')
    })

    test('matrix / scalar broadcasts', () => {
      const code = module.generateComputation(
        block(),
        ['model->signals.M', 'model->signals.S'],
        ['double[2][2]', 'double']
      )
      expect(code).toContain('for (int i = 0; i < 2; i++)')
      expect(code).toContain('for (int j = 0; j < 2; j++)')
      expect(code).toContain('model->signals.M[i][j] / model->signals.S')
    })
  })

  describe('Types (P2-D2)', () => {
    test('same shape preserves type', () => {
      expect(module.getOutputType(block(), ['double', 'double'])).toBe('double')
      expect(module.getOutputType(block(), ['double[3]', 'double[3]'])).toBe('double[3]')
    })

    test('vector / scalar → vector', () => {
      expect(module.getOutputType(block(), ['double[3]', 'double'])).toBe('double[3]')
    })

    test('validateBlockOperation rejects scalar / vector', () => {
      const err = validateBlockOperation(block(), ['double', 'double[3]'])
      expect(err).not.toBeNull()
      expect(err?.severity).toBe('error')
      expect(err?.message).toMatch(/scalar/i)
    })

    test('validateBlockOperation accepts vector / scalar', () => {
      const err = validateBlockOperation(block(), ['double[3]', 'double'])
      expect(err).toBeNull()
    })

    test('validateBlockOperation rejects mismatched vector sizes', () => {
      const err = validateBlockOperation(block(), ['double[3]', 'double[2]'])
      expect(err).not.toBeNull()
    })
  })
})

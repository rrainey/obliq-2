// __tests__/sign-block.test.ts

import { SignBlockModule } from '@/lib/blocks/SignBlockModule'
import { BlockData } from '@/components/BlockNode'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'

describe('Sign Block (P2)', () => {
  const module = new SignBlockModule()

  const block = (): BlockData => ({
    id: 'sgn1',
    name: 'Sgn1',
    type: 'sign',
    position: { x: 0, y: 0 },
    parameters: {}
  })

  describe('Registration and ports', () => {
    test('is registered in factory', () => {
      expect(BlockModuleFactory.isSupported('sign')).toBe(true)
      expect(BlockModuleFactory.getSupportedBlockTypes()).toContain('sign')
    })

    test('one input, one output', () => {
      expect(module.getInputPortCount(block())).toBe(1)
      expect(module.getOutputPortCount(block())).toBe(1)
    })

    test('is direct feedthrough', () => {
      expect(module.isDirectFeedthrough(block())).toBe(true)
    })
  })

  describe('Code generation (P2-S1)', () => {
    test('scalar signum expression', () => {
      const code = module.generateComputation(
        block(),
        ['model->signals.U'],
        ['double']
      )
      expect(code).toContain('Sign block: Sgn1')
      expect(code).toContain('model->signals.U')
      expect(code).toContain('> 0.0')
      expect(code).toContain('< 0.0')
      expect(code).toContain('1.0')
      expect(code).toContain('-1.0')
      expect(code).toContain('0.0')
    })

    test('vector element-wise loops', () => {
      const code = module.generateComputation(
        block(),
        ['model->signals.V'],
        ['double[3]']
      )
      expect(code).toContain('for (int i = 0; i < 3; i++)')
      expect(code).toContain('model->signals.Sgn1[i]')
    })
  })

  describe('Types', () => {
    test('preserves scalar and vector types', () => {
      expect(module.getOutputType(block(), ['double'])).toBe('double')
      expect(module.getOutputType(block(), ['double[4]'])).toBe('double[4]')
      expect(module.getOutputType(block(), ['double[2][2]'])).toBe('double[2][2]')
    })
  })
})

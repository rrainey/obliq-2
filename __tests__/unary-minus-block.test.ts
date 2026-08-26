// __tests__/unary-minus-block.test.ts
// Tests for UnaryMinusBlockModule with focus on vector handling.
//
// Extracted from the retired Saturn-IB 6-DoF codegen-naming suite; the
// assertion is about the block itself and carries no Saturn dependency.

import { UnaryMinusBlockModule } from '@/lib/blocks/UnaryMinusBlockModule'

describe('Unary Minus Block', () => {
  describe('Code Generation - Vector', () => {
    test('double[3] input negates element-wise rather than negating the array', () => {
      const module = new UnaryMinusBlockModule()
      const block = {
        id: 'u',
        name: 'neg',
        type: 'uminus',
        position: { x: 0, y: 0 },
        parameters: {},
      } as any

      const code = module.generateComputation(block, ['model->signals.v'], ['double[3]'])

      expect(code).toMatch(/for \(int i = 0/)
      expect(code).toContain('neg[i] = -model->signals.v[i]')
      // Negating the array identifier directly is not valid C.
      expect(code).not.toMatch(/neg = -model->signals\.v;/)
    })
  })
})

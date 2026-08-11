// __tests__/quantizer-block.test.ts

import { QuantizerBlockModule } from '@/lib/blocks/QuantizerBlockModule'
import { BlockData } from '@/components/BlockNode'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'
import { validateBlockParameters } from '@/lib/blockParameterValidator'
import { BlockTypes } from '@/lib/blockTypeRegistry'

describe('Quantizer Block (P3)', () => {
  const module = new QuantizerBlockModule()

  const block = (params: Record<string, any> = {}): BlockData => ({
    id: 'q1',
    name: 'Quant1',
    type: 'quantizer',
    position: { x: 0, y: 0 },
    parameters: {
      quantum: 0.5,
      ...params
    }
  })

  test('is registered', () => {
    expect(BlockModuleFactory.isSupported('quantizer')).toBe(true)
  })

  test('no state, direct feedthrough', () => {
    expect(module.requiresState(block())).toBe(false)
    expect(module.isDirectFeedthrough(block())).toBe(true)
  })

  test('codegen uses floor/round pattern (P3-Q1)', () => {
    const code = module.generateComputation(
      block(),
      ['model->signals.U'],
      ['double']
    )
    expect(code).toContain('Quantizer block')
    expect(code).toContain('floor')
    expect(code).toContain('0.5')
    expect(code).toContain('0.5') // quantum
  })

  test('vector element-wise', () => {
    const code = module.generateComputation(
      block(),
      ['model->signals.V'],
      ['double[3]']
    )
    expect(code).toContain('for (int i = 0; i < 3; i++)')
  })

  test('preserves input type', () => {
    expect(module.getOutputType(block(), ['double'])).toBe('double')
    expect(module.getOutputType(block(), ['double[4]'])).toBe('double[4]')
  })

  test('validation requires quantum > 0', () => {
    const bad = validateBlockParameters(BlockTypes.QUANTIZER, { quantum: 0 })
    expect(bad.valid).toBe(false)

    const ok = validateBlockParameters(BlockTypes.QUANTIZER, { quantum: 0.25 })
    expect(ok.valid).toBe(true)
  })
})

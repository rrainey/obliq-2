// __tests__/selector-block.test.ts

import { SelectorBlockModule } from '@/lib/blocks/SelectorBlockModule'
import { BlockData } from '@/components/BlockNode'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'
import { validateBlockParameters } from '@/lib/blockParameterValidator'
import { BlockTypes } from '@/lib/blockTypeRegistry'

describe('Selector Block (P4)', () => {
  const module = new SelectorBlockModule()

  const block = (indices: number[] = [0]): BlockData => ({
    id: 'sel1',
    name: 'Sel1',
    type: 'selector',
    position: { x: 0, y: 0 },
    parameters: { indices }
  })

  test('is registered', () => {
    expect(BlockModuleFactory.isSupported('selector')).toBe(true)
  })

  test('double[3] indices [2,0] → double[2] (P4-S1)', () => {
    expect(module.getOutputType(block([2, 0]), ['double[3]'])).toBe('double[2]')
  })

  test('single index → scalar', () => {
    expect(module.getOutputType(block([1]), ['double[3]'])).toBe('double')
  })

  test('codegen picks indexed elements', () => {
    const code = module.generateComputation(
      block([2, 0]),
      ['model->signals.V'],
      ['double[3]']
    )
    expect(code).toContain('model->signals.V[2]')
    expect(code).toContain('model->signals.V[0]')
    expect(code).toContain('Sel1[0]')
    expect(code).toContain('Sel1[1]')
  })

  test('single index scalar output codegen', () => {
    const code = module.generateComputation(
      block([1]),
      ['model->signals.V'],
      ['double[3]']
    )
    expect(code).toContain('model->signals.Sel1 = model->signals.V[1]')
  })

  test('parameter validation rejects empty indices', () => {
    const result = validateBlockParameters(BlockTypes.SELECTOR, { indices: [] })
    expect(result.valid).toBe(false)
  })

  test('parameter validation rejects negative indices', () => {
    const result = validateBlockParameters(BlockTypes.SELECTOR, { indices: [0, -1] })
    expect(result.valid).toBe(false)
  })
})

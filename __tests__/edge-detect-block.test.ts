// __tests__/edge-detect-block.test.ts

import { EdgeDetectBlockModule } from '@/lib/blocks/EdgeDetectBlockModule'
import { BlockData } from '@/components/BlockNode'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'
import { validateBlockParameters } from '@/lib/blockParameterValidator'
import { BlockTypes } from '@/lib/blockTypeRegistry'

describe('Edge Detect Block (P6)', () => {
  const module = new EdgeDetectBlockModule()

  const block = (params: Record<string, any> = {}): BlockData => ({
    id: 'ed1',
    name: 'Edge1',
    type: 'edge_detect',
    position: { x: 0, y: 0 },
    parameters: {
      edge: 'rising',
      threshold: 0.5,
      ...params
    }
  })

  test('is registered', () => {
    expect(BlockModuleFactory.isSupported('edge_detect')).toBe(true)
  })

  test('requires state prev_high', () => {
    expect(module.requiresState(block())).toBe(true)
    const members = module.generateStateStructMembers(block(), 'double')
    expect(members.some(m => m.includes('prev_high'))).toBe(true)
  })

  test('codegen rising edge pulse logic', () => {
    const code = module.generateComputation(
      block({ edge: 'rising' }),
      ['model->signals.U'],
      ['double']
    )
    expect(code).toContain('Edge Detect block')
    expect(code).toContain('prev_high')
    expect(code).toContain('1.0')
    expect(code).toContain('0.0')
    expect(code).toContain('0.5')
  })

  test('codegen falling mode', () => {
    const code = module.generateComputation(
      block({ edge: 'falling' }),
      ['model->signals.U'],
      ['double']
    )
    expect(code).toContain('!Edge1_high && model->states.Edge1_prev_high')
  })

  test('init sets prev_high false', () => {
    const init = module.generateInitialization(block())
    expect(init).toContain('false')
  })

  test('validation rejects bad edge', () => {
    const bad = validateBlockParameters(BlockTypes.EDGE_DETECT, { edge: 'sideways' })
    expect(bad.valid).toBe(false)
  })

  test('validation accepts rising', () => {
    const ok = validateBlockParameters(BlockTypes.EDGE_DETECT, {
      edge: 'rising',
      threshold: 0.5
    })
    expect(ok.valid).toBe(true)
  })
})

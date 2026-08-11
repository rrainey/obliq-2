// __tests__/relay-block.test.ts

import { RelayBlockModule } from '@/lib/blocks/RelayBlockModule'
import { BlockData } from '@/components/BlockNode'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'
import { validateBlockParameters } from '@/lib/blockParameterValidator'
import { BlockTypes } from '@/lib/blockTypeRegistry'

describe('Relay Block (P3)', () => {
  const module = new RelayBlockModule()

  const block = (params: Record<string, any> = {}): BlockData => ({
    id: 'rel1',
    name: 'Relay1',
    type: 'relay',
    position: { x: 0, y: 0 },
    parameters: {
      onThreshold: 1,
      offThreshold: -1,
      onOutput: 1,
      offOutput: 0,
      initialOn: false,
      ...params
    }
  })

  test('is registered', () => {
    expect(BlockModuleFactory.isSupported('relay')).toBe(true)
    expect(BlockModuleFactory.getSupportedBlockTypes()).toContain('relay')
  })

  test('requires state and is direct feedthrough', () => {
    expect(module.requiresState(block())).toBe(true)
    expect(module.isDirectFeedthrough(block())).toBe(true)
    expect(module.getInputPortCount(block())).toBe(1)
    expect(module.getOutputPortCount(block())).toBe(1)
  })

  test('state member + init from initialOn (P3-R1)', () => {
    const members = module.generateStateStructMembers(block(), 'double')
    expect(members.some(m => m.includes('Relay1_is_on'))).toBe(true)

    expect(module.generateInitialization(block({ initialOn: false }))).toContain('false')
    expect(module.generateInitialization(block({ initialOn: true }))).toContain('true')
  })

  test('codegen implements hysteresis logic', () => {
    const code = module.generateComputation(
      block(),
      ['model->signals.U'],
      ['double']
    )
    expect(code).toContain('Relay block')
    expect(code).toContain('_is_on')
    expect(code).toContain('>= 1')
    expect(code).toContain('<= -1')
  })

  test('validation rejects onThreshold < offThreshold (P3-R2)', () => {
    const result = validateBlockParameters(BlockTypes.RELAY, {
      onThreshold: -2,
      offThreshold: 1
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('onThreshold'))).toBe(true)
  })

  test('validation accepts equal thresholds (no deadband)', () => {
    const result = validateBlockParameters(BlockTypes.RELAY, {
      onThreshold: 0,
      offThreshold: 0
    })
    expect(result.valid).toBe(true)
  })
})

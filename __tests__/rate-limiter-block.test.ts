// __tests__/rate-limiter-block.test.ts

import { RateLimiterBlockModule } from '@/lib/blocks/RateLimiterBlockModule'
import { BlockData } from '@/components/BlockNode'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'
import { validateBlockParameters } from '@/lib/blockParameterValidator'
import { BlockTypes } from '@/lib/blockTypeRegistry'

describe('Rate Limiter Block (P3)', () => {
  const module = new RateLimiterBlockModule()

  const block = (params: Record<string, any> = {}): BlockData => ({
    id: 'rl1',
    name: 'RateLim1',
    type: 'rate_limiter',
    position: { x: 0, y: 0 },
    parameters: {
      risingSlewLimit: 2,
      fallingSlewLimit: -2,
      initialOutput: 0,
      ...params
    }
  })

  test('is registered', () => {
    expect(BlockModuleFactory.isSupported('rate_limiter')).toBe(true)
  })

  test('state + init (P3-L1)', () => {
    expect(module.requiresState(block())).toBe(true)
    const members = module.generateStateStructMembers(block(), 'double')
    expect(members.some(m => m.includes('last_output'))).toBe(true)

    const init = module.generateInitialization(block({ initialOutput: 3.5 }))
    expect(init).toContain('3.5')
  })

  test('codegen uses model->dt and clamps delta', () => {
    const code = module.generateComputation(
      block(),
      ['model->signals.U'],
      ['double']
    )
    expect(code).toContain('Rate Limiter block')
    expect(code).toContain('model->dt')
    expect(code).toContain('2')
    expect(code).toContain('-2')
    expect(code).toContain('last_output')
  })

  test('validation requires rising > 0 and falling < 0', () => {
    const badRise = validateBlockParameters(BlockTypes.RATE_LIMITER, {
      risingSlewLimit: -1,
      fallingSlewLimit: -1
    })
    expect(badRise.valid).toBe(false)

    const badFall = validateBlockParameters(BlockTypes.RATE_LIMITER, {
      risingSlewLimit: 1,
      fallingSlewLimit: 1
    })
    expect(badFall.valid).toBe(false)

    const ok = validateBlockParameters(BlockTypes.RATE_LIMITER, {
      risingSlewLimit: 1,
      fallingSlewLimit: -1,
      initialOutput: 0
    })
    expect(ok.valid).toBe(true)
  })
})

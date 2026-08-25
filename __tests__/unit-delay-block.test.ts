// __tests__/unit-delay-block.test.ts

import { UnitDelayBlockModule } from '@/lib/blocks/UnitDelayBlockModule'
import { BlockData } from '@/components/BlockNode'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'

describe('Unit Delay Block', () => {
  const module = new UnitDelayBlockModule()

  const baseBlock = (params: Record<string, any> = {}): BlockData => ({
    id: 'ud1',
    name: 'Delay1',
    type: 'unit_delay',
    position: { x: 0, y: 0 },
    parameters: {
      initialValue: 0,
      sampleInterval: 0,
      ...params
    }
  })

  describe('Ports and feedthrough (P1-U1)', () => {
    test('isDirectFeedthrough is false', () => {
      expect(module.isDirectFeedthrough(baseBlock())).toBe(false)
    })

    test('has one input and one output', () => {
      expect(module.getInputPortCount(baseBlock())).toBe(1)
      expect(module.getOutputPortCount(baseBlock())).toBe(1)
    })

    test('is registered in factory', () => {
      expect(BlockModuleFactory.isSupported('unit_delay')).toBe(true)
      expect(BlockModuleFactory.getSupportedBlockTypes()).toContain('unit_delay')
    })
  })

  describe('Types (P1-U3)', () => {
    test('output type matches scalar input', () => {
      expect(module.getOutputType(baseBlock(), ['double'])).toBe('double')
    })

    test('output type matches vector input', () => {
      expect(module.getOutputType(baseBlock(), ['double[3]'])).toBe('double[3]')
    })

    test('output type matches matrix input', () => {
      expect(module.getOutputType(baseBlock(), ['double[2][2]'])).toBe('double[2][2]')
    })
  })

  describe('State struct members (P1-U2)', () => {
    test('generates scalar state member', () => {
      const members = module.generateStateStructMembers(baseBlock(), 'double')
      expect(members.some(m => m.includes('Delay1_state'))).toBe(true)
      expect(members.some(m => m.includes('next_sample_time'))).toBe(false)
    })

    test('does not allocate next_sample_time (sample_tick gates instead)', () => {
      const members = module.generateStateStructMembers(
        baseBlock({ sampleInterval: 0.1 }),
        'double'
      )
      expect(members.some(m => m.includes('next_sample_time'))).toBe(false)
      expect(members.some(m => m.includes('_state'))).toBe(true)
    })

    test('generates vector state array', () => {
      const members = module.generateStateStructMembers(baseBlock(), 'double[3]')
      expect(members.some(m => m.includes('_state[3]'))).toBe(true)
    })
  })

  describe('Code generation', () => {
    test('output phase publishes state; deferred phase updates state every step', () => {
      const out = module.generateComputation(
        baseBlock(),
        ['model->signals.Input1'],
        ['double']
      )
      expect(out).toContain('Unit Delay block: Delay1')
      expect(out).toContain('model->signals.Delay1 = model->states.Delay1_state')
      expect(out).not.toContain('model->states.Delay1_state = model->signals.Input1')

      const upd = module.generateDeferredStateUpdate!(
        baseBlock(),
        ['model->signals.Input1'],
        ['double']
      )
      expect(upd).toContain('model->states.Delay1_state = model->signals.Input1')
    })

    test('sampleInterval > 0 gates deferred update on sample_tick', () => {
      const upd = module.generateDeferredStateUpdate!(
        baseBlock({ sampleInterval: 0.2 }),
        ['model->signals.Input1'],
        ['double']
      )
      expect(upd).toContain('sample_tick')
      expect(upd).toContain('0.2')
      expect(upd).not.toContain('next_sample_time')
    })

    test('sampleInterval aligns with enable + sample_tick (no time catch-up)', () => {
      const upd = module.generateDeferredStateUpdate!(
        baseBlock({ sampleInterval: 1.6 }),
        ['model->signals.Input1'],
        ['double'],
        { enableExpr: 'model->enable_states.Filt_enabled' }
      )
      expect(upd).toMatch(/Filt_enabled/)
      expect(upd).toMatch(/sample_tick % .*1\.6/)
      expect(upd).not.toContain('next_sample_time')
    })

    test('enableExpr gates deferred state update', () => {
      const upd = module.generateDeferredStateUpdate!(
        baseBlock(),
        ['model->signals.Input1'],
        ['double'],
        { enableExpr: 'model->enable_states.Filt_enabled' }
      )
      expect(upd).toMatch(/if \(model->enable_states\.Filt_enabled\)/)
      expect(upd).toContain('model->states.Delay1_state = model->signals.Input1')
    })

    test('vector path uses index loops', () => {
      const code = module.generateComputation(
        baseBlock(),
        ['model->signals.Vin'],
        ['double[3]']
      )
      expect(code).toContain('for (int i = 0; i < 3; i++)')
      expect(code).toContain('model->signals.Delay1[i] = model->states.Delay1_state[i]')
    })
  })

  describe('Initialization', () => {
    test('initializes scalar state from initialValue', () => {
      const code = module.generateInitialization(baseBlock({ initialValue: 2.5 }), 'double')
      expect(code).toContain('model->states.Delay1_state = 2.5')
    })

    test('sampleInterval does not require timer init', () => {
      const code = module.generateInitialization(
        baseBlock({ sampleInterval: 0.1, initialValue: 0 }),
        'double'
      )
      expect(code).toContain('_state = 0')
      expect(code).not.toContain('next_sample_time')
    })
  })
})

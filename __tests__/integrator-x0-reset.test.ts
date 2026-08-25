// __tests__/integrator-x0-reset.test.ts
// P0 tests: x(0) as left data port 1; reset re-samples x(0)

import { IntegratorBlockModule } from '@/lib/blocks/IntegratorBlockModule'
import { BlockData } from '@/components/BlockNode'
import { PortCountAdapter } from '@/lib/validation/PortCountAdapter'

describe('Integrator x(0) and reset (P0)', () => {
  const module = new IntegratorBlockModule()

  const block = (params: Record<string, any> = {}): BlockData => ({
    id: 'int1',
    name: 'MyInt',
    type: 'integrator',
    position: { x: 0, y: 0 },
    parameters: {
      initialValue: 7,
      showInitPort: false,
      showResetInput: false,
      showEnableInput: false,
      ...params
    }
  })

  describe('Port model (P0-I2)', () => {
    test('default: one data port (Derivative)', () => {
      expect(module.getInputPortCount(block())).toBe(1)
      expect(module.getInputPortLabels(block())).toEqual(['Derivative'])
    })

    test('showInitPort: two data ports Derivative + x(0)', () => {
      const b = block({ showInitPort: true })
      expect(module.getInputPortCount(b)).toBe(2)
      expect(module.getInputPortLabels(b)).toEqual(['Derivative', 'x(0)'])
      expect(PortCountAdapter.getInputPortCount(b)).toBe(2)
    })

    test('enable/reset do not increase left-side data port count', () => {
      const b = block({
        showInitPort: true,
        showEnableInput: true,
        showResetInput: true
      })
      expect(module.getInputPortCount(b)).toBe(2)
    })

    test('isDirectFeedthrough is false', () => {
      expect(module.isDirectFeedthrough(block())).toBe(false)
    })
  })

  describe('Initialization from x(0) (P0-I1 / IcNeedsLoading)', () => {
    test('showInitPort defers x(0): zeros state and sets ic_needs_loading', () => {
      const code = module.generateInitialization(
        block({ showInitPort: true }),
        'double',
        'model->signals.IC_Source'
      )
      expect(code).toContain('IcNeedsLoading')
      expect(code).toContain('_states[0] = 0.0')
      expect(code).toContain('_ic_needs_loading = 1')
      // Must NOT eagerly copy live x(0) at init/reseed (disabled-stage handoff)
      expect(code).not.toContain('model->signals.IC_Source')
      expect(code).not.toContain('= 7')
    })

    test('showInitPort without signal still sets ic_needs_loading', () => {
      const code = module.generateInitialization(
        block({ showInitPort: true }),
        'double',
        undefined
      )
      expect(code).toContain('_states[0] = 0.0')
      expect(code).toContain('_ic_needs_loading = 1')
    })

    test('generateInitialization uses initialValue without showInitPort', () => {
      const code = module.generateInitialization(block({ initialValue: 3.5 }), 'double')
      expect(code).toContain('_states[0] = 3.5')
      expect(code).not.toContain('ic_needs_loading')
    })

    test('showInitPort adds ic_needs_loading state member', () => {
      const members = module.generateStateStructMembers(block({ showInitPort: true }), 'double')
      expect(members.some(m => m.includes('_ic_needs_loading'))).toBe(true)
    })
  })

  describe('IcNeedsLoading load on first enabled eval', () => {
    test('loads live x(0) when flag set (always-enabled)', () => {
      const code = module.generateComputation(
        block({ showInitPort: true }),
        ['model->signals.Deriv', 'model->signals.IC'],
        ['double', 'double']
      )
      expect(code).toContain('ic_needs_loading')
      expect(code).toContain('model->signals.IC')
      expect(code).toContain('_ic_needs_loading = 0')
      expect(code).not.toContain('enable_states')
    })

    test('gates x(0) load on enableExpr when in enabled subsystem', () => {
      const code = module.generateComputation(
        block({ showInitPort: true }),
        ['model->signals.Deriv', 'model->signals.Sum_k'],
        ['double', 'double'],
        { enableExpr: 'model->enable_states.S_IVB_Stage_enabled' }
      )
      expect(code).toContain(
        'model->enable_states.S_IVB_Stage_enabled && model->states.MyInt_ic_needs_loading'
      )
      expect(code).toContain('model->signals.Sum_k')
      expect(code).toContain('_ic_needs_loading = 0')
    })

    test('vector IC load copies each element', () => {
      const code = module.generateComputation(
        block({ showInitPort: true }),
        ['model->signals.Deriv', 'model->signals.Sum_k'],
        ['double[3]', 'double[3]'],
        { enableExpr: 'model->enable_states.Stage_enabled' }
      )
      expect(code).toContain('model->signals.Sum_k[i]')
      expect(code).toContain('_ic_needs_loading = 0')
    })

    test('unconnected x(0) fallback 0.0 does not emit 0.0[i] for vectors', () => {
      const code = module.generateComputation(
        block({ showInitPort: true }),
        ['model->signals.Deriv', '0.0'],
        ['double[3]', 'double[3]']
      )
      expect(code).not.toContain('0.0[i]')
      expect(code).toMatch(/_states\[i\] = 0\.0/)
    })
  })

  describe('Reset re-samples x(0) (P0-I5 semantics)', () => {
    test('reset without x(0) uses initialValue parameter', () => {
      // inputs: [deriv, reset]
      const code = module.generateComputation(
        block({ showResetInput: true, initialValue: 9 }),
        ['model->signals.Deriv', 'model->signals.Reset'],
        ['double']
      )
      expect(code).toContain('rising_edge')
      expect(code).toContain('_states[0] = 9')
    })

    test('reset with x(0) re-samples live init signal', () => {
      // inputs: [deriv, x0, reset]
      const code = module.generateComputation(
        block({ showInitPort: true, showResetInput: true, initialValue: 9 }),
        ['model->signals.Deriv', 'model->signals.IC', 'model->signals.Reset'],
        ['double', 'double']
      )
      expect(code).toContain('rising_edge')
      expect(code).toContain('model->signals.IC')
      // Must not hardcode the parameter 9 on reset path when x(0) is present
      expect(code).not.toMatch(/_states\[0\] = 9/)
    })
  })

  describe('Output type for x(0) / feedback', () => {
    test('with x(0) present, output type follows derivative type when dimensional', () => {
      const t = module.getOutputType(
        block({ showInitPort: true }),
        ['double[3]', 'double[3]']
      )
      expect(t).toBe('double[3]')
    })

    test('when derivative untyped, use dimensional x(0) type (kinematics loop)', () => {
      const t = module.getOutputType(
        block({ showInitPort: true }),
        ['', 'double[4][1]']
      )
      expect(t).toBe('double[4][1]')
    })

    test('when derivative is scalar placeholder and IC is quaternion, prefer IC', () => {
      const t = module.getOutputType(
        block({ showInitPort: true }),
        ['double', 'double[4][1]']
      )
      expect(t).toBe('double[4][1]')
    })
  })
})

// __tests__/blocks/IntegratorBlockModule.test.ts
// Tests for C code generation only (JS simulation engine removed)

import { IntegratorBlockModule } from '@/lib/blocks/IntegratorBlockModule'
import { BlockData } from '@/components/BlockNode'

describe('IntegratorBlockModule', () => {
  const module = new IntegratorBlockModule()

  const createBlock = (
    name: string,
    params: {
      initialValue?: number
      showEnableInput?: boolean
      showResetInput?: boolean
      useLimits?: boolean
      lowerLimit?: number
      upperLimit?: number
    } = {}
  ): BlockData => ({
    id: `${name}-id`,
    type: 'integrator',
    name,
    position: { x: 0, y: 0 },
    parameters: {
      initialValue: params.initialValue ?? 0,
      showEnableInput: params.showEnableInput ?? false,
      showResetInput: params.showResetInput ?? false,
      useLimits: params.useLimits ?? false,
      lowerLimit: params.lowerLimit ?? -Infinity,
      upperLimit: params.upperLimit ?? Infinity
    }
  })

  describe('Port configuration', () => {
    test('has 1 input port by default (derivative only)', () => {
      const block = createBlock('Int1')
      expect(module.getInputPortCount(block)).toBe(1)
    })

    test('has 2 input ports with enable input', () => {
      const block = createBlock('Int1', { showEnableInput: true })
      expect(module.getInputPortCount(block)).toBe(2)
    })

    test('has 2 input ports with reset input', () => {
      const block = createBlock('Int1', { showResetInput: true })
      expect(module.getInputPortCount(block)).toBe(2)
    })

    test('has 3 input ports with both enable and reset', () => {
      const block = createBlock('Int1', { showEnableInput: true, showResetInput: true })
      expect(module.getInputPortCount(block)).toBe(3)
    })

    test('has exactly 1 output port', () => {
      const block = createBlock('Int1')
      expect(module.getOutputPortCount(block)).toBe(1)
    })

    test('input port labels - derivative only', () => {
      const block = createBlock('Int1')
      expect(module.getInputPortLabels?.(block)).toEqual(['Derivative'])
    })

    test('input port labels - with enable', () => {
      const block = createBlock('Int1', { showEnableInput: true })
      expect(module.getInputPortLabels?.(block)).toEqual(['Derivative', 'Enable'])
    })

    test('input port labels - with reset', () => {
      const block = createBlock('Int1', { showResetInput: true })
      expect(module.getInputPortLabels?.(block)).toEqual(['Derivative', 'Reset'])
    })

    test('input port labels - with enable and reset', () => {
      const block = createBlock('Int1', { showEnableInput: true, showResetInput: true })
      expect(module.getInputPortLabels?.(block)).toEqual(['Derivative', 'Enable', 'Reset'])
    })

    test('output port is labeled "Output"', () => {
      const block = createBlock('Int1')
      expect(module.getOutputPortLabels?.(block)).toEqual(['Output'])
    })
  })

  describe('State requirements', () => {
    test('requires state (stateful block)', () => {
      const block = createBlock('Int1')
      expect(module.requiresState(block)).toBe(true)
    })

    test('generates scalar state struct member', () => {
      const block = createBlock('Int1')
      const members = module.generateStateStructMembers(block, 'double')
      // Integrator uses _states[1] pattern (order 1 transfer function)
      expect(members).toContain('    double Int1_states[1];')
    })

    test('generates vector state struct member', () => {
      const block = createBlock('Int1')
      const members = module.generateStateStructMembers(block, 'double[3]')
      // Vector: _states[size][1]
      expect(members).toContain('    double Int1_states[3][1];')
    })

    test('generates matrix state struct member', () => {
      const block = createBlock('Int1')
      const members = module.generateStateStructMembers(block, 'double[2][3]')
      // Matrix: _states[rows][cols][1]
      expect(members).toContain('    double Int1_states[2][3][1];')
    })

    test('generates reset_prev state when reset input enabled', () => {
      const block = createBlock('Int1', { showResetInput: true })
      const members = module.generateStateStructMembers(block, 'double')
      expect(members).toContain('    double Int1_states[1];')
      expect(members).toContain('    bool Int1_reset_prev;')
    })
  })

  describe('Type propagation', () => {
    test('output type matches scalar input type', () => {
      const block = createBlock('Int1')
      expect(module.getOutputType(block, ['double'])).toBe('double')
      expect(module.getOutputType(block, ['float'])).toBe('float')
    })

    test('output type matches vector input type', () => {
      const block = createBlock('Int1')
      expect(module.getOutputType(block, ['double[3]'])).toBe('double[3]')
      expect(module.getOutputType(block, ['float[5]'])).toBe('float[5]')
    })

    test('output type matches matrix input type', () => {
      const block = createBlock('Int1')
      expect(module.getOutputType(block, ['double[2][3]'])).toBe('double[2][3]')
      expect(module.getOutputType(block, ['float[4][4]'])).toBe('float[4][4]')
    })

    test('defaults to double when no inputs', () => {
      const block = createBlock('Int1')
      expect(module.getOutputType(block, [])).toBe('double')
    })
  })

  describe('generateComputation - C code generation', () => {
    describe('Basic scalar integration', () => {
      test('generates scalar integration code', () => {
        const block = createBlock('Int1', { initialValue: 0 })
        const code = module.generateComputation(
          block,
          ['model->signals.Input'],
          ['double']
        )

        expect(code).toContain('Integrator block: Int1')
        // Uses _states[0] pattern (order 1 transfer function)
        expect(code).toContain('model->states.Int1_states[0]')
        expect(code).toContain('model->signals.Int1')
      })

      test('generates no-input fallback code', () => {
        const block = createBlock('Int1')
        const code = module.generateComputation(block, [], [])
        expect(code).toContain('0.0')
        expect(code).toContain('No input')
      })
    })

    describe('With limits', () => {
      test('generates limit clamping code', () => {
        const block = createBlock('Int1', { useLimits: true, lowerLimit: -10, upperLimit: 10 })
        const code = module.generateComputation(
          block,
          ['model->signals.Input'],
          ['double']
        )

        // generateComputation now only outputs state - limiting is done in generatePostIntegrationLimiting
        expect(code).toContain('model->states.Int1_states[0]')
      })
    })

    describe('With enable input', () => {
      test('generates enable port handling code', () => {
        const block = createBlock('Int1', { showEnableInput: true })
        const code = module.generateComputation(
          block,
          ['model->signals.Input', 'model->signals.Enable'],
          ['double', 'bool']
        )

        // Enable is now handled in the integration layer (StateIntegrator)
        // generateComputation just outputs the current state
        expect(code).toContain('model->states.Int1_states[0]')
        expect(code).toContain('model->signals.Int1')
      })
    })

    describe('With reset input', () => {
      test('generates rising edge detection code', () => {
        const block = createBlock('Int1', { showResetInput: true })
        const code = module.generateComputation(
          block,
          ['model->signals.Input', 'model->signals.Reset'],
          ['double', 'bool']
        )

        // Reset logic uses rising edge detection
        expect(code).toContain('Int1_reset')
        expect(code).toContain('Int1_rising_edge')
        expect(code).toContain('reset_prev')
        // Uses _states[0] pattern
        expect(code).toContain('model->states.Int1_states[0]')
      })
    })

    describe('Vector/Matrix integration', () => {
      test('generates vector loop code', () => {
        const block = createBlock('Int1')
        const code = module.generateComputation(
          block,
          ['model->signals.Vec'],
          ['double[4]']
        )

        expect(code).toContain('for (int i = 0; i < 4; i++)')
        expect(code).toContain('[i]')
      })

      test('generates matrix nested loop code', () => {
        const block = createBlock('Int1')
        const code = module.generateComputation(
          block,
          ['model->signals.Mat'],
          ['double[3][2]']
        )

        expect(code).toContain('for (int i = 0; i < 3; i++)')
        expect(code).toContain('for (int j = 0; j < 2; j++)')
        expect(code).toContain('[i][j]')
      })
    })
  })

  describe('generateInitialization', () => {
    test('generates scalar initialization', () => {
      const block = createBlock('Int1', { initialValue: 5 })
      const code = module.generateInitialization(block)

      // Uses _states[0] pattern
      expect(code).toContain('model->states.Int1_states[0] = 5')
    })

    test('generates clamped initialization with limits', () => {
      const block = createBlock('Int1', {
        initialValue: 20,
        useLimits: true,
        lowerLimit: -10,
        upperLimit: 10
      })
      const code = module.generateInitialization(block)

      // Uses _states[0] pattern, clamped to limit
      expect(code).toContain('model->states.Int1_states[0] = 10')
    })

    test('generates reset_prev initialization', () => {
      const block = createBlock('Int1', { showResetInput: true })
      const code = module.generateInitialization(block)

      expect(code).toContain('Int1_reset_prev = false')
    })
  })

  describe('Struct member generation', () => {
    test('generates scalar struct member', () => {
      const block = createBlock('Int1')
      const member = module.generateStructMember(block, 'double')
      expect(member).toContain('double Int1')
    })

    test('generates vector struct member', () => {
      const block = createBlock('Int1')
      const member = module.generateStructMember(block, 'double[3]')
      expect(member).toContain('double Int1[3]')
    })

    test('generates matrix struct member', () => {
      const block = createBlock('Int1')
      const member = module.generateStructMember(block, 'double[2][4]')
      expect(member).toContain('double Int1[2][4]')
    })
  })

})

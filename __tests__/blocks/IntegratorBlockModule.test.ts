// __tests__/blocks/IntegratorBlockModule.test.ts

import { IntegratorBlockModule } from '@/lib/blocks/IntegratorBlockModule'
import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'

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

  const createBlockState = (
    blockId: string,
    params: {
      initialValue?: number
      showEnableInput?: boolean
      showResetInput?: boolean
      useLimits?: boolean
      lowerLimit?: number
      upperLimit?: number
    } = {}
  ): BlockState => ({
    blockId,
    blockType: 'integrator',
    outputs: [0],
    internalState: {
      initialValue: params.initialValue ?? 0,
      showEnableInput: params.showEnableInput ?? false,
      showResetInput: params.showResetInput ?? false,
      useLimits: params.useLimits ?? false,
      lowerLimit: params.lowerLimit ?? -Infinity,
      upperLimit: params.upperLimit ?? Infinity
    }
  })

  const createSimulationState = (timeStep = 0.01): SimulationState => ({
    time: 0,
    timeStep,
    duration: 1.0,
    blockStates: new Map(),
    signalValues: new Map(),
    sheetLabelValues: new Map(),
    isRunning: false,
    subsystemEnableStates: new Map(),
    subsystemEnableSignals: new Map(),
    parentSubsystemMap: new Map()
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

  describe('executeSimulation - Runtime behavior', () => {
    describe('Basic scalar integration', () => {
      test('integrates constant positive input', () => {
        const blockState = createBlockState('int-1')
        const simState = createSimulationState(0.1)

        // Constant derivative of 1.0, dt = 0.1
        // After 1 step: 0 + 1.0 * 0.1 = 0.1
        module.executeSimulation(blockState, [1.0], simState)
        expect(blockState.outputs[0]).toBeCloseTo(0.1)

        // After 2nd step: 0.1 + 1.0 * 0.1 = 0.2
        module.executeSimulation(blockState, [1.0], simState)
        expect(blockState.outputs[0]).toBeCloseTo(0.2)
      })

      test('integrates constant negative input', () => {
        const blockState = createBlockState('int-1')
        const simState = createSimulationState(0.1)

        module.executeSimulation(blockState, [-2.0], simState)
        expect(blockState.outputs[0]).toBeCloseTo(-0.2)

        module.executeSimulation(blockState, [-2.0], simState)
        expect(blockState.outputs[0]).toBeCloseTo(-0.4)
      })

      test('uses initial value', () => {
        const blockState = createBlockState('int-1', { initialValue: 5 })
        const simState = createSimulationState(0.1)

        module.executeSimulation(blockState, [1.0], simState)
        expect(blockState.outputs[0]).toBeCloseTo(5.1) // 5 + 1.0 * 0.1
      })
    })

    describe('Enable input', () => {
      test('integrates when enabled', () => {
        const blockState = createBlockState('int-1', { showEnableInput: true })
        const simState = createSimulationState(0.1)

        // Enable = true, should integrate
        module.executeSimulation(blockState, [1.0, true], simState)
        expect(blockState.outputs[0]).toBeCloseTo(0.1)
      })

      test('holds value when disabled', () => {
        const blockState = createBlockState('int-1', { showEnableInput: true })
        const simState = createSimulationState(0.1)

        // First integrate while enabled
        module.executeSimulation(blockState, [1.0, true], simState)
        expect(blockState.outputs[0]).toBeCloseTo(0.1)

        // Then disable - should hold at 0.1
        module.executeSimulation(blockState, [1.0, false], simState)
        expect(blockState.outputs[0]).toBeCloseTo(0.1)

        // Still disabled
        module.executeSimulation(blockState, [1.0, false], simState)
        expect(blockState.outputs[0]).toBeCloseTo(0.1)

        // Re-enable and continue integration
        module.executeSimulation(blockState, [1.0, true], simState)
        expect(blockState.outputs[0]).toBeCloseTo(0.2)
      })
    })

    describe('Reset input', () => {
      test('resets on rising edge', () => {
        const blockState = createBlockState('int-1', {
          showResetInput: true,
          initialValue: 0
        })
        const simState = createSimulationState(0.1)

        // Integrate for a few steps (reset = false)
        module.executeSimulation(blockState, [10.0, false], simState)
        module.executeSimulation(blockState, [10.0, false], simState)
        expect(blockState.outputs[0]).toBeCloseTo(2.0)

        // Rising edge reset - note that reset happens, then integration continues in same step
        // So output = 0 (reset) + 10 * 0.1 (integrate) = 1.0
        module.executeSimulation(blockState, [10.0, true], simState)
        expect(blockState.outputs[0]).toBeCloseTo(1.0) // Reset to 0, then integrated
      })

      test('does not reset on falling edge', () => {
        const blockState = createBlockState('int-1', {
          showResetInput: true,
          initialValue: 0
        })
        const simState = createSimulationState(0.1)

        // Rising edge reset - resets to 0, then integrates
        // Output = 0 + 10 * 0.1 = 1.0
        module.executeSimulation(blockState, [10.0, true], simState)
        expect(blockState.outputs[0]).toBeCloseTo(1.0)

        // Integrate with reset still high (no rising edge, just continues)
        module.executeSimulation(blockState, [10.0, true], simState)
        expect(blockState.outputs[0]).toBeCloseTo(2.0) // 1.0 + 10 * 0.1

        // Falling edge - should continue integrating, not reset
        module.executeSimulation(blockState, [10.0, false], simState)
        expect(blockState.outputs[0]).toBeCloseTo(3.0) // 2.0 + 10 * 0.1
      })
    })

    describe('Limits and saturation', () => {
      test('clamps output to upper limit', () => {
        const blockState = createBlockState('int-1', {
          useLimits: true,
          lowerLimit: -5,
          upperLimit: 5
        })
        const simState = createSimulationState(1.0) // Large dt for fast saturation

        module.executeSimulation(blockState, [10.0], simState)
        expect(blockState.outputs[0]).toBe(5) // Clamped to upper limit
      })

      test('clamps output to lower limit', () => {
        const blockState = createBlockState('int-1', {
          useLimits: true,
          lowerLimit: -5,
          upperLimit: 5
        })
        const simState = createSimulationState(1.0)

        module.executeSimulation(blockState, [-10.0], simState)
        expect(blockState.outputs[0]).toBe(-5) // Clamped to lower limit
      })

      test('saturation optimization prevents integration when at limit', () => {
        const blockState = createBlockState('int-1', {
          useLimits: true,
          lowerLimit: -5,
          upperLimit: 5,
          initialValue: 5 // Start at upper limit
        })
        const simState = createSimulationState(0.1)

        // Initialize with initial value
        module.executeSimulation(blockState, [10.0], simState) // Positive derivative at upper limit
        // Due to saturation optimization, should stay at 5
        expect(blockState.outputs[0]).toBe(5)

        // Negative derivative should allow decrease
        module.executeSimulation(blockState, [-10.0], simState)
        expect(blockState.outputs[0]).toBeCloseTo(4.0) // 5 - 10 * 0.1
      })
    })

    describe('Vector integration', () => {
      test('integrates vector elements independently', () => {
        const blockState = createBlockState('int-1')
        const simState = createSimulationState(0.1)

        module.executeSimulation(blockState, [[1.0, 2.0, 3.0]], simState)
        const output = blockState.outputs[0] as number[]
        expect(output[0]).toBeCloseTo(0.1)
        expect(output[1]).toBeCloseTo(0.2)
        expect(output[2]).toBeCloseTo(0.3)
      })

      test('applies limits to vector elements', () => {
        const blockState = createBlockState('int-1', {
          useLimits: true,
          lowerLimit: -0.5,
          upperLimit: 0.5
        })
        const simState = createSimulationState(1.0)

        module.executeSimulation(blockState, [[1.0, 2.0, -3.0]], simState)
        const output = blockState.outputs[0] as number[]
        expect(output[0]).toBe(0.5) // Clamped
        expect(output[1]).toBe(0.5) // Clamped
        expect(output[2]).toBe(-0.5) // Clamped
      })
    })

    describe('Matrix integration', () => {
      test('integrates matrix elements independently', () => {
        const blockState = createBlockState('int-1')
        const simState = createSimulationState(0.1)

        const input = [
          [1.0, 2.0],
          [3.0, 4.0]
        ]
        module.executeSimulation(blockState, [input], simState)
        const output = blockState.outputs[0] as number[][]
        expect(output[0][0]).toBeCloseTo(0.1)
        expect(output[0][1]).toBeCloseTo(0.2)
        expect(output[1][0]).toBeCloseTo(0.3)
        expect(output[1][1]).toBeCloseTo(0.4)
      })
    })

    describe('Combined enable and reset', () => {
      test('enable and reset work together', () => {
        const blockState = createBlockState('int-1', {
          showEnableInput: true,
          showResetInput: true,
          initialValue: 0
        })
        const simState = createSimulationState(0.1)

        // Integrate enabled, no reset
        module.executeSimulation(blockState, [10.0, true, false], simState)
        expect(blockState.outputs[0]).toBeCloseTo(1.0)

        // Disable - hold value
        module.executeSimulation(blockState, [10.0, false, false], simState)
        expect(blockState.outputs[0]).toBeCloseTo(1.0)

        // Reset while disabled (rising edge)
        module.executeSimulation(blockState, [10.0, false, true], simState)
        expect(blockState.outputs[0]).toBeCloseTo(0) // Reset to initial

        // Re-enable after reset
        module.executeSimulation(blockState, [10.0, true, false], simState)
        expect(blockState.outputs[0]).toBeCloseTo(1.0) // 0 + 10 * 0.1
      })
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

  describe('computeDerivatives', () => {
    test('returns scalar derivative', () => {
      const blockState = createBlockState('int-1')
      const derivs = module.computeDerivatives?.(blockState, [5.0], 0)
      expect(derivs).toEqual([5.0])
    })

    test('returns vector derivatives', () => {
      const blockState = createBlockState('int-1')
      const derivs = module.computeDerivatives?.(blockState, [[1.0, 2.0, 3.0]], 0)
      expect(derivs).toEqual([1.0, 2.0, 3.0])
    })

    test('returns flattened matrix derivatives', () => {
      const blockState = createBlockState('int-1')
      const input = [
        [1.0, 2.0],
        [3.0, 4.0]
      ]
      const derivs = module.computeDerivatives?.(blockState, [input], 0)
      expect(derivs).toEqual([1.0, 2.0, 3.0, 4.0])
    })
  })
})

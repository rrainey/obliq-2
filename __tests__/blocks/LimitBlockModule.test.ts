// __tests__/blocks/LimitBlockModule.test.ts

import { LimitBlockModule } from '@/lib/blocks/LimitBlockModule'
import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'

describe('LimitBlockModule', () => {
  const module = new LimitBlockModule()

  const createBlock = (name: string, lowerLimit = -1, upperLimit = 1): BlockData => ({
    id: `${name}-id`,
    type: 'limit',
    name,
    position: { x: 0, y: 0 },
    parameters: { lowerLimit, upperLimit }
  })

  const createBlockState = (blockId: string, lowerLimit = -1, upperLimit = 1): BlockState => ({
    blockId,
    blockType: 'limit',
    outputs: [0],
    internalState: { lowerLimit, upperLimit }
  })

  const createSimulationState = (): SimulationState => ({
    time: 0,
    timeStep: 0.01,
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
    test('has exactly 1 input port', () => {
      const block = createBlock('Limit1')
      expect(module.getInputPortCount(block)).toBe(1)
    })

    test('has exactly 1 output port', () => {
      const block = createBlock('Limit1')
      expect(module.getOutputPortCount(block)).toBe(1)
    })

    test('input port is labeled "Input"', () => {
      const block = createBlock('Limit1')
      expect(module.getInputPortLabels?.(block)).toEqual(['Input'])
    })

    test('output port is labeled "Output"', () => {
      const block = createBlock('Limit1')
      expect(module.getOutputPortLabels?.(block)).toEqual(['Output'])
    })
  })

  describe('State requirements', () => {
    test('does not require state (stateless block)', () => {
      const block = createBlock('Limit1')
      expect(module.requiresState(block)).toBe(false)
    })

    test('generates no state struct members', () => {
      const block = createBlock('Limit1')
      expect(module.generateStateStructMembers(block, 'double')).toEqual([])
    })
  })

  describe('Type propagation', () => {
    test('output type matches scalar input type', () => {
      const block = createBlock('Limit1')
      expect(module.getOutputType(block, ['double'])).toBe('double')
      expect(module.getOutputType(block, ['float'])).toBe('float')
      expect(module.getOutputType(block, ['long'])).toBe('long')
    })

    test('output type matches vector input type', () => {
      const block = createBlock('Limit1')
      expect(module.getOutputType(block, ['double[3]'])).toBe('double[3]')
      expect(module.getOutputType(block, ['float[5]'])).toBe('float[5]')
    })

    test('output type matches matrix input type', () => {
      const block = createBlock('Limit1')
      expect(module.getOutputType(block, ['double[2][3]'])).toBe('double[2][3]')
      expect(module.getOutputType(block, ['float[4][4]'])).toBe('float[4][4]')
    })

    test('defaults to double when no inputs', () => {
      const block = createBlock('Limit1')
      expect(module.getOutputType(block, [])).toBe('double')
    })
  })

  describe('generateComputation - C code generation', () => {
    describe('Scalar limiting', () => {
      test('generates scalar limit code', () => {
        const block = createBlock('Limit1', -5, 5)
        const code = module.generateComputation(
          block,
          ['model->signals.Input'],
          ['double']
        )

        expect(code).toContain('Limit block: Limit1')
        expect(code).toContain('lower = -5')
        expect(code).toContain('upper = 5')
        expect(code).toContain('fmax(-5, fmin(5, model->signals.Input))')
      })

      test('generates code with negative limits', () => {
        const block = createBlock('Limit1', -10, -2)
        const code = module.generateComputation(
          block,
          ['model->signals.X'],
          ['double']
        )

        expect(code).toContain('fmax(-10, fmin(-2, model->signals.X))')
      })
    })

    describe('Vector limiting', () => {
      test('generates vector limit code with loop', () => {
        const block = createBlock('Limit1', 0, 100)
        const code = module.generateComputation(
          block,
          ['model->signals.Vec'],
          ['double[4]']
        )

        expect(code).toContain('for (int i = 0; i < 4; i++)')
        expect(code).toContain('fmax(0, fmin(100, model->signals.Vec[i]))')
      })
    })

    describe('Matrix limiting', () => {
      test('generates matrix limit code with nested loops', () => {
        const block = createBlock('Limit1', -1, 1)
        const code = module.generateComputation(
          block,
          ['model->signals.Mat'],
          ['double[3][2]']
        )

        expect(code).toContain('for (int i = 0; i < 3; i++)')
        expect(code).toContain('for (int j = 0; j < 2; j++)')
        expect(code).toContain('fmax(-1, fmin(1, model->signals.Mat[i][j]))')
      })
    })

    describe('No input handling', () => {
      test('generates default output when no inputs', () => {
        const block = createBlock('Limit1')
        const code = module.generateComputation(block, [], [])

        expect(code).toContain('0.0')
        expect(code).toContain('No input')
      })
    })
  })

  describe('executeSimulation - Runtime behavior', () => {
    describe('Scalar values', () => {
      test('passes through value within range', () => {
        const blockState = createBlockState('limit-1', -10, 10)
        const simState = createSimulationState()

        module.executeSimulation(blockState, [5], simState)
        expect(blockState.outputs[0]).toBe(5)

        module.executeSimulation(blockState, [0], simState)
        expect(blockState.outputs[0]).toBe(0)

        module.executeSimulation(blockState, [-5], simState)
        expect(blockState.outputs[0]).toBe(-5)
      })

      test('clamps value below lower limit', () => {
        const blockState = createBlockState('limit-1', -10, 10)
        const simState = createSimulationState()

        module.executeSimulation(blockState, [-15], simState)
        expect(blockState.outputs[0]).toBe(-10)

        module.executeSimulation(blockState, [-100], simState)
        expect(blockState.outputs[0]).toBe(-10)
      })

      test('clamps value above upper limit', () => {
        const blockState = createBlockState('limit-1', -10, 10)
        const simState = createSimulationState()

        module.executeSimulation(blockState, [15], simState)
        expect(blockState.outputs[0]).toBe(10)

        module.executeSimulation(blockState, [100], simState)
        expect(blockState.outputs[0]).toBe(10)
      })

      test('handles asymmetric limits', () => {
        const blockState = createBlockState('limit-1', -5, 20)
        const simState = createSimulationState()

        module.executeSimulation(blockState, [-10], simState)
        expect(blockState.outputs[0]).toBe(-5)

        module.executeSimulation(blockState, [30], simState)
        expect(blockState.outputs[0]).toBe(20)
      })

      test('handles limit at exact boundaries', () => {
        const blockState = createBlockState('limit-1', -1, 1)
        const simState = createSimulationState()

        module.executeSimulation(blockState, [-1], simState)
        expect(blockState.outputs[0]).toBe(-1)

        module.executeSimulation(blockState, [1], simState)
        expect(blockState.outputs[0]).toBe(1)
      })
    })

    describe('Vector values', () => {
      test('limits vector elements individually', () => {
        const blockState = createBlockState('limit-1', 0, 10)
        const simState = createSimulationState()

        module.executeSimulation(blockState, [[-5, 5, 15]], simState)
        expect(blockState.outputs[0]).toEqual([0, 5, 10])
      })

      test('handles all elements within range', () => {
        const blockState = createBlockState('limit-1', -100, 100)
        const simState = createSimulationState()

        module.executeSimulation(blockState, [[1, 2, 3, 4]], simState)
        expect(blockState.outputs[0]).toEqual([1, 2, 3, 4])
      })

      test('handles all elements outside range', () => {
        const blockState = createBlockState('limit-1', 0, 1)
        const simState = createSimulationState()

        module.executeSimulation(blockState, [[-10, -5, 5, 10]], simState)
        expect(blockState.outputs[0]).toEqual([0, 0, 1, 1])
      })
    })

    describe('Matrix values', () => {
      test('limits matrix elements individually', () => {
        const blockState = createBlockState('limit-1', -1, 1)
        const simState = createSimulationState()

        const input = [
          [-2, 0.5, 2],
          [-0.5, 0, 0.5]
        ]
        module.executeSimulation(blockState, [input], simState)

        expect(blockState.outputs[0]).toEqual([
          [-1, 0.5, 1],
          [-0.5, 0, 0.5]
        ])
      })

      test('handles square matrix', () => {
        const blockState = createBlockState('limit-1', 0, 100)
        const simState = createSimulationState()

        const input = [
          [-10, 50],
          [150, 25]
        ]
        module.executeSimulation(blockState, [input], simState)

        expect(blockState.outputs[0]).toEqual([
          [0, 50],
          [100, 25]
        ])
      })
    })

    describe('Edge cases', () => {
      test('handles undefined input', () => {
        const blockState = createBlockState('limit-1')
        const simState = createSimulationState()

        module.executeSimulation(blockState, [undefined as any], simState)
        expect(blockState.outputs[0]).toBe(0)
      })

      test('handles boolean input (unsupported type)', () => {
        const blockState = createBlockState('limit-1')
        const simState = createSimulationState()

        module.executeSimulation(blockState, [true], simState)
        expect(blockState.outputs[0]).toBe(0)
      })

      test('uses default limits when not specified', () => {
        const blockState: BlockState = {
          blockId: 'limit-1',
          blockType: 'limit',
          outputs: [0],
          internalState: {} // No limits specified
        }
        const simState = createSimulationState()

        // With Infinity limits, no clamping should occur
        module.executeSimulation(blockState, [1000000], simState)
        expect(blockState.outputs[0]).toBe(1000000)

        module.executeSimulation(blockState, [-1000000], simState)
        expect(blockState.outputs[0]).toBe(-1000000)
      })
    })
  })

  describe('Struct member generation', () => {
    test('generates scalar struct member', () => {
      const block = createBlock('Limit1')
      const member = module.generateStructMember(block, 'double')
      expect(member).toContain('double Limit1')
    })

    test('generates vector struct member', () => {
      const block = createBlock('Limit1')
      const member = module.generateStructMember(block, 'double[3]')
      expect(member).toContain('double Limit1[3]')
    })

    test('generates matrix struct member', () => {
      const block = createBlock('Limit1')
      const member = module.generateStructMember(block, 'double[2][4]')
      expect(member).toContain('double Limit1[2][4]')
    })
  })
})

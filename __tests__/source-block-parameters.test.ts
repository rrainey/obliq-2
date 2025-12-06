// __tests__/source-block-parameters.test.ts

import { SourceBlockModule } from '@/lib/blocks/SourceBlockModule'
import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'

describe('Source Block Parameter References (Feature 3)', () => {
  describe('Code Generation', () => {
    test('should generate parameter reference for scalar constant', () => {
      const block: BlockData = {
        id: 'source1',
        name: 'MySource',
        type: 'source',
        position: { x: 0, y: 0 },
        parameters: {
          signalType: 'constant',
          dataType: 'double',
          value: 3.14159,
          useParameter: true,
          parameterName: 'PI'
        }
      }

      const module = new SourceBlockModule()
      const code = module.generateComputation(block, [])

      expect(code).toContain('// Using parameter: PI')
      expect(code).toContain('model->signals.MySource = PI;')
    })

    test('should generate literal value when not using parameter', () => {
      const block: BlockData = {
        id: 'source1',
        name: 'MySource',
        type: 'source',
        position: { x: 0, y: 0 },
        parameters: {
          signalType: 'constant',
          dataType: 'double',
          value: 3.14159,
          useParameter: false
        }
      }

      const module = new SourceBlockModule()
      const code = module.generateComputation(block, [])

      expect(code).not.toContain('Using parameter')
      expect(code).toContain('model->signals.MySource = 3.14159;')
    })

    test('should generate vector parameter reference', () => {
      const block: BlockData = {
        id: 'source1',
        name: 'VectorSource',
        type: 'source',
        position: { x: 0, y: 0 },
        parameters: {
          signalType: 'constant',
          dataType: 'double[3]',
          value: [1, 2, 3],
          useParameter: true,
          parameterName: 'GAINS'
        }
      }

      const module = new SourceBlockModule()
      const code = module.generateComputation(block, [])

      expect(code).toContain('// Using parameter: GAINS')
      expect(code).toContain('// Vector parameter')
      expect(code).toContain('model->signals.VectorSource[0] = GAINS[0];')
      expect(code).toContain('model->signals.VectorSource[1] = GAINS[1];')
      expect(code).toContain('model->signals.VectorSource[2] = GAINS[2];')
    })

    test('should generate matrix parameter reference', () => {
      const block: BlockData = {
        id: 'source1',
        name: 'MatrixSource',
        type: 'source',
        position: { x: 0, y: 0 },
        parameters: {
          signalType: 'constant',
          dataType: 'double[2][2]',
          value: [[1, 2], [3, 4]],
          useParameter: true,
          parameterName: 'TRANSFORM'
        }
      }

      const module = new SourceBlockModule()
      const code = module.generateComputation(block, [])

      expect(code).toContain('// Using parameter: TRANSFORM')
      expect(code).toContain('// Matrix parameter')
      expect(code).toContain('model->signals.MatrixSource[0][0] = TRANSFORM[0][0];')
      expect(code).toContain('model->signals.MatrixSource[1][1] = TRANSFORM[1][1];')
    })
  })

  describe('Simulation Execution', () => {
    test('should use parameter value during simulation for scalar', () => {
      const blockState: BlockState = {
        blockId: 'source1',
        blockType: 'source',
        outputs: [0],
        internalState: {
          signalType: 'constant',
          dataType: 'double',
          value: 0, // This value should be ignored
          useParameter: true,
          parameterName: 'PI'
        }
      }

      const simulationState: SimulationState = {
        time: 0,
        timeStep: 0.01,
        duration: 10,
        blockStates: new Map(),
        signalValues: new Map(),
        sheetLabelValues: new Map(),
        isRunning: true,
        subsystemEnableStates: new Map(),
        subsystemEnableSignals: new Map(),
        parentSubsystemMap: new Map(),
        parameters: new Map([['PI', 3.14159]])
      }

      const module = new SourceBlockModule()
      module.executeSimulation(blockState, [], simulationState)

      expect(blockState.outputs[0]).toBe(3.14159)
    })

    test('should use parameter value for vector during simulation', () => {
      const blockState: BlockState = {
        blockId: 'source1',
        blockType: 'source',
        outputs: [[0, 0, 0]],
        internalState: {
          signalType: 'constant',
          dataType: 'double[3]',
          value: [0, 0, 0],
          useParameter: true,
          parameterName: 'GAINS'
        }
      }

      const simulationState: SimulationState = {
        time: 0,
        timeStep: 0.01,
        duration: 10,
        blockStates: new Map(),
        signalValues: new Map(),
        sheetLabelValues: new Map(),
        isRunning: true,
        subsystemEnableStates: new Map(),
        subsystemEnableSignals: new Map(),
        parentSubsystemMap: new Map(),
        parameters: new Map([['GAINS', [1.5, 2.5, 3.5]]])
      }

      const module = new SourceBlockModule()
      module.executeSimulation(blockState, [], simulationState)

      expect(blockState.outputs[0]).toEqual([1.5, 2.5, 3.5])
    })

    test('should use literal value when parameter not found', () => {
      const blockState: BlockState = {
        blockId: 'source1',
        blockType: 'source',
        outputs: [0],
        internalState: {
          signalType: 'constant',
          dataType: 'double',
          value: 2.71828,
          useParameter: true,
          parameterName: 'MISSING_PARAM'
        }
      }

      const simulationState: SimulationState = {
        time: 0,
        timeStep: 0.01,
        duration: 10,
        blockStates: new Map(),
        signalValues: new Map(),
        sheetLabelValues: new Map(),
        isRunning: true,
        subsystemEnableStates: new Map(),
        subsystemEnableSignals: new Map(),
        parentSubsystemMap: new Map(),
        parameters: new Map([['PI', 3.14159]])
      }

      const module = new SourceBlockModule()

      // Should log warning and output 0
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      module.executeSimulation(blockState, [], simulationState)

      expect(consoleSpy).toHaveBeenCalledWith('Parameter "MISSING_PARAM" not found in simulation state')
      expect(blockState.outputs[0]).toBe(0)

      consoleSpy.mockRestore()
    })

    test('should use literal value when useParameter is false', () => {
      const blockState: BlockState = {
        blockId: 'source1',
        blockType: 'source',
        outputs: [0],
        internalState: {
          signalType: 'constant',
          dataType: 'double',
          value: 2.71828,
          useParameter: false
        }
      }

      const simulationState: SimulationState = {
        time: 0,
        timeStep: 0.01,
        duration: 10,
        blockStates: new Map(),
        signalValues: new Map(),
        sheetLabelValues: new Map(),
        isRunning: true,
        subsystemEnableStates: new Map(),
        subsystemEnableSignals: new Map(),
        parentSubsystemMap: new Map(),
        parameters: new Map([['E', 2.71828]])
      }

      const module = new SourceBlockModule()
      module.executeSimulation(blockState, [], simulationState)

      // Should use literal value, not parameter
      expect(blockState.outputs[0]).toBe(2.71828)
    })
  })
})

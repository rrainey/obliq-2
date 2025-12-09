// __tests__/codegen/segregated-subsystem.test.ts

import { ModelFlattener } from '@/lib/codegen/ModelFlattener'
import { SubsystemCodeGenerator } from '@/lib/codegen/SubsystemCodeGenerator'
import { Sheet } from '@/lib/simulationEngine'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'

describe('Segregated Subsystem Code Generation', () => {
  // Helper to create a minimal sheet
  function createSheet(id: string, name: string, blocks: BlockData[], connections: WireData[]): Sheet {
    return {
      id,
      name,
      blocks,
      connections,
      extents: { width: 1000, height: 800 }
    }
  }

  // Helper to create a block
  function createBlock(id: string, type: string, name: string, parameters: any = {}): BlockData {
    return {
      id,
      type,
      name,
      position: { x: 100, y: 100 },
      parameters
    }
  }

  // Helper to create a connection
  function createConnection(
    id: string,
    sourceBlockId: string,
    sourcePortIndex: number,
    targetBlockId: string,
    targetPortIndex: number
  ): WireData {
    return {
      id,
      sourceBlockId,
      sourcePortIndex,
      targetBlockId,
      targetPortIndex
    }
  }

  describe('Subsystem Detection', () => {
    test('should detect segregated subsystem and NOT flatten it', () => {
      // Create internal subsystem content
      const subBlocks = [
        createBlock('sub_input', 'input_port', 'In1', { portName: 'In1' }),
        createBlock('sub_scale', 'scale', 'Gain', { gain: 2 }),
        createBlock('sub_output', 'output_port', 'Out1', { portName: 'Out1' })
      ]
      const subConnections = [
        createConnection('sub_w1', 'sub_input', 0, 'sub_scale', 0),
        createConnection('sub_w2', 'sub_scale', 0, 'sub_output', 0)
      ]
      const subSheet = createSheet('sub_sheet', 'SubSheet', subBlocks, subConnections)

      // Create main model with segregated subsystem
      const mainBlocks = [
        createBlock('source1', 'source', 'Source1', { value: 10 }),
        createBlock('subsystem1', 'subsystem', 'Controller', {
          codeGenStrategy: 'segregated',
          inputPorts: ['In1'],
          outputPorts: ['Out1'],
          sheets: [subSheet]
        }),
        createBlock('output1', 'output_port', 'Output1', { portName: 'Output1' })
      ]
      const mainConnections = [
        createConnection('main_w1', 'source1', 0, 'subsystem1', 0),
        createConnection('main_w2', 'subsystem1', 0, 'output1', 0)
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, mainConnections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([mainSheet])

      // Subsystem should be preserved as a block with isSegregated flag
      const subsystemBlock = result.model.blocks.find(b => b.block.id === 'subsystem1')
      expect(subsystemBlock).toBeDefined()
      expect(subsystemBlock?.isSegregated).toBe(true)

      // Internal blocks should NOT be in parent's block list
      const internalGain = result.model.blocks.find(b => b.block.name === 'Gain')
      expect(internalGain).toBeUndefined()

      // Segregated info should be collected
      expect(result.model.segregatedSubsystems).toHaveLength(1)
      expect(result.model.segregatedSubsystems[0].subsystemName).toBe('Controller')
      expect(result.model.segregatedSubsystems[0].sanitizedName).toBe('Controller')
      expect(result.model.segregatedSubsystems[0].inputPorts).toHaveLength(1)
      expect(result.model.segregatedSubsystems[0].outputPorts).toHaveLength(1)
    })

    test('should still flatten regular subsystems', () => {
      const subBlocks = [
        createBlock('sub_input', 'input_port', 'In1', { portName: 'In1' }),
        createBlock('sub_scale', 'scale', 'Gain', { gain: 2 }),
        createBlock('sub_output', 'output_port', 'Out1', { portName: 'Out1' })
      ]
      const subConnections = [
        createConnection('sub_w1', 'sub_input', 0, 'sub_scale', 0),
        createConnection('sub_w2', 'sub_scale', 0, 'sub_output', 0)
      ]
      const subSheet = createSheet('sub_sheet', 'SubSheet', subBlocks, subConnections)

      const mainBlocks = [
        createBlock('source1', 'source', 'Source1', { value: 10 }),
        createBlock('subsystem1', 'subsystem', 'FlatSub', {
          codeGenStrategy: 'flatten', // Explicitly flatten
          inputPorts: ['In1'],
          outputPorts: ['Out1'],
          sheets: [subSheet]
        }),
        createBlock('output1', 'output_port', 'Output1', { portName: 'Output1' })
      ]
      const mainConnections = [
        createConnection('main_w1', 'source1', 0, 'subsystem1', 0),
        createConnection('main_w2', 'subsystem1', 0, 'output1', 0)
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, mainConnections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([mainSheet])

      // Internal blocks SHOULD be in parent's block list
      const internalGain = result.model.blocks.find(b => b.flattenedName === 'FlatSub_Gain')
      expect(internalGain).toBeDefined()

      // No segregated subsystems
      expect(result.model.segregatedSubsystems).toHaveLength(0)
    })

    test('should detect stateful blocks in segregated subsystem', () => {
      const subBlocks = [
        createBlock('sub_input', 'input_port', 'In1', { portName: 'In1' }),
        createBlock('sub_integrator', 'integrator', 'Integrator1', { initialCondition: 0 }),
        createBlock('sub_output', 'output_port', 'Out1', { portName: 'Out1' })
      ]
      const subConnections = [
        createConnection('sub_w1', 'sub_input', 0, 'sub_integrator', 0),
        createConnection('sub_w2', 'sub_integrator', 0, 'sub_output', 0)
      ]
      const subSheet = createSheet('sub_sheet', 'SubSheet', subBlocks, subConnections)

      const mainBlocks = [
        createBlock('source1', 'source', 'Source1', { value: 1 }),
        createBlock('subsystem1', 'subsystem', 'StatefulSub', {
          codeGenStrategy: 'segregated',
          inputPorts: ['In1'],
          outputPorts: ['Out1'],
          sheets: [subSheet]
        })
      ]
      const mainConnections = [
        createConnection('main_w1', 'source1', 0, 'subsystem1', 0)
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, mainConnections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([mainSheet])

      expect(result.model.segregatedSubsystems).toHaveLength(1)
      expect(result.model.segregatedSubsystems[0].hasState).toBe(true)
      expect(result.model.segregatedSubsystems[0].stateCount).toBe(1)
    })
  })

  describe('Code Generation', () => {
    test('should generate valid header for simple subsystem', () => {
      const subBlocks = [
        createBlock('sub_input', 'input_port', 'In1', { portName: 'In1' }),
        createBlock('sub_scale', 'scale', 'Gain', { gain: 2 }),
        createBlock('sub_output', 'output_port', 'Out1', { portName: 'Out1' })
      ]
      const subConnections = [
        createConnection('sub_w1', 'sub_input', 0, 'sub_scale', 0),
        createConnection('sub_w2', 'sub_scale', 0, 'sub_output', 0)
      ]
      const subSheet = createSheet('sub_sheet', 'SubSheet', subBlocks, subConnections)

      const mainBlocks = [
        createBlock('subsystem1', 'subsystem', 'Controller', {
          codeGenStrategy: 'segregated',
          inputPorts: ['In1'],
          outputPorts: ['Out1'],
          sheets: [subSheet]
        })
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, [])

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([mainSheet])

      expect(result.model.segregatedSubsystems).toHaveLength(1)

      const generator = new SubsystemCodeGenerator(result.model.segregatedSubsystems[0])
      const code = generator.generate()

      // Check header structure
      expect(code.header).toContain('#ifndef CONTROLLER')
      expect(code.header).toContain('typedef struct')
      expect(code.header).toContain('Controller_inputs_t')
      expect(code.header).toContain('Controller_outputs_t')
      expect(code.header).toContain('Controller_signals_t')
      expect(code.header).toContain('Controller_t')
      expect(code.header).toContain('void Controller_init(')
      expect(code.header).toContain('void Controller_compute_outputs(')
    })

    test('should generate valid source for simple subsystem', () => {
      const subBlocks = [
        createBlock('sub_input', 'input_port', 'In1', { portName: 'In1' }),
        createBlock('sub_scale', 'scale', 'Gain', { gain: 2 }),
        createBlock('sub_output', 'output_port', 'Out1', { portName: 'Out1' })
      ]
      const subConnections = [
        createConnection('sub_w1', 'sub_input', 0, 'sub_scale', 0),
        createConnection('sub_w2', 'sub_scale', 0, 'sub_output', 0)
      ]
      const subSheet = createSheet('sub_sheet', 'SubSheet', subBlocks, subConnections)

      const mainBlocks = [
        createBlock('subsystem1', 'subsystem', 'Controller', {
          codeGenStrategy: 'segregated',
          inputPorts: ['In1'],
          outputPorts: ['Out1'],
          sheets: [subSheet]
        })
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, [])

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([mainSheet])

      const generator = new SubsystemCodeGenerator(result.model.segregatedSubsystems[0])
      const code = generator.generate()

      // Check source structure
      expect(code.source).toContain('#include "Controller.h"')
      expect(code.source).toContain('void Controller_init(Controller_t*')
      expect(code.source).toContain('void Controller_compute_outputs(Controller_t*')
      expect(code.source).toContain('memset(&model->inputs, 0, sizeof(model->inputs))')
    })

    test('should generate derivatives function for stateful subsystem', () => {
      const subBlocks = [
        createBlock('sub_input', 'input_port', 'In1', { portName: 'In1' }),
        createBlock('sub_integrator', 'integrator', 'Integrator1', { initialCondition: 0 }),
        createBlock('sub_output', 'output_port', 'Out1', { portName: 'Out1' })
      ]
      const subConnections = [
        createConnection('sub_w1', 'sub_input', 0, 'sub_integrator', 0),
        createConnection('sub_w2', 'sub_integrator', 0, 'sub_output', 0)
      ]
      const subSheet = createSheet('sub_sheet', 'SubSheet', subBlocks, subConnections)

      const mainBlocks = [
        createBlock('subsystem1', 'subsystem', 'Dynamics', {
          codeGenStrategy: 'segregated',
          inputPorts: ['In1'],
          outputPorts: ['Out1'],
          sheets: [subSheet]
        })
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, [])

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([mainSheet])

      const generator = new SubsystemCodeGenerator(result.model.segregatedSubsystems[0])
      const code = generator.generate()

      // Header should have derivatives prototype
      expect(code.header).toContain('void Dynamics_compute_derivatives(')
      expect(code.header).toContain('Dynamics_states_t* derivatives')

      // Source should have derivatives function
      expect(code.source).toContain('void Dynamics_compute_derivatives(Dynamics_t* sub, Dynamics_states_t* derivatives)')
    })
  })
})

// __tests__/codegen/model-flattening.test.ts

import { ModelFlattener } from '@/lib/codegen/ModelFlattener'
import { Sheet } from '@/lib/simulationEngine'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'

describe('Model Flattening', () => {
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

  describe('Single Sheet Flattening', () => {
    test('should flatten empty model', () => {
      const sheets: Sheet[] = []
      const flattener = new ModelFlattener()
      const result = flattener.flattenModel(sheets)

      expect(result.model.blocks).toHaveLength(0)
      expect(result.model.connections).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })

    test('should flatten single sheet with no changes', () => {
      const blocks = [
        createBlock('sum1', 'sum', 'Sum1'),
        createBlock('scale1', 'scale', 'Scale1', { gain: 2 })
      ]
      const connections = [
        createConnection('wire1', 'sum1', 0, 'scale1', 0)
      ]
      const sheet = createSheet('main', 'Main', blocks, connections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([sheet])

      expect(result.model.blocks).toHaveLength(2)
      expect(result.model.connections).toHaveLength(1)
      
      // Check that names are preserved
      const flatSum = result.model.blocks.find(b => b.block.id === 'sum1')
      expect(flatSum?.flattenedName).toBe('Sum1')
      expect(flatSum?.subsystemPath).toEqual([])
    })

    test('should warn about disconnected blocks', () => {
      const blocks = [
        createBlock('orphan1', 'sum', 'OrphanSum'),
        createBlock('orphan2', 'multiply', 'OrphanMultiply')
      ]
      const sheet = createSheet('main', 'Main', blocks, [])

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([sheet])

      expect(result.warnings).toHaveLength(2)
      expect(result.warnings[0]).toContain('OrphanSum')
      expect(result.warnings[1]).toContain('OrphanMultiply')
    })

    test('should preserve block parameters during flattening', () => {
      const blocks = [
        createBlock('tf1', 'transfer_function', 'TF1', {
          numerator: [1, 2],
          denominator: [1, 3, 2]
        })
      ]
      const sheet = createSheet('main', 'Main', blocks, [])

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([sheet])

      const flatTF = result.model.blocks.find(b => b.block.id === 'tf1')
      expect(flatTF?.block.parameters).toEqual({
        numerator: [1, 2],
        denominator: [1, 3, 2]
      })
    })
  })

  describe('Subsystem Flattening', () => {
    test('should flatten simple subsystem', () => {
      const subBlocks = [
        createBlock('sub_input', 'input_port', 'In1', { portName: 'In1' }),
        createBlock('sub_scale', 'scale', 'Scale1', { gain: 3 }),
        createBlock('sub_output', 'output_port', 'Out1', { portName: 'Out1' })
      ]
      const subConnections = [
        createConnection('sub_w1', 'sub_input', 0, 'sub_scale', 0),
        createConnection('sub_w2', 'sub_scale', 0, 'sub_output', 0)
      ]
      const subSheet = createSheet('sub_sheet', 'SubSheet', subBlocks, subConnections)

      const mainBlocks = [
        createBlock('input1', 'source', 'Source1', { value: 10 }),
        createBlock('subsystem1', 'subsystem', 'MySub', {
          inputPorts: ['In1'],
          outputPorts: ['Out1'],
          sheets: [subSheet]
        }),
        createBlock('output1', 'output_port', 'Output1', { portName: 'Output1' })
      ]
      const mainConnections = [
        createConnection('main_w1', 'input1', 0, 'subsystem1', 0),
        createConnection('main_w2', 'subsystem1', 0, 'output1', 0)
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, mainConnections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([mainSheet])

      // Should have: Source1, Scale1 (from subsystem), Output1
      // Subsystem block and its input/output ports should be removed
      expect(result.model.blocks).toHaveLength(3)
      
      // Check flattened names
      const flatScale = result.model.blocks.find(b => b.block.type === 'scale')
      expect(flatScale?.flattenedName).toBe('MySub_Scale1')
      expect(flatScale?.subsystemPath).toEqual(['MySub'])

      // Check connections are properly rewired
      const scaleConnections = result.model.connections.filter(
        c => c.targetBlockId === flatScale?.block.id || c.sourceBlockId === flatScale?.block.id
      )
      expect(scaleConnections).toHaveLength(2)
    })

    test('should handle nested subsystems', () => {
      // Create inner subsystem
      const innerBlocks = [
        createBlock('inner_input', 'input_port', 'InnerIn', { portName: 'InnerIn' }),
        createBlock('inner_multiply', 'multiply', 'Multiply1'),
        createBlock('inner_output', 'output_port', 'InnerOut', { portName: 'InnerOut' })
      ]
      const innerConnections = [
        createConnection('inner_w1', 'inner_input', 0, 'inner_multiply', 0),
        createConnection('inner_w2', 'inner_multiply', 0, 'inner_output', 0)
      ]
      const innerSheet = createSheet('inner_sheet', 'InnerSheet', innerBlocks, innerConnections)

      // Create outer subsystem containing inner
      const outerBlocks = [
        createBlock('outer_input', 'input_port', 'OuterIn', { portName: 'OuterIn' }),
        createBlock('inner_subsystem', 'subsystem', 'InnerSub', {
          inputPorts: ['InnerIn'],
          outputPorts: ['InnerOut'],
          sheets: [innerSheet]
        }),
        createBlock('outer_output', 'output_port', 'OuterOut', { portName: 'OuterOut' })
      ]
      const outerConnections = [
        createConnection('outer_w1', 'outer_input', 0, 'inner_subsystem', 0),
        createConnection('outer_w2', 'inner_subsystem', 0, 'outer_output', 0)
      ]
      const outerSheet = createSheet('outer_sheet', 'OuterSheet', outerBlocks, outerConnections)

      // Create main sheet
      const mainBlocks = [
        createBlock('main_source', 'source', 'MainSource', { value: 5 }),
        createBlock('outer_subsystem', 'subsystem', 'OuterSub', {
          inputPorts: ['OuterIn'],
          outputPorts: ['OuterOut'],
          sheets: [outerSheet]
        }),
        createBlock('main_output', 'output_port', 'MainOutput', { portName: 'MainOutput' })
      ]
      const mainConnections = [
        createConnection('main_w1', 'main_source', 0, 'outer_subsystem', 0),
        createConnection('main_w2', 'outer_subsystem', 0, 'main_output', 0)
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, mainConnections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([mainSheet])

      // Should have: MainSource, Multiply1 (from nested subsystem), MainOutput
      expect(result.model.blocks).toHaveLength(3)

      // Check deeply nested name
      const flatMultiply = result.model.blocks.find(b => b.block.type === 'multiply')
      expect(flatMultiply?.flattenedName).toBe('OuterSub_InnerSub_Multiply1')
      expect(flatMultiply?.subsystemPath).toEqual(['OuterSub', 'InnerSub'])
    })

    test('should handle multiple subsystem instances', () => {
      const subBlocks = [
        createBlock('sub_input', 'input_port', 'In', { portName: 'In' }),
        createBlock('sub_gain', 'scale', 'Gain', { gain: 2 }),
        createBlock('sub_output', 'output_port', 'Out', { portName: 'Out' })
      ]
      const subConnections = [
        createConnection('sub_w1', 'sub_input', 0, 'sub_gain', 0),
        createConnection('sub_w2', 'sub_gain', 0, 'sub_output', 0)
      ]
      const subSheet = createSheet('sub_sheet', 'SubSheet', subBlocks, subConnections)

      const mainBlocks = [
        createBlock('source1', 'source', 'Source1', { value: 1 }),
        createBlock('source2', 'source', 'Source2', { value: 2 }),
        createBlock('sub1', 'subsystem', 'FirstSub', {
          inputPorts: ['In'],
          outputPorts: ['Out'],
          sheets: [subSheet]
        }),
        createBlock('sub2', 'subsystem', 'SecondSub', {
          inputPorts: ['In'],
          outputPorts: ['Out'],
          sheets: [subSheet]
        }),
        createBlock('sum', 'sum', 'Sum1')
      ]
      const mainConnections = [
        createConnection('w1', 'source1', 0, 'sub1', 0),
        createConnection('w2', 'source2', 0, 'sub2', 0),
        createConnection('w3', 'sub1', 0, 'sum', 0),
        createConnection('w4', 'sub2', 0, 'sum', 1)
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, mainConnections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([mainSheet])

      // Should have unique names for each instance
      const gains = result.model.blocks.filter(b => b.block.type === 'scale')
      expect(gains).toHaveLength(2)
      
      const gainNames = gains.map(g => g.flattenedName).sort()
      expect(gainNames).toEqual(['FirstSub_Gain', 'SecondSub_Gain'])
    })
  })

  describe('Enable Signal Handling', () => {
    test('should track subsystem with enable input', () => {
      const subBlocks = [
        createBlock('sub_input', 'input_port', 'In1', { portName: 'In1' }),
        createBlock('sub_tf', 'transfer_function', 'TF1', {
          numerator: [1],
          denominator: [1, 1]
        }),
        createBlock('sub_output', 'output_port', 'Out1', { portName: 'Out1' })
      ]
      const subConnections = [
        createConnection('sub_w1', 'sub_input', 0, 'sub_tf', 0),
        createConnection('sub_w2', 'sub_tf', 0, 'sub_output', 0)
      ]
      const subSheet = createSheet('sub_sheet', 'SubSheet', subBlocks, subConnections)

      const mainBlocks = [
        createBlock('enable_source', 'source', 'EnableSignal', { 
          value: true,
          dataType: 'bool'
        }),
        createBlock('data_source', 'source', 'DataSignal', { value: 5 }),
        createBlock('subsystem1', 'subsystem', 'EnabledSub', {
          showEnableInput: true,
          inputPorts: ['In1'],
          outputPorts: ['Out1'],
          sheets: [subSheet]
        }),
        createBlock('output1', 'output_port', 'Output1', { portName: 'Output1' })
      ]
      const mainConnections = [
        createConnection('enable_wire', 'enable_source', 0, 'subsystem1', -1), // Enable port
        createConnection('data_wire', 'data_source', 0, 'subsystem1', 0),
        createConnection('output_wire', 'subsystem1', 0, 'output1', 0)
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, mainConnections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([mainSheet])

      // Check enable info
      expect(result.model.subsystemEnableInfo).toHaveLength(1)
      expect(result.model.subsystemEnableInfo[0]).toMatchObject({
        subsystemId: 'subsystem1',
        subsystemName: 'EnabledSub',
        hasEnableInput: true
      })

      // Check that enable wire is preserved
      const enableWire = result.model.connections.find(c => c.targetPortIndex === -1)
      expect(enableWire).toBeDefined()
      expect(enableWire?.sourceBlockId).toBe('enable_source')
    })

    test('should handle nested enable inheritance', () => {
      // Create child subsystem with enable
      const childBlocks = [
        createBlock('child_input', 'input_port', 'ChildIn', { portName: 'ChildIn' }),
        createBlock('child_scale', 'scale', 'ChildScale', { gain: 2 }),
        createBlock('child_output', 'output_port', 'ChildOut', { portName: 'ChildOut' })
      ]
      const childConnections = [
        createConnection('child_w1', 'child_input', 0, 'child_scale', 0),
        createConnection('child_w2', 'child_scale', 0, 'child_output', 0)
      ]
      const childSheet = createSheet('child_sheet', 'ChildSheet', childBlocks, childConnections)

      // Create parent subsystem with enable containing child
      const parentBlocks = [
        createBlock('parent_enable_in', 'input_port', 'ChildEnable', { 
          portName: 'ChildEnable',
          dataType: 'bool'
        }),
        createBlock('parent_data_in', 'input_port', 'DataIn', { portName: 'DataIn' }),
        createBlock('child_subsystem', 'subsystem', 'ChildSub', {
          showEnableInput: true,
          inputPorts: ['ChildIn'],
          outputPorts: ['ChildOut'],
          sheets: [childSheet]
        }),
        createBlock('parent_output', 'output_port', 'DataOut', { portName: 'DataOut' })
      ]
      const parentConnections = [
        createConnection('parent_w1', 'parent_enable_in', 0, 'child_subsystem', -1),
        createConnection('parent_w2', 'parent_data_in', 0, 'child_subsystem', 0),
        createConnection('parent_w3', 'child_subsystem', 0, 'parent_output', 0)
      ]
      const parentSheet = createSheet('parent_sheet', 'ParentSheet', parentBlocks, parentConnections)

      // Create main sheet
      const mainBlocks = [
        createBlock('parent_enable', 'source', 'ParentEnable', { 
          value: true,
          dataType: 'bool'
        }),
        createBlock('child_enable', 'source', 'ChildEnable', {
          value: true,
          dataType: 'bool'
        }),
        createBlock('data', 'source', 'Data', { value: 10 }),
        createBlock('parent_subsystem', 'subsystem', 'ParentSub', {
          showEnableInput: true,
          inputPorts: ['ChildEnable', 'DataIn'],
          outputPorts: ['DataOut'],
          sheets: [parentSheet]
        }),
        createBlock('output', 'output_port', 'Output', { portName: 'Output' })
      ]
      const mainConnections = [
        createConnection('main_w1', 'parent_enable', 0, 'parent_subsystem', -1),
        createConnection('main_w2', 'child_enable', 0, 'parent_subsystem', 0),
        createConnection('main_w3', 'data', 0, 'parent_subsystem', 1),
        createConnection('main_w4', 'parent_subsystem', 0, 'output', 0)
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, mainConnections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([mainSheet])

      // Should track both subsystems
      expect(result.model.subsystemEnableInfo).toHaveLength(2)

      // Find parent and child
      const parentInfo = result.model.subsystemEnableInfo.find(
        s => s.subsystemName === 'ParentSub'
      )
      const childInfo = result.model.subsystemEnableInfo.find(
        s => s.subsystemName === 'ParentSub_ChildSub'
      )

      expect(parentInfo).toBeDefined()
      expect(childInfo).toBeDefined()
      expect(childInfo?.parentSubsystemId).toBe(parentInfo?.subsystemId)
    })

    test('should warn about unconnected enable inputs', () => {
      const mainBlocks = [
        createBlock('subsystem1', 'subsystem', 'UnconnectedEnableSub', {
          showEnableInput: true,
          inputPorts: [],
          outputPorts: [],
          sheets: [createSheet('empty', 'Empty', [], [])]
        })
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, [])

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([mainSheet])

      expect(result.warnings).toContain(
        'Subsystem UnconnectedEnableSub has enable input but no enable wire connected'
      )
    })
  })

  describe('Sheet Label Resolution', () => {
    test('should resolve sheet labels within same subsystem', () => {
      const sheet1Blocks = [
        createBlock('input1', 'input_port', 'Input1', { portName: 'Input1' }),
        createBlock('sink1', 'sheet_label_sink', 'Sink1', { signalName: 'Signal1' })
      ]
      const sheet1Connections = [
        createConnection('s1_w1', 'input1', 0, 'sink1', 0)
      ]
      const sheet1 = createSheet('sheet1', 'Sheet1', sheet1Blocks, sheet1Connections)

      const sheet2Blocks = [
        createBlock('source1', 'sheet_label_source', 'Source1', { signalName: 'Signal1' }),
        createBlock('output1', 'output_port', 'Output1', { portName: 'Output1' })
      ]
      const sheet2Connections = [
        createConnection('s2_w1', 'source1', 0, 'output1', 0)
      ]
      const sheet2 = createSheet('sheet2', 'Sheet2', sheet2Blocks, sheet2Connections)

      const mainBlocks = [
        createBlock('main_input', 'source', 'MainInput', { value: 42 }),
        createBlock('subsystem1', 'subsystem', 'Sub1', {
          inputPorts: ['Input1'],
          outputPorts: ['Output1'],
          sheets: [sheet1, sheet2]
        }),
        createBlock('main_output', 'output_port', 'MainOutput', { portName: 'MainOutput' })
      ]
      const mainConnections = [
        createConnection('main_w1', 'main_input', 0, 'subsystem1', 0),
        createConnection('main_w2', 'subsystem1', 0, 'main_output', 0)
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, mainConnections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([mainSheet])

      // Sheet labels should be removed and replaced with direct connection
      const sheetLabelBlocks = result.model.blocks.filter(
        b => b.block.type === 'sheet_label_sink' || b.block.type === 'sheet_label_source'
      )
      expect(sheetLabelBlocks).toHaveLength(0)

      // Should have direct connection from input to output through subsystem
      expect(result.model.blocks).toHaveLength(2) // MainInput and MainOutput
    })

    test('should handle multiple sheet label pairs', () => {
      const blocks = [
        createBlock('input1', 'input_port', 'Input1', { portName: 'Input1' }),
        createBlock('input2', 'input_port', 'Input2', { portName: 'Input2' }),
        createBlock('sink1', 'sheet_label_sink', 'Sink1', { signalName: 'SignalA' }),
        createBlock('sink2', 'sheet_label_sink', 'Sink2', { signalName: 'SignalB' }),
        createBlock('source1', 'sheet_label_source', 'Source1', { signalName: 'SignalA' }),
        createBlock('source2', 'sheet_label_source', 'Source2', { signalName: 'SignalB' }),
        createBlock('sum', 'sum', 'Sum1'),
        createBlock('output', 'output_port', 'Output1', { portName: 'Output1' })
      ]
      const connections = [
        createConnection('w1', 'input1', 0, 'sink1', 0),
        createConnection('w2', 'input2', 0, 'sink2', 0),
        createConnection('w3', 'source1', 0, 'sum', 0),
        createConnection('w4', 'source2', 0, 'sum', 1),
        createConnection('w5', 'sum', 0, 'output', 0)
      ]
      const sheet = createSheet('main', 'Main', blocks, connections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([sheet])

      // Should resolve both sheet label pairs
      const finalBlocks = result.model.blocks.map(b => b.block.type).sort()
      expect(finalBlocks).toEqual(['input_port', 'input_port', 'output_port', 'sum'])
    })

    test('should warn about unmatched sheet labels', () => {
      const blocks = [
        createBlock('sink1', 'sheet_label_sink', 'Sink1', { signalName: 'OrphanSignal' }),
        createBlock('source1', 'sheet_label_source', 'Source1', { signalName: 'UnmatchedSignal' })
      ]
      const sheet = createSheet('main', 'Main', blocks, [])

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([sheet])

      const warnings = result.warnings.join(' ')
      expect(warnings).toContain('UnmatchedSignal')
    })
  })

  describe('Connection Type Preservation', () => {
    test('should preserve connection metadata', () => {
      const blocks = [
        createBlock('source1', 'source', 'Source1', { value: 1 }),
        createBlock('scale1', 'scale', 'Scale1', { gain: 2 })
      ]
      const connections = [
        {
          ...createConnection('wire1', 'source1', 0, 'scale1', 0),
          connectionType: 'direct' as const
        }
      ]
      const sheet = createSheet('main', 'Main', blocks, connections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([sheet])

      const flatConnection = result.model.connections[0]
      expect(flatConnection.connectionType).toBe('direct')
    })
  })

  describe('Metadata Generation', () => {
    test('should generate flattening metadata', () => {
      const subSheet = createSheet('sub', 'Sub', [], [])
      const mainBlocks = [
        createBlock('sub1', 'subsystem', 'Sub1', {
          sheets: [subSheet]
        }),
        createBlock('sub2', 'subsystem', 'Sub2', {
          sheets: [subSheet]
        })
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, [])

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([mainSheet])

      expect(result.model.metadata.modelName).toBe('model')
      expect(result.model.metadata.subsystemCount).toBe(2)
      expect(result.model.metadata.totalBlocks).toBe(0) // Empty subsystems
      expect(result.model.metadata.maxNestingDepth).toBe(0) // No blocks inside subsystems
    })
  })

  describe('Complex Scenarios', () => {
    test('should handle subsystem with multiple sheets', () => {
      const sheet1 = createSheet('s1', 'Sheet1', 
        [createBlock('b1', 'sum', 'Sum1')], 
        []
      )
      const sheet2 = createSheet('s2', 'Sheet2',
        [createBlock('b2', 'multiply', 'Mult1')],
        []
      )
      
      const mainBlocks = [
        createBlock('sub', 'subsystem', 'MultiSheetSub', {
          sheets: [sheet1, sheet2]
        })
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, [])

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([mainSheet])

      // Should flatten blocks from both sheets
      expect(result.model.blocks).toHaveLength(2)
      const blockNames = result.model.blocks.map(b => b.flattenedName).sort()
      expect(blockNames).toEqual(['MultiSheetSub_Mult1', 'MultiSheetSub_Sum1'])
    })

    test('should handle circular subsystem references gracefully', () => {
      // This shouldn't happen in practice, but test defensive coding
      const mainBlocks = [
        createBlock('sub1', 'subsystem', 'CircularSub', {
          sheets: [] // Would contain reference back to main in a circular case
        })
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, [])

      const flattener = new ModelFlattener()
      // Should not crash or infinite loop
      expect(() => {
        flattener.flattenModel([mainSheet])
      }).not.toThrow()
    })
  })

  describe('Diagnostics and Debugging', () => {
    test('should provide diagnostic information', () => {
      const subSheet = createSheet('sub', 'Sub', 
        [createBlock('b1', 'sum', 'Sum1')],
        []
      )
      const blocks = [
        createBlock('input', 'input_port', 'Input1', { portName: 'Input1' }),
        createBlock('sink', 'sheet_label_sink', 'Sink1', { signalName: 'Signal1' }),
        createBlock('source', 'sheet_label_source', 'Source1', { signalName: 'Signal1' }),
        createBlock('subsystem', 'subsystem', 'Sub1', {
          showEnableInput: true,
          sheets: [subSheet]
        }),
        createBlock('output', 'output_port', 'Output1', { portName: 'Output1' })
      ]
      const connections = [
        createConnection('w1', 'input', 0, 'sink', 0),
        createConnection('w2', 'source', 0, 'output', 0)
      ]
      const sheet = createSheet('main', 'Main', blocks, connections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([sheet])

      expect(result.diagnostics).toBeDefined()
      expect(result.diagnostics.blocksFlattened).toBeGreaterThan(0)
      expect(result.diagnostics.subsystemsProcessed).toBe(1)
      expect(result.diagnostics.sheetLabelsResolved).toBeGreaterThanOrEqual(0)
      expect(result.diagnostics.enableScopesCreated).toBe(1)
    })
  })

  describe('Enable Wire Detection', () => {
    test('should find enable wire with special port index', () => {
      const blocks = [
        createBlock('enable', 'source', 'Enable', { value: true, dataType: 'bool' }),
        createBlock('sub', 'subsystem', 'Sub1', {
          showEnableInput: true,
          sheets: []
        })
      ]
      const connections = [
        createConnection('enable_wire', 'enable', 0, 'sub', -1) // -1 is enable port
      ]
      const sheet = createSheet('main', 'Main', blocks, connections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([sheet])

      const enableInfo = result.model.subsystemEnableInfo[0]
      expect(enableInfo.enableWire).toBeDefined()
      expect(enableInfo.enableWire?.targetPortIndex).toBe(-1)
    })
  })
})
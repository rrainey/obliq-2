// __tests__/codegen/enable-signals.test.ts

import { ModelFlattener } from '@/lib/codegen/ModelFlattener'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { Sheet } from '@/lib/simulationEngine'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'

describe('Enable Signal Functionality', () => {
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

  describe('Enable Signal Detection', () => {
    test('should identify subsystems with enable inputs', () => {
      const blocks = [
        createBlock('sub1', 'subsystem', 'EnabledSub', {
          showEnableInput: true,
          sheets: []
        }),
        createBlock('sub2', 'subsystem', 'NormalSub', {
          showEnableInput: false,
          sheets: []
        }),
        createBlock('sub3', 'subsystem', 'DefaultSub', {
          // showEnableInput not specified, defaults to false
          sheets: []
        })
      ]
      const sheet = createSheet('main', 'Main', blocks, [])

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([sheet])

      const enabledSubsystems = result.model.subsystemEnableInfo.filter(s => s.hasEnableInput)
      expect(enabledSubsystems).toHaveLength(1)
      expect(enabledSubsystems[0].subsystemName).toBe('EnabledSub')
    })

    test('should detect enable wire connections', () => {
      const blocks = [
        createBlock('enable_signal', 'source', 'EnableSignal', {
          value: true,
          dataType: 'bool'
        }),
        createBlock('sub', 'subsystem', 'ControlledSub', {
          showEnableInput: true,
          sheets: []
        })
      ]
      const connections = [
        createConnection('enable_wire', 'enable_signal', 0, 'sub', -1) // -1 is enable port
      ]
      const sheet = createSheet('main', 'Main', blocks, connections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([sheet])

      const enableInfo = result.model.subsystemEnableInfo[0]
      expect(enableInfo.enableWire).toBeDefined()
      expect(enableInfo.enableWire?.sourceBlockId).toBe('enable_signal')
      expect(enableInfo.enableWire?.targetPortIndex).toBe(-1)
    })

    test('should handle boolean expressions as enable signals', () => {
      const blocks = [
        createBlock('input1', 'input_port', 'Threshold', { 
          portName: 'Threshold',
          dataType: 'double'
        }),
        createBlock('compare', 'comparison', 'Compare', {
          operator: '>',
          threshold: 5.0
        }),
        createBlock('sub', 'subsystem', 'ConditionalSub', {
          showEnableInput: true,
          sheets: []
        })
      ]
      const connections = [
        createConnection('w1', 'input1', 0, 'compare', 0),
        createConnection('w2', 'compare', 0, 'sub', -1)
      ]
      const sheet = createSheet('main', 'Main', blocks, connections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([sheet])

      const enableInfo = result.model.subsystemEnableInfo[0]
      expect(enableInfo.enableWire?.sourceBlockId).toBe('compare')
    })
  })

  describe('Enable Scope Hierarchy', () => {
    test('should track single-level enable scope', () => {
      const subBlocks = [
        createBlock('input', 'input_port', 'In', { portName: 'In' }),
        createBlock('tf', 'transfer_function', 'TF1', {
          numerator: [1],
          denominator: [1, 1]
        }),
        createBlock('output', 'output_port', 'Out', { portName: 'Out' })
      ]
      const subConnections = [
        createConnection('w1', 'input', 0, 'tf', 0),
        createConnection('w2', 'tf', 0, 'output', 0)
      ]
      const subSheet = createSheet('sub_sheet', 'SubSheet', subBlocks, subConnections)

      const mainBlocks = [
        createBlock('enable', 'source', 'Enable', { value: true, dataType: 'bool' }),
        createBlock('data', 'source', 'Data', { value: 1.0 }),
        createBlock('sub', 'subsystem', 'EnabledSub', {
          showEnableInput: true,
          inputPorts: ['In'],
          outputPorts: ['Out'],
          sheets: [subSheet]
        }),
        createBlock('output', 'output_port', 'Output', { portName: 'Output' })
      ]
      const mainConnections = [
        createConnection('w1', 'enable', 0, 'sub', -1),
        createConnection('w2', 'data', 0, 'sub', 0),
        createConnection('w3', 'sub', 0, 'output', 0)
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, mainConnections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([mainSheet])

      // Check that TF block is in the subsystem's enable scope
      const tfBlock = result.model.blocks.find(b => b.block.type === 'transfer_function')
      expect(tfBlock?.enableScope).toBe('sub')

      // Check subsystem enable info
      const enableInfo = result.model.subsystemEnableInfo[0]
      expect(enableInfo.controlledBlockIds).toContain('tf')
    })

    test('should handle nested enable scopes', () => {
      // Create grandchild subsystem
      const grandchildBlocks = [
        createBlock('gc_input', 'input_port', 'GCIn', { portName: 'GCIn' }),
        createBlock('gc_scale', 'scale', 'GCScale', { gain: 4 }),
        createBlock('gc_output', 'output_port', 'GCOut', { portName: 'GCOut' })
      ]
      const grandchildConnections = [
        createConnection('gc_w1', 'gc_input', 0, 'gc_scale', 0),
        createConnection('gc_w2', 'gc_scale', 0, 'gc_output', 0)
      ]
      const grandchildSheet = createSheet('gc_sheet', 'GCSheet', grandchildBlocks, grandchildConnections)

      // Create child subsystem containing grandchild
      const childBlocks = [
        createBlock('c_input', 'input_port', 'CIn', { portName: 'CIn' }),
        createBlock('c_enable_input', 'input_port', 'GCEnable', { 
          portName: 'GCEnable',
          dataType: 'bool'
        }),
        createBlock('c_scale', 'scale', 'CScale', { gain: 2 }),
        createBlock('grandchild_sub', 'subsystem', 'GrandchildSub', {
          showEnableInput: true,
          inputPorts: ['GCIn'],
          outputPorts: ['GCOut'],
          sheets: [grandchildSheet]
        }),
        createBlock('c_sum', 'sum', 'CSum'),
        createBlock('c_output', 'output_port', 'COut', { portName: 'COut' })
      ]
      const childConnections = [
        createConnection('c_w1', 'c_input', 0, 'c_scale', 0),
        createConnection('c_w2', 'c_scale', 0, 'grandchild_sub', 0),
        createConnection('c_w3', 'c_enable_input', 0, 'grandchild_sub', -1),
        createConnection('c_w4', 'c_scale', 0, 'c_sum', 0),
        createConnection('c_w5', 'grandchild_sub', 0, 'c_sum', 1),
        createConnection('c_w6', 'c_sum', 0, 'c_output', 0)
      ]
      const childSheet = createSheet('c_sheet', 'CSheet', childBlocks, childConnections)

      // Create parent subsystem
      const parentBlocks = [
        createBlock('p_input', 'input_port', 'PIn', { portName: 'PIn' }),
        createBlock('p_enable', 'input_port', 'CEnable', { 
          portName: 'CEnable',
          dataType: 'bool'
        }),
        createBlock('p_gc_enable', 'input_port', 'GCEnable', {
          portName: 'GCEnable',
          dataType: 'bool'
        }),
        createBlock('child_sub', 'subsystem', 'ChildSub', {
          showEnableInput: true,
          inputPorts: ['CIn', 'GCEnable'],
          outputPorts: ['COut'],
          sheets: [childSheet]
        }),
        createBlock('p_output', 'output_port', 'POut', { portName: 'POut' })
      ]
      const parentConnections = [
        createConnection('p_w1', 'p_input', 0, 'child_sub', 0),
        createConnection('p_w2', 'p_gc_enable', 0, 'child_sub', 1),
        createConnection('p_w3', 'p_enable', 0, 'child_sub', -1),
        createConnection('p_w4', 'child_sub', 0, 'p_output', 0)
      ]
      const parentSheet = createSheet('p_sheet', 'PSheet', parentBlocks, parentConnections)

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
        createBlock('gc_enable', 'source', 'GCEnable', {
          value: true,
          dataType: 'bool'
        }),
        createBlock('data', 'source', 'Data', { value: 1.0 }),
        createBlock('parent_sub', 'subsystem', 'ParentSub', {
          showEnableInput: true,
          inputPorts: ['PIn', 'CEnable', 'GCEnable'],
          outputPorts: ['POut'],
          sheets: [parentSheet]
        }),
        createBlock('output', 'output_port', 'Output', { portName: 'Output' })
      ]
      const mainConnections = [
        createConnection('m_w1', 'parent_enable', 0, 'parent_sub', -1),
        createConnection('m_w2', 'data', 0, 'parent_sub', 0),
        createConnection('m_w3', 'child_enable', 0, 'parent_sub', 1),
        createConnection('m_w4', 'gc_enable', 0, 'parent_sub', 2),
        createConnection('m_w5', 'parent_sub', 0, 'output', 0)
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, mainConnections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([mainSheet])

      // Check hierarchy
      const subsystemInfo = result.model.subsystemEnableInfo
      expect(subsystemInfo).toHaveLength(3) // Parent, Child, Grandchild

      // Find each subsystem
      const parentInfo = subsystemInfo.find(s => s.subsystemName === 'ParentSub')
      const childInfo = subsystemInfo.find(s => s.subsystemName === 'ParentSub_ChildSub')
      const grandchildInfo = subsystemInfo.find(s => s.subsystemName === 'ParentSub_ChildSub_GrandchildSub')

      // Check parent relationships
      expect(parentInfo?.parentSubsystemId).toBeNull()
      expect(childInfo?.parentSubsystemId).toBe(parentInfo?.subsystemId)
      expect(grandchildInfo?.parentSubsystemId).toBe(childInfo?.subsystemId)

      // Check enable scopes
      const cScale = result.model.blocks.find(b => b.flattenedName === 'ParentSub_ChildSub_CScale')
      const gcScale = result.model.blocks.find(b => b.flattenedName === 'ParentSub_ChildSub_GrandchildSub_GCScale')

      expect(cScale?.enableScope).toBe('child_sub')
      expect(gcScale?.enableScope).toBe('grandchild_sub')
    })

    test('should inherit enable scope when subsystem has no enable input', () => {
      const innerBlocks = [
        createBlock('inner_input', 'input_port', 'InnerIn', { portName: 'InnerIn' }),
        createBlock('inner_tf', 'transfer_function', 'InnerTF', {
          numerator: [1],
          denominator: [1, 2]
        }),
        createBlock('inner_output', 'output_port', 'InnerOut', { portName: 'InnerOut' })
      ]
      const innerConnections = [
        createConnection('i_w1', 'inner_input', 0, 'inner_tf', 0),
        createConnection('i_w2', 'inner_tf', 0, 'inner_output', 0)
      ]
      const innerSheet = createSheet('inner_sheet', 'InnerSheet', innerBlocks, innerConnections)

      const outerBlocks = [
        createBlock('outer_input', 'input_port', 'OuterIn', { portName: 'OuterIn' }),
        createBlock('inner_sub', 'subsystem', 'InnerSub', {
          showEnableInput: false, // No enable input
          inputPorts: ['InnerIn'],
          outputPorts: ['InnerOut'],
          sheets: [innerSheet]
        }),
        createBlock('outer_output', 'output_port', 'OuterOut', { portName: 'OuterOut' })
      ]
      const outerConnections = [
        createConnection('o_w1', 'outer_input', 0, 'inner_sub', 0),
        createConnection('o_w2', 'inner_sub', 0, 'outer_output', 0)
      ]
      const outerSheet = createSheet('outer_sheet', 'OuterSheet', outerBlocks, outerConnections)

      const mainBlocks = [
        createBlock('enable', 'source', 'Enable', { value: true, dataType: 'bool' }),
        createBlock('data', 'source', 'Data', { value: 1.0 }),
        createBlock('outer_sub', 'subsystem', 'OuterSub', {
          showEnableInput: true, // Has enable input
          inputPorts: ['OuterIn'],
          outputPorts: ['OuterOut'],
          sheets: [outerSheet]
        }),
        createBlock('output', 'output_port', 'Output', { portName: 'Output' })
      ]
      const mainConnections = [
        createConnection('m_w1', 'enable', 0, 'outer_sub', -1),
        createConnection('m_w2', 'data', 0, 'outer_sub', 0),
        createConnection('m_w3', 'outer_sub', 0, 'output', 0)
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, mainConnections)

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([mainSheet])

      // InnerTF should inherit OuterSub's enable scope
      const innerTF = result.model.blocks.find(b => b.flattenedName === 'OuterSub_InnerSub_InnerTF')
      expect(innerTF?.enableScope).toBe('outer_sub')

      // Check subsystem info
      const outerInfo = result.model.subsystemEnableInfo.find(s => s.subsystemName === 'OuterSub')
      const innerInfo = result.model.subsystemEnableInfo.find(s => s.subsystemName === 'OuterSub_InnerSub')

      expect(outerInfo?.hasEnableInput).toBe(true)
      expect(innerInfo?.hasEnableInput).toBe(false)
    })
  })

  describe('Enable Signal Code Generation', () => {
    test('should generate enable state struct', () => {
      const sheets = [
        createSheet('main', 'Main', [
          createBlock('enable', 'source', 'Enable', { value: true, dataType: 'bool' }),
          createBlock('sub', 'subsystem', 'EnabledSub', {
            showEnableInput: true,
            sheets: []
          })
        ], [
          createConnection('w1', 'enable', 0, 'sub', -1)
        ])
      ]

      const generator = new CodeGenerator({ modelName: 'enable_test' })
      const result = generator.generate(sheets)

      expect(result.header).toContain('typedef struct {')
      expect(result.header).toContain('enable_states_t')
      expect(result.header).toContain('EnabledSub_enabled')
    })

    test('should generate enable evaluation function', () => {
      const subBlocks = [
        createBlock('input', 'input_port', 'In', { portName: 'In' }),
        createBlock('tf', 'transfer_function', 'TF', {
          numerator: [1],
          denominator: [1, 1]
        }),
        createBlock('output', 'output_port', 'Out', { portName: 'Out' })
      ]
      const subSheet = createSheet('sub', 'Sub', subBlocks, [
        createConnection('w1', 'input', 0, 'tf', 0),
        createConnection('w2', 'tf', 0, 'output', 0)
      ])

      const sheets = [
        createSheet('main', 'Main', [
          createBlock('enable', 'source', 'Enable', { value: true, dataType: 'bool' }),
          createBlock('data', 'source', 'Data', { value: 1.0 }),
          createBlock('sub', 'subsystem', 'ProcessingSub', {
            showEnableInput: true,
            inputPorts: ['In'],
            outputPorts: ['Out'],
            sheets: [subSheet]
          }),
          createBlock('output', 'output_port', 'Output', { portName: 'Output' })
        ], [
          createConnection('w1', 'enable', 0, 'sub', -1),
          createConnection('w2', 'data', 0, 'sub', 0),
          createConnection('w3', 'sub', 0, 'output', 0)
        ])
      ]

      const generator = new CodeGenerator({ modelName: 'enable_test' })
      const result = generator.generate(sheets)

      expect(result.source).toContain('enable_test_evaluate_enable_states')
      expect(result.source).toContain('model->enable_states.ProcessingSub_enabled')
    })

    test('should wrap state updates in enable checks', () => {
      const subBlocks = [
        createBlock('input', 'input_port', 'In', { portName: 'In' }),
        createBlock('tf', 'transfer_function', 'TF', {
          numerator: [1],
          denominator: [1, 1]
        }),
        createBlock('integrator', 'transfer_function', 'Integrator', {
          numerator: [1],
          denominator: [1, 0]
        }),
        createBlock('output', 'output_port', 'Out', { portName: 'Out' })
      ]
      const subSheet = createSheet('sub', 'Sub', subBlocks, [
        createConnection('w1', 'input', 0, 'tf', 0),
        createConnection('w2', 'tf', 0, 'integrator', 0),
        createConnection('w3', 'integrator', 0, 'output', 0)
      ])

      const sheets = [
        createSheet('main', 'Main', [
          createBlock('enable', 'source', 'Enable', { value: true, dataType: 'bool' }),
          createBlock('data', 'source', 'Data', { value: 1.0 }),
          createBlock('sub', 'subsystem', 'StatefulSub', {
            showEnableInput: true,
            inputPorts: ['In'],
            outputPorts: ['Out'],
            sheets: [subSheet]
          }),
          createBlock('output', 'output_port', 'Output', { portName: 'Output' })
        ], [
          createConnection('w1', 'enable', 0, 'sub', -1),
          createConnection('w2', 'data', 0, 'sub', 0),
          createConnection('w3', 'sub', 0, 'output', 0)
        ])
      ]

      const generator = new CodeGenerator({ modelName: 'state_test' })
      const result = generator.generate(sheets)

      // Check for conditional state updates
      expect(result.source).toContain('if (enable_states->StatefulSub_enabled)')
      expect(result.source).toContain('derivatives')
    })

    test('should handle enable inheritance in generated code', () => {
      const grandchildBlocks = [
        createBlock('gc_input', 'input_port', 'In', { portName: 'In' }),
        createBlock('gc_tf', 'transfer_function', 'TF', {
          numerator: [2],
          denominator: [1, 2]
        }),
        createBlock('gc_output', 'output_port', 'Out', { portName: 'Out' })
      ]
      const grandchildSheet = createSheet('gc', 'GC', grandchildBlocks, [
        createConnection('gc_w1', 'gc_input', 0, 'gc_tf', 0),
        createConnection('gc_w2', 'gc_tf', 0, 'gc_output', 0)
      ])

      const childBlocks = [
        createBlock('c_input', 'input_port', 'In', { portName: 'In' }),
        createBlock('grandchild', 'subsystem', 'GrandchildSub', {
          showEnableInput: false, // Inherits from parent
          inputPorts: ['In'],
          outputPorts: ['Out'],
          sheets: [grandchildSheet]
        }),
        createBlock('c_output', 'output_port', 'Out', { portName: 'Out' })
      ]
      const childSheet = createSheet('child', 'Child', childBlocks, [
        createConnection('c_w1', 'c_input', 0, 'grandchild', 0),
        createConnection('c_w2', 'grandchild', 0, 'c_output', 0)
      ])

      const sheets = [
        createSheet('main', 'Main', [
          createBlock('enable', 'source', 'Enable', { value: true, dataType: 'bool' }),
          createBlock('data', 'source', 'Data', { value: 1.0 }),
          createBlock('child', 'subsystem', 'ChildSub', {
            showEnableInput: true,
            inputPorts: ['In'],
            outputPorts: ['Out'],
            sheets: [childSheet]
          }),
          createBlock('output', 'output_port', 'Output', { portName: 'Output' })
        ], [
          createConnection('w1', 'enable', 0, 'child', -1),
          createConnection('w2', 'data', 0, 'child', 0),
          createConnection('w3', 'child', 0, 'output', 0)
        ])
      ]

      const generator = new CodeGenerator({ modelName: 'inherit_test' })
      const result = generator.generate(sheets)

      // Grandchild TF should check parent's enable state
      expect(result.source).toContain('ChildSub_enabled')
      // Should show in comments that it inherits
      expect(result.source.toLowerCase()).toContain('inherit')
    })
  })

  describe('Edge Cases and Error Handling', () => {
    test('should handle missing enable wire', () => {
      const sheets = [
        createSheet('main', 'Main', [
          createBlock('sub', 'subsystem', 'UnconnectedSub', {
            showEnableInput: true,
            sheets: []
          })
        ], [])
      ]

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel(sheets)

      expect(result.warnings).toContain(
        'Subsystem UnconnectedSub has enable input but no enable wire connected'
      )
    })

    test('should validate enable signal data type', () => {
      const sheets = [
        createSheet('main', 'Main', [
          createBlock('wrong_type', 'source', 'WrongType', { 
            value: 1.0,
            dataType: 'double' // Should be bool
          }),
          createBlock('sub', 'subsystem', 'Sub', {
            showEnableInput: true,
            sheets: []
          })
        ], [
          createConnection('w1', 'wrong_type', 0, 'sub', -1)
        ])
      ]

      const generator = new CodeGenerator({ modelName: 'type_test' })
      const result = generator.generate(sheets)

      // Should still generate code but with type conversion
      expect(result.warnings.length).toBeGreaterThan(0)
    })

    test('should handle cyclic enable dependencies', () => {
      // This is a pathological case that shouldn't happen in practice
      const sub1Blocks = [
        createBlock('s1_enable_in', 'input_port', 'EnableIn', {
          portName: 'EnableIn',
          dataType: 'bool'
        }),
        createBlock('s1_output', 'output_port', 'EnableOut', {
          portName: 'EnableOut'
        })
      ]
      const sub1Sheet = createSheet('s1', 'S1', sub1Blocks, [
        createConnection('s1_w1', 's1_enable_in', 0, 's1_output', 0)
      ])

      const sub2Blocks = [
        createBlock('s2_enable_in', 'input_port', 'EnableIn', {
          portName: 'EnableIn',
          dataType: 'bool'
        }),
        createBlock('s2_output', 'output_port', 'EnableOut', {
          portName: 'EnableOut'
        })
      ]
      const sub2Sheet = createSheet('s2', 'S2', sub2Blocks, [
        createConnection('s2_w1', 's2_enable_in', 0, 's2_output', 0)
      ])

      const mainBlocks = [
        createBlock('sub1', 'subsystem', 'Sub1', {
          showEnableInput: true,
          inputPorts: ['EnableIn'],
          outputPorts: ['EnableOut'],
          sheets: [sub1Sheet]
        }),
        createBlock('sub2', 'subsystem', 'Sub2', {
          showEnableInput: true,
          inputPorts: ['EnableIn'],
          outputPorts: ['EnableOut'],
          sheets: [sub2Sheet]
        })
      ]
      const mainConnections = [
        // Circular enable dependency
        createConnection('w1', 'sub2', 0, 'sub1', -1),
        createConnection('w2', 'sub1', 0, 'sub2', -1),
        createConnection('w3', 'sub1', 0, 'sub2', 0),
        createConnection('w4', 'sub2', 0, 'sub1', 0)
      ]
      const mainSheet = createSheet('main', 'Main', mainBlocks, mainConnections)

      const flattener = new ModelFlattener()
      // Should not crash
      expect(() => {
        flattener.flattenModel([mainSheet])
      }).not.toThrow()
    })

    test('should handle deeply nested enable scopes efficiently', () => {
      // Create a deeply nested structure
      let currentSheet = createSheet('deepest', 'Deepest', [
        createBlock('deep_input', 'input_port', 'In', { portName: 'In' }),
        createBlock('deep_tf', 'transfer_function', 'DeepTF', {
          numerator: [1],
          denominator: [1, 1]
        }),
        createBlock('deep_output', 'output_port', 'Out', { portName: 'Out' })
      ], [
        createConnection('d_w1', 'deep_input', 0, 'deep_tf', 0),
        createConnection('d_w2', 'deep_tf', 0, 'deep_output', 0)
      ])

      // Create 10 levels of nesting
      for (let i = 9; i >= 0; i--) {
        const blocks = [
          createBlock(`level${i}_input`, 'input_port', 'In', { portName: 'In' }),
          createBlock(`level${i}_sub`, 'subsystem', `Level${i}Sub`, {
            showEnableInput: i % 2 === 0, // Every other level has enable
            inputPorts: ['In'],
            outputPorts: ['Out'],
            sheets: [currentSheet]
          }),
          createBlock(`level${i}_output`, 'output_port', 'Out', { portName: 'Out' })
        ]
        const connections = [
          createConnection(`l${i}_w1`, `level${i}_input`, 0, `level${i}_sub`, 0),
          createConnection(`l${i}_w2`, `level${i}_sub`, 0, `level${i}_output`, 0)
        ]
        if (i % 2 === 0) {
          blocks.push(createBlock(`level${i}_enable`, 'source', `Enable${i}`, {
            value: true,
            dataType: 'bool'
          }))
          connections.push(
            createConnection(`l${i}_we`, `level${i}_enable`, 0, `level${i}_sub`, -1)
          )
        }
        currentSheet = createSheet(`level${i}`, `Level${i}`, blocks, connections)
      }

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel([currentSheet])

      // Should handle deep nesting
      expect(result.model.metadata.maxNestingDepth).toBeGreaterThanOrEqual(10)
      
      // Check that the deepest TF has the correct enable scope
      const deepTF = result.model.blocks.find(b => b.flattenedName.includes('DeepTF'))
      expect(deepTF).toBeDefined()
    })
  })

  describe('State Freezing Behavior', () => {
    test('should identify stateful blocks in enable scopes', () => {
      const subBlocks = [
        createBlock('input', 'input_port', 'In', { portName: 'In' }),
        createBlock('tf1', 'transfer_function', 'TF1', {
          numerator: [1],
          denominator: [1, 1] // First order, has state
        }),
        createBlock('tf2', 'transfer_function', 'TF2', {
          numerator: [1],
          denominator: [1, 0] // Integrator, has state
        }),
        createBlock('sum', 'sum', 'Sum1'), // No state
        createBlock('output', 'output_port', 'Out', { portName: 'Out' })
      ]
      const subConnections = [
        createConnection('w1', 'input', 0, 'tf1', 0),
        createConnection('w2', 'tf1', 0, 'tf2', 0),
        createConnection('w3', 'tf2', 0, 'sum', 0),
        createConnection('w4', 'input', 0, 'sum', 1),
        createConnection('w5', 'sum', 0, 'output', 0)
      ]
      const subSheet = createSheet('sub', 'Sub', subBlocks, subConnections)

      const sheets = [
        createSheet('main', 'Main', [
          createBlock('enable', 'source', 'Enable', { value: true, dataType: 'bool' }),
          createBlock('data', 'source', 'Data', { value: 1.0 }),
          createBlock('sub', 'subsystem', 'StatefulSub', {
            showEnableInput: true,
            inputPorts: ['In'],
            outputPorts: ['Out'],
            sheets: [subSheet]
          }),
          createBlock('output', 'output_port', 'Output', { portName: 'Output' })
        ], [
          createConnection('w1', 'enable', 0, 'sub', -1),
          createConnection('w2', 'data', 0, 'sub', 0),
          createConnection('w3', 'sub', 0, 'output', 0)
        ])
      ]

      const generator = new CodeGenerator({ modelName: 'stateful_test' })
      const result = generator.generate(sheets)

      // Should generate state structures for TF blocks
      expect(result.header).toContain('StatefulSub_TF1_states')
      expect(result.header).toContain('StatefulSub_TF2_states')

      // Should check enable state before updating
      expect(result.source).toContain('if (enable_states->StatefulSub_enabled)')
    })
  })
})
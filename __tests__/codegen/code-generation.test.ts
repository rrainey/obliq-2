// __tests__/codegen/code-generation.test.ts

import { ModelFlattener } from '@/lib/codegen/ModelFlattener'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { CCodeBuilder } from '@/lib/codegen/CCodeBuilder'
import { EnableTestModels } from './enable-test-models'
import { BlockCodeGeneratorFactory } from '@/lib/blocks/BlockCodeGeneratorFactory'

describe('Code Generation System', () => {
  describe('CCodeBuilder', () => {
    test('sanitizes identifiers correctly', () => {
      expect(CCodeBuilder.sanitizeIdentifier('valid_name')).toBe('valid_name')
      expect(CCodeBuilder.sanitizeIdentifier('123invalid')).toBe('_123invalid')
      expect(CCodeBuilder.sanitizeIdentifier('name-with-dashes')).toBe('name_with_dashes')
      expect(CCodeBuilder.sanitizeIdentifier('int')).toBe('int_') // C keyword
      expect(CCodeBuilder.sanitizeIdentifier('')).toBe('signal')
    })

    test('generates array declarations', () => {
      const decl = CCodeBuilder.generateArrayDeclaration('double', 'myArray', [3, 4])
      expect(decl).toBe('double myArray[3][4]')
    })

    test('generates struct members', () => {
      const member = CCodeBuilder.generateStructMember('float', 'position', [3], 'Position vector')
      expect(member).toBe('    float position[3]; /* Position vector */')
    })

    test('generates boolean expressions', () => {
      expect(CCodeBuilder.generateBooleanExpression('x > 5')).toBe('((x > 5) ? 1 : 0)')
      expect(CCodeBuilder.generateBooleanExpression('', true)).toBe('1')
      expect(CCodeBuilder.generateBooleanExpression('', false)).toBe('0')
    })
  })

  describe('Model Flattener', () => {
    test('flattens simple single-sheet model', () => {
      const sheets = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'sum1',
            name: 'Sum1',
            type: 'sum',
            position: { x: 100, y: 100 },
            parameters: {}
          }
        ],
        connections: [],
        extents: { width: 800, height: 600 }
      }]

      const flattener = new ModelFlattener()
      const result = flattener.flattenModel(sheets)

      expect(result.model.blocks).toHaveLength(1)
      expect(result.model.blocks[0].flattenedName).toBe('Sum1')
      expect(result.warnings).toHaveLength(1) // Warning about no connections
    })

    test('flattens model with subsystems', () => {
      const model = EnableTestModels.createSimpleEnableModel()
      const flattener = new ModelFlattener()
      const result = flattener.flattenModel(model)

      // Should have flattened the subsystem
      expect(result.model.metadata.subsystemCount).toBe(1)
      expect(result.model.subsystemEnableInfo).toHaveLength(1)
      expect(result.model.subsystemEnableInfo[0].hasEnableInput).toBe(true)
    })

    test('handles nested subsystems with enable inheritance', () => {
      const model = EnableTestModels.createNestedEnableModel()
      const flattener = new ModelFlattener()
      const result = flattener.flattenModel(model)

      // Should have two subsystems with enable
      const enabledSubsystems = result.model.subsystemEnableInfo.filter(s => s.hasEnableInput)
      expect(enabledSubsystems).toHaveLength(2)

      // Check parent-child relationship
      const parent = enabledSubsystems.find(s => s.subsystemName === 'ParentSubsystem')
      const child = enabledSubsystems.find(s => s.subsystemName === 'ParentSubsystem_ChildSubsystem')
      
      expect(parent).toBeDefined()
      expect(child).toBeDefined()
      expect(child!.parentSubsystemId).toBe(parent!.subsystemId)
    })

    test('removes subsystem ports correctly', () => {
      const model = EnableTestModels.createSimpleEnableModel()
      const flattener = new ModelFlattener()
      const result = flattener.flattenModel(model)

      // Should not have any input_port or output_port blocks in final result
      const portBlocks = result.model.blocks.filter(b => 
        b.block.type === 'input_port' || b.block.type === 'output_port'
      )
      expect(portBlocks).toHaveLength(3) // Main sheet has 2 inputs + 1 output
    })

    test('preserves enable wire connections', () => {
      const model = EnableTestModels.createSimpleEnableModel()
      const flattener = new ModelFlattener()
      const result = flattener.flattenModel(model)

      // Find enable wire
      const enableWire = result.model.connections.find(c => c.targetPortIndex === -1)
      expect(enableWire).toBeDefined()
      expect(enableWire!.connectionType).toBe('direct')
    })
  })

  describe('Block Code Generators', () => {
    test('factory returns correct generators', () => {
      const sumGen = BlockCodeGeneratorFactory.getBlockCodeGenerator('sum')
      expect(sumGen).toBeDefined()

      const tfGen = BlockCodeGeneratorFactory.getBlockCodeGenerator('transfer_function')
      expect(tfGen).toBeDefined()
      expect(tfGen.requiresState({ type: 'transfer_function', parameters: { denominator: [1, 1] } } as any)).toBe(true)
    })

    test('handles unsupported block types', () => {
      expect(() => {
        BlockCodeGeneratorFactory.getBlockCodeGenerator('unsupported_type')
      }).toThrow('Unsupported block type')
    })

    test('sum block generates correct code', () => {
      const sumGen = BlockCodeGeneratorFactory.getBlockCodeGenerator('sum')
      const block = {
        name: 'Sum1',
        type: 'sum',
        parameters: { inputs: '++' }
      } as any

      const code = sumGen.generateComputation(block, ['input1', 'input2'])
      expect(code).toContain('model->signals.Sum1 = input1 + input2')
    })

    test('transfer function with states', () => {
      const tfGen = BlockCodeGeneratorFactory.getBlockCodeGenerator('transfer_function')
      const block = {
        name: 'TF1',
        type: 'transfer_function',
        parameters: {
          numerator: [1],
          denominator: [1, 1]
        }
      } as any

      expect(tfGen.requiresState(block)).toBe(true)
      
      const stateMembers = tfGen.generateStateStructMembers(block, 'double')
      expect(stateMembers).toHaveLength(1)
      expect(stateMembers[0]).toContain('TF1_states[1]')
    })
  })

  describe('Complete Code Generation', () => {
    test('generates code for simple model', () => {
      const sheets = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
              "id": "source1",
              "name": "Source1",
              "type": "source",
              "position": {
                  "x": 76.5,
                  "y": 138.75
              },
              "parameters": {
                  "f0": 0.1,
                  "f1": 10,
                  "mean": 0,
                  "phase": 0,
                  "slope": 1,
                  "value": 1,
                  "offset": 0,
                  "duration": 10,
                  "stepTime": 1,
                  "amplitude": 1,
                  "frequency": 1,
                  "startTime": 0,
                  "stepValue": 1,
                  "signalType": "constant"
              }
          },
          {
            id: 'gain1',
            name: 'Gain1',
            type: 'scale',
            position: { x: 300, y: 100 },
            parameters: { gain: 2.0 }
          },
          {
            id: 'output1',
            name: 'Output1',
            type: 'output_port',
            position: { x: 500, y: 100 },
            parameters: { portName: 'Output1' }
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source1',
            sourcePortIndex: 0,
            targetBlockId: 'gain1',
            targetPortIndex: 0
          },
          {
            id: 'wire2',
            sourceBlockId: 'gain1',
            sourcePortIndex: 0,
            targetBlockId: 'output1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 800, height: 600 }
      }]

      const generator = new CodeGenerator({ modelName: 'test_model' })
      const result = generator.generate(sheets)

      // Debug: log what we got
      console.log('Generated source preview:', result.source.substring(0, 500))
      
      // Check header
      expect(result.header).toContain('typedef struct')
      expect(result.header).toContain('test_model_inputs_t')
      expect(result.header).toContain('test_model_outputs_t')
      expect(result.header).toContain('void test_model_init')
      expect(result.header).toContain('void test_model_step')

      // Check source
      expect(result.source).toContain('#include "test_model.h"')
      expect(result.source).toContain('void test_model_init')
      expect(result.source).toContain('void test_model_step')
      
      // Check for source copy
      expect(result.source).toContain('Source block: Source1 (constant)')
      expect(result.source).toContain('model->signals.Source1 = 1;')
      
      // Then check the scale computation
      expect(result.source).toContain('model->signals.Gain1 = model->signals.Source1 * 2')
    })

    test('generates enable evaluation code', () => {
      const model = EnableTestModels.createSimpleEnableModel()
      const generator = new CodeGenerator({ modelName: 'enable_test' })
      const result = generator.generate(model)

      // Check for enable structures
      expect(result.header).toContain('enable_states_t')
      expect(result.header).toContain('ProcessingSubsystem_enabled')

      // Check for enable evaluation function
      expect(result.source).toContain('enable_test_evaluate_enable_states')
      expect(result.source).toContain('model->enable_states.ProcessingSubsystem_enabled')
    })

    test('generates RK4 integration for stateful blocks', () => {
      const model = EnableTestModels.createStateFreezeTestModel()
      const generator = new CodeGenerator({ modelName: 'state_test' })
      const result = generator.generate(model)

      // Check for derivatives function
      expect(result.header).toContain('state_test_derivatives')
      expect(result.source).toContain('void state_test_derivatives')
      
      // Check for RK4 integration
      expect(result.source).toContain('perform_rk4_integration')
      expect(result.source).toContain('/* Calculate k1 = f(t, y) */')
      expect(result.source).toContain('/* Calculate k2 = f(t + h/2, y + h/2 * k1) */')
    })

    test('handles nested subsystems correctly', () => {
      const model = EnableTestModels.createNestedEnableModel()
      const generator = new CodeGenerator({ 
        modelName: 'nested_test',
        includeDebugComments: true 
      })
      const result = generator.generate(model)

      // Check flattened names
      expect(result.source).toContain('ParentSubsystem_ChildSubsystem_ChildTransferFunction')
      
      // Check enable hierarchy
      expect(result.source).toContain('ParentSubsystem_enabled')
      expect(result.source).toContain('ParentSubsystem_ChildSubsystem_enabled')
      
      // Should show inheritance in enable evaluation
      expect(result.source).toContain('inherits from parent')
    })
  })

  describe('Enable Functionality', () => {
    test('enable evaluation respects hierarchy', () => {
      const model = EnableTestModels.createNestedEnableModel()
      const generator = new CodeGenerator({ modelName: 'hierarchy_test' })
      const result = generator.generate(model)

      // Check that child checks parent state first
      const enableEvalFunc = result.source.match(/void hierarchy_test_evaluate_enable_states[\s\S]*?\n\}/)?.[0]
      expect(enableEvalFunc).toBeDefined()
      expect(enableEvalFunc).toContain('if (!model->enable_states.ParentSubsystem_enabled)')
    })

    test('state updates wrapped in enable checks', () => {
      const model = EnableTestModels.createStateFreezeTestModel()
      const generator = new CodeGenerator({ modelName: 'freeze_test' })
      const result = generator.generate(model)

      // Check derivatives function has enable checks
      const derivFunc = result.source.match(/void freeze_test_derivatives[\s\S]*?\n\}/)?.[0]
      expect(derivFunc).toBeDefined()
      expect(derivFunc).toContain('if (enable_states->ProcessingSystem_enabled)')
    })
  })

  describe('Error Handling', () => {
    test('handles missing connections gracefully', () => {
      const sheets = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'orphan1',
            name: 'OrphanBlock',
            type: 'sum',
            position: { x: 100, y: 100 },
            parameters: {}
          }
        ],
        connections: [],
        extents: { width: 800, height: 600 }
      }]

      const generator = new CodeGenerator({ modelName: 'orphan_test' })
      const result = generator.generate(sheets)

      expect(result.warnings).toContain('Block OrphanBlock (sum) has no connections')
    })

    test('reports unconnected enable inputs', () => {
      const sheets = [{
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'sub1',
            name: 'UnconnectedSubsystem',
            type: 'subsystem',
            position: { x: 100, y: 100 },
            parameters: {
              showEnableInput: true,
              inputPorts: [],
              outputPorts: [],
              sheets: []
            }
          }
        ],
        connections: [],
        extents: { width: 800, height: 600 }
      }]

      const generator = new CodeGenerator({ modelName: 'unconnected_test' })
      const result = generator.generate(sheets)

      expect(result.warnings.some(w => 
        w.includes('has enable input but no enable wire connected')
      )).toBe(true)
    })
  })
})
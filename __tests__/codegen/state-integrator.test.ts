// __tests__/codegen/StateIntegrator.test.ts

import { StateIntegrator } from '@/lib/codegen/StateIntegrator'
import { FlattenedModel } from '@/lib/codegen/ModelFlattener'

describe('StateIntegrator', () => {
  const mockModel: FlattenedModel = {
    blocks: [],
    blockMap: new Map(),
    connections: [],
    subsystemEnableInfo: [],
    enableScopes: new Map(),
    metadata: {
      modelName: 'test_model',
      totalBlocks: 0,
      totalConnections: 0,
      subsystemCount: 0,
      maxNestingDepth: 1
    }
  }
  
  test('can instantiate class', () => {
    const integrator = new StateIntegrator(mockModel)
    expect(integrator).toBeDefined()
  })
  
  test('generateEulerIntegration returns comment when no stateful blocks', () => {
    const integrator = new StateIntegrator(mockModel)
    const result = integrator.generateEulerIntegration()
    
    expect(result).toContain('No state integration needed')
  })
  
  test('hasStatefulBlocks returns false for empty model', () => {
    const integrator = new StateIntegrator(mockModel)
    expect(integrator.hasStatefulBlocks()).toBe(false)
  })
  
  test('accepts options in constructor', () => {
    const integrator = new StateIntegrator(mockModel, {
      includeComments: false,
      checkEnableStates: false
    })
    expect(integrator).toBeDefined()
  })
  
  test('generateEulerIntegration generates state update loops for stateful blocks', () => {
    // Create a model with a transfer function block
    const modelWithStates: FlattenedModel = {
      ...mockModel,
      blocks: [{
        block: {
          id: 'tf1',
          type: 'transfer_function',
          name: 'TransferFunction1',
          position: { x: 0, y: 0 },
          parameters: {
            numerator: [1],
            denominator: [1, 1]
          }
        },
        flattenedName: 'TransferFunction1',
        subsystemPath: [],
        enableScope: null,
        originalSheetId: 'sheet1',
        originalId: 'tf1'
      }]
    }
    
    const integrator = new StateIntegrator(modelWithStates)
    const result = integrator.generateEulerIntegration()
    
    // Check that derivatives are calculated
    expect(result).toContain('Calculate derivatives')
    expect(result).toContain('test_model_derivatives')
    
    // Check that states are updated
    expect(result).toContain('Update states using Euler method')
    expect(result).toContain('model->states.')
    expect(result).toContain('model->dt * derivatives.')
    
    // Check for the state update loop
    expect(result).toContain('for (int i = 0; i <')
    expect(result).toContain('TransferFunction1_states')
  })
  
  test('generateEulerIntegration handles enable states correctly', () => {
    // Create a model with enable subsystems
    const modelWithEnableStates: FlattenedModel = {
      ...mockModel,
      blocks: [{
        block: {
          id: 'tf1',
          type: 'transfer_function',
          name: 'TransferFunction1',
          position: { x: 0, y: 0 },
          parameters: {
            numerator: [1],
            denominator: [1, 1]
          }
        },
        flattenedName: 'TransferFunction1',
        subsystemPath: [],
        enableScope: 'subsystem1',
        originalSheetId: 'sheet1',
        originalId: 'tf1'
      }],
      enableScopes: new Map([['tf1', 'subsystem1']]),
      subsystemEnableInfo: [{
        subsystemId: 'subsystem1',
        subsystemName: 'Subsystem1',
        hasEnableInput: true,
        parentSubsystemId: null,
        controlledBlockIds: ['tf1']
      }]
    }
    
    const integrator = new StateIntegrator(modelWithEnableStates)
    const result = integrator.generateEulerIntegration()
    
    // Check that enable states parameter is included
    expect(result).toContain('&model->enable_states')
    
    // Check for enable state check
    expect(result).toContain('if (model->enable_states.Subsystem1_enabled)')
  })
  
  test('generateRK4Integration method exists and returns placeholder', () => {
    const integrator = new StateIntegrator(mockModel)
    const result = integrator.generateRK4Integration()
    
    expect(result).toBeDefined()
    expect(result).toContain('No state integration needed')
  })
  
  test('generateRK4Integration generates proper RK4 code for stateful blocks', () => {
    // Create a model with a transfer function block
    const modelWithStates: FlattenedModel = {
      ...mockModel,
      blocks: [{
        block: {
          id: 'tf1',
          type: 'transfer_function',
          name: 'TransferFunction1',
          position: { x: 0, y: 0 },
          parameters: {
            numerator: [1],
            denominator: [1, 1]
          }
        },
        flattenedName: 'TransferFunction1',
        subsystemPath: [],
        enableScope: null,
        originalSheetId: 'sheet1',
        originalId: 'tf1'
      }]
    }
    
    const integrator = new StateIntegrator(modelWithStates)
    const result = integrator.generateRK4Integration()
    
    // Check for RK4 structure
    expect(result).toContain('RK4 Integration')
    expect(result).toContain('k1, k2, k3, k4')
    expect(result).toContain('temp_states')
    
    // Check for k1-k4 calculations
    expect(result).toContain('Calculate k1 = f(t, y)')
    expect(result).toContain('Calculate k2 = f(t + h/2, y + h/2 * k1)')
    expect(result).toContain('Calculate k3 = f(t + h/2, y + h/2 * k2)')
    expect(result).toContain('Calculate k4 = f(t + h, y + h * k3)')
    
    // Check for derivatives calls
    expect(result).toContain('test_model_derivatives')
    
    // Check for final update formula
    expect(result).toContain('h/6')
    expect(result).toContain('2.0 * k2')
    expect(result).toContain('2.0 * k3')
  })
})
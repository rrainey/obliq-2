// __tests__/codegen/IntegrationOrchestrator.test.ts

import { IntegrationOrchestrator } from '@/lib/codegen/IntegrationOrchestrator'
import { FlattenedModel } from '@/lib/codegen/ModelFlattener'

describe('IntegrationOrchestrator', () => {
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
    const orchestrator = new IntegrationOrchestrator(mockModel)
    expect(orchestrator).toBeDefined()
  })
  
  test('can generate empty function with correct signature', () => {
    const orchestrator = new IntegrationOrchestrator(mockModel)
    const result = orchestrator.generate()
    
    // Check function signature
    expect(result).toContain('void test_model_step(test_model_t* model)')
    
    // Check it has a body
    expect(result).toContain('{')
    expect(result).toContain('}')
    
    // Check TODO comment is present
    expect(result).toContain('TODO: Implement step function')
  })
  
  test('getFunctionName returns correct name', () => {
    const orchestrator = new IntegrationOrchestrator(mockModel)
    expect(orchestrator.getFunctionName()).toBe('test_model_step')
  })
  
  test('accepts options in constructor', () => {
    const orchestrator = new IntegrationOrchestrator(mockModel, {
      includeComments: false,
      integrationMethod: 'euler',
      includeTiming: true
    })
    expect(orchestrator).toBeDefined()
  })
  
  test('includes integration method in comments when enabled', () => {
    const orchestrator = new IntegrationOrchestrator(mockModel, {
      includeComments: true,
      integrationMethod: 'rk4'
    })
    const result = orchestrator.generate()
    
    expect(result).toContain('Integration method: RK4')
  })
  
  test('excludes comments when disabled', () => {
    const orchestrator = new IntegrationOrchestrator(mockModel, {
      includeComments: false
    })
    const result = orchestrator.generate()
    
    expect(result).not.toContain('Main simulation step function')
    expect(result).not.toContain('Integration method:')
  })
  
  test('generated step function contains algebraic evaluation call', () => {
    const orchestrator = new IntegrationOrchestrator(mockModel)
    const result = orchestrator.generate()
    
    // Check for algebraic evaluation call
    expect(result).toContain('test_model_evaluate_algebraic(')
    
    // Check all parameters are passed
    expect(result).toContain('&model->inputs')
    expect(result).toContain('&model->states')
    expect(result).toContain('&model->signals')
    expect(result).toContain('&model->outputs')
    expect(result).toContain('&model->enable_states')
    
    // Check comment
    expect(result).toContain('Evaluate algebraic relationships')
  })
  
  test('time update appears after algebraic evaluation', () => {
    const orchestrator = new IntegrationOrchestrator(mockModel)
    const result = orchestrator.generate()
    
    // Check time update is present
    expect(result).toContain('model->time += model->dt;')
    expect(result).toContain('Update simulation time')
    
    // Verify order: algebraic eval should come before time update
    const algebraicIndex = result.indexOf('test_model_evaluate_algebraic')
    const timeUpdateIndex = result.indexOf('model->time += model->dt')
    
    expect(algebraicIndex).toBeGreaterThan(-1)
    expect(timeUpdateIndex).toBeGreaterThan(-1)
    expect(timeUpdateIndex).toBeGreaterThan(algebraicIndex)
  })
  
  test('state integration placeholder appears in correct location', () => {
    const orchestrator = new IntegrationOrchestrator(mockModel)
    const result = orchestrator.generate()
    
    // Check placeholder is present for RK4 (default)
    expect(result).toContain('TODO: RK4 State integration')
    
    // Verify order: algebraic -> state integration -> enable -> time update
    const algebraicIndex = result.indexOf('test_model_evaluate_algebraic')
    const stateIntegrationIndex = result.indexOf('TODO: RK4')
    const timeUpdateIndex = result.indexOf('model->time += model->dt')
    
    expect(algebraicIndex).toBeGreaterThan(-1)
    expect(stateIntegrationIndex).toBeGreaterThan(-1)
    expect(timeUpdateIndex).toBeGreaterThan(-1)
    
    // Check correct ordering
    expect(stateIntegrationIndex).toBeGreaterThan(algebraicIndex)
    expect(timeUpdateIndex).toBeGreaterThan(stateIntegrationIndex)
  })
  
  test('step function includes Euler integration when specified', () => {
    // Create a model with stateful blocks
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
    
    const orchestrator = new IntegrationOrchestrator(modelWithStates, {
      integrationMethod: 'euler'
    })
    const result = orchestrator.generate()
    
    // Check that Euler integration is included
    expect(result).toContain('Euler integration')
    expect(result).toContain('Calculate derivatives')
    expect(result).toContain('Update states using Euler method')
    
    // Should not have the RK4 placeholder
    expect(result).not.toContain('TODO: RK4')
  })
  
  test('integration method selection works correctly', () => {
    // Create a model with stateful blocks
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
    
    // Test RK4 (default)
    const rk4Orchestrator = new IntegrationOrchestrator(modelWithStates)
    const rk4Result = rk4Orchestrator.generate()
    expect(rk4Result).toContain('RK4 Integration')
    expect(rk4Result).not.toContain('Euler integration')
    
    // Test Euler
    const eulerOrchestrator = new IntegrationOrchestrator(modelWithStates, {
      integrationMethod: 'euler'
    })
    const eulerResult = eulerOrchestrator.generate()
    expect(eulerResult).toContain('Euler integration')
    expect(eulerResult).not.toContain('RK4 Integration')
  })
})
import { AlgebraicEvaluator } from '@/lib/codegen/AlgebraicEvaluator'
import { FlattenedModel } from '@/lib/codegen/ModelFlattener'

describe('AlgebraicEvaluator', () => {
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
      maxNestingDepth:  1
    }
  }
  
  const mockTypeMap = new Map<string, string>()
  
  test('can instantiate class', () => {
    const evaluator = new AlgebraicEvaluator(mockModel, mockTypeMap)
    expect(evaluator).toBeDefined()
  })
  
  test('can call generate() method', () => {
    const evaluator = new AlgebraicEvaluator(mockModel, mockTypeMap)
    const result = evaluator.generate()
    expect(result).toContain('test_model_evaluate_algebraic')
  })

  

  test('generated code contains evaluate_algebraic function name', () => {
    const evaluator = new AlgebraicEvaluator(mockModel, mockTypeMap)
    const result = evaluator.generate()
    
    // Check that the function name is correct
    expect(result).toContain('test_model_evaluate_algebraic')
    
    // Check that it does NOT contain the old step function name
    expect(result).not.toContain('test_model_step')
    
    // Check that the comment mentions algebraic evaluation
    expect(result).toContain('Evaluate algebraic relationships')
  })

  test('generated function has correct parameter signature', () => {
    const evaluator = new AlgebraicEvaluator(mockModel, mockTypeMap)
    const result = evaluator.generate()
    
    // Check for const inputs parameter
    expect(result).toContain('const test_model_inputs_t* inputs')
    
    // Check for const states parameter
    expect(result).toContain('const test_model_states_t* states')
    
    // Check for signals parameter (not const, as we write to it)
    expect(result).toContain('test_model_signals_t* signals')
    expect(result).not.toContain('const test_model_signals_t* signals')
    
    // Check for outputs parameter (not const, as we write to it)
    expect(result).toContain('test_model_outputs_t* outputs')
    expect(result).not.toContain('const test_model_outputs_t* outputs')
    
    // Check for const enable_states parameter
    expect(result).toContain('const enable_states_t* enable_states')
    
    // Check that it does NOT have the old model pointer parameter
    expect(result).not.toMatch(/test_model_t\s*\*\s*model/)
  })
  
  test('generated code has no model pointer references', () => {
    const evaluator = new AlgebraicEvaluator(mockModel, mockTypeMap)
    const result = evaluator.generate()
    
    // Check that there are NO references to model->
    expect(result).not.toContain('model->')
    
    // Specifically check for old patterns that should be replaced
    expect(result).not.toContain('model->inputs')
    expect(result).not.toContain('model->states')
    expect(result).not.toContain('model->signals')
    expect(result).not.toContain('model->outputs')
    expect(result).not.toContain('model->enable_states')
    expect(result).not.toContain('model->time')
    expect(result).not.toContain('model->dt')
  })
  
  test('algebraic function does not update time or states', () => {
    const evaluator = new AlgebraicEvaluator(mockModel, mockTypeMap)
    const result = evaluator.generate()
    
    // Check that time is not updated
    expect(result).not.toContain('model->time +=')
    expect(result).not.toContain('time +=')
    expect(result).not.toContain('time =')
    
    // Check that RK4 integration is not called
    expect(result).not.toContain('perform_rk4_integration')
    
    // Check that enable states are not evaluated
    expect(result).not.toContain('_evaluate_enable_states')
  })
})
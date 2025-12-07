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

    // The evaluate_algebraic function now takes a single model pointer
    // and accesses inputs/states/signals/outputs through it
    expect(result).toContain('test_model_t* model')
    expect(result).toContain('void test_model_evaluate_algebraic(test_model_t* model)')
  })
  
  test('generated code accepts model pointer parameter', () => {
    const evaluator = new AlgebraicEvaluator(mockModel, mockTypeMap)
    const result = evaluator.generate()

    // With an empty model, there won't be block computations,
    // but the function signature should still take the model pointer
    expect(result).toContain('test_model_t* model')
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
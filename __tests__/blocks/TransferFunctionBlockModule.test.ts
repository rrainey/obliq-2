// __tests__/blocks/TransferFunctionBlockModule.test.ts (partial)

import { TransferFunctionBlockModule } from '@/lib/blocks/TransferFunctionBlockModule'
import { BlockData } from '@/components/BlockNode'

describe('TransferFunctionBlockModule - generateStateDerivative', () => {
  const module = new TransferFunctionBlockModule()
  
  test('generateStateDerivative method exists', () => {
    expect(module.generateStateDerivative).toBeDefined()
    expect(typeof module.generateStateDerivative).toBe('function')
  })
  
  test('returns comment for algebraic block (no states)', () => {
    const block: BlockData = {
      id: 'tf1',
      type: 'transfer_function',
      name: 'TF1',
      position: { x: 0, y: 0 },
      parameters: {
        numerator: [1],
        denominator: [1] // First order with no states
      }
    }
    
    const result = module.generateStateDerivative(
      block,
      'input_signal',
      'current_states',
      'double'
    )
    
    expect(result).toContain('/* No derivatives')
  })
  
  test('generates scalar state derivatives for first-order system', () => {
    const block: BlockData = {
      id: 'tf1',
      type: 'transfer_function',
      name: 'TF1',
      position: { x: 0, y: 0 },
      parameters: {
        numerator: [1],
        denominator: [1, 2] // s + 2
      }
    }
    
    const result = module.generateStateDerivative(
      block,
      'input_signal',
      'current_states',
      'double'
    )

    const result1 = result.replace(/[\(\)]/g, '')
    
    expect(result1).toContain('= 1 * input_signal - 2 * current_states->TF1_states[0]')
    expect(result1).toContain('state_derivatives->TF1_states[0]')
    expect(result1).toContain('1 * input_signal')
    expect(result1).toContain('- 2 * current_states->TF1_states[0]')
  })
  
  test('generates vector state derivatives', () => {
    const block: BlockData = {
      id: 'tf1',
      type: 'transfer_function',
      name: 'TF1',
      position: { x: 0, y: 0 },
      parameters: {
        numerator: [1],
        denominator: [1, 2]
      }
    }
    
    const result = module.generateStateDerivative(
      block,
      'input_signal',
      'current_states',
      'double[3]'
    )
    
    expect(result).toContain('= (1) * input_signal[i] - (2) * current_states->TF1_states[i][0]')
    expect(result).toContain('for (int i = 0; i < 3; i++)')
    expect(result).toContain('state_derivatives->TF1_states[i][0]')
    expect(result).toContain('input_signal[i]')
  })
  
  test('generates correct derivatives for second-order system', () => {
    const block: BlockData = {
      id: 'tf1',
      type: 'transfer_function',
      name: 'TF1',
      position: { x: 0, y: 0 },
      parameters: {
        numerator: [1, 0],
        denominator: [1, 3, 2] // s^2 + 3s + 2
      }
    }
    
    const result = module.generateStateDerivative(
      block,
      'u',
      'states',
      'double'
    )

    const result1 = result.replace(/[\(\)]/g, '')
    
    // First state derivative: x'[0] = x[1]
    expect(result1).toContain('state_derivatives->TF1_states[0] = states->TF1_states[1]')
    
    // Second state derivative: x'[1] = u - 2*x[0] - 3*x[1]
    expect(result1).toContain('state_derivatives->TF1_states[1] = 1 * u - 2 * states->TF1_states[0] - 3 * states->TF1_states[1]')
  })
})
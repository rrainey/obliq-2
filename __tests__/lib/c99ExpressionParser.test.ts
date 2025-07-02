// __tests__/lib/c99ExpressionParser.test.ts

import { C99ExpressionParser, BinaryExpression, Expression } from '@/lib/c99ExpressionParser'
import { C99ExpressionValidator } from '@/lib/c99ExpressionValidator'
import { C99ExpressionEvaluator } from '@/lib/c99ExpressionEvaluator'

describe('C99 Expression Parser', () => {
  test('parses simple arithmetic', () => {
    const parser = new C99ExpressionParser('in(0) + in(1) * 2')
    const ast = parser.parse()
    expect(ast.type).toBe('BinaryExpression')
    
    // Type guard to access BinaryExpression properties
    if (ast.type === 'BinaryExpression') {
      expect(ast.operator).toBe('+')
    }
  })

  test('respects operator precedence', () => {
    const parser = new C99ExpressionParser('in(0) + in(1) * in(2)')
    const ast = parser.parse()
    
    // Should parse as in(0) + (in(1) * in(2))
    expect(ast.type).toBe('BinaryExpression')
    
    if (ast.type === 'BinaryExpression') {
      expect(ast.operator).toBe('+')
      expect(ast.right.type).toBe('BinaryExpression')
      
      if (ast.right.type === 'BinaryExpression') {
        expect(ast.right.operator).toBe('*')
      }
    }
  })

  test('handles conditional expressions', () => {
    const parser = new C99ExpressionParser('in(0) > 0 ? in(0) : -in(0)')
    const ast = parser.parse()
    expect(ast.type).toBe('ConditionalExpression')
  })

  test('parses function calls', () => {
    const parser = new C99ExpressionParser('in(0)')
    const ast = parser.parse()
    expect(ast.type).toBe('FunctionCall')
    
    if (ast.type === 'FunctionCall') {
      expect(ast.name).toBe('in')
      expect(ast.arguments.length).toBe(1)
      
      const arg = ast.arguments[0]
      expect(arg.type).toBe('NumberLiteral')
      
      if (arg.type === 'NumberLiteral') {
        expect(arg.value).toBe(0)
      }
    }
  })

  test('parses unary expressions', () => {
    const parser = new C99ExpressionParser('-in(0)')
    const ast = parser.parse()
    expect(ast.type).toBe('UnaryExpression')
    
    if (ast.type === 'UnaryExpression') {
      expect(ast.operator).toBe('-')
      expect(ast.operand.type).toBe('FunctionCall')
    }
  })

  test('parses complex expressions', () => {
    const parser = new C99ExpressionParser('(in(0) + in(1)) / 2')
    const ast = parser.parse()
    expect(ast.type).toBe('BinaryExpression')
    
    if (ast.type === 'BinaryExpression') {
      expect(ast.operator).toBe('/')
      expect(ast.left.type).toBe('BinaryExpression')
      expect(ast.right.type).toBe('NumberLiteral')
    }
  })

  test('handles parentheses correctly', () => {
    const parser = new C99ExpressionParser('2 * (3 + 4)')
    const ast = parser.parse()
    expect(ast.type).toBe('BinaryExpression')
    
    if (ast.type === 'BinaryExpression') {
      expect(ast.operator).toBe('*')
      expect(ast.left.type).toBe('NumberLiteral')
      expect(ast.right.type).toBe('BinaryExpression')
      
      if (ast.right.type === 'BinaryExpression') {
        expect(ast.right.operator).toBe('+')
      }
    }
  })

  test('throws on invalid syntax', () => {
    const parser = new C99ExpressionParser('in(0) +')
    expect(() => parser.parse()).toThrow()
  })

  test('throws on unknown functions', () => {
    const parser = new C99ExpressionParser('unknown(0)')
    const ast = parser.parse()
    
    const validator = new C99ExpressionValidator(1)
    const result = validator.validate(ast)
    
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('Unknown function')
  })
})

describe('C99 Expression Validator', () => {
  test('validates in() function indices', () => {
    const validator = new C99ExpressionValidator(2)
    const parser = new C99ExpressionParser('in(0) + in(2)')
    const ast = parser.parse()
    const result = validator.validate(ast)
    
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('in(2) is out of range. Valid range is 0 to 1')
  })

  test('tracks used inputs', () => {
    const validator = new C99ExpressionValidator(3)
    const parser = new C99ExpressionParser('in(0) + in(2)')
    const ast = parser.parse()
    const result = validator.validate(ast)
    
    expect(result.valid).toBe(true)
    expect(Array.from(result.usedInputs)).toEqual([0, 2])
  })

  test('detects division by zero', () => {
    const validator = new C99ExpressionValidator(1)
    const parser = new C99ExpressionParser('in(0) / 0')
    const ast = parser.parse()
    const result = validator.validate(ast)
    
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('Division by zero')
  })

  test('warns about bitwise operations with floats', () => {
    const validator = new C99ExpressionValidator(1)
    const parser = new C99ExpressionParser('in(0) & 3.14')
    const ast = parser.parse()
    const result = validator.validate(ast)
    
    expect(result.valid).toBe(true)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  test('rejects increment/decrement operators', () => {
    const validator = new C99ExpressionValidator(1)
    const parser = new C99ExpressionParser('++in(0)')
    const ast = parser.parse()
    const result = validator.validate(ast)
    
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('not allowed')
  })

  test('validates nested expressions', () => {
    const validator = new C99ExpressionValidator(3)
    const parser = new C99ExpressionParser('in(0) > in(1) ? in(0) : (in(1) > in(2) ? in(1) : in(2))')
    const ast = parser.parse()
    const result = validator.validate(ast)
    
    expect(result.valid).toBe(true)
    expect(result.usedInputs.size).toBe(3)
  })
})

describe('C99 Expression Evaluator', () => {
  test('evaluates arithmetic expressions', () => {
    const evaluator = new C99ExpressionEvaluator([5, 3])
    const parser = new C99ExpressionParser('in(0) + in(1) * 2')
    const ast = parser.parse()
    const result = evaluator.evaluate(ast)
    
    expect(result).toBe(11) // 5 + 3 * 2
  })

  test('evaluates conditional expressions', () => {
    const evaluator = new C99ExpressionEvaluator([-5])
    const parser = new C99ExpressionParser('in(0) > 0 ? in(0) : -in(0)')
    const ast = parser.parse()
    const result = evaluator.evaluate(ast)
    
    expect(result).toBe(5) // abs(-5)
  })

  test('evaluates logical expressions', () => {
    const evaluator = new C99ExpressionEvaluator([5, 3])
    const parser = new C99ExpressionParser('in(0) > 4 && in(1) < 4')
    const ast = parser.parse()
    const result = evaluator.evaluate(ast)
    
    expect(result).toBe(1) // true
  })

  test('evaluates bitwise operations', () => {
    const evaluator = new C99ExpressionEvaluator([5, 3])
    const parser = new C99ExpressionParser('in(0) & in(1)')
    const ast = parser.parse()
    const result = evaluator.evaluate(ast)
    
    expect(result).toBe(1) // 5 & 3 = 1
  })

  test('evaluates shift operations', () => {
    const evaluator = new C99ExpressionEvaluator([8, 2])
    const parser = new C99ExpressionParser('in(0) >> in(1)')
    const ast = parser.parse()
    const result = evaluator.evaluate(ast)
    
    expect(result).toBe(2) // 8 >> 2 = 2
  })

  test('handles floating point comparisons', () => {
    const evaluator = new C99ExpressionEvaluator([0.1 + 0.2, 0.3])
    const parser = new C99ExpressionParser('in(0) == in(1)')
    const ast = parser.parse()
    const result = evaluator.evaluate(ast)
    
    // Due to epsilon comparison in evaluator
    expect(result).toBe(1) // true with epsilon comparison
  })

  test('evaluates complex nested expressions', () => {
    const evaluator = new C99ExpressionEvaluator([10, 5, 3])
    const parser = new C99ExpressionParser('(in(0) - in(1)) * (in(2) + 1)')
    const ast = parser.parse()
    const result = evaluator.evaluate(ast)
    
    expect(result).toBe(20) // (10 - 5) * (3 + 1) = 5 * 4 = 20
  })

  test('throws on division by zero during evaluation', () => {
    const evaluator = new C99ExpressionEvaluator([5, 0])
    const parser = new C99ExpressionParser('in(0) / in(1)')
    const ast = parser.parse()
    
    expect(() => evaluator.evaluate(ast)).toThrow('Division by zero')
  })

  test('evaluates unary operators', () => {
    const evaluator = new C99ExpressionEvaluator([5])
    
    // Test unary minus
    let parser = new C99ExpressionParser('-in(0)')
    let ast = parser.parse()
    expect(evaluator.evaluate(ast)).toBe(-5)
    
    // Test logical not
    parser = new C99ExpressionParser('!in(0)')
    ast = parser.parse()
    expect(evaluator.evaluate(ast)).toBe(0) // !5 = 0 (false)
    
    // Test bitwise not
    parser = new C99ExpressionParser('~in(0)')
    ast = parser.parse()
    expect(evaluator.evaluate(ast)).toBe(~5)
  })
})
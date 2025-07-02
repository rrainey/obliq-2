// __tests__/lib/c99ExpressionMath.test.ts

import { C99ExpressionParser } from '@/lib/c99ExpressionParser'
import { C99ExpressionValidator } from '@/lib/c99ExpressionValidator'
import { C99ExpressionEvaluator } from '@/lib/c99ExpressionEvaluator'
import { c99ExpressionToCode } from '@/lib/c99ExpressionCodeGen'

describe('Math Function Support', () => {
  describe('Parser', () => {
    test('parses math function calls', () => {
      const parser = new C99ExpressionParser('sqrt(in(0))')
      const ast = parser.parse()
      expect(ast.type).toBe('FunctionCall')
      if (ast.type === 'FunctionCall') {
        expect(ast.name).toBe('sqrt')
        expect(ast.arguments.length).toBe(1)
      }
    })

    test('parses nested math functions', () => {
      const parser = new C99ExpressionParser('pow(sin(in(0)), 2)')
      const ast = parser.parse()
      expect(ast.type).toBe('FunctionCall')
      if (ast.type === 'FunctionCall') {
        expect(ast.name).toBe('pow')
        expect(ast.arguments[0].type).toBe('FunctionCall')
      }
    })

    test('parses complex expressions with math', () => {
      const parser = new C99ExpressionParser('sqrt(pow(in(0), 2) + pow(in(1), 2))')
      const ast = parser.parse()
      expect(ast).toBeTruthy()
    })
  })

  describe('Validator', () => {
    test('validates math function argument counts', () => {
      const validator = new C99ExpressionValidator(1)
      
      // sqrt needs 1 argument
      let parser = new C99ExpressionParser('sqrt()')
      let result = validator.validate(parser.parse())
      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain('requires exactly 1 argument')
      
      // pow needs 2 arguments
      parser = new C99ExpressionParser('pow(in(0))')
      result = validator.validate(parser.parse())
      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain('requires exactly 2 argument')
    })

    test('sets math function flags', () => {
      const validator = new C99ExpressionValidator(1)
      const parser = new C99ExpressionParser('sin(in(0))')
      const result = validator.validate(parser.parse())
      
      expect(result.valid).toBe(true)
      expect(result.usesMathFunctions).toBe(true)
      expect(result.hasFloatOperations).toBe(true)
    })

    test('warns about invalid math inputs', () => {
      const validator = new C99ExpressionValidator(1)
      
      // sqrt of negative
      let parser = new C99ExpressionParser('sqrt(-1)')
      let result = validator.validate(parser.parse())
      expect(result.warnings.length).toBeGreaterThan(0)
      
      // log of zero
      parser = new C99ExpressionParser('log(0)')
      result = validator.validate(parser.parse())
      expect(result.warnings.length).toBeGreaterThan(0)
    })
  })

  describe('Evaluator', () => {
    test('evaluates single-argument math functions', () => {
      const evaluator = new C99ExpressionEvaluator([9])
      
      const tests = [
        { expr: 'sqrt(in(0))', expected: 3 },
        { expr: 'abs(-5)', expected: 5 },
        { expr: 'fabs(-5.5)', expected: 5.5 },
        { expr: 'ceil(4.3)', expected: 5 },
        { expr: 'floor(4.7)', expected: 4 },
        { expr: 'round(4.5)', expected: 5 },
        { expr: 'trunc(4.7)', expected: 4 },
      ]
      
      for (const test of tests) {
        const parser = new C99ExpressionParser(test.expr)
        const result = evaluator.evaluate(parser.parse())
        expect(result).toBeCloseTo(test.expected, 6)
      }
    })

    test('evaluates two-argument math functions', () => {
      const evaluator = new C99ExpressionEvaluator([3, 4])
      
      const tests = [
        { expr: 'pow(in(0), 2)', expected: 9 },
        { expr: 'fmax(in(0), in(1))', expected: 4 },
        { expr: 'fmin(in(0), in(1))', expected: 3 },
        { expr: 'atan2(in(0), in(1))', expected: Math.atan2(3, 4) },
      ]
      
      for (const test of tests) {
        const parser = new C99ExpressionParser(test.expr)
        const result = evaluator.evaluate(parser.parse())
        expect(result).toBeCloseTo(test.expected, 6)
      }
    })

    test('evaluates trigonometric functions', () => {
      const evaluator = new C99ExpressionEvaluator([Math.PI / 2])
      
      const parser = new C99ExpressionParser('sin(in(0))')
      const result = evaluator.evaluate(parser.parse())
      expect(result).toBeCloseTo(1, 6)
    })

    test('evaluates complex math expressions', () => {
      const evaluator = new C99ExpressionEvaluator([3, 4])
      
      // Pythagorean theorem
      const parser = new C99ExpressionParser('sqrt(pow(in(0), 2) + pow(in(1), 2))')
      const result = evaluator.evaluate(parser.parse())
      expect(result).toBeCloseTo(5, 6)
    })
  })

  describe('Code Generator', () => {
    test('generates math function calls', () => {
      const parser = new C99ExpressionParser('sqrt(in(0))')
      const { code, needsMath } = c99ExpressionToCode(parser.parse(), ['input1'])
      
      expect(code).toBe('sqrt(input1)')
      expect(needsMath).toBe(true)
    })

    test('handles special math functions', () => {
      const tests = [
        { expr: 'abs(in(0))', expected: 'abs((int)(input1))' },
        { expr: 'labs(in(0))', expected: 'labs((long)(input1))' },
        { expr: 'signbit(in(0))', expected: '(signbit(input1) ? 1 : 0)' },
      ]
      
      for (const test of tests) {
        const parser = new C99ExpressionParser(test.expr)
        const { code } = c99ExpressionToCode(parser.parse(), ['input1'])
        expect(code).toBe(test.expected)
      }
    })

    test('generates complex math expressions', () => {
      const parser = new C99ExpressionParser('pow(sin(in(0)), 2) + pow(cos(in(0)), 2)')
      const { code, needsMath } = c99ExpressionToCode(parser.parse(), ['theta'])
      
      expect(code).toBe('(pow(sin(theta), 2) + pow(cos(theta), 2))')
      expect(needsMath).toBe(true)
    })
  })
})
// lib/c99ExpressionEvaluator.ts - Updated version

import { Expression, NumberLiteral, BinaryExpression, UnaryExpression, 
         FunctionCall, ConditionalExpression } from './c99ExpressionParser'

export class C99ExpressionEvaluator {
  private inputs: number[]

  constructor(inputs: number[]) {
    this.inputs = inputs
  }

  evaluate(expr: Expression): number {
    switch (expr.type) {
      case 'NumberLiteral':
        return expr.value

      case 'Identifier':
        throw new Error(`Unexpected identifier: ${expr.name}`)

      case 'BinaryExpression':
        return this.evaluateBinary(expr)

      case 'UnaryExpression':
        return this.evaluateUnary(expr)

      case 'FunctionCall':
        return this.evaluateFunction(expr)

      case 'ConditionalExpression':
        return this.evaluateConditional(expr)

      default:
        throw new Error(`Unknown expression type: ${(expr as any).type}`)
    }
  }

  private evaluateBinary(expr: BinaryExpression): number {
    const left = this.evaluate(expr.left)
    const right = this.evaluate(expr.right)

    switch (expr.operator) {
      // Arithmetic
      case '+': return left + right
      case '-': return left - right
      case '*': return left * right
      case '/': 
        if (right === 0) throw new Error('Division by zero')
        return left / right
      case '%': 
        if (right === 0) throw new Error('Division by zero')
        return left % right

      // Comparison
      case '<': return left < right ? 1 : 0
      case '>': return left > right ? 1 : 0
      case '<=': return left <= right ? 1 : 0
      case '>=': return left >= right ? 1 : 0
      case '==': return Math.abs(left - right) < Number.EPSILON ? 1 : 0
      case '!=': return Math.abs(left - right) >= Number.EPSILON ? 1 : 0

      // Logical
      case '&&': return (left !== 0) && (right !== 0) ? 1 : 0
      case '||': return (left !== 0) || (right !== 0) ? 1 : 0

      // Bitwise
      case '&': return (left | 0) & (right | 0)
      case '|': return (left | 0) | (right | 0)
      case '^': return (left | 0) ^ (right | 0)
      case '<<': return (left | 0) << (right | 0)
      case '>>': return (left | 0) >> (right | 0)

      default:
        throw new Error(`Unknown binary operator: ${expr.operator}`)
    }
  }

  private evaluateUnary(expr: UnaryExpression): number {
    const operand = this.evaluate(expr.operand)

    switch (expr.operator) {
      case '+': return +operand
      case '-': return -operand
      case '!': return operand === 0 ? 1 : 0
      case '~': return ~(operand | 0)
      default:
        throw new Error(`Unknown unary operator: ${expr.operator}`)
    }
  }

  private evaluateFunction(expr: FunctionCall): number {
    if (expr.name === 'in') {
      if (expr.arguments.length !== 1) {
        throw new Error('in() requires exactly one argument')
      }

      const indexExpr = expr.arguments[0]
      if (indexExpr.type !== 'NumberLiteral') {
        throw new Error('in() argument must be a number literal')
      }

      const index = Math.floor(indexExpr.value)
      if (index < 0 || index >= this.inputs.length) {
        throw new Error(`in(${index}) out of range`)
      }

      return this.inputs[index]
    }

    // Math functions
    const args = expr.arguments.map(arg => this.evaluate(arg))
    
    switch (expr.name) {
      // Single argument functions
      case 'sqrt': return Math.sqrt(args[0])
      case 'sin': return Math.sin(args[0])
      case 'cos': return Math.cos(args[0])
      case 'tan': return Math.tan(args[0])
      case 'asin': return Math.asin(args[0])
      case 'acos': return Math.acos(args[0])
      case 'atan': return Math.atan(args[0])
      case 'ceil': return Math.ceil(args[0])
      case 'floor': return Math.floor(args[0])
      case 'trunc': return Math.trunc(args[0])
      case 'round': return Math.round(args[0])
      case 'lround': return Math.round(args[0]) // JavaScript doesn't distinguish
      case 'log': return Math.log(args[0])
      case 'log2': return Math.log2(args[0])
      case 'log10': return Math.log10(args[0])
      case 'abs': return Math.abs(args[0] | 0) // Integer abs
      case 'labs': return Math.abs(args[0] | 0) // Long abs (same in JS)
      case 'fabs': return Math.abs(args[0])
      case 'signbit': return args[0] < 0 ? 1 : 0
      
      // Two argument functions
      case 'pow': return Math.pow(args[0], args[1])
      case 'atan2': return Math.atan2(args[0], args[1])
      case 'fmax': return Math.max(args[0], args[1])
      case 'fmin': return Math.min(args[0], args[1])
      
      default:
        throw new Error(`Unknown function: ${expr.name}`)
    }
  }

  private evaluateConditional(expr: ConditionalExpression): number {
    const condition = this.evaluate(expr.condition)
    
    if (condition !== 0) {
      return this.evaluate(expr.trueBranch)
    } else {
      return this.evaluate(expr.falseBranch)
    }
  }
}
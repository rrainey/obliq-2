// lib/c99ExpressionValidator.ts - Updated version

import { Expression, FunctionCall, Identifier } from './c99ExpressionParser'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  usedInputs: Set<number>
  hasFloatOperations: boolean
  usesMathFunctions: boolean
}

// Math function signatures
const MATH_FUNCTIONS: Record<string, { args: number, description: string }> = {
  // Single argument functions
  'sqrt': { args: 1, description: 'square root' },
  'sin': { args: 1, description: 'sine (radians)' },
  'cos': { args: 1, description: 'cosine (radians)' },
  'tan': { args: 1, description: 'tangent (radians)' },
  'asin': { args: 1, description: 'arc sine' },
  'acos': { args: 1, description: 'arc cosine' },
  'atan': { args: 1, description: 'arc tangent' },
  'ceil': { args: 1, description: 'ceiling' },
  'floor': { args: 1, description: 'floor' },
  'trunc': { args: 1, description: 'truncate' },
  'round': { args: 1, description: 'round to nearest' },
  'lround': { args: 1, description: 'round to nearest long' },
  'log': { args: 1, description: 'natural logarithm' },
  'log2': { args: 1, description: 'base-2 logarithm' },
  'log10': { args: 1, description: 'base-10 logarithm' },
  'abs': { args: 1, description: 'absolute value (int)' },
  'labs': { args: 1, description: 'absolute value (long)' },
  'fabs': { args: 1, description: 'absolute value (float)' },
  'signbit': { args: 1, description: 'sign bit test' },
  
  // Two argument functions
  'pow': { args: 2, description: 'power (x^y)' },
  'atan2': { args: 2, description: 'arc tangent of y/x' },
  'fmax': { args: 2, description: 'maximum value' },
  'fmin': { args: 2, description: 'minimum value' },
}

export class C99ExpressionValidator {
  private errors: string[] = []
  private warnings: string[] = []
  private usedInputs: Set<number> = new Set()
  private hasFloatOperations: boolean = false
  private usesMathFunctions: boolean = false
  private numInputs: number

  constructor(numInputs: number) {
    this.numInputs = numInputs
  }

  validate(expr: Expression): ValidationResult {
    this.errors = []
    this.warnings = []
    this.usedInputs = new Set()
    this.hasFloatOperations = false
    this.usesMathFunctions = false

    try {
      this.validateExpression(expr)
    } catch (error) {
      this.errors.push(error instanceof Error ? error.message : 'Unknown validation error')
    }

    return {
      valid: this.errors.length === 0,
      errors: [...this.errors],
      warnings: [...this.warnings],
      usedInputs: new Set(this.usedInputs),
      hasFloatOperations: this.hasFloatOperations,
      usesMathFunctions: this.usesMathFunctions
    }
  }

  private validateExpression(expr: Expression): void {
    switch (expr.type) {
      case 'NumberLiteral':
        if (expr.isFloat) {
          this.hasFloatOperations = true
        }
        break

      case 'Identifier':
        this.errors.push(`Unexpected identifier '${expr.name}'. Only in(n) functions, math functions, and literals are allowed.`)
        break

      case 'BinaryExpression':
        this.validateExpression(expr.left)
        this.validateExpression(expr.right)
        
        // Check for division by zero with literals
        if (expr.operator === '/' || expr.operator === '%') {
          if (expr.right.type === 'NumberLiteral' && expr.right.value === 0) {
            this.errors.push('Division by zero detected')
          }
        }
        
        // Bitwise operators should work with integers
        if (['&', '|', '^', '<<', '>>'].includes(expr.operator)) {
          if (this.hasFloatOperations) {
            this.warnings.push(`Bitwise operator '${expr.operator}' used with floating-point values`)
          }
        }
        break

      case 'UnaryExpression':
        this.validateExpression(expr.operand)
        
        // Increment/decrement not allowed in expressions
        if (expr.operator === '++' || expr.operator === '--') {
          this.errors.push(`Operator '${expr.operator}' not allowed in evaluate expressions`)
        }
        break

      case 'FunctionCall':
        this.validateFunctionCall(expr)
        break

      case 'ConditionalExpression':
        this.validateExpression(expr.condition)
        this.validateExpression(expr.trueBranch)
        this.validateExpression(expr.falseBranch)
        break

      //default:
      //  this.errors.push(`Unsupported expression type: ${expr.type}`)
    }
  }

  private validateFunctionCall(call: FunctionCall): void {
    if (call.name === 'in') {
      // Validate in(n) function
      if (call.arguments.length !== 1) {
        this.errors.push(`in() function requires exactly 1 argument, got ${call.arguments.length}`)
        return
      }

      const arg = call.arguments[0]
      if (arg.type !== 'NumberLiteral') {
        this.errors.push('in() function argument must be a number literal')
        return
      }

      const index = Math.floor(arg.value)
      if (index < 0 || index >= this.numInputs) {
        this.errors.push(`in(${index}) is out of range. Valid range is 0 to ${this.numInputs - 1}`)
        return
      }

      this.usedInputs.add(index)
    } else if (MATH_FUNCTIONS[call.name]) {
      // Validate math function
      const funcInfo = MATH_FUNCTIONS[call.name]
      this.usesMathFunctions = true
      this.hasFloatOperations = true // Math functions typically work with floats
      
      if (call.arguments.length !== funcInfo.args) {
        this.errors.push(`${call.name}() requires exactly ${funcInfo.args} argument(s), got ${call.arguments.length}`)
        return
      }
      
      // Validate all arguments are expressions (not just literals)
      for (const arg of call.arguments) {
        this.validateExpression(arg)
      }
      
      // Special validation for certain functions
      if (call.name === 'sqrt' && call.arguments[0].type === 'NumberLiteral' && call.arguments[0].value < 0) {
        this.warnings.push('sqrt() of negative number will produce NaN')
      }
      
      if (call.name === 'log' || call.name === 'log10' || call.name === 'log2') {
        if (call.arguments[0].type === 'NumberLiteral' && call.arguments[0].value <= 0) {
          this.warnings.push(`${call.name}() of non-positive number will produce NaN or -Infinity`)
        }
      }
    } else {
      this.errors.push(`Unknown function '${call.name}'. Supported: in(n), ${Object.keys(MATH_FUNCTIONS).join(', ')}`)
    }
  }
}
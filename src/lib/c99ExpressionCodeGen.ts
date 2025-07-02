// lib/c99ExpressionCodeGen.ts - Updated version

import { Expression, BinaryExpression, UnaryExpression, 
         FunctionCall, ConditionalExpression } from './c99ExpressionParser'

// Math functions that need special handling in C
const MATH_FUNCTIONS = new Set([
  'sqrt', 'pow', 'sin', 'cos', 'tan', 'atan', 'atan2', 'acos', 'asin',
  'ceil', 'floor', 'trunc', 'round', 'lround', 'log', 'log2', 'log10',
  'abs', 'labs', 'fabs', 'fmax', 'fmin', 'signbit'
])

/**
 * Convert an expression AST to C code
 * @param expr The expression AST
 * @param inputVars Array of C variable names for inputs (e.g., ["input1", "input2"])
 * @returns Object with code and whether math.h is needed
 */
export function c99ExpressionToCode(
  expr: Expression, 
  inputVars: string[]
): { code: string; needsMath: boolean } {
  let needsMath = false
  
  function generateExpression(expr: Expression): string {
    switch (expr.type) {
      case 'NumberLiteral':
        // Ensure floating point literals have decimal point
        if (expr.isFloat && !expr.value.toString().includes('.')) {
          return `${expr.value}.0`
        }
        return expr.value.toString()

      case 'Identifier':
        throw new Error(`Unexpected identifier in expression: ${expr.name}`)

      case 'BinaryExpression':
        return generateBinaryExpression(expr)

      case 'UnaryExpression':
        return generateUnaryExpression(expr)

      case 'FunctionCall':
        return generateFunctionCall(expr, inputVars)

      case 'ConditionalExpression':
        return generateConditionalExpression(expr)

      default:
        throw new Error(`Unknown expression type: ${(expr as any).type}`)
    }
  }

  function generateBinaryExpression(expr: BinaryExpression): string {
    const left = generateExpression(expr.left)
    const right = generateExpression(expr.right)
    
    // Add parentheses to preserve precedence
    return `(${left} ${expr.operator} ${right})`
  }

  function generateUnaryExpression(expr: UnaryExpression): string {
    const operand = generateExpression(expr.operand)
    
    // Handle prefix operators
    if (expr.operator === '+' || expr.operator === '-' || 
        expr.operator === '!' || expr.operator === '~') {
      return `(${expr.operator}${operand})`
    }
    
    throw new Error(`Unsupported unary operator: ${expr.operator}`)
  }

  function generateFunctionCall(expr: FunctionCall, inputVars: string[]): string {
    if (expr.name === 'in') {
      if (expr.arguments.length !== 1 || expr.arguments[0].type !== 'NumberLiteral') {
        throw new Error('Invalid in() function call')
      }
      
      const index = Math.floor(expr.arguments[0].value)
      if (index < 0 || index >= inputVars.length) {
        throw new Error(`in(${index}) out of range`)
      }
      
      // Return the sanitized variable name
      return inputVars[index]
    }
    
    // Math functions
    if (MATH_FUNCTIONS.has(expr.name)) {
      needsMath = true
      const args = expr.arguments.map(arg => generateExpression(arg))
      
      // Special handling for certain functions
      switch (expr.name) {
        case 'signbit':
          // signbit is a macro in C, returns non-zero for negative
          // We'll convert to 0/1 for consistency
          return `(signbit(${args[0]}) ? 1 : 0)`
          
        case 'abs':
          // abs is for integers, ensure we cast
          return `abs((int)(${args[0]}))`
          
        case 'labs':
          // labs is for longs
          return `labs((long)(${args[0]}))`
          
        case 'lround':
          // lround returns long
          return `lround(${args[0]})`
          
        default:
          // Most functions map directly
          return `${expr.name}(${args.join(', ')})`
      }
    }
    
    throw new Error(`Unknown function: ${expr.name}`)
  }

  function generateConditionalExpression(expr: ConditionalExpression): string {
    const condition = generateExpression(expr.condition)
    const trueBranch = generateExpression(expr.trueBranch)
    const falseBranch = generateExpression(expr.falseBranch)
    
    return `((${condition}) ? (${trueBranch}) : (${falseBranch}))`
  }

  const code = generateExpression(expr)
  return { code, needsMath }
}

// Convenience function that returns just the code (for backward compatibility)
export function c99ExpressionToCodeString(expr: Expression, inputVars: string[]): string {
  return c99ExpressionToCode(expr, inputVars).code
}
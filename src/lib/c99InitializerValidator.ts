// lib/c99InitializerValidator.ts
// Validates C99-style initializer expressions against type specifications

import { C99Token, C99TokenType, c99Tokenizer } from './c99Tokenizer'
import { parseType, ParsedType } from './typeValidator'

/**
 * Result of parsing a C99 initializer
 */
export interface InitializerParseResult {
  valid: boolean
  value?: number | boolean | number[] | boolean[] | number[][] | boolean[][]
  error?: string
}

/**
 * C99 Initializer Parser
 * Parses C-style initializers like:
 * - Scalars: 42, 3.14, 3.14f, true, false, 0x1F
 * - Arrays: {1, 2, 3}
 * - Matrices: {{1, 0, 0}, {0, 1, 0}, {0, 0, 1}}
 */
class C99InitializerParser {
  private tokens: C99Token[]
  private current: number = 0
  private expectedType: ParsedType

  constructor(input: string, expectedType: ParsedType) {
    this.tokens = c99Tokenizer(input)
    this.expectedType = expectedType
  }

  parse(): InitializerParseResult {
    try {
      const value = this.parseInitializer()

      // Ensure we consumed all tokens
      if (!this.isAtEnd()) {
        return {
          valid: false,
          error: `Unexpected token after initializer: ${this.peek().value}`
        }
      }

      return { valid: true, value }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown parse error'
      }
    }
  }

  private parseInitializer(): number | boolean | number[] | boolean[] | number[][] | boolean[][] {
    if (this.expectedType.isMatrix) {
      return this.parseMatrixInitializer()
    } else if (this.expectedType.isArray) {
      return this.parseArrayInitializer()
    } else {
      return this.parseScalarValue()
    }
  }

  private parseMatrixInitializer(): number[][] | boolean[][] {
    this.consume(C99TokenType.LBRACE, 'Expected "{" to start matrix initializer')

    const rows: (number[] | boolean[])[] = []
    const expectedRows = this.expectedType.rows!
    const expectedCols = this.expectedType.cols!

    // Parse first row
    rows.push(this.parseArrayInitializerValues(expectedCols))

    // Parse remaining rows
    while (this.match(C99TokenType.COMMA)) {
      if (this.check(C99TokenType.RBRACE)) break // Trailing comma
      rows.push(this.parseArrayInitializerValues(expectedCols))
    }

    this.consume(C99TokenType.RBRACE, 'Expected "}" to end matrix initializer')

    if (rows.length !== expectedRows) {
      throw new Error(`Expected ${expectedRows} rows but got ${rows.length}`)
    }

    return rows as number[][] | boolean[][]
  }

  private parseArrayInitializer(): number[] | boolean[] {
    return this.parseArrayInitializerValues(this.expectedType.arraySize!)
  }

  private parseArrayInitializerValues(expectedSize: number): number[] | boolean[] {
    this.consume(C99TokenType.LBRACE, 'Expected "{" to start array initializer')

    const values: (number | boolean)[] = []

    // Parse first value
    if (!this.check(C99TokenType.RBRACE)) {
      values.push(this.parseScalarValue())

      // Parse remaining values
      while (this.match(C99TokenType.COMMA)) {
        if (this.check(C99TokenType.RBRACE)) break // Trailing comma
        values.push(this.parseScalarValue())
      }
    }

    this.consume(C99TokenType.RBRACE, 'Expected "}" to end array initializer')

    if (values.length !== expectedSize) {
      throw new Error(`Expected ${expectedSize} elements but got ${values.length}`)
    }

    return values as number[] | boolean[]
  }

  private parseScalarValue(): number | boolean {
    // Handle unary minus/plus
    let negate = false
    if (this.match(C99TokenType.MINUS)) {
      negate = true
    } else if (this.match(C99TokenType.PLUS)) {
      // Just consume it
    }

    const token = this.peek()

    // Boolean literals (C99 uses _Bool but we accept true/false)
    if (token.type === C99TokenType.IDENTIFIER) {
      if (token.value === 'true') {
        this.advance()
        if (this.expectedType.baseType !== 'bool') {
          throw new Error(`Expected ${this.expectedType.baseType} but got boolean`)
        }
        return !negate // true negated is false
      }
      if (token.value === 'false') {
        this.advance()
        if (this.expectedType.baseType !== 'bool') {
          throw new Error(`Expected ${this.expectedType.baseType} but got boolean`)
        }
        return negate // false negated is true
      }
      throw new Error(`Unknown identifier: ${token.value}`)
    }

    // Numeric literals
    if (token.type === C99TokenType.INTEGER_LITERAL || token.type === C99TokenType.FLOAT_LITERAL) {
      this.advance()
      const numValue = this.parseNumericLiteral(token.value)
      const result = negate ? -numValue : numValue

      // Type checking
      if (this.expectedType.baseType === 'bool') {
        throw new Error(`Expected boolean but got number`)
      }
      if (this.expectedType.baseType === 'long' && !Number.isInteger(result)) {
        throw new Error(`Expected integer for long type but got ${result}`)
      }

      return result
    }

    throw new Error(`Expected scalar value but got ${token.type}: ${token.value}`)
  }

  private parseNumericLiteral(value: string): number {
    // Handle hex first (before suffix removal, since F/f are valid hex digits)
    if (value.startsWith('0x') || value.startsWith('0X')) {
      // For hex, only remove integer suffixes (L, U, LL, etc.) that appear after hex digits
      // The regex matches optional hex digits followed by suffix characters at the end
      const hexMatch = value.match(/^(0[xX][0-9a-fA-F]+)([lLuU]*)$/)
      if (hexMatch) {
        return parseInt(hexMatch[1], 16)
      }
      return parseInt(value, 16)
    }

    // Handle binary literals (0b prefix)
    if (value.startsWith('0b') || value.startsWith('0B')) {
      // Remove any integer suffixes (L, U, LL, etc.)
      const binMatch = value.match(/^(0[bB][01]+)([lLuU]*)$/)
      if (binMatch) {
        return parseInt(binMatch[1].slice(2), 2)
      }
      return parseInt(value.slice(2), 2)
    }

    // Remove suffixes for non-hex/binary literals (f, F, l, L, u, U, ll, LL, etc.)
    value = value.replace(/[fFlLuU]+$/i, '')

    // Handle octal (leading zero, no decimal point)
    if (value.startsWith('0') && value.length > 1 && !value.includes('.') && !value.includes('e') && !value.includes('E')) {
      return parseInt(value, 8)
    }

    // Handle decimal/float
    return parseFloat(value)
  }

  // Token helpers
  private match(...types: C99TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance()
        return true
      }
    }
    return false
  }

  private check(type: C99TokenType): boolean {
    if (this.isAtEnd()) return false
    return this.peek().type === type
  }

  private advance(): C99Token {
    if (!this.isAtEnd()) this.current++
    return this.previous()
  }

  private isAtEnd(): boolean {
    return this.peek().type === C99TokenType.EOF
  }

  private peek(): C99Token {
    return this.tokens[this.current]
  }

  private previous(): C99Token {
    return this.tokens[this.current - 1]
  }

  private consume(type: C99TokenType, message: string): C99Token {
    if (this.check(type)) return this.advance()
    throw new Error(`${message} at position ${this.peek().column}`)
  }
}

/**
 * Validates a C99 initializer string against a type specification
 * @param initializerString - The C99 initializer (e.g., "{1, 2, 3}" or "42" or "{{1,0},{0,1}}")
 * @param typeString - The type specification (e.g., "double[3]" or "float" or "double[2][2]")
 * @returns true if valid, false otherwise
 */
export function isValidC99Initializer(initializerString: string, typeString: string): boolean {
  try {
    const result = parseC99Initializer(initializerString, typeString)
    return result.valid
  } catch {
    return false
  }
}

/**
 * Parses and validates a C99 initializer string
 * @param initializerString - The C99 initializer string
 * @param typeString - The expected type
 * @returns Parse result with value if valid, or error message if invalid
 */
export function parseC99Initializer(initializerString: string, typeString: string): InitializerParseResult {
  if (!initializerString || typeof initializerString !== 'string') {
    return { valid: false, error: 'Initializer must be a non-empty string' }
  }

  try {
    const parsedType = parseType(typeString)
    const parser = new C99InitializerParser(initializerString.trim(), parsedType)
    return parser.parse()
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Failed to parse type'
    }
  }
}

/**
 * Gets a detailed error message for an invalid C99 initializer
 * @param initializerString - The C99 initializer string
 * @param typeString - The expected type
 * @returns Error message if invalid, empty string if valid
 */
export function getC99InitializerError(initializerString: string, typeString: string): string {
  const result = parseC99Initializer(initializerString, typeString)
  return result.error || ''
}

/**
 * Converts a JavaScript value to a C99 initializer string
 * @param value - JavaScript value (number, boolean, array, or matrix)
 * @param typeString - The type specification
 * @returns C99 initializer string
 */
export function toC99Initializer(value: any, typeString: string): string {
  try {
    const parsedType = parseType(typeString)
    return valueToC99String(value, parsedType)
  } catch {
    return String(value)
  }
}

function valueToC99String(value: any, parsedType: ParsedType): string {
  if (parsedType.isMatrix) {
    if (!Array.isArray(value)) {
      throw new Error('Expected array for matrix type')
    }
    const rows = value.map((row: any) => {
      if (!Array.isArray(row)) {
        throw new Error('Expected 2D array for matrix type')
      }
      return `{${row.map((v: any) => scalarToC99(v, parsedType.baseType)).join(', ')}}`
    })
    return `{${rows.join(', ')}}`
  }

  if (parsedType.isArray) {
    if (!Array.isArray(value)) {
      throw new Error('Expected array type')
    }
    return `{${value.map((v: any) => scalarToC99(v, parsedType.baseType)).join(', ')}}`
  }

  return scalarToC99(value, parsedType.baseType)
}

function scalarToC99(value: any, baseType: string): string {
  if (baseType === 'bool') {
    return value ? 'true' : 'false'
  }
  if (baseType === 'float') {
    return typeof value === 'number' ? `${value}f` : String(value)
  }
  if (baseType === 'long') {
    return typeof value === 'number' ? `${Math.floor(value)}L` : String(value)
  }
  // double
  return String(value)
}

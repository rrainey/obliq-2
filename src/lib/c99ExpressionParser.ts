// lib/c99ExpressionParser.ts

import { C99Token, C99TokenType, c99Tokenizer } from './c99Tokenizer'

// AST Node Types
export interface ASTNode {
  type: string
  position: number
}

export interface NumberLiteral extends ASTNode {
  type: 'NumberLiteral'
  value: number
  isFloat: boolean
}

export interface Identifier extends ASTNode {
  type: 'Identifier'
  name: string
}

export interface BinaryExpression extends ASTNode {
  type: 'BinaryExpression'
  operator: string
  left: Expression
  right: Expression
}

export interface UnaryExpression extends ASTNode {
  type: 'UnaryExpression'
  operator: string
  operand: Expression
}

export interface FunctionCall extends ASTNode {
  type: 'FunctionCall'
  name: string
  arguments: Expression[]
}

export interface ConditionalExpression extends ASTNode {
  type: 'ConditionalExpression'
  condition: Expression
  trueBranch: Expression
  falseBranch: Expression
}

export type Expression = 
  | NumberLiteral 
  | Identifier 
  | BinaryExpression 
  | UnaryExpression 
  | FunctionCall 
  | ConditionalExpression

// Operator precedence (higher number = higher precedence)
const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '|': 3,
  '^': 4,
  '&': 5,
  '==': 6, '!=': 6,
  '<': 7, '>': 7, '<=': 7, '>=': 7,
  '<<': 8, '>>': 8,
  '+': 9, '-': 9,
  '*': 10, '/': 10, '%': 10,
}

export class C99ExpressionParser {
  private tokens: C99Token[]
  private current: number = 0

  constructor(expression: string) {
    this.tokens = c99Tokenizer(expression)
  }

  parse(): Expression {
    const expr = this.parseExpression()
    if (!this.isAtEnd()) {
      throw new Error(`Unexpected token after expression: ${this.peek().value}`)
    }
    return expr
  }

  private parseExpression(): Expression {
    return this.parseConditional()
  }

  private parseConditional(): Expression {
    let expr = this.parseBinary()

    if (this.match(C99TokenType.QUESTION)) {
      const trueBranch = this.parseExpression()
      this.consume(C99TokenType.COLON, "Expected ':' after true branch")
      const falseBranch = this.parseConditional()
      
      expr = {
        type: 'ConditionalExpression',
        condition: expr,
        trueBranch,
        falseBranch,
        position: expr.position
      }
    }

    return expr
  }

  private parseBinary(minPrecedence: number = 0): Expression {
    let left = this.parseUnary()

    while (true) {
      const operator = this.peek()
      if (!this.isBinaryOperator(operator) || 
          (PRECEDENCE[operator.value] || 0) < minPrecedence) {
        break
      }

      this.advance()
      const precedence = PRECEDENCE[operator.value] || 0
      const associativity = 'left' // C99 is left-associative for most operators
      const nextMinPrecedence = associativity === 'left' ? precedence + 1 : precedence
      
      const right = this.parseBinary(nextMinPrecedence)
      
      left = {
        type: 'BinaryExpression',
        operator: operator.value,
        left,
        right,
        position: operator.column
      }
    }

    return left
  }

  private parseUnary(): Expression {
    const operator = this.peek()
    
    if (this.isUnaryOperator(operator)) {
      this.advance()
      const operand = this.parseUnary()
      
      return {
        type: 'UnaryExpression',
        operator: operator.value,
        operand,
        position: operator.column
      }
    }

    return this.parsePostfix()
  }

  private parsePostfix(): Expression {
    let expr = this.parsePrimary()

    while (true) {
      if (this.match(C99TokenType.LPAREN)) {
        // Function call
        const args: Expression[] = []
        
        if (!this.check(C99TokenType.RPAREN)) {
          do {
            args.push(this.parseExpression())
          } while (this.match(C99TokenType.COMMA))
        }
        
        this.consume(C99TokenType.RPAREN, "Expected ')' after arguments")
        
        if (expr.type !== 'Identifier') {
          throw new Error('Function call requires identifier')
        }
        
        expr = {
          type: 'FunctionCall',
          name: (expr as Identifier).name,
          arguments: args,
          position: expr.position
        }
      } else {
        break
      }
    }

    return expr
  }

  private parsePrimary(): Expression {
    // Numbers
    if (this.match(C99TokenType.INTEGER_LITERAL, C99TokenType.FLOAT_LITERAL)) {
      const token = this.previous()
      const value = this.parseNumber(token.value)
      
      return {
        type: 'NumberLiteral',
        value,
        isFloat: token.type === C99TokenType.FLOAT_LITERAL || token.value.includes('.'),
        position: token.column
      }
    }

    // Identifiers
    if (this.match(C99TokenType.IDENTIFIER)) {
      const token = this.previous()
      return {
        type: 'Identifier',
        name: token.value,
        position: token.column
      }
    }

    // Parenthesized expressions
    if (this.match(C99TokenType.LPAREN)) {
      const expr = this.parseExpression()
      this.consume(C99TokenType.RPAREN, "Expected ')' after expression")
      return expr
    }

    throw new Error(`Unexpected token: ${this.peek().value}`)
  }

  private parseNumber(value: string): number {
    // Remove suffixes
    value = value.replace(/[fFlLuU]+$/, '')
    
    // Handle hex
    if (value.startsWith('0x') || value.startsWith('0X')) {
      return parseInt(value, 16)
    }
    
    // Handle octal
    if (value.startsWith('0') && value.length > 1 && !value.includes('.')) {
      return parseInt(value, 8)
    }
    
    // Handle decimal/float
    return parseFloat(value)
  }

  private isBinaryOperator(token: C99Token): boolean {
    const binaryOps = [
      C99TokenType.PLUS, C99TokenType.MINUS, C99TokenType.STAR, 
      C99TokenType.SLASH, C99TokenType.PERCENT,
      C99TokenType.EQ_EQ, C99TokenType.NOT_EQ, C99TokenType.LESS, 
      C99TokenType.GREATER, C99TokenType.LESS_EQ, C99TokenType.GREATER_EQ,
      C99TokenType.AMP_AMP, C99TokenType.PIPE_PIPE,
      C99TokenType.AMP, C99TokenType.PIPE, C99TokenType.CARET,
      C99TokenType.LSHIFT, C99TokenType.RSHIFT
    ]
    return binaryOps.includes(token.type)
  }

  private isUnaryOperator(token: C99Token): boolean {
    const unaryOps = [
      C99TokenType.PLUS, C99TokenType.MINUS, C99TokenType.BANG, 
      C99TokenType.TILDE, C99TokenType.PLUS_PLUS, C99TokenType.MINUS_MINUS
    ]
    return unaryOps.includes(token.type)
  }

  // Token manipulation helpers
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
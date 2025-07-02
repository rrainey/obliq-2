// lib/c99Tokenizer.ts

export enum C99TokenType {
  // Keywords
  AUTO = 'AUTO',
  BREAK = 'BREAK',
  CASE = 'CASE',
  CHAR = 'CHAR',
  CONST = 'CONST',
  CONTINUE = 'CONTINUE',
  DEFAULT = 'DEFAULT',
  DO = 'DO',
  DOUBLE = 'DOUBLE',
  ELSE = 'ELSE',
  ENUM = 'ENUM',
  EXTERN = 'EXTERN',
  FLOAT = 'FLOAT',
  FOR = 'FOR',
  GOTO = 'GOTO',
  IF = 'IF',
  INLINE = 'INLINE',
  INT = 'INT',
  LONG = 'LONG',
  REGISTER = 'REGISTER',
  RESTRICT = 'RESTRICT',
  RETURN = 'RETURN',
  SHORT = 'SHORT',
  SIGNED = 'SIGNED',
  SIZEOF = 'SIZEOF',
  STATIC = 'STATIC',
  STRUCT = 'STRUCT',
  SWITCH = 'SWITCH',
  TYPEDEF = 'TYPEDEF',
  UNION = 'UNION',
  UNSIGNED = 'UNSIGNED',
  VOID = 'VOID',
  VOLATILE = 'VOLATILE',
  WHILE = 'WHILE',
  _BOOL = '_BOOL',
  _COMPLEX = '_COMPLEX',
  _IMAGINARY = '_IMAGINARY',
  
  // Identifiers and literals
  IDENTIFIER = 'IDENTIFIER',
  INTEGER_LITERAL = 'INTEGER_LITERAL',
  FLOAT_LITERAL = 'FLOAT_LITERAL',
  STRING_LITERAL = 'STRING_LITERAL',
  CHARACTER_LITERAL = 'CHARACTER_LITERAL',
  
  // Operators
  PLUS = 'PLUS',                    // +
  MINUS = 'MINUS',                  // -
  STAR = 'STAR',                    // *
  SLASH = 'SLASH',                  // /
  PERCENT = 'PERCENT',              // %
  PLUS_PLUS = 'PLUS_PLUS',          // ++
  MINUS_MINUS = 'MINUS_MINUS',      // --
  
  // Relational operators
  EQ_EQ = 'EQ_EQ',                  // ==
  NOT_EQ = 'NOT_EQ',                // !=
  LESS = 'LESS',                    // 
  GREATER = 'GREATER',              // >
  LESS_EQ = 'LESS_EQ',              // <=
  GREATER_EQ = 'GREATER_EQ',        // >=
  
  // Logical operators
  AMP_AMP = 'AMP_AMP',              // &&
  PIPE_PIPE = 'PIPE_PIPE',          // ||
  BANG = 'BANG',                    // !
  
  // Bitwise operators
  AMP = 'AMP',                      // &
  PIPE = 'PIPE',                    // |
  CARET = 'CARET',                  // ^
  TILDE = 'TILDE',                  // ~
  LSHIFT = 'LSHIFT',                // 
  RSHIFT = 'RSHIFT',                // >>
  
  // Assignment operators
  EQ = 'EQ',                        // =
  PLUS_EQ = 'PLUS_EQ',              // +=
  MINUS_EQ = 'MINUS_EQ',            // -=
  STAR_EQ = 'STAR_EQ',              // *=
  SLASH_EQ = 'SLASH_EQ',            // /=
  PERCENT_EQ = 'PERCENT_EQ',        // %=
  AMP_EQ = 'AMP_EQ',                // &=
  PIPE_EQ = 'PIPE_EQ',              // |=
  CARET_EQ = 'CARET_EQ',            // ^=
  LSHIFT_EQ = 'LSHIFT_EQ',          // <<=
  RSHIFT_EQ = 'RSHIFT_EQ',          // >>=
  
  // Structural operators
  DOT = 'DOT',                      // .
  ARROW = 'ARROW',                  // ->
  QUESTION = 'QUESTION',            // ?
  COLON = 'COLON',                  // :
  
  // Delimiters
  LPAREN = 'LPAREN',                // (
  RPAREN = 'RPAREN',                // )
  LBRACKET = 'LBRACKET',            // [
  RBRACKET = 'RBRACKET',            // ]
  LBRACE = 'LBRACE',                // {
  RBRACE = 'RBRACE',                // }
  COMMA = 'COMMA',                  // ,
  SEMICOLON = 'SEMICOLON',          // ;
  ELLIPSIS = 'ELLIPSIS',            // ...
  
  // Special
  EOF = 'EOF',
  UNKNOWN = 'UNKNOWN'
}

export interface C99Token {
  type: C99TokenType
  value: string
  column: number
}

// C99 Keywords map
const keywords: Map<string, C99TokenType> = new Map([
  ['auto', C99TokenType.AUTO],
  ['break', C99TokenType.BREAK],
  ['case', C99TokenType.CASE],
  ['char', C99TokenType.CHAR],
  ['const', C99TokenType.CONST],
  ['continue', C99TokenType.CONTINUE],
  ['default', C99TokenType.DEFAULT],
  ['do', C99TokenType.DO],
  ['double', C99TokenType.DOUBLE],
  ['else', C99TokenType.ELSE],
  ['enum', C99TokenType.ENUM],
  ['extern', C99TokenType.EXTERN],
  ['float', C99TokenType.FLOAT],
  ['for', C99TokenType.FOR],
  ['goto', C99TokenType.GOTO],
  ['if', C99TokenType.IF],
  ['inline', C99TokenType.INLINE],
  ['int', C99TokenType.INT],
  ['long', C99TokenType.LONG],
  ['register', C99TokenType.REGISTER],
  ['restrict', C99TokenType.RESTRICT],
  ['return', C99TokenType.RETURN],
  ['short', C99TokenType.SHORT],
  ['signed', C99TokenType.SIGNED],
  ['sizeof', C99TokenType.SIZEOF],
  ['static', C99TokenType.STATIC],
  ['struct', C99TokenType.STRUCT],
  ['switch', C99TokenType.SWITCH],
  ['typedef', C99TokenType.TYPEDEF],
  ['union', C99TokenType.UNION],
  ['unsigned', C99TokenType.UNSIGNED],
  ['void', C99TokenType.VOID],
  ['volatile', C99TokenType.VOLATILE],
  ['while', C99TokenType.WHILE],
  ['_Bool', C99TokenType._BOOL],
  ['_Complex', C99TokenType._COMPLEX],
  ['_Imaginary', C99TokenType._IMAGINARY],
])

export function c99Tokenizer(input: string): C99Token[] {
  const tokens: C99Token[] = []
  let position = 0
  let column = 0
  
  function peek(offset = 0): string {
    return input[position + offset] || ''
  }
  
  function advance(count = 1): void {
    for (let i = 0; i < count; i++) {
      if (position < input.length) {
        if (input[position] === '\n') {
          column = 0
        } else {
          column++
        }
        position++
      }
    }
  }
  
  function skipWhitespace(): void {
    while (position < input.length && /\s/.test(peek())) {
      advance()
    }
  }
  
  function skipComment(): boolean {
    if (peek() === '/' && peek(1) === '/') {
      // Single-line comment
      advance(2)
      while (position < input.length && peek() !== '\n') {
        advance()
      }
      return true
    } else if (peek() === '/' && peek(1) === '*') {
      // Multi-line comment
      advance(2)
      while (position < input.length && !(peek() === '*' && peek(1) === '/')) {
        advance()
      }
      advance(2) // Skip */
      return true
    }
    return false
  }
  
  function readIdentifier(): C99Token {
    const startColumn = column
    let value = ''
    
    while (position < input.length && /[a-zA-Z0-9_]/.test(peek())) {
      value += peek()
      advance()
    }
    
    // Check if it's a keyword
    const keywordType = keywords.get(value)
    
    return {
      type: keywordType || C99TokenType.IDENTIFIER,
      value,
      column: startColumn
    }
  }
  
  function readNumber(): C99Token {
    const startColumn = column
    let value = ''
    let isFloat = false
    
    // Handle hex literals
    if (peek() === '0' && (peek(1) === 'x' || peek(1) === 'X')) {
      value += peek() + peek(1)
      advance(2)
      while (position < input.length && /[0-9a-fA-F]/.test(peek())) {
        value += peek()
        advance()
      }
      // Check for integer suffixes
      while (position < input.length && /[uUlL]/.test(peek())) {
        value += peek()
        advance()
      }
      return {
        type: C99TokenType.INTEGER_LITERAL,
        value,
        column: startColumn
      }
    }
    
    // Handle octal or decimal
    while (position < input.length && /[0-9]/.test(peek())) {
      value += peek()
      advance()
    }
    
    // Check for decimal point
    if (peek() === '.' && /[0-9]/.test(peek(1))) {
      isFloat = true
      value += peek()
      advance()
      while (position < input.length && /[0-9]/.test(peek())) {
        value += peek()
        advance()
      }
    }
    
    // Check for exponent
    if (peek() === 'e' || peek() === 'E') {
      isFloat = true
      value += peek()
      advance()
      if (peek() === '+' || peek() === '-') {
        value += peek()
        advance()
      }
      while (position < input.length && /[0-9]/.test(peek())) {
        value += peek()
        advance()
      }
    }
    
    // Check for suffixes
    if (isFloat) {
      if (peek() === 'f' || peek() === 'F' || peek() === 'l' || peek() === 'L') {
        value += peek()
        advance()
      }
    } else {
      // Integer suffixes
      while (position < input.length && /[uUlL]/.test(peek())) {
        value += peek()
        advance()
      }
    }
    
    return {
      type: isFloat ? C99TokenType.FLOAT_LITERAL : C99TokenType.INTEGER_LITERAL,
      value,
      column: startColumn
    }
  }
  
  function readStringLiteral(): C99Token {
    const startColumn = column
    let value = ''
    const quote = peek()
    value += quote
    advance()
    
    while (position < input.length && peek() !== quote) {
      if (peek() === '\\') {
        value += peek()
        advance()
        if (position < input.length) {
          value += peek()
          advance()
        }
      } else {
        value += peek()
        advance()
      }
    }
    
    if (peek() === quote) {
      value += peek()
      advance()
    }
    
    return {
      type: C99TokenType.STRING_LITERAL,
      value,
      column: startColumn
    }
  }
  
  function readCharacterLiteral(): C99Token {
    const startColumn = column
    let value = "'"
    advance() // Skip opening '
    
    while (position < input.length && peek() !== "'") {
      if (peek() === '\\') {
        value += peek()
        advance()
        if (position < input.length) {
          value += peek()
          advance()
        }
      } else {
        value += peek()
        advance()
      }
    }
    
    if (peek() === "'") {
      value += peek()
      advance()
    }
    
    return {
      type: C99TokenType.CHARACTER_LITERAL,
      value,
      column: startColumn
    }
  }
  
  function readOperator(): C99Token {
    const startColumn = column
    const ch = peek()
    const ch2 = peek(1)
    const ch3 = peek(2)
    
    // Three-character operators
    if (ch === '.' && ch2 === '.' && ch3 === '.') {
      advance(3)
      return { type: C99TokenType.ELLIPSIS, value: '...', column: startColumn }
    }
    
    // Two-character operators
    if (ch === '<' && ch2 === '<') {
      advance(2)
      if (peek() === '=') {
        advance()
        return { type: C99TokenType.LSHIFT_EQ, value: '<<=', column: startColumn }
      }
      return { type: C99TokenType.LSHIFT, value: '<<', column: startColumn }
    }
    
    if (ch === '>' && ch2 === '>') {
      advance(2)
      if (peek() === '=') {
        advance()
        return { type: C99TokenType.RSHIFT_EQ, value: '>>=', column: startColumn }
      }
      return { type: C99TokenType.RSHIFT, value: '>>', column: startColumn }
    }
    
    if (ch === '+' && ch2 === '+') {
      advance(2)
      return { type: C99TokenType.PLUS_PLUS, value: '++', column: startColumn }
    }
    
    if (ch === '-' && ch2 === '-') {
      advance(2)
      return { type: C99TokenType.MINUS_MINUS, value: '--', column: startColumn }
    }
    
    if (ch === '-' && ch2 === '>') {
      advance(2)
      return { type: C99TokenType.ARROW, value: '->', column: startColumn }
    }
    
    if (ch === '=' && ch2 === '=') {
      advance(2)
      return { type: C99TokenType.EQ_EQ, value: '==', column: startColumn }
    }
    
    if (ch === '!' && ch2 === '=') {
      advance(2)
      return { type: C99TokenType.NOT_EQ, value: '!=', column: startColumn }
    }
    
    if (ch === '<' && ch2 === '=') {
      advance(2)
      return { type: C99TokenType.LESS_EQ, value: '<=', column: startColumn }
    }
    
    if (ch === '>' && ch2 === '=') {
      advance(2)
      return { type: C99TokenType.GREATER_EQ, value: '>=', column: startColumn }
    }
    
    if (ch === '&' && ch2 === '&') {
      advance(2)
      return { type: C99TokenType.AMP_AMP, value: '&&', column: startColumn }
    }
    
    if (ch === '|' && ch2 === '|') {
      advance(2)
      return { type: C99TokenType.PIPE_PIPE, value: '||', column: startColumn }
    }
    
    if (ch === '+' && ch2 === '=') {
      advance(2)
      return { type: C99TokenType.PLUS_EQ, value: '+=', column: startColumn }
    }
    
    if (ch === '-' && ch2 === '=') {
      advance(2)
      return { type: C99TokenType.MINUS_EQ, value: '-=', column: startColumn }
    }
    
    if (ch === '*' && ch2 === '=') {
      advance(2)
      return { type: C99TokenType.STAR_EQ, value: '*=', column: startColumn }
    }
    
    if (ch === '/' && ch2 === '=') {
      advance(2)
      return { type: C99TokenType.SLASH_EQ, value: '/=', column: startColumn }
    }
    
    if (ch === '%' && ch2 === '=') {
      advance(2)
      return { type: C99TokenType.PERCENT_EQ, value: '%=', column: startColumn }
    }
    
    if (ch === '&' && ch2 === '=') {
      advance(2)
      return { type: C99TokenType.AMP_EQ, value: '&=', column: startColumn }
    }
    
    if (ch === '|' && ch2 === '=') {
      advance(2)
      return { type: C99TokenType.PIPE_EQ, value: '|=', column: startColumn }
    }
    
    if (ch === '^' && ch2 === '=') {
      advance(2)
      return { type: C99TokenType.CARET_EQ, value: '^=', column: startColumn }
    }
    
    // Single-character operators
    advance()
    switch (ch) {
      case '+': return { type: C99TokenType.PLUS, value: '+', column: startColumn }
      case '-': return { type: C99TokenType.MINUS, value: '-', column: startColumn }
      case '*': return { type: C99TokenType.STAR, value: '*', column: startColumn }
      case '/': return { type: C99TokenType.SLASH, value: '/', column: startColumn }
      case '%': return { type: C99TokenType.PERCENT, value: '%', column: startColumn }
      case '=': return { type: C99TokenType.EQ, value: '=', column: startColumn }
      case '<': return { type: C99TokenType.LESS, value: '<', column: startColumn }
      case '>': return { type: C99TokenType.GREATER, value: '>', column: startColumn }
      case '!': return { type: C99TokenType.BANG, value: '!', column: startColumn }
      case '&': return { type: C99TokenType.AMP, value: '&', column: startColumn }
      case '|': return { type: C99TokenType.PIPE, value: '|', column: startColumn }
      case '^': return { type: C99TokenType.CARET, value: '^', column: startColumn }
      case '~': return { type: C99TokenType.TILDE, value: '~', column: startColumn }
      case '.': return { type: C99TokenType.DOT, value: '.', column: startColumn }
      case '?': return { type: C99TokenType.QUESTION, value: '?', column: startColumn }
      case ':': return { type: C99TokenType.COLON, value: ':', column: startColumn }
      case '(': return { type: C99TokenType.LPAREN, value: '(', column: startColumn }
      case ')': return { type: C99TokenType.RPAREN, value: ')', column: startColumn }
      case '[': return { type: C99TokenType.LBRACKET, value: '[', column: startColumn }
      case ']': return { type: C99TokenType.RBRACKET, value: ']', column: startColumn }
      case '{': return { type: C99TokenType.LBRACE, value: '{', column: startColumn }
      case '}': return { type: C99TokenType.RBRACE, value: '}', column: startColumn }
      case ',': return { type: C99TokenType.COMMA, value: ',', column: startColumn }
      case ';': return { type: C99TokenType.SEMICOLON, value: ';', column: startColumn }
      default: return { type: C99TokenType.UNKNOWN, value: ch, column: startColumn }
    }
  }
  
  // Main tokenization loop
  while (position < input.length) {
    skipWhitespace()
    
    if (position >= input.length) break
    
    // Skip comments
    if (skipComment()) continue
    
    const ch = peek()
    
    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(ch)) {
      tokens.push(readIdentifier())
    }
    // Numbers
    else if (/[0-9]/.test(ch)) {
      tokens.push(readNumber())
    }
    // String literals
    else if (ch === '"') {
      tokens.push(readStringLiteral())
    }
    // Character literals
    else if (ch === "'") {
      tokens.push(readCharacterLiteral())
    }
    // Operators and punctuation
    else {
      tokens.push(readOperator())
    }
  }
  
  // Add EOF token
  tokens.push({
    type: C99TokenType.EOF,
    value: '',
    column: column
  })
  
  return tokens
}

// Helper function to check if a token is a specific type
export function isTokenType(token: C99Token, type: C99TokenType): boolean {
  return token.type === type
}

// Helper function to check if a token is a keyword
export function isKeyword(token: C99Token): boolean {
  return keywords.has(token.value.toLowerCase())
}

// Helper function to check if a token is an operator
export function isOperator(token: C99Token): boolean {
  const operatorTypes = [
    C99TokenType.PLUS, C99TokenType.MINUS, C99TokenType.STAR, C99TokenType.SLASH,
    C99TokenType.PERCENT, C99TokenType.PLUS_PLUS, C99TokenType.MINUS_MINUS,
    C99TokenType.EQ_EQ, C99TokenType.NOT_EQ, C99TokenType.LESS, C99TokenType.GREATER,
    C99TokenType.LESS_EQ, C99TokenType.GREATER_EQ, C99TokenType.AMP_AMP, C99TokenType.PIPE_PIPE,
    C99TokenType.BANG, C99TokenType.AMP, C99TokenType.PIPE, C99TokenType.CARET,
    C99TokenType.TILDE, C99TokenType.LSHIFT, C99TokenType.RSHIFT, C99TokenType.EQ,
    C99TokenType.PLUS_EQ, C99TokenType.MINUS_EQ, C99TokenType.STAR_EQ, C99TokenType.SLASH_EQ,
    C99TokenType.PERCENT_EQ, C99TokenType.AMP_EQ, C99TokenType.PIPE_EQ, C99TokenType.CARET_EQ,
    C99TokenType.LSHIFT_EQ, C99TokenType.RSHIFT_EQ, C99TokenType.DOT, C99TokenType.ARROW,
    C99TokenType.QUESTION, C99TokenType.COLON
  ]
  return operatorTypes.includes(token.type)
}

// Helper function to check if a token is a literal
export function isLiteral(token: C99Token): boolean {
  return [
    C99TokenType.INTEGER_LITERAL,
    C99TokenType.FLOAT_LITERAL,
    C99TokenType.STRING_LITERAL,
    C99TokenType.CHARACTER_LITERAL
  ].includes(token.type)
}

// Export for testing
export function tokenizeExpression(expr: string): C99Token[] {
  return c99Tokenizer(expr)
}
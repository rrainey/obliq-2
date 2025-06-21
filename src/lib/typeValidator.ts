// lib/typeValidator.ts

/**
 * Supported base data types in the system
 */
export const SUPPORTED_BASE_TYPES = ['float', 'double', 'long', 'bool'] as const
export type BaseType = typeof SUPPORTED_BASE_TYPES[number]

/**
 * Represents a parsed data type
 */
export interface ParsedType {
  baseType: BaseType
  isArray: boolean
  arraySize?: number
  isMatrix?: boolean  // New field for matrices
  rows?: number       // New field for matrix rows
  cols?: number       // New field for matrix columns
}

/**
 * Validates if a string is a valid C-style type syntax
 * @param typeString - The type string to validate (e.g., "double", "float[3]")
 * @returns true if valid, false otherwise
 */
export function isValidType(typeString: string): boolean {
  try {
    parseType(typeString)
    return true
  } catch {
    return false
  }
}

/**
 * Parses a C-style type string into its components
 * @param typeString - The type string to parse
 * @returns ParsedType object with base type and array/matrix information
 * @throws Error if the type string is invalid
 */
export function parseType(typeString: string): ParsedType {
  if (!typeString || typeof typeString !== 'string') {
    throw new Error('Type string must be a non-empty string')
  }

  const trimmed = typeString.trim()
  
  // Check for 2D matrix syntax first (e.g., double[3][4])
  const matrixMatch = trimmed.match(/^(float|double|long|bool)\[(\d+)\]\[(\d+)\]$/)
  
  if (matrixMatch) {
    const baseType = matrixMatch[1] as BaseType
    const rows = parseInt(matrixMatch[2], 10)
    const cols = parseInt(matrixMatch[3], 10)
    
    if (rows <= 0 || cols <= 0) {
      throw new Error('Matrix dimensions must be positive integers')
    }
    
    return {
      baseType,
      isArray: false,  // We distinguish between 1D arrays and 2D matrices
      isMatrix: true,
      rows,
      cols
    }
  }
  
  // Check for 1D array syntax (e.g., float[3])
  const arrayMatch = trimmed.match(/^(float|double|long|bool)\[(\d+)\]$/)
  
  if (arrayMatch) {
    const baseType = arrayMatch[1] as BaseType
    const arraySize = parseInt(arrayMatch[2], 10)
    
    if (arraySize <= 0) {
      throw new Error('Array size must be a positive integer')
    }
    
    return {
      baseType,
      isArray: true,
      arraySize,
      isMatrix: false
    }
  }
  
  // Check for scalar type
  if (SUPPORTED_BASE_TYPES.includes(trimmed as BaseType)) {
    return {
      baseType: trimmed as BaseType,
      isArray: false,
      isMatrix: false
    }
  }
  
  throw new Error(`Invalid type: "${typeString}". Supported types are: ${SUPPORTED_BASE_TYPES.join(', ')}, their 1D arrays (e.g., float[3]), and 2D matrices (e.g., double[3][4])`)
}

/**
 * Gets a human-readable description of the validation error
 * @param typeString - The invalid type string
 * @returns Error message string
 */
export function getTypeValidationError(typeString: string): string {
  try {
    parseType(typeString)
    return '' // No error
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid type syntax'
  }
}

/**
 * Checks if two types are compatible for connection
 * @param sourceType - The source signal type
 * @param targetType - The target signal type
 * @returns true if types are compatible, false otherwise
 */
export function areTypesCompatible(sourceType: string, targetType: string): boolean {
  try {
    const source = parseType(sourceType)
    const target = parseType(targetType)
    
    // For matrices, dimensions must match exactly
    if (source.isMatrix && target.isMatrix) {
      return source.baseType === target.baseType &&
             source.rows === target.rows &&
             source.cols === target.cols
    }
    
    // Cannot connect matrix to non-matrix or vice versa
    if (source.isMatrix !== target.isMatrix) {
      return false
    }
    
    // For arrays, existing logic applies
    if (source.isArray && target.isArray) {
      return source.baseType === target.baseType &&
             source.arraySize === target.arraySize
    }
    
    // For scalars
    if (!source.isArray && !target.isArray && !source.isMatrix && !target.isMatrix) {
      return source.baseType === target.baseType
    }
    
    // Array to scalar or vice versa is not compatible
    return false
  } catch {
    // If either type is invalid, they're not compatible
    return false
  }
}

/**
 * Gets a detailed compatibility error message for two types
 * @param sourceType - The source signal type
 * @param targetType - The target signal type
 * @returns Error message explaining why types are incompatible, or empty string if compatible
 */
export function getTypeCompatibilityError(sourceType: string, targetType: string): string {
  try {
    const source = parseType(sourceType)
    const target = parseType(targetType)
    
    // Check matrix compatibility
    if (source.isMatrix && target.isMatrix) {
      if (source.baseType !== target.baseType) {
        return `Cannot connect ${source.baseType} matrix to ${target.baseType} matrix`
      }
      if (source.rows !== target.rows || source.cols !== target.cols) {
        return `Cannot connect ${source.rows}×${source.cols} matrix to ${target.rows}×${target.cols} matrix - dimensions must match exactly`
      }
      return '' // Compatible
    }
    
    // Check matrix to non-matrix
    if (source.isMatrix && !target.isMatrix) {
      if (target.isArray) {
        return `Cannot connect ${source.rows}×${source.cols} matrix to 1D array[${target.arraySize}]`
      }
      return `Cannot connect ${source.rows}×${source.cols} matrix to scalar ${target.baseType}`
    }
    
    if (!source.isMatrix && target.isMatrix) {
      if (source.isArray) {
        return `Cannot connect 1D array[${source.arraySize}] to ${target.rows}×${target.cols} matrix`
      }
      return `Cannot connect scalar ${source.baseType} to ${target.rows}×${target.cols} matrix`
    }
    
    // Check array compatibility
    if (source.isArray && target.isArray) {
      if (source.baseType !== target.baseType) {
        return `Cannot connect ${source.baseType}[${source.arraySize}] to ${target.baseType}[${target.arraySize}] - base types must match`
      }
      if (source.arraySize !== target.arraySize) {
        return `Cannot connect array[${source.arraySize}] to array[${target.arraySize}] - sizes must match`
      }
      return '' // Compatible
    }
    
    // Check array to scalar
    if (source.isArray && !target.isArray) {
      return `Cannot connect array[${source.arraySize}] to scalar ${target.baseType}`
    }
    
    if (!source.isArray && target.isArray) {
      return `Cannot connect scalar ${source.baseType} to array[${target.arraySize}]`
    }
    
    // Check scalar compatibility
    if (source.baseType !== target.baseType) {
      return `Cannot connect ${source.baseType} to ${target.baseType} - types must match`
    }
    
    return '' // Compatible
  } catch (error) {
    return `Invalid type specification: ${error instanceof Error ? error.message : 'Unknown error'}`
  }
}

/**
 * Gets a human-readable string representation of a parsed type
 * @param parsedType - The parsed type object
 * @returns String representation
 */
export function typeToString(parsedType: ParsedType): string {
  if (parsedType.isMatrix && parsedType.rows !== undefined && parsedType.cols !== undefined) {
    return `${parsedType.baseType}[${parsedType.rows}][${parsedType.cols}]`
  }
  if (parsedType.isArray && parsedType.arraySize !== undefined) {
    return `${parsedType.baseType}[${parsedType.arraySize}]`
  }
  return parsedType.baseType
}

/**
 * Validates a type string and returns a normalized version
 * @param typeString - The type string to normalize
 * @returns Normalized type string
 * @throws Error if the type is invalid
 */
export function normalizeType(typeString: string): string {
  const parsed = parseType(typeString)
  return typeToString(parsed)
}

/**
 * Gets the default value for a given type
 * @param typeString - The type string
 * @returns Default value (0 for numeric types, false for bool, array of zeros for arrays, 2D array for matrices)
 */
export function getDefaultValue(typeString: string): number | boolean | number[] | boolean[] | number[][] | boolean[][] {
  try {
    const parsed = parseType(typeString)
    
    if (parsed.isMatrix && parsed.rows && parsed.cols) {
      switch (parsed.baseType) {
        case 'bool':
          return Array(parsed.rows).fill(null).map(() => Array(parsed.cols).fill(false))
        case 'long':
          return Array(parsed.rows).fill(null).map(() => Array(parsed.cols).fill(0))
        case 'float':
        case 'double':
          return Array(parsed.rows).fill(null).map(() => Array(parsed.cols).fill(0.0))
        default:
          return Array(parsed.rows).fill(null).map(() => Array(parsed.cols).fill(0))
      }
    }
    
    if (parsed.isArray && parsed.arraySize) {
      switch (parsed.baseType) {
        case 'bool':
          return new Array(parsed.arraySize).fill(false)
        case 'long':
          return new Array(parsed.arraySize).fill(0)
        case 'float':
        case 'double':
          return new Array(parsed.arraySize).fill(0.0)
        default:
          return new Array(parsed.arraySize).fill(0)
      }
    }
    
    switch (parsed.baseType) {
      case 'bool':
        return false
      case 'long':
        return 0
      case 'float':
      case 'double':
        return 0.0
      default:
        return 0
    }
  } catch {
    // Return 0 as a safe default for invalid types
    return 0
  }
}

/**
 * Creates a matrix filled with a specific value
 * @param rows - Number of rows
 * @param cols - Number of columns
 * @param fillValue - Value to fill the matrix with
 * @returns 2D array filled with the specified value
 */
export function createMatrix(rows: number, cols: number, fillValue: number | boolean): (number | boolean)[][] {
  return Array(rows).fill(null).map(() => Array(cols).fill(fillValue))
}

/**
 * Creates an identity matrix of the specified size
 * @param size - Size of the square identity matrix
 * @param baseType - Base type for the matrix elements
 * @returns Identity matrix
 */
export function createIdentityMatrix(size: number, baseType: BaseType = 'double'): number[][] {
  const matrix: number[][] = Array(size).fill(null).map(() => Array(size).fill(0))
  for (let i = 0; i < size; i++) {
    matrix[i][i] = 1
  }
  return matrix
}

/**
 * Checks if a value is valid for a given type
 * @param value - The value to check
 * @param typeString - The expected type
 * @returns true if the value matches the type, false otherwise
 */
export function isValidValue(value: any, typeString: string): boolean {
  try {
    const parsed = parseType(typeString)
    
    if (parsed.isMatrix) {
      if (!Array.isArray(value)) return false
      if (value.length !== parsed.rows) return false
      
      // Check each row
      return value.every(row => {
        if (!Array.isArray(row)) return false
        if (row.length !== parsed.cols) return false
        
        // Check each element in the row
        return row.every(element => {
          switch (parsed.baseType) {
            case 'bool':
              return typeof element === 'boolean'
            case 'long':
              return Number.isInteger(element)
            default:
              return typeof element === 'number' && !isNaN(element)
          }
        })
      })
    }
    
    if (parsed.isArray) {
      if (!Array.isArray(value)) return false
      if (value.length !== parsed.arraySize) return false
      
      // Check each element
      return value.every(element => {
        switch (parsed.baseType) {
          case 'bool':
            return typeof element === 'boolean'
          case 'long':
            return Number.isInteger(element)
          default:
            return typeof element === 'number' && !isNaN(element)
        }
      })
    }
    
    // Scalar type
    switch (parsed.baseType) {
      case 'bool':
        return typeof value === 'boolean'
      case 'long':
        return Number.isInteger(value)
      default:
        return typeof value === 'number' && !isNaN(value)
    }
  } catch {
    return false
  }
}

/**
 * Gets a detailed validation error for a value against a type
 * @param value - The value to validate
 * @param typeString - The expected type
 * @returns Error message if invalid, empty string if valid
 */
export function getValueValidationError(value: any, typeString: string): string {
  try {
    const parsed = parseType(typeString)
    
    if (parsed.isMatrix) {
      if (!Array.isArray(value)) {
        return `Expected ${parsed.rows}×${parsed.cols} matrix but got ${typeof value}`
      }
      if (value.length !== parsed.rows) {
        return `Expected ${parsed.rows} rows but got ${value.length}`
      }
      
      // Check each row
      for (let i = 0; i < value.length; i++) {
        const row = value[i]
        if (!Array.isArray(row)) {
          return `Row ${i + 1} is not an array`
        }
        if (row.length !== parsed.cols) {
          return `Row ${i + 1} has ${row.length} columns but expected ${parsed.cols}`
        }
        
        // Check each element
        for (let j = 0; j < row.length; j++) {
          const element = row[j]
          switch (parsed.baseType) {
            case 'bool':
              if (typeof element !== 'boolean') {
                return `Element at [${i + 1}][${j + 1}] must be boolean but got ${typeof element}`
              }
              break
            case 'long':
              if (!Number.isInteger(element)) {
                return `Element at [${i + 1}][${j + 1}] must be integer but got ${element}`
              }
              break
            default:
              if (typeof element !== 'number' || isNaN(element)) {
                return `Element at [${i + 1}][${j + 1}] must be number but got ${element}`
              }
          }
        }
      }
      return '' // Valid
    }
    
    if (parsed.isArray) {
      if (!Array.isArray(value)) {
        return `Expected array[${parsed.arraySize}] but got ${typeof value}`
      }
      if (value.length !== parsed.arraySize) {
        return `Expected array of size ${parsed.arraySize} but got ${value.length}`
      }
      
      // Check each element
      for (let i = 0; i < value.length; i++) {
        const element = value[i]
        switch (parsed.baseType) {
          case 'bool':
            if (typeof element !== 'boolean') {
              return `Element at index ${i} must be boolean but got ${typeof element}`
            }
            break
          case 'long':
            if (!Number.isInteger(element)) {
              return `Element at index ${i} must be integer but got ${element}`
            }
            break
          default:
            if (typeof element !== 'number' || isNaN(element)) {
              return `Element at index ${i} must be number but got ${element}`
            }
        }
      }
      return '' // Valid
    }
    
    // Scalar validation
    switch (parsed.baseType) {
      case 'bool':
        if (typeof value !== 'boolean') {
          return `Expected boolean but got ${typeof value}`
        }
        break
      case 'long':
        if (!Number.isInteger(value)) {
          return `Expected integer but got ${value}`
        }
        break
      default:
        if (typeof value !== 'number' || isNaN(value)) {
          return `Expected number but got ${typeof value}`
        }
    }
    
    return '' // Valid
  } catch (error) {
    return `Type validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
  }
}

/**
 * Validates matrix dimensions
 * @param matrix - The matrix to validate
 * @returns Object with isValid flag and error message if invalid
 */
export function validateMatrixStructure(matrix: any): { isValid: boolean; error?: string } {
  if (!Array.isArray(matrix)) {
    return { isValid: false, error: 'Matrix must be an array' }
  }
  
  if (matrix.length === 0) {
    return { isValid: false, error: 'Matrix cannot be empty' }
  }
  
  const firstRowLength = Array.isArray(matrix[0]) ? matrix[0].length : -1
  if (firstRowLength === -1) {
    return { isValid: false, error: 'First row is not an array' }
  }
  
  for (let i = 0; i < matrix.length; i++) {
    if (!Array.isArray(matrix[i])) {
      return { isValid: false, error: `Row ${i + 1} is not an array` }
    }
    if (matrix[i].length !== firstRowLength) {
      return { isValid: false, error: `Row ${i + 1} has ${matrix[i].length} columns but row 1 has ${firstRowLength}` }
    }
  }
  
  return { isValid: true }
}

/**
 * Helper function to check if a type represents a matrix
 * @param typeString - The type string to check
 * @returns true if the type is a matrix, false otherwise
 */
export function isMatrixType(typeString: string): boolean {
  try {
    const parsed = parseType(typeString)
    return parsed.isMatrix === true
  } catch {
    return false
  }
}

/**
 * Helper function to get matrix dimensions from a type string
 * @param typeString - The type string
 * @returns Object with rows and cols, or null if not a matrix
 */
export function getMatrixDimensions(typeString: string): { rows: number, cols: number } | null {
  try {
    const parsed = parseType(typeString)
    if (parsed.isMatrix && parsed.rows && parsed.cols) {
      return { rows: parsed.rows, cols: parsed.cols }
    }
    return null
  } catch {
    return null
  }
}
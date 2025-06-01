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
 * @returns ParsedType object with base type and array information
 * @throws Error if the type string is invalid
 */
export function parseType(typeString: string): ParsedType {
  if (!typeString || typeof typeString !== 'string') {
    throw new Error('Type string must be a non-empty string')
  }

  const trimmed = typeString.trim()
  
  // Check for array syntax
  const arrayMatch = trimmed.match(/^(float|double|long|bool)\[(\-*\d+)\]$/)
  
  if (arrayMatch) {
    const baseType = arrayMatch[1] as BaseType
    const arraySize = parseInt(arrayMatch[2], 10)
    
    if (arraySize <= 0) {
      throw new Error('Array size must be a positive integer')
    }
    
    return {
      baseType,
      isArray: true,
      arraySize
    }
  }
  
  // Check for scalar type
  if (SUPPORTED_BASE_TYPES.includes(trimmed as BaseType)) {
    return {
      baseType: trimmed as BaseType,
      isArray: false
    }
  }
  
  throw new Error(`Invalid type: "${typeString}". Supported types are: ${SUPPORTED_BASE_TYPES.join(', ')} and their 1D arrays (e.g., float[3])`)
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
    
    // Exact match required for now
    // In the future, we might allow some implicit conversions
    return source.baseType === target.baseType &&
           source.isArray === target.isArray &&
           source.arraySize === target.arraySize
  } catch {
    // If either type is invalid, they're not compatible
    return false
  }
}

/**
 * Gets a human-readable string representation of a parsed type
 * @param parsedType - The parsed type object
 * @returns String representation
 */
export function typeToString(parsedType: ParsedType): string {
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
 * @returns Default value (0 for numeric types, false for bool, array of zeros for arrays)
 */
export function getDefaultValue(typeString: string): number | boolean | number[] | boolean[] {
  try {
    const parsed = parseType(typeString)
    
    if (parsed.isArray && parsed.arraySize) {
      switch (parsed.baseType) {
        case 'bool':
          return new Array(parsed.arraySize).fill(false)
        default:
          return new Array(parsed.arraySize).fill(0)
      }
    }
    
    switch (parsed.baseType) {
      case 'bool':
        return false
      default:
        return 0
    }
  } catch {
    // Return 0 as a safe default for invalid types
    return 0
  }
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
// lib/__tests__/typeValidator.test.ts

import {
  parseType,
  isValidType,
  areTypesCompatible,
  typeToString,
  normalizeType,
  getDefaultValue,
  isValidValue,
  getTypeValidationError,
  SUPPORTED_BASE_TYPES
} from '@/lib/typeValidator'

describe('typeValidator', () => {
  describe('parseType', () => {
    it('should parse scalar types correctly', () => {
      expect(parseType('float')).toEqual({ baseType: 'float', isArray: false })
      expect(parseType('double')).toEqual({ baseType: 'double', isArray: false })
      expect(parseType('long')).toEqual({ baseType: 'long', isArray: false })
      expect(parseType('bool')).toEqual({ baseType: 'bool', isArray: false })
    })

    it('should parse array types correctly', () => {
      expect(parseType('float[3]')).toEqual({ baseType: 'float', isArray: true, arraySize: 3 })
      expect(parseType('double[10]')).toEqual({ baseType: 'double', isArray: true, arraySize: 10 })
      expect(parseType('bool[2]')).toEqual({ baseType: 'bool', isArray: true, arraySize: 2 })
    })

    it('should handle whitespace', () => {
      expect(parseType(' float ')).toEqual({ baseType: 'float', isArray: false })
      expect(parseType(' double[5] ')).toEqual({ baseType: 'double', isArray: true, arraySize: 5 })
    })

    it('should throw on invalid types', () => {
      expect(() => parseType('invalid')).toThrow('Invalid type')
      expect(() => parseType('float[]')).toThrow() // Missing array size
      expect(() => parseType('float[0]')).toThrow('Array size must be a positive integer')
      expect(() => parseType('float[-1]')).toThrow('Array size must be a positive integer')
      expect(() => parseType('float[abc]')).toThrow()
      expect(() => parseType('')).toThrow('Type string must be a non-empty string')
      expect(() => parseType(null as any)).toThrow('Type string must be a non-empty string')
    })

    it('should reject multi-dimensional arrays', () => {
      expect(() => parseType('float[3][3]')).toThrow()
      expect(() => parseType('double[][]')).toThrow()
    })
  })

  describe('isValidType', () => {
    it('should return true for valid types', () => {
      expect(isValidType('float')).toBe(true)
      expect(isValidType('double[5]')).toBe(true)
      expect(isValidType('bool')).toBe(true)
      expect(isValidType('long[100]')).toBe(true)
    })

    it('should return false for invalid types', () => {
      expect(isValidType('invalid')).toBe(false)
      expect(isValidType('float[]')).toBe(false)
      expect(isValidType('')).toBe(false)
      expect(isValidType('int')).toBe(false) // Not supported
    })
  })

  describe('areTypesCompatible', () => {
    it('should match identical scalar types', () => {
      expect(areTypesCompatible('float', 'float')).toBe(true)
      expect(areTypesCompatible('double', 'double')).toBe(true)
      expect(areTypesCompatible('bool', 'bool')).toBe(true)
    })

    it('should match identical array types', () => {
      expect(areTypesCompatible('float[3]', 'float[3]')).toBe(true)
      expect(areTypesCompatible('double[10]', 'double[10]')).toBe(true)
    })

    it('should not match different base types', () => {
      expect(areTypesCompatible('float', 'double')).toBe(false)
      expect(areTypesCompatible('float[3]', 'double[3]')).toBe(false)
      expect(areTypesCompatible('bool', 'long')).toBe(false)
    })

    it('should not match scalar vs array', () => {
      expect(areTypesCompatible('float', 'float[3]')).toBe(false)
      expect(areTypesCompatible('double[5]', 'double')).toBe(false)
    })

    it('should not match arrays of different sizes', () => {
      expect(areTypesCompatible('float[3]', 'float[4]')).toBe(false)
      expect(areTypesCompatible('double[10]', 'double[5]')).toBe(false)
    })

    it('should handle invalid types gracefully', () => {
      expect(areTypesCompatible('invalid', 'float')).toBe(false)
      expect(areTypesCompatible('float', 'invalid')).toBe(false)
      expect(areTypesCompatible('invalid1', 'invalid2')).toBe(false)
    })
  })

  describe('typeToString', () => {
    it('should format scalar types', () => {
      expect(typeToString({ baseType: 'float', isArray: false })).toBe('float')
      expect(typeToString({ baseType: 'double', isArray: false })).toBe('double')
    })

    it('should format array types', () => {
      expect(typeToString({ baseType: 'float', isArray: true, arraySize: 3 })).toBe('float[3]')
      expect(typeToString({ baseType: 'bool', isArray: true, arraySize: 10 })).toBe('bool[10]')
    })
  })

  describe('normalizeType', () => {
    it('should normalize valid types', () => {
      expect(normalizeType(' float ')).toBe('float')
      expect(normalizeType(' double[5] ')).toBe('double[5]')
      expect(normalizeType('bool')).toBe('bool')
    })

    it('should throw on invalid types', () => {
      expect(() => normalizeType('invalid')).toThrow()
      expect(() => normalizeType('')).toThrow()
    })
  })

  describe('getDefaultValue', () => {
    it('should return correct defaults for scalar types', () => {
      expect(getDefaultValue('float')).toBe(0)
      expect(getDefaultValue('double')).toBe(0)
      expect(getDefaultValue('long')).toBe(0)
      expect(getDefaultValue('bool')).toBe(false)
    })

    it('should return correct defaults for array types', () => {
      expect(getDefaultValue('float[3]')).toEqual([0, 0, 0])
      expect(getDefaultValue('bool[2]')).toEqual([false, false])
      expect(getDefaultValue('double[4]')).toEqual([0, 0, 0, 0])
    })

    it('should return 0 for invalid types', () => {
      expect(getDefaultValue('invalid')).toBe(0)
      expect(getDefaultValue('')).toBe(0)
    })
  })

  describe('isValidValue', () => {
    it('should validate scalar values', () => {
      expect(isValidValue(1.5, 'float')).toBe(true)
      expect(isValidValue(3.14159, 'double')).toBe(true)
      expect(isValidValue(42, 'long')).toBe(true)
      expect(isValidValue(true, 'bool')).toBe(true)
      expect(isValidValue(false, 'bool')).toBe(true)
    })

    it('should reject wrong scalar types', () => {
      expect(isValidValue('string', 'float')).toBe(false)
      expect(isValidValue(true, 'double')).toBe(false)
      expect(isValidValue(3.14, 'bool')).toBe(false)
      expect(isValidValue(3.14, 'long')).toBe(false) // Not integer
    })

    it('should validate array values', () => {
      expect(isValidValue([1, 2, 3], 'float[3]')).toBe(true)
      expect(isValidValue([true, false], 'bool[2]')).toBe(true)
      expect(isValidValue([1.1, 2.2, 3.3, 4.4], 'double[4]')).toBe(true)
    })

    it('should reject invalid array values', () => {
      expect(isValidValue([1, 2], 'float[3]')).toBe(false) // Wrong size
      expect(isValidValue([1, 2, 3, 4], 'float[3]')).toBe(false) // Wrong size
      expect(isValidValue(123, 'float[3]')).toBe(false) // Not array
      expect(isValidValue([1, 'two', 3], 'float[3]')).toBe(false) // Wrong element type
      expect(isValidValue([true, 1], 'bool[2]')).toBe(false) // Mixed types
    })

    it('should handle NaN correctly', () => {
      expect(isValidValue(NaN, 'float')).toBe(false)
      expect(isValidValue([1, NaN, 3], 'float[3]')).toBe(false)
    })
  })

  describe('getTypeValidationError', () => {
    it('should return empty string for valid types', () => {
      expect(getTypeValidationError('float')).toBe('')
      expect(getTypeValidationError('double[5]')).toBe('')
    })

    it('should return error messages for invalid types', () => {
      expect(getTypeValidationError('invalid')).toContain('Invalid type')
      expect(getTypeValidationError('float[]')).toContain('Invalid type')
      expect(getTypeValidationError('')).toContain('non-empty string')
    })
  })

  describe('edge cases', () => {
    it('should handle large array sizes', () => {
      expect(parseType('float[1000]')).toEqual({ baseType: 'float', isArray: true, arraySize: 1000 })
      expect(getDefaultValue('double[100]')).toHaveLength(100)
    })

    it('should handle all supported base types', () => {
      for (const baseType of SUPPORTED_BASE_TYPES) {
        expect(isValidType(baseType)).toBe(true)
        expect(isValidType(`${baseType}[5]`)).toBe(true)
      }
    })
  })
})
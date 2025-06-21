// __tests__/typeValidator.test.ts

import {
  parseType,
  isValidType,
  areTypesCompatible,
  getTypeCompatibilityError,
  typeToString,
  getDefaultValue,
  isValidValue,
  getValueValidationError,
  isMatrixType,
  getMatrixDimensions,
  createMatrix,
  createIdentityMatrix,
  validateMatrixStructure
} from '../src/lib/typeValidator';

describe('Matrix Type Support', () => {
  describe('parseType', () => {
    it('should parse scalar types', () => {
      expect(parseType('double')).toEqual({
        baseType: 'double',
        isArray: false,
        isMatrix: false
      })
    })

    it('should parse 1D array types', () => {
      expect(parseType('float[3]')).toEqual({
        baseType: 'float',
        isArray: true,
        arraySize: 3,
        isMatrix: false
      })
    })

    it('should parse 2D matrix types', () => {
      expect(parseType('double[3][4]')).toEqual({
        baseType: 'double',
        isArray: false,
        isMatrix: true,
        rows: 3,
        cols: 4
      })
    })

    it('should reject invalid matrix dimensions', () => {
      expect(() => parseType('double[0][4]')).toThrow('Matrix dimensions must be positive integers')
      expect(() => parseType('double[3][0]')).toThrow('Matrix dimensions must be positive integers')
      expect(() => parseType('double[-1][4]')).toThrow()
    })

    it('should reject invalid syntax', () => {
      expect(() => parseType('double[][]')).toThrow()
      expect(() => parseType('double[3][4][5]')).toThrow()
      expect(() => parseType('matrix[3][4]')).toThrow()
    })
  })

  describe('isValidType', () => {
    it('should validate matrix types', () => {
      expect(isValidType('double[3][4]')).toBe(true)
      expect(isValidType('float[2][2]')).toBe(true)
      expect(isValidType('bool[10][5]')).toBe(true)
      expect(isValidType('long[1][1]')).toBe(true)
    })

    it('should reject invalid matrix types', () => {
      expect(isValidType('double[][]')).toBe(false)
      expect(isValidType('float[0][4]')).toBe(false)
      expect(isValidType('int[3][4]')).toBe(false)
    })
  })

  describe('areTypesCompatible', () => {
    it('should check matrix dimension compatibility', () => {
      expect(areTypesCompatible('double[3][4]', 'double[3][4]')).toBe(true)
      expect(areTypesCompatible('double[3][4]', 'double[4][3]')).toBe(false)
      expect(areTypesCompatible('double[3][4]', 'float[3][4]')).toBe(false)
    })

    it('should prevent matrix to non-matrix connections', () => {
      expect(areTypesCompatible('double[3][4]', 'double')).toBe(false)
      expect(areTypesCompatible('double[3][4]', 'double[12]')).toBe(false)
      expect(areTypesCompatible('double', 'double[3][4]')).toBe(false)
    })
  })

  describe('getTypeCompatibilityError', () => {
    it('should provide detailed matrix incompatibility messages', () => {
      expect(getTypeCompatibilityError('double[3][4]', 'double[4][3]'))
        .toBe('Cannot connect 3×4 matrix to 4×3 matrix - dimensions must match exactly')
      
      expect(getTypeCompatibilityError('float[2][2]', 'double[2][2]'))
        .toBe('Cannot connect float matrix to double matrix')
      
      expect(getTypeCompatibilityError('double[3][4]', 'double[12]'))
        .toBe('Cannot connect 3×4 matrix to 1D array[12]')
    })
  })

  describe('typeToString', () => {
    it('should format matrix types correctly', () => {
      expect(typeToString({
        baseType: 'double',
        isArray: false,
        isMatrix: true,
        rows: 3,
        cols: 4
      })).toBe('double[3][4]')
    })
  })

  describe('getDefaultValue', () => {
    it('should create zero-filled matrices', () => {
      const matrix = getDefaultValue('double[2][3]')
      expect(matrix).toEqual([[0, 0, 0], [0, 0, 0]])
    })

    it('should create boolean matrices', () => {
      const matrix = getDefaultValue('bool[2][2]')
      expect(matrix).toEqual([[false, false], [false, false]])
    })
  })

  describe('isValidValue', () => {
    it('should validate matrix values', () => {
      expect(isValidValue([[1, 2], [3, 4]], 'double[2][2]')).toBe(true)
      expect(isValidValue([[1, 2, 3], [4, 5, 6]], 'double[2][3]')).toBe(true)
      expect(isValidValue([[true, false], [false, true]], 'bool[2][2]')).toBe(true)
    })

    it('should reject invalid matrix values', () => {
      expect(isValidValue([[1, 2], [3]], 'double[2][2]')).toBe(false)
      expect(isValidValue([1, 2, 3, 4], 'double[2][2]')).toBe(false)
      expect(isValidValue([[1, 2], [3, 4], [5, 6]], 'double[2][2]')).toBe(false)
    })
  })

  describe('helper functions', () => {
    it('should identify matrix types', () => {
      expect(isMatrixType('double[3][4]')).toBe(true)
      expect(isMatrixType('double[3]')).toBe(false)
      expect(isMatrixType('double')).toBe(false)
    })

    it('should extract matrix dimensions', () => {
      expect(getMatrixDimensions('double[3][4]')).toEqual({ rows: 3, cols: 4 })
      expect(getMatrixDimensions('double[3]')).toBeNull()
      expect(getMatrixDimensions('invalid')).toBeNull()
    })

    it('should create matrices', () => {
      expect(createMatrix(2, 3, 5)).toEqual([[5, 5, 5], [5, 5, 5]])
      expect(createIdentityMatrix(3)).toEqual([
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ])
    })

    it('should validate matrix structure', () => {
      expect(validateMatrixStructure([[1, 2], [3, 4]]).isValid).toBe(true)
      expect(validateMatrixStructure([[1, 2], [3]]).isValid).toBe(false)
      expect(validateMatrixStructure([]).isValid).toBe(false)
    })
  })
})
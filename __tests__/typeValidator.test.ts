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
  validateMatrixStructure,
  isColumnMatrix,
  isRowMatrix,
  normalizeColumnMatrixToVector,
  getEffectiveDimensions
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

describe('Vector/Matrix Equivalence', () => {
  describe('isColumnMatrix', () => {
    it('should identify column matrices [N][1]', () => {
      expect(isColumnMatrix('double[3][1]')).toBe(true)
      expect(isColumnMatrix('float[4][1]')).toBe(true)
      expect(isColumnMatrix('long[1][1]')).toBe(true)
    })

    it('should not match non-column-matrices', () => {
      expect(isColumnMatrix('double[3]')).toBe(false)       // vector
      expect(isColumnMatrix('double[3][4]')).toBe(false)    // general matrix
      expect(isColumnMatrix('double[1][3]')).toBe(false)    // row matrix
      expect(isColumnMatrix('double')).toBe(false)          // scalar
    })

    it('should handle invalid types gracefully', () => {
      expect(isColumnMatrix('invalid')).toBe(false)
      expect(isColumnMatrix('')).toBe(false)
    })
  })

  describe('isRowMatrix', () => {
    it('should identify row matrices [1][N]', () => {
      expect(isRowMatrix('double[1][3]')).toBe(true)
      expect(isRowMatrix('float[1][4]')).toBe(true)
      expect(isRowMatrix('long[1][1]')).toBe(true)
    })

    it('should not match non-row-matrices', () => {
      expect(isRowMatrix('double[3]')).toBe(false)       // vector
      expect(isRowMatrix('double[3][4]')).toBe(false)    // general matrix
      expect(isRowMatrix('double[3][1]')).toBe(false)    // column matrix
      expect(isRowMatrix('double')).toBe(false)          // scalar
    })

    it('should handle invalid types gracefully', () => {
      expect(isRowMatrix('invalid')).toBe(false)
      expect(isRowMatrix('')).toBe(false)
    })
  })

  describe('normalizeColumnMatrixToVector', () => {
    it('should convert column matrix [N][1] to vector [N]', () => {
      expect(normalizeColumnMatrixToVector('double[3][1]')).toBe('double[3]')
      expect(normalizeColumnMatrixToVector('float[4][1]')).toBe('float[4]')
      expect(normalizeColumnMatrixToVector('long[1][1]')).toBe('long[1]')
    })

    it('should leave non-column-matrices unchanged', () => {
      expect(normalizeColumnMatrixToVector('double[3]')).toBe('double[3]')
      expect(normalizeColumnMatrixToVector('double[3][4]')).toBe('double[3][4]')
      expect(normalizeColumnMatrixToVector('double[1][3]')).toBe('double[1][3]')
      expect(normalizeColumnMatrixToVector('double')).toBe('double')
    })

    it('should handle invalid types gracefully', () => {
      expect(normalizeColumnMatrixToVector('invalid')).toBe('invalid')
    })
  })

  describe('getEffectiveDimensions', () => {
    it('should treat vectors as column vectors [N×1]', () => {
      expect(getEffectiveDimensions('double[3]')).toEqual({ rows: 3, cols: 1 })
      expect(getEffectiveDimensions('float[4]')).toEqual({ rows: 4, cols: 1 })
    })

    it('should return matrix dimensions unchanged', () => {
      expect(getEffectiveDimensions('double[3][4]')).toEqual({ rows: 3, cols: 4 })
      expect(getEffectiveDimensions('float[2][2]')).toEqual({ rows: 2, cols: 2 })
      expect(getEffectiveDimensions('double[3][1]')).toEqual({ rows: 3, cols: 1 })
      expect(getEffectiveDimensions('double[1][3]')).toEqual({ rows: 1, cols: 3 })
    })

    it('should treat scalars as 1×1', () => {
      expect(getEffectiveDimensions('double')).toEqual({ rows: 1, cols: 1 })
      expect(getEffectiveDimensions('float')).toEqual({ rows: 1, cols: 1 })
    })

    it('should return null for invalid types', () => {
      expect(getEffectiveDimensions('invalid')).toBeNull()
    })

    it('should show vector and column matrix equivalence', () => {
      // Vector [3] and column matrix [3][1] have same effective dimensions
      const vectorDims = getEffectiveDimensions('double[3]')
      const colMatrixDims = getEffectiveDimensions('double[3][1]')
      expect(vectorDims).toEqual(colMatrixDims)
    })
  })
})
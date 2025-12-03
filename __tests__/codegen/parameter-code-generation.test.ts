// __tests__/codegen/parameter-code-generation.test.ts

import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { ModelParameter } from '@/lib/modelSchema'

describe('Parameter Code Generation (Feature 3)', () => {
  describe('Scalar Parameters', () => {
    test('should generate #define for double scalar', () => {
      const parameters: ModelParameter[] = [
        {
          name: 'PI',
          signalType: 'double',
          value: 3.14159
        }
      ]

      const sheets = [
        {
          id: 'main',
          name: 'Main',
          blocks: [],
          connections: [],
          extents: { width: 1000, height: 800 }
        }
      ]

      const generator = new CodeGenerator({ modelName: 'test' })
      const result = generator.generate(sheets, parameters)

      expect(result.header).toContain('#define PI 3.14159')
    })

    test('should generate #define for float scalar with f suffix', () => {
      const parameters: ModelParameter[] = [
        {
          name: 'GAIN',
          signalType: 'float',
          value: 2.5
        }
      ]

      const sheets = [
        {
          id: 'main',
          name: 'Main',
          blocks: [],
          connections: [],
          extents: { width: 1000, height: 800 }
        }
      ]

      const generator = new CodeGenerator({ modelName: 'test' })
      const result = generator.generate(sheets, parameters)

      expect(result.header).toContain('#define GAIN 2.5f')
    })

    test('should generate #define for long scalar with L suffix', () => {
      const parameters: ModelParameter[] = [
        {
          name: 'MAX_COUNT',
          signalType: 'long',
          value: 1000
        }
      ]

      const sheets = [
        {
          id: 'main',
          name: 'Main',
          blocks: [],
          connections: [],
          extents: { width: 1000, height: 800 }
        }
      ]

      const generator = new CodeGenerator({ modelName: 'test' })
      const result = generator.generate(sheets, parameters)

      expect(result.header).toContain('#define MAX_COUNT 1000L')
    })

    test('should generate #define for bool scalar', () => {
      const parameters: ModelParameter[] = [
        {
          name: 'ENABLE_FEATURE',
          signalType: 'bool',
          value: 1
        }
      ]

      const sheets = [
        {
          id: 'main',
          name: 'Main',
          blocks: [],
          connections: [],
          extents: { width: 1000, height: 800 }
        }
      ]

      const generator = new CodeGenerator({ modelName: 'test' })
      const result = generator.generate(sheets, parameters)

      expect(result.header).toContain('#define ENABLE_FEATURE 1')
    })
  })

  describe('Vector Parameters', () => {
    test('should generate const array with size macro for double vector', () => {
      const parameters: ModelParameter[] = [
        {
          name: 'GAINS',
          signalType: 'double[3]',
          value: [1.0, 2.0, 3.0]
        }
      ]

      const sheets = [
        {
          id: 'main',
          name: 'Main',
          blocks: [],
          connections: [],
          extents: { width: 1000, height: 800 }
        }
      ]

      const generator = new CodeGenerator({ modelName: 'test' })
      const result = generator.generate(sheets, parameters)

      expect(result.header).toContain('#define GAINS_SIZE 3')
      expect(result.header).toContain('const double GAINS[GAINS_SIZE]')
      expect(result.header).toContain('{1, 2, 3}')
    })

    test('should generate const array for float vector with f suffix', () => {
      const parameters: ModelParameter[] = [
        {
          name: 'COEFFS',
          signalType: 'float[4]',
          value: [0.5, 1.5, 2.5, 3.5]
        }
      ]

      const sheets = [
        {
          id: 'main',
          name: 'Main',
          blocks: [],
          connections: [],
          extents: { width: 1000, height: 800 }
        }
      ]

      const generator = new CodeGenerator({ modelName: 'test' })
      const result = generator.generate(sheets, parameters)

      expect(result.header).toContain('#define COEFFS_SIZE 4')
      expect(result.header).toContain('const float COEFFS[COEFFS_SIZE]')
      expect(result.header).toContain('{0.5f, 1.5f, 2.5f, 3.5f}')
    })
  })

  describe('Matrix Parameters', () => {
    test('should generate const 2D array with row/col macros for double matrix', () => {
      const parameters: ModelParameter[] = [
        {
          name: 'MATRIX_A',
          signalType: 'double[2][3]',
          value: [
            [1.0, 2.0, 3.0],
            [4.0, 5.0, 6.0]
          ]
        }
      ]

      const sheets = [
        {
          id: 'main',
          name: 'Main',
          blocks: [],
          connections: [],
          extents: { width: 1000, height: 800 }
        }
      ]

      const generator = new CodeGenerator({ modelName: 'test' })
      const result = generator.generate(sheets, parameters)

      expect(result.header).toContain('#define MATRIX_A_ROWS 2')
      expect(result.header).toContain('#define MATRIX_A_COLS 3')
      expect(result.header).toContain('const double MATRIX_A[MATRIX_A_ROWS][MATRIX_A_COLS]')
      expect(result.header).toContain('{{1, 2, 3}, {4, 5, 6}}')
    })

    test('should generate const 2D array for float matrix with f suffix', () => {
      const parameters: ModelParameter[] = [
        {
          name: 'TRANSFORM',
          signalType: 'float[3][3]',
          value: [
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0, 0.0, 1.0]
          ]
        }
      ]

      const sheets = [
        {
          id: 'main',
          name: 'Main',
          blocks: [],
          connections: [],
          extents: { width: 1000, height: 800 }
        }
      ]

      const generator = new CodeGenerator({ modelName: 'test' })
      const result = generator.generate(sheets, parameters)

      expect(result.header).toContain('#define TRANSFORM_ROWS 3')
      expect(result.header).toContain('#define TRANSFORM_COLS 3')
      expect(result.header).toContain('const float TRANSFORM[TRANSFORM_ROWS][TRANSFORM_COLS]')
      expect(result.header).toContain('{1f, 0f, 0f}')
      expect(result.header).toContain('{0f, 1f, 0f}')
      expect(result.header).toContain('{0f, 0f, 1f}')
    })
  })

  describe('Multiple Parameters', () => {
    test('should generate code for mix of scalar, vector, and matrix parameters', () => {
      const parameters: ModelParameter[] = [
        {
          name: 'SAMPLE_RATE',
          signalType: 'double',
          value: 1000.0
        },
        {
          name: 'FILTER_COEFFS',
          signalType: 'float[5]',
          value: [0.1, 0.2, 0.3, 0.2, 0.1]
        },
        {
          name: 'GAIN_MATRIX',
          signalType: 'double[2][2]',
          value: [
            [1.5, 0.5],
            [0.5, 1.5]
          ]
        }
      ]

      const sheets = [
        {
          id: 'main',
          name: 'Main',
          blocks: [],
          connections: [],
          extents: { width: 1000, height: 800 }
        }
      ]

      const generator = new CodeGenerator({ modelName: 'test' })
      const result = generator.generate(sheets, parameters)

      // Scalar
      expect(result.header).toContain('#define SAMPLE_RATE 1000')

      // Vector
      expect(result.header).toContain('#define FILTER_COEFFS_SIZE 5')
      expect(result.header).toContain('const float FILTER_COEFFS[FILTER_COEFFS_SIZE]')

      // Matrix
      expect(result.header).toContain('#define GAIN_MATRIX_ROWS 2')
      expect(result.header).toContain('#define GAIN_MATRIX_COLS 2')
      expect(result.header).toContain('const double GAIN_MATRIX[GAIN_MATRIX_ROWS][GAIN_MATRIX_COLS]')
    })
  })

  describe('No Parameters', () => {
    test('should generate comment when no parameters defined', () => {
      const sheets = [
        {
          id: 'main',
          name: 'Main',
          blocks: [],
          connections: [],
          extents: { width: 1000, height: 800 }
        }
      ]

      const generator = new CodeGenerator({ modelName: 'test' })
      const result = generator.generate(sheets, [])

      expect(result.header).toContain('No model parameters defined')
    })
  })
})

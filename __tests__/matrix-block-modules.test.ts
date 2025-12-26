// __tests__/matrix-block-modules.test.ts
//
// Tests for vector/matrix equivalence in MatrixMultiply and Transpose blocks

import { TransposeBlockModule } from '@/lib/blocks/TransposeBlockModule'
import { MatrixMultiplyBlockModule } from '@/lib/blocks/MatrixMultiplyBlockModule'
import { BlockData } from '@/components/BlockNode'

describe('TransposeBlockModule', () => {
  const module = new TransposeBlockModule()

  const createBlock = (name: string): BlockData => ({
    id: 'test-block',
    type: 'transpose',
    name,
    position: { x: 0, y: 0 }
  })

  describe('getOutputType', () => {
    it('should transpose vector [N] to row matrix [1][N]', () => {
      const block = createBlock('transpose1')
      expect(module.getOutputType(block, ['double[3]'])).toBe('double[1][3]')
      expect(module.getOutputType(block, ['float[4]'])).toBe('float[1][4]')
    })

    it('should normalize row matrix [1][N] to vector [N]', () => {
      const block = createBlock('transpose1')
      // Row matrix transpose should output a vector (normalized)
      expect(module.getOutputType(block, ['double[1][3]'])).toBe('double[3]')
      expect(module.getOutputType(block, ['float[1][4]'])).toBe('float[4]')
    })

    it('should transpose column matrix [N][1] to row matrix [1][N]', () => {
      const block = createBlock('transpose1')
      expect(module.getOutputType(block, ['double[3][1]'])).toBe('double[1][3]')
      expect(module.getOutputType(block, ['float[4][1]'])).toBe('float[1][4]')
    })

    it('should transpose general matrix [M][N] to [N][M]', () => {
      const block = createBlock('transpose1')
      expect(module.getOutputType(block, ['double[3][4]'])).toBe('double[4][3]')
      expect(module.getOutputType(block, ['float[2][5]'])).toBe('float[5][2]')
    })

    it('should pass through scalar unchanged', () => {
      const block = createBlock('transpose1')
      expect(module.getOutputType(block, ['double'])).toBe('double')
      expect(module.getOutputType(block, ['float'])).toBe('float')
    })

    it('should return default for no inputs', () => {
      const block = createBlock('transpose1')
      expect(module.getOutputType(block, [])).toBe('double')
    })
  })

  describe('generateComputation', () => {
    it('should generate correct code for vector transpose', () => {
      const block = createBlock('vec_transpose')
      const code = module.generateComputation(block, ['input_vec'], ['double[3]'])

      expect(code).toContain('Vector transpose')
      expect(code).toContain('[1][3]')
      expect(code).toContain('vec_transpose[0][i] = input_vec[i]')
    })

    it('should generate correct code for row matrix to vector', () => {
      const block = createBlock('row_transpose')
      const code = module.generateComputation(block, ['input_row'], ['double[1][3]'])

      expect(code).toContain('Row matrix transpose')
      expect(code).toContain('normalized')
      expect(code).toContain('row_transpose[i] = input_row[0][i]')
    })

    it('should generate correct code for column matrix transpose', () => {
      const block = createBlock('col_transpose')
      const code = module.generateComputation(block, ['input_col'], ['double[3][1]'])

      expect(code).toContain('Column matrix transpose')
      expect(code).toContain('[1][3]')
      expect(code).toContain('col_transpose[0][i] = input_col[i][0]')
    })

    it('should generate correct code for general matrix transpose', () => {
      const block = createBlock('mat_transpose')
      const code = module.generateComputation(block, ['input_mat'], ['double[3][4]'])

      expect(code).toContain('Matrix transpose')
      expect(code).toContain('[4][3]')
      expect(code).toContain('mat_transpose[j][i] = input_mat[i][j]')
    })
  })
})

describe('MatrixMultiplyBlockModule', () => {
  const module = new MatrixMultiplyBlockModule()

  const createBlock = (name: string): BlockData => ({
    id: 'test-block',
    type: 'matrix_multiply',
    name,
    position: { x: 0, y: 0 }
  })

  describe('getOutputType - Vector/Column Matrix Equivalence', () => {
    it('should produce same output for Matrix × Vector and Matrix × Column Matrix', () => {
      const block = createBlock('matmul1')

      // Matrix[3][4] × Vector[4] = Vector[3]
      const vectorResult = module.getOutputType(block, ['double[3][4]', 'double[4]'])
      // Matrix[3][4] × Column[4][1] = Vector[3] (normalized from [3][1])
      const colMatrixResult = module.getOutputType(block, ['double[3][4]', 'double[4][1]'])

      expect(vectorResult).toBe('double[3]')
      expect(colMatrixResult).toBe('double[3]')
    })

    it('should normalize column matrix output to vector', () => {
      const block = createBlock('matmul1')

      // Any result that would be [N][1] should become [N]
      const result = module.getOutputType(block, ['double[3][4]', 'double[4]'])
      expect(result).toBe('double[3]')
      expect(result).not.toContain('][1]')
    })
  })

  describe('getOutputType - Scalar Operations', () => {
    it('should handle scalar × scalar', () => {
      const block = createBlock('matmul1')
      expect(module.getOutputType(block, ['double', 'double'])).toBe('double')
    })

    it('should handle scalar × vector', () => {
      const block = createBlock('matmul1')
      expect(module.getOutputType(block, ['double', 'double[3]'])).toBe('double[3]')
      expect(module.getOutputType(block, ['double[3]', 'double'])).toBe('double[3]')
    })

    it('should handle scalar × matrix', () => {
      const block = createBlock('matmul1')
      expect(module.getOutputType(block, ['double', 'double[3][4]'])).toBe('double[3][4]')
      expect(module.getOutputType(block, ['double[3][4]', 'double'])).toBe('double[3][4]')
    })

    it('should handle scalar × row matrix', () => {
      const block = createBlock('matmul1')
      expect(module.getOutputType(block, ['double', 'double[1][3]'])).toBe('double[1][3]')
      expect(module.getOutputType(block, ['double[1][3]', 'double'])).toBe('double[1][3]')
    })
  })

  describe('getOutputType - Vector Operations', () => {
    it('should handle vector × vector (element-wise)', () => {
      const block = createBlock('matmul1')
      expect(module.getOutputType(block, ['double[3]', 'double[3]'])).toBe('double[3]')
    })

    it('should return scalar for incompatible vector dimensions', () => {
      const block = createBlock('matmul1')
      expect(module.getOutputType(block, ['double[3]', 'double[4]'])).toBe('double')
    })
  })

  describe('getOutputType - Outer Product and Dot Product', () => {
    it('should compute outer product: vector × row matrix', () => {
      const block = createBlock('matmul1')
      // [N] × [1][M] = [N][M]
      expect(module.getOutputType(block, ['double[3]', 'double[1][4]'])).toBe('double[3][4]')
    })

    it('should compute dot product: row matrix × vector', () => {
      const block = createBlock('matmul1')
      // [1][N] × [N] = scalar
      expect(module.getOutputType(block, ['double[1][3]', 'double[3]'])).toBe('double')
    })

    it('should return scalar for incompatible dot product dimensions', () => {
      const block = createBlock('matmul1')
      expect(module.getOutputType(block, ['double[1][3]', 'double[4]'])).toBe('double')
    })
  })

  describe('getOutputType - Matrix Operations', () => {
    it('should compute matrix × vector', () => {
      const block = createBlock('matmul1')
      // [M][N] × [N] = [M]
      expect(module.getOutputType(block, ['double[3][4]', 'double[4]'])).toBe('double[3]')
    })

    it('should compute matrix × matrix', () => {
      const block = createBlock('matmul1')
      // [M][N] × [N][P] = [M][P]
      expect(module.getOutputType(block, ['double[3][4]', 'double[4][5]'])).toBe('double[3][5]')
    })

    it('should compute row matrix × matrix', () => {
      const block = createBlock('matmul1')
      // [1][N] × [N][M] = [1][M]
      expect(module.getOutputType(block, ['double[1][3]', 'double[3][4]'])).toBe('double[1][4]')
    })
  })

  describe('generateComputation - Vector/Column Matrix Equivalence', () => {
    it('should generate correct access pattern for column matrix', () => {
      const block = createBlock('matmul1')

      // When multiplying by a column matrix, should access with [i][0]
      const code = module.generateComputation(
        block,
        ['mat', 'col_vec'],
        ['double[3][4]', 'double[4][1]']
      )

      expect(code).toContain('col_vec[k][0]')
    })

    it('should generate correct access pattern for vector', () => {
      const block = createBlock('matmul1')

      // When multiplying by a vector, should access with [k]
      const code = module.generateComputation(
        block,
        ['mat', 'vec'],
        ['double[3][4]', 'double[4]']
      )

      expect(code).toContain('vec[k]')
      expect(code).not.toContain('vec[k][0]')
    })
  })

  describe('generateComputation - Outer Product', () => {
    it('should generate outer product code for vector × row matrix', () => {
      const block = createBlock('outer_prod')
      const code = module.generateComputation(
        block,
        ['vec', 'row'],
        ['double[3]', 'double[1][4]']
      )

      expect(code).toContain('Outer product')
      expect(code).toContain('[3] × [1][4]')
      expect(code).toContain('vec[i] * row[0][j]')
    })
  })

  describe('generateComputation - Dot Product', () => {
    it('should generate dot product code for row matrix × vector', () => {
      const block = createBlock('dot_prod')
      const code = module.generateComputation(
        block,
        ['row', 'vec'],
        ['double[1][3]', 'double[3]']
      )

      expect(code).toContain('dot product')
      expect(code).toContain('[1][3] × [3]')
      expect(code).toContain('row[0][i] * vec[i]')
    })
  })

  describe('generateComputation - Scalar Operations', () => {
    it('should generate scalar multiplication code', () => {
      const block = createBlock('scale')
      const code = module.generateComputation(
        block,
        ['a', 'b'],
        ['double', 'double']
      )

      expect(code).toContain('a * b')
    })

    it('should generate scalar × vector code', () => {
      const block = createBlock('scale_vec')
      const code = module.generateComputation(
        block,
        ['s', 'vec'],
        ['double', 'double[3]']
      )

      expect(code).toContain('Scalar × vector')
      expect(code).toContain('s * vec[i]')
    })
  })

  describe('port configuration', () => {
    it('should have 2 input ports', () => {
      const block = createBlock('matmul1')
      expect(module.getInputPortCount(block)).toBe(2)
    })

    it('should have 1 output port', () => {
      const block = createBlock('matmul1')
      expect(module.getOutputPortCount(block)).toBe(1)
    })

    it('should not require state', () => {
      const block = createBlock('matmul1')
      expect(module.requiresState(block)).toBe(false)
    })
  })
})

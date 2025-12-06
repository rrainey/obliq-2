// __tests__/blocks/MatrixMultiplyBlockModule.test.ts

import { MatrixMultiplyBlockModule } from '@/lib/blocks/MatrixMultiplyBlockModule'
import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'

describe('MatrixMultiplyBlockModule', () => {
  const module = new MatrixMultiplyBlockModule()

  const createBlock = (name: string): BlockData => ({
    id: `${name}-id`,
    type: 'matrix_multiply',
    name,
    position: { x: 0, y: 0 },
    parameters: {}
  })

  const createBlockState = (blockId: string): BlockState => ({
    blockId,
    blockType: 'matrix_multiply',
    outputs: [0],
    internalState: {}
  })

  const createSimulationState = (): SimulationState => ({
    time: 0,
    timeStep: 0.01,
    duration: 1.0,
    blockStates: new Map(),
    signalValues: new Map(),
    sheetLabelValues: new Map(),
    isRunning: false,
    subsystemEnableStates: new Map(),
    subsystemEnableSignals: new Map(),
    parentSubsystemMap: new Map()
  })

  describe('generateComputation - C code generation', () => {
    describe('Scalar operations', () => {
      test('generates scalar × scalar multiplication', () => {
        const block = createBlock('MatMul1')
        const code = module.generateComputation(
          block,
          ['model->signals.A', 'model->signals.B'],
          ['double', 'double']
        )

        expect(code).toContain('MatMul1')
        expect(code).toContain('model->signals.A * model->signals.B')
      })
    })

    describe('Scalar-Vector operations', () => {
      test('generates scalar × vector multiplication', () => {
        const block = createBlock('MatMul1')
        const code = module.generateComputation(
          block,
          ['model->signals.Scalar', 'model->signals.Vec'],
          ['double', 'double[3]']
        )

        expect(code).toContain('for (int i = 0; i < 3; i++)')
        expect(code).toContain('model->signals.Scalar * model->signals.Vec[i]')
      })

      test('generates vector × scalar multiplication', () => {
        const block = createBlock('MatMul1')
        const code = module.generateComputation(
          block,
          ['model->signals.Vec', 'model->signals.Scalar'],
          ['double[4]', 'double']
        )

        expect(code).toContain('for (int i = 0; i < 4; i++)')
        expect(code).toContain('model->signals.Vec[i] * model->signals.Scalar')
      })
    })

    describe('Scalar-Matrix operations', () => {
      test('generates scalar × matrix multiplication', () => {
        const block = createBlock('MatMul1')
        const code = module.generateComputation(
          block,
          ['model->signals.Scalar', 'model->signals.Mat'],
          ['double', 'double[2][3]']
        )

        expect(code).toContain('for (int i = 0; i < 2; i++)')
        expect(code).toContain('for (int j = 0; j < 3; j++)')
        expect(code).toContain('model->signals.Scalar * model->signals.Mat[i][j]')
      })

      test('generates matrix × scalar multiplication', () => {
        const block = createBlock('MatMul1')
        const code = module.generateComputation(
          block,
          ['model->signals.Mat', 'model->signals.Scalar'],
          ['double[3][4]', 'double']
        )

        expect(code).toContain('for (int i = 0; i < 3; i++)')
        expect(code).toContain('for (int j = 0; j < 4; j++)')
        expect(code).toContain('model->signals.Mat[i][j] * model->signals.Scalar')
      })
    })

    describe('Vector-Vector operations', () => {
      test('generates element-wise vector multiplication', () => {
        const block = createBlock('MatMul1')
        const code = module.generateComputation(
          block,
          ['model->signals.Vec1', 'model->signals.Vec2'],
          ['double[3]', 'double[3]']
        )

        expect(code).toContain('Element-wise')
        expect(code).toContain('for (int i = 0; i < 3; i++)')
        expect(code).toContain('model->signals.Vec1[i] * model->signals.Vec2[i]')
      })

      test('handles incompatible vector dimensions', () => {
        const block = createBlock('MatMul1')
        const code = module.generateComputation(
          block,
          ['model->signals.Vec1', 'model->signals.Vec2'],
          ['double[3]', 'double[4]']
        )

        expect(code).toContain('ERROR')
        expect(code).toContain('incompatible')
      })
    })

    describe('Matrix-Vector operations', () => {
      test('generates matrix × vector multiplication', () => {
        const block = createBlock('MatMul1')
        const code = module.generateComputation(
          block,
          ['model->signals.Mat', 'model->signals.Vec'],
          ['double[3][4]', 'double[4]']
        )

        expect(code).toContain('Matrix-vector multiplication')
        expect(code).toContain('[3x4]')
        expect(code).toContain('for (int i = 0; i < 3; i++)')
        expect(code).toContain('for (int k = 0; k < 4; k++)')
        expect(code).toContain('model->signals.Mat[i][k] * model->signals.Vec[k]')
      })

      test('handles dimension mismatch in matrix × vector', () => {
        const block = createBlock('MatMul1')
        const code = module.generateComputation(
          block,
          ['model->signals.Mat', 'model->signals.Vec'],
          ['double[3][4]', 'double[3]'] // Vector size doesn't match matrix columns
        )

        expect(code).toContain('ERROR')
        expect(code).toContain('columns')
      })

      test('generates vector × matrix multiplication', () => {
        const block = createBlock('MatMul1')
        const code = module.generateComputation(
          block,
          ['model->signals.Vec', 'model->signals.Mat'],
          ['double[3]', 'double[3][4]']
        )

        expect(code).toContain('Vector-matrix multiplication')
        expect(code).toContain('[3] × [3x4]')
        expect(code).toContain('for (int j = 0; j < 4; j++)')
        expect(code).toContain('for (int i = 0; i < 3; i++)')
        expect(code).toContain('model->signals.Vec[i] * model->signals.Mat[i][j]')
      })
    })

    describe('Matrix-Matrix operations', () => {
      test('generates matrix × matrix multiplication', () => {
        const block = createBlock('MatMul1')
        const code = module.generateComputation(
          block,
          ['model->signals.Mat1', 'model->signals.Mat2'],
          ['double[2][3]', 'double[3][4]']
        )

        expect(code).toContain('Matrix multiplication')
        expect(code).toContain('[2x3] × [3x4] = [2x4]')
        expect(code).toContain('for (int i = 0; i < 2; i++)')
        expect(code).toContain('for (int j = 0; j < 4; j++)')
        expect(code).toContain('for (int k = 0; k < 3; k++)')
        expect(code).toContain('model->signals.Mat1[i][k] * model->signals.Mat2[k][j]')
      })

      test('handles incompatible matrix dimensions', () => {
        const block = createBlock('MatMul1')
        const code = module.generateComputation(
          block,
          ['model->signals.Mat1', 'model->signals.Mat2'],
          ['double[2][3]', 'double[4][5]'] // 3 != 4
        )

        expect(code).toContain('ERROR')
        expect(code).toContain('incompatible')
      })
    })

    describe('Edge cases', () => {
      test('handles insufficient inputs', () => {
        const block = createBlock('MatMul1')
        const code = module.generateComputation(
          block,
          ['model->signals.A'],
          ['double']
        )

        expect(code).toContain('Insufficient inputs')
        expect(code).toContain('0.0')
      })

      test('handles missing type information with fallback to scalar', () => {
        const block = createBlock('MatMul1')
        const code = module.generateComputation(
          block,
          ['model->signals.A', 'model->signals.B'],
          undefined
        )

        // Should fall back to scalar multiplication
        expect(code).toContain('model->signals.A * model->signals.B')
      })
    })
  })

  describe('getOutputType', () => {
    test('returns scalar for scalar × scalar', () => {
      const block = createBlock('MatMul1')
      const outputType = module.getOutputType(block, ['double', 'double'])
      expect(outputType).toBe('double')
    })

    test('returns vector for scalar × vector', () => {
      const block = createBlock('MatMul1')
      const outputType = module.getOutputType(block, ['double', 'double[3]'])
      expect(outputType).toBe('double[3]')
    })

    test('returns vector for vector × scalar', () => {
      const block = createBlock('MatMul1')
      const outputType = module.getOutputType(block, ['double[4]', 'double'])
      expect(outputType).toBe('double[4]')
    })

    test('returns matrix for scalar × matrix', () => {
      const block = createBlock('MatMul1')
      const outputType = module.getOutputType(block, ['double', 'double[2][3]'])
      expect(outputType).toBe('double[2][3]')
    })

    test('returns vector for element-wise vector multiplication', () => {
      const block = createBlock('MatMul1')
      const outputType = module.getOutputType(block, ['double[3]', 'double[3]'])
      expect(outputType).toBe('double[3]')
    })

    test('returns vector for matrix × vector', () => {
      const block = createBlock('MatMul1')
      const outputType = module.getOutputType(block, ['double[3][4]', 'double[4]'])
      expect(outputType).toBe('double[3]')
    })

    test('returns vector for vector × matrix', () => {
      const block = createBlock('MatMul1')
      const outputType = module.getOutputType(block, ['double[3]', 'double[3][4]'])
      expect(outputType).toBe('double[4]')
    })

    test('returns matrix for matrix × matrix', () => {
      const block = createBlock('MatMul1')
      const outputType = module.getOutputType(block, ['double[2][3]', 'double[3][4]'])
      expect(outputType).toBe('double[2][4]')
    })

    test('returns scalar for incompatible dimensions', () => {
      const block = createBlock('MatMul1')
      const outputType = module.getOutputType(block, ['double[2][3]', 'double[5][4]'])
      expect(outputType).toBe('double')
    })
  })

  describe('executeSimulation - TypeScript simulation', () => {
    describe('Scalar operations', () => {
      test('multiplies two scalars', () => {
        const blockState = createBlockState('matmul1')
        const simState = createSimulationState()

        module.executeSimulation(blockState, [3, 4], simState)

        expect(blockState.outputs[0]).toBe(12)
      })
    })

    describe('Scalar-Vector operations', () => {
      test('multiplies scalar × vector', () => {
        const blockState = createBlockState('matmul1')
        const simState = createSimulationState()

        module.executeSimulation(blockState, [2, [1, 2, 3]], simState)

        expect(blockState.outputs[0]).toEqual([2, 4, 6])
      })

      test('multiplies vector × scalar', () => {
        const blockState = createBlockState('matmul1')
        const simState = createSimulationState()

        module.executeSimulation(blockState, [[1, 2, 3], 3], simState)

        expect(blockState.outputs[0]).toEqual([3, 6, 9])
      })
    })

    describe('Scalar-Matrix operations', () => {
      test('multiplies scalar × matrix', () => {
        const blockState = createBlockState('matmul1')
        const simState = createSimulationState()

        module.executeSimulation(blockState, [2, [[1, 2], [3, 4]]], simState)

        expect(blockState.outputs[0]).toEqual([[2, 4], [6, 8]])
      })

      test('multiplies matrix × scalar', () => {
        const blockState = createBlockState('matmul1')
        const simState = createSimulationState()

        module.executeSimulation(blockState, [[[1, 2], [3, 4]], 2], simState)

        expect(blockState.outputs[0]).toEqual([[2, 4], [6, 8]])
      })
    })

    describe('Vector-Vector operations', () => {
      test('element-wise multiplication of equal-size vectors', () => {
        const blockState = createBlockState('matmul1')
        const simState = createSimulationState()

        module.executeSimulation(blockState, [[1, 2, 3], [4, 5, 6]], simState)

        expect(blockState.outputs[0]).toEqual([4, 10, 18])
      })

      test('handles dimension mismatch for vectors', () => {
        const blockState = createBlockState('matmul1')
        const simState = createSimulationState()
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

        module.executeSimulation(blockState, [[1, 2, 3], [4, 5]], simState)

        expect(blockState.outputs[0]).toBe(0)
        expect(consoleSpy).toHaveBeenCalled()
        consoleSpy.mockRestore()
      })
    })

    describe('Matrix-Vector operations', () => {
      test('multiplies 2x3 matrix × 3-vector', () => {
        const blockState = createBlockState('matmul1')
        const simState = createSimulationState()
        // [[1,2,3],[4,5,6]] × [1,2,3] = [1*1+2*2+3*3, 4*1+5*2+6*3] = [14, 32]
        const matrix = [[1, 2, 3], [4, 5, 6]]
        const vector = [1, 2, 3]

        module.executeSimulation(blockState, [matrix, vector], simState)

        expect(blockState.outputs[0]).toEqual([14, 32])
      })

      test('multiplies 3x3 identity matrix × vector', () => {
        const blockState = createBlockState('matmul1')
        const simState = createSimulationState()
        const identity = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
        const vector = [1, 2, 3]

        module.executeSimulation(blockState, [identity, vector], simState)

        expect(blockState.outputs[0]).toEqual([1, 2, 3])
      })

      test('handles dimension mismatch for matrix × vector', () => {
        const blockState = createBlockState('matmul1')
        const simState = createSimulationState()
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

        const matrix = [[1, 2, 3], [4, 5, 6]] // 2x3 matrix
        const vector = [1, 2] // 2-vector (doesn't match 3 columns)

        module.executeSimulation(blockState, [matrix, vector], simState)

        expect(blockState.outputs[0]).toBe(0)
        expect(consoleSpy).toHaveBeenCalled()
        consoleSpy.mockRestore()
      })
    })

    describe('Vector-Matrix operations', () => {
      test('multiplies 3-vector × 3x2 matrix', () => {
        const blockState = createBlockState('matmul1')
        const simState = createSimulationState()
        // [1,2,3] × [[1,2],[3,4],[5,6]] = [1*1+2*3+3*5, 1*2+2*4+3*6] = [22, 28]
        const vector = [1, 2, 3]
        const matrix = [[1, 2], [3, 4], [5, 6]]

        module.executeSimulation(blockState, [vector, matrix], simState)

        expect(blockState.outputs[0]).toEqual([22, 28])
      })
    })

    describe('Matrix-Matrix operations', () => {
      test('multiplies 2x3 matrix × 3x2 matrix', () => {
        const blockState = createBlockState('matmul1')
        const simState = createSimulationState()
        // [[1,2,3],[4,5,6]] × [[1,2],[3,4],[5,6]]
        // = [[1*1+2*3+3*5, 1*2+2*4+3*6], [4*1+5*3+6*5, 4*2+5*4+6*6]]
        // = [[22, 28], [49, 64]]
        const mat1 = [[1, 2, 3], [4, 5, 6]]
        const mat2 = [[1, 2], [3, 4], [5, 6]]

        module.executeSimulation(blockState, [mat1, mat2], simState)

        expect(blockState.outputs[0]).toEqual([[22, 28], [49, 64]])
      })

      test('multiplies identity matrices', () => {
        const blockState = createBlockState('matmul1')
        const simState = createSimulationState()
        const identity = [[1, 0], [0, 1]]

        module.executeSimulation(blockState, [identity, identity], simState)

        expect(blockState.outputs[0]).toEqual([[1, 0], [0, 1]])
      })

      test('handles dimension mismatch for matrix × matrix', () => {
        const blockState = createBlockState('matmul1')
        const simState = createSimulationState()
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

        const mat1 = [[1, 2], [3, 4]] // 2x2
        const mat2 = [[1, 2, 3], [4, 5, 6], [7, 8, 9]] // 3x3 (doesn't match 2 columns)

        module.executeSimulation(blockState, [mat1, mat2], simState)

        expect(blockState.outputs[0]).toBe(0)
        expect(consoleSpy).toHaveBeenCalled()
        consoleSpy.mockRestore()
      })
    })

    describe('Edge cases', () => {
      test('handles undefined inputs', () => {
        const blockState = createBlockState('matmul1')
        const simState = createSimulationState()

        module.executeSimulation(blockState, [undefined as any, 5], simState)

        expect(blockState.outputs[0]).toBe(0)
      })

      test('handles boolean inputs (not supported)', () => {
        const blockState = createBlockState('matmul1')
        const simState = createSimulationState()
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

        module.executeSimulation(blockState, [[true, false], [false, true]], simState)

        expect(blockState.outputs[0]).toBe(0)
        expect(consoleSpy).toHaveBeenCalled()
        consoleSpy.mockRestore()
      })
    })
  })

  describe('Port configuration', () => {
    test('has 2 input ports', () => {
      const block = createBlock('MatMul1')
      expect(module.getInputPortCount(block)).toBe(2)
    })

    test('has 1 output port', () => {
      const block = createBlock('MatMul1')
      expect(module.getOutputPortCount(block)).toBe(1)
    })
  })

  describe('State management', () => {
    test('does not require state', () => {
      const block = createBlock('MatMul1')
      expect(module.requiresState(block)).toBe(false)
    })

    test('generates no state struct members', () => {
      const block = createBlock('MatMul1')
      expect(module.generateStateStructMembers(block, 'double')).toEqual([])
    })
  })

  describe('Struct member generation', () => {
    test('generates scalar struct member', () => {
      const block = createBlock('MatMul1')
      const member = module.generateStructMember(block, 'double')
      expect(member).toContain('double MatMul1;')
    })

    test('generates vector struct member', () => {
      const block = createBlock('MatMul1')
      const member = module.generateStructMember(block, 'double[3]')
      expect(member).toContain('double MatMul1[3];')
    })

    test('generates matrix struct member', () => {
      const block = createBlock('MatMul1')
      const member = module.generateStructMember(block, 'double[2][4]')
      expect(member).toContain('double MatMul1[2][4];')
    })
  })
})

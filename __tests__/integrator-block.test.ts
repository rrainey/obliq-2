// __tests__/integrator-block.test.ts
// Tests for IntegratorBlockModule with focus on vector handling

import { IntegratorBlockModule } from '@/lib/blocks/IntegratorBlockModule'
import { BlockData } from '@/components/BlockNode'

describe('Integrator Block', () => {
  describe('Code Generation - Scalar', () => {
    test('should generate scalar integrator output code', () => {
      const block: BlockData = {
        id: 'int1',
        name: 'ScalarInt',
        type: 'integrator',
        position: { x: 0, y: 0 },
        parameters: {
          initialValue: 0
        }
      }

      const module = new IntegratorBlockModule()
      const code = module.generateComputation(block, ['model->signals.Input1'], ['double'])

      expect(code).toContain('Integrator block: ScalarInt')
      expect(code).toContain('model->signals.ScalarInt = model->states.ScalarInt_states[0]')
    })
  })

  describe('Code Generation - Vector', () => {
    test('should generate vector integrator output code with 1D array access', () => {
      const block: BlockData = {
        id: 'int1',
        name: 'VectorInt',
        type: 'integrator',
        position: { x: 0, y: 0 },
        parameters: {
          initialValue: 0
        }
      }

      const module = new IntegratorBlockModule()
      const code = module.generateComputation(block, ['model->signals.VectorInput'], ['double[3]'])

      expect(code).toContain('Integrator block: VectorInt')
      expect(code).toContain('for (int i = 0; i < 3; i++)')
      // Vector should use 1D array access pattern: _states[i], not _states[i][0]
      expect(code).toContain('model->signals.VectorInt[i] = model->states.VectorInt_states[i]')
      // Should NOT have the [0] suffix for vectors
      expect(code).not.toContain('_states[i][0]')
    })

    test('should generate vector state derivative with 1D array access', () => {
      const block: BlockData = {
        id: 'int1',
        name: 'VectorInt',
        type: 'integrator',
        position: { x: 0, y: 0 },
        parameters: {}
      }

      const module = new IntegratorBlockModule()
      const code = module.generateStateDerivative(block, 'model->signals.Input', 'current_states', 'double[3]')

      expect(code).toContain('State derivatives for VectorInt')
      expect(code).toContain('for (int i = 0; i < 3; i++)')
      // Should use 1D access for vector derivatives
      expect(code).toContain('state_derivatives->VectorInt_states[i] = ')
      expect(code).not.toContain('_states[i][0]')
    })
  })

  describe('Code Generation - Matrix', () => {
    test('should generate matrix integrator output code with 2D array access', () => {
      const block: BlockData = {
        id: 'int1',
        name: 'MatrixInt',
        type: 'integrator',
        position: { x: 0, y: 0 },
        parameters: {
          initialValue: 0
        }
      }

      const module = new IntegratorBlockModule()
      const code = module.generateComputation(block, ['model->signals.MatrixInput'], ['double[2][3]'])

      expect(code).toContain('Integrator block: MatrixInt')
      expect(code).toContain('for (int i = 0; i < 2; i++)')
      expect(code).toContain('for (int j = 0; j < 3; j++)')
      // Matrix should use 2D array access: _states[i][j], not _states[i][j][0]
      expect(code).toContain('model->signals.MatrixInt[i][j] = model->states.MatrixInt_states[i][j]')
      expect(code).not.toContain('_states[i][j][0]')
    })
  })

  describe('State Struct Generation', () => {
    test('should generate scalar state as 1D array with size 1', () => {
      const block: BlockData = {
        id: 'int1',
        name: 'ScalarInt',
        type: 'integrator',
        position: { x: 0, y: 0 },
        parameters: {}
      }

      const module = new IntegratorBlockModule()
      const members = module.generateStateStructMembers(block, 'double')

      expect(members).toContain('    double ScalarInt_states[1];')
    })

    test('should generate vector state as 1D array (not [N][1])', () => {
      const block: BlockData = {
        id: 'int1',
        name: 'VectorInt',
        type: 'integrator',
        position: { x: 0, y: 0 },
        parameters: {}
      }

      const module = new IntegratorBlockModule()
      const members = module.generateStateStructMembers(block, 'double[3]')

      // Should be double[3], not double[3][1]
      expect(members).toContain('    double VectorInt_states[3];')
      expect(members.join('')).not.toContain('[3][1]')
    })

    test('should generate matrix state as 2D array (not [M][N][1])', () => {
      const block: BlockData = {
        id: 'int1',
        name: 'MatrixInt',
        type: 'integrator',
        position: { x: 0, y: 0 },
        parameters: {}
      }

      const module = new IntegratorBlockModule()
      const members = module.generateStateStructMembers(block, 'double[2][3]')

      // Should be double[2][3], not double[2][3][1]
      expect(members).toContain('    double MatrixInt_states[2][3];')
      expect(members.join('')).not.toContain('[2][3][1]')
    })
  })

  describe('Initialization', () => {
    test('should initialize vector state with 1D array access', () => {
      const block: BlockData = {
        id: 'int1',
        name: 'VectorInt',
        type: 'integrator',
        position: { x: 0, y: 0 },
        parameters: {
          initialValue: 0
        }
      }

      const module = new IntegratorBlockModule()
      const code = module.generateInitialization(block, 'double[3]')

      expect(code).toContain('Initialize VectorInt_states')
      // Should use 1D access: _states[0], _states[1], _states[2]
      expect(code).toContain('VectorInt_states[0]')
      expect(code).toContain('VectorInt_states[1]')
      expect(code).toContain('VectorInt_states[2]')
      // Should NOT have [i][0] pattern
      expect(code).not.toContain('_states[0][0]')
      expect(code).not.toContain('_states[1][0]')
      expect(code).not.toContain('_states[2][0]')
    })

    test('should initialize matrix state with 2D array access', () => {
      const block: BlockData = {
        id: 'int1',
        name: 'MatrixInt',
        type: 'integrator',
        position: { x: 0, y: 0 },
        parameters: {
          initialValue: 0
        }
      }

      const module = new IntegratorBlockModule()
      const code = module.generateInitialization(block, 'double[2][3]')

      expect(code).toContain('Initialize MatrixInt_states')
      // Should use 2D access: _states[i][j]
      expect(code).toContain('MatrixInt_states[0][0]')
      // Should NOT have [i][j][0] pattern
      expect(code).not.toContain('[0][0][0]')
    })
  })

  describe('Post-Integration Limiting', () => {
    test('should apply limits to vector state with 1D array access', () => {
      const block: BlockData = {
        id: 'int1',
        name: 'VectorInt',
        type: 'integrator',
        position: { x: 0, y: 0 },
        parameters: {
          useLimits: true,
          upperLimit: 10,
          lowerLimit: -10
        }
      }

      const module = new IntegratorBlockModule()
      const code = module.generatePostIntegrationLimiting(block, 'double[3]')

      expect(code).toContain('Apply limits to VectorInt')
      expect(code).toContain('for (int i = 0; i < 3; i++)')
      // Should use 1D access for limiting
      expect(code).toContain('VectorInt_states[i] = fmax')
      expect(code).not.toContain('_states[i][0]')
    })
  })

  describe('Block Properties', () => {
    test('should report correct input/output port counts', () => {
      const block: BlockData = {
        id: 'int1',
        name: 'Test',
        type: 'integrator',
        position: { x: 0, y: 0 },
        parameters: {}
      }

      const module = new IntegratorBlockModule()

      expect(module.getInputPortCount(block)).toBe(1)
      expect(module.getOutputPortCount(block)).toBe(1)
    })

    test('should always require state', () => {
      const block: BlockData = {
        id: 'int1',
        name: 'Test',
        type: 'integrator',
        position: { x: 0, y: 0 },
        parameters: {}
      }

      const module = new IntegratorBlockModule()
      expect(module.requiresState(block)).toBe(true)
    })

    test('should not have direct feedthrough', () => {
      const block: BlockData = {
        id: 'int1',
        name: 'Test',
        type: 'integrator',
        position: { x: 0, y: 0 },
        parameters: {}
      }

      const module = new IntegratorBlockModule()
      expect(module.isDirectFeedthrough(block)).toBe(false)
    })

    test('should output same type as input', () => {
      const block: BlockData = {
        id: 'int1',
        name: 'Test',
        type: 'integrator',
        position: { x: 0, y: 0 },
        parameters: {}
      }

      const module = new IntegratorBlockModule()

      expect(module.getOutputType(block, ['double'])).toBe('double')
      expect(module.getOutputType(block, ['double[3]'])).toBe('double[3]')
      expect(module.getOutputType(block, ['double[2][3]'])).toBe('double[2][3]')
    })
  })
})

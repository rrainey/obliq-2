// __tests__/source-block-parameters.test.ts

import { SourceBlockModule } from '@/lib/blocks/SourceBlockModule'
import { BlockData } from '@/components/BlockNode'

describe('Source Block Parameter References (Feature 3)', () => {
  describe('Code Generation', () => {
    test('should generate parameter reference for scalar constant', () => {
      const block: BlockData = {
        id: 'source1',
        name: 'MySource',
        type: 'source',
        position: { x: 0, y: 0 },
        parameters: {
          signalType: 'constant',
          dataType: 'double',
          value: 3.14159,
          useParameter: true,
          parameterName: 'PI'
        }
      }

      const module = new SourceBlockModule()
      const code = module.generateComputation(block, [])

      expect(code).toContain('// Using parameter: PI')
      expect(code).toContain('model->signals.MySource = PI;')
    })

    test('should generate literal value when not using parameter', () => {
      const block: BlockData = {
        id: 'source1',
        name: 'MySource',
        type: 'source',
        position: { x: 0, y: 0 },
        parameters: {
          signalType: 'constant',
          dataType: 'double',
          value: 3.14159,
          useParameter: false
        }
      }

      const module = new SourceBlockModule()
      const code = module.generateComputation(block, [])

      expect(code).not.toContain('Using parameter')
      expect(code).toContain('model->signals.MySource = 3.14159;')
    })

    test('should generate vector parameter reference', () => {
      const block: BlockData = {
        id: 'source1',
        name: 'VectorSource',
        type: 'source',
        position: { x: 0, y: 0 },
        parameters: {
          signalType: 'constant',
          dataType: 'double[3]',
          value: [1, 2, 3],
          useParameter: true,
          parameterName: 'GAINS'
        }
      }

      const module = new SourceBlockModule()
      const code = module.generateComputation(block, [])

      expect(code).toContain('// Using parameter: GAINS')
      expect(code).toContain('model->signals.VectorSource[0] = GAINS[0];')
      expect(code).toContain('model->signals.VectorSource[1] = GAINS[1];')
      expect(code).toContain('model->signals.VectorSource[2] = GAINS[2];')
    })

    test('should generate matrix parameter reference', () => {
      const block: BlockData = {
        id: 'source1',
        name: 'MatrixSource',
        type: 'source',
        position: { x: 0, y: 0 },
        parameters: {
          signalType: 'constant',
          dataType: 'double[2][2]',
          value: [[1, 2], [3, 4]],
          useParameter: true,
          parameterName: 'TRANSFORM'
        }
      }

      const module = new SourceBlockModule()
      const code = module.generateComputation(block, [])

      expect(code).toContain('// Using parameter: TRANSFORM')
      expect(code).toContain('model->signals.MatrixSource[0][0] = TRANSFORM[0][0];')
      expect(code).toContain('model->signals.MatrixSource[1][1] = TRANSFORM[1][1];')
    })
  })
})

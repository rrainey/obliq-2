// __tests__/feature3-type-propagation.test.ts

import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { Sheet } from '@/lib/simulationTypes'
import { ModelParameter } from '@/lib/modelSchema'

describe('Feature 3: Type Propagation with Parameters', () => {
  describe('Source Block Type Auto-Sync', () => {
    test('should use parameter type when source references parameter', () => {
      // Parameter is float, source block uses it
      const parameters: ModelParameter[] = [
        { name: 'GAIN', signalType: 'float', value: 2.5 }
      ]

      const sheets: Sheet[] = [{
        id: 'sheet1',
        name: 'Main',
        blocks: [
          {
            id: 'source1',
            type: 'source',
            name: 'GainValue',
            position: { x: 0, y: 0 },
            parameters: {
              signalType: 'constant',
              dataType: 'float',  // Matches parameter type
              value: 2.5,
              useParameter: true,
              parameterName: 'GAIN'
            }
          },
          {
            id: 'display1',
            type: 'signal_display',
            name: 'Display',
            position: { x: 200, y: 0 },
            parameters: {}
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source1',
            sourcePortIndex: 0,
            targetBlockId: 'display1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 800, height: 600 }
      }]

      const generator = new CodeGenerator({ modelName: 'test' })
      const result = generator.generate(sheets, parameters)

      // Should generate code with GAIN parameter
      expect(result.header).toContain('#define GAIN 2.5f')
      expect(result.source).toContain('model->signals.GainValue = GAIN')

      // Should have no type mismatch warnings
      const typeMismatchWarnings = result.warnings.filter(w =>
        w.toLowerCase().includes('type') && w.toLowerCase().includes('mismatch')
      )
      expect(typeMismatchWarnings).toHaveLength(0)
    })

    test('should handle vector parameter with matching source type', () => {
      const parameters: ModelParameter[] = [
        { name: 'COEFFS', signalType: 'double[3]', value: [1.0, 2.0, 3.0] }
      ]

      const sheets: Sheet[] = [{
        id: 'sheet1',
        name: 'Main',
        blocks: [
          {
            id: 'source1',
            type: 'source',
            name: 'Coefficients',
            position: { x: 0, y: 0 },
            parameters: {
              signalType: 'constant',
              dataType: 'double[3]',  // Matches parameter type
              value: [1.0, 2.0, 3.0],
              useParameter: true,
              parameterName: 'COEFFS'
            }
          },
          {
            id: 'display1',
            type: 'signal_display',
            name: 'Display',
            position: { x: 200, y: 0 },
            parameters: {}
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source1',
            sourcePortIndex: 0,
            targetBlockId: 'display1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 800, height: 600 }
      }]

      const generator = new CodeGenerator({ modelName: 'test' })
      const result = generator.generate(sheets, parameters)

      // Should generate code with vector parameter
      expect(result.header).toContain('#define COEFFS_SIZE 3')
      expect(result.header).toContain('const double COEFFS[COEFFS_SIZE]')
      expect(result.source).toContain('model->signals.Coefficients[0] = COEFFS[0]')
    })

    test('should handle matrix parameter with matching source type', () => {
      const parameters: ModelParameter[] = [
        { name: 'MATRIX_A', signalType: 'double[2][2]', value: [[1, 2], [3, 4]] }
      ]

      const sheets: Sheet[] = [{
        id: 'sheet1',
        name: 'Main',
        blocks: [
          {
            id: 'source1',
            type: 'source',
            name: 'TransformMatrix',
            position: { x: 0, y: 0 },
            parameters: {
              signalType: 'constant',
              dataType: 'double[2][2]',  // Matches parameter type
              value: [[1, 2], [3, 4]],
              useParameter: true,
              parameterName: 'MATRIX_A'
            }
          },
          {
            id: 'display1',
            type: 'signal_display',
            name: 'Display',
            position: { x: 200, y: 0 },
            parameters: {}
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source1',
            sourcePortIndex: 0,
            targetBlockId: 'display1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 800, height: 600 }
      }]

      const generator = new CodeGenerator({ modelName: 'test' })
      const result = generator.generate(sheets, parameters)

      // Should generate code with matrix parameter
      expect(result.header).toContain('#define MATRIX_A_ROWS 2')
      expect(result.header).toContain('#define MATRIX_A_COLS 2')
      expect(result.header).toContain('const double MATRIX_A[MATRIX_A_ROWS][MATRIX_A_COLS]')
      expect(result.source).toContain('model->signals.TransformMatrix[0][0] = MATRIX_A[0][0]')
    })
  })

  describe('Type Consistency Validation', () => {
    test('should generate correct code when types match', () => {
      const parameters: ModelParameter[] = [
        { name: 'THRESHOLD', signalType: 'double', value: 10.0 },
        { name: 'GAIN', signalType: 'float', value: 1.5 }
      ]

      const sheets: Sheet[] = [{
        id: 'sheet1',
        name: 'Main',
        blocks: [
          {
            id: 'source1',
            type: 'source',
            name: 'ThresholdValue',
            position: { x: 0, y: 0 },
            parameters: {
              signalType: 'constant',
              dataType: 'double',
              value: 10.0,
              useParameter: true,
              parameterName: 'THRESHOLD'
            }
          },
          {
            id: 'source2',
            type: 'source',
            name: 'GainValue',
            position: { x: 0, y: 100 },
            parameters: {
              signalType: 'constant',
              dataType: 'float',
              value: 1.5,
              useParameter: true,
              parameterName: 'GAIN'
            }
          },
          {
            id: 'eval1',
            type: 'evaluate',
            name: 'Comparison',
            position: { x: 200, y: 50 },
            parameters: {
              numInputs: 2,
              expression: 'in(0) > THRESHOLD ? GAIN : 0'
            }
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'source1',
            sourcePortIndex: 0,
            targetBlockId: 'eval1',
            targetPortIndex: 0
          },
          {
            id: 'wire2',
            sourceBlockId: 'source2',
            sourcePortIndex: 0,
            targetBlockId: 'eval1',
            targetPortIndex: 1
          }
        ],
        extents: { width: 800, height: 600 }
      }]

      const generator = new CodeGenerator({ modelName: 'test' })
      const result = generator.generate(sheets, parameters)

      // Should generate both parameters
      expect(result.header).toContain('#define THRESHOLD 10')
      expect(result.header).toContain('#define GAIN 1.5f')

      // Should use parameters in evaluate expression
      expect(result.source).toContain('THRESHOLD')
      expect(result.source).toContain('GAIN')

      // Should compile without errors
      expect(result.warnings.filter(w => w.includes('error'))).toHaveLength(0)
    })
  })

  describe('End-to-End Integration', () => {
    test('should generate complete model with parametric sources and evaluate blocks', () => {
      const parameters: ModelParameter[] = [
        { name: 'PI', signalType: 'double', value: 3.14159 },
        { name: 'FREQUENCY', signalType: 'double', value: 60.0 },
        { name: 'AMPLITUDE', signalType: 'float', value: 1.0 }
      ]

      const sheets: Sheet[] = [{
        id: 'sheet1',
        name: 'SignalGenerator',
        blocks: [
          {
            id: 'time',
            type: 'source',
            name: 'Time',
            position: { x: 0, y: 0 },
            parameters: {
              signalType: 'ramp',
              dataType: 'double',
              value: 0,
              slope: 1.0,
              startTime: 0
            }
          },
          {
            id: 'freq',
            type: 'source',
            name: 'FrequencyParam',
            position: { x: 0, y: 100 },
            parameters: {
              signalType: 'constant',
              dataType: 'double',
              value: 60.0,
              useParameter: true,
              parameterName: 'FREQUENCY'
            }
          },
          {
            id: 'amp',
            type: 'source',
            name: 'AmplitudeParam',
            position: { x: 0, y: 200 },
            parameters: {
              signalType: 'constant',
              dataType: 'float',
              value: 1.0,
              useParameter: true,
              parameterName: 'AMPLITUDE'
            }
          },
          {
            id: 'phase',
            type: 'evaluate',
            name: 'Phase',
            position: { x: 200, y: 0 },
            parameters: {
              numInputs: 1,
              expression: '2 * PI * FREQUENCY * in(0)'
            }
          },
          {
            id: 'sine',
            type: 'trig',
            name: 'SineWave',
            position: { x: 400, y: 0 },
            parameters: {
              function: 'sin'
            }
          },
          {
            id: 'scaled',
            type: 'evaluate',
            name: 'ScaledOutput',
            position: { x: 600, y: 0 },
            parameters: {
              numInputs: 1,
              expression: 'AMPLITUDE * in(0)'
            }
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'time',
            sourcePortIndex: 0,
            targetBlockId: 'phase',
            targetPortIndex: 0
          },
          {
            id: 'wire2',
            sourceBlockId: 'phase',
            sourcePortIndex: 0,
            targetBlockId: 'sine',
            targetPortIndex: 0
          },
          {
            id: 'wire3',
            sourceBlockId: 'sine',
            sourcePortIndex: 0,
            targetBlockId: 'scaled',
            targetPortIndex: 0
          }
        ],
        extents: { width: 800, height: 600 }
      }]

      const generator = new CodeGenerator({ modelName: 'test' })
      const result = generator.generate(sheets, parameters)

      // Should define all parameters
      expect(result.header).toContain('#define PI 3.14159')
      expect(result.header).toContain('#define FREQUENCY 60')
      expect(result.header).toContain('#define AMPLITUDE 1f')

      // Should use parameters in source blocks
      expect(result.source).toContain('model->signals.FrequencyParam = FREQUENCY')
      expect(result.source).toContain('model->signals.AmplitudeParam = AMPLITUDE')

      // Should use parameters in evaluate expressions
      expect(result.source).toContain('2')
      expect(result.source).toContain('PI')
      expect(result.source).toContain('FREQUENCY')
      expect(result.source).toContain('AMPLITUDE')

      // Should have step function
      expect(result.source).toContain('void test_step(test_t* model)')

      // Should be compilable C code
      expect(result.warnings.filter(w => w.toLowerCase().includes('error'))).toHaveLength(0)
    })
  })
})

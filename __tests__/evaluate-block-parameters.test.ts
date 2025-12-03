// __tests__/evaluate-block-parameters.test.ts

import { EvaluateBlockModule } from '@/lib/blocks/EvaluateBlockModule'
import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { C99ExpressionParser } from '@/lib/c99ExpressionParser'
import { C99ExpressionValidator } from '@/lib/c99ExpressionValidator'
import { C99ExpressionEvaluator } from '@/lib/c99ExpressionEvaluator'
import { c99ExpressionToCode } from '@/lib/c99ExpressionCodeGen'

describe('Evaluate Block Parameter References (Feature 3)', () => {
  describe('Expression Validation with Parameters', () => {
    test('should accept parameter identifier in expression', () => {
      const expression = 'GAIN * in(0)'
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()

      const validator = new C99ExpressionValidator(1, ['GAIN'])
      const result = validator.validate(ast)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    test('should reject unknown parameter identifier', () => {
      const expression = 'UNKNOWN_PARAM * in(0)'
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()

      const validator = new C99ExpressionValidator(1, ['GAIN'])
      const result = validator.validate(ast)

      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain('UNKNOWN_PARAM')
    })

    test('should accept multiple parameters in expression', () => {
      const expression = 'A * in(0) + B * in(1) + C'
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()

      const validator = new C99ExpressionValidator(2, ['A', 'B', 'C'])
      const result = validator.validate(ast)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    test('should validate expression with no parameters', () => {
      const expression = 'in(0) + in(1)'
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()

      const validator = new C99ExpressionValidator(2, [])
      const result = validator.validate(ast)

      expect(result.valid).toBe(true)
    })
  })

  describe('Expression Evaluation with Parameters', () => {
    test('should evaluate expression with single parameter', () => {
      const expression = 'GAIN * in(0)'
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()

      const inputs = [5.0]
      const parameters = new Map([['GAIN', 2.5]])
      const evaluator = new C99ExpressionEvaluator(inputs, parameters)
      const result = evaluator.evaluate(ast)

      expect(result).toBe(12.5) // 2.5 * 5.0
    })

    test('should evaluate expression with multiple parameters', () => {
      const expression = 'A * in(0) + B'
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()

      const inputs = [3.0]
      const parameters = new Map([['A', 2.0], ['B', 10.0]])
      const evaluator = new C99ExpressionEvaluator(inputs, parameters)
      const result = evaluator.evaluate(ast)

      expect(result).toBe(16.0) // 2.0 * 3.0 + 10.0
    })

    test('should throw error if parameter not found', () => {
      const expression = 'MISSING * in(0)'
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()

      const inputs = [5.0]
      const parameters = new Map([['GAIN', 2.5]])
      const evaluator = new C99ExpressionEvaluator(inputs, parameters)

      expect(() => evaluator.evaluate(ast)).toThrow("Parameter 'MISSING' not found")
    })

    test('should evaluate complex expression with parameters', () => {
      const expression = '(A * in(0) + B) / C'
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()

      const inputs = [4.0]
      const parameters = new Map([['A', 3.0], ['B', 2.0], ['C', 2.0]])
      const evaluator = new C99ExpressionEvaluator(inputs, parameters)
      const result = evaluator.evaluate(ast)

      expect(result).toBe(7.0) // (3.0 * 4.0 + 2.0) / 2.0 = 14.0 / 2.0
    })
  })

  describe('Code Generation with Parameters', () => {
    test('should generate parameter reference in C code', () => {
      const expression = 'GAIN * in(0)'
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()

      const { code } = c99ExpressionToCode(ast, ['_eval_in0'])

      expect(code).toContain('GAIN')
      expect(code).toContain('_eval_in0')
    })

    test('should generate multiple parameter references', () => {
      const expression = 'A * in(0) + B * in(1) + C'
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()

      const { code } = c99ExpressionToCode(ast, ['_eval_in0', '_eval_in1'])

      expect(code).toContain('A')
      expect(code).toContain('B')
      expect(code).toContain('C')
    })

    test('should generate correct C code for complex parameter expression', () => {
      const expression = 'SCALE * (in(0) + OFFSET)'
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()

      const { code } = c99ExpressionToCode(ast, ['_eval_in0'])

      expect(code).toContain('SCALE')
      expect(code).toContain('OFFSET')
      expect(code).toContain('_eval_in0')
    })
  })

  describe('EvaluateBlockModule Integration', () => {
    test('should generate C code with parameter in expression', () => {
      const block: BlockData = {
        id: 'eval1',
        name: 'ScaledInput',
        type: 'evaluate',
        position: { x: 0, y: 0 },
        parameters: {
          numInputs: 1,
          expression: 'GAIN * in(0)'
        }
      }

      const module = new EvaluateBlockModule()
      const code = module.generateComputation(block, ['model->signals.Input1'])

      expect(code).toContain('// Evaluate block: ScaledInput')
      expect(code).toContain('// Expression: GAIN * in(0)')
      expect(code).toContain('GAIN')
      expect(code).toContain('model->signals.ScaledInput =')
    })

    test('should execute simulation with parameter', () => {
      const blockState: BlockState = {
        blockId: 'eval1',
        blockType: 'evaluate',
        outputs: [0],
        internalState: {
          numInputs: 1,
          expression: 'GAIN * in(0)'
        }
      }

      const simulationState: SimulationState = {
        time: 0,
        timeStep: 0.01,
        duration: 10,
        blockStates: new Map(),
        signalValues: new Map(),
        sheetLabelValues: new Map(),
        isRunning: true,
        subsystemEnableStates: new Map(),
        subsystemEnableSignals: new Map(),
        parentSubsystemMap: new Map(),
        parameters: new Map([['GAIN', 2.5]])
      }

      const module = new EvaluateBlockModule()
      module.executeSimulation(blockState, [4.0], simulationState)

      expect(blockState.outputs[0]).toBe(10.0) // 2.5 * 4.0
    })

    test('should execute simulation with multiple parameters', () => {
      const blockState: BlockState = {
        blockId: 'eval1',
        blockType: 'evaluate',
        outputs: [0],
        internalState: {
          numInputs: 2,
          expression: 'A * in(0) + B * in(1)'
        }
      }

      const simulationState: SimulationState = {
        time: 0,
        timeStep: 0.01,
        duration: 10,
        blockStates: new Map(),
        signalValues: new Map(),
        sheetLabelValues: new Map(),
        isRunning: true,
        subsystemEnableStates: new Map(),
        subsystemEnableSignals: new Map(),
        parentSubsystemMap: new Map(),
        parameters: new Map([['A', 3.0], ['B', 5.0]])
      }

      const module = new EvaluateBlockModule()
      module.executeSimulation(blockState, [2.0, 4.0], simulationState)

      expect(blockState.outputs[0]).toBe(26.0) // 3.0 * 2.0 + 5.0 * 4.0
    })

    test('should handle missing parameter gracefully', () => {
      const blockState: BlockState = {
        blockId: 'eval1',
        blockType: 'evaluate',
        outputs: [0],
        internalState: {
          numInputs: 1,
          expression: 'MISSING_PARAM * in(0)'
        }
      }

      const simulationState: SimulationState = {
        time: 0,
        timeStep: 0.01,
        duration: 10,
        blockStates: new Map(),
        signalValues: new Map(),
        sheetLabelValues: new Map(),
        isRunning: true,
        subsystemEnableStates: new Map(),
        subsystemEnableSignals: new Map(),
        parentSubsystemMap: new Map(),
        parameters: new Map([['GAIN', 2.5]])
      }

      const module = new EvaluateBlockModule()
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      module.executeSimulation(blockState, [4.0], simulationState)

      expect(consoleSpy).toHaveBeenCalled()
      expect(blockState.outputs[0]).toBe(0) // Falls back to 0

      consoleSpy.mockRestore()
    })

    test('should work with no parameters', () => {
      const blockState: BlockState = {
        blockId: 'eval1',
        blockType: 'evaluate',
        outputs: [0],
        internalState: {
          numInputs: 2,
          expression: 'in(0) + in(1)'
        }
      }

      const simulationState: SimulationState = {
        time: 0,
        timeStep: 0.01,
        duration: 10,
        blockStates: new Map(),
        signalValues: new Map(),
        sheetLabelValues: new Map(),
        isRunning: true,
        subsystemEnableStates: new Map(),
        subsystemEnableSignals: new Map(),
        parentSubsystemMap: new Map(),
        parameters: new Map()
      }

      const module = new EvaluateBlockModule()
      module.executeSimulation(blockState, [3.0, 7.0], simulationState)

      expect(blockState.outputs[0]).toBe(10.0)
    })
  })

  describe('Complex Parameter Expressions', () => {
    test('should handle mathematical operations with parameters', () => {
      const expression = 'sqrt(A * A + B * B)'
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()

      const inputs: number[] = []
      const parameters = new Map([['A', 3.0], ['B', 4.0]])
      const evaluator = new C99ExpressionEvaluator(inputs, parameters)
      const result = evaluator.evaluate(ast)

      expect(result).toBe(5.0) // sqrt(9 + 16) = 5
    })

    test('should handle conditional expressions with parameters', () => {
      const expression = 'in(0) > THRESHOLD ? MAX_VALUE : MIN_VALUE'
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()

      const inputs = [15.0]
      const parameters = new Map([['THRESHOLD', 10.0], ['MAX_VALUE', 100.0], ['MIN_VALUE', 0.0]])
      const evaluator = new C99ExpressionEvaluator(inputs, parameters)
      const result = evaluator.evaluate(ast)

      expect(result).toBe(100.0)
    })

    test('should handle parameters in nested expressions', () => {
      const expression = 'A * (B + C * in(0))'
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()

      const inputs = [2.0]
      const parameters = new Map([['A', 3.0], ['B', 4.0], ['C', 5.0]])
      const evaluator = new C99ExpressionEvaluator(inputs, parameters)
      const result = evaluator.evaluate(ast)

      expect(result).toBe(42.0) // 3.0 * (4.0 + 5.0 * 2.0) = 3.0 * 14.0
    })
  })
})

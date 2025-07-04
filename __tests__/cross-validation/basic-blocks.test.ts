// __tests__/cross-validation/basic-blocks.test.ts

import { TestModelBuilder, TestModel } from '../utils/TestModelBuilder'
import { ModelExecutor } from '../utils/ModelExecutor'
import { ResultComparator } from '../utils/ResultComparator'

describe('Basic Block Cross-Validation', () => {
  let executor: ModelExecutor
  let comparator: ResultComparator

  beforeAll(async () => {
    // Build Docker image if needed
    executor = new ModelExecutor({ 
      verbose: process.env.VERBOSE === 'true',
      timeout: 120000 // 2 minutes for Docker operations
    })
    comparator = new ResultComparator({ 
      tolerance: 0.001, // 0.1% default tolerance
      verbose: process.env.VERBOSE === 'true'
    })
  })

  afterAll(() => {
    executor.cleanup()
  })

  describe('Sum Block', () => {
    test('should add two scalar inputs', async () => {
      const model = new TestModelBuilder('Sum Two Scalars')
        .withTestInputs({ Input1: 5.0, Input2: 3.0 })
        .withExpectedOutput(8.0)
        .addInput('Input1')
        .addInput('Input2')
        .addSum('++')
        .addOutput('Result')
        .connectByName('Input1', 'Sum1', 0, 0)
        .connectByName('Input2', 'Sum1', 0, 1)
        .connectByName('Sum1', 'Result')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      comparator.generateTextReport(comparison)

      expect(comparison.passed).toBe(true)
      expect(results.simulation.outputs.Result).toBeCloseTo(8.0, 5)
      expect(results.compiled.outputs.Result).toBeCloseTo(8.0, 5)

      if (process.env.VERBOSE) {
        console.log(comparator.generateTextReport(comparison))
      }
    })

    test('should subtract with mixed signs', async () => {
      const model = new TestModelBuilder('Sum with Subtraction')
        .withTestInputs({ A: 10.0, B: 3.0, C: 2.0 })
        .withExpectedOutput(5.0) // 10 - 3 - 2
        .addInput('A')
        .addInput('B')
        .addInput('C')
        .addSum('+--')
        .addOutput('Result')
        .connectByName('A', 'Sum1', 0, 0)
        .connectByName('B', 'Sum1', 0, 1)
        .connectByName('C', 'Sum1', 0, 2)
        .connectByName('Sum1', 'Result')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
      expect(results.simulation.outputs.Result).toBeCloseTo(5.0, 5)
    })

    test('should add vector inputs element-wise', async () => {
      const model = new TestModelBuilder('Sum Vectors')
        .withTestInputs({ 
          Vec1: [1.0, 2.0, 3.0], 
          Vec2: [4.0, 5.0, 6.0] 
        })
        .withExpectedOutputs({ 
          Result: [5.0, 7.0, 9.0] 
        })
        .addInput('Vec1', 'double[3]')
        .addInput('Vec2', 'double[3]')
        .addSum('++')
        .addOutput('Result')
        .connectByName('Vec1', 'Sum1', 0, 0)
        .connectByName('Vec2', 'Sum1', 0, 1)
        .connectByName('Sum1', 'Result')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
      const simResult = results.simulation.outputs.Result as number[]
      const compResult = results.compiled.outputs.Result as number[]
      expect(simResult).toHaveLength(3)
      expect(compResult).toHaveLength(3)
      for (let i = 0; i < 3; i++) {
        expect(simResult[i]).toBeCloseTo([5.0, 7.0, 9.0][i], 5)
        expect(compResult[i]).toBeCloseTo([5.0, 7.0, 9.0][i], 5)
      }
    })

    test('should handle many inputs', async () => {
      const model = new TestModelBuilder('Sum Many Inputs')
        .withTestInputs({ 
          A: 1.0, B: 2.0, C: 3.0, D: 4.0, E: 5.0 
        })
        .withExpectedOutput(15.0)
        .addInput('A')
        .addInput('B')
        .addInput('C')
        .addInput('D')
        .addInput('E')
        .addSum('+++++')
        .addOutput('Result')
        .connectByName('A', 'Sum1', 0, 0)
        .connectByName('B', 'Sum1', 0, 1)
        .connectByName('C', 'Sum1', 0, 2)
        .connectByName('D', 'Sum1', 0, 3)
        .connectByName('E', 'Sum1', 0, 4)
        .connectByName('Sum1', 'Result')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
    })
  })

  describe('Multiply Block', () => {
    test('should multiply two scalars', async () => {
      const model = new TestModelBuilder('Multiply Scalars')
        .withTestInputs({ X: 4.0, Y: 5.0 })
        .withExpectedOutput(20.0)
        .addInput('X')
        .addInput('Y')
        .addMultiply(2)
        .addOutput('Product')
        .connectByName('X', 'Multiply1', 0, 0)
        .connectByName('Y', 'Multiply1', 0, 1)
        .connectByName('Multiply1', 'Product')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
      expect(results.simulation.outputs.Product).toBeCloseTo(20.0, 5)
    })

    test('should multiply multiple values', async () => {
      const model = new TestModelBuilder('Multiply Multiple')
        .withTestInputs({ A: 2.0, B: 3.0, C: 4.0 })
        .withExpectedOutput(24.0)
        .addInput('A')
        .addInput('B')
        .addInput('C')
        .addMultiply(3)
        .addOutput('Product')
        .connectByName('A', 'Multiply1', 0, 0)
        .connectByName('B', 'Multiply1', 0, 1)
        .connectByName('C', 'Multiply1', 0, 2)
        .connectByName('Multiply1', 'Product')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
    })

    test('should multiply vectors element-wise', async () => {
      const model = new TestModelBuilder('Multiply Vectors')
        .withTestInputs({ 
          Vec1: [2.0, 3.0, 4.0], 
          Vec2: [5.0, 6.0, 7.0] 
        })
        .withExpectedOutputs({ 
          Result: [10.0, 18.0, 28.0] 
        })
        .addInput('Vec1', 'double[3]')
        .addInput('Vec2', 'double[3]')
        .addMultiply(2)
        .addOutput('Result')
        .connectByName('Vec1', 'Multiply1', 0, 0)
        .connectByName('Vec2', 'Multiply1', 0, 1)
        .connectByName('Multiply1', 'Result')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
    })

    test('should handle negative values', async () => {
      const model = new TestModelBuilder('Multiply Negatives')
        .withTestInputs({ A: -3.0, B: 4.0, C: -2.0 })
        .withExpectedOutput(24.0) // -3 * 4 * -2
        .addInput('A')
        .addInput('B')
        .addInput('C')
        .addMultiply(3)
        .addOutput('Result')
        .connectByName('A', 'Multiply1', 0, 0)
        .connectByName('B', 'Multiply1', 0, 1)
        .connectByName('C', 'Multiply1', 0, 2)
        .connectByName('Multiply1', 'Result')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
    })
  })

  describe('Scale Block', () => {
    test('should scale scalar by constant gain', async () => {
      const model = new TestModelBuilder('Scale Scalar')
        .withTestInputs({ Input: 7.0 })
        .withExpectedOutput(21.0)
        .addInput('Input')
        .addScale(3.0)
        .addOutput('Output')
        .connectByName('Input', 'Scale1')
        .connectByName('Scale1', 'Output')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
    })

    test('should scale with fractional gain', async () => {
      const model = new TestModelBuilder('Scale Fractional')
        .withTestInputs({ Input: 10.0 })
        .withExpectedOutput(2.5)
        .addInput('Input')
        .addScale(0.25)
        .addOutput('Output')
        .connectByName('Input', 'Scale1')
        .connectByName('Scale1', 'Output')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
    })

    test('should scale vector by gain', async () => {
      const model = new TestModelBuilder('Scale Vector')
        .withTestInputs({ Vec: [1.0, 2.0, 3.0, 4.0] })
        .withExpectedOutputs({ Scaled: [2.5, 5.0, 7.5, 10.0] })
        .addInput('Vec', 'double[4]')
        .addScale(2.5)
        .addOutput('Scaled')
        .connectByName('Vec', 'Scale1')
        .connectByName('Scale1', 'Scaled')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
    })

    test('should scale with negative gain', async () => {
      const model = new TestModelBuilder('Scale Negative')
        .withTestInputs({ Input: 5.0 })
        .withExpectedOutput(-15.0)
        .addInput('Input')
        .addScale(-3.0)
        .addOutput('Output')
        .connectByName('Input', 'Scale1')
        .connectByName('Scale1', 'Output')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
    })
  })

  describe('Source Block', () => {
    test('should output constant scalar', async () => {
      const model = new TestModelBuilder('Source Constant Scalar')
        .withExpectedOutput(42.0)
        .addSource(42.0)
        .addOutput('Output')
        .connectByName('Source1', 'Output')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
      expect(results.simulation.outputs.Output).toBe(42.0)
      expect(results.compiled.outputs.Output).toBeCloseTo(42.0, 5)
    })

    test('should output constant vector', async () => {
      const model = new TestModelBuilder('Source Constant Vector')
        .withExpectedOutputs({ Vec: [1.0, 2.0, 3.0] })
        .addSource([1.0, 2.0, 3.0])
        .addOutput('Vec')
        .connectByName('Source1', 'Vec')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
    })

    test('should output boolean constant', async () => {
      const model = new TestModelBuilder('Source Boolean')
        .withExpectedOutput(1.0) // true as 1.0
        .addSource(true, 'bool')
        .addOutput('Flag')
        .connectByName('Source1', 'Flag')
        .build()

      const results = await executor.executeBoth(model)
      
      // Boolean outputs might need special handling
      expect(results.simulation.outputs.Flag).toBeTruthy()
      expect(results.compiled.outputs.Flag).toBeCloseTo(1.0, 5)
    })

    test('should handle zero and negative constants', async () => {
      const model = new TestModelBuilder('Source Zero Negative')
        .addSource(0.0)
        .addSource(-123.45)
        .addOutput('Zero')
        .addOutput('Negative')
        .connectByName('Source1', 'Zero')
        .connectByName('Source2', 'Negative')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
      expect(results.simulation.outputs.Zero).toBe(0.0)
      expect(results.simulation.outputs.Negative).toBe(-123.45)
    })
  })

  describe('Combined Operations', () => {
    test('should handle chained arithmetic operations', async () => {
      const model = new TestModelBuilder('Chained Operations')
        .withTestInputs({ X: 5.0, Y: 3.0 })
        .withExpectedOutput(34.0) // (5 + 3) * 4 + 2
        .addInput('X')
        .addInput('Y')
        .addSum('++')
        .addScale(4.0)
        .addSource(2.0)
        .addSum('++')
        .addOutput('Result')
        .connectByName('X', 'Sum1', 0, 0)
        .connectByName('Y', 'Sum1', 0, 1)
        .connectByName('Sum1', 'Scale1')
        .connectByName('Scale1', 'Sum2', 0, 0)
        .connectByName('Source1', 'Sum2', 0, 1)
        .connectByName('Sum2', 'Result')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
      expect(results.simulation.outputs.Result).toBeCloseTo(34.0, 5)
    })

    test('should handle parallel computation paths', async () => {
      const model = new TestModelBuilder('Parallel Paths')
        .withTestInputs({ A: 10.0, B: 5.0 })
        .withExpectedOutputs({ 
          Path1: 15.0,  // A + B
          Path2: 50.0   // A * B
        })
        .addInput('A')
        .addInput('B')
        .addSum('++')
        .addMultiply(2)
        .addOutput('Path1')
        .addOutput('Path2')
        .connectByName('A', 'Sum1', 0, 0)
        .connectByName('B', 'Sum1', 0, 1)
        .connectByName('A', 'Multiply1', 0, 0)
        .connectByName('B', 'Multiply1', 0, 1)
        .connectByName('Sum1', 'Path1')
        .connectByName('Multiply1', 'Path2')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
    })

    test('should handle vector operations chain', async () => {
      const model = new TestModelBuilder('Vector Chain')
        .withTestInputs({ 
          Vec1: [1.0, 2.0, 3.0],
          Vec2: [4.0, 5.0, 6.0]
        })
        .withExpectedOutputs({ 
          Result: [10.0, 14.0, 18.0] // (Vec1 + Vec2) * 2
        })
        .addInput('Vec1', 'double[3]')
        .addInput('Vec2', 'double[3]')
        .addSum('++')
        .addScale(2.0)
        .addOutput('Result')
        .connectByName('Vec1', 'Sum1', 0, 0)
        .connectByName('Vec2', 'Sum1', 0, 1)
        .connectByName('Sum1', 'Scale1')
        .connectByName('Scale1', 'Result')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    test('should handle very small values', async () => {
      const model = new TestModelBuilder('Very Small Values')
        .withTestInputs({ Tiny: 1e-10 })
        .withExpectedOutput(2e-10)
        .withTolerance(1e-8) // Looser tolerance for tiny values
        .addInput('Tiny')
        .addScale(2.0)
        .addOutput('Result')
        .connectByName('Tiny', 'Scale1')
        .connectByName('Scale1', 'Result')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
    })

    test('should handle very large values', async () => {
      const model = new TestModelBuilder('Very Large Values')
        .withTestInputs({ Big: 1e10 })
        .withExpectedOutput(3e10)
        .addInput('Big')
        .addScale(3.0)
        .addOutput('Result')
        .connectByName('Big', 'Scale1')
        .connectByName('Scale1', 'Result')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
    })

    test('should handle operations resulting in zero', async () => {
      const model = new TestModelBuilder('Zero Result')
        .withTestInputs({ X: 5.0, Y: 5.0 })
        .withExpectedOutput(0.0)
        .addInput('X')
        .addInput('Y')
        .addSum('+-') // X - Y
        .addOutput('Zero')
        .connectByName('X', 'Sum1', 0, 0)
        .connectByName('Y', 'Sum1', 0, 1)
        .connectByName('Sum1', 'Zero')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
      expect(Math.abs((results.simulation.outputs.Zero as number))).toBeLessThan(1e-10)
      expect(Math.abs((results.compiled.outputs.Zero as number))).toBeLessThan(1e-10)
    })
  })

  describe('Performance Comparison', () => {
    test('should track execution times', async () => {
      const model = new TestModelBuilder('Performance Test')
        .withSimulationParams(1.0, 0.001) // 1 second, 1ms steps = 1000 iterations
        .withTestInputs({ Input: 1.0 })
        .addInput('Input')
        .addScale(2.0)
        .addScale(3.0)
        .addScale(4.0)
        .addOutput('Output')
        .connectByName('Input', 'Scale1')
        .connectByName('Scale1', 'Scale2')
        .connectByName('Scale2', 'Scale3')
        .connectByName('Scale3', 'Output')
        .build()

      const results = await executor.executeBoth(model)
      const comparison = comparator.compare(results.simulation, results.compiled, model)

      expect(comparison.passed).toBe(true)
      expect(comparison.executionTimeRatio).toBeGreaterThan(0)
      
      if (process.env.VERBOSE) {
        console.log(`Execution time ratio: ${comparison.executionTimeRatio.toFixed(2)}x`)
        console.log(`Simulation: ${results.simulation.simulationTime.toFixed(3)}s`)
        console.log(`Compiled: ${results.compiled.simulationTime.toFixed(3)}s`)
      }
    })
  })
})
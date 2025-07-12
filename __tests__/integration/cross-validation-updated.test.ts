// __tests__/integration/cross-validation-updated.test.ts

import { TestModelBuilder } from '../utils/TestModelBuilder'
import { ModelExecutor } from '../utils/ModelExecutor'
import { ResultComparator } from '../utils/ResultComparator'

describe('Cross-Validation with New Architecture', () => {
  const executor = new ModelExecutor({ 
    verbose: false,
    logPhases: true // Enable phase logging
  })
  
  const comparator = new ResultComparator({
    tolerance: 0.001,
    verbose: true
  })

  describe('Verify existing tests still pass', () => {
    test('Simple gain model', async () => {
      const model = new TestModelBuilder('Simple Gain')
        .withTestInputs({ Input: 5.0 })
        .withExpectedOutputs({ Output: 15.0 })
        .addInput('Input')
        .addScale(3.0)
        .addOutput('Output')
        .connectByName('Input', 'Scale1')
        .connectByName('Scale1', 'Output')
        .build()

      const result = await executor.executeBoth(model)
      const comparison = comparator.compare(result.simulation, result.compiled)
      
      expect(comparison.passed).toBe(true)
      expect(result.simulation.success).toBe(true)
      expect(result.compiled.success).toBe(true)
      
      // Verify phase logs exist
      if (result.simulation.phaseExecutionLogs) {
        const phaseTypes = new Set(result.simulation.phaseExecutionLogs.map(log => log.phase))
        expect(phaseTypes.has('algebraic')).toBe(true)
        expect(phaseTypes.has('integration')).toBe(true)
        expect(phaseTypes.has('time-advance')).toBe(true)
      }
    })

    test('Transfer function model', async () => {
      const model = new TestModelBuilder('Transfer Function')
        .withSimulationParams(10.0, 0.01)
        .withTestInputs({ Input: 1.0 })
        .addInput('Input')
        .addTransferFunction([1], [1, 1])
        .addOutput('Output')
        .connectByName('Input', 'TransferFunction1')
        .connectByName('TransferFunction1', 'Output')
        .build()

      const result = await executor.executeBoth(model)
      const comparison = comparator.compare(result.simulation, result.compiled)
      
      expect(comparison.passed).toBe(true)
      
      // Check final value convergence
      const finalValue = result.simulation.outputs.Output as number
      expect(Math.abs(finalValue - 0.632)).toBeLessThan(0.01) // 1-e^(-1) for t=1 time constant
    })
  })

  describe('Phase execution analysis', () => {
    test('Analyze phase timing', async () => {
      const model = new TestModelBuilder('Complex Model')
        .withSimulationParams(1.0, 0.01)
        .withTestInputs({ Input1: 1.0, Input2: 2.0 })
        .addInput('Input1')
        .addInput('Input2')
        .addSum('++')
        .addTransferFunction([1], [1, 2, 1])
        .addScale(0.5)
        .addOutput('Output')
        .connectByName('Input1', 'Sum1', 0, 0)
        .connectByName('Input2', 'Sum1', 0, 1)
        .connectByName('Sum1', 'TransferFunction1')
        .connectByName('TransferFunction1', 'Scale1')
        .connectByName('Scale1', 'Output')
        .build()

      const result = await executor.executeSimulation(model)
      
      expect(result.success).toBe(true)
      
      if (result.phaseExecutionLogs) {
        // Analyze phase distribution
        const phaseCounts = new Map<string, number>()
        const phaseTimes = new Map<string, number[]>()
        
        for (const log of result.phaseExecutionLogs) {
          phaseCounts.set(log.phase, (phaseCounts.get(log.phase) || 0) + 1)
          
          if (!phaseTimes.has(log.phase)) {
            phaseTimes.set(log.phase, [])
          }
          phaseTimes.get(log.phase)!.push(log.time)
        }
        
        console.log('Phase execution statistics:')
        for (const [phase, count] of phaseCounts) {
          console.log(`  ${phase}: ${count} executions`)
          const times = phaseTimes.get(phase)!
          if (times.length > 0) {
            console.log(`    Time range: ${times[0].toFixed(4)} - ${times[times.length-1].toFixed(4)}`)
          }
        }
        
        // Verify expected phase counts (100 time steps)
        expect(phaseCounts.get('algebraic')).toBeGreaterThan(100)
        expect(phaseCounts.get('integration')).toBeGreaterThan(100)
        expect(phaseCounts.get('time-advance')).toBeGreaterThan(100)
      }
    })

    test('Algebraic-only vs full simulation at t=0', async () => {
      const model = new TestModelBuilder('Initial Value Test')
        .withTestInputs({ Input: 5.0 })
        .addInput('Input')
        .addScale(2.0)
        .addSum('++')
        .addSource(3.0) // Constant source
        .addOutput('Output')
        .connectByName('Input', 'Scale1')
        .connectByName('Scale1', 'Sum1', 0, 0)
        .connectByName('Source1', 'Sum1', 0, 1)
        .connectByName('Sum1', 'Output')
        .build()

      // Run algebraic-only evaluation
      const algebraicResult = await executor.executeAlgebraicOnly(model)
      
      // Run full simulation
      const fullResult = await executor.executeSimulation(model)
      
      expect(algebraicResult.success).toBe(true)
      expect(fullResult.success).toBe(true)
      
      // At t=0, both should give same result (5*2 + 3 = 13)
      expect(algebraicResult.outputs.Output).toBe(13)
      expect(fullResult.outputs.Output).toBe(13)
      
      console.log('Algebraic execution order:', algebraicResult.executionOrder)
    })
  })

  describe('Multi-sheet validation with phases', () => {
    test('Subsystem with proper phase execution', async () => {
      const builder = new TestModelBuilder('Subsystem Phase Test')
        .withTestInputs({ MainInput: 10.0 })
        .withExpectedOutputs({ MainOutput: 20.0 })
      
      builder.addInput('MainInput')
      
      // Create subsystem
      const subsystem = builder.createSubsystem('Doubler')
        .addInputPort('In')
        .addOutputPort('Out')
        .configureInternals(sub => {
          sub.addInput('In')
            .addScale(2.0)
            .addOutput('Out')
            .connectByName('In', 'Scale1')
            .connectByName('Scale1', 'Out')
        })
        .build()
      
      builder.addOutput('MainOutput')
        .connectByName('MainInput', 'Doubler', 0, 0)
        .connectByName('Doubler', 'MainOutput', 0, 0)
      
      const model = builder.build()
      const result = await executor.executeSimulation(model)
      
      expect(result.success).toBe(true)
      expect(result.outputs.MainOutput).toBe(20)
      
      // Verify cross-sheet phase execution
      if (result.phaseExecutionLogs) {
        const crossSheetLogs = result.phaseExecutionLogs.filter(log => log.phase === 'cross-sheet')
        expect(crossSheetLogs.length).toBeGreaterThan(0)
        console.log(`Cross-sheet communications: ${crossSheetLogs.length}`)
      }
    })
  })

  describe('Performance comparison', () => {
    test('Phase-based vs monolithic execution', async () => {
      const model = new TestModelBuilder('Performance Test')
        .withSimulationParams(10.0, 0.01) // 1000 steps
        .withTestInputs({ Input: 1.0 })
        .addInput('Input')
      
      // Add multiple blocks to stress test
      for (let i = 0; i < 10; i++) {
        model.addScale(1.1)
      }
      
      model.addOutput('Output')
      
      // Connect in series
      model.connectByName('Input', 'Scale1')
      for (let i = 1; i < 10; i++) {
        model.connectByName(`Scale${i}`, `Scale${i+1}`)
      }
      model.connectByName('Scale10', 'Output')
      
      const finalModel = model.build()
      
      // Run with phase logging
      const phaseExecutor = new ModelExecutor({ logPhases: true })
      const phaseResult = await phaseExecutor.executeSimulation(finalModel)
      
      // Run without phase logging
      const normalExecutor = new ModelExecutor({ logPhases: false })
      const normalResult = await normalExecutor.executeSimulation(finalModel)
      
      expect(phaseResult.success).toBe(true)
      expect(normalResult.success).toBe(true)
      
      // Compare execution times
      console.log(`With phase logging: ${phaseResult.simulationTime.toFixed(3)}s`)
      console.log(`Without phase logging: ${normalResult.simulationTime.toFixed(3)}s`)
      
      // Results should be identical
      expect(phaseResult.outputs.Output).toBeCloseTo(normalResult.outputs.Output as number, 10)
      
      // Phase logging overhead should be reasonable (< 20%)
      const overhead = (phaseResult.simulationTime - normalResult.simulationTime) / normalResult.simulationTime
      expect(overhead).toBeLessThan(0.2)
    })
  })
})
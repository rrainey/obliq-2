

# Integration Architecture

## Overview

The simulation engine uses a two-layer architecture that separates algebraic computations from time-based integration. This design provides better modularity, testability, and support for multiple integration methods.

## Architecture Layers

### 1. Algebraic Layer
- **Purpose**: Compute all block outputs based on current inputs and states
- **Characteristics**:
  - Pure function: (inputs, states) → outputs
  - No state changes
  - No time advancement
  - Can be called multiple times per time step (for RK4)

### 2. Integration Layer
- **Purpose**: Update states based on derivatives
- **Characteristics**:
  - Manages time advancement
  - Orchestrates integration methods (Euler, RK4)
  - Handles enable state transitions
  - Validates numerical stability

## Block Module Interface

Each block module implements the `IBlockModule` interface with these key methods:

```typescript
interface IBlockModule {
  // Existing methods...
  
  // New method for derivative computation
  computeDerivatives?(
    blockState: BlockState,
    inputs: any[],
    time: number
  ): number[] | undefined
}


## Task 11.13: Add Derivative Validation and Error Checking

```typescript
// lib/simulation/SimulationStateIntegrator.ts - Add derivative validation

  /**
   * Validate derivatives for numerical issues
   */
  private validateDerivatives(derivatives: Map<string, number[]>): {
    valid: boolean,
    errors: string[]
  } {
    const errors: string[] = []
    
    for (const [blockId, derivs] of derivatives) {
      for (let i = 0; i < derivs.length; i++) {
        const value = derivs[i]
        
        if (!isFinite(value)) {
          if (isNaN(value)) {
            errors.push(`NaN derivative in block ${blockId}[${i}]`)
          } else if (value === Infinity) {
            errors.push(`Infinite derivative in block ${blockId}[${i}]`)
          } else if (value === -Infinity) {
            errors.push(`Negative infinite derivative in block ${blockId}[${i}]`)
          }
        }
        
        // Check for extremely large derivatives that might cause instability
        if (Math.abs(value) > 1e10) {
          errors.push(`Very large derivative (${value}) in block ${blockId}[${i}] - possible instability`)
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    }
  }
  
  /**
   * Compute all derivatives with validation
   */
  private computeAllDerivativesWithValidation(
    statefulBlocks: BlockData[],
    blockStates: Map<string, BlockState>,
    sheet: Sheet,
    time: number
  ): Map<string, number[]> | null {
    const derivatives = this.computeAllDerivatives(statefulBlocks, blockStates, sheet, time)
    
    const validation = this.validateDerivatives(derivatives)
    if (!validation.valid) {
      console.error('Derivative validation failed:', validation.errors)
      return null
    }
    
    return derivatives
  }
  
  /**
   * Updated integrateRK4 with validation
   */
  private integrateRK4(
    inputs: IntegrationInputs,
    statefulBlocks: BlockData[],
    stateContainer: StateContainer
  ): void {
    const { blockStates, simulationState, sheet, timeStep } = inputs
    const h = timeStep
    
    // Store original states
    const originalStates = stateContainer.clone()
    
    // k1: derivatives at current state
    const k1 = this.computeAllDerivativesWithValidation(
      statefulBlocks,
      blockStates,
      sheet,
      simulationState.time
    )
    
    if (!k1) {
      console.error('RK4 failed at k1 computation')
      return
    }
    
    // k2: derivatives at state + h/2 * k1
    this.applyStateUpdate(stateContainer, k1, h / 2, originalStates)
    this.updateBlockStatesFromContainer(statefulBlocks, blockStates, stateContainer)
    
    const k2 = this.computeAllDerivativesWithValidation(
      statefulBlocks,
      blockStates,
      sheet,
      simulationState.time + h / 2
    )
    
    if (!k2) {
      console.error('RK4 failed at k2 computation')
      // Restore original states
      this.updateBlockStatesFromContainer(statefulBlocks, blockStates, originalStates)
      return
    }
    
    // k3: derivatives at state + h/2 * k2
    this.applyStateUpdate(stateContainer, k2, h / 2, originalStates)
    this.updateBlockStatesFromContainer(statefulBlocks, blockStates, stateContainer)
    
    const k3 = this.computeAllDerivativesWithValidation(
      statefulBlocks,
      blockStates,
      sheet,
      simulationState.time + h / 2
    )
    
    if (!k3) {
      console.error('RK4 failed at k3 computation')
      // Restore original states
      this.updateBlockStatesFromContainer(statefulBlocks, blockStates, originalStates)
      return
    }
    
    // k4: derivatives at state + h * k3
    this.applyStateUpdate(stateContainer, k3, h, originalStates)
    this.updateBlockStatesFromContainer(statefulBlocks, blockStates, stateContainer)
    
    const k4 = this.computeAllDerivativesWithValidation(
      statefulBlocks,
      blockStates,
      sheet,
      simulationState.time + h
    )
    
    if (!k4) {
      console.error('RK4 failed at k4 computation')
      // Restore original states
      this.updateBlockStatesFromContainer(statefulBlocks, blockStates, originalStates)
      return
    }
    
    // Final update: x[n+1] = x[n] + h/6 * (k1 + 2*k2 + 2*k3 + k4)
    this.applyRK4Update(stateContainer, originalStates, k1, k2, k3, k4, h)
    
    // Validate final states
    const finalValidation = this.validateStateContainer(stateContainer)
    if (!finalValidation.valid) {
      console.error('RK4 produced invalid states:', finalValidation.errors)
      // Restore original states
      this.updateBlockStatesFromContainer(statefulBlocks, blockStates, originalStates)
    }
  }
  
  /**
   * Validate state container
   */
  private validateStateContainer(container: StateContainer): {
    valid: boolean,
    errors: string[]
  } {
    const errors: string[] = []
    
    for (const [blockId, states] of container.getAllStates()) {
      for (let i = 0; i < states.length; i++) {
        const value = states[i]
        
        if (!isFinite(value)) {
          if (isNaN(value)) {
            errors.push(`NaN state in block ${blockId}[${i}]`)
          } else if (value === Infinity) {
            errors.push(`Infinite state in block ${blockId}[${i}]`)
          } else if (value === -Infinity) {
            errors.push(`Negative infinite state in block ${blockId}[${i}]`)
          }
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    }
  }
```

## Task 11.14: Create Integration Method Comparison Tests

```typescript
// __tests__/integration/integration-methods.test.ts - Update with new tests

describe('Integration Method Comparison', () => {
  test('Compare Euler vs RK4 accuracy', async () => {
    // Create a test model with known analytical solution
    const testCases = [
      {
        name: 'First Order System',
        transferFunction: { num: [1], den: [1, 1] }, // H(s) = 1/(s+1)
        analyticalSolution: (t: number) => 1 - Math.exp(-t),
        testTimes: [0.1, 0.5, 1.0, 2.0, 5.0]
      },
      {
        name: 'Second Order System',
        transferFunction: { num: [1], den: [1, 3, 2] }, // H(s) = 1/(s+1)(s+2)
        analyticalSolution: (t: number) => 1 - 2*Math.exp(-t) + Math.exp(-2*t),
        testTimes: [0.1, 0.5, 1.0, 2.0, 5.0]
      }
    ]
    
    for (const testCase of testCases) {
      console.log(`\nTesting ${testCase.name}:`)
      console.log('Time\tAnalytical\tEuler\t\tRK4\t\tEuler Error\tRK4 Error')
      
      for (const endTime of testCase.testTimes) {
        // Test with Euler
        const eulerModel = new TestModelBuilder(`${testCase.name} - Euler`)
          .withSimulationParams(endTime, 0.01)
          .withTestInputs({ Input: 1.0 })
          .withIntegrationMethod('euler')
          .addInput('Input')
          .addTransferFunction(testCase.transferFunction.num, testCase.transferFunction.den)
          .addOutput('Output')
          .connectByName('Input', 'TransferFunction1')
          .connectByName('TransferFunction1', 'Output')
          .build()
        
        // Test with RK4
        const rk4Model = new TestModelBuilder(`${testCase.name} - RK4`)
          .withSimulationParams(endTime, 0.01)
          .withTestInputs({ Input: 1.0 })
          .withIntegrationMethod('rk4')
          .addInput('Input')
          .addTransferFunction(testCase.transferFunction.num, testCase.transferFunction.den)
          .addOutput('Output')
          .connectByName('Input', 'TransferFunction1')
          .connectByName('TransferFunction1', 'Output')
          .build()
        
        const executor = new ModelExecutor({ verbose: false })
        const eulerResult = await executor.executeSimulation(eulerModel)
        const rk4Result = await executor.executeSimulation(rk4Model)
        
        const analyticalValue = testCase.analyticalSolution(endTime)
        const eulerValue = eulerResult.outputs.Output as number
        const rk4Value = rk4Result.outputs.Output as number
        
        const eulerError = Math.abs(eulerValue - analyticalValue)
        const rk4Error = Math.abs(rk4Value - analyticalValue)
        
        console.log(
          `${endTime.toFixed(1)}\t${analyticalValue.toFixed(6)}\t` +
          `${eulerValue.toFixed(6)}\t${rk4Value.toFixed(6)}\t` +
          `${eulerError.toFixed(6)}\t${rk4Error.toFixed(6)}`
        )
        
        // RK4 should be more accurate than Euler
        expect(rk4Error).toBeLessThanOrEqual(eulerError)
        
        // Both should be reasonably accurate
        expect(eulerError).toBeLessThan(0.01)
        expect(rk4Error).toBeLessThan(0.001)
      }
    }
  })
  
  test('Integration stability with large time steps', async () => {
    const timeSteps = [0.001, 0.01, 0.1, 0.5]
    const results: any[] = []
    
    for (const dt of timeSteps) {
      // Fast system that might be unstable with large time steps
      const model = new TestModelBuilder('Stability Test')
        .withSimulationParams(1.0, dt)
        .withTestInputs({ Input: 1.0 })
        .withIntegrationMethod('rk4')
        .addInput('Input')
        .addTransferFunction([10], [1, 10]) // Fast time constant
        .addOutput('Output')
        .connectByName('Input', 'TransferFunction1')
        .connectByName('TransferFunction1', 'Output')
        .build()
      
      const executor = new ModelExecutor({ verbose: false })
      const result = await executor.executeSimulation(model)
      
      results.push({
        timeStep: dt,
        success: result.success,
        finalValue: result.outputs.Output,
        isStable: isFinite(result.outputs.Output as number)
      })
    }
    
    console.log('\nStability Test Results:')
    console.log('Time Step\tSuccess\tFinal Value\tStable')
    results.forEach(r => {
      console.log(`${r.timeStep}\t\t${r.success}\t${r.finalValue?.toFixed(6) || 'N/A'}\t${r.isStable}`)
    })
    
    // All should be stable with RK4
    results.forEach(r => {
      expect(r.isStable).toBe(true)
    })
  })
  
  test('Derivative validation catches numerical issues', async () => {
    // Create a model that will produce large derivatives
    const model = new TestModelBuilder('Numerical Issues Test')
      .withSimulationParams(1.0, 0.01)
      .withTestInputs({ Input: 1e10 }) // Very large input
      .addInput('Input')
      .addTransferFunction([1e5], [1e-10, 1]) // Poorly scaled system
      .addOutput('Output')
      .connectByName('Input', 'TransferFunction1')
      .connectByName('TransferFunction1', 'Output')
      .build()
    
    const executor = new ModelExecutor({ verbose: false })
    const result = await executor.executeSimulation(model)
    
    // Should either handle gracefully or report the issue
    if (!result.success) {
      expect(result.error).toContain('derivative')
    } else {
      // If it succeeds, the value should at least be finite
      expect(isFinite(result.outputs.Output as number)).toBe(true)
    }
  })
})
```

## Task 11.15: Update Other Stateful Block Modules

Currently, only TransferFunction has state, but let's create a template for future stateful blocks:

```typescript
// lib/blocks/IntegratorBlockModule.ts - Example of another stateful block

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

/**
 * Example integrator block module showing how to implement computeDerivatives
 */
export class IntegratorBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const stateName = `model->states.${BlockModuleUtils.sanitizeIdentifier(block.name)}_state`
    
    return `    ${outputName} = ${stateName}; /* Integrator output */\n`
  }
  
  getOutputType(block: BlockData, inputTypes: string[]): string {
    return inputTypes[0] || 'double'
  }
  
  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }
  
  requiresState(block: BlockData): boolean {
    return true // Integrators always have state
  }
  
  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    return [`    double ${name}_state; /* Integrator state */`]
  }
  
  executeSimulation(
    blockState: BlockState,
    inputs: any[],
    simulationState: SimulationState
  ): void {
    // Output is just the current state
    blockState.outputs[0] = blockState.internalState?.state || 0
  }
  
  computeDerivatives(
    blockState: BlockState,
    inputs: any[],
    time: number
  ): number[] | undefined {
    // For an integrator, derivative equals input
    const input = inputs[0]
    
    if (typeof input === 'number') {
      return [input]
    } else if (Array.isArray(input)) {
      // For vector input, return vector of derivatives
      return input.map(val => typeof val === 'number' ? val : 0)
    }
    
    return [0]
  }
  
  getInputPortCount(block: BlockData): number {
    return 1
  }
  
  getOutputPortCount(block: BlockData): number {
    return 1
  }
}
```

## Task 11.16: Add Performance Benchmarks

```typescript
// __tests__/performance/integration-benchmarks.test.ts

import { TestModelBuilder } from '../utils/TestModelBuilder'
import { ModelExecutor } from '../utils/ModelExecutor'

describe('Integration Performance Benchmarks', () => {
  test('Measure integration overhead', async () => {
    const blockCounts = [10, 50, 100]
    const methods = ['euler', 'rk4'] as const
    
    const results: any[] = []
    
    for (const count of blockCounts) {
      for (const method of methods) {
        // Create a chain of transfer functions
        const builder = new TestModelBuilder(`Chain-${count}-${method}`)
          .withSimulationParams(1.0, 0.01) // 100 time steps
          .withTestInputs({ Input: 1.0 })
          .withIntegrationMethod(method)
          .addInput('Input')
        
        // Add transfer functions in series
        for (let i = 0; i < count; i++) {
          builder.addTransferFunction([1], [1, 1])
        }
        
        builder.addOutput('Output')
        
        // Connect in series
        builder.connectByName('Input', 'TransferFunction1')
        for (let i = 1; i < count; i++) {
          builder.connectByName(`TransferFunction${i}`, `TransferFunction${i + 1}`)
        }
        builder.connectByName(`TransferFunction${count}`, 'Output')
        
        const model = builder.build()
        
        // Measure execution time
        const executor = new ModelExecutor({ verbose: false })
        const startTime = performance.now()
        const result = await executor.executeSimulation(model)
        const endTime = performance.now()
        
        results.push({
          blocks: count,
          method,
          time: endTime - startTime,
          success: result.success
        })
      }
    }
    
    // Display results
    console.log('\nIntegration Performance Results:')
    console.log('Blocks\tMethod\tTime (ms)')
    results.forEach(r => {
      console.log(`${r.blocks}\t${r.method}\t${r.time.toFixed(2)}`)
    })
    
    // Compare overhead
    for (const count of blockCounts) {
      const euler = results.find(r => r.blocks === count && r.method === 'euler')
      const rk4 = results.find(r => r.blocks === count && r.method === 'rk4')
      
      if (euler && rk4) {
        const overhead = (rk4.time - euler.time) / euler.time
        console.log(`\nRK4 overhead for ${count} blocks: ${(overhead * 100).toFixed(1)}%`)
        
        // RK4 should be slower but not by more than 4x (since it does 4 evaluations)
        expect(overhead).toBeLessThan(5)
      }
    }
  })
  
  test('Memory usage comparison', () => {
    // This is a conceptual test - in a real implementation,
    // we would measure actual memory usage
    
    const stateSize = 8 // bytes per double
    const blocksCount = 100
    const statesPerBlock = 2 // average
    
    const baseMemory = blocksCount * statesPerBlock * stateSize
    
    // Euler needs only current states
    const eulerMemory = baseMemory
    
    // RK4 needs 4 intermediate state copies
    const rk4Memory = baseMemory * 5 // original + 4 k values
    
    console.log('\nMemory Usage Estimation:')
    console.log(`Base state memory: ${baseMemory} bytes`)
    console.log(`Euler total: ${eulerMemory} bytes`)
    console.log(`RK4 total: ${rk4Memory} bytes`)
    console.log(`RK4 overhead: ${((rk4Memory - eulerMemory) / eulerMemory * 100).toFixed(1)}%`)
    
    // Memory overhead should be reasonable
    expect(rk4Memory).toBeLessThan(eulerMemory * 10)
  })
})
```

## Task 11.17: Update Code Generation for Consistency

We need to ensure the C code generation matches the new derivative-based approach:

```typescript
// lib/codegen/StateIntegrator.ts - New file for generating integration code

import { FlattenedModel } from './ModelFlattener'
import { CCodeBuilder } from './CCodeBuilder'
import { BlockModuleFactory } from '../blocks/BlockModuleFactory'

export class StateIntegrator {
  private model: FlattenedModel
  private modelName: string
  
  constructor(model: FlattenedModel) {
    this.model = model
    this.modelName = CCodeBuilder.sanitizeIdentifier(model.metadata.modelName)
  }
  
  /**
   * Generate Euler integration code
   */
  generateEulerIntegration(): string {
    let code = `    /* Euler integration of states */\n`
    
    // Find all stateful blocks
    const statefulBlocks = this.model.blocks.filter(block => {
      try {
        const module = BlockModuleFactory.getBlockModule(block.block.type)
        return module.requiresState(block.block)
      } catch {
        return false
      }
    })
    
    if (statefulBlocks.length === 0) {
      return ''
    }
    
    code += `    /* Compute derivatives */\n`
    code += `    ${this.modelName}_states_t derivatives;\n`
    code += `    ${this.modelName}_derivatives(\n`
    code += `        model->time,\n`
    code += `        &model->inputs,\n`
    code += `        &model->signals,\n`
    code += `        &model->states,\n`
    code += `        &derivatives\n`
    
    if (this.model.subsystemEnableInfo.some(info => info.hasEnableInput)) {
      code += `,\n        &model->enable_states`
    }
    
    code += `\n    );\n\n`
    
    code += `    /* Update states: x[n+1] = x[n] + dt * dx/dt */\n`
    
    // Generate state update code for each stateful block
    for (const block of statefulBlocks) {
      const module = BlockModuleFactory.getBlockModule(block.block.type)
      if (module.generateStateDerivative) {
        const safeName = CCodeBuilder.sanitizeIdentifier(block.block.name)
        
        // This is a simplified example - actual implementation would need
        // to handle vectors and matrices properly
        code += `    /* Update ${block.block.name} states */\n`
        
        if (block.block.type === 'transfer_function') {
          const denominator = block.block.parameters?.denominator || [1, 1]
          const stateOrder = Math.max(0, denominator.length - 1)
          
          for (let i = 0; i < stateOrder; i++) {
            code += `    model->states.${safeName}_states[${i}] += `
            code += `model->dt * derivatives.${safeName}_states[${i}];\n`
          }
        }
      }
    }
    
    return code
  }
  
  /**
   * Generate RK4 integration code
   */
  generateRK4Integration(): string {
    // This would be more complex, implementing the full RK4 algorithm
    // For now, return a placeholder
    return `    /* RK4 integration - implementation pending */\n`
  }
}
```

## Task 11.18: Document Integration Architecture

```typescript
// docs/integration-architecture.md

# Integration Architecture

## Overview

The simulation engine uses a two-layer architecture that separates algebraic computations from time-based integration. This design provides better modularity, testability, and support for multiple integration methods.

## Architecture Layers

### 1. Algebraic Layer
- **Purpose**: Compute all block outputs based on current inputs and states
- **Characteristics**:
  - Pure function: (inputs, states) → outputs
  - No state changes
  - No time advancement
  - Can be called multiple times per time step (for RK4)

### 2. Integration Layer
- **Purpose**: Update states based on derivatives
- **Characteristics**:
  - Manages time advancement
  - Orchestrates integration methods (Euler, RK4)
  - Handles enable state transitions
  - Validates numerical stability

## Block Module Interface

Each block module implements the `IBlockModule` interface with these key methods:

```typescript
interface IBlockModule {
  // Existing methods...
  
  // New method for derivative computation
  computeDerivatives?(
    blockState: BlockState,
    inputs: any[],
    time: number
  ): number[] | undefined
}
```

## Integration Methods

### Euler Integration
- First-order accuracy
- Simple: x[n+1] = x[n] + dt * f(x[n], t[n])
- Fast but less accurate
- Good for testing and non-stiff systems

### RK4 Integration
- Fourth-order accuracy
- Requires 4 derivative evaluations per step
- More accurate for same step size
- Better stability properties

## State Management

States are managed through the `StateContainer` interface:
- Supports cloning for RK4 intermediate steps
- Handles scalar, vector, and matrix states
- Provides rollback capability

## Benefits

1. **Correctness**: Proper handling of cascaded dynamic systems
2. **Flexibility**: Easy to add new integration methods
3. **Performance**: Algebraic computations can be optimized independently
4. **Testing**: Integration methods can be tested in isolation
5. **Debugging**: Clear separation of concerns

## Migration Guide

To add a new stateful block:

1. Implement `requiresState()` → return true
2. Implement `computeDerivatives()` → return state derivatives
3. Update `executeSimulation()` → only compute outputs
4. Add state struct members in `generateStateStructMembers()`

## Example: Transfer Function

Before (embedded RK4):
```typescript
// RK4 integration embedded in processTransferFunctionElement
const k1 = dydt(currentState, input)
const k2 = dydt(currentState + 0.5 * h * k1, input)
// ... etc
states[0] = currentState + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
```

After (separated):
```typescript
// In computeDerivatives
derivatives[0] = (b0 * input - a0 * states[0]) / a1

// In executeSimulation
blockState.outputs[0] = states[0] // Just output current state
```
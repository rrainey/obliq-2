// lib/blocks/TransferFunctionBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class TransferFunctionBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const tfName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const denominator = block.parameters?.denominator || [1, 1]
    const stateOrder = Math.max(0, denominator.length - 1)
    
    let code = `    // Transfer function block: ${block.name}\n`
    
    if (inputs.length === 0) {
      code += `    ${outputName} = 0.0; // No input\n`
      return code
    }
    
    if (stateOrder === 0) {
      // Pure gain (no dynamics)
      const numerator = block.parameters?.numerator || [1]
      const gain = (numerator[0] || 0) / (denominator[0] || 1)
      const inputExpr = inputs[0]
      
      // Get type info for proper handling
      const outputType = this.getOutputType(block, [])
      const typeInfo = BlockModuleUtils.parseType(outputType)
      
      if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
        code += `    // Matrix element-wise gain\n`
        code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
        code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
        code += `            ${outputName}[i][j] = ${inputExpr}[i][j] * ${gain};\n`
        code += `        }\n`
        code += `    }\n`
      } else if (typeInfo.isArray && typeInfo.arraySize) {
        code += `    // Vector element-wise gain\n`
        code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
        code += `        ${outputName}[i] = ${inputExpr}[i] * ${gain};\n`
        code += `    }\n`
      } else {
        code += `    ${outputName} = ${inputExpr} * ${gain};\n`
      }
    } else {
      // Dynamic system - output equals first state
      const outputType = this.getOutputType(block, [])
      const typeInfo = BlockModuleUtils.parseType(outputType)
      
      if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
        code += `    // Matrix transfer function output\n`
        code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
        code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
        code += `            ${outputName}[i][j] = model->states.${tfName}_states[i][j][0];\n`
        code += `        }\n`
        code += `    }\n`
      } else if (typeInfo.isArray && typeInfo.arraySize) {
        code += `    // Vector transfer function output\n`
        code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
        code += `        ${outputName}[i] = model->states.${tfName}_states[i][0];\n`
        code += `    }\n`
      } else {
        code += `    // Scalar transfer function output\n`
        code += `    ${outputName} = model->states.${tfName}_states[0];\n`
      }
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Transfer function output type matches input type
    if (inputTypes.length === 0) {
      return 'double' // Default type
    }
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Transfer function blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Transfer functions need state if denominator order > 0
    const denominator = block.parameters?.denominator || [1, 1]
    return denominator.length > 1
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    const denominator = block.parameters?.denominator || [1, 1]
    const stateOrder = Math.max(0, denominator.length - 1)
    
    if (stateOrder === 0) {
      return [] // No states needed
    }
    
    const tfName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const typeInfo = BlockModuleUtils.parseType(outputType)
    const members: string[] = []
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Matrix transfer function - need 3D array of states
      members.push(`    double ${tfName}_states[${typeInfo.rows}][${typeInfo.cols}][${stateOrder}];`)
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Vector transfer function - need 2D array of states
      members.push(`    double ${tfName}_states[${typeInfo.arraySize}][${stateOrder}];`)
    } else {
      // Scalar transfer function
      members.push(`    double ${tfName}_states[${stateOrder}];`)
    }
    
    return members
  }

  generateInitialization(block: BlockData): string {
    const denominator = block.parameters?.denominator || [1, 1]
    const stateOrder = Math.max(0, denominator.length - 1)
    
    if (stateOrder === 0) {
      return '' // No initialization needed
    }
    
    const tfName = BlockModuleUtils.sanitizeIdentifier(block.name)
    
    // Initialize transfer function states to zero
    return `    memset(model->states.${tfName}_states, 0, sizeof(model->states.${tfName}_states));\n`
  }

  executeSimulation(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void {
    const input = inputs[0]
    const { numerator, denominator } = blockState.internalState
    
    // Check if this block is in an enabled subsystem
    const containingSubsystem = this.getContainingSubsystem(blockState.blockId, simulationState)
    const isEnabled = containingSubsystem ? this.isSubsystemEnabled(containingSubsystem, simulationState) : true
    
    // Validate coefficients
    if (!denominator || denominator.length === 0) {
      blockState.outputs[0] = Array.isArray(input) ? 
        (Array.isArray(input[0]) ? 
          (input as unknown as number[][]).map(row => row.map(() => 0)) : 
          new Array((input as number[]).length).fill(0)) : 
        0
      return
    }
    
    // Check if input is a matrix
    if (Array.isArray(input) && Array.isArray(input[0])) {
      // Process matrix element-wise
      const matrix = input as unknown as number[][]
      const rows = matrix.length
      const cols = matrix[0]?.length || 0
      const stateOrder = Math.max(0, denominator.length - 1)
      
      // Initialize matrix states if needed
      if (!blockState.internalState.matrixStates || 
          blockState.internalState.matrixStates.length !== rows ||
          blockState.internalState.matrixStates[0]?.length !== cols) {
        // Initialize states for each matrix element
        blockState.internalState.matrixStates = []
        for (let i = 0; i < rows; i++) {
          blockState.internalState.matrixStates[i] = []
          for (let j = 0; j < cols; j++) {
            blockState.internalState.matrixStates[i][j] = new Array(stateOrder).fill(0)
          }
        }
      }
      
      // Process each element independently
      const output: number[][] = []
      for (let i = 0; i < rows; i++) {
        output[i] = []
        for (let j = 0; j < cols; j++) {
          const elementInput = matrix[i][j]
          const elementStates = blockState.internalState.matrixStates[i][j]
          
          if (isEnabled) {
            // Apply transfer function to this element
            output[i][j] = this.processTransferFunctionElement(
              elementInput,
              numerator,
              denominator,
              elementStates,
              simulationState.timeStep
            )
          } else {
            // Subsystem is disabled - use frozen state
            output[i][j] = this.getTransferFunctionOutputWithoutUpdate(
              elementInput,
              numerator,
              denominator,
              elementStates
            )
          }
        }
      }
      
      blockState.outputs[0] = output
      
    } else if (Array.isArray(input)) {
      // Process vector element-wise
      const vectorSize = input.length
      const stateOrder = Math.max(0, denominator.length - 1)
      
      if (!blockState.internalState.vectorStates || 
          blockState.internalState.vectorStates.length !== vectorSize) {
        // Initialize states for each element
        blockState.internalState.vectorStates = []
        for (let i = 0; i < vectorSize; i++) {
          blockState.internalState.vectorStates.push(new Array(stateOrder).fill(0))
        }
      }
      
      // Process each element independently
      const output = new Array(vectorSize)
      
      for (let idx = 0; idx < vectorSize; idx++) {
        const elementInput = typeof input[idx] === 'number' ? input[idx] as number : 0
        const elementStates = blockState.internalState.vectorStates[idx]
        
        if (isEnabled) {
          // Apply transfer function to this element
          output[idx] = this.processTransferFunctionElement(
            elementInput,
            numerator,
            denominator,
            elementStates,
            simulationState.timeStep
          )
        } else {
          // Subsystem is disabled - use frozen state
          output[idx] = this.getTransferFunctionOutputWithoutUpdate(
            elementInput,
            numerator,
            denominator,
            elementStates
          )
        }
      }
      
      blockState.outputs[0] = output
      
    } else if (typeof input === 'number') {
      // Scalar processing
      const states = blockState.internalState.states
      
      if (isEnabled) {
        blockState.outputs[0] = this.processTransferFunctionElement(
          input,
          numerator,
          denominator,
          states,
          simulationState.timeStep
        )
      } else {
        // Subsystem is disabled - use frozen state
        blockState.outputs[0] = this.getTransferFunctionOutputWithoutUpdate(
          input,
          numerator,
          denominator,
          states
        )
      }
    } else {
      blockState.outputs[0] = 0
    }
    
    // Update frozen outputs if enabled
    if (isEnabled || blockState.frozenOutputs === undefined) {
      blockState.frozenOutputs = [...blockState.outputs]
    }
  }

  getInputPortCount(block: BlockData): number {
    // Transfer function blocks have exactly 1 input
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    // Transfer function blocks have exactly 1 output
    return 1
  }

  // No custom port labels needed
  getInputPortLabels?(block: BlockData): string[] | undefined {
    return undefined
  }

  getOutputPortLabels?(block: BlockData): string[] | undefined {
    return undefined
  }

  /**
   * Helper method to get containing subsystem
   */
  private getContainingSubsystem(blockId: string, simulationState: SimulationState): string | null {
    return (simulationState as any).parentSubsystemMap?.get(blockId) ?? null
  }

  /**
   * Helper method to check if subsystem is enabled
   */
  private isSubsystemEnabled(subsystemId: string, simulationState: SimulationState): boolean {
    return (simulationState as any).subsystemEnableStates?.get(subsystemId) ?? true
  }

  /**
   * Get transfer function output without updating states (for disabled subsystems)
   */
  private getTransferFunctionOutputWithoutUpdate(
    input: number,
    numerator: number[],
    denominator: number[],
    states: number[]
  ): number {
    // Pure gain case
    if (denominator.length === 1) {
      return input * (numerator[0] || 0) / denominator[0]
    }
    
    // For dynamic systems, output the current state value
    if (states.length > 0) {
      return states[0] // First state is typically the output
    }
    
    return 0
  }
  
  /**
   * Process a single transfer function element
   */
  private processTransferFunctionElement(
    input: number,
    numerator: number[],
    denominator: number[],
    states: number[],
    timeStep: number
  ): number {

    
    // Pure gain case: H(s) = K (only constant term)
    if (denominator.length === 1) {
      return input * (numerator[0] || 0) / denominator[0]
    }
    
    // First order system: H(s) = b0 / (a1*s + a0)
    if (denominator.length === 2) {
      const a1 = denominator[0] // s term coefficient
      const a0 = denominator[1] // constant term
      const b0 = numerator[numerator.length - 1] || 0
      
      if (a1 === 0) {
        // Degenerate case - pure gain
        if (a0 !== 0) {
          return input * b0 / a0
        } else {
          return 0
        }
      }
      
      const currentState = states[0] || 0
      const h = timeStep
      
      // Define the derivative function
      const dydt = (y: number, u: number) => (b0 * u - a0 * y) / a1
      
      // Runge-Kutta 4th order integration
      const k1 = dydt(currentState, input)
      const k2 = dydt(currentState + 0.5 * h * k1, input)
      const k3 = dydt(currentState + 0.5 * h * k2, input)
      const k4 = dydt(currentState + h * k3, input)
      
      // Update state using RK4
      states[0] = currentState + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
      
      // Output equals the state for first-order systems
      return states[0]
    }
    else if (denominator.length === 3) {
      // Second order system
      const a2 = denominator[0] // s^2 coefficient
      const a1 = denominator[1] // s coefficient
      const a0 = denominator[2] // constant term
      const b0 = numerator[numerator.length - 1] || 0
      
      if (a2 === 0) {
        return 0
      }
      
      const x1 = states[0] || 0
      const x2 = states[1] || 0
      const h = timeStep
      
      // System equations
      const f1 = (x1: number, x2: number, u: number) => x2
      const f2 = (x1: number, x2: number, u: number) => (b0 * u - a0 * x1 - a1 * x2) / a2
      
      // RK4 integration
      const k1_1 = f1(x1, x2, input)
      const k1_2 = f2(x1, x2, input)
      
      const k2_1 = f1(x1 + 0.5 * h * k1_1, x2 + 0.5 * h * k1_2, input)
      const k2_2 = f2(x1 + 0.5 * h * k1_1, x2 + 0.5 * h * k1_2, input)
      
      const k3_1 = f1(x1 + 0.5 * h * k2_1, x2 + 0.5 * h * k2_2, input)
      const k3_2 = f2(x1 + 0.5 * h * k2_1, x2 + 0.5 * h * k2_2, input)
      
      const k4_1 = f1(x1 + h * k3_1, x2 + h * k3_2, input)
      const k4_2 = f2(x1 + h * k3_1, x2 + h * k3_2, input)
      
      // Update states
      states[0] = x1 + (h / 6) * (k1_1 + 2 * k2_1 + 2 * k3_1 + k4_1)
      states[1] = x2 + (h / 6) * (k1_2 + 2 * k2_2 + 2 * k3_2 + k4_2)
      
      return states[0]
    }
    else {
      // Higher order systems - simplified implementation
      const highestOrderCoeff = denominator[0]
      const lowestOrderCoeff = denominator[denominator.length - 1]
      const timeConstant = Math.abs(highestOrderCoeff / lowestOrderCoeff)
      const gain = (numerator[numerator.length - 1] || 0) / (lowestOrderCoeff || 1)
      
      const currentState = states[0] || 0
      const derivative = (gain * input - currentState) / timeConstant
      states[0] = currentState + derivative * timeStep
      
      return states[0]
    }
  }

  /**
   * Generate state derivative computation for RK4 integration (for code generation)
   */
  generateStateDerivative(
    block: BlockData, 
    inputExpr: string,
    stateAccessor: string = 'current_states',
    outputType: string
  ): string {
    const tfName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const numerator = block.parameters?.numerator || [1]
    const denominator = block.parameters?.denominator || [1, 1]
    const stateOrder = Math.max(0, denominator.length - 1)
    const typeInfo = BlockModuleUtils.parseType(outputType)
    
    let code = `    // Transfer function: ${block.name}\n`
    
    if (stateOrder === 0) {
      return '' // No derivatives for zero-order systems
    }
    
    if (stateOrder === 1) {
      // First-order: dy/dt = (b0*u - a0*y) / a1
      const a1 = denominator[0]
      const a0 = denominator[1]
      const b0 = numerator[numerator.length - 1] || 0
      
      if (typeInfo.isArray && typeInfo.arraySize) {
        code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
        code += `        double u = ${inputExpr}[i];\n`
        code += `        double y = ${stateAccessor}->${tfName}_states[i][0];\n`
        code += `        state_derivatives->${tfName}_states[i][0] = (${b0} * u - ${a0} * y) / ${a1};\n`
        code += `    }\n`
      } else {
        code += `    {\n`
        code += `        double u = ${inputExpr};\n`
        code += `        double y = ${stateAccessor}->${tfName}_states[0];\n`
        code += `        state_derivatives->${tfName}_states[0] = (${b0} * u - ${a0} * y) / ${a1};\n`
        code += `    }\n`
      }
    } else if (stateOrder === 2) {
      // Second-order system in controllable canonical form
      const a2 = denominator[0]
      const a1 = denominator[1]
      const a0 = denominator[2]
      const b0 = numerator[numerator.length - 1] || 0
      
      if (typeInfo.isArray && typeInfo.arraySize) {
        code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
        code += `        double u = ${inputExpr}[i];\n`
        code += `        double x1 = ${stateAccessor}->${tfName}_states[i][0];\n`
        code += `        double x2 = ${stateAccessor}->${tfName}_states[i][1];\n`
        code += `        state_derivatives->${tfName}_states[i][0] = x2;\n`
        code += `        state_derivatives->${tfName}_states[i][1] = (${b0} * u - ${a0} * x1 - ${a1} * x2) / ${a2};\n`
        code += `    }\n`
      } else {
        code += `    {\n`
        code += `        double u = ${inputExpr};\n`
        code += `        double x1 = ${stateAccessor}->${tfName}_states[0];\n`
        code += `        double x2 = ${stateAccessor}->${tfName}_states[1];\n`
        code += `        state_derivatives->${tfName}_states[0] = x2;\n`
        code += `        state_derivatives->${tfName}_states[1] = (${b0} * u - ${a0} * x1 - ${a1} * x2) / ${a2};\n`
        code += `    }\n`
      }
    }
    
    return code
  }
}
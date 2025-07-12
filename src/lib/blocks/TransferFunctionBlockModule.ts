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
      
      // Compute output for each element
      const output: number[][] = []
      for (let i = 0; i < rows; i++) {
        output[i] = []
        for (let j = 0; j < cols; j++) {
          const elementInput = matrix[i][j]
          const elementStates = blockState.internalState.matrixStates[i][j]
          
          // Just compute output from current state
          output[i][j] = this.computeOutputFromState(
            elementInput,
            numerator,
            denominator,
            elementStates
          )
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
      
      // Compute output for each element
      const output = new Array(vectorSize)
      
      for (let idx = 0; idx < vectorSize; idx++) {
        const elementInput = typeof input[idx] === 'number' ? input[idx] as number : 0
        const elementStates = blockState.internalState.vectorStates[idx]
        
        output[idx] = this.computeOutputFromState(
          elementInput,
          numerator,
          denominator,
          elementStates
        )
      }
      
      blockState.outputs[0] = output
      
    } else if (typeof input === 'number') {
      // Scalar processing
      const states = blockState.internalState.states
      
      blockState.outputs[0] = this.computeOutputFromState(
        input,
        numerator,
        denominator,
        states
      )
    } else {
      blockState.outputs[0] = 0
    }
    
    // Update frozen outputs if enabled
    if (isEnabled || blockState.frozenOutputs === undefined) {
      blockState.frozenOutputs = [...blockState.outputs]
    }
  }

  /**
   * Compute output from current state (no integration)
   */
  private computeOutputFromState(
    input: number,
    numerator: number[],
    denominator: number[],
    states: number[]
  ): number {
    // Pure gain case
    if (denominator.length === 1) {
      return input * (numerator[0] || 0) / denominator[0]
    }
    
    // For dynamic systems, output equals the first state
    return states[0] || 0
  }

  isDirectFeedthrough?(block: BlockData): boolean {
    // Transfer function blocks are direct feedthrough only if 
    // the order of the numerator and denominator polynomials are equal.
    const numerator = block.parameters?.numerator || [1]
    const denominator = block.parameters?.denominator || [1]
    return numerator.length === denominator.length
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
   * Now only computes output from current state, no integration
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
    
    // For dynamic systems, output equals the first state
    // The state integration is now handled externally
    return states[0] || 0
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
    
    let code = `    /* State derivatives for ${block.name} */\n`
    
    if (stateOrder === 0) {
      return '    /* No derivatives - algebraic block */\n'
    }
    
    // Handle different type cases
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Matrix transfer function
      code += `    /* Matrix transfer function (${typeInfo.rows}x${typeInfo.cols}) */\n`
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += this.generateScalarDerivative(
        tfName,
        `${inputExpr}[i][j]`,
        `${stateAccessor}->${tfName}_states[i][j]`,
        `state_derivatives->${tfName}_states[i][j]`,
        numerator,
        denominator,
        stateOrder,
        3 // indent level
      )
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Vector transfer function
      code += `    /* Vector transfer function (size ${typeInfo.arraySize}) */\n`
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += this.generateScalarDerivative(
        tfName,
        `${inputExpr}[i]`,
        `${stateAccessor}->${tfName}_states[i]`,
        `state_derivatives->${tfName}_states[i]`,
        numerator,
        denominator,
        stateOrder,
        2 // indent level
      )
      code += `    }\n`
    } else {
      // Scalar transfer function
      code += this.generateScalarDerivative(
        tfName,
        inputExpr,
        `${stateAccessor}->${tfName}_states`,
        `state_derivatives->${tfName}_states`,
        numerator,
        denominator,
        stateOrder,
        1 // indent level
      )
    }
    
    return code
  }
  
  /**
   * Generate derivative computation for a scalar transfer function
   */
  private generateScalarDerivative(
    tfName: string,
    inputExpr: string,
    stateAccessor: string,
    derivativeAccessor: string,
    numerator: number[],
    denominator: number[],
    stateOrder: number,
    indentLevel: number
  ): string {
    const indent = '    '.repeat(indentLevel)
    let code = ''
    
    // Normalize by leading coefficient
    const a_n = denominator[0]
    if (Math.abs(a_n) < 1e-10) {
      return `${indent}/* Error: Leading denominator coefficient is zero */\n`
    }
    
    // Controllable canonical form:
    // x'[0] = x[1]
    // x'[1] = x[2]
    // ...
    // x'[n-2] = x[n-1]
    // x'[n-1] = -a[0]/a[n]*x[0] - a[1]/a[n]*x[1] - ... - a[n-1]/a[n]*x[n-1] + b[0]/a[n]*u
    
    for (let i = 0; i < stateOrder; i++) {
      if (i < stateOrder - 1) {
        // x'[i] = x[i+1]
        code += `${indent}${derivativeAccessor}[${i}] = ${stateAccessor}[${i + 1}];\n`
      } else {
        // Last state derivative
        code += `${indent}${derivativeAccessor}[${i}] = `
        
        // Input contribution: b[0]/a[n] * u
        // For transfer functions, we typically only have b[0] (or b[n] depending on notation)
        const b_0 = numerator[0] || 0
        if (Math.abs(b_0) > 1e-10) {
          code += `(${b_0 / a_n}) * ${inputExpr}`
        } else {
          code += `0.0`
        }
        
        // Feedback terms: -a[i]/a[n] * x[i]
        for (let j = 0; j < stateOrder; j++) {
          const a_j = denominator[denominator.length - 1 - j] || 0
          if (Math.abs(a_j) > 1e-10) {
            code += ` - (${a_j / a_n}) * ${stateAccessor}[${j}]`
          }
        }
        
        code += `;\n`
      }
    }
    
    return code
  }

  // lib/blocks/TransferFunctionBlockModule.ts - Add this method to the class

  computeDerivatives(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    time: number
  ): number[] | undefined {
    const input = inputs[0]
    const { numerator, denominator } = blockState.internalState
    
    // Validate coefficients
    if (!denominator || denominator.length === 0) {
      return undefined
    }
    
    const stateOrder = Math.max(0, denominator.length - 1)
    if (stateOrder === 0) {
      return undefined // No states, no derivatives
    }
    
    // Handle different input types
    if (Array.isArray(input) && Array.isArray(input[0])) {
      // Matrix input - compute derivatives for each element
      const matrix = input as unknown as number[][]
      const rows = matrix.length
      const cols = matrix[0]?.length || 0
      const derivatives: number[] = []
      
      // Flatten derivatives for all matrix elements
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const elementInput = matrix[i][j]
          const elementStates = blockState.internalState.matrixStates?.[i]?.[j] || []
          const elementDerivs = this.computeScalarDerivatives(
            elementInput,
            numerator,
            denominator,
            elementStates
          )
          derivatives.push(...elementDerivs)
        }
      }
      
      return derivatives
      
    } else if (Array.isArray(input)) {
      // Vector input - compute derivatives for each element
      const derivatives: number[] = []
      
      for (let idx = 0; idx < input.length; idx++) {
        const elementInput = typeof input[idx] === 'number' ? input[idx] as number : 0
        const elementStates = blockState.internalState.vectorStates?.[idx] || []
        const elementDerivs = this.computeScalarDerivatives(
          elementInput,
          numerator,
          denominator,
          elementStates
        )
        derivatives.push(...elementDerivs)
      }
      
      return derivatives
      
    } else if (typeof input === 'number') {
      // Scalar input
      const states = blockState.internalState.states || []
      return this.computeScalarDerivatives(input, numerator, denominator, states)
    }
    
    return undefined
  }

  /**
   * Compute derivatives for a scalar transfer function
   */
  private computeScalarDerivatives(
    input: number,
    numerator: number[],
    denominator: number[],
    states: number[]
  ): number[] {
    const stateOrder = Math.max(0, denominator.length - 1)
    if (stateOrder === 0) return []
    
    const derivatives: number[] = new Array(stateOrder)
    
    if (denominator.length === 2) {
      // First order: dx/dt = (b0*u - a0*x) / a1
      const a1 = denominator[0]
      const a0 = denominator[1]
      const b0 = numerator[numerator.length - 1] || 0
      
      if (a1 === 0) return [0]
      
      derivatives[0] = (b0 * input - a0 * (states[0] || 0)) / a1
      
    } else if (denominator.length === 3) {
      // Second order: convert to state space
      const a2 = denominator[0]
      const a1 = denominator[1]
      const a0 = denominator[2]
      const b0 = numerator[numerator.length - 1] || 0
      
      if (a2 === 0) return [0, 0]
      
      // x1' = x2
      derivatives[0] = states[1] || 0
      
      // x2' = (b0*u - a0*x1 - a1*x2) / a2
      derivatives[1] = (b0 * input - a0 * (states[0] || 0) - a1 * (states[1] || 0)) / a2
      
    } else {
      // Higher order - use controllable canonical form
      // x'[i] = x[i+1] for i < n-1
      // x'[n-1] = -sum(a[i]/a[n] * x[i]) + b[0]/a[n] * u
      
      const a_n = denominator[0]
      if (Math.abs(a_n) < 1e-10) return new Array(stateOrder).fill(0)
      
      // First n-1 derivatives
      for (let i = 0; i < stateOrder - 1; i++) {
        derivatives[i] = states[i + 1] || 0
      }
      
      // Last derivative
      let lastDerivative = 0
      
      // Input contribution
      const b_0 = numerator[0] || 0
      if (Math.abs(b_0) > 1e-10) {
        lastDerivative += (b_0 / a_n) * input
      }
      
      // Feedback terms
      for (let j = 0; j < stateOrder; j++) {
        const a_j = denominator[denominator.length - 1 - j] || 0
        if (Math.abs(a_j) > 1e-10) {
          lastDerivative -= (a_j / a_n) * (states[j] || 0)
        }
      }
      
      derivatives[stateOrder - 1] = lastDerivative
    }
    
    return derivatives
  }
}
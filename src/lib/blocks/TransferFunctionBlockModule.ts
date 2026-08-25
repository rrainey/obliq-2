// lib/blocks/TransferFunctionBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class TransferFunctionBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
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
      const outputType = this.getOutputType(block, inputTypes || [])
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
      // Dynamic system — controllable canonical form: y = C·x (+ D·u if biproper).
      // Using only states[0] (and numerator[0] in ẋ) made poly numerators like
      // [1.4e-4, 4e-4, 1] collapse to DC gain ≈1.4e-4 and killed S-IVB rate damping.
      const numerator = block.parameters?.numerator || [1]
      const outputType = this.getOutputType(block, inputTypes || [])
      const typeInfo = BlockModuleUtils.parseType(outputType)
      const inputExpr = inputs[0]

      if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
        code += `    // Matrix transfer function output (C·x)\n`
        code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
        code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
        code += this.generateOutputExpression(
          `${outputName}[i][j]`,
          `model->states.${tfName}_states[i][j]`,
          `${inputExpr}[i][j]`,
          numerator,
          denominator,
          stateOrder,
          3
        )
        code += `        }\n`
        code += `    }\n`
      } else if (typeInfo.isArray && typeInfo.arraySize) {
        code += `    // Vector transfer function output (C·x)\n`
        code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
        code += this.generateOutputExpression(
          `${outputName}[i]`,
          `model->states.${tfName}_states[i]`,
          `${inputExpr}[i]`,
          numerator,
          denominator,
          stateOrder,
          2
        )
        code += `    }\n`
      } else {
        code += `    // Scalar transfer function output (C·x)\n`
        code += this.generateOutputExpression(
          outputName,
          `model->states.${tfName}_states`,
          inputExpr,
          numerator,
          denominator,
          stateOrder,
          1
        )
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

    const a_n = denominator[0]
    if (Math.abs(a_n) < 1e-10) return 0
    const stateOrder = Math.max(0, denominator.length - 1)
    let y = 0
    for (let k = 0; k < stateOrder; k++) {
      y += (this.coeffOfSk(numerator, k) / a_n) * (states[k] || 0)
    }
    if (numerator.length === denominator.length) {
      y += ((numerator[0] || 0) / a_n) * input
    }
    return y
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
    return this.computeOutputFromState(input, numerator, denominator, states)
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
    _timeStep: number
  ): number {
    return this.computeOutputFromState(input, numerator, denominator, states)
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
   * Coeff of s^k in a high-order-first polynomial (Simulink / MATLAB style).
   */
  private coeffOfSk(poly: number[], k: number): number {
    const deg = poly.length - 1
    const idx = deg - k
    if (idx < 0 || idx >= poly.length) return 0
    return poly[idx] || 0
  }

  /**
   * y = C·x (+ D·u if biproper). C_k = (coeff of s^k in num) / a_n.
   */
  private generateOutputExpression(
    outputLvalue: string,
    stateAccessor: string,
    inputExpr: string,
    numerator: number[],
    denominator: number[],
    stateOrder: number,
    indentLevel: number
  ): string {
    const indent = '    '.repeat(indentLevel)
    const a_n = denominator[0]
    if (Math.abs(a_n) < 1e-10) {
      return `${indent}${outputLvalue} = 0.0; /* den leading coeff zero */\n`
    }

    const terms: string[] = []
    for (let k = 0; k < stateOrder; k++) {
      const bk = this.coeffOfSk(numerator, k)
      const ck = bk / a_n
      if (Math.abs(ck) > 1e-18) {
        terms.push(`(${ck}) * ${stateAccessor}[${k}]`)
      }
    }
    // Biproper: relative degree 0 → direct feedthrough D = num[0]/den[0]
    if (numerator.length === denominator.length) {
      const d = (numerator[0] || 0) / a_n
      if (Math.abs(d) > 1e-18) {
        terms.push(`(${d}) * ${inputExpr}`)
      }
    }
    if (terms.length === 0) {
      return `${indent}${outputLvalue} = 0.0;\n`
    }
    return `${indent}${outputLvalue} = ${terms.join(' + ')};\n`
  }

  /**
   * Generate derivative computation for a scalar transfer function.
   * Controllable canonical form (monic den): B = [0,...,1], C from full numerator.
   *   x'[i] = x[i+1]
   *   x'[n-1] = u - Σ (a_k / a_n) x[k]
   *   y = Σ (b_k / a_n) x[k]
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

    const a_n = denominator[0]
    if (Math.abs(a_n) < 1e-10) {
      return `${indent}/* Error: Leading denominator coefficient is zero */\n`
    }

    for (let i = 0; i < stateOrder; i++) {
      if (i < stateOrder - 1) {
        code += `${indent}${derivativeAccessor}[${i}] = ${stateAccessor}[${i + 1}];\n`
      } else {
        // Last state: +u − Σ (a_k/a_n) x[k]  (a_k = coeff of s^k)
        code += `${indent}${derivativeAccessor}[${i}] = ${inputExpr}`
        for (let j = 0; j < stateOrder; j++) {
          const a_j = this.coeffOfSk(denominator, j)
          if (Math.abs(a_j) > 1e-18) {
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

    const a_n = denominator[0]
    if (Math.abs(a_n) < 1e-10) return new Array(stateOrder).fill(0)

    const derivatives: number[] = new Array(stateOrder)
    for (let i = 0; i < stateOrder - 1; i++) {
      derivatives[i] = states[i + 1] || 0
    }

    // Controllable canonical: x'[n-1] = u − Σ (a_k/a_n) x[k]
    let last = input
    for (let j = 0; j < stateOrder; j++) {
      const a_j = this.coeffOfSk(denominator, j)
      last -= (a_j / a_n) * (states[j] || 0)
    }
    derivatives[stateOrder - 1] = last
    return derivatives
  }
}
// lib/blocks/IntegratorBlockModule.ts
//
// Integrator is mathematically equivalent to a 1/s transfer function.
// We use the same _states[] pattern as TransferFunction for code reuse.
// State order is 1 (single state variable per element).

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class IntegratorBlockModule implements IBlockModule {
  /**
   * Generate computation code - outputs current state value only.
   * State integration is handled by StateIntegrator (Euler/RK4).
   * Also handles enable/reset logic which affects state but not integration method.
   */
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const intName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const {
      showEnableInput = false,
      showResetInput = false,
      useLimits = false,
      upperLimit = Infinity,
      lowerLimit = -Infinity,
      initialValue = 0
    } = block.parameters || {}

    let code = `    // Integrator block: ${block.name}\n`

    if (inputs.length === 0) {
      code += `    ${outputName} = 0.0; // No input\n`
      return code
    }

    const outputType = this.getOutputType(block, inputTypes || [])
    const typeInfo = BlockModuleUtils.parseType(outputType)

    // Determine port indices based on configuration
    let resetPortIndex = -1
    let currentPortIndex = 1

    if (showEnableInput) {
      currentPortIndex++ // Skip enable port (handled in integration layer)
    }
    if (showResetInput) {
      resetPortIndex = currentPortIndex++
    }

    // Reset logic (rising edge detection) - this affects state directly
    if (showResetInput && resetPortIndex >= 0 && inputs[resetPortIndex]) {
      code += `    bool ${intName}_reset = (bool)${inputs[resetPortIndex]};\n`
      code += `    bool ${intName}_rising_edge = ${intName}_reset && !model->states.${intName}_reset_prev;\n`
      code += `    if (${intName}_rising_edge) {\n`

      // Reset to initial value (clamped if limits are used)
      // Uses _states[...][0] pattern (order 1 transfer function)
      if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
        code += `        for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
        code += `            for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
        const initVal = typeof initialValue === 'number' ? initialValue : `${initialValue}[i][j]`
        if (useLimits && isFinite(lowerLimit) && isFinite(upperLimit)) {
          code += `                model->states.${intName}_states[i][j][0] = fmax(${lowerLimit}, fmin(${upperLimit}, ${initVal}));\n`
        } else {
          code += `                model->states.${intName}_states[i][j][0] = ${initVal};\n`
        }
        code += `            }\n`
        code += `        }\n`
      } else if (typeInfo.isArray && typeInfo.arraySize) {
        code += `        for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
        const initVal = typeof initialValue === 'number' ? initialValue : `${initialValue}[i]`
        if (useLimits && isFinite(lowerLimit) && isFinite(upperLimit)) {
          code += `            model->states.${intName}_states[i][0] = fmax(${lowerLimit}, fmin(${upperLimit}, ${initVal}));\n`
        } else {
          code += `            model->states.${intName}_states[i][0] = ${initVal};\n`
        }
        code += `        }\n`
      } else {
        // Scalar: _states[0]
        if (useLimits && isFinite(lowerLimit) && isFinite(upperLimit)) {
          code += `        model->states.${intName}_states[0] = fmax(${lowerLimit}, fmin(${upperLimit}, ${initialValue}));\n`
        } else {
          code += `        model->states.${intName}_states[0] = ${initialValue};\n`
        }
      }
      code += `    }\n`
      code += `    model->states.${intName}_reset_prev = ${intName}_reset;\n`
    }

    // Output current state value (integration done separately by StateIntegrator)
    // Uses _states[...][0] pattern (order 1 transfer function)
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = model->states.${intName}_states[i][j][0];\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = model->states.${intName}_states[i][0];\n`
      code += `    }\n`
    } else {
      // Scalar: _states[0]
      code += `    ${outputName} = model->states.${intName}_states[0];\n`
    }

    return code
  }

  /**
   * Generate state derivative computation for RK4/Euler integration.
   * For an integrator (1/s), the derivative is simply the input signal.
   * Uses _states[0] pattern matching transfer function convention.
   */
  generateStateDerivative(
    block: BlockData,
    inputExpr: string,
    stateAccessor: string,
    outputType: string
  ): string {
    const intName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const {
      useLimits = false,
      upperLimit = Infinity,
      lowerLimit = -Infinity
    } = block.parameters || {}
    const typeInfo = BlockModuleUtils.parseType(outputType)

    let code = `    /* State derivatives for ${block.name} (integrator: 1/s) */\n`

    // For integrator, derivative = input (with optional saturation check)
    // Uses _states[...][0] pattern (order 1 transfer function)
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      if (useLimits && isFinite(lowerLimit) && isFinite(upperLimit)) {
        code += `            double ${intName}_current = ${stateAccessor}->${intName}_states[i][j][0];\n`
        code += `            double ${intName}_deriv = ${inputExpr}[i][j];\n`
        code += `            // Saturation: zero derivative if at limit and would exceed\n`
        code += `            if ((${intName}_current >= ${upperLimit} && ${intName}_deriv > 0.0) ||\n`
        code += `                (${intName}_current <= ${lowerLimit} && ${intName}_deriv < 0.0)) {\n`
        code += `                state_derivatives->${intName}_states[i][j][0] = 0.0;\n`
        code += `            } else {\n`
        code += `                state_derivatives->${intName}_states[i][j][0] = ${intName}_deriv;\n`
        code += `            }\n`
      } else {
        code += `            state_derivatives->${intName}_states[i][j][0] = ${inputExpr}[i][j];\n`
      }
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      if (useLimits && isFinite(lowerLimit) && isFinite(upperLimit)) {
        code += `        double ${intName}_current = ${stateAccessor}->${intName}_states[i][0];\n`
        code += `        double ${intName}_deriv = ${inputExpr}[i];\n`
        code += `        // Saturation: zero derivative if at limit and would exceed\n`
        code += `        if ((${intName}_current >= ${upperLimit} && ${intName}_deriv > 0.0) ||\n`
        code += `            (${intName}_current <= ${lowerLimit} && ${intName}_deriv < 0.0)) {\n`
        code += `            state_derivatives->${intName}_states[i][0] = 0.0;\n`
        code += `        } else {\n`
        code += `            state_derivatives->${intName}_states[i][0] = ${intName}_deriv;\n`
        code += `        }\n`
      } else {
        code += `        state_derivatives->${intName}_states[i][0] = ${inputExpr}[i];\n`
      }
      code += `    }\n`
    } else {
      // Scalar: _states[0]
      if (useLimits && isFinite(lowerLimit) && isFinite(upperLimit)) {
        code += `    double ${intName}_current = ${stateAccessor}->${intName}_states[0];\n`
        code += `    double ${intName}_deriv = ${inputExpr};\n`
        code += `    // Saturation: zero derivative if at limit and would exceed\n`
        code += `    if ((${intName}_current >= ${upperLimit} && ${intName}_deriv > 0.0) ||\n`
        code += `        (${intName}_current <= ${lowerLimit} && ${intName}_deriv < 0.0)) {\n`
        code += `        state_derivatives->${intName}_states[0] = 0.0;\n`
        code += `    } else {\n`
        code += `        state_derivatives->${intName}_states[0] = ${intName}_deriv;\n`
        code += `    }\n`
      } else {
        code += `    state_derivatives->${intName}_states[0] = ${inputExpr};\n`
      }
    }

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Integrator output type matches derivative input type
    if (inputTypes.length === 0) {
      return 'double' // Default type
    }
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Integrator blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Integrators always require state
    return true
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    const intName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const typeInfo = BlockModuleUtils.parseType(outputType)
    const members: string[] = []
    const { showResetInput = false } = block.parameters || {}

    // Integrator uses _states[] pattern like transfer function (order 1)
    // Scalar: _states[1], Vector: _states[size][1], Matrix: _states[rows][cols][1]
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      members.push(`    double ${intName}_states[${typeInfo.rows}][${typeInfo.cols}][1];`)
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      members.push(`    double ${intName}_states[${typeInfo.arraySize}][1];`)
    } else {
      members.push(`    double ${intName}_states[1];`)
    }

    // Add reset edge detection state if reset input is enabled
    if (showResetInput) {
      members.push(`    bool ${intName}_reset_prev;`)
    }

    return members
  }

  generateInitialization(block: BlockData, outputType?: string): string {
    const intName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const {
      initialValue = 0,
      showResetInput = false,
      useLimits = false,
      upperLimit = Infinity,
      lowerLimit = -Infinity
    } = block.parameters || {}

    let code = ''

    // Parse the output type to determine dimensions
    // State structure is: scalar -> [1], vector[n] -> [n][1], matrix[m][n] -> [m][n][1]
    const typeInfo = BlockModuleUtils.parseType(outputType || 'double')

    // Calculate the initial value (clamped if using limits)
    const getClampedValue = (val: number): number => {
      if (useLimits && isFinite(lowerLimit) && isFinite(upperLimit)) {
        return Math.max(lowerLimit, Math.min(upperLimit, val))
      }
      return val
    }

    // Determine the scalar initial value to use
    const scalarInitial = typeof initialValue === 'number' ? initialValue : 0

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Matrix: _states[i][j][0]
      code += `    // Initialize ${intName}_states (matrix ${typeInfo.rows}x${typeInfo.cols})\n`
      for (let i = 0; i < typeInfo.rows; i++) {
        for (let j = 0; j < typeInfo.cols; j++) {
          let val: number
          if (Array.isArray(initialValue) && Array.isArray(initialValue[i])) {
            val = (initialValue[i] as number[])[j] ?? scalarInitial
          } else {
            val = scalarInitial
          }
          val = getClampedValue(val)
          code += `    model->states.${intName}_states[${i}][${j}][0] = ${val};\n`
        }
      }
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Vector: _states[i][0]
      code += `    // Initialize ${intName}_states (vector size ${typeInfo.arraySize})\n`
      for (let i = 0; i < typeInfo.arraySize; i++) {
        let val: number
        if (Array.isArray(initialValue) && !Array.isArray(initialValue[0])) {
          val = (initialValue[i] as number) ?? scalarInitial
        } else {
          val = scalarInitial
        }
        val = getClampedValue(val)
        code += `    model->states.${intName}_states[${i}][0] = ${val};\n`
      }
    } else {
      // Scalar: _states[0]
      const val = getClampedValue(scalarInitial)
      code += `    model->states.${intName}_states[0] = ${val};\n`
    }

    // Initialize reset edge detection
    if (showResetInput) {
      code += `    model->states.${intName}_reset_prev = false;\n`
    }

    return code
  }

  /**
   * Post-integration limiting - clamp state after integration step if limits are enabled
   * Uses _states[0] pattern (order 1 transfer function)
   */
  generatePostIntegrationLimiting(block: BlockData, outputType: string): string {
    const intName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const {
      useLimits = false,
      upperLimit = Infinity,
      lowerLimit = -Infinity
    } = block.parameters || {}

    if (!useLimits || !isFinite(lowerLimit) || !isFinite(upperLimit)) {
      return ''
    }

    const typeInfo = BlockModuleUtils.parseType(outputType)
    let code = `    /* Apply limits to ${block.name} */\n`

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            model->states.${intName}_states[i][j][0] = fmax(${lowerLimit}, fmin(${upperLimit}, model->states.${intName}_states[i][j][0]));\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        model->states.${intName}_states[i][0] = fmax(${lowerLimit}, fmin(${upperLimit}, model->states.${intName}_states[i][0]));\n`
      code += `    }\n`
    } else {
      code += `    model->states.${intName}_states[0] = fmax(${lowerLimit}, fmin(${upperLimit}, model->states.${intName}_states[0]));\n`
    }

    return code
  }

  private applyLimits(
    value: number | number[] | number[][],
    lowerLimit: number,
    upperLimit: number
  ): number | number[] | number[][] {
    if (typeof value === 'number') {
      return Math.max(lowerLimit, Math.min(upperLimit, value))
    } else if (Array.isArray(value)) {
      if (Array.isArray(value[0])) {
        // Matrix
        return (value as number[][]).map(row =>
          row.map(v => Math.max(lowerLimit, Math.min(upperLimit, v)))
        )
      } else {
        // Vector
        return (value as number[]).map(v => Math.max(lowerLimit, Math.min(upperLimit, v)))
      }
    }
    return value
  }

  getInputPortCount(block: BlockData): number {
    // Only the derivative input is on the left edge
    // Enable is on top edge (port index -1), Reset is on bottom edge (port index -2)
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    // Only the derivative input is on the left edge
    // Enable (top) and Reset (bottom) are special ports, not listed here
    return ['Derivative']
  }

  getOutputPortLabels(block: BlockData): string[] | undefined {
    return ['Output']
  }

  /**
   * Integrators do NOT have direct feedthrough.
   * The output is the integrated past values, not a function of the current input.
   * This is critical for algebraic loop detection - integrators break algebraic loops.
   */
  isDirectFeedthrough(block: BlockData): boolean {
    return false
  }

  computeDerivatives(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    time: number
  ): number[] | undefined {
    // For integrator, the derivative is simply the input
    const derivative = inputs[0]

    if (typeof derivative === 'number') {
      return [derivative]
    } else if (Array.isArray(derivative)) {
      if (Array.isArray(derivative[0])) {
        // Flatten matrix
        return (derivative as unknown as number[][]).flat()
      } else {
        return derivative as number[]
      }
    }

    return undefined
  }
}

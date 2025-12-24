// lib/blocks/DiscreteTransformBlockModule.ts
// Implements discrete-time transfer function (z-transform) block

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

/**
 * Discrete Transform Block Module
 *
 * Implements a discrete-time transfer function H(z) = N(z)/D(z)
 * using difference equations (no integration needed).
 *
 * Coefficient ordering matches the Transfer Function block: HIGHEST POWER FIRST
 *
 * For H(z) = (bₙzⁿ + bₙ₋₁zⁿ⁻¹ + ... + b₀) / (aₙzⁿ + aₙ₋₁zⁿ⁻¹ + ... + a₀)
 *
 * The difference equation (dividing by zⁿ) becomes:
 * y[k] = (1/aₙ) * (bₙu[k] + bₙ₋₁u[k-1] + ... + b₀u[k-n] - aₙ₋₁y[k-1] - ... - a₀y[k-n])
 *
 * Parameters:
 * - numerator: Array of numerator coefficients [bₙ, bₙ₋₁, ..., b₀] (highest power first)
 * - denominator: Array of denominator coefficients [aₙ, aₙ₋₁, ..., a₀] (highest power first)
 * - sampleInterval: Sample period in seconds (Ts)
 *
 * Example: H(z) = (z + 0.5) / (z - 0.8) would use:
 *   numerator = [1, 0.5]    (z¹ coefficient, then z⁰ coefficient)
 *   denominator = [1, -0.8] (z¹ coefficient, then z⁰ coefficient)
 */
export class DiscreteTransformBlockModule implements IBlockModule {

  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const dtfName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const numerator = block.parameters?.numerator || [1]
    const denominator = block.parameters?.denominator || [1]
    const sampleInterval = block.parameters?.sampleInterval || 0.01

    // Number of past input and output samples needed
    const numInputHistory = Math.max(0, numerator.length - 1)
    const numOutputHistory = Math.max(0, denominator.length - 1)

    let code = `    // Discrete transfer function block: ${block.name}\n`
    code += `    // Sample interval: ${sampleInterval}s\n`

    if (inputs.length === 0) {
      code += `    ${outputName} = 0.0; // No input\n`
      return code
    }

    const inputExpr = inputs[0]
    const outputType = this.getOutputType(block, inputTypes || [])
    const typeInfo = BlockModuleUtils.parseType(outputType)

    // Pure gain case (no dynamics)
    if (numInputHistory === 0 && numOutputHistory === 0) {
      const gain = (numerator[0] || 1) / (denominator[0] || 1)

      if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
        code += `    // Matrix element-wise gain (no dynamics)\n`
        code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
        code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
        code += `            ${outputName}[i][j] = ${inputExpr}[i][j] * ${gain};\n`
        code += `        }\n`
        code += `    }\n`
      } else if (typeInfo.isArray && typeInfo.arraySize) {
        code += `    // Vector element-wise gain (no dynamics)\n`
        code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
        code += `        ${outputName}[i] = ${inputExpr}[i] * ${gain};\n`
        code += `    }\n`
      } else {
        code += `    ${outputName} = ${inputExpr} * ${gain};\n`
      }
      return code
    }

    // Dynamic system - check if it's time to update
    code += `    // Check if we should update (sample interval elapsed)\n`
    code += `    if (model->time >= model->states.${dtfName}_next_sample_time - 1e-9) {\n`

    // Generate the difference equation
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += this.generateMatrixUpdate(dtfName, inputExpr, outputName,
        numerator, denominator, typeInfo.rows, typeInfo.cols)
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += this.generateVectorUpdate(dtfName, inputExpr, outputName,
        numerator, denominator, typeInfo.arraySize)
    } else {
      code += this.generateScalarUpdate(dtfName, inputExpr, outputName,
        numerator, denominator)
    }

    // Update next sample time
    code += `        model->states.${dtfName}_next_sample_time += ${sampleInterval};\n`
    code += `    }\n`

    // Output the current value (holds between samples)
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `    // Output current value\n`
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = model->states.${dtfName}_output_history[i][j][0];\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `    // Output current value\n`
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = model->states.${dtfName}_output_history[i][0];\n`
      code += `    }\n`
    } else {
      code += `    // Output current value\n`
      code += `    ${outputName} = model->states.${dtfName}_output_history[0];\n`
    }

    return code
  }

  private generateScalarUpdate(
    dtfName: string,
    inputExpr: string,
    outputName: string,
    numerator: number[],
    denominator: number[]
  ): string {
    const numInputHistory = numerator.length
    const numOutputHistory = denominator.length - 1
    const a0 = denominator[0] || 1

    let code = `        // Compute new output: y[k] = (1/a0) * (sum of b[i]*u[k-i] - sum of a[j]*y[k-j])\n`
    code += `        double new_output = 0.0;\n`

    // Add numerator terms: b[i] * u[k-i]
    code += `        // Numerator terms\n`
    for (let i = 0; i < numerator.length; i++) {
      const b = numerator[i]
      if (Math.abs(b) > 1e-15) {
        if (i === 0) {
          code += `        new_output += ${b} * ${inputExpr}; // b0 * u[k]\n`
        } else {
          code += `        new_output += ${b} * model->states.${dtfName}_input_history[${i - 1}]; // b${i} * u[k-${i}]\n`
        }
      }
    }

    // Subtract denominator terms: a[j] * y[k-j] for j > 0
    code += `        // Denominator feedback terms\n`
    for (let j = 1; j < denominator.length; j++) {
      const a = denominator[j]
      if (Math.abs(a) > 1e-15) {
        code += `        new_output -= ${a} * model->states.${dtfName}_output_history[${j - 1}]; // a${j} * y[k-${j}]\n`
      }
    }

    // Divide by a0
    if (Math.abs(a0 - 1.0) > 1e-15) {
      code += `        new_output /= ${a0}; // Divide by a0\n`
    }

    // Shift input history
    if (numInputHistory > 1) {
      code += `        // Shift input history\n`
      for (let i = numInputHistory - 2; i > 0; i--) {
        code += `        model->states.${dtfName}_input_history[${i}] = model->states.${dtfName}_input_history[${i - 1}];\n`
      }
      code += `        model->states.${dtfName}_input_history[0] = ${inputExpr};\n`
    }

    // Shift output history and store new output
    if (numOutputHistory > 0) {
      code += `        // Shift output history\n`
      for (let i = numOutputHistory - 1; i > 0; i--) {
        code += `        model->states.${dtfName}_output_history[${i}] = model->states.${dtfName}_output_history[${i - 1}];\n`
      }
      code += `        model->states.${dtfName}_output_history[0] = new_output;\n`
    }

    return code
  }

  private generateVectorUpdate(
    dtfName: string,
    inputExpr: string,
    outputName: string,
    numerator: number[],
    denominator: number[],
    arraySize: number
  ): string {
    let code = `        // Vector discrete transfer function update\n`
    code += `        for (int _idx = 0; _idx < ${arraySize}; _idx++) {\n`

    const numInputHistory = numerator.length
    const numOutputHistory = denominator.length - 1
    const a0 = denominator[0] || 1

    code += `            double new_output = 0.0;\n`

    // Numerator terms
    for (let i = 0; i < numerator.length; i++) {
      const b = numerator[i]
      if (Math.abs(b) > 1e-15) {
        if (i === 0) {
          code += `            new_output += ${b} * ${inputExpr}[_idx];\n`
        } else {
          code += `            new_output += ${b} * model->states.${dtfName}_input_history[_idx][${i - 1}];\n`
        }
      }
    }

    // Denominator feedback terms
    for (let j = 1; j < denominator.length; j++) {
      const a = denominator[j]
      if (Math.abs(a) > 1e-15) {
        code += `            new_output -= ${a} * model->states.${dtfName}_output_history[_idx][${j - 1}];\n`
      }
    }

    if (Math.abs(a0 - 1.0) > 1e-15) {
      code += `            new_output /= ${a0};\n`
    }

    // Shift histories
    if (numInputHistory > 1) {
      for (let i = numInputHistory - 2; i > 0; i--) {
        code += `            model->states.${dtfName}_input_history[_idx][${i}] = model->states.${dtfName}_input_history[_idx][${i - 1}];\n`
      }
      code += `            model->states.${dtfName}_input_history[_idx][0] = ${inputExpr}[_idx];\n`
    }

    if (numOutputHistory > 0) {
      for (let i = numOutputHistory - 1; i > 0; i--) {
        code += `            model->states.${dtfName}_output_history[_idx][${i}] = model->states.${dtfName}_output_history[_idx][${i - 1}];\n`
      }
      code += `            model->states.${dtfName}_output_history[_idx][0] = new_output;\n`
    }

    code += `        }\n`
    return code
  }

  private generateMatrixUpdate(
    dtfName: string,
    inputExpr: string,
    outputName: string,
    numerator: number[],
    denominator: number[],
    rows: number,
    cols: number
  ): string {
    let code = `        // Matrix discrete transfer function update\n`
    code += `        for (int _row = 0; _row < ${rows}; _row++) {\n`
    code += `            for (int _col = 0; _col < ${cols}; _col++) {\n`

    const numInputHistory = numerator.length
    const numOutputHistory = denominator.length - 1
    const a0 = denominator[0] || 1

    code += `                double new_output = 0.0;\n`

    // Numerator terms
    for (let i = 0; i < numerator.length; i++) {
      const b = numerator[i]
      if (Math.abs(b) > 1e-15) {
        if (i === 0) {
          code += `                new_output += ${b} * ${inputExpr}[_row][_col];\n`
        } else {
          code += `                new_output += ${b} * model->states.${dtfName}_input_history[_row][_col][${i - 1}];\n`
        }
      }
    }

    // Denominator feedback terms
    for (let j = 1; j < denominator.length; j++) {
      const a = denominator[j]
      if (Math.abs(a) > 1e-15) {
        code += `                new_output -= ${a} * model->states.${dtfName}_output_history[_row][_col][${j - 1}];\n`
      }
    }

    if (Math.abs(a0 - 1.0) > 1e-15) {
      code += `                new_output /= ${a0};\n`
    }

    // Shift histories
    if (numInputHistory > 1) {
      for (let i = numInputHistory - 2; i > 0; i--) {
        code += `                model->states.${dtfName}_input_history[_row][_col][${i}] = model->states.${dtfName}_input_history[_row][_col][${i - 1}];\n`
      }
      code += `                model->states.${dtfName}_input_history[_row][_col][0] = ${inputExpr}[_row][_col];\n`
    }

    if (numOutputHistory > 0) {
      for (let i = numOutputHistory - 1; i > 0; i--) {
        code += `                model->states.${dtfName}_output_history[_row][_col][${i}] = model->states.${dtfName}_output_history[_row][_col][${i - 1}];\n`
      }
      code += `                model->states.${dtfName}_output_history[_row][_col][0] = new_output;\n`
    }

    code += `            }\n`
    code += `        }\n`
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Discrete transfer function output type matches input type
    if (inputTypes.length === 0) {
      return 'double'
    }
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Discrete transfer functions always need state for history buffers
    const numerator = block.parameters?.numerator || [1]
    const denominator = block.parameters?.denominator || [1]
    return numerator.length > 1 || denominator.length > 1
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    const numerator = block.parameters?.numerator || [1]
    const denominator = block.parameters?.denominator || [1]
    const numInputHistory = Math.max(0, numerator.length - 1)
    const numOutputHistory = Math.max(0, denominator.length - 1)

    if (numInputHistory === 0 && numOutputHistory === 0) {
      return []
    }

    const dtfName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const typeInfo = BlockModuleUtils.parseType(outputType)
    const members: string[] = []

    // Add next sample time tracker
    members.push(`    double ${dtfName}_next_sample_time;`)

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Matrix: 4D arrays for history [rows][cols][history_depth]
      if (numInputHistory > 0) {
        members.push(`    double ${dtfName}_input_history[${typeInfo.rows}][${typeInfo.cols}][${numInputHistory}];`)
      }
      if (numOutputHistory > 0) {
        members.push(`    double ${dtfName}_output_history[${typeInfo.rows}][${typeInfo.cols}][${numOutputHistory}];`)
      }
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Vector: 2D arrays for history [size][history_depth]
      if (numInputHistory > 0) {
        members.push(`    double ${dtfName}_input_history[${typeInfo.arraySize}][${numInputHistory}];`)
      }
      if (numOutputHistory > 0) {
        members.push(`    double ${dtfName}_output_history[${typeInfo.arraySize}][${numOutputHistory}];`)
      }
    } else {
      // Scalar: 1D arrays for history
      if (numInputHistory > 0) {
        members.push(`    double ${dtfName}_input_history[${numInputHistory}];`)
      }
      if (numOutputHistory > 0) {
        members.push(`    double ${dtfName}_output_history[${numOutputHistory}];`)
      }
    }

    return members
  }

  generateInitialization(block: BlockData): string {
    const numerator = block.parameters?.numerator || [1]
    const denominator = block.parameters?.denominator || [1]
    const sampleInterval = block.parameters?.sampleInterval || 0.01
    const numInputHistory = Math.max(0, numerator.length - 1)
    const numOutputHistory = Math.max(0, denominator.length - 1)

    if (numInputHistory === 0 && numOutputHistory === 0) {
      return ''
    }

    const dtfName = BlockModuleUtils.sanitizeIdentifier(block.name)
    let code = `    // Initialize discrete transfer function: ${block.name}\n`

    // Initialize next sample time to start immediately
    code += `    model->states.${dtfName}_next_sample_time = 0.0;\n`

    // Zero-initialize history buffers
    if (numInputHistory > 0) {
      code += `    memset(model->states.${dtfName}_input_history, 0, sizeof(model->states.${dtfName}_input_history));\n`
    }
    if (numOutputHistory > 0) {
      code += `    memset(model->states.${dtfName}_output_history, 0, sizeof(model->states.${dtfName}_output_history));\n`
    }

    return code
  }

  isDirectFeedthrough?(block: BlockData): boolean {
    // Discrete transfer function has direct feedthrough if numerator[0] != 0
    const numerator = block.parameters?.numerator || [1]
    return Math.abs(numerator[0] || 0) > 1e-15
  }

  getInputPortCount(block: BlockData): number {
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }

  getInputPortLabels?(block: BlockData): string[] | undefined {
    return undefined
  }

  getOutputPortLabels?(block: BlockData): string[] | undefined {
    return undefined
  }
}

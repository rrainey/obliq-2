/**
 * Finite-difference derivative: y = (u - u_prev) / (t - t_prev)
 * (Simulink Derivative → Obliq mapping option B).
 *
 * Supports scalar, vector, and matrix inputs (element-wise).
 * u_prev and t_prev are latched in generateDeferredStateUpdate after algebra
 * producers run (same two-phase pattern as unit_delay). The RK4 stages restore
 * the model struct after each stage, so the latch holds the last major step.
 *
 * The divisor is the time since the last latch, not model->dt. In an RK4
 * stage at t0 + h/2 the divisor is h/2. With model->dt, the stages saw about
 * half the derivative and an integrator of the output gained only 2/3 of the
 * input change. When the time difference is below 1e-15 s (the first step
 * after init or seed_from_inputs), the divisor is model->dt.
 */

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils, CodeGenContext } from './BlockModule'

export class DerivativeBlockModule implements IBlockModule {
  generateComputation(
    block: BlockData,
    inputs: string[],
    inputTypes?: string[],
    _context?: CodeGenContext
  ): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const outputType = this.getOutputType(block, inputTypes || [])
    const typeInfo = BlockModuleUtils.parseType(outputType)

    let code = `    // Derivative (finite difference): ${block.name}\n`
    if (inputs.length === 0) {
      code += `    ${outputName} = 0.0;\n`
      return code
    }
    const u = inputs[0]
    code += `    {\n`
    code += `        double __dt = model->time - model->states.${name}_tprev;\n`
    code += `        if (__dt < 1e-15) __dt = model->dt;\n`
    code += `        if (__dt < 1e-15) __dt = 1e-15;\n`
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `        for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `            for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `                ${outputName}[i][j] = (${u}[i][j] - model->states.${name}_prev[i][j]) / __dt;\n`
      code += `            }\n`
      code += `        }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `        for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `            ${outputName}[i] = (${u}[i] - model->states.${name}_prev[i]) / __dt;\n`
      code += `        }\n`
    } else {
      code += `        ${outputName} = (${u} - model->states.${name}_prev) / __dt;\n`
    }
    code += `    }\n`
    return code
  }

  generateDeferredStateUpdate(
    block: BlockData,
    inputs: string[],
    inputTypes?: string[],
    context?: CodeGenContext
  ): string {
    if (inputs.length === 0) return ''
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const outputType = this.getOutputType(block, inputTypes || [])
    const typeInfo = BlockModuleUtils.parseType(outputType)
    const enableExpr =
      context?.enableExpr && context.enableExpr !== '1'
        ? context.enableExpr
        : null
    const indent = enableExpr ? '        ' : '    '
    let code = `    // Derivative latch prev: ${block.name}\n`
    if (enableExpr) code += `    if (${enableExpr}) {\n`
    const u = inputs[0]
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `${indent}for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `${indent}    for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `${indent}        model->states.${name}_prev[i][j] = ${u}[i][j];\n`
      code += `${indent}    }\n`
      code += `${indent}}\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `${indent}for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `${indent}    model->states.${name}_prev[i] = ${u}[i];\n`
      code += `${indent}}\n`
    } else {
      code += `${indent}model->states.${name}_prev = ${u};\n`
    }
    code += `${indent}model->states.${name}_tprev = model->time;\n`
    if (enableExpr) code += `    }\n`
    return code
  }

  getOutputType(_block: BlockData, inputTypes: string[]): string {
    return inputTypes[0] || 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(): boolean {
    return true
  }

  generateStateStructMembers(block: BlockData, outputType?: string): string[] {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const typeInfo = BlockModuleUtils.parseType(outputType || 'double')
    const tprev = `    double ${name}_tprev;`
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      return [`    double ${name}_prev[${typeInfo.rows}][${typeInfo.cols}];`, tprev]
    }
    if (typeInfo.isArray && typeInfo.arraySize) {
      return [`    double ${name}_prev[${typeInfo.arraySize}];`, tprev]
    }
    return [`    double ${name}_prev;`, tprev]
  }

  generateInitialization(block: BlockData, outputType?: string): string {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const typeInfo = BlockModuleUtils.parseType(outputType || 'double')
    const ic =
      Number(block.parameters?.initialCondition ?? block.parameters?.initialValue ?? 0) ||
      0
    let code = `    // Derivative IC: ${block.name}\n`
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++)\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++)\n`
      code += `            model->states.${name}_prev[i][j] = ${ic};\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++)\n`
      code += `        model->states.${name}_prev[i] = ${ic};\n`
    } else {
      code += `    model->states.${name}_prev = ${ic};\n`
    }
    code += `    model->states.${name}_tprev = model->time;\n`
    return code
  }

  getInputPortCount(): number {
    return 1
  }

  getOutputPortCount(): number {
    return 1
  }

  isDirectFeedthrough(): boolean {
    return true
  }
}

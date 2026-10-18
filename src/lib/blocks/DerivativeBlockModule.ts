/**
 * Finite-difference derivative: y = (u - u_prev) / dt
 * (Simulink Derivative → Obliq mapping option B).
 *
 * Supports scalar, vector, and matrix inputs (element-wise).
 * u_prev is latched in generateDeferredStateUpdate after algebra producers run
 * (same two-phase pattern as unit_delay).
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
    code += `        double __dt = model->dt;\n`
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
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      return [`    double ${name}_prev[${typeInfo.rows}][${typeInfo.cols}];`]
    }
    if (typeInfo.isArray && typeInfo.arraySize) {
      return [`    double ${name}_prev[${typeInfo.arraySize}];`]
    }
    return [`    double ${name}_prev;`]
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

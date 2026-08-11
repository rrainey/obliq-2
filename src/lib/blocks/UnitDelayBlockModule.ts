// lib/blocks/UnitDelayBlockModule.ts
//
// Unit delay (z⁻¹ / Memory): output is the previous sample of the input.
//
// Algorithm (once per simulation step during algebraic evaluation):
//   1. y = state
//   2. if sample due: state = u
//
// sampleInterval == 0  → update every model step
// sampleInterval > 0   → update when model->time crosses next sample boundary
//                        (same pattern as discrete_transform)
//
// Continuous integration does not touch this state (getBlockStateOrder returns 0
// for non-integrator/TF blocks).

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class UnitDelayBlockModule implements IBlockModule {

  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const sampleInterval = Number(block.parameters?.sampleInterval ?? 0)

    let code = `    // Unit Delay block: ${block.name}\n`

    if (inputs.length === 0) {
      code += `    ${outputName} = 0.0; // No input\n`
      return code
    }

    const inputExpr = inputs[0]
    const outputType = this.getOutputType(block, inputTypes || [])
    const typeInfo = BlockModuleUtils.parseType(outputType)

    // 1) Output previous state
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = model->states.${name}_state[i][j];\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = model->states.${name}_state[i];\n`
      code += `    }\n`
    } else {
      code += `    ${outputName} = model->states.${name}_state;\n`
    }

    // 2) Update state when sample is due
    if (sampleInterval > 0) {
      code += `    if (model->time >= model->states.${name}_next_sample_time - 1e-9) {\n`
      code += this.generateStateUpdate(name, inputExpr, typeInfo, '        ')
      code += `        model->states.${name}_next_sample_time += ${sampleInterval};\n`
      code += `    }\n`
    } else {
      // Every step
      code += this.generateStateUpdate(name, inputExpr, typeInfo, '    ')
    }

    return code
  }

  private generateStateUpdate(
    name: string,
    inputExpr: string,
    typeInfo: ReturnType<typeof BlockModuleUtils.parseType>,
    indent: string
  ): string {
    let code = ''
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `${indent}for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `${indent}    for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `${indent}        model->states.${name}_state[i][j] = ${inputExpr}[i][j];\n`
      code += `${indent}    }\n`
      code += `${indent}}\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `${indent}for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `${indent}    model->states.${name}_state[i] = ${inputExpr}[i];\n`
      code += `${indent}}\n`
    } else {
      code += `${indent}model->states.${name}_state = ${inputExpr};\n`
    }
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    if (inputTypes.length === 0) {
      return 'double'
    }
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    return true
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const typeInfo = BlockModuleUtils.parseType(outputType)
    const sampleInterval = Number(block.parameters?.sampleInterval ?? 0)
    const members: string[] = []

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      members.push(`    double ${name}_state[${typeInfo.rows}][${typeInfo.cols}];`)
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      members.push(`    double ${name}_state[${typeInfo.arraySize}];`)
    } else {
      members.push(`    double ${name}_state;`)
    }

    if (sampleInterval > 0) {
      members.push(`    double ${name}_next_sample_time;`)
    }

    return members
  }

  generateInitialization(block: BlockData, outputType?: string): string {
    const name = BlockModuleUtils.sanitizeIdentifier(block.name)
    const initialValue = block.parameters?.initialValue ?? 0
    const sampleInterval = Number(block.parameters?.sampleInterval ?? 0)
    const typeInfo = BlockModuleUtils.parseType(outputType || 'double')
    const scalarInitial = typeof initialValue === 'number' ? initialValue : 0

    let code = `    // Initialize unit delay: ${block.name}\n`

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      for (let i = 0; i < typeInfo.rows; i++) {
        for (let j = 0; j < typeInfo.cols; j++) {
          let val = scalarInitial
          if (Array.isArray(initialValue) && Array.isArray(initialValue[i])) {
            val = (initialValue[i] as number[])[j] ?? scalarInitial
          }
          code += `    model->states.${name}_state[${i}][${j}] = ${val};\n`
        }
      }
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      for (let i = 0; i < typeInfo.arraySize; i++) {
        let val = scalarInitial
        if (Array.isArray(initialValue) && !Array.isArray(initialValue[0])) {
          val = (initialValue as number[])[i] ?? scalarInitial
        }
        code += `    model->states.${name}_state[${i}] = ${val};\n`
      }
    } else {
      code += `    model->states.${name}_state = ${scalarInitial};\n`
    }

    if (sampleInterval > 0) {
      code += `    model->states.${name}_next_sample_time = 0.0;\n`
    }

    return code
  }

  getInputPortCount(block: BlockData): number {
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    return ['in']
  }

  getOutputPortLabels(block: BlockData): string[] | undefined {
    return ['out']
  }

  /**
   * No direct feedthrough: output is previous state only.
   * Unit delay is the classic algebraic-loop breaker.
   */
  isDirectFeedthrough(block: BlockData): boolean {
    return false
  }
}

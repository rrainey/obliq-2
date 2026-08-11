// lib/blocks/SignBlockModule.ts
//
// Signum (element-wise):
//   y = (u > 0) ? 1 : (u < 0) ? -1 : 0

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class SignBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`

    let code = `    // Sign block: ${block.name}\n`

    if (inputs.length === 0) {
      code += `    ${outputName} = 0.0; // No input\n`
      return code
    }

    const inputExpr = inputs[0]
    const outputType = this.getOutputType(block, inputTypes || [])
    const typeInfo = BlockModuleUtils.parseType(outputType)

    const signExpr = (u: string) =>
      `((${u}) > 0.0 ? 1.0 : ((${u}) < 0.0 ? -1.0 : 0.0))`

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `    // Matrix element-wise sign\n`
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = ${signExpr(`${inputExpr}[i][j]`)};\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `    // Vector element-wise sign\n`
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = ${signExpr(`${inputExpr}[i]`)};\n`
      code += `    }\n`
    } else {
      code += `    ${outputName} = ${signExpr(inputExpr)};\n`
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
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    return []
  }

  generateInitialization(block: BlockData): string {
    return ''
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

  isDirectFeedthrough(block: BlockData): boolean {
    return true
  }
}

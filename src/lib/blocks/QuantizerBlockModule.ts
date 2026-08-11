// lib/blocks/QuantizerBlockModule.ts
//
// Quantizer: round to nearest multiple of quantum (Simulink-style).
//   y = quantum * floor(u / quantum + 0.5)
// Element-wise for vectors/matrices.

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class QuantizerBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const quantum = Number(block.parameters?.quantum ?? 1)

    let code = `    // Quantizer block: ${block.name} (quantum=${quantum})\n`

    if (inputs.length === 0) {
      code += `    ${outputName} = 0.0;\n`
      return code
    }

    // Guard against zero quantum at codegen time
    const q = Math.abs(quantum) < 1e-30 ? 1 : quantum

    const inputExpr = inputs[0]
    const outputType = this.getOutputType(block, inputTypes || [])
    const typeInfo = BlockModuleUtils.parseType(outputType)

    const quantize = (u: string) =>
      `(${q}) * floor((${u}) / (${q}) + 0.5)`

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = ${quantize(`${inputExpr}[i][j]`)};\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = ${quantize(`${inputExpr}[i]`)};\n`
      code += `    }\n`
    } else {
      code += `    ${outputName} = ${quantize(inputExpr)};\n`
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

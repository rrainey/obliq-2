// lib/blocks/TransposeBlockModule.ts
//
// Transpose follows mathematical conventions:
// - Vector [N] (column vector) → [1][N] (row matrix)
// - Row matrix [1][N] → [N] (normalized to vector/column)
// - Column matrix [N][1] → [1][N] (row matrix)
// - Matrix [M][N] → [N][M]

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class TransposeBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`

    let code = `    // Transpose block: ${block.name}\n`

    if (inputs.length === 0) {
      code += `    // Error: No input\n`
      return code
    }

    const inputExpr = inputs[0]
    const inputType = inputTypes?.[0] || 'double[3]'
    const typeInfo = BlockModuleUtils.parseType(inputType)

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Check for row matrix [1][N] -> vector [N] (normalized output)
      if (typeInfo.rows === 1) {
        // Row matrix [1][N] -> vector [N]
        code += `    // Row matrix transpose: [1][${typeInfo.cols}] -> [${typeInfo.cols}] (normalized)\n`
        code += `    for (int i = 0; i < ${typeInfo.cols}; i++) {\n`
        code += `        ${outputName}[i] = ${inputExpr}[0][i];\n`
        code += `    }\n`
      } else if (typeInfo.cols === 1) {
        // Column matrix [N][1] -> row matrix [1][N]
        code += `    // Column matrix transpose: [${typeInfo.rows}][1] -> [1][${typeInfo.rows}]\n`
        code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
        code += `        ${outputName}[0][i] = ${inputExpr}[i][0];\n`
        code += `    }\n`
      } else {
        // General matrix transpose: [M][N] -> [N][M]
        code += `    // Matrix transpose: [${typeInfo.rows}][${typeInfo.cols}] -> [${typeInfo.cols}][${typeInfo.rows}]\n`
        code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
        code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
        code += `            ${outputName}[j][i] = ${inputExpr}[i][j];\n`
        code += `        }\n`
        code += `    }\n`
      }
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Vector [N] (column vector) -> row matrix [1][N]
      code += `    // Vector transpose: [${typeInfo.arraySize}] -> [1][${typeInfo.arraySize}]\n`
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[0][i] = ${inputExpr}[i];\n`
      code += `    }\n`
    } else {
      // Scalar - no transpose needed, just pass through
      code += `    ${outputName} = ${inputExpr}; // Scalar pass-through\n`
    }

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    if (inputTypes.length === 0) {
      return 'double' // Default
    }

    const inputType = inputTypes[0]
    const typeInfo = BlockModuleUtils.parseType(inputType)

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Check for row matrix [1][N] -> normalize to vector [N]
      if (typeInfo.rows === 1) {
        // Row matrix [1][N] -> vector [N] (normalized)
        return `${typeInfo.baseType}[${typeInfo.cols}]`
      }
      // Column matrix [N][1] or general matrix [M][N] -> [N][M]
      return `${typeInfo.baseType}[${typeInfo.cols}][${typeInfo.rows}]`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Vector [N] (column) -> row matrix [1][N]
      return `${typeInfo.baseType}[1][${typeInfo.arraySize}]`
    } else {
      // Scalar remains scalar
      return inputType
    }
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

  getInputPortCount(block: BlockData): number {
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }
}
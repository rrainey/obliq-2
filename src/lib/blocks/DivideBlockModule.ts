// lib/blocks/DivideBlockModule.ts
//
// Element-wise division: out = num / den
//
// Type rules (v1):
//   - Same shape T / T → T
//   - Vector or matrix / scalar → same non-scalar shape (broadcast denominator)
//   - Scalar / vector or matrix → invalid (rejected in type validation)

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils, CodeGenContext } from './BlockModule'
import { emitSafeDiv } from '@/lib/codegen/DebugMathRuntime'

export class DivideBlockModule implements IBlockModule {
  generateComputation(
    block: BlockData,
    inputs: string[],
    inputTypes?: string[],
    context?: CodeGenContext
  ): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const debugMath = !!context?.debugMath
    const blockLabel = block.name || 'divide'

    let code = `    // Divide block: ${block.name}\n`

    if (inputs.length < 2) {
      code += `    ${outputName} = 0.0; // Need num and den\n`
      return code
    }

    const numExpr = inputs[0]
    const denExpr = inputs[1]
    const numType = inputTypes?.[0] || 'double'
    const denType = inputTypes?.[1] || 'double'
    const numInfo = BlockModuleUtils.parseType(numType)
    const denInfo = BlockModuleUtils.parseType(denType)
    const denIsScalar = !denInfo.isArray && !denInfo.isMatrix

    const div = (n: string, d: string) =>
      debugMath ? emitSafeDiv(n, d, blockLabel) : `(${n}) / (${d})`

    // Output shape follows numerator
    const outInfo = numInfo

    if (outInfo.isMatrix && outInfo.rows && outInfo.cols) {
      code += `    // Matrix element-wise divide\n`
      code += `    for (int i = 0; i < ${outInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${outInfo.cols}; j++) {\n`
      if (denIsScalar) {
        code += `            ${outputName}[i][j] = ${div(`${numExpr}[i][j]`, denExpr)};\n`
      } else {
        code += `            ${outputName}[i][j] = ${div(`${numExpr}[i][j]`, `${denExpr}[i][j]`)};\n`
      }
      code += `        }\n`
      code += `    }\n`
    } else if (outInfo.isArray && outInfo.arraySize) {
      code += `    // Vector element-wise divide\n`
      code += `    for (int i = 0; i < ${outInfo.arraySize}; i++) {\n`
      if (denIsScalar) {
        code += `        ${outputName}[i] = ${div(`${numExpr}[i]`, denExpr)};\n`
      } else {
        code += `        ${outputName}[i] = ${div(`${numExpr}[i]`, `${denExpr}[i]`)};\n`
      }
      code += `    }\n`
    } else {
      code += `    ${outputName} = ${div(numExpr, denExpr)};\n`
    }

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    if (inputTypes.length === 0) {
      return 'double'
    }
    if (inputTypes.length === 1) {
      return inputTypes[0]
    }

    const numInfo = BlockModuleUtils.parseType(inputTypes[0])
    const denInfo = BlockModuleUtils.parseType(inputTypes[1])
    const numIsScalar = !numInfo.isArray && !numInfo.isMatrix
    const denIsScalar = !denInfo.isArray && !denInfo.isMatrix

    // Scalar / non-scalar is invalid — fall back to numerator type for codegen;
    // typeCompatibilityValidator reports the error to the user.
    if (numIsScalar && !denIsScalar) {
      return inputTypes[0]
    }

    // Non-scalar / scalar → broadcast, output is numerator shape
    if (!numIsScalar && denIsScalar) {
      return inputTypes[0]
    }

    // Same shape (or both scalar)
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
    return 2
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    return ['num', 'den']
  }

  getOutputPortLabels(block: BlockData): string[] | undefined {
    return ['out']
  }

  isDirectFeedthrough(block: BlockData): boolean {
    return true
  }
}

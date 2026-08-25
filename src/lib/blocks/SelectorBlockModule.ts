// lib/blocks/SelectorBlockModule.ts
//
// Vector selector (v1): pick elements by 0-based indices.
//   indices: number[]  → output scalar if length 1, else vector[K]

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class SelectorBlockModule implements IBlockModule {
  private getIndices(block: BlockData): number[] {
    const raw = block.parameters?.indices
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((n: any) => Number(n)).filter((n: number) => !isNaN(n) && n >= 0)
    }
    return [0]
  }

  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const indices = this.getIndices(block)

    let code = `    // Selector block: ${block.name} indices=[${indices.join(',')}]\n`

    if (inputs.length === 0) {
      if (indices.length === 1) {
        code += `    ${outputName} = 0.0;\n`
      } else {
        for (let k = 0; k < indices.length; k++) {
          code += `    ${outputName}[${k}] = 0.0;\n`
        }
      }
      return code
    }

    const inputExpr = inputs[0]
    const inputType = inputTypes?.[0] || 'double[1]'
    const inInfo = BlockModuleUtils.parseType(inputType)

    if (!inInfo.isArray && !inInfo.isMatrix) {
      // Scalar input — only index 0 is meaningful
      if (indices.length === 1) {
        code += `    ${outputName} = ${inputExpr};\n`
      } else {
        for (let k = 0; k < indices.length; k++) {
          code += `    ${outputName}[${k}] = ${inputExpr};\n`
        }
      }
      return code
    }

    if (inInfo.isMatrix && inInfo.rows && inInfo.cols) {
      // Diagonal extract when every index is on-diagonal and in-range (EOM I[3][3] → Ixx/Iyy/Izz).
      // Out-of-range indices (e.g. packed-İ slots 3..5 on a 3×3) → 0 (no Idot).
      const n = Math.min(inInfo.rows, inInfo.cols)
      code += `    // Selector: matrix diagonal extract / OOB→0 (${inInfo.rows}×${inInfo.cols})\n`
      if (indices.length === 1) {
        const i = indices[0]!
        code +=
          i >= 0 && i < n
            ? `    ${outputName} = ${inputExpr}[${i}][${i}];\n`
            : `    ${outputName} = 0.0;\n`
      } else {
        for (let k = 0; k < indices.length; k++) {
          const i = indices[k]!
          code +=
            i >= 0 && i < n
              ? `    ${outputName}[${k}] = ${inputExpr}[${i}][${i}];\n`
              : `    ${outputName}[${k}] = 0.0;\n`
        }
      }
      return code
    }

    // Vector input
    if (indices.length === 1) {
      code += `    ${outputName} = ${inputExpr}[${indices[0]}];\n`
    } else {
      for (let k = 0; k < indices.length; k++) {
        code += `    ${outputName}[${k}] = ${inputExpr}[${indices[k]}];\n`
      }
    }

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    const indices = this.getIndices(block)
    let baseType = 'double'
    if (inputTypes.length > 0) {
      const parsed = BlockModuleUtils.parseType(inputTypes[0])
      baseType = parsed.baseType
      // Matrix → diagonal (or OOB zeros) still yields scalar / vector of |indices|
    }
    if (indices.length === 1) {
      return baseType
    }
    return `${baseType}[${indices.length}]`
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

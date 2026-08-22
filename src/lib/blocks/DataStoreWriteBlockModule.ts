// lib/blocks/DataStoreWriteBlockModule.ts
//
// Writes input signal into model-scoped data store: model->data_stores.<storeName>
// No output (sink). Direct feedthrough for ordering (writers before readers when wired).

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class DataStoreWriteBlockModule implements IBlockModule {
  private storeIdent(block: BlockData): string {
    const name = block.parameters?.storeName || 'store'
    return BlockModuleUtils.sanitizeIdentifier(String(name))
  }

  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const store = this.storeIdent(block)
    let code = `    // Data Store Write: ${block.name} → data_stores.${store}\n`

    if (inputs.length === 0) {
      code += `    // No input connected\n`
      return code
    }

    const inputExpr = inputs[0]
    const inputType = inputTypes?.[0] || 'double'
    const storeType = block.parameters?.dataType || 'double'
    const typeInfo = BlockModuleUtils.parseType(inputType)
    const storeInfo = BlockModuleUtils.parseType(storeType)
    const storeIsScalar =
      !storeType.includes('[') ||
      (!storeInfo.isArray && !storeInfo.isMatrix)

    if (storeIsScalar) {
      // Scalar store: collapse vector/matrix writes to first element
      if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
        code += `    model->data_stores.${store} = ${inputExpr}[0][0];\n`
      } else if (typeInfo.isArray && typeInfo.arraySize) {
        code += `    model->data_stores.${store} = ${inputExpr}[0];\n`
      } else {
        code += `    model->data_stores.${store} = ${inputExpr};\n`
      }
    } else if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            model->data_stores.${store}[i][j] = ${inputExpr}[i][j];\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        model->data_stores.${store}[i] = ${inputExpr}[i];\n`
      code += `    }\n`
    } else {
      code += `    model->data_stores.${store} = ${inputExpr};\n`
    }

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    return 'void'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Sink — no signal member
    return null
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
    return 0
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    return ['in']
  }

  isDirectFeedthrough(block: BlockData): boolean {
    return true
  }
}

// lib/blocks/DataStoreReadBlockModule.ts
//
// Reads model-scoped data store into output signal: out = model->data_stores.<storeName>
// Type comes from parameters.dataType (or model dataStores declaration).

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class DataStoreReadBlockModule implements IBlockModule {
  private storeIdent(block: BlockData): string {
    const name = block.parameters?.storeName || 'store'
    return BlockModuleUtils.sanitizeIdentifier(String(name))
  }

  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const store = this.storeIdent(block)
    const outputType = this.getOutputType(block, inputTypes || [])
    const typeInfo = BlockModuleUtils.parseType(outputType)

    let code = `    // Data Store Read: ${block.name} ← data_stores.${store}\n`

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = model->data_stores.${store}[i][j];\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = model->data_stores.${store}[i];\n`
      code += `    }\n`
    } else {
      code += `    ${outputName} = model->data_stores.${store};\n`
    }

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    return block.parameters?.dataType || 'double'
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
    return 0
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }

  getOutputPortLabels(block: BlockData): string[] | undefined {
    return ['out']
  }

  /**
   * Read is not direct feedthrough of a block input (no input ports).
   * Store value comes from prior write in the same step if write runs first,
   * else from previous step / initial value.
   */
  isDirectFeedthrough(block: BlockData): boolean {
    return false
  }
}

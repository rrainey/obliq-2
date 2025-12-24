// lib/blocks/ClockBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

/**
 * Clock Block Module
 *
 * Outputs the current simulation time in seconds as a double scalar value.
 * This block has no input ports and one output port.
 *
 * Output: model->time (double scalar)
 */
export class ClockBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`

    let code = `    // Clock block: ${block.name}\n`
    code += `    ${outputName} = model->time;\n`

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Clock always outputs a double scalar (simulation time in seconds)
    return 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Clock blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Clock blocks don't need any state - they just read model->time
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    return []
  }

  generateInitialization(block: BlockData): string {
    return ''
  }

  getInputPortCount(block: BlockData): number {
    // Clock blocks have no input ports
    return 0
  }

  getOutputPortCount(block: BlockData): number {
    // Clock blocks have exactly 1 output
    return 1
  }
}

// lib/blocks/MultiplyBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class MultiplyBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    if (inputs.length === 0) {
      return `    ${outputName} = 0.0; // No inputs\n`
    }
    
    // Get the output type from inputTypes if available
    const outputType = inputTypes && inputTypes.length > 0 ? inputTypes[0] : 'double'
    const typeInfo = BlockModuleUtils.parseType(outputType)
    
    // Use the utility function for element-wise operations
    return BlockModuleUtils.generateElementWiseOperation(
      outputName,
      inputs,
      '*',
      typeInfo
    )
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Multiply block output type matches the first input type
    // (assumes all inputs have the same type for element-wise multiplication)
    if (inputTypes.length === 0) {
      return 'double' // Default type
    }
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Multiply blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Multiply blocks don't need state variables
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed
    return []
  }

  generateInitialization(block: BlockData): string {
    // No initialization needed
    return ''
  }

  getInputPortCount(block: BlockData): number {
    // Multiply blocks have a configurable number of inputs (default 2)
    return block.parameters?.inputCount || block.parameters?.inputs || 2
  }

  getOutputPortCount(block: BlockData): number {
    // Multiply blocks always have exactly 1 output
    return 1
  }
}
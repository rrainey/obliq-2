// lib/blocks/MultiplyBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class MultiplyBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    // Comment header
    let code = `    // Multiply block: ${block.name}\n`
    
    // Handle no inputs case
    if (inputs.length === 0) {
      code += `    ${outputName} = 0.0; // No inputs\n`
      return code
    }
    
    // Get the output type to determine operation type
    const outputType = this.getOutputType(block, [])
    const typeInfo = BlockModuleUtils.parseType(outputType)
    
    // Use the utility to generate element-wise multiplication
    code += BlockModuleUtils.generateElementWiseOperation(
      outputName,
      inputs,
      '*',
      typeInfo
    )
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // For multiply block, output type matches the first input type
    // (assuming all inputs must have the same type for valid element-wise multiplication)
    if (inputTypes.length === 0) {
      return 'double' // Default type
    }
    
    // Return the first input type - validation should ensure all are the same
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Multiply blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Multiply blocks are purely algebraic, no state needed
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed for multiply blocks
    return []
  }

  // generateInitialization is optional - multiply blocks don't need it
}
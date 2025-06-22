// lib/blocks/OutputPortBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class OutputPortBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    // Output ports copy their input to the model outputs
    const portName = block.parameters?.portName || block.name
    const safePortName = BlockModuleUtils.sanitizeIdentifier(portName)
    
    let code = `    // Output port: ${block.name}\n`
    
    if (inputs.length === 0) {
      code += `    // Warning: No input connected to output port\n`
      return code
    }
    
    const inputExpr = inputs[0] // Output ports have only one input
    
    // We need to determine if this is a vector/matrix output by looking at the input expression
    // For now, we'll generate code that handles both scalar and array cases
    
    // Check if the input is likely an array/matrix (contains brackets)
    const isLikelyArray = inputExpr.includes('[') || inputExpr.includes('.')
    
    if (!isLikelyArray) {
      // Simple scalar assignment
      code += `    model->outputs.${safePortName} = ${inputExpr};\n`
    } else {
      // For arrays/matrices, use memcpy
      // The sizeof will work correctly based on the actual type in the struct
      code += `    memcpy(model->outputs.${safePortName}, ${inputExpr}, `
      code += `sizeof(model->outputs.${safePortName}));\n`
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Output port type matches its input type
    if (inputTypes.length === 0) {
      return 'double' // Default type
    }
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Output ports don't need signal storage - they write directly to outputs struct
    return null
  }

  requiresState(block: BlockData): boolean {
    // Output ports don't need state
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed for output ports
    return []
  }

  // No initialization needed for output ports
}
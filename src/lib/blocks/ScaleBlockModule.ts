// lib/blocks/ScaleBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class ScaleBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const gain = block.parameters?.gain || 1
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    let code = `    // Scale block: ${block.name} (gain=${gain})\n`
    
    // Handle no input case
    if (inputs.length === 0) {
      code += `    ${outputName} = 0.0; // No input\n`
      return code
    }
    
    const inputExpr = inputs[0] // Scale blocks have one input
    
    // Get the output type to determine operation type
    const outputType = this.getOutputType(block, [])
    const typeInfo = BlockModuleUtils.parseType(outputType)
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Matrix scalar multiplication
      code += `    // Matrix scalar multiplication\n`
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = ${inputExpr}[i][j] * ${gain};\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Vector scalar multiplication
      code += `    // Vector scalar multiplication\n`
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = ${inputExpr}[i] * ${gain};\n`
      code += `    }\n`
    } else {
      // Scalar multiplication
      code += `    ${outputName} = ${inputExpr} * ${gain};\n`
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Scale block output type matches input type
    if (inputTypes.length === 0) {
      return 'double' // Default type
    }
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Scale blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Scale blocks are purely algebraic, no state needed
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed for scale blocks
    return []
  }

  // No initialization needed for scale blocks
}
// lib/blocks/UnaryMinusBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class UnaryMinusBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    let code = `    // Unary minus block: ${block.name}\n`
    
    if (inputs.length === 0) {
      code += `    ${outputName} = 0.0; // No input\n`
      return code
    }
    
    const inputExpr = inputs[0]
    // Must use propagated input types — empty [] defaults to scalar and breaks vectors
    const outputType = this.getOutputType(block, inputTypes || [])
    const typeInfo = BlockModuleUtils.parseType(outputType)
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Matrix negation
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = -${inputExpr}[i][j];\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Vector negation
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = -${inputExpr}[i];\n`
      code += `    }\n`
    } else {
      // Scalar negation
      code += `    ${outputName} = -${inputExpr};\n`
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Output type matches input type exactly
    if (inputTypes.length === 0) {
      return 'double' // Default
    }
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

  getInputPortCount(block: BlockData): number {
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }
}
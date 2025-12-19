// lib/blocks/TransposeBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class TransposeBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    let code = `    // Transpose block: ${block.name}\n`
    
    if (inputs.length === 0) {
      code += `    // Error: No input\n`
      return code
    }
    
    const inputExpr = inputs[0]
    const inputType = this.getInputTypeFromContext(block, 0)
    const typeInfo = BlockModuleUtils.parseType(inputType || 'double[3]')
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Matrix transpose: [m][n] -> [n][m]
      code += `    // Matrix transpose: [${typeInfo.rows}][${typeInfo.cols}] -> [${typeInfo.cols}][${typeInfo.rows}]\n`
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            ${outputName}[j][i] = ${inputExpr}[i][j];\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Vector transpose: [n] -> [n][1]
      code += `    // Vector transpose: [${typeInfo.arraySize}] -> [${typeInfo.arraySize}][1]\n`
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[i][0] = ${inputExpr}[i];\n`
      code += `    }\n`
    } else {
      // Scalar - no transpose needed, just pass through
      code += `    ${outputName} = ${inputExpr}; // Scalar pass-through\n`
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    if (inputTypes.length === 0) {
      return 'double' // Default
    }
    
    const inputType = inputTypes[0]
    const typeInfo = BlockModuleUtils.parseType(inputType)
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Matrix transpose: [m][n] -> [n][m]
      return `${typeInfo.baseType}[${typeInfo.cols}][${typeInfo.rows}]`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Vector transpose: [n] -> [n][1]
      return `${typeInfo.baseType}[${typeInfo.arraySize}][1]`
    } else {
      // Scalar remains scalar
      return inputType
    }
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

  // Helper method - in practice this would get the type from the connection context
  private getInputTypeFromContext(block: BlockData, portIndex: number): string | null {
    // This is a placeholder - the actual implementation would need access to
    // the connected wire types through the code generation context
    return null
  }
}
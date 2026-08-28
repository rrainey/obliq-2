// lib/blocks/ScaleBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class ScaleBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    // Use ?? so an explicit gain of 0 is honored (|| 1 would treat 0 as missing).
    const gain = block.parameters?.gain ?? 1
    
    if (inputs.length === 0) {
      return `    ${outputName} = 0.0; // No input\n`
    }
    
    const input = inputs[0]
    
    // Get the input type to determine if we need loops
    const inputType = inputTypes && inputTypes.length > 0 ? inputTypes[0] : 'double'
    const typeInfo = BlockModuleUtils.parseType(inputType)
    
    let code = `    // Scale block: ${block.name} (gain = ${gain})\n`
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Matrix scaling
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = ${input}[i][j] * ${gain};\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Vector scaling
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = ${input}[i] * ${gain};\n`
      code += `    }\n`
    } else {
      // Scalar scaling
      code += `    ${outputName} = ${input} * ${gain};\n`
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Scale block output type matches the input type
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
    // Scale blocks don't need state variables
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
    // Scale blocks have exactly 1 input
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    // Scale blocks have exactly 1 output
    return 1
  }
}
// lib/blocks/IfBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'
import { SignalValue } from '@/lib/modelSchema'

export class IfBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    let code = `    // If block: ${block.name}\n`
    
    if (inputs.length < 3) {
      code += `    // Error: If block requires 3 inputs (input1, control, input2)\n`
      return code
    }
    
    const input1 = inputs[0]
    const control = inputs[1]
    const input2 = inputs[2]
    
    // Get the output type to handle vectors/matrices properly
    const outputType = this.getOutputType(block, [])
    const typeInfo = BlockModuleUtils.parseType(outputType)
    
    code += `    // If control is true/nonzero, output = input2, else output = input1\n`
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Matrix conditional copy
      code += `    if (${control}) {\n`
      code += `        // Copy input2 to output\n`
      code += `        for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `            for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `                ${outputName}[i][j] = ${input2}[i][j];\n`
      code += `            }\n`
      code += `        }\n`
      code += `    } else {\n`
      code += `        // Copy input1 to output\n`
      code += `        for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `            for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `                ${outputName}[i][j] = ${input1}[i][j];\n`
      code += `            }\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Vector conditional copy
      code += `    if (${control}) {\n`
      code += `        // Copy input2 to output\n`
      code += `        for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `            ${outputName}[i] = ${input2}[i];\n`
      code += `        }\n`
      code += `    } else {\n`
      code += `        // Copy input1 to output\n`
      code += `        for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `            ${outputName}[i] = ${input1}[i];\n`
      code += `        }\n`
      code += `    }\n`
    } else {
      // Scalar conditional assignment
      code += `    ${outputName} = ${control} ? ${input2} : ${input1};\n`
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Output type matches input1 and input2 types (which must be identical)
    if (inputTypes.length > 0) {
      return inputTypes[0] // Return type of first input
    }
    return 'double' // Default
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
    return 3
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    return ['input1', 'control', 'input2']
  }
}
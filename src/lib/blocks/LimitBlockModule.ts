// lib/blocks/LimitBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class LimitBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const lowerLimit = block.parameters?.lowerLimit ?? -Infinity
    const upperLimit = block.parameters?.upperLimit ?? Infinity

    if (inputs.length === 0) {
      return `    ${outputName} = 0.0; // No input\n`
    }

    const input = inputs[0]

    // Get the input type to determine if we need loops
    const inputType = inputTypes && inputTypes.length > 0 ? inputTypes[0] : 'double'
    const typeInfo = BlockModuleUtils.parseType(inputType)

    let code = `    // Limit block: ${block.name} (lower = ${lowerLimit}, upper = ${upperLimit})\n`

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Matrix limiting
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = fmax(${lowerLimit}, fmin(${upperLimit}, ${input}[i][j]));\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Vector limiting
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = fmax(${lowerLimit}, fmin(${upperLimit}, ${input}[i]));\n`
      code += `    }\n`
    } else {
      // Scalar limiting
      code += `    ${outputName} = fmax(${lowerLimit}, fmin(${upperLimit}, ${input}));\n`
    }

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Limit block output type matches the input type (passthrough)
    if (inputTypes.length === 0) {
      return 'double' // Default type
    }
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Limit blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Limit blocks are stateless - no internal state needed
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
    // Limit blocks have exactly 1 input
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    // Limit blocks have exactly 1 output
    return 1
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    return ['Input']
  }

  getOutputPortLabels(block: BlockData): string[] | undefined {
    return ['Output']
  }
}

// lib/blocks/SumBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'
import { parseType, ParsedType } from '@/lib/typeValidator'

export class SumBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    if (inputs.length === 0) {
      return `    ${outputName} = 0.0; // No inputs\n`
    }
    
    // Get signs from parameters
    const signs = block.parameters?.signs || '+'.repeat(inputs.length)
    
    // Determine output type from input types if available
    const outputType = inputTypes && inputTypes.length > 0 
      ? this.getOutputType(block, inputTypes)
      : 'double' // Default fallback
    
    // Use the type validator to parse the type
    let parsedType: ParsedType
    try {
      parsedType = parseType(outputType)
    } catch (error) {
      console.warn(`Invalid output type for sum block ${block.name}: ${outputType}`)
      parsedType = { baseType: 'double', isArray: false, isMatrix: false }
    }
    
    // Generate computation based on parsed type
    if (parsedType.isMatrix && parsedType.rows && parsedType.cols) {
      // Matrix addition with signs
      let code = `    // Matrix addition with signs (${parsedType.rows}×${parsedType.cols})\n`
      code += `    for (int i = 0; i < ${parsedType.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${parsedType.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = `
      
      for (let k = 0; k < inputs.length; k++) {
        const sign = signs[k] || '+'
        if (k > 0) code += ` ${sign} `
        else if (sign === '-') code += `-`
        code += `${inputs[k]}[i][j]`
      }
      
      code += `;\n        }\n    }\n`
      return code
    } else if (parsedType.isArray && parsedType.arraySize) {
      // Vector addition with signs
      let code = `    // Vector addition with signs (size ${parsedType.arraySize})\n`
      code += `    for (int i = 0; i < ${parsedType.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = `
      
      for (let k = 0; k < inputs.length; k++) {
        const sign = signs[k] || '+'
        if (k > 0) code += ` ${sign} `
        else if (sign === '-') code += `-`
        code += `${inputs[k]}[i]`
      }
      
      code += `;\n    }\n`
      return code
    } else {
      // Scalar addition with signs
      let computation = `${outputName} = `
      
      for (let i = 0; i < inputs.length; i++) {
        const sign = signs[i] || '+'
        if (i > 0) computation += ` ${sign} `
        else if (sign === '-') computation += `-`
        computation += inputs[i]
      }
      
      return `    ${computation};\n`
    }
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Sum block output type matches the first input type
    // (assumes all inputs have the same type, which is validated elsewhere)
    if (inputTypes.length === 0) {
      return 'double' // Default type
    }
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Sum blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Sum blocks don't need state variables
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
    // Port count based on signs length or numInputs
    if (block.parameters?.signs) {
      return block.parameters.signs.length
    }
    return block.parameters?.numInputs || block.parameters?.inputCount || 2
  }

  getOutputPortCount(block: BlockData): number {
    // Sum blocks always have exactly 1 output
    return 1
  }
}
// lib/blocks/Lookup1DBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class Lookup1DBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const blockName = BlockModuleUtils.sanitizeIdentifier(block.name)
    
    if (inputs.length === 0) {
      return `    ${outputName} = 0.0; // No input\n`
    }
    
    const inputExpr = inputs[0]
    const inputValues = block.parameters?.inputValues || [0, 1]
    const outputValues = block.parameters?.outputValues || [0, 1]
    const extrapolation = block.parameters?.extrapolation || 'clamp'
    const tableSize = Math.min(inputValues.length, outputValues.length)
    
    let code = `    // 1D Lookup block: ${block.name}\n`
    code += `    {\n`
    code += `        double input = ${inputExpr};\n`
    code += `        double output = 0.0;\n`
    code += `        \n`
    code += `        // Lookup table data\n`
    code += `        const double ${blockName}_inputs[${tableSize}] = {`
    code += inputValues.slice(0, tableSize).join(', ')
    code += `};\n`
    code += `        const double ${blockName}_outputs[${tableSize}] = {`
    code += outputValues.slice(0, tableSize).join(', ')
    code += `};\n`
    code += `        \n`
    
    // Handle edge cases
    code += `        if (input <= ${blockName}_inputs[0]) {\n`
    if (extrapolation === 'clamp') {
      code += `            output = ${blockName}_outputs[0];\n`
    } else {
      code += `            // Extrapolate\n`
      code += `            if (${tableSize} >= 2) {\n`
      code += `                double slope = (${blockName}_outputs[1] - ${blockName}_outputs[0]) / `
      code += `(${blockName}_inputs[1] - ${blockName}_inputs[0]);\n`
      code += `                output = ${blockName}_outputs[0] + slope * (input - ${blockName}_inputs[0]);\n`
      code += `            } else {\n`
      code += `                output = ${blockName}_outputs[0];\n`
      code += `            }\n`
    }
    code += `        } else if (input >= ${blockName}_inputs[${tableSize - 1}]) {\n`
    if (extrapolation === 'clamp') {
      code += `            output = ${blockName}_outputs[${tableSize - 1}];\n`
    } else {
      code += `            // Extrapolate\n`
      code += `            if (${tableSize} >= 2) {\n`
      code += `                double slope = (${blockName}_outputs[${tableSize - 1}] - ${blockName}_outputs[${tableSize - 2}]) / `
      code += `(${blockName}_inputs[${tableSize - 1}] - ${blockName}_inputs[${tableSize - 2}]);\n`
      code += `                output = ${blockName}_outputs[${tableSize - 1}] + slope * (input - ${blockName}_inputs[${tableSize - 1}]);\n`
      code += `            } else {\n`
      code += `                output = ${blockName}_outputs[${tableSize - 1}];\n`
      code += `            }\n`
    }
    code += `        } else {\n`
    code += `            // Linear interpolation\n`
    code += `            for (int i = 0; i < ${tableSize - 1}; i++) {\n`
    code += `                if (input >= ${blockName}_inputs[i] && input <= ${blockName}_inputs[i + 1]) {\n`
    code += `                    double t = (input - ${blockName}_inputs[i]) / `
    code += `(${blockName}_inputs[i + 1] - ${blockName}_inputs[i]);\n`
    code += `                    output = ${blockName}_outputs[i] + t * (${blockName}_outputs[i + 1] - ${blockName}_outputs[i]);\n`
    code += `                    break;\n`
    code += `                }\n`
    code += `            }\n`
    code += `        }\n`
    code += `        \n`
    code += `        ${outputName} = output;\n`
    code += `    }\n`
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Output type matches input type for 1D lookup
    if (inputTypes.length === 0) {
      return 'double' // Default type
    }
    // 1D lookup only accepts scalar inputs
    const baseType = BlockModuleUtils.parseType(inputTypes[0]).baseType
    return baseType // Return scalar type even if input was array
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Lookup blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Lookup blocks don't need state variables
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
    // 1D lookup blocks have exactly 1 input
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    // 1D lookup blocks have exactly 1 output
    return 1
  }

  // No custom port labels needed

}
// lib/blocks/Lookup1DBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
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

  executeSimulation(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void {
    const input = inputs[0]
    
    // Lookup blocks only accept scalar inputs
    if (Array.isArray(input)) {
      console.error(`Lookup1D block ${blockState.blockId} received vector input but expects scalar`)
      blockState.outputs[0] = 0
      return
    }
    
    const scalarInput = typeof input === 'number' ? input : 0
    const { inputValues, outputValues, extrapolation } = blockState.internalState
    
    // Validate that we have data
    if (!inputValues || !outputValues || inputValues.length === 0 || outputValues.length === 0) {
      blockState.outputs[0] = 0
      return
    }
    
    // Ensure arrays are the same length
    const minLength = Math.min(inputValues.length, outputValues.length)
    if (minLength === 0) {
      blockState.outputs[0] = 0
      return
    }
    
    // Single point case
    if (minLength === 1) {
      blockState.outputs[0] = outputValues[0]
      return
    }
    
    // Handle extrapolation cases
    if (scalarInput <= inputValues[0]) {
      if (extrapolation === 'clamp') {
        blockState.outputs[0] = outputValues[0]
      } else { // extrapolate
        if (minLength >= 2) {
          const slope = (outputValues[1] - outputValues[0]) / (inputValues[1] - inputValues[0])
          blockState.outputs[0] = outputValues[0] + slope * (scalarInput - inputValues[0])
        } else {
          blockState.outputs[0] = outputValues[0]
        }
      }
      return
    }
    
    if (scalarInput >= inputValues[minLength - 1]) {
      if (extrapolation === 'clamp') {
        blockState.outputs[0] = outputValues[minLength - 1]
      } else { // extrapolate
        if (minLength >= 2) {
          const slope = (outputValues[minLength - 1] - outputValues[minLength - 2]) / 
                       (inputValues[minLength - 1] - inputValues[minLength - 2])
          blockState.outputs[0] = outputValues[minLength - 1] + slope * (scalarInput - inputValues[minLength - 1])
        } else {
          blockState.outputs[0] = outputValues[minLength - 1]
        }
      }
      return
    }
    
    // Find the interpolation interval
    for (let i = 0; i < minLength - 1; i++) {
      if (scalarInput >= inputValues[i] && scalarInput <= inputValues[i + 1]) {
        // Linear interpolation
        const x0 = inputValues[i]
        const x1 = inputValues[i + 1]
        const y0 = outputValues[i]
        const y1 = outputValues[i + 1]
        
        // Avoid division by zero
        if (x1 === x0) {
          blockState.outputs[0] = y0
        } else {
          const t = (scalarInput - x0) / (x1 - x0)
          blockState.outputs[0] = y0 + t * (y1 - y0)
        }
        return
      }
    }
    
    // Fallback (shouldn't reach here)
    blockState.outputs[0] = outputValues[0]
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
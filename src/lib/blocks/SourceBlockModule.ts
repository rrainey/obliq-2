// lib/blocks/SourceBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'
import { parseType, ParsedType } from '@/lib/typeValidator'

export class SourceBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const signalType = block.parameters?.signalType || 'constant'
    const dataType = block.parameters?.dataType || 'double'
    const typeInfo = BlockModuleUtils.parseType(dataType)

    let code = `    // Source block: ${block.name} (${signalType})\n`

    if (signalType === 'constant') {
      // Check if this constant uses a parameter reference
      const useParameter = block.parameters?.useParameter
      const parameterName = block.parameters?.parameterName

      if (useParameter && parameterName) {
        // Use parameter reference instead of literal value
        code += `    // Using parameter: ${parameterName}\n`

        if (typeInfo.isMatrix) {
          // Matrix parameter - copy the parameter array
          code += `    // Matrix parameter\n`
          if (typeInfo.rows && typeInfo.cols) {
            for (let i = 0; i < typeInfo.rows; i++) {
              for (let j = 0; j < typeInfo.cols; j++) {
                code += `    ${outputName}[${i}][${j}] = ${parameterName}[${i}][${j}];\n`
              }
            }
          }
        } else if (typeInfo.isArray) {
          // Vector parameter - copy the parameter array
          code += `    // Vector parameter\n`
          if (typeInfo.arraySize) {
            for (let i = 0; i < typeInfo.arraySize; i++) {
              code += `    ${outputName}[${i}] = ${parameterName}[${i}];\n`
            }
          }
        } else {
          // Scalar parameter - use #define directly
          code += `    ${outputName} = ${parameterName};\n`
        }
      } else {
        // For constants, use the value directly
        const value = block.parameters?.value

        if (typeInfo.isMatrix && Array.isArray(value) && Array.isArray(value[0])) {
          // Matrix constant
          code += `    // Matrix constant\n`
          for (let i = 0; i < value.length; i++) {
            for (let j = 0; j < value[i].length; j++) {
              code += `    ${outputName}[${i}][${j}] = ${value[i][j]};\n`
            }
          }
        } else if (typeInfo.isArray && Array.isArray(value)) {
          // Vector constant
          code += `    // Vector constant\n`
          for (let i = 0; i < value.length; i++) {
            code += `    ${outputName}[${i}] = ${value[i]};\n`
          }
        } else {
          // Scalar constant
          const constantValue = value !== undefined ? value : 0
          code += `    ${outputName} = ${constantValue};\n`
        }
      }
    } else {
      // For signal generators, we need to implement the signal generation
      // This is a simplified version - real implementation would need time tracking
      code += `    // Signal generator type: ${signalType}\n`
      code += `    // TODO: Implement ${signalType} signal generation\n`
      code += `    ${outputName} = 0.0; // Placeholder\n`
    }

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Source block output type is defined by its dataType parameter
    return block.parameters?.dataType || 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Source blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Source blocks might need state for signal generation
    const signalType = block.parameters?.signalType || 'constant'
    return signalType !== 'constant'
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    const signalType = block.parameters?.signalType || 'constant'
    if (signalType === 'constant') {
      return []
    }
    
    // For signal generators, we might need to track phase or other state
    const blockName = BlockModuleUtils.sanitizeIdentifier(block.name)
    return [`    double ${blockName}_phase;`]
  }

  generateInitialization(block: BlockData): string {
    const signalType = block.parameters?.signalType || 'constant'
    if (signalType === 'constant') {
      return ''
    }
    
    const blockName = BlockModuleUtils.sanitizeIdentifier(block.name)
    return `    model->states.${blockName}_phase = 0.0;\n`
  }

  getInputPortCount(block: BlockData): number {
    // Source blocks have no input ports (they are sources)
    return 0
  }

  getOutputPortCount(block: BlockData): number {
    // Source blocks always have exactly 1 output
    return 1
  }

}
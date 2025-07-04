// lib/blocks/SumBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
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

  executeSimulation(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void {
    if (inputs.length === 0) {
      blockState.outputs[0] = 0
      return
    }

    // Get signs from block data
    const signs = blockState.blockData?.parameters?.signs || '+'.repeat(inputs.length)

    // Determine the type from the first input
    const firstInput = inputs[0]
    
    if (Array.isArray(firstInput) && Array.isArray(firstInput[0])) {
      // All inputs should be matrices with same dimensions
      const firstMatrix = firstInput as unknown as number[][]
      const rows = firstMatrix.length
      const cols = firstMatrix[0]?.length || 0
      
      // Initialize result matrix with zeros
      const result: number[][] = Array(rows).fill(null).map(() => Array(cols).fill(0))
      
      // Process each input signal
      for (let inputIdx = 0; inputIdx < inputs.length; inputIdx++) {
        const sign = signs[inputIdx] || '+'
        const inputSignal = inputs[inputIdx]
        
        if (Array.isArray(inputSignal) && Array.isArray(inputSignal[0])) {
          const matrix = inputSignal as unknown as number[][]
          // Add/subtract this matrix to the result
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              if (sign === '+') {
                result[r][c] += matrix[r][c]
              } else {
                result[r][c] -= matrix[r][c]
              }
            }
          }
        }
      }
      
      blockState.outputs[0] = result
      
    } else if (Array.isArray(firstInput)) {
      // All inputs should be vectors with same length
      const length = firstInput.length
      const result = new Array(length).fill(0)
      
      // Process each input signal
      for (let inputIdx = 0; inputIdx < inputs.length; inputIdx++) {
        const sign = signs[inputIdx] || '+'
        const inputSignal = inputs[inputIdx]
        
        if (Array.isArray(inputSignal) && inputSignal.length === length) {
          // Add/subtract this vector to the result
          for (let i = 0; i < length; i++) {
            if (sign === '+') {
              result[i] += (inputSignal[i] as number) || 0
            } else {
              result[i] -= (inputSignal[i] as number) || 0
            }
          }
        }
      }
      
      blockState.outputs[0] = result
      
    } else {
      // All inputs should be scalars
      let sum = 0
      
      for (let inputIdx = 0; inputIdx < inputs.length; inputIdx++) {
        const sign = signs[inputIdx] || '+'
        const val = inputs[inputIdx]
        
        if (typeof val === 'number') {
          if (sign === '+') {
            sum += val
          } else {
            sum -= val
          }
        }
      }
      
      blockState.outputs[0] = sum
    }
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
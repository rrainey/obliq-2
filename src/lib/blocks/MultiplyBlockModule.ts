// lib/blocks/MultiplyBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class MultiplyBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    if (inputs.length === 0) {
      return `    ${outputName} = 0.0; // No inputs\n`
    }
    
    // Get the output type from inputTypes if available
    const outputType = inputTypes && inputTypes.length > 0 ? inputTypes[0] : 'double'
    const typeInfo = BlockModuleUtils.parseType(outputType)
    
    // Use the utility function for element-wise operations
    return BlockModuleUtils.generateElementWiseOperation(
      outputName,
      inputs,
      '*',
      typeInfo
    )
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Multiply block output type matches the first input type
    // (assumes all inputs have the same type for element-wise multiplication)
    if (inputTypes.length === 0) {
      return 'double' // Default type
    }
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Multiply blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Multiply blocks don't need state variables
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
    
    // Check if we're dealing with matrices
    const firstInput = inputs[0]
    if (Array.isArray(firstInput) && Array.isArray(firstInput[0])) {
      // Matrix multiplication (element-wise)
      const firstMatrix = firstInput as unknown as number[][]
      const rows = firstMatrix.length
      const cols = firstMatrix[0]?.length || 0
      
      // Initialize result matrix with first input
      const result: number[][] = firstMatrix.map(row => [...row])
      
      // Multiply remaining matrices element-wise
      for (let i = 1; i < inputs.length; i++) {
        const input = inputs[i]
        if (Array.isArray(input) && Array.isArray(input[0])) {
          const matrix = input as unknown as number[][]
          // Check dimensions match
          if (matrix.length === rows && matrix[0]?.length === cols) {
            for (let r = 0; r < rows; r++) {
              for (let c = 0; c < cols; c++) {
                result[r][c] *= matrix[r][c]
              }
            }
          } else {
            console.warn(`Dimension mismatch in multiply block ${blockState.blockId}: expected ${rows}×${cols} matrix`)
          }
        } else if (typeof input === 'number') {
          // Multiply all elements by scalar
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              result[r][c] *= input
            }
          }
        }
      }
      
      blockState.outputs[0] = result
    } else if (Array.isArray(firstInput)) {
      // Vector multiplication (element-wise)
      const result = [...firstInput] as number[]
      
      for (let i = 1; i < inputs.length; i++) {
        const input = inputs[i]
        if (Array.isArray(input) && input.length === result.length) {
          // Element-wise multiplication
          for (let j = 0; j < result.length; j++) {
            result[j] *= (input[j] as number) || 0
          }
        } else if (typeof input === 'number') {
          // Multiply all elements by scalar
          for (let j = 0; j < result.length; j++) {
            result[j] *= input
          }
        } else {
          // Type mismatch
          console.warn(`Type mismatch in multiply block ${blockState.blockId}`)
        }
      }
      
      blockState.outputs[0] = result
    } else {
      // Scalar multiplication
      let product = 1
      for (const val of inputs) {
        if (typeof val === 'number') {
          product *= val
        }
      }
      blockState.outputs[0] = product
    }
  }

  getInputPortCount(block: BlockData): number {
    // Multiply blocks have a configurable number of inputs (default 2)
    return block.parameters?.inputCount || block.parameters?.inputs || 2
  }

  getOutputPortCount(block: BlockData): number {
    // Multiply blocks always have exactly 1 output
    return 1
  }
}
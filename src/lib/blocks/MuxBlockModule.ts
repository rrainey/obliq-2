// lib/blocks/MuxBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class MuxBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const rows = block.parameters?.rows || 2
    const cols = block.parameters?.cols || 2
    const expectedInputs = rows * cols
    
    let code = `    // Mux block: ${block.name} (${rows}×${cols})\n`
    
    // Special case: 1×1 mux is a pass-through
    if (rows === 1 && cols === 1) {
      if (inputs.length > 0) {
        code += `    ${outputName} = ${inputs[0]};\n`
      } else {
        code += `    ${outputName} = 0.0;\n`
      }
      return code
    }
    
    // Case 1: Vector output (either 1×n or n×1)
    if (rows === 1 || cols === 1) {
      const size = Math.max(rows, cols)
      code += `    // Vector output\n`
      for (let i = 0; i < size; i++) {
        if (i < inputs.length) {
          code += `    ${outputName}[${i}] = ${inputs[i]};\n`
        } else {
          code += `    ${outputName}[${i}] = 0.0;\n`
        }
      }
    } else {
      // Case 2: Matrix output
      code += `    // Matrix output (row-major order)\n`
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const inputIndex = i * cols + j
          if (inputIndex < inputs.length) {
            code += `    ${outputName}[${i}][${j}] = ${inputs[inputIndex]};\n`
          } else {
            code += `    ${outputName}[${i}][${j}] = 0.0;\n`
          }
        }
      }
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    const rows = block.parameters?.rows || 2
    const cols = block.parameters?.cols || 2
    const baseType = block.parameters?.outputType || 'double'
    
    // Special case: 1×1 mux outputs a scalar
    if (rows === 1 && cols === 1) {
      return baseType
    }
    
    // Vector output (either 1×n or n×1)
    if (rows === 1 || cols === 1) {
      const size = Math.max(rows, cols)
      return `${baseType}[${size}]`
    }
    
    // Matrix output
    return `${baseType}[${rows}][${cols}]`
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Mux blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Mux blocks don't need state variables
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
    const rows = blockState.internalState?.rows || 2
    const cols = blockState.internalState?.cols || 2
    const outputType = blockState.internalState?.outputType || 'double'
    
    // Check if we have the expected number of inputs
    const expectedInputs = rows * cols
    if (inputs.length !== expectedInputs) {
      console.warn(`Mux block ${blockState.blockId} expected ${expectedInputs} inputs but received ${inputs.length}`)
    }
    
    // Special case: 1×1 mux acts as a pass-through
    if (rows === 1 && cols === 1) {
      blockState.outputs[0] = inputs[0] !== undefined ? inputs[0] : 0
      return
    }
    
    // Determine if output should be boolean based on outputType
    const isBooleanOutput = outputType === 'bool'
    
    // Case 1: Vector output (either 1×n or n×1)
    if (rows === 1 || cols === 1) {
      const size = Math.max(rows, cols)
      
      if (isBooleanOutput) {
        // Create boolean array
        const result: boolean[] = []
        for (let i = 0; i < size; i++) {
          const input = inputs[i]
          if (typeof input === 'boolean') {
            result.push(input)
          } else if (typeof input === 'number') {
            result.push(input !== 0) // Convert number to boolean
          } else {
            result.push(false) // Default
          }
        }
        blockState.outputs[0] = result
      } else {
        // Create number array
        const result: number[] = []
        for (let i = 0; i < size; i++) {
          const input = inputs[i]
          if (typeof input === 'number') {
            result.push(input)
          } else if (typeof input === 'boolean') {
            result.push(input ? 1 : 0) // Convert boolean to number
          } else {
            result.push(0) // Default
          }
        }
        blockState.outputs[0] = result
      }
      return
    }
    
    // Case 2: Matrix output (m×n where both > 1)
    if (isBooleanOutput) {
      // Create boolean matrix
      const result: boolean[][] = []
      for (let i = 0; i < rows; i++) {
        result[i] = []
        for (let j = 0; j < cols; j++) {
          const inputIndex = i * cols + j // Row-major order
          const input = inputs[inputIndex]
          
          if (typeof input === 'boolean') {
            result[i][j] = input
          } else if (typeof input === 'number') {
            result[i][j] = input !== 0 // Convert number to boolean
          } else {
            result[i][j] = false // Default
          }
        }
      }
      // Cast to unknown first to satisfy TypeScript
      blockState.outputs[0] = result as unknown as number[][]
    } else {
      // Create number matrix
      const result: number[][] = []
      for (let i = 0; i < rows; i++) {
        result[i] = []
        for (let j = 0; j < cols; j++) {
          const inputIndex = i * cols + j // Row-major order
          const input = inputs[inputIndex]
          
          if (typeof input === 'number') {
            result[i][j] = input
          } else if (typeof input === 'boolean') {
            result[i][j] = input ? 1 : 0 // Convert boolean to number
          } else {
            result[i][j] = 0 // Default
          }
        }
      }
      blockState.outputs[0] = result
    }
  }

  getInputPortCount(block: BlockData): number {
    // Mux blocks have dynamic input count based on dimensions
    const rows = block.parameters?.rows || 2
    const cols = block.parameters?.cols || 2
    return rows * cols
  }

  getOutputPortCount(block: BlockData): number {
    // Mux blocks always have exactly 1 output
    return 1
  }

  // Could provide custom labels but default numbering is fine
  getInputPortLabels?(block: BlockData): string[] | undefined {
    return undefined
  }

  getOutputPortLabels?(block: BlockData): string[] | undefined {
    return undefined
  }
}
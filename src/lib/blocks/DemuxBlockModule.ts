// lib/blocks/DemuxBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationEngine'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class DemuxBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    if (inputs.length === 0) {
      return `    // Demux block: ${block.name} - no input\n`
    }
    
    const inputExpr = inputs[0]
    const blockName = BlockModuleUtils.sanitizeIdentifier(block.name)
    
    // Get the output count from parameters (would be set dynamically based on input)
    const outputCount = block.parameters?.outputCount || 1
    const inputDimensions = block.parameters?.inputDimensions || [1]
    
    let code = `    // Demux block: ${block.name}\n`
    
    // Single output case
    if (outputCount === 1) {
      code += `    model->signals.${blockName}_0 = ${inputExpr};\n`
      return code
    }
    
    // Vector input case
    if (inputDimensions.length === 1) {
      code += `    // Demux vector input\n`
      for (let i = 0; i < outputCount; i++) {
        code += `    model->signals.${blockName}_${i} = ${inputExpr}[${i}];\n`
      }
    } else if (inputDimensions.length === 2) {
      // Matrix input case
      const rows = inputDimensions[0]
      const cols = inputDimensions[1]
      code += `    // Demux matrix input (row-major order)\n`
      let outputIndex = 0
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          code += `    model->signals.${blockName}_${outputIndex} = ${inputExpr}[${i}][${j}];\n`
          outputIndex++
        }
      }
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Demux always outputs scalars
    if (inputTypes.length === 0) {
      return 'double'
    }
    
    // Extract base type from input
    const inputType = inputTypes[0]
    const parsed = BlockModuleUtils.parseType(inputType)
    return parsed.baseType
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Demux needs multiple output signals
    const outputCount = block.parameters?.outputCount || 1
    const blockName = BlockModuleUtils.sanitizeIdentifier(block.name)
    
    if (outputCount === 1) {
      return `    ${outputType} ${blockName}_0;`
    }
    
    // Generate multiple scalar outputs
    let members = ''
    for (let i = 0; i < outputCount; i++) {
      if (i > 0) members += '\n'
      members += `    ${outputType} ${blockName}_${i};`
    }
    
    return members
  }

  requiresState(block: BlockData): boolean {
    // Demux blocks don't need state variables
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
    
    // Handle missing input
    if (input === undefined) {
      // Set single output to 0
      blockState.outputs = [0]
      return
    }
    
    // Case 1: Scalar input - pass through as single output
    if (typeof input === 'number' || typeof input === 'boolean') {
      blockState.outputs = [input]
      return
    }
    
    // Case 2: 1D array (vector) input
    if (Array.isArray(input) && !Array.isArray(input[0])) {
      // Split vector into scalar outputs
      const vector = input as (number | boolean)[]
      blockState.outputs = []
      
      for (let i = 0; i < vector.length; i++) {
        blockState.outputs[i] = vector[i]
      }
      
      // Store the output count for dynamic port updates
      blockState.internalState = {
        ...blockState.internalState,
        outputCount: vector.length,
        inputDimensions: [vector.length]
      }
      return
    }
    
    // Case 3: 2D array (matrix) input
    if (Array.isArray(input) && Array.isArray(input[0])) {
      // Split matrix into scalar outputs in row-major order
      const matrix = input as unknown as (number[][] | boolean[][])
      blockState.outputs = []
      let outputIndex = 0
      
      for (let i = 0; i < matrix.length; i++) {
        const row = matrix[i]
        if (Array.isArray(row)) {
          for (let j = 0; j < row.length; j++) {
            blockState.outputs[outputIndex] = row[j]
            outputIndex++
          }
        }
      }
      
      // Store the output count and dimensions for dynamic port updates
      const rows = matrix.length
      const cols = matrix[0]?.length || 0
      blockState.internalState = {
        ...blockState.internalState,
        outputCount: rows * cols,
        inputDimensions: [rows, cols]
      }
      return
    }
    
    // Fallback for unexpected input types
    console.warn(`Demux block ${blockState.blockId}: Unexpected input type`)
    blockState.outputs = [0]
  }

  getInputPortCount(block: BlockData): number {
    // Demux blocks have exactly 1 input
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    // Demux blocks have dynamic output count based on input dimensions
    const outputCount = block.parameters?.outputCount || 1
    return outputCount
  }


  getOutputPortLabels?(block: BlockData): string[] | undefined {
    // Generate custom labels for matrix outputs
    const outputCount = block.parameters?.outputCount || 1
    const inputDimensions = block.parameters?.inputDimensions || [1]
    
    if (outputCount === 1) {
      return undefined // Use default for single output
    }
    
    const labels: string[] = []
    
    if (inputDimensions.length === 1) {
      // Vector input - simple numeric labels
      for (let i = 0; i < outputCount; i++) {
        labels.push(`[${i}]`)
      }
    } else if (inputDimensions.length === 2) {
      // Matrix input - row/col labels
      const rows = inputDimensions[0]
      const cols = inputDimensions[1]
      
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          labels.push(`row${i}_col${j}`)
        }
      }
    }
    
    return labels
  }
}
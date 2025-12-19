// lib/blocks/MuxBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
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
    // If outputType is already computed and stored, use it directly
    // This ensures consistency with the UI configuration
    if (block.parameters?.outputType) {
      return block.parameters.outputType
    }

    // Fallback: derive from parameters
    const rows = block.parameters?.rows || 2
    const cols = block.parameters?.cols || 2
    const baseType = block.parameters?.baseType || 'double'

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
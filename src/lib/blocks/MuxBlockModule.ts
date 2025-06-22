// lib/blocks/MuxBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class MuxBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const rows = block.parameters?.rows || 2
    const cols = block.parameters?.cols || 2
    
    let code = `    // Mux block: ${block.name} (${rows}×${cols})\n`
    
    const expectedInputs = rows * cols
    
    // Special case: 1x1 mux is pass-through
    if (rows === 1 && cols === 1) {
      if (inputs.length > 0) {
        code += `    ${outputName} = ${inputs[0]};\n`
      } else {
        code += `    ${outputName} = 0.0;\n`
      }
      return code
    }
    
    // Case 1: Vector output (1×n or n×1)
    if (rows === 1 || cols === 1) {
      const size = Math.max(rows, cols)
      code += `    // Mux to vector\n`
      
      for (let i = 0; i < size; i++) {
        if (i < inputs.length && inputs[i]) {
          code += `    ${outputName}[${i}] = ${inputs[i]};\n`
        } else {
          code += `    ${outputName}[${i}] = 0.0;\n`
        }
      }
    } else {
      // Case 2: Matrix output
      code += `    // Mux to matrix\n`
      
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const inputIndex = i * cols + j // Row-major order
          
          if (inputIndex < inputs.length && inputs[inputIndex]) {
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
    
    // Special case: 1x1 mux
    if (rows === 1 && cols === 1) {
      return inputTypes.length > 0 ? inputTypes[0] : 'double'
    }
    
    // Vector output (1×n or n×1)
    if (rows === 1 || cols === 1) {
      const size = Math.max(rows, cols)
      return `double[${size}]`
    }
    
    // Matrix output
    return `double[${rows}][${cols}]`
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Mux blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Mux blocks don't need state
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed
    return []
  }

  /**
   * Get the number of input ports for this mux block
   */
  getInputPortCount(block: BlockData): number {
    const rows = block.parameters?.rows || 2
    const cols = block.parameters?.cols || 2
    return rows * cols
  }

  /**
   * Get a descriptive name for an input port
   */
  getInputPortName(block: BlockData, portIndex: number): string {
    const rows = block.parameters?.rows || 2
    const cols = block.parameters?.cols || 2
    
    if (rows === 1 && cols === 1) {
      return 'in'
    }
    
    // For vectors
    if (rows === 1 || cols === 1) {
      return `in${portIndex}`
    }
    
    // For matrices (row-major order)
    const row = Math.floor(portIndex / cols)
    const col = portIndex % cols
    return `in_${row}_${col}`
  }

  // No initialization needed
}
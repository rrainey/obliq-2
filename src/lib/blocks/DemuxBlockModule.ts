// lib/blocks/DemuxBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class DemuxBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const baseName = BlockModuleUtils.sanitizeIdentifier(block.name)
    
    let code = `    // Demux block: ${block.name}\n`
    
    if (inputs.length === 0) {
      code += `    // No input connected\n`
      return code
    }
    
    const inputExpr = inputs[0]
    
    // Without type information, generate basic scalar output
    // In full implementation, we'd use input type to determine behavior
    code += `    // Demux output (type-dependent)\n`
    code += `    model->signals.${baseName}_0 = ${inputExpr}; // Placeholder\n`
    
    return code
  }
  
  generateComputationWithType(block: BlockData, inputs: string[], inputType: string): string {
    const baseName = BlockModuleUtils.sanitizeIdentifier(block.name)
    
    let code = `    // Demux block: ${block.name}\n`
    
    if (inputs.length === 0) {
      code += `    // No input connected\n`
      return code
    }
    
    const inputExpr = inputs[0]
    const typeInfo = BlockModuleUtils.parseType(inputType)
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Matrix demux - output each element
      code += `    // Demux matrix to scalars\n`
      let outputIndex = 0
      for (let i = 0; i < typeInfo.rows; i++) {
        for (let j = 0; j < typeInfo.cols; j++) {
          code += `    model->signals.${baseName}_${outputIndex} = ${inputExpr}[${i}][${j}];\n`
          outputIndex++
        }
      }
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Vector demux
      code += `    // Demux vector to scalars\n`
      for (let i = 0; i < typeInfo.arraySize; i++) {
        code += `    model->signals.${baseName}_${i} = ${inputExpr}[${i}];\n`
      }
    } else {
      // Scalar pass-through
      code += `    // Scalar pass-through\n`
      code += `    model->signals.${baseName}_0 = ${inputExpr};\n`
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Demux always outputs scalars
    // The actual number of outputs depends on input type
    if (inputTypes.length === 0) {
      return 'double'
    }
    
    const typeInfo = BlockModuleUtils.parseType(inputTypes[0])
    return typeInfo.baseType // Individual elements are scalars
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Demux needs multiple signal storage locations
    // This will be handled specially by the code generator
    // For now, return null as individual signals are generated elsewhere
    return null
  }
  
  /**
   * Generate struct members for all demux outputs
   */
  generateDemuxStructMembers(block: BlockData, inputType: string): string[] {
    const baseName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const typeInfo = BlockModuleUtils.parseType(inputType)
    const members: string[] = []
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // Generate output for each matrix element
      const count = typeInfo.rows * typeInfo.cols
      for (let i = 0; i < count; i++) {
        members.push(`    ${typeInfo.baseType} ${baseName}_${i};`)
      }
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      // Generate output for each vector element
      for (let i = 0; i < typeInfo.arraySize; i++) {
        members.push(`    ${typeInfo.baseType} ${baseName}_${i};`)
      }
    } else {
      // Single scalar output
      members.push(`    ${typeInfo.baseType} ${baseName}_0;`)
    }
    
    return members
  }

  requiresState(block: BlockData): boolean {
    // Demux blocks don't need state
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed
    return []
  }

  /**
   * Get the number of output ports based on input type
   */
  getOutputPortCount(block: BlockData, inputType: string): number {
    const typeInfo = BlockModuleUtils.parseType(inputType)
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      return typeInfo.rows * typeInfo.cols
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      return typeInfo.arraySize
    } else {
      return 1 // Scalar
    }
  }

  /**
   * Get a descriptive name for an output port
   */
  getOutputPortName(block: BlockData, portIndex: number, inputType: string): string {
    const typeInfo = BlockModuleUtils.parseType(inputType)
    
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      // For matrices, use row_col notation
      const row = Math.floor(portIndex / typeInfo.cols)
      const col = portIndex % typeInfo.cols
      return `out_${row}_${col}`
    } else if (typeInfo.isArray) {
      // For vectors, use index
      return `out_${portIndex}`
    } else {
      // Scalar
      return 'out'
    }
  }

  // No initialization needed
}
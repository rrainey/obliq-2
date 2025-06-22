// lib/blocks/SourceBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class SourceBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const signalType = block.parameters?.signalType || 'constant'
    const value = block.parameters?.value || 0
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    let code = `    // Source block: ${block.name} (${signalType})\n`
    
    if (signalType === 'constant') {
      // Determine the output type to handle arrays/matrices properly
      const outputType = this.getOutputType(block, [])
      const typeInfo = BlockModuleUtils.parseType(outputType)
      
      if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
        // Matrix source
        if (Array.isArray(value) && Array.isArray(value[0])) {
          // Use actual matrix values
          code += `    {\n`
          code += `        // Initialize matrix from constant values\n`
          for (let i = 0; i < typeInfo.rows; i++) {
            for (let j = 0; j < typeInfo.cols; j++) {
              const val = (value[i] && value[i][j] !== undefined) ? value[i][j] : 0
              code += `        ${outputName}[${i}][${j}] = ${val};\n`
            }
          }
          code += `    }\n`
        } else {
          // Fill matrix with scalar value
          code += `    // Fill matrix with constant value\n`
          code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
          code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
          code += `            ${outputName}[i][j] = ${value};\n`
          code += `        }\n`
          code += `    }\n`
        }
      } else if (typeInfo.isArray && typeInfo.arraySize) {
        // Vector source
        if (Array.isArray(value)) {
          // Use actual array values
          code += `    {\n`
          code += `        const ${typeInfo.baseType} init[] = {`
          code += value.map((v: any) => String(v)).join(', ')
          code += `};\n`
          code += `        for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
          code += `            ${outputName}[i] = init[i];\n`
          code += `        }\n`
          code += `    }\n`
        } else {
          // Fill array with scalar value
          code += `    // Fill array with constant value\n`
          code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
          code += `        ${outputName}[i] = ${value};\n`
          code += `    }\n`
        }
      } else {
        // Scalar source
        code += `    ${outputName} = ${value};\n`
      }
    } else if (signalType === 'sine') {
      // Sine wave generation
      const frequency = block.parameters?.frequency || 1.0
      const amplitude = block.parameters?.amplitude || 1.0
      const phase = block.parameters?.phase || 0.0
      code += `    ${outputName} = ${amplitude} * sin(2.0 * M_PI * ${frequency} * model->time + ${phase});\n`
    } else if (signalType === 'step') {
      // Step function
      const stepTime = block.parameters?.stepTime || 1.0
      const stepValue = block.parameters?.stepValue || 1.0
      code += `    ${outputName} = (model->time >= ${stepTime}) ? ${stepValue} : 0.0;\n`
    } else if (signalType === 'ramp') {
      // Ramp function
      const slope = block.parameters?.slope || 1.0
      const startTime = block.parameters?.startTime || 0.0
      code += `    ${outputName} = (model->time >= ${startTime}) ? ${slope} * (model->time - ${startTime}) : 0.0;\n`
    } else {
      // Unknown signal type
      code += `    // TODO: Implement ${signalType} signal generation\n`
      code += `    ${outputName} = 0.0; // Placeholder\n`
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Source blocks define their output type via dataType parameter
    // If not specified, infer from the value for constants
    const dataType = block.parameters?.dataType
    if (dataType) {
      return dataType
    }
    
    // For constant sources, try to infer type from value
    const signalType = block.parameters?.signalType || 'constant'
    if (signalType === 'constant') {
      const value = block.parameters?.value
      if (Array.isArray(value)) {
        if (Array.isArray(value[0])) {
          // 2D array - matrix
          const rows = value.length
          const cols = value[0].length
          return `double[${rows}][${cols}]`
        } else {
          // 1D array - vector
          return `double[${value.length}]`
        }
      }
    }
    
    // Default to scalar double
    return 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Source blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Source blocks don't need state (they use model time)
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed for source blocks
    return []
  }

  // No special initialization needed - values are set in step function
}
// lib/blocks/DemuxBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
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
    // Labels must match generateStructMember / generateComputation suffixes: name_0, name_1, …
    // (Do not use "[0]" or "row0_col0" — those sanitize to different C identifiers.)
    const outputCount = block.parameters?.outputCount || 1
    if (outputCount === 1) {
      return undefined
    }
    return Array.from({ length: outputCount }, (_, i) => String(i))
  }
}

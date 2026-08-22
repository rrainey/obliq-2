// lib/blocks/DemuxBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class DemuxBlockModule implements IBlockModule {
  generateComputation(
    block: BlockData,
    inputs: string[],
    inputTypes?: string[]
  ): string {
    if (inputs.length === 0) {
      return `    // Demux block: ${block.name} - no input\n`
    }

    const inputExpr = inputs[0]
    const blockName = BlockModuleUtils.sanitizeIdentifier(block.name)

    const outputCount = block.parameters?.outputCount || 1
    const inputDimensions = block.parameters?.inputDimensions as
      | number[]
      | undefined
    const inType = inputTypes?.[0] || 'double'
    const typeInfo = BlockModuleUtils.parseType(inType)

    let code = `    // Demux block: ${block.name}\n`

    // Single output case
    if (outputCount === 1) {
      code += `    model->signals.${blockName}_0 = ${inputExpr};\n`
      return code
    }

    // Scalar input (e.g. wrongly demuxing euler phi / relational) — first out = value, rest 0
    // Prefer the type string itself: parseType can miss some shapes, but "double[3]" always has '['.
    // Do NOT trust inputDimensions alone — expandMux may set [N] even when the live
    // signal is scalar (e.g. Airspeed), which would emit illegal Airspeed[i].
    const reallyVector =
      inType.includes('[') &&
      !/Relational_Operator|Compare_To|condition/i.test(inputExpr)
    if (!reallyVector) {
      // Type map may still say scalar while the signal is a vector in the
      // struct (Product double[3], aerolib SinCos). Index only when the
      // source expression name strongly indicates a vector producer.
      if (
        outputCount > 1 &&
        /_Product\b|Initial_Conditions_Product|SinCos|_sin\b|_cos\b/i.test(
          inputExpr
        )
      ) {
        code += `    // Demux presumed vector input (type map scalar)\n`
        for (let i = 0; i < outputCount; i++) {
          code += `    model->signals.${blockName}_${i} = ${inputExpr}[${i}];\n`
        }
        return code
      }
      code += `    // Demux scalar input\n`
      code += `    model->signals.${blockName}_0 = ${inputExpr};\n`
      for (let i = 1; i < outputCount; i++) {
        code += `    model->signals.${blockName}_${i} = 0.0;\n`
      }
      return code
    }

    // Matrix input
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `    // Demux matrix input (row-major order)\n`
      let outputIndex = 0
      for (let i = 0; i < typeInfo.rows; i++) {
        for (let j = 0; j < typeInfo.cols; j++) {
          if (outputIndex < outputCount) {
            code += `    model->signals.${blockName}_${outputIndex} = ${inputExpr}[${i}][${j}];\n`
          }
          outputIndex++
        }
      }
      return code
    }

    // Vector input (preferred over stale inputDimensions)
    if (typeInfo.isArray && typeInfo.arraySize) {
      code += `    // Demux vector input\n`
      for (let i = 0; i < outputCount; i++) {
        if (i < typeInfo.arraySize) {
          code += `    model->signals.${blockName}_${i} = ${inputExpr}[${i}];\n`
        } else {
          code += `    model->signals.${blockName}_${i} = 0.0;\n`
        }
      }
      return code
    }

    // Fallback: parameters.inputDimensions
    if (inputDimensions && inputDimensions.length === 2) {
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
    } else {
      code += `    // Demux vector input\n`
      for (let i = 0; i < outputCount; i++) {
        code += `    model->signals.${blockName}_${i} = ${inputExpr}[${i}];\n`
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

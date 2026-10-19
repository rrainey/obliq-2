// lib/blocks/MagnitudeBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class MagnitudeBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    
    let code = `    // Magnitude block: ${block.name}\n`
    
    if (inputs.length === 0) {
      code += `    ${outputName} = 0.0; // No input\n`
      return code
    }
    
    const inputExpr = inputs[0]
    
    // Vector length from the connected signal's type; a column matrix
    // (e.g. a double[4][1] quaternion) counts as a vector.
    const typeInfo = BlockModuleUtils.parseType(inputTypes?.[0] || 'double[3]')
    const column = !!(typeInfo.isMatrix && typeInfo.cols === 1 && typeInfo.rows)
    const vectorSize = column ? typeInfo.rows! : typeInfo.arraySize || 3
    const element = column ? `${inputExpr}[i][0]` : `${inputExpr}[i]`

    code += `    ${outputName} = 0.0;\n`
    code += `    for (int i = 0; i < ${vectorSize}; i++) {\n`
    code += `        ${outputName} += ${element} * ${element};\n`
    code += `    }\n`
    code += `    ${outputName} = sqrt(${outputName});\n`
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Magnitude always outputs a scalar
    return 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    return []
  }

  getInputPortCount(block: BlockData): number {
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }
}
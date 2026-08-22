// lib/blocks/DotProductBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class DotProductBlockModule implements IBlockModule {
  generateComputation(
    block: BlockData,
    inputs: string[],
    inputTypes?: string[]
  ): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`

    let code = `    // Dot product block: ${block.name}\n`

    if (inputs.length < 2) {
      code += `    ${outputName} = 0.0; // Error: Dot product requires 2 inputs\n`
      return code
    }

    const t0 = BlockModuleUtils.parseType(inputTypes?.[0] || 'double[3]')
    const col0 = !!(t0.isMatrix && t0.cols === 1 && t0.rows)
    const vectorSize =
      (t0.isArray && t0.arraySize) ||
      (col0 && t0.rows) ||
      3
    const acc = (inp: string, typ: string | undefined, i: string) => {
      const t = BlockModuleUtils.parseType(typ || 'double[3]')
      if (t.isMatrix && t.cols === 1) return `${inp}[${i}][0]`
      return `${inp}[${i}]`
    }

    code += `    ${outputName} = 0.0;\n`
    code += `    for (int i = 0; i < ${vectorSize}; i++) {\n`
    code += `        ${outputName} += ${acc(inputs[0], inputTypes?.[0], 'i')} * ${acc(inputs[1], inputTypes?.[1], 'i')};\n`
    code += `    }\n`

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Dot product always outputs a scalar
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
    return 2
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    return ['a', 'b']
  }
}
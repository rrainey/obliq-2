// lib/blocks/CrossProductBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class CrossProductBlockModule implements IBlockModule {
  generateComputation(
    block: BlockData,
    inputs: string[],
    inputTypes?: string[]
  ): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`

    let code = `    // Cross product block: ${block.name}\n`

    if (inputs.length < 2) {
      code += `    // Error: Cross product requires 2 inputs\n`
      code += `    ${outputName}[0] = 0.0;\n`
      code += `    ${outputName}[1] = 0.0;\n`
      code += `    ${outputName}[2] = 0.0;\n`
      return code
    }

    // Scalar inputs (e.g. Ground → 0) broadcast across components
    const acc = (inp: string, typ: string | undefined, i: number) =>
      typ && typ.includes('[') ? `${inp}[${i}]` : `(${inp})`
    const a = (i: number) => acc(inputs[0], inputTypes?.[0], i)
    const b = (i: number) => acc(inputs[1], inputTypes?.[1], i)

    code += `    // Cross product: a × b\n`
    code += `    ${outputName}[0] = ${a(1)} * ${b(2)} - ${a(2)} * ${b(1)};\n`
    code += `    ${outputName}[1] = ${a(2)} * ${b(0)} - ${a(0)} * ${b(2)};\n`
    code += `    ${outputName}[2] = ${a(0)} * ${b(1)} - ${a(1)} * ${b(0)};\n`

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Cross product always outputs a 3-element vector
    // Note: In a full implementation, we might validate that inputs are double[3]
    return 'double[3]'
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
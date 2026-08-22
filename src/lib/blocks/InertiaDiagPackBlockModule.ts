// lib/blocks/InertiaDiagPackBlockModule.ts
//
// Pack principal-axis inertia + I_dot for aerolib Mass & Inertia out3:
//   out[6] = [Ixx, Iyy, Izz, Idxx, Idyy, Idzz]
//
// Inputs:
//   [0] I     — double[3][3] (only diagonal used) or double[3] diagonal
//   [1] I_dot — double[3][3], double[3], or scalar (broadcast)

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class InertiaDiagPackBlockModule implements IBlockModule {
  generateComputation(
    block: BlockData,
    inputs: string[],
    inputTypes?: string[]
  ): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    let code = `    // Inertia diag pack: ${block.name} → [Ixx,Iyy,Izz,Idxx,Idyy,Idzz]\n`

    if (inputs.length < 1) {
      code += `    for (int i = 0; i < 6; i++) ${outputName}[i] = 0.0;\n`
      return code
    }

    const I = inputs[0]
    const Id = inputs.length > 1 ? inputs[1] : null
    const Ity = inputTypes?.[0] || 'double[3][3]'
    const Idty = inputTypes?.[1] || 'double'
    const Ip = BlockModuleUtils.parseType(Ity)
    const Idp = BlockModuleUtils.parseType(Idty)

    const Idiag = (k: number) => {
      if (Ip.isMatrix && Ip.rows && Ip.cols) return `${I}[${k}][${k}]`
      if (Ip.isArray) return `${I}[${k}]`
      return `(${I})`
    }

    const Idot = (k: number) => {
      if (!Id) return '0.0'
      if (Idp.isMatrix && Idp.rows && Idp.cols) return `${Id}[${k}][${k}]`
      if (Idp.isArray) return `${Id}[${k}]`
      return `(${Id})`
    }

    for (let k = 0; k < 3; k++) {
      code += `    ${outputName}[${k}] = ${Idiag(k)};\n`
    }
    for (let k = 0; k < 3; k++) {
      code += `    ${outputName}[${k + 3}] = ${Idot(k)};\n`
    }
    return code
  }

  getOutputType(_block: BlockData, _inputTypes: string[]): string {
    return 'double[6]'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(_block: BlockData): boolean {
    return false
  }

  generateStateStructMembers(_block: BlockData, _outputType: string): string[] {
    return []
  }

  generateInitialization(_block: BlockData): string {
    return ''
  }

  getInputPortCount(_block: BlockData): number {
    return 2
  }

  getOutputPortCount(_block: BlockData): number {
    return 1
  }

  getInputPortLabels(_block: BlockData): string[] | undefined {
    return ['I', 'I_dot']
  }

  getOutputPortLabels(_block: BlockData): string[] | undefined {
    return ['I_Idot']
  }

  isDirectFeedthrough(_block: BlockData): boolean {
    return true
  }
}

// lib/blocks/SaturationDynamicBlockModule.ts
// Simulink Saturation Dynamic: y = clamp(u, lo, up) with signal limits.
// Ports: in0=up, in1=u, in2=lo. Element-wise when u (or limits) are vectors.
// The C is y = fmax(lo, fmin(up, u)), so y = lo when lo > up.

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

/**
 * The input ports, in port order. Shipped models are wired to this order
 * (it is also Simulink's order), so do not change it.
 */
export const SATURATION_DYNAMIC_INPUTS = [
  { label: 'up', description: 'upper limit' },
  { label: 'u', description: 'input signal' },
  { label: 'lo', description: 'lower limit' },
] as const

/**
 * The block symbol: a saturation characteristic on two axes, in a 28 x 24
 * unit box. The canvas (BlockNode) and the PDF (pdfRenderer) draw these paths.
 */
export const SATURATION_DYNAMIC_SYMBOL = {
  width: 28,
  height: 24,
  axes: ['M14 2V22', 'M1 12H27'],
  curve: 'M2 20H9L19 4H26',
} as const

/** Font size, in canvas px, of the port names inside the block. */
export const SATURATION_DYNAMIC_PORT_NAME_PX = 8

function preferSignalType(inputTypes: string[]): string {
  // Prefer u (in1); fall back to first vector among ports; else scalar.
  const u = inputTypes[1]
  if (u && u.includes('[')) return u
  for (const t of inputTypes) {
    if (t && t.includes('[')) return t
  }
  return u || inputTypes[0] || 'double'
}

export class SaturationDynamicBlockModule implements IBlockModule {
  generateComputation(
    block: BlockData,
    inputs: string[],
    inputTypes?: string[]
  ): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    let code = `    // Saturation Dynamic: ${block.name} (clamp u between lo and up)\n`

    if (inputs.length < 3) {
      code += `    // Error: Saturation Dynamic needs up, u, lo\n`
      code += `    ${outputName} = 0.0;\n`
      return code
    }

    const up = inputs[0]!.replace(/\s+/g, '_')
    const u = inputs[1]!.replace(/\s+/g, '_')
    const lo = inputs[2]!.replace(/\s+/g, '_')
    const types = inputTypes || []
    const outType = preferSignalType(types)
    const typeInfo = BlockModuleUtils.parseType(outType)

    const idx = (base: string, t: string | undefined, iExpr: string): string => {
      const info = BlockModuleUtils.parseType(t || 'double')
      if (info.isArray && info.arraySize) return `${base}[${iExpr}]`
      if (info.isMatrix && info.rows && info.cols === 1) return `${base}[${iExpr}][0]`
      return base // scalar broadcast
    }

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            double _u = ${u}[i][j];\n`
      const upT = BlockModuleUtils.parseType(types[0] || 'double')
      const loT = BlockModuleUtils.parseType(types[2] || 'double')
      const upE = upT.isMatrix ? `${up}[i][j]` : up
      const loE = loT.isMatrix ? `${lo}[i][j]` : lo
      code += `            ${outputName}[i][j] = fmax(${loE}, fmin(${upE}, _u));\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        double _u = ${idx(u, types[1], 'i')};\n`
      code += `        double _up = ${idx(up, types[0], 'i')};\n`
      code += `        double _lo = ${idx(lo, types[2], 'i')};\n`
      code += `        ${outputName}[i] = fmax(_lo, fmin(_up, _u));\n`
      code += `    }\n`
    } else {
      code += `    ${outputName} = fmax(${lo}, fmin(${up}, ${u}));\n`
    }

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    return preferSignalType(inputTypes)
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
    return 3
  }

  getOutputPortCount(_block: BlockData): number {
    return 1
  }

  getInputPortLabels(_block: BlockData): string[] | undefined {
    return SATURATION_DYNAMIC_INPUTS.map(p => p.label)
  }

  getOutputPortLabels(_block: BlockData): string[] | undefined {
    return ['y']
  }
}

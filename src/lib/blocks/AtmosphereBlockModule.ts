// lib/blocks/AtmosphereBlockModule.ts
//
// Atmosphere model: U.S. Standard Atmosphere 1976 (COESA) from its defining
// formulae (see lib/atmosphere/ussa1976.ts), or a user-supplied table.
//
// Ports (match MathWorks / aerolib COESA Atmosphere Model order):
//   in  [0] altitude_m (geometric altitude above MSL, meters)
//   out [0] temperature_K
//   out [1] speed_of_sound_mps
//   out [2] pressure_Pa
//   out [3] density_kgpm3
//
// Parameters:
//   model: 'coesa1976' | 'table'  (default coesa1976)
//   extrapolation: 'clamp' | 'extrapolate'
//     coesa1976: clamp the altitude to the formulae's range (-5 km .. 86 km),
//                or continue the end layers' formulae beyond it
//     table:     clamp to the table ends, or extrapolate linearly
//   (table mode) altitudeBreakpoints, temperatureValues, pressureValues,
//                densityValues, speedOfSoundValues

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'
import { USSA1976, LAYER_BASE_PRESSURES } from '@/lib/atmosphere/ussa1976'

const OUT_SUFFIXES = [
  'temperature_K',
  'speed_of_sound_mps',
  'pressure_Pa',
  'density_kgpm3'
] as const

export class AtmosphereBlockModule implements IBlockModule {
  private getTable(block: BlockData) {
    if (block.parameters?.model === 'table' &&
        Array.isArray(block.parameters.altitudeBreakpoints) &&
        block.parameters.altitudeBreakpoints.length > 0) {
      return {
        altitude_m: block.parameters.altitudeBreakpoints as number[],
        temperature_K: (block.parameters.temperatureValues || []) as number[],
        pressure_Pa: (block.parameters.pressureValues || []) as number[],
        density_kgpm3: (block.parameters.densityValues || []) as number[],
        speed_of_sound_mps: (block.parameters.speedOfSoundValues || []) as number[]
      }
    }
    return null
  }

  /** U.S. Standard Atmosphere 1976 layer formulae (same as ussa1976() in TypeScript). */
  private generateStandardAtmosphere(block: BlockData, hIn: string, outs: string[]): string {
    const baseName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const p = `${baseName}_atm`
    const clamp = (block.parameters?.extrapolation || 'clamp') === 'clamp'
    const L = USSA1976.layers
    const n = L.length
    const num = (x: number) => (Number.isInteger(x) ? `${x}.0` : String(x))
    const list = (xs: readonly number[]) => xs.map(num).join(', ')
    const { g0, Rstar, M0, r0, gamma, zMin, zMax } = USSA1976

    let code = `    // Atmosphere block: ${block.name} (U.S. Standard Atmosphere 1976 formulae${clamp ? `, altitude clamped to ${zMin}..${zMax} m` : ''})\n`
    code += `    {\n`
    code += `        static const double ${p}_Hb[${n}] = { ${list(L.map(l => l.Hb))} };\n`
    code += `        static const double ${p}_Tb[${n}] = { ${list(L.map(l => l.Tb))} };\n`
    code += `        static const double ${p}_Lb[${n}] = { ${list(L.map(l => l.Lb))} };\n`
    code += `        static const double ${p}_Pb[${n}] = { ${LAYER_BASE_PRESSURES.map(x => x.toPrecision(17)).join(', ')} };\n`
    code += `        const double ${p}_gmr = ${num(g0)} * ${num(M0)} / ${num(Rstar)};\n`
    code += clamp
      ? `        const double ${p}_z = fmin(${num(zMax)}, fmax(${num(zMin)}, ${hIn}));\n`
      : `        const double ${p}_z = ${hIn};\n`
    code += `        const double ${p}_H = ${num(r0)} * ${p}_z / (${num(r0)} + ${p}_z); /* geopotential altitude */\n`
    code += `        int ${p}_b = 0;\n`
    code += `        while (${p}_b < ${n - 1} && ${p}_H >= ${p}_Hb[${p}_b + 1]) ${p}_b++;\n`
    code += `        const double ${p}_dH = ${p}_H - ${p}_Hb[${p}_b];\n`
    code += `        const double ${p}_T = ${p}_Tb[${p}_b] + ${p}_Lb[${p}_b] * ${p}_dH;\n`
    code += `        const double ${p}_P = (${p}_Lb[${p}_b] == 0.0)\n`
    code += `            ? ${p}_Pb[${p}_b] * exp(-${p}_gmr * ${p}_dH / ${p}_Tb[${p}_b])\n`
    code += `            : ${p}_Pb[${p}_b] * pow(${p}_Tb[${p}_b] / ${p}_T, ${p}_gmr / ${p}_Lb[${p}_b]);\n`
    code += `        ${outs[0]} = ${p}_T;\n`
    code += `        ${outs[1]} = sqrt(${num(gamma)} * ${num(Rstar)} * ${p}_T / ${num(M0)});\n`
    code += `        ${outs[2]} = ${p}_P;\n`
    code += `        ${outs[3]} = ${p}_P * ${num(M0)} / (${num(Rstar)} * ${p}_T);\n`
    code += `    }\n`
    return code
  }

  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const baseName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const outs0 = OUT_SUFFIXES.map(s => `model->signals.${baseName}_${s}`)
    const table = this.getTable(block)
    if (!table) {
      if (inputs.length === 0) {
        return `    // Atmosphere block: ${block.name} (no altitude input: sea level)\n` +
          `    ${outs0[0]} = 288.15;\n    ${outs0[1]} = 340.294;\n    ${outs0[2]} = 101325.0;\n    ${outs0[3]} = 1.225;\n`
      }
      return this.generateStandardAtmosphere(block, inputs[0]!, outs0)
    }
    const n = Math.min(
      table.altitude_m.length,
      table.temperature_K.length,
      table.pressure_Pa.length,
      table.density_kgpm3.length,
      table.speed_of_sound_mps.length
    )
    const clamp = (block.parameters?.extrapolation || 'clamp') === 'clamp'

    const outs = OUT_SUFFIXES.map(s => `model->signals.${baseName}_${s}`)

    let code = `    // Atmosphere block: ${block.name} (custom table, n=${n})\n`

    if (inputs.length === 0 || n < 2) {
      code += `    ${outs[0]} = 288.15;\n` // T
      code += `    ${outs[1]} = 340.29;\n` // a
      code += `    ${outs[2]} = 101325.0;\n` // P
      code += `    ${outs[3]} = 1.225;\n` // rho
      return code
    }

    const hIn = inputs[0]
    const prefix = `${baseName}_atm`

    code += `    {\n`
    code += `        double ${prefix}_h_in = ${hIn};\n`
    code += `        const double ${prefix}_h[${n}] = {${table.altitude_m.slice(0, n).join(', ')}};\n`

    // Order matches OUT_SUFFIXES / Simulink COESA: T, a, P, rho
    const series = [
      { key: 'T', arr: table.temperature_K, out: outs[0] },
      { key: 'a', arr: table.speed_of_sound_mps, out: outs[1] },
      { key: 'P', arr: table.pressure_Pa, out: outs[2] },
      { key: 'rho', arr: table.density_kgpm3, out: outs[3] }
    ]

    // Shared altitude breakpoints; per-quantity y tables
    for (const s of series) {
      code += `        const double ${prefix}_${s.key}_y[${n}] = {${s.arr.slice(0, n).join(', ')}};\n`
    }

    // Find segment once, then interpolate all quantities
    code += `        double ${prefix}_t = 0.0;\n`
    code += `        int ${prefix}_i = 0;\n`
    code += `        int ${prefix}_use_edge = 0; /* 0=interp, -1=low, 1=high */\n`
    code += `        if (${prefix}_h_in <= ${prefix}_h[0]) {\n`
    code += `            ${prefix}_use_edge = -1;\n`
    code += `        } else if (${prefix}_h_in >= ${prefix}_h[${n - 1}]) {\n`
    code += `            ${prefix}_use_edge = 1;\n`
    code += `        } else {\n`
    code += `            for (int i = 0; i < ${n - 1}; i++) {\n`
    code += `                if (${prefix}_h_in >= ${prefix}_h[i] && ${prefix}_h_in <= ${prefix}_h[i + 1]) {\n`
    code += `                    ${prefix}_i = i;\n`
    code += `                    ${prefix}_t = (${prefix}_h_in - ${prefix}_h[i]) / (${prefix}_h[i + 1] - ${prefix}_h[i]);\n`
    code += `                    break;\n`
    code += `                }\n`
    code += `            }\n`
    code += `        }\n`

    for (const s of series) {
      const y = `${prefix}_${s.key}_y`
      if (clamp) {
        code += `        if (${prefix}_use_edge == -1) ${s.out} = ${y}[0];\n`
        code += `        else if (${prefix}_use_edge == 1) ${s.out} = ${y}[${n - 1}];\n`
        code += `        else ${s.out} = ${y}[${prefix}_i] + ${prefix}_t * (${y}[${prefix}_i + 1] - ${y}[${prefix}_i]);\n`
      } else {
        code += `        if (${prefix}_use_edge == -1) {\n`
        code += `            double slope = (${y}[1] - ${y}[0]) / (${prefix}_h[1] - ${prefix}_h[0]);\n`
        code += `            ${s.out} = ${y}[0] + slope * (${prefix}_h_in - ${prefix}_h[0]);\n`
        code += `        } else if (${prefix}_use_edge == 1) {\n`
        code += `            double slope = (${y}[${n - 1}] - ${y}[${n - 2}]) / (${prefix}_h[${n - 1}] - ${prefix}_h[${n - 2}]);\n`
        code += `            ${s.out} = ${y}[${n - 1}] + slope * (${prefix}_h_in - ${prefix}_h[${n - 1}]);\n`
        code += `        } else {\n`
        code += `            ${s.out} = ${y}[${prefix}_i] + ${prefix}_t * (${y}[${prefix}_i + 1] - ${y}[${prefix}_i]);\n`
        code += `        }\n`
      }
    }

    code += `    }\n`

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Multi-output scalars; type propagator uses first port type
    return 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    const baseName = BlockModuleUtils.sanitizeIdentifier(block.name)
    return OUT_SUFFIXES.map(s => `    double ${baseName}_${s};`).join('\n')
  }

  requiresState(block: BlockData): boolean {
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    return []
  }

  generateInitialization(block: BlockData): string {
    return ''
  }

  getInputPortCount(block: BlockData): number {
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    return 4
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    return ['altitude_m']
  }

  getOutputPortLabels(block: BlockData): string[] | undefined {
    return [...OUT_SUFFIXES]
  }

  isDirectFeedthrough(block: BlockData): boolean {
    return true
  }

  /** Suffix used for multi-output signal naming (port index → C member suffix) */
  static getOutputSuffix(portIndex: number): string {
    return OUT_SUFFIXES[portIndex] || String(portIndex)
  }
}

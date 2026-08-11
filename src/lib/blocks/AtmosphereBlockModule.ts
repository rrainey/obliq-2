// lib/blocks/AtmosphereBlockModule.ts
//
// Atmosphere model (v1): table-based COESA 1976 profile.
//
// Ports:
//   in  [0] altitude_m (geometric altitude above MSL, meters)
//   out [0] temperature_K
//   out [1] pressure_Pa
//   out [2] density_kgpm3
//   out [3] speed_of_sound_mps
//
// Parameters:
//   model: 'coesa1976' | 'table'  (default coesa1976)
//   extrapolation: 'clamp' | 'extrapolate'
//   (table mode) altitudeBreakpoints, temperatureValues, pressureValues,
//                densityValues, speedOfSoundValues

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'
import { COESA_1976_TABLE } from '@/lib/atmosphere/coesa1976Tables'

const OUT_SUFFIXES = ['temperature_K', 'pressure_Pa', 'density_kgpm3', 'speed_of_sound_mps'] as const

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
    return COESA_1976_TABLE
  }

  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const baseName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const table = this.getTable(block)
    const n = Math.min(
      table.altitude_m.length,
      table.temperature_K.length,
      table.pressure_Pa.length,
      table.density_kgpm3.length,
      table.speed_of_sound_mps.length
    )
    const clamp = (block.parameters?.extrapolation || 'clamp') === 'clamp'

    const outs = OUT_SUFFIXES.map(s => `model->signals.${baseName}_${s}`)

    let code = `    // Atmosphere block: ${block.name} (COESA table, n=${n})\n`

    if (inputs.length === 0 || n < 2) {
      code += `    ${outs[0]} = 288.15;\n`
      code += `    ${outs[1]} = 101325.0;\n`
      code += `    ${outs[2]} = 1.225;\n`
      code += `    ${outs[3]} = 340.29;\n`
      return code
    }

    const hIn = inputs[0]
    const prefix = `${baseName}_atm`

    code += `    {\n`
    code += `        double ${prefix}_h_in = ${hIn};\n`
    code += `        const double ${prefix}_h[${n}] = {${table.altitude_m.slice(0, n).join(', ')}};\n`

    const series = [
      { key: 'T', arr: table.temperature_K, out: outs[0] },
      { key: 'P', arr: table.pressure_Pa, out: outs[1] },
      { key: 'rho', arr: table.density_kgpm3, out: outs[2] },
      { key: 'a', arr: table.speed_of_sound_mps, out: outs[3] }
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

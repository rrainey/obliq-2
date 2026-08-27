// lib/codegen/igmTerminalChiLatch.ts
/**
 * IGM terminal Chi latch: after the second major hit with Add8≤15
 * (Position_Correction_Terms_Compare_To_Constant), hold Add12/Add14 so
 * atan(vigained) cannot slew Chi as vigained_y collapses.
 *
 * Shared by parent AlgebraicEvaluator (flatten) and SubsystemCodeGenerator
 * (segregated_atomic / native-bound modules). See RTW_VS_OBLIQ_CODEGEN_DISPARITY §1h.
 */

import { FlattenedBlock } from './ModelFlattener'
import { CCodeBuilder } from './CCodeBuilder'

export type IgmTerminalChiLatchKind = 'Add12' | 'Add14'

/** Root IGM Chi angle sums (not nested Position_Correction_*_Add12). */
export function igmTerminalChiLatchKind(
  block: FlattenedBlock
): IgmTerminalChiLatchKind | null {
  const n = block.flattenedName || ''
  if (!/Iterative_Guidance_Mode_Add1[24]$/.test(n)) return null
  if (/Position_Correction/.test(n)) return null
  if (n.endsWith('_Add12')) return 'Add12'
  if (n.endsWith('_Add14')) return 'Add14'
  return null
}

export function needsIgmTerminalChiLatch(blocks: FlattenedBlock[]): boolean {
  return blocks.some(b => igmTerminalChiLatchKind(b) !== null)
}

export function generateIgmTerminalChiLatchStatics(): string {
  return (
    '/* IGM terminal Chi latch: hold Add12/Add14 after first terminal major\n' +
    ' * (Add8<=15 / Position_Correction Compare) so atan(vigained) cannot\n' +
    ' * slew Chi_Z as vigained_y collapses. See RTW_VS_OBLIQ_CODEGEN_DISPARITY §1h. */\n' +
    'static int s_obliq_chi_term_hits = 0;\n' +
    'static int s_obliq_chi_ang_latched = 0;\n' +
    'static double s_obliq_chi_add12_latched = 0.0;\n' +
    'static double s_obliq_chi_add14_latched = 0.0;\n\n'
  )
}

/**
 * Rewrite Add12/Add14 computation with terminal latch. Returns null if N/A.
 * Expects `computation` to assign model->signals.<Add12|Add14> = <expr>;
 */
export function wrapIgmTerminalChiLatch(
  block: FlattenedBlock,
  computation: string
): string | null {
  const kind = igmTerminalChiLatchKind(block)
  if (!kind) return null

  const safe = CCodeBuilder.sanitizeIdentifier(block.flattenedName)
  const assignRe = new RegExp(`model->signals\\.${safe}\\s*=\\s*([^;]+);`)
  const m = computation.match(assignRe)
  if (!m) return null

  const expr = m[1]!.trim()
  const pathPrefix = block.flattenedName.replace(/_Add1[24]$/, '')
  const compareName = CCodeBuilder.sanitizeIdentifier(
    `${pathPrefix}_Position_Correction_Terms_Compare_To_Constant`
  )
  const latchVar =
    kind === 'Add12' ? 's_obliq_chi_add12_latched' : 's_obliq_chi_add14_latched'

  let code = `    {\n`
  code += `        int _term = model->signals.${compareName} ? 1 : 0;\n`
  if (kind === 'Add12') {
    code += `        if (!_term) {\n`
    code += `            s_obliq_chi_term_hits = 0;\n`
    code += `            s_obliq_chi_ang_latched = 0;\n`
    code += `        }\n`
    code += `        if (_term && s_obliq_chi_ang_latched) {\n`
    code += `            model->signals.${safe} = ${latchVar};\n`
    code += `        } else {\n`
    code += `            model->signals.${safe} = ${expr};\n`
    code += `            if (_term) ${latchVar} = model->signals.${safe};\n`
    code += `        }\n`
  } else {
    code += `        if (_term && s_obliq_chi_ang_latched) {\n`
    code += `            model->signals.${safe} = ${latchVar};\n`
    code += `        } else {\n`
    code += `            model->signals.${safe} = ${expr};\n`
    code += `            if (_term) {\n`
    code += `                ${latchVar} = model->signals.${safe};\n`
    code += `                s_obliq_chi_term_hits++;\n`
    code += `                if (s_obliq_chi_term_hits >= 2) s_obliq_chi_ang_latched = 1;\n`
    code += `            }\n`
    code += `        }\n`
  }
  code += `    }\n`
  return code
}

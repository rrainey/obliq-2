/**
 * Map one MDL block → Obliq block descriptor(s).
 * EXPAND lowers to existing Obliq types (no silent stubs).
 */

import type { MdlBlock } from './types'
import { lookup } from './coverage'
import {
  resolveWorkspaceExpr,
  resolveWorkspaceNumber,
  WORKSPACE_CONST_NUMBERS
} from './workspaceConsts'

/** Replace bare workspace/mask identifiers in a Fcn/evaluate expression with literals. */
function resolveWorkspaceIdentifiersInExpr(
  expr: string,
  maskEnv: Record<string, string> = {}
): string {
  let out = expr
  // Mask params first (subsystem-local)
  for (const [name, value] of Object.entries(maskEnv)) {
    if (/^-?[0-9]/.test(value.trim()) || value.trim().startsWith('[')) {
      // numeric or vector literal only
      if (!value.trim().startsWith('[')) {
        out = out.replace(new RegExp(`\\b${name}\\b`, 'g'), value.trim())
      }
    }
  }
  for (const [name, value] of Object.entries(WORKSPACE_CONST_NUMBERS)) {
    out = out.replace(new RegExp(`\\b${name}\\b`, 'g'), String(value))
  }
  // Common MDL mask constant (earth rate / π stored in some masks; full rate here)
  out = out.replace(/\bomega_E_rps\b/g, '2.321e-5')
  return out
}

export interface ObliqBlockDesc {
  type: string
  name: string
  parameters: Record<string, unknown>
  /** Optional port remapping notes for wires (Simulink 1-based → Obliq 0-based handled in emitter) */
  meta?: {
    /** For Switch→if: simulink ports [u1,u2,u3] → if [falsePath, control, truePath] */
    switchToIf?: boolean
    ignored?: boolean
    passthrough?: boolean
    /**
     * Multi-port passthrough: Simulink 1-based outPort → inPort.
     * When resolving a wire from this block's output N, rewrite to the source
     * feeding input outToIn[N]. Default (absent) is {1:1} single-port PT.
     */
    passthroughOutToIn?: Record<number, number>
    /**
     * Expand selected outputs into a synthetic block instead of passthrough.
     * Key = Simulink 1-based outPort. `fromInputs` = 1-based Mass&Inertia inports
     * feeding the synthetic block (e.g. I=5, I_dot=6 → inertia_diag_pack).
     */
    passthroughExpandOut?: Record<
      number,
      { type: string; fromInputs: number[]; nameSuffix?: string }
    >
    /** Nested subsystem — emitter recurses */
    subsystem?: boolean
  }
}

export class MapError extends Error {
  constructor(
    message: string,
    public readonly blockType: string,
    public readonly blockName: string
  ) {
    super(message)
    this.name = 'MapError'
  }
}

function sanitizeName(name: string): string {
  return name.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
}

function numParam(block: MdlBlock, key: string, fallback = 0): number {
  const v = block.params[key]
  if (v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** Parse MDL Ports "[nin, nout]" or "[nin]". */
function parsePorts(block: MdlBlock): { nin?: number; nout?: number } {
  const raw = block.params.Ports || ''
  const m = raw.match(/\[\s*(\d+)\s*(?:,\s*(\d+)\s*)?\]/)
  if (!m) return {}
  return {
    nin: Number(m[1]),
    nout: m[2] !== undefined ? Number(m[2]) : undefined
  }
}

function mapMath(block: MdlBlock): ObliqBlockDesc {
  const op = (block.params.Operator || block.params.Function || '').toLowerCase()
  const name = sanitizeName(block.name)
  switch (op) {
    case 'square':
      return {
        type: 'evaluate',
        name,
        parameters: { numInputs: 1, expression: 'in(0)*in(0)' }
      }
    case 'sqrt':
      return {
        type: 'evaluate',
        name,
        parameters: { numInputs: 1, expression: 'sqrt(in(0))' }
      }
    case 'reciprocal':
      return {
        type: 'evaluate',
        name,
        parameters: { numInputs: 1, expression: '1.0/in(0)' }
      }
    case 'log':
      return {
        type: 'evaluate',
        name,
        parameters: { numInputs: 1, expression: 'log(in(0))' }
      }
    case 'pow':
      return {
        type: 'evaluate',
        name,
        parameters: { numInputs: 2, expression: 'pow(in(0),in(1))' }
      }
    case 'mod':
      // MATLAB rem/mod for GMST: positive remainder in [0, b).
      // C fmod keeps the sign of a and breaks T_to_GMST for negative eqn.
      return {
        type: 'evaluate',
        name,
        parameters: {
          numInputs: 2,
          expression: 'in(0)-in(1)*floor(in(0)/in(1))'
        }
      }
    case 'transpose':
      return { type: 'transpose', name, parameters: {} }
    case 'magnitude':
    case 'mag':
      return { type: 'mag', name, parameters: {} }
    case 'exp':
      return {
        type: 'evaluate',
        name,
        parameters: { numInputs: 1, expression: 'exp(in(0))' }
      }
    default:
      throw new MapError(
        `Math Operator "${op}" not mapped`,
        'Math',
        block.name
      )
  }
}

/** Parse MATLAB-ish coef vector "[a b c]" → number[]. */
function parseCoefs(raw: string): number[] {
  const inner = raw.replace(/^\[/, '').replace(/\]$/, '')
  return inner
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter(n => Number.isFinite(n))
}

/** Horner polynomial evaluate expression in(0). */
function hornerExpr(coefs: number[]): string {
  if (coefs.length === 0) return '0'
  // coefs high-order first (Simulink polyval)
  let expr = String(coefs[0])
  for (let i = 1; i < coefs.length; i++) {
    expr = `((${expr})*in(0)+(${coefs[i]}))`
  }
  return expr
}

function mapReference(block: MdlBlock): ObliqBlockDesc {
  const st = block.sourceType || ''
  const name = sanitizeName(block.name)
  const e = lookup('SourceType', st)
  if (e.status === 'UNMAPPED') {
    throw new MapError(
      `Reference SourceType "${st}" is UNMAPPED`,
      'Reference',
      block.name
    )
  }
  if (e.status === 'PASSTHROUGH') {
    return {
      type: 'no_connection',
      name,
      parameters: {},
      meta: { passthrough: true }
    }
  }
  switch (st) {
    case 'Unary Minus':
      return { type: 'uminus', name, parameters: {} }
    case 'CrossProduct':
      return { type: 'cross', name, parameters: {} }
    case 'Dot Product':
      return { type: 'dot', name, parameters: {} }
    case 'Angle Conversion':
    case 'Velocity Conversion':
    case 'Mass Conversion': {
      const iu = (block.params.IU || '').toLowerCase()
      const ou = (block.params.OU || '').toLowerCase()
      let conversionType = block.params.Conversion || ''
      if (!conversionType && iu && ou) conversionType = `${iu}_to_${ou}`
      if (!conversionType) conversionType = 'deg_to_rad'
      return {
        type: 'units_conversion',
        name,
        parameters: { conversionType }
      }
    }
    case 'Compare To Constant': {
      let rel = block.params.relop || '=='
      if (rel === '~=') rel = '!='
      const constv = resolveWorkspaceExpr(block.params.const || '0')
      return {
        type: 'condition',
        name,
        parameters: { condition: `${rel} ${constv}` }
      }
    }
    case 'Compare To Zero': {
      const rel = block.params.relop || '~='
      const op = rel === '~=' ? '!=' : rel === '==' ? '==' : rel
      return {
        type: 'condition',
        name,
        parameters: { condition: `${op} 0` }
      }
    }
    case 'Quaternion2DCM':
      return {
        type: 'orientation_conversion',
        name,
        parameters: { conversionType: 'quat_to_dcm' }
      }
    case 'DCM2Quaternion':
      return {
        type: 'orientation_conversion',
        name,
        parameters: { conversionType: 'dcm_to_quat' }
      }
    case 'Quaternion2Euler':
      return {
        type: 'orientation_conversion',
        name,
        parameters: { conversionType: 'quat_to_euler' }
      }
    case 'DCM2Euler':
      return {
        type: 'orientation_conversion',
        name,
        parameters: { conversionType: 'dcm_to_euler' }
      }
    case 'Euler2DCM':
      return {
        type: 'orientation_conversion',
        name,
        parameters: { conversionType: 'euler_to_dcm' }
      }
    case 'Atmosphere Model (COESA)':
    case 'Atmosphere Model':
      return {
        type: 'atmosphere',
        name,
        parameters: { model: 'coesa1976', extrapolation: 'clamp' }
      }
    case 'SinCos':
      return {
        type: 'trig',
        name,
        parameters: { function: 'sincos' }
      }
    case 'Reshape':
      return {
        type: 'no_connection',
        name,
        parameters: {},
        meta: { passthrough: true }
      }
    case 'Data Type Duplicate':
      return {
        type: 'no_connection',
        name,
        parameters: {},
        meta: { passthrough: true }
      }
    case 'Create 3x3 Matrix':
      // 9 scalar inputs → double[3][3] (column-major fill matching aerolibutil)
      return {
        type: 'mux',
        name,
        parameters: {
          rows: 3,
          cols: 3,
          baseType: 'double',
          outputType: 'double[3][3]',
          outputShape: 'matrix',
          fillOrder: 'column'
        }
      }
    case 'Dynamic Pressure':
      // aerolib Dynamic Pressure: port1=V, port2=rho → q̄ = ½ ρ V²
      return {
        type: 'evaluate',
        name,
        parameters: {
          numInputs: 2,
          expression: '0.5*in(1)*in(0)*in(0)'
        }
      }
    case 'Polyval': {
      const coefs = parseCoefs(block.params.coefs || '[]')
      return {
        type: 'evaluate',
        name,
        parameters: { numInputs: 1, expression: hornerExpr(coefs) }
      }
    }
    case 'Saturation Dynamic':
      // Ports typically: up, u, lo → clamp(u, lo, up)
      return {
        type: 'evaluate',
        name,
        parameters: {
          numInputs: 3,
          expression:
            'in(1)<in(2)?in(2):(in(1)>in(0)?in(0):in(1))'
        }
      }
    case 'Sample Time Math':
      // Ts Only → constant; default 0.01 (plant step); weightValue if present
      return {
        type: 'source',
        name,
        parameters: {
          signalType: 'constant',
          value: numParam(block, 'weightValue', 0.01) || 0.01,
          dataType: 'double'
        }
      }
    case 'Mass & Inertia (custom)':
      // aerolib6dofsys helper: in=[v,F,m,m_dot,I,I_dot]
      // out1←F, out2←m, out3←principal [Ixx,Iyy,Izz,Idxx,Idyy,Idzz], out4←I_dot.
      // Raw I[3][3] must NOT be forwarded (type-prop matrix bleed).
      return {
        type: 'no_connection',
        name,
        parameters: {},
        meta: {
          passthrough: true,
          passthroughOutToIn: { 1: 2, 2: 3, 4: 6 },
          passthroughExpandOut: {
            3: {
              type: 'inertia_diag_pack',
              fromInputs: [5, 6],
              nameSuffix: '_I_Idot'
            }
          }
        }
      }
    default:
      if (e.status === 'NEED_BLOCK') {
        throw new MapError(
          `Reference SourceType "${st}" is NEED_BLOCK${e.notes ? `: ${e.notes}` : ''}`,
          'Reference',
          block.name
        )
      }
      if (e.obliqType) {
        return { type: e.obliqType, name, parameters: {} }
      }
      throw new MapError(
        `Reference SourceType "${st}" EXPAND not implemented`,
        'Reference',
        block.name
      )
  }
}

/**
 * Map a single MDL block. Throws MapError on UNMAPPED / unimplemented EXPAND.
 */
/** Parse MaskVariables + MaskValueString into a name→value map. */
export function parseMaskParams(block: MdlBlock): Record<string, string> {
  const vars = (block.params.MaskVariables || '').trim()
  const vals = (block.params.MaskValueString || '').trim()
  if (!vars || !vals) return {}
  // "mpr_deg=@1;r_m=@2;" → ordered names by @index
  const byIndex: Array<{ idx: number; name: string }> = []
  for (const part of vars.split(';')) {
    const m = part.trim().match(/^(\w+)\s*=\s*@(\d+)\s*$/)
    if (m) byIndex.push({ name: m[1], idx: Number(m[2]) })
  }
  byIndex.sort((a, b) => a.idx - b.idx)
  // Values separated by | (Simulink mask)
  const valueParts = vals.split('|')
  const out: Record<string, string> = {}
  for (const { idx, name } of byIndex) {
    const v = valueParts[idx - 1]
    if (v !== undefined) out[name] = v.trim()
  }
  return out
}

export type MapContext = {
  /** Mask / workspace overrides visible in this subsystem scope */
  maskEnv?: Record<string, string>
  /** Parent subsystem / sheet name (for Mux9→3x3 heuristics) */
  parentName?: string
}

export function mapBlock(
  block: MdlBlock,
  ctx: MapContext = {}
): ObliqBlockDesc {
  const name = sanitizeName(block.name)
  const bt = block.blockType
  const e = lookup('BlockType', bt)
  const maskEnv = ctx.maskEnv || {}
  const parentName = ctx.parentName || ''

  if (e.status === 'IGNORE') {
    return { type: 'no_connection', name, parameters: {}, meta: { ignored: true } }
  }
  if (e.status === 'UNMAPPED') {
    throw new MapError(`BlockType "${bt}" UNMAPPED`, bt, block.name)
  }
  if (e.status === 'NEED_BLOCK') {
    throw new MapError(
      `BlockType "${bt}" NEED_BLOCK${e.notes ? ` (${e.notes})` : ''}`,
      bt,
      block.name
    )
  }
  if (e.status === 'PASSTHROUGH') {
    return {
      type: 'no_connection',
      name,
      parameters: {},
      meta: { passthrough: true }
    }
  }

  switch (bt) {
    case 'Inport': {
      const rawDim = block.params.PortDimensions
      const hasExplicitDim =
        rawDim !== undefined &&
        rawDim !== null &&
        String(rawDim).trim() !== '' &&
        String(rawDim).trim() !== '-1'
      const dim = numParam(block, 'PortDimensions', 1) || 1
      const nameKey = name.replace(/\W+/g, '_')
      const isQuat =
        /q0|quat|q_ECI|initial_quaternion/i.test(nameKey) || dim === 4
      // Inertia tensor inport (Custom Variable Mass 6DoF)
      const isI33 =
        dim <= 1 && /^(I|Inertia|I_mat|I_body)$/i.test(nameKey.trim())
      // Heuristic: common 3-vectors only when PortDimensions absent/inherit.
      // Never override an explicit scalar PortDimensions "1" (e.g. FoverM_mps2).
      // Avoid bare F_/M_b (matched FoverM, A_m_bar) and bare m_ (m_dot).
      const guess6 =
        !hasExplicitDim &&
        dim <= 1 &&
        /Date_YYYY|YYYY_mm_dd_hh_mm_ss/i.test(nameKey)
      const guess3 =
        !hasExplicitDim &&
        dim <= 1 &&
        !isI33 &&
        !guess6 &&
        !/^m_dot$/i.test(nameKey) &&
        /XYZ|Xe|Ve|Vb|XS|VS|RS|omega|p_q_r|F_b|Moments|Forces|CG|force|moment|pos|vel|Az_phi|angles|DCM|q_ECI|APS_Relays|AttitudeError|Attitude_Error|chi_cmd|Chi_cmd/i.test(
          nameKey
        )
      let dataType: string
      let defaultValue: unknown
      if (isQuat) {
        dataType = 'double[4][1]'
        defaultValue = [[1], [0], [0], [0]]
      } else if (isI33) {
        dataType = 'double[3][3]'
        defaultValue = [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0]
        ]
      } else if (guess6 || dim === 6) {
        dataType = 'double[6]'
        defaultValue = [0, 0, 0, 0, 0, 0]
      } else if (guess3 || dim === 3) {
        dataType = 'double[3]'
        defaultValue = [0, 0, 0]
      } else if (dim > 1) {
        dataType = `double[${dim}]`
        defaultValue = Array(dim).fill(0)
      } else {
        dataType = 'double'
        defaultValue = 0
      }
      return {
        type: 'input_port',
        name,
        parameters: {
          portName: nameKey.replace(/_+/g, '_').replace(/^_|_$/g, ''),
          dataType,
          defaultValue
        }
      }
    }
    case 'Outport': {
      const rawDim = block.params.PortDimensions
      const hasExplicitDim =
        rawDim !== undefined &&
        rawDim !== null &&
        String(rawDim).trim() !== '' &&
        String(rawDim).trim() !== '-1'
      const dim = numParam(block, 'PortDimensions', 1) || 1
      const nameKey = name.replace(/\W+/g, '_')
      const isQuat =
        /q0|quat|q_ECI|initial_quaternion/i.test(nameKey) || dim === 4
      // Same as Inport: do not override explicit PortDimensions "1"
      // (FoverM_mps2 is scalar magnitude; bare F_/M_b false-positived it).
      const guess3 =
        !hasExplicitDim &&
        dim <= 1 &&
        !/^m_dot$/i.test(nameKey) &&
        /XYZ|Xe|Ve|Vb|XS|VS|RS|omega|p_q_r|F_b|Moments|Forces|CG|force|moment|pos|vel|Az_phi|angles|DCM|q_ECI/i.test(
          nameKey
        )
      const effDim = isQuat ? 4 : guess3 ? 3 : dim
      const dataType = isQuat
        ? 'double[4][1]'
        : effDim <= 1
          ? 'double'
          : `double[${effDim}]`
      return {
        type: 'output_port',
        name,
        parameters: {
          portName: nameKey.replace(/_+/g, '_').replace(/^_|_$/g, ''),
          dataType
        }
      }
    }
    case 'Constant': {
      // Simulink default Constant Value is 1 when omitted in the .mdl
      let v = (block.params.Value ?? '1').trim()
      // Resolve mask parameter (e.g. r_m → "[0.0 -1.704 1.704]")
      if (maskEnv[v] !== undefined) {
        v = maskEnv[v]
      }
      if (v.startsWith('[')) {
        // Resolve mask/workspace tokens inside vectors, e.g. "[mpr_deg 0 0]"
        const tokens = v
          .replace(/[\[\]]/g, '')
          .trim()
          .split(/[\s,;]+/)
          .filter(Boolean)
        const nums = tokens.map(tok => {
          if (maskEnv[tok] !== undefined) {
            const n = Number(String(maskEnv[tok]).trim())
            return Number.isFinite(n) ? n : 0
          }
          if (WORKSPACE_CONST_NUMBERS[tok] !== undefined) {
            return WORKSPACE_CONST_NUMBERS[tok]!
          }
          const n = Number(tok)
          return Number.isFinite(n) ? n : 0
        })
        const n = nums.length || 1
        // row vs matrix: "1 2; 3 4" → treat as flat vector for emit v1
        return {
          type: 'source',
          name,
          parameters: {
            signalType: 'constant',
            value: nums,
            dataType: n === 1 ? 'double' : `double[${n}]`
          }
        }
      }
      const num = resolveWorkspaceNumber(v)
      return {
        type: 'source',
        name,
        parameters: {
          signalType: 'constant',
          value: num !== undefined ? num : 0,
          dataType: 'double'
        }
      }
    }
    case 'Ground':
      return {
        type: 'source',
        name,
        parameters: { signalType: 'constant', value: 0, dataType: 'double' }
      }
    case 'Sum': {
      // Inputs: ++ / +- etc. from IconShape or Inputs param
      const inputs = block.params.Inputs || '++'
      const signs = inputs.replace(/\|/g, '') // drop port separators
      return {
        type: 'sum',
        name,
        parameters: { signs, numInputs: signs.length }
      }
    }
    case 'Product': {
      // Simulink: Multiplication = "Matrix(*)" → matrix product; else element-wise.
      // Inputs is a string of '*' (×) and '/' (÷), e.g. "*/", "**/", "/*".
      // Matrix(*) + '/' (e.g. inv(I)*M as /*) → element-wise ops for principal-axis.
      const mode = (block.params.Multiplication || '').trim()
      const ops = String(block.params.Inputs || '**').replace(/\|/g, '')
      const n = ops.length || 2
      const isMatrix = mode === 'Matrix(*)' || /^Matrix/i.test(mode)
      if (isMatrix && !ops.includes('/')) {
        return {
          type: 'matrix_multiply',
          name,
          parameters: {}
        }
      }
      // Pure 2-input divide → dedicated divide block; mixed/multi keep multiply+ops.
      if (ops === '*/' && n === 2) {
        return {
          type: 'divide',
          name,
          parameters: { numInputs: 2 }
        }
      }
      return {
        type: 'multiply',
        name,
        parameters: { numInputs: n, ...(ops.includes('/') ? { ops } : {}) }
      }
    }
    case 'Gain': {
      let gRaw = String(block.params.Gain ?? '1').trim()
      if (maskEnv[gRaw] !== undefined) gRaw = maskEnv[gRaw]!.trim()
      else if (WORKSPACE_CONST_NUMBERS[gRaw] !== undefined) {
        gRaw = String(WORKSPACE_CONST_NUMBERS[gRaw])
      }
      // Number("1 / 240.0") is NaN — evaluate simple arithmetic Gain exprs
      let g = Number(gRaw)
      if (!Number.isFinite(g) && /^[\d.\s+\-*/()eE]+$/.test(gRaw)) {
        try {
          // eslint-disable-next-line no-new-func
          const v = Function(`"use strict"; return (${gRaw});`)()
          if (typeof v === 'number' && Number.isFinite(v)) g = v
        } catch {
          /* keep NaN → default 1 */
        }
      }
      return {
        type: 'scale',
        name,
        parameters: { gain: Number.isFinite(g) ? g : 1 }
      }
    }
    case 'Fcn': {
      // Simulink Fcn: u(i) is 1-based element of input vector; u alone is scalar.
      // Emit in(0)[i-1] so EvaluateBlockModule can lower to C subscripts.
      let expr = block.params.Expr || block.params.Expression || '0'
      expr = expr.replace(/\bu\((\d+)\)/g, (_, n) => `in(0)[${Number(n) - 1}]`)
      expr = expr.replace(/\bu\[(\d+)\]/g, (_, n) => `in(0)[${Number(n) - 1}]`)
      expr = expr.replace(/\bu\b/g, 'in(0)')
      expr = expr.replace(/\bpi\b/g, 'M_PI')
      // MATLAB power → C pow. Only safe forms: in(0)[k]^n or ident^n
      expr = expr.replace(
        /in\(0\)\[(\d+)\]\s*\^\s*(\d+(?:\.\d+)?)/g,
        'pow(in(0)[$1],$2)'
      )
      expr = expr.replace(
        /\b([A-Za-z_]\w*)\s*\^\s*(\d+(?:\.\d+)?)/g,
        'pow($1,$2)'
      )
      // Avoid C int overflow in Fcn bodies (e.g. GMST 876600*3600).
      expr = expr.replace(
        /(\d{5,})\s*\*\s*(\d{3,})/g,
        '($1.0*$2.0)'
      )
      expr = resolveWorkspaceIdentifiersInExpr(expr, maskEnv)
      return {
        type: 'evaluate',
        name,
        parameters: { numInputs: 1, expression: expr }
      }
    }
    case 'Mux': {
      const ports = parsePorts(block)
      const n =
        numParam(block, 'Inputs', 0) ||
        ports.nin ||
        3
      // Quaternion muxes (q0..q3) → column double[4][1] for orientation_conversion /
      // quaternion integrators (parent often named qdot).
      const asQuatCol =
        n === 4 && /q0|quat|qdot|q_ECI/i.test(name + ' ' + parentName)
      if (asQuatCol) {
        return {
          type: 'mux',
          name,
          parameters: {
            rows: 4,
            cols: 1,
            baseType: 'double',
            outputType: 'double[4][1]',
            outputShape: 'matrix'
          }
        }
      }
      // 9-input mux assembling a DCM → double[3][3] (column-major).
      // Match block name OR parent subsystem (MDL often names these just "Mux2"
      // inside E_Frame_to_s_Frame_MES_matrix). Flat 9-buses (IC Fcn) stay double[9].
      if (
        n === 9 &&
        /matrix|dcm|mes|asb|cio|transform|cosine/i.test(name + ' ' + parentName)
      ) {
        return {
          type: 'mux',
          name,
          parameters: {
            rows: 3,
            cols: 3,
            baseType: 'double',
            outputType: 'double[3][3]',
            outputShape: 'matrix',
            fillOrder: 'column'
          }
        }
      }
      return {
        type: 'mux',
        name,
        parameters: {
          rows: 1,
          cols: n,
          baseType: 'double',
          outputType: `double[${n}]`,
          outputShape: 'vector'
        }
      }
    }
    case 'Demux': {
      const ports = parsePorts(block)
      const n =
        numParam(block, 'Outputs', 0) ||
        ports.nout ||
        3
      return {
        type: 'demux',
        name,
        parameters: {
          outputCount: n,
          inputDimensions: [n]
        }
      }
    }
    case 'Saturate':
      return {
        type: 'limit',
        name,
        parameters: {
          lowerLimit: numParam(block, 'LowerLimit', -1),
          upperLimit: numParam(block, 'UpperLimit', 1)
        }
      }
    case 'Bias': {
      const bias = numParam(block, 'Bias', 0)
      return {
        type: 'evaluate',
        name,
        parameters: { numInputs: 1, expression: `in(0)+(${bias})` }
      }
    }
    case 'Switch':
      return {
        type: 'if',
        name,
        parameters: {},
        meta: { switchToIf: true }
      }
    case 'Math':
      return mapMath(block)
    case 'Memory':
    case 'UnitDelay':
      return {
        type: 'unit_delay',
        name,
        parameters: { initialCondition: numParam(block, 'X0', 0) }
      }
    case 'Goto':
      return {
        type: 'sheet_label_sink',
        name,
        parameters: {
          signalName: block.params.GotoTag || name,
          tagVisibility: (block.params.TagVisibility || 'local').toLowerCase()
        }
      }
    case 'From':
      return {
        type: 'sheet_label_source',
        name,
        parameters: { signalName: block.params.GotoTag || name }
      }
    case 'Reference':
      return mapReference(block)
    case 'SubSystem':
      return {
        type: 'subsystem',
        name,
        parameters: {},
        meta: { subsystem: true }
      }
    case 'SwitchCase':
      // Emit as ordinary subsystem; CaseConditions carried for diagnostics
      return {
        type: 'subsystem',
        name,
        parameters: {
          caseConditions: block.params.CaseConditions || ''
        },
        meta: { subsystem: true }
      }
    case 'DataStoreMemory': {
      const storeName = (block.params.DataStoreName || name).replace(/\W+/g, '_')
      return {
        type: 'source', // declaration lives on model.dataStores; DSM block is not executed
        name,
        parameters: {
          signalType: 'constant',
          value: 0,
          dataType: 'double',
          _dataStoreDecl: {
            name: storeName,
            dataType: block.params.DataType || 'double',
            initialValue: block.params.InitialValue || '0'
          }
        },
        meta: { ignored: true }
      }
    }
    case 'DataStoreRead': {
      const storeName = (block.params.DataStoreName || 'store').replace(/\W+/g, '_')
      return {
        type: 'data_store_read',
        name,
        parameters: {
          storeName,
          dataType: block.params.DataType || 'double'
        }
      }
    }
    case 'DataStoreWrite': {
      const storeName = (block.params.DataStoreName || 'store').replace(/\W+/g, '_')
      return {
        type: 'data_store_write',
        name,
        parameters: {
          storeName,
          dataType: block.params.DataType || 'double'
        }
      }
    }
    case 'Clock':
      return { type: 'clock', name, parameters: {} }
    case 'Signum':
      return { type: 'sign', name, parameters: {} }
    case 'Lookup':
    case 'Lookup_n-D': {
      // Legacy Lookup: InputValues / OutputValues MATLAB vectors
      const inputValues = parseCoefs(
        block.params.InputValues || block.params.BreakpointsForDimension1 || '[]'
      )
      const outputValues = parseCoefs(
        block.params.OutputValues || block.params.Table || '[]'
      )
      return {
        type: 'lookup_1d',
        name,
        parameters: {
          inputValues: inputValues.length ? inputValues : [0, 1],
          outputValues: outputValues.length ? outputValues : [0, 1],
          extrapolation: 'clamp'
        }
      }
    }
    case 'Lookup2D': {
      // RowIndex / ColumnIndex breakpoints + OutputValues as reshape([..],nR,nC)
      const input1Values = parseCoefs(block.params.RowIndex || '[]')
      const input2Values = parseCoefs(block.params.ColumnIndex || '[]')
      const raw = String(block.params.OutputValues || '')
      const reshape = raw.match(
        /reshape\s*\(\s*\[([^\]]*)\]\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i
      )
      let outputTable: number[][] = [
        [0, 0],
        [0, 1]
      ]
      if (reshape) {
        const flat = parseCoefs('[' + reshape[1] + ']')
        const nR = Number(reshape[2])
        const nC = Number(reshape[3])
        // MATLAB reshape is column-major
        outputTable = Array.from({ length: nR }, () => Array(nC).fill(0))
        for (let c = 0; c < nC; c++) {
          for (let r = 0; r < nR; r++) {
            outputTable[r]![c] = flat[c * nR + r] ?? 0
          }
        }
      } else {
        const flat = parseCoefs(raw)
        const nR = input1Values.length || 2
        const nC = input2Values.length || 2
        if (flat.length >= nR * nC) {
          outputTable = Array.from({ length: nR }, () => Array(nC).fill(0))
          for (let r = 0; r < nR; r++) {
            for (let c = 0; c < nC; c++) {
              outputTable[r]![c] = flat[r * nC + c] ?? 0
            }
          }
        }
      }
      return {
        type: 'lookup_2d',
        name,
        parameters: {
          input1Values: input1Values.length ? input1Values : [0, 1],
          input2Values: input2Values.length ? input2Values : [0, 1],
          outputTable,
          extrapolation: 'clamp'
        }
      }
    }
    case 'Selector': {
      // Rows "1:3" / "4:6" (1-based inclusive) → 0-based indices for vector pack.
      const rows = String(block.params.Rows || '').trim()
      const m = rows.match(/(\d+)\s*:\s*(\d+)/)
      let indices = [0]
      if (m) {
        const a = Number(m[1])
        const b = Number(m[2])
        indices = []
        for (let i = a; i <= b; i++) indices.push(i - 1)
      } else if (block.params.Elements) {
        // Fallback: Elements like "[1 2 3]" (1-based)
        const els = String(block.params.Elements).match(/\d+/g)
        if (els && els.length > 0) {
          indices = els.map(s => Number(s) - 1).filter(n => n >= 0)
        }
      }
      return {
        type: 'selector',
        name,
        parameters: { indices }
      }
    }
    case 'TransferFcn': {
      // Simulink TransferFcn: Numerator/Denominator, high-order first.
      // Numerator omitted → [1] (Simulink default for many aero actuators).
      const denRaw = block.params.Denominator ?? block.params.denominator
      const numRaw = block.params.Numerator ?? block.params.numerator
      let denStr = denRaw !== undefined ? String(denRaw).trim() : ''
      let numStr = numRaw !== undefined ? String(numRaw).trim() : ''
      if (maskEnv[denStr] !== undefined) denStr = maskEnv[denStr]!.trim()
      if (maskEnv[numStr] !== undefined) numStr = maskEnv[numStr]!.trim()
      const denominator = denStr ? parseCoefs(denStr) : [1, 1]
      const numerator = numStr ? parseCoefs(numStr) : [1]
      if (denominator.length === 0) {
        throw new MapError(
          'TransferFcn Denominator produced no coefficients',
          bt,
          block.name
        )
      }
      if (numerator.length === 0) {
        throw new MapError(
          'TransferFcn Numerator produced no coefficients',
          bt,
          block.name
        )
      }
      return {
        type: 'transfer_function',
        name,
        parameters: { numerator, denominator }
      }
    }
    case 'Integrator': {
      const isQuat = /q0[\s\S]*q1[\s\S]*q2[\s\S]*q3/i.test(block.name) ||
        /^q0/i.test(name.replace(/_/g, ''))
      // 6DoF state vectors often omit PortDimensions; name-guess before scalar default.
      // Avoid bare "Ve"/"Xe" — they match inside "Vehicle", "Next", etc.
      const rawName = String(block.name).replace(/\s+/g, ' ')
      const isVec3 =
        /xe[\s_,]?ye[\s_,]?ze|ub[\s_,]?vb[\s_,]?wb|p[\s_,]?q[\s_,]?r|pdot|Xe_initial|Vb_0|omega_[xyz]|velocity in SM/i.test(
          rawName
        ) || /xe_ye_ze|ub_vb_wb|p_q_r|pdot_qdot_rdot|velocity_in_SM/i.test(name)
      let dim =
        numParam(block, 'PortDimensions', isQuat ? 4 : isVec3 ? 3 : 1) ||
        (isQuat ? 4 : isVec3 ? 3 : 1)
      if (dim <= 1 && isVec3) dim = 3
      if (isQuat || dim === 4) {
        return {
          type: 'integrator',
          name,
          parameters: {
            initialValue: [[1], [0], [0], [0]],
            dataType: 'double[4][1]',
            showInitPort: true
          }
        }
      }
      if (dim > 1) {
        return {
          type: 'integrator',
          name,
          parameters: {
            initialValue: Array(dim).fill(0),
            dataType: `double[${dim}]`,
            showInitPort: true
          }
        }
      }
      return {
        type: 'integrator',
        name,
        parameters: {
          initialValue: numParam(block, 'InitialCondition', 0),
          showInitPort: true
        }
      }
    }
    case 'Trigonometry': {
      const op = (block.params.Operator || 'sin').toLowerCase()
      return { type: 'trig', name, parameters: { function: op } }
    }
    case 'Logic': {
      // Emit bool (not 1.0/0.0 double) so enable pins and conditions type-check.
      const op = (block.params.Operator || 'AND').toUpperCase()
      if (op === 'NOT') {
        return {
          type: 'evaluate',
          name,
          parameters: {
            numInputs: 1,
            expression: '!(in(0))',
            outputType: 'bool'
          }
        }
      }
      if (op === 'AND') {
        return {
          type: 'evaluate',
          name,
          parameters: {
            numInputs: 2,
            expression: '(in(0))&&(in(1))',
            outputType: 'bool'
          }
        }
      }
      if (op === 'OR') {
        return {
          type: 'evaluate',
          name,
          parameters: {
            numInputs: 2,
            expression: '(in(0))||(in(1))',
            outputType: 'bool'
          }
        }
      }
      if (op === 'XOR' || op === 'NXOR') {
        return {
          type: 'evaluate',
          name,
          parameters: {
            numInputs: 2,
            expression:
              op === 'XOR'
                ? '((bool)(in(0))!=((bool)(in(1))))'
                : '((bool)(in(0))==((bool)(in(1))))',
            outputType: 'bool'
          }
        }
      }
      throw new MapError(`Logic Operator "${op}" not mapped`, 'Logic', block.name)
    }
    case 'RelationalOperator': {
      // Simulink LogicOutDataTypeMode Boolean → Obliq bool (enable pins require bool).
      let op = block.params.Operator || '<'
      if (op === '~=') op = '!='
      return {
        type: 'evaluate',
        name,
        parameters: {
          numInputs: 2,
          expression: `in(0)${op}in(1)`,
          outputType: 'bool'
        }
      }
    }
    case 'Rounding': {
      // Default floor when Operator absent
      const op = (block.params.Operator || block.params.FcnName || 'floor').toLowerCase()
      const fn =
        op === 'ceil' ? 'ceil' : op === 'round' ? 'round' : op === 'fix' ? 'trunc' : 'floor'
      return {
        type: 'evaluate',
        name,
        parameters: { numInputs: 1, expression: `${fn}(in(0))` }
      }
    }
    case 'MultiPortSwitch': {
      // in(0)=index (0-based if zeroidx), in(1..N)=data
      const nData = Math.max(1, numParam(block, 'Inputs', 1))
      const zeroIdx = (block.params.zeroidx || 'on') !== 'off'
      let expr = `in(${nData})` // default last
      for (let i = nData - 1; i >= 0; i--) {
        const idx = zeroIdx ? i : i + 1
        const dataPort = i + 1 // in(1)..in(N)
        expr = `(in(0)==(${idx})?in(${dataPort}):(${expr}))`
      }
      return {
        type: 'evaluate',
        name,
        parameters: { numInputs: nData + 1, expression: expr }
      }
    }
    default:
      if (e.status === 'MAPPED' && e.obliqType) {
        return { type: e.obliqType, name, parameters: {} }
      }
      if (e.status === 'EXPAND') {
        throw new MapError(
          `BlockType "${bt}" EXPAND not implemented in mapper`,
          bt,
          block.name
        )
      }
      throw new MapError(`Unhandled BlockType "${bt}"`, bt, block.name)
  }
}

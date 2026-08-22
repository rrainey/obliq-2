/**
 * BlockType / Reference SourceType coverage vs Obliq library.
 *
 * Updated after auditing design/12 + a87a66a library blocks:
 * unit_delay, divide, sign, relay, rate_limiter, quantizer, selector,
 * data_store_*, edge_detect, atmosphere, condition, if, abs, uminus, …
 *
 * UNMAPPED must never silently become stubs in the emitter.
 */

import type { CoverageRow, MapStatus, MdlModel } from './types'
import { walkBlocks } from './parseMdl'

interface MapEntry {
  status: MapStatus
  obliqType?: string
  notes?: string
}

/**
 * BlockType → Obliq. Prefer existing modules over NEED_BLOCK.
 * EXPAND = lower to existing graph (evaluate / if / unit_delay / …).
 */
const BLOCK_TYPE_MAP: Record<string, MapEntry> = {
  Inport: { status: 'MAPPED', obliqType: 'input_port' },
  Outport: { status: 'MAPPED', obliqType: 'output_port' },
  SubSystem: { status: 'MAPPED', obliqType: 'subsystem', notes: 'recursive' },
  Constant: { status: 'MAPPED', obliqType: 'source' },
  Sum: { status: 'MAPPED', obliqType: 'sum' },
  Product: {
    status: 'EXPAND',
    notes:
      'Multiplication=Matrix(*) → matrix_multiply; Inputs=*/ → divide; mixed */**/ → multiply+ops'
  },
  Gain: { status: 'MAPPED', obliqType: 'scale' },
  Fcn: { status: 'MAPPED', obliqType: 'evaluate', notes: 'Simulink Fcn → expression' },
  Mux: { status: 'MAPPED', obliqType: 'mux' },
  Demux: { status: 'MAPPED', obliqType: 'demux' },
  Saturate: { status: 'MAPPED', obliqType: 'limit' },
  Integrator: { status: 'MAPPED', obliqType: 'integrator' },
  TransferFcn: { status: 'MAPPED', obliqType: 'transfer_function' },
  UnitDelay: { status: 'MAPPED', obliqType: 'unit_delay' },
  /** design/12 Phase 1: Memory ≡ unit_delay */
  Memory: {
    status: 'MAPPED',
    obliqType: 'unit_delay',
    notes: 'design/12 — Memory → unit_delay'
  },
  RateLimiter: { status: 'MAPPED', obliqType: 'rate_limiter' },
  Relay: { status: 'MAPPED', obliqType: 'relay' },
  Quantizer: { status: 'MAPPED', obliqType: 'quantizer' },
  Signum: { status: 'MAPPED', obliqType: 'sign' },
  Trigonometry: { status: 'MAPPED', obliqType: 'trig' },
  Lookup: { status: 'MAPPED', obliqType: 'lookup_1d' },
  Lookup2D: { status: 'MAPPED', obliqType: 'lookup_2d' },
  Selector: { status: 'MAPPED', obliqType: 'selector' },
  Clock: { status: 'MAPPED', obliqType: 'clock' },
  DataStoreMemory: {
    status: 'MAPPED',
    obliqType: 'data_store',
    notes: 'model dataStores[]'
  },
  DataStoreRead: { status: 'MAPPED', obliqType: 'data_store_read' },
  DataStoreWrite: { status: 'MAPPED', obliqType: 'data_store_write' },
  If: { status: 'MAPPED', obliqType: 'if', notes: 'verify ActionPort wiring' },
  /**
   * Math Function — expand per Operator to evaluate / transpose / mag.
   * Ops in this MDL: square, sqrt, pow, transpose, log, reciprocal, mod.
   */
  Math: {
    status: 'EXPAND',
    notes: 'Operator → evaluate/transpose (see mapper)'
  },
  /** Bias = u + constant → evaluate or sum+source */
  Bias: { status: 'EXPAND', obliqType: 'evaluate', notes: 'in(0)+Bias' },
  /**
   * Switch → condition + if (design/12 evaluate-first; if already exists).
   */
  Switch: {
    status: 'EXPAND',
    obliqType: 'if',
    notes: 'Criteria u2~=0 → if(control=u2, t=u1, f=u3)'
  },
  Goto: {
    status: 'EXPAND',
    notes: 'resolve to wires / sheet_label_source'
  },
  From: {
    status: 'EXPAND',
    notes: 'resolve to wires / sheet_label_sink'
  },
  Reference: {
    status: 'EXPAND',
    notes: 'dispatch on SourceType'
  },
  EnablePort: {
    status: 'IGNORE',
    notes: 'structural; emitter sets showEnableInput on parent'
  },
  TriggerPort: {
    status: 'IGNORE',
    notes: 'structural trigger; parent treated as enable for emit v1'
  },
  ActionPort: {
    status: 'IGNORE',
    notes: 'structural for If/SwitchCase action subsystems'
  },
  SwitchCase: {
    status: 'EXPAND',
    notes: 'emit as subsystem; cases via nested action sheets'
  },
  MultiPortSwitch: {
    status: 'EXPAND',
    notes: 'index select → nested evaluate ternary'
  },
  Rounding: {
    status: 'EXPAND',
    notes: 'floor/ceil/round → evaluate'
  },
  Logic: {
    status: 'EXPAND',
    notes: 'AND/OR/NOT → evaluate'
  },
  RelationalOperator: {
    status: 'EXPAND',
    notes: '→ evaluate boolean'
  },
  Terminator: { status: 'IGNORE' },
  Ground: { status: 'MAPPED', obliqType: 'source', notes: 'constant 0' },
  Scope: { status: 'IGNORE' },
  Display: { status: 'IGNORE' },
  ToWorkspace: { status: 'IGNORE' },
  ToFile: { status: 'IGNORE' },
  Stop: { status: 'IGNORE', notes: 'or evaluate halt' },
  DataTypeConversion: {
    status: 'PASSTHROUGH',
    notes: 'wire through if types match'
  }
}

const SOURCE_TYPE_MAP: Record<string, MapEntry> = {
  'Angle Conversion': {
    status: 'MAPPED',
    obliqType: 'units_conversion'
  },
  SinCos: { status: 'EXPAND', notes: '→ trig sin + cos / mux' },
  'Unary Minus': { status: 'MAPPED', obliqType: 'uminus' },
  /** design/12: Compare → existing condition */
  'Compare To Constant': {
    status: 'MAPPED',
    obliqType: 'condition',
    notes: 'design/12 Phase 2.4'
  },
  'Compare To Zero': {
    status: 'MAPPED',
    obliqType: 'condition',
    notes: 'condition != 0 or == 0'
  },
  CrossProduct: { status: 'MAPPED', obliqType: 'cross' },
  Euler2DCM: {
    status: 'EXPAND',
    obliqType: 'orientation_conversion',
    notes: 'euler_to_dcm'
  },
  Reshape: {
    status: 'EXPAND',
    notes: '9x1 reshape → mux/demux; full reshape NEED if friction'
  },
  Quaternion2DCM: {
    status: 'MAPPED',
    obliqType: 'orientation_conversion',
    notes:
      'quat_to_dcm (=ASB). With mdlWire IC q, body→E uses Transpose(ASB) — DCM_QUAT_EOM_AUDIT'
  },
  DCM2Quaternion: {
    status: 'MAPPED',
    obliqType: 'orientation_conversion',
    notes:
      'dcm_to_quat Shepperd. MDL wires LIO (not LIOᵀ); live plant stays legacy LIOᵀ until elev/β fixed'
  },
  Quaternion2Euler: {
    status: 'MAPPED',
    obliqType: 'orientation_conversion',
    notes: 'quat_to_euler'
  },
  DCM2Euler: {
    status: 'MAPPED',
    obliqType: 'orientation_conversion',
    notes: 'dcm_to_euler'
  },
  'Dot Product': { status: 'MAPPED', obliqType: 'dot' },
  'Velocity Conversion': { status: 'MAPPED', obliqType: 'units_conversion' },
  'Mass Conversion': { status: 'MAPPED', obliqType: 'units_conversion' },
  'Dynamic Pressure': {
    status: 'EXPAND',
    notes: '0.5*rho*V*V (in0=rho, in1=V)'
  },
  'Atmosphere Model (COESA)': { status: 'MAPPED', obliqType: 'atmosphere' },
  'Atmosphere Model': {
    status: 'MAPPED',
    obliqType: 'atmosphere',
    notes: 'COESA SourceType short name'
  },
  'Mass & Inertia (custom)': {
    status: 'EXPAND',
    notes:
      'PT out1←F out2←m out4←I_dot; out3→inertia_diag_pack[6] principal (no v*m_dot)'
  },
  '6DoF EoM (Body Axis)': {
    status: 'EXPAND',
    notes: 'MaskType → EOM_MDL_ADAPTER in emitter'
  },
  'Create 3x3 Matrix': {
    status: 'EXPAND',
    notes: '9 scalars → mux double[3][3]'
  },
  Polyval: {
    status: 'EXPAND',
    notes: 'coefs → Horner evaluate'
  },
  'Data Type Duplicate': { status: 'PASSTHROUGH' },
  'Saturation Dynamic': {
    status: 'EXPAND',
    notes: 'ports u,up,lo → evaluate clamp'
  },
  'Sample Time Math': {
    status: 'EXPAND',
    notes: 'Ts Only → constant dt'
  }
}

function lookup(
  kind: 'BlockType' | 'SourceType',
  key: string
): MapEntry {
  const table = kind === 'BlockType' ? BLOCK_TYPE_MAP : SOURCE_TYPE_MAP
  return table[key] ?? { status: 'UNMAPPED' }
}

export function buildCoverageReport(model: MdlModel): CoverageRow[] {
  const btCounts = new Map<string, number>()
  const stCounts = new Map<string, number>()

  walkBlocks(model.root, b => {
    btCounts.set(b.blockType, (btCounts.get(b.blockType) ?? 0) + 1)
    if (b.blockType === 'Reference' && b.sourceType) {
      stCounts.set(b.sourceType, (stCounts.get(b.sourceType) ?? 0) + 1)
    }
  })

  const rows: CoverageRow[] = []
  for (const [key, count] of [...btCounts.entries()].sort(
    (a, b) => b[1] - a[1]
  )) {
    const e = lookup('BlockType', key)
    rows.push({
      kind: 'BlockType',
      key,
      count,
      status: e.status,
      obliqType: e.obliqType,
      notes: e.notes
    })
  }
  for (const [key, count] of [...stCounts.entries()].sort(
    (a, b) => b[1] - a[1]
  )) {
    const e = lookup('SourceType', key)
    rows.push({
      kind: 'SourceType',
      key,
      count,
      status: e.status,
      obliqType: e.obliqType,
      notes: e.notes
    })
  }
  return rows
}

export function coverageSummary(rows: CoverageRow[]): {
  byStatus: Record<MapStatus, number>
  instanceTotal: number
  unmappedKeys: string[]
  needBlockKeys: string[]
} {
  const byStatus: Record<MapStatus, number> = {
    MAPPED: 0,
    EXPAND: 0,
    NEED_BLOCK: 0,
    PASSTHROUGH: 0,
    IGNORE: 0,
    UNMAPPED: 0
  }
  let instanceTotal = 0
  const unmappedKeys: string[] = []
  const needBlockKeys: string[] = []
  for (const r of rows) {
    if (r.kind !== 'BlockType') continue
    byStatus[r.status] += r.count
    instanceTotal += r.count
    if (r.status === 'UNMAPPED') unmappedKeys.push(r.key)
    if (r.status === 'NEED_BLOCK') needBlockKeys.push(r.key)
  }
  return { byStatus, instanceTotal, unmappedKeys, needBlockKeys }
}

export { BLOCK_TYPE_MAP, SOURCE_TYPE_MAP, lookup }

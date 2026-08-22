/**
 * Phase 1/2 hard gate: compare batch_sim final.json primary fields.
 *
 * Relative tolerance 0.5% when |ref| ≥ ε_abs; otherwise absolute δ_abs.
 * Event booleans must match exactly.
 */

export const PRIMARY_EVENT_FIELDS = [
  'bLiftoff',
  'bStageSep',
  'bIECO',
  'bOECO',
  'bS_IVB_EngineStart'
] as const

export const PRIMARY_TRAJECTORY_FIELDS = [
  's2_h_m',
  's2_Xe_x_m',
  's2_Xe_y_m',
  's2_Xe_z_m',
  's2_Ve_x_mps',
  's2_Ve_y_mps',
  's2_Ve_z_mps'
] as const

export const PRIMARY_ATTITUDE_FIELDS = [
  'veh_q_ECI_q0',
  'veh_q_ECI_q1',
  'veh_q_ECI_q2',
  'veh_q_ECI_q3',
  'BodyToSM_Phi_deg',
  'BodyToSM_Theta_deg',
  'BodyToSM_Psi_deg'
] as const

export const PRIMARY_FIELDS = [
  ...PRIMARY_TRAJECTORY_FIELDS,
  ...PRIMARY_ATTITUDE_FIELDS,
  ...PRIMARY_EVENT_FIELDS
] as const

export type PrimaryField = (typeof PRIMARY_FIELDS)[number]

export interface FinalJsonCompareOptions {
  /** Relative tolerance (default 0.005 = 0.5%) */
  relTol?: number
  /** |ref| below this → use absTol (default 1e-6) */
  epsAbs?: number
  /** Absolute tolerance when |ref| < epsAbs (default 1e-3) */
  absTol?: number
  /** Override field list (default PRIMARY_FIELDS) */
  fields?: readonly string[]
  referenceName?: string
  modelName?: string
}

export interface FieldDiff {
  field: string
  ref: number | boolean | null
  model: number | boolean | null
  kind: 'ok' | 'fail' | 'missing'
  relErr?: number
  absErr?: number
  note?: string
}

export interface FinalJsonCompareResult {
  diffs: FieldDiff[]
  passed: boolean
  failCount: number
  missingCount: number
}

function isEventField(f: string): boolean {
  return (PRIMARY_EVENT_FIELDS as readonly string[]).includes(f)
}

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
    return Number(v)
  }
  return null
}

export function compareFinalJson(
  ref: Record<string, unknown>,
  model: Record<string, unknown>,
  options: FinalJsonCompareOptions = {}
): FinalJsonCompareResult {
  const relTol = options.relTol ?? 0.005
  const epsAbs = options.epsAbs ?? 1e-6
  const absTol = options.absTol ?? 1e-3
  const fields = options.fields ?? PRIMARY_FIELDS

  const diffs: FieldDiff[] = []

  for (const field of fields) {
    const rRaw = ref[field]
    const mRaw = model[field]

    if (rRaw === undefined || mRaw === undefined) {
      diffs.push({
        field,
        ref: rRaw === undefined ? null : (asFiniteNumber(rRaw) as number),
        model: mRaw === undefined ? null : (asFiniteNumber(mRaw) as number),
        kind: 'missing',
        note: rRaw === undefined ? 'missing in ref' : 'missing in model'
      })
      continue
    }

    if (isEventField(field)) {
      const rb = Boolean(rRaw)
      const mb = Boolean(mRaw)
      diffs.push({
        field,
        ref: rb,
        model: mb,
        kind: rb === mb ? 'ok' : 'fail',
        note: rb === mb ? undefined : 'event flag mismatch'
      })
      continue
    }

    const r = asFiniteNumber(rRaw)
    const m = asFiniteNumber(mRaw)
    if (r === null || m === null) {
      diffs.push({
        field,
        ref: r,
        model: m,
        kind: 'fail',
        note: 'non-numeric'
      })
      continue
    }

    const absErr = Math.abs(m - r)
    if (Math.abs(r) < epsAbs) {
      const ok = absErr <= absTol
      diffs.push({
        field,
        ref: r,
        model: m,
        kind: ok ? 'ok' : 'fail',
        absErr,
        note: `abs gate (|ref|<${epsAbs})`
      })
    } else {
      const relErr = absErr / Math.abs(r)
      const ok = relErr <= relTol
      diffs.push({
        field,
        ref: r,
        model: m,
        kind: ok ? 'ok' : 'fail',
        relErr,
        absErr
      })
    }
  }

  const failCount = diffs.filter(d => d.kind === 'fail').length
  const missingCount = diffs.filter(d => d.kind === 'missing').length
  return {
    diffs,
    passed: failCount === 0 && missingCount === 0,
    failCount,
    missingCount
  }
}

export function formatFinalJsonReport(
  result: FinalJsonCompareResult,
  options: FinalJsonCompareOptions = {}
): string {
  const relTolPct = ((options.relTol ?? 0.005) * 100).toFixed(2)
  const lines: string[] = []
  lines.push('# final.json comparison (Phase 1/2 hard gate)')
  lines.push('')
  lines.push(`- Reference: **${options.referenceName ?? 'ref'}**`)
  lines.push(`- Model: **${options.modelName ?? 'model'}**`)
  lines.push(`- Relative tol: **${relTolPct}%** (with abs floors for near-zero)`)
  lines.push(
    `- Result: **${result.passed ? 'PASS' : 'FAIL'}** (fail=${result.failCount}, missing=${result.missingCount})`
  )
  lines.push('')
  lines.push('| Field | Ref | Model | |Δ|/|ref| | |Δ| | Status |')
  lines.push('|-------|-----|-------|-----------|-----|--------|')
  for (const d of result.diffs) {
    const refS =
      typeof d.ref === 'boolean' ? String(d.ref) : d.ref === null ? '—' : fmt(d.ref)
    const modS =
      typeof d.model === 'boolean'
        ? String(d.model)
        : d.model === null
          ? '—'
          : fmt(d.model)
    const rel =
      d.relErr === undefined ? '—' : d.relErr.toExponential(3)
    const abs = d.absErr === undefined ? '—' : d.absErr.toExponential(3)
    const st =
      d.kind === 'ok' ? 'ok' : d.kind === 'missing' ? 'missing' : 'FAIL'
    lines.push(`| ${d.field} | ${refS} | ${modS} | ${rel} | ${abs} | ${st} |`)
  }
  lines.push('')
  return lines.join('\n')
}

function fmt(x: number): string {
  if (!Number.isFinite(x)) return String(x)
  const ax = Math.abs(x)
  if (ax !== 0 && (ax >= 1e5 || ax < 1e-3)) return x.toExponential(4)
  return x.toPrecision(7)
}

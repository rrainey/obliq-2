/**
 * AS-205 / TN-AP-67-158 trajectory comparison helpers.
 *
 * Primary baseline: Chrysler TN-AP-67-158 (see AS205_REFERENCE.md).
 * Simulink outputs are secondary and may disagree with the TN.
 */

export interface TrajectorySample {
  /** Time from liftoff (s) */
  t_s: number
  /** Altitude MSL or geometric (m) — document which in CSV notes */
  h_m?: number
  /** Speed (m/s) — inertial or relative; document in notes */
  v_mps?: number
  /** Flight path angle (rad), optional */
  gamma_rad?: number
  /** Vehicle mass (kg), optional */
  mass_kg?: number
  /** Dynamic pressure (Pa), optional */
  qbar_Pa?: number
  source_note?: string
}

export interface TrajectorySeries {
  name: string
  samples: TrajectorySample[]
  /** Free-form notes (units, TN page, frame) */
  notes?: string
}

export type ComparableField = 'h_m' | 'v_mps' | 'gamma_rad' | 'mass_kg' | 'qbar_Pa'

export interface FieldResidual {
  field: ComparableField
  n: number
  maxAbs: number
  rms: number
  /** t_s at which maxAbs occurred */
  tAtMaxAbs?: number
}

export interface CompareOptions {
  fields?: ComparableField[]
  /** Only compare samples with t_s in [tMin, tMax] */
  tMin?: number
  tMax?: number
  /**
   * Max |t_ref - t_model| (s) when pairing samples by nearest time.
   * Default 0.5 s.
   */
  timeMatchTol_s?: number
}

export interface CompareResult {
  referenceName: string
  modelName: string
  paired: number
  residuals: FieldResidual[]
  warnings: string[]
}

const DEFAULT_FIELDS: ComparableField[] = ['h_m', 'v_mps', 'mass_kg', 'qbar_Pa', 'gamma_rad']

/**
 * Parse a CSV with header row. Supports comments (#) and optional BOM.
 */
export function loadTrajectoryCsv(
  text: string,
  name = 'trajectory'
): TrajectorySeries {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'))

  if (lines.length < 2) {
    return { name, samples: [], notes: 'empty or header-only CSV' }
  }

  const header = splitCsvLine(lines[0]).map(h => h.trim())
  const idx = (col: string) => header.indexOf(col)

  const iT = idx('t_s')
  if (iT < 0) {
    throw new Error('Trajectory CSV must include t_s column')
  }

  const samples: TrajectorySample[] = []
  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r])
    const t = Number(cols[iT])
    if (!Number.isFinite(t)) continue

    const sample: TrajectorySample = { t_s: t }
    const setNum = (key: ComparableField | 'source_note', col: string) => {
      const j = idx(col)
      if (j < 0 || j >= cols.length || cols[j] === '') return
      if (key === 'source_note') {
        sample.source_note = cols[j]
        return
      }
      const v = Number(cols[j])
      if (Number.isFinite(v)) (sample as any)[key] = v
    }
    setNum('h_m', 'h_m')
    setNum('v_mps', 'v_mps')
    setNum('gamma_rad', 'gamma_rad')
    setNum('mass_kg', 'mass_kg')
    setNum('qbar_Pa', 'qbar_Pa')
    setNum('source_note', 'source_note')
    samples.push(sample)
  }

  samples.sort((a, b) => a.t_s - b.t_s)
  return { name, samples }
}

/**
 * Linear interpolate model series onto reference times for residual stats.
 * Uses nearest-neighbor pairing within timeMatchTol_s (simpler than full lerp for sparse logs).
 */
export function compareTrajectories(
  reference: TrajectorySeries,
  model: TrajectorySeries,
  options: CompareOptions = {}
): CompareResult {
  const fields = options.fields ?? DEFAULT_FIELDS
  const tMin = options.tMin ?? -Infinity
  const tMax = options.tMax ?? Infinity
  const tol = options.timeMatchTol_s ?? 0.5
  const warnings: string[] = []

  const refSamples = reference.samples.filter(s => s.t_s >= tMin && s.t_s <= tMax)
  if (refSamples.length === 0) {
    warnings.push('No reference samples in time window')
  }
  if (model.samples.length === 0) {
    warnings.push('Model series is empty')
  }

  const residuals: FieldResidual[] = []

  for (const field of fields) {
    const diffs: { t: number; d: number }[] = []
    for (const r of refSamples) {
      const rv = r[field]
      if (rv === undefined) continue
      const m = nearestSample(model.samples, r.t_s, tol)
      if (!m) continue
      const mv = m[field]
      if (mv === undefined) continue
      diffs.push({ t: r.t_s, d: mv - rv })
    }

    if (diffs.length === 0) {
      warnings.push(`No paired samples for field ${field}`)
      residuals.push({ field, n: 0, maxAbs: NaN, rms: NaN })
      continue
    }

    let maxAbs = 0
    let tAtMaxAbs = diffs[0].t
    let sumSq = 0
    for (const { t, d } of diffs) {
      const a = Math.abs(d)
      if (a > maxAbs) {
        maxAbs = a
        tAtMaxAbs = t
      }
      sumSq += d * d
    }
    residuals.push({
      field,
      n: diffs.length,
      maxAbs,
      rms: Math.sqrt(sumSq / diffs.length),
      tAtMaxAbs
    })
  }

  const paired = Math.max(0, ...residuals.map(r => r.n))

  return {
    referenceName: reference.name,
    modelName: model.name,
    paired,
    residuals,
    warnings
  }
}

/**
 * Format a short human-readable report (Markdown table).
 */
export function formatCompareReport(result: CompareResult): string {
  const lines: string[] = [
    `# Trajectory comparison`,
    ``,
    `- Reference: **${result.referenceName}**`,
    `- Model: **${result.modelName}**`,
    `- Max paired points (any field): **${result.paired}**`,
    ``
  ]
  if (result.warnings.length) {
    lines.push(`## Warnings`, ...result.warnings.map(w => `- ${w}`), ``)
  }
  lines.push(
    `## Residuals (model − reference)`,
    ``,
    `| Field | N | max\\|Δ\\| | RMS | t @ max\\|Δ\\| (s) |`,
    `|-------|---|--------|-----|----------------|`
  )
  for (const r of result.residuals) {
    if (r.n === 0) {
      lines.push(`| ${r.field} | 0 | — | — | — |`)
    } else {
      lines.push(
        `| ${r.field} | ${r.n} | ${fmt(r.maxAbs)} | ${fmt(r.rms)} | ${r.tAtMaxAbs?.toFixed(2) ?? '—'} |`
      )
    }
  }
  lines.push(
    ``,
    `> Baseline policy: TN-AP-67-158 is authoritative; Simulink may disagree. See AS205_REFERENCE.md.`
  )
  return lines.join('\n')
}

function fmt(x: number): string {
  if (!Number.isFinite(x)) return '—'
  if (Math.abs(x) >= 1e4 || (Math.abs(x) > 0 && Math.abs(x) < 1e-2)) {
    return x.toExponential(3)
  }
  return x.toFixed(3)
}

function nearestSample(
  samples: TrajectorySample[],
  t: number,
  tol: number
): TrajectorySample | null {
  if (samples.length === 0) return null
  // samples assumed sorted by t_s
  let lo = 0
  let hi = samples.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (samples[mid].t_s < t) lo = mid + 1
    else hi = mid
  }
  let best = samples[lo]
  let bestDt = Math.abs(best.t_s - t)
  if (lo > 0) {
    const dt = Math.abs(samples[lo - 1].t_s - t)
    if (dt < bestDt) {
      best = samples[lo - 1]
      bestDt = dt
    }
  }
  if (lo + 1 < samples.length) {
    const dt = Math.abs(samples[lo + 1].t_s - t)
    if (dt < bestDt) {
      best = samples[lo + 1]
      bestDt = dt
    }
  }
  return bestDt <= tol ? best : null
}

/** Minimal CSV split (no quoted commas in v1). */
function splitCsvLine(line: string): string[] {
  return line.split(',').map(s => s.trim())
}

/**
 * Map common obliq logger column names → TrajectorySample fields.
 * Extend as logger naming conventions solidify.
 */
export function mapLoggerRowToSample(
  row: Record<string, number>,
  timeKey = 'time'
): TrajectorySample | null {
  const t = row[timeKey] ?? row['t'] ?? row['t_s']
  if (!Number.isFinite(t)) return null
  const sample: TrajectorySample = { t_s: t }
  const pick = (field: ComparableField, ...keys: string[]) => {
    for (const k of keys) {
      if (row[k] !== undefined && Number.isFinite(row[k])) {
        sample[field] = row[k]
        return
      }
    }
  }
  pick('h_m', 'h_m', 'altitude_m', 'altitude', 'log_altitude', 'disp_altitude')
  pick('v_mps', 'v_mps', 'V_mag', 'disp_V', 'speed')
  pick('mass_kg', 'mass_kg', 'mass', 'disp_mass', 'log_mass')
  pick('qbar_Pa', 'qbar_Pa', 'qbar', 'disp_qbar', 'log_qbar')
  pick('gamma_rad', 'gamma_rad', 'gamma')
  return sample
}

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
  /** Only compare samples with t_s in [tMin, tMax] (reference time base) */
  tMin?: number
  tMax?: number
  /**
   * Max |t_ref - t_model| (s) when pairing samples by nearest time.
   * Default 0.5 s.
   */
  timeMatchTol_s?: number
  /**
   * Subtract this from model sample times before pairing (s).
   * Use when sim time ≠ liftoff time (e.g. 9.x liftoff step at t=1 → offset 1).
   */
  modelTimeOffset_s?: number
}

/** Soft residual notes for reports (not pass/fail gates). */
export interface SoftThreshold {
  field: ComparableField
  /** Soft max |Δ| above which report flags "large residual" */
  maxAbsSoft?: number
  /** Soft RMS above which report flags "large residual" */
  rmsSoft?: number
}

/** Default S-IB qualitative window notes (not acceptance gates). */
export const SIB_SOFT_THRESHOLDS: SoftThreshold[] = [
  { field: 'h_m', maxAbsSoft: 5e4, rmsSoft: 2e4 },
  { field: 'mass_kg', maxAbsSoft: 8e4, rmsSoft: 4e4 },
  { field: 'qbar_Pa', maxAbsSoft: 2e4, rmsSoft: 1e4 },
  // Prefer log_V_S (MES space-fixed |V|) over body speed when mapped
  { field: 'v_mps', maxAbsSoft: 5e2, rmsSoft: 2e2 }
]

/** Standard S-IB residual time windows (liftoff frame). */
export const SIB_RESIDUAL_WINDOWS: Array<{
  name: string
  tMin: number
  tMax: number
}> = [
  { name: 'early boost 0–50 s', tMin: 0, tMax: 50 },
  { name: 'max-q region 50–100 s', tMin: 50, tMax: 100 },
  { name: 'late S-IB 100–150 s', tMin: 100, tMax: 150 },
  { name: 'full S-IB 0–150 s', tMin: 0, tMax: 150 }
]

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
 *
 * Accepts either:
 * - Canonical TN columns: t_s, h_m, v_mps, …
 * - Obliq multi-logger export: time, log_altitude, log_mass, log_qbar, …
 * - Single-logger export is not enough alone (only time,value) — use multi export.
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
  const samples: TrajectorySample[] = []

  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r])
    const row: Record<string, number> = {}
    for (let c = 0; c < header.length; c++) {
      if (c >= cols.length || cols[c] === '') continue
      const v = Number(cols[c])
      if (Number.isFinite(v)) row[header[c]] = v
    }
    const sample = mapLoggerRowToSample(row)
    if (sample) samples.push(sample)
  }

  samples.sort((a, b) => a.t_s - b.t_s)
  return { name, samples }
}

/**
 * Shift all sample times by −offset (model sim time → liftoff-relative).
 * Does not mutate the input series.
 */
export function shiftTrajectoryTime(
  series: TrajectorySeries,
  offset_s: number
): TrajectorySeries {
  if (!offset_s) return series
  return {
    ...series,
    samples: series.samples.map(s => ({ ...s, t_s: s.t_s - offset_s })),
    notes: [series.notes, `time shifted by −${offset_s} s`]
      .filter(Boolean)
      .join('; ')
  }
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

  const modelAligned =
    options.modelTimeOffset_s !== undefined && options.modelTimeOffset_s !== 0
      ? shiftTrajectoryTime(model, options.modelTimeOffset_s)
      : model

  const refSamples = reference.samples.filter(s => s.t_s >= tMin && s.t_s <= tMax)
  if (refSamples.length === 0) {
    warnings.push('No reference samples in time window')
  }
  if (modelAligned.samples.length === 0) {
    warnings.push('Model series is empty')
  }
  if (options.modelTimeOffset_s) {
    warnings.push(
      `Model times shifted by −${options.modelTimeOffset_s} s (sim → liftoff frame)`
    )
  }

  const residuals: FieldResidual[] = []

  for (const field of fields) {
    const diffs: { t: number; d: number }[] = []
    for (const r of refSamples) {
      const rv = r[field]
      if (rv === undefined) continue
      const m = nearestSample(modelAligned.samples, r.t_s, tol)
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
export function formatCompareReport(
  result: CompareResult,
  soft: SoftThreshold[] = SIB_SOFT_THRESHOLDS
): string {
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
    `| Field | N | max\\|Δ\\| | RMS | t @ max\\|Δ\\| (s) | Soft flag |`,
    `|-------|---|--------|-----|----------------|-----------|`
  )
  const softFlags: string[] = []
  for (const r of result.residuals) {
    const th = soft.find(s => s.field === r.field)
    let flag = '—'
    if (r.n > 0 && th) {
      const large =
        (th.maxAbsSoft !== undefined && r.maxAbs > th.maxAbsSoft) ||
        (th.rmsSoft !== undefined && r.rms > th.rmsSoft)
      if (large) {
        flag = 'large'
        softFlags.push(
          `${r.field}: residual above soft note threshold (not a pass/fail gate)`
        )
      } else {
        flag = 'ok'
      }
    }
    if (r.n === 0) {
      lines.push(`| ${r.field} | 0 | — | — | — | — |`)
    } else {
      lines.push(
        `| ${r.field} | ${r.n} | ${fmt(r.maxAbs)} | ${fmt(r.rms)} | ${r.tAtMaxAbs?.toFixed(2) ?? '—'} | ${flag} |`
      )
    }
  }
  if (softFlags.length) {
    lines.push(``, `## Soft notes`, ...softFlags.map(f => `- ${f}`))
  }
  lines.push(
    ``,
    `> Baseline policy: **TN-AP-67-158 is authoritative**; Simulink may disagree.`,
    `> Soft flags are diagnostic only — no numeric pass/fail for 9.x plant yet.`,
    `> Prefer **h_m** and **mass_kg** (frame-light). Defer space-fixed V/γ/XYZ until ECI→S matches Simulink.`,
    `> TN Space frame ≈ EDD S (working assumption). See AS205_REFERENCE.md / SIMULINK_STACK_MAP.md.`
  )
  return lines.join('\n')
}

/**
 * End-to-end: load reference + model CSV text, compare, format report.
 */
export function compareCsvTexts(
  refText: string,
  modelText: string,
  options: CompareOptions & {
    referenceName?: string
    modelName?: string
    soft?: SoftThreshold[]
    /** If true (default), append S-IB phase windows after the primary table. */
    includePhaseWindows?: boolean
  } = {}
): { result: CompareResult; report: string } {
  const ref = loadTrajectoryCsv(refText, options.referenceName ?? 'TN-AP-67-158')
  const model = loadTrajectoryCsv(modelText, options.modelName ?? 'model')
  const result = compareTrajectories(ref, model, options)
  let report = formatCompareReport(result, options.soft)

  if (options.includePhaseWindows !== false) {
    report += formatPhaseWindowReports(ref, model, options)
  }

  return { result, report }
}

/**
 * Append residual tables for standard S-IB phases (diagnostic).
 */
export function formatPhaseWindowReports(
  reference: TrajectorySeries,
  model: TrajectorySeries,
  options: CompareOptions & { soft?: SoftThreshold[] } = {}
): string {
  const fields = options.fields ?? ['h_m', 'mass_kg']
  const lines: string[] = [
    ``,
    `## Phase windows (diagnostic)`,
    ``,
    `Same pairing rules; soft flags omitted. Prefer early-boost health before chasing late Δh.`,
    ``
  ]
  for (const w of SIB_RESIDUAL_WINDOWS) {
    const r = compareTrajectories(reference, model, {
      ...options,
      fields: fields as ComparableField[],
      tMin: w.tMin,
      tMax: w.tMax
    })
    lines.push(`### ${w.name}`, ``)
    lines.push(
      `| Field | N | max\\|Δ\\| | RMS | t @ max\\|Δ\\| (s) |`,
      `|-------|---|--------|-----|----------------|`
    )
    for (const fr of r.residuals) {
      if (fr.n === 0) {
        lines.push(`| ${fr.field} | 0 | — | — | — |`)
      } else {
        lines.push(
          `| ${fr.field} | ${fr.n} | ${fmt(fr.maxAbs)} | ${fmt(fr.rms)} | ${fr.tAtMaxAbs?.toFixed(2) ?? '—'} |`
        )
      }
    }
    lines.push(``)
  }
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
 * Map common obliq logger / TN column names → TrajectorySample fields.
 * Headers are matched case-sensitively as exported by WasmSimulationEngine.
 */
export function mapLoggerRowToSample(
  row: Record<string, number>,
  timeKey = 'time'
): TrajectorySample | null {
  const t =
    row[timeKey] ??
    row['t'] ??
    row['t_s'] ??
    row['elapsed_sim_sec'] /* batch_sim */
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
  pick(
    'h_m',
    'h_m',
    'altitude_m',
    'altitude',
    'log_altitude',
    'disp_altitude',
    's1_h_m' /* batch_sim OUT11 */
  )
  pick(
    'v_mps',
    'v_mps',
    // Prefer space-fixed |V_S| (MES export) over body speed when present
    'log_V_S',
    'V_S_mag',
    'disp_V_S',
    's1_Vb_mps', /* Obliq companion packs |V_S| into OUT11 Vb_mps */
    'V_mag',
    'log_V',
    'disp_V',
    'speed',
    'V'
  )
  // batch_sim: |Ve| from OUT11 Ve_* (Obliq: S-frame v_S components)
  if (sample.v_mps === undefined) {
    const vx = row['s1_Ve_x_mps']
    const vy = row['s1_Ve_y_mps']
    const vz = row['s1_Ve_z_mps']
    if (
      Number.isFinite(vx) &&
      Number.isFinite(vy) &&
      Number.isFinite(vz)
    ) {
      sample.v_mps = Math.hypot(vx, vy, vz)
    }
  }
  pick(
    'mass_kg',
    'mass_kg',
    'mass',
    'log_mass',
    'disp_mass',
    // Obliq SaturnIBPlantObliq packs mass into OUT11[24] (Compare_c3 slot)
    's1_compare_c3'
  )
  pick(
    'qbar_Pa',
    'qbar_Pa',
    'qbar',
    'log_qbar',
    'disp_qbar',
    's1_qbar_Pa'
  )
  pick('gamma_rad', 'gamma_rad', 'gamma')
  return sample
}

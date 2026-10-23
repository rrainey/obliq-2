// lib/plots/signalPlot.ts
//
// Data and layout for Signal Display plots, shared by the on-screen plot
// (uPlot, components/SignalPlot.tsx) and the PDF export's vector plots, so a
// printed plot shows the same ranges and ticks as the screen.

/** One logged sample, as the simulation results give it. */
export interface SignalSample {
  time: number
  value: number | boolean | number[] | boolean[]
}

/** A signal as plot columns: shared times, one value column per line. */
export interface PlotColumns {
  times: Float64Array
  /** One column per line: a scalar has one, a vector one per element */
  series: Float64Array[]
  labels: string[]
  isVector: boolean
}

/** Line colours, in element order (the colours used before uPlot). */
export const PLOT_COLORS = [
  '#ef4444', // red
  '#10b981', // green
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
]

export const plotColor = (i: number) => PLOT_COLORS[i % PLOT_COLORS.length]!

const num = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : NaN

/**
 * Results to plot columns: the last `maxSamples` samples, booleans as 0/1,
 * one column per vector element (labelled "Element i"), or one "Value"
 * column for a scalar.
 */
export function signalToColumns(samples: SignalSample[], maxSamples: number): PlotColumns {
  const window = maxSamples > 0 && samples.length > maxSamples ? samples.slice(-maxSamples) : samples
  const first = window[0]?.value
  const isVector = Array.isArray(first)
  const width = isVector ? (first as unknown[]).length : 1
  const times = new Float64Array(window.length)
  const series = Array.from({ length: width }, () => new Float64Array(window.length))
  window.forEach((s, i) => {
    times[i] = s.time
    if (isVector) {
      const v = Array.isArray(s.value) ? s.value : []
      for (let k = 0; k < width; k++) series[k]![i] = num(v[k])
    } else {
      series[0]![i] = num(s.value)
    }
  })
  const labels = isVector ? Array.from({ length: width }, (_, k) => `Element ${k}`) : ['Value']
  return { times, series, labels, isVector }
}

/**
 * Simulation results (shared time points, one value per point) to plot
 * columns, without building per-sample objects.
 */
export function resultsToColumns(
  timePoints: ArrayLike<number>,
  values: ArrayLike<SignalSample['value']>,
  maxSamples: number
): PlotColumns {
  const n = Math.min(timePoints.length, values.length)
  const start = maxSamples > 0 && n > maxSamples ? n - maxSamples : 0
  const samples: SignalSample[] = []
  for (let i = start; i < n; i++) samples.push({ time: timePoints[i]!, value: values[i]! })
  return signalToColumns(samples, 0)
}

/**
 * The y range to show: the data's range (visible lines only) plus 10%
 * padding, or ±0.1 around a constant. NaNs are ignored; no data gives -1..1.
 */
export function plotYRange(series: Float64Array[], visible?: boolean[]): [number, number] {
  let min = Infinity
  let max = -Infinity
  series.forEach((col, k) => {
    if (visible && visible[k] === false) return
    for (let i = 0; i < col.length; i++) {
      const v = col[i]!
      if (Number.isFinite(v)) {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
  })
  if (!Number.isFinite(min)) return [-1, 1]
  const range = max - min
  const pad = range > 0 ? range * 0.1 : Math.max(Math.abs(min) * 0.1, 0.1)
  return [min - pad, max + pad]
}

/** "Nice" step (1, 2 or 5 × 10^n) giving about `target` intervals over the range. */
export function niceStep(min: number, max: number, target: number): number {
  const span = Math.abs(max - min)
  if (!(span > 0) || !Number.isFinite(span)) return 1
  const raw = span / Math.max(1, target)
  // The tolerance absorbs floating error (log10(0.1) is just above -1)
  const mag = 10 ** Math.floor(Math.log10(raw) + 1e-9)
  const norm = raw / mag
  // As d3: the nice factor nearest on a log scale (thresholds √2, √10, √50),
  // so the tick count lands closest to the target
  const nice = norm >= Math.sqrt(50) ? 10 : norm >= Math.sqrt(10) ? 5 : norm >= Math.SQRT2 ? 2 : 1
  return nice * mag
}

/** Tick values: multiples of a nice step inside [min, max]. */
export function niceTicks(min: number, max: number, target: number): number[] {
  const step = niceStep(min, max, target)
  const start = Math.ceil(min / step - 1e-9) * step
  const ticks: number[] = []
  for (let v = start; v <= max + step * 1e-9; v += step) {
    // Snap away floating noise (0.30000000000000004) and negative zero
    const snapped = Number((Math.round(v / step) * step).toPrecision(12))
    ticks.push(snapped === 0 ? 0 : snapped)
    if (ticks.length > 1000) break
  }
  return ticks
}

/** Decimals needed to tell ticks `step` apart (0 for whole steps, 2 for 0.05). */
export function tickDecimals(step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) return 0
  return Math.max(0, Math.min(10, -Math.floor(Math.log10(step) + 1e-9)))
}

/** A tick label: fixed decimals for the step, or exponent form for very large or small values. */
export function formatTick(value: number, step: number): string {
  const abs = Math.abs(value)
  if (value !== 0 && (abs >= 1e6 || abs < 1e-4)) return value.toExponential(2)
  return value.toFixed(tickDecimals(step))
}

/** A value under the cursor: 4 decimals, or exponent form when that would hide it. */
export function formatValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (value !== 0 && (abs >= 1e6 || abs < 1e-3)) return value.toExponential(3)
  return value.toFixed(4)
}

/**
 * Min/max decimation for drawing: split the time span into `buckets` equal
 * steps and keep, per step, the first, minimum, maximum and last samples, in
 * time order. Peaks survive at any size, and a line drawn through the result
 * looks the same as the full series at that width. Series shorter than
 * 4 × buckets are returned as they are.
 */
export function decimateMinMax(times: ArrayLike<number>, ys: ArrayLike<number>, buckets: number): { t: number[]; y: number[] } {
  const n = Math.min(times.length, ys.length)
  if (n <= buckets * 4 || buckets < 1) {
    return { t: Array.from({ length: n }, (_, i) => times[i]!), y: Array.from({ length: n }, (_, i) => ys[i]!) }
  }
  const t0 = times[0]!
  const span = times[n - 1]! - t0 || 1
  const t: number[] = []
  const y: number[] = []
  let i = 0
  for (let b = 0; b < buckets && i < n; b++) {
    const end = b === buckets - 1 ? Infinity : t0 + (span * (b + 1)) / buckets
    const startIdx = i
    let minIdx = -1
    let maxIdx = -1
    for (; i < n && times[i]! < end; i++) {
      const v = ys[i]!
      if (!Number.isFinite(v)) continue
      if (minIdx < 0 || v < ys[minIdx]!) minIdx = i
      if (maxIdx < 0 || v > ys[maxIdx]!) maxIdx = i
    }
    const lastIdx = i - 1
    if (lastIdx < startIdx) continue
    const keep = [...new Set([startIdx, minIdx, maxIdx, lastIdx].filter(k => k >= 0))].sort((a, b) => a - b)
    for (const k of keep) {
      t.push(times[k]!)
      y.push(ys[k]!)
    }
  }
  return { t, y }
}

/** Plot colours for the editor's light and dark themes. */
export interface PlotTheme {
  background: string
  text: string
  textMuted: string
  grid: string
  axis: string
}

export const LIGHT_PLOT_THEME: PlotTheme = {
  background: '#ffffff',
  text: '#374151',
  textMuted: '#6b7280',
  grid: '#e5e7eb',
  axis: '#6b7280',
}

export const DARK_PLOT_THEME: PlotTheme = {
  background: '#25262B',
  text: '#C1C2C5',
  textMuted: '#909296',
  grid: '#373A40',
  axis: '#909296',
}

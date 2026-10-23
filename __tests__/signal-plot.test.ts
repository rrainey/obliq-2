/**
 * Signal Display plot data and layout (shared by the screen and PDF plots).
 */
import {
  decimateMinMax,
  formatTick,
  formatValue,
  niceStep,
  niceTicks,
  plotColor,
  plotYRange,
  signalToColumns,
  tickDecimals,
} from '@/lib/plots/signalPlot'

describe('signalToColumns', () => {
  test('a scalar: one "Value" column, booleans as 0/1', () => {
    const c = signalToColumns([{ time: 0, value: 1.5 }, { time: 0.1, value: true }, { time: 0.2, value: false }], 1000)
    expect(c.isVector).toBe(false)
    expect(c.labels).toEqual(['Value'])
    expect([...c.times]).toEqual([0, 0.1, 0.2])
    expect([...c.series[0]!]).toEqual([1.5, 1, 0])
  })

  test('a vector: one column per element, labelled Element i', () => {
    const c = signalToColumns([{ time: 0, value: [1, 2, 3] }, { time: 1, value: [4, 5, 6] }], 1000)
    expect(c.isVector).toBe(true)
    expect(c.labels).toEqual(['Element 0', 'Element 1', 'Element 2'])
    expect(c.series.map(s => [...s])).toEqual([[1, 4], [2, 5], [3, 6]])
  })

  test('keeps only the last maxSamples samples', () => {
    const samples = Array.from({ length: 10 }, (_, i) => ({ time: i, value: i }))
    const c = signalToColumns(samples, 3)
    expect([...c.times]).toEqual([7, 8, 9])
  })

  test('no samples', () => {
    const c = signalToColumns([], 100)
    expect(c.times.length).toBe(0)
    expect(c.series).toHaveLength(1)
  })
})

describe('plotYRange', () => {
  test('data range plus 10% padding, ignoring NaN and hidden lines', () => {
    const a = Float64Array.from([0, 10, NaN])
    const b = Float64Array.from([-100, 100, 0])
    expect(plotYRange([a])).toEqual([-1, 11])
    expect(plotYRange([a, b], [true, false])).toEqual([-1, 11])
    expect(plotYRange([a, b])).toEqual([-120, 120])
  })

  test('a constant gets ±10% (at least ±0.1); no data gives -1..1', () => {
    expect(plotYRange([Float64Array.from([5, 5])])).toEqual([4.5, 5.5])
    expect(plotYRange([Float64Array.from([0, 0])])).toEqual([-0.1, 0.1])
    expect(plotYRange([new Float64Array(0)])).toEqual([-1, 1])
  })
})

describe('ticks and labels', () => {
  test('nice steps are 1, 2 or 5 times a power of ten', () => {
    expect(niceStep(0, 10, 5)).toBe(2)
    expect(niceStep(0, 1, 5)).toBe(0.2)
    expect(niceStep(0, 0.003, 4)).toBeCloseTo(0.001, 12)
    expect(niceStep(0, 7, 5)).toBe(1)
    expect(niceStep(0, 1.1, 5)).toBe(0.2)
  })

  test('ticks are clean multiples inside the range', () => {
    expect(niceTicks(-0.05, 1.05, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
    expect(niceTicks(0.1, 0.4, 3)).toEqual([0.1, 0.2, 0.3, 0.4])
  })

  test('labels carry the decimals the step needs (not a fixed 1)', () => {
    expect(tickDecimals(1)).toBe(0)
    expect(tickDecimals(0.2)).toBe(1)
    expect(tickDecimals(0.05)).toBe(2)
    expect(formatTick(0.003, 0.001)).toBe('0.003')
    expect(formatTick(2, 0.5)).toBe('2.0')
    expect(formatTick(1.5e-6, 1e-6)).toBe('1.50e-6')
    expect(formatTick(0, 1e-6)).toBe('0.000000')
  })

  test('cursor values: 4 decimals, exponent form for tiny or huge values', () => {
    expect(formatValue(1.23456)).toBe('1.2346')
    expect(formatValue(0)).toBe('0.0000')
    expect(formatValue(0.00012)).toBe('1.200e-4')
    expect(formatValue(null)).toBe('—')
  })

  test('colours cycle through the palette', () => {
    expect(plotColor(0)).toBe('#ef4444')
    expect(plotColor(8)).toBe(plotColor(0))
  })
})

describe('decimateMinMax', () => {
  const n = 10000
  const times = Float64Array.from({ length: n }, (_, i) => i * 0.001)
  const ys = Float64Array.from({ length: n }, (_, i) => Math.sin(i / 200) + (i === 4321 ? 5 : 0))

  test('reduces a long series to a few points per bucket, keeping peaks and ends', () => {
    const d = decimateMinMax(times, ys, 200)
    expect(d.t.length).toBeLessThanOrEqual(800)
    expect(d.t.length).toBeGreaterThan(200)
    expect(Math.max(...d.y)).toBe(Math.max(...ys)) // the spike survives
    expect(Math.min(...d.y)).toBe(Math.min(...ys))
    expect(d.t[0]).toBe(times[0])
    expect(d.t[d.t.length - 1]).toBe(times[n - 1])
    // Still in time order
    for (let i = 1; i < d.t.length; i++) expect(d.t[i]!).toBeGreaterThanOrEqual(d.t[i - 1]!)
  })

  test('short series pass through unchanged', () => {
    const d = decimateMinMax([0, 1, 2], [3, 4, 5], 200)
    expect(d).toEqual({ t: [0, 1, 2], y: [3, 4, 5] })
  })
})

/**
 * Notch Filter and Spectrum Peaks blocks: native C runs against independent
 * answers: the analytic notch response, and known sine frequencies.
 */

import { NotchFilterBlockModule } from '@/lib/blocks/NotchFilterBlockModule'
import { SpectrumPeaksBlockModule } from '@/lib/blocks/SpectrumPeaksBlockModule'
import { Sheet } from '@/lib/simulationTypes'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { cleanupNativeDir, compileAndRunNative } from '../support/nativeCgen'

jest.setTimeout(120000)

const DT = 0.0005
const b = (id: string, type: string, name: string, parameters: Record<string, unknown> = {}): BlockData => ({
  id, type, name, position: { x: 0, y: 0 }, parameters,
})
const w = (id: string, s: string, t: string, port = 0): WireData => ({
  id, sourceBlockId: s, sourcePortIndex: 0, targetBlockId: t, targetPortIndex: port,
})
const sheet = (blocks: BlockData[], connections: WireData[]): Sheet[] => [
  { id: 'main', name: 'Main', blocks, connections, extents: { width: 2000, height: 2000 } } as unknown as Sheet,
]

/** Runs a model and returns its logged outputs, one row per step. */
function run(name: string, blocks: BlockData[], wires: WireData[], outputs: string[], steps: number): number[][] {
  const r = compileAndRunNative({
    modelName: name,
    sheets: sheet(blocks, wires),
    dt: DT,
    smokeMainBody: `
  ${name}_seed_from_inputs(&model);
  for (int i = 0; i < ${steps}; ++i) {
    ${name}_step(&model);
    printf("${outputs.map(() => '%.10g').join(' ')}\\n", ${outputs.map(o => `model.outputs.${o}`).join(', ')});
  }
  return 0;
`,
  })
  cleanupNativeDir(r.outDir)
  return r.stdout.trim().split('\n').map(l => l.split(' ').map(Number))
}

const rms = (xs: number[]) => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length)
const sine = (id: string, hz: number) => b(id, 'evaluate', id, { numInputs: 1, expression: `sin(${2 * Math.PI * hz} * in(0))` })

/** Gain of a notch at a frequency: |H| of the bilinear notch, with its frequency axis warped. */
const notchGain = (hz: number, centreHz: number, q: number) => {
  const warp = (f: number) => Math.tan(Math.PI * f * DT)
  const g = warp(centreHz), x = warp(hz)
  const re = g * g - x * x
  return Math.abs(re) / Math.hypot(re, (g / q) * x)
}

function notchResponse(name: string, hz: number, centreHz: number, weight: number, q = 5): number {
  const rows = run(
    name,
    [
      b('t', 'clock', 'T'),
      sine('s', hz),
      b('f', 'source', 'F', { signalType: 'constant', value: centreHz, dataType: 'double' }),
      b('k', 'source', 'K', { signalType: 'constant', value: weight, dataType: 'double' }),
      b('n', 'notch_filter', 'N', { q }),
      b('o', 'output_port', 'O', { portName: 'y' }),
    ],
    [w('a', 't', 's'), w('c', 's', 'n', 0), w('d', 'f', 'n', 1), w('e', 'k', 'n', 2), w('g', 'n', 'o')],
    ['y'],
    8000
  )
  return rms(rows.slice(4000).map(r => r[0]!)) * Math.SQRT2
}

describe('Notch Filter', () => {
  it('registers with three inputs and the type of its signal', () => {
    const m = new NotchFilterBlockModule()
    const block = b('n', 'notch_filter', 'N')
    expect(m.getInputPortCount(block)).toBe(3)
    expect(m.getOutputType(block, ['double[3]'])).toBe('double[3]')
  })

  it('removes its centre frequency', () => {
    expect(notchResponse('nf_centre', 175, 175, 1)).toBeLessThan(0.002)
  })

  it.each([[100], [150], [250], [500]])('matches the analytic response at %d Hz', hz => {
    expect(notchResponse(`nf_gain_${hz}`, hz, 175, 1)).toBeCloseTo(notchGain(hz, 175, 5), 2)
  })

  it('weight 0.5 removes half of the centre frequency, and weight 0 passes it', () => {
    expect(notchResponse('nf_half', 175, 175, 0.5)).toBeCloseTo(0.5, 2)
    expect(notchResponse('nf_off', 175, 175, 0)).toBeCloseTo(1, 2)
  })

  it('filters a vector element-wise', () => {
    const rows = run(
      'nf_vector',
      [
        b('t', 'clock', 'T'),
        sine('a', 175),
        sine('c', 60),
        b('m', 'mux', 'M', { rows: 2, cols: 1, baseType: 'double', outputType: 'double[2]' }),
        b('f', 'source', 'F', { signalType: 'constant', value: 175, dataType: 'double' }),
        b('k', 'source', 'K', { signalType: 'constant', value: 1, dataType: 'double' }),
        b('n', 'notch_filter', 'N', { q: 5 }),
        b('o', 'output_port', 'O', { portName: 'y' }),
      ],
      [w('w1', 't', 'a'), w('w2', 't', 'c'), w('w3', 'a', 'm', 0), w('w4', 'c', 'm', 1), w('w5', 'm', 'n', 0), w('w6', 'f', 'n', 1), w('w7', 'k', 'n', 2), w('w8', 'n', 'o')],
      ['y[0]', 'y[1]'],
      8000
    )
    const tail = rows.slice(4000)
    expect(rms(tail.map(r => r[0]!))).toBeLessThan(0.002)
    expect(rms(tail.map(r => r[1]!)) * Math.SQRT2).toBeCloseTo(notchGain(60, 175, 5), 2)
  })
})

describe('Spectrum Peaks', () => {
  /** Tracks the sum of sines plus a little white noise (the noise gives the block a floor to compare with). */
  function peaks(name: string, hzList: number[], count = 3, seconds = 2): number[] {
    const sines = hzList.map((hz, i) => sine(`s${i}`, hz))
    const rows = run(
      name,
      [
        b('t', 'clock', 'T'),
        ...sines,
        b('r', 'random_noise', 'R', { distribution: 'gaussian', mean: 0, stdDev: 0.01, seed: 7, dataType: 'double' }),
        b('u', 'sum', 'U', { signs: '+'.repeat(hzList.length + 1), numInputs: hzList.length + 1 }),
        b('p', 'spectrum_peaks', 'P', { count }),
        b('o', 'output_port', 'O', { portName: 'y' }),
      ],
      [
        ...sines.map((s, i) => w(`t${i}`, 't', s.id)),
        ...sines.map((s, i) => w(`u${i}`, s.id, 'u', i)),
        w('ur', 'r', 'u', hzList.length),
        w('up', 'u', 'p'),
        w('po', 'p', 'o'),
      ],
      Array.from({ length: count }, (_, i) => `y[${i}]`),
      Math.round(seconds / DT)
    )
    return rows[rows.length - 1]!
  }

  it('outputs double[count], and starts evenly spaced', () => {
    const m = new SpectrumPeaksBlockModule()
    expect(m.getOutputType(b('p', 'spectrum_peaks', 'P', { count: 2 }), [])).toBe('double[2]')
    const init = m.generateInitialization(b('p', 'spectrum_peaks', 'P', { count: 3, minHz: 100, maxHz: 500 }))
    expect(init).toContain('center[0] = 200')
    expect(init).toContain('center[2] = 400')
  })

  it.each([[175], [225], [333], [480]])('finds a sine at %d Hz to within a fifth of a bin', hz => {
    // Bin width at 2 kHz: 2000 / 72 = 27.8 Hz
    const [first] = peaks(`sp_one_${hz}`, [hz], 1)
    expect(Math.abs(first! - hz)).toBeLessThan(0.2 * (2000 / 72))
  })

  it('separates three sines, in frequency order', () => {
    const p = peaks('sp_three', [175, 300, 480])
    expect(Math.abs(p[0]! - 175)).toBeLessThan(6)
    expect(Math.abs(p[1]! - 300)).toBeLessThan(6)
    expect(Math.abs(p[2]! - 480)).toBeLessThan(6)
  })

  it('with white noise only, the outputs stay in the search range', () => {
    const rows = peaks('sp_noise', [])
    for (const hz of rows) {
      expect(hz).toBeGreaterThanOrEqual(100)
      expect(hz).toBeLessThanOrEqual(600)
    }
  })
})

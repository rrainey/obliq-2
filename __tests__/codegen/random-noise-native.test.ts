/**
 * Random Noise block: module unit checks plus native C runs that check the
 * emitted generator against a TypeScript reference (SplitMix64 + Box–Muller),
 * and the statistics, hold timing, vector width and density scaling.
 */

import { RandomNoiseBlockModule } from '@/lib/blocks/RandomNoiseBlockModule'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'
import { Sheet } from '@/lib/simulationTypes'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { parseScalarOrVector } from '@/components/RandomNoiseConfig'
import { cleanupNativeDir, compileAndRunNative } from '../support/nativeCgen'

jest.setTimeout(120000)

const b = (id: string, type: string, name: string, parameters: Record<string, unknown> = {}): BlockData => ({
  id,
  type,
  name,
  position: { x: 0, y: 0 },
  parameters,
})
const w = (id: string, s: string, t: string): WireData => ({
  id,
  sourceBlockId: s,
  sourcePortIndex: 0,
  targetBlockId: t,
  targetPortIndex: 0,
})

/** TypeScript reference for the emitted generator. */
class Reference {
  private s: bigint
  constructor(seed: number) {
    this.s = BigInt(seed)
  }
  private next(): number {
    const M = (1n << 64n) - 1n
    this.s = (this.s + 0x9e3779b97f4a7c15n) & M
    let z = this.s
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & M
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & M
    z ^= z >> 31n
    return Number((z >> 11n) + 1n) / 9007199254740992
  }
  gaussian(): number {
    const u1 = this.next()
    const u2 = this.next()
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  }
}

const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length
const std = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1))
}

describe('RandomNoiseBlockModule', () => {
  const m = new RandomNoiseBlockModule()

  test('is a registered zero-input, non-feedthrough source', () => {
    expect(BlockModuleFactory.isSupported('random_noise')).toBe(true)
    expect(BlockModuleFactory.getSupportedBlockTypes()).toContain('random_noise')
    const blk = b('n', 'random_noise', 'N1')
    expect(m.getInputPortCount(blk)).toBe(0)
    expect(m.getOutputPortCount(blk)).toBe(1)
    expect(m.isDirectFeedthrough(blk)).toBe(false)
  })

  test('output type follows dataType; matrices are not supported', () => {
    expect(m.getOutputType(b('n', 'random_noise', 'N1'), [])).toBe('double')
    expect(m.getOutputType(b('n', 'random_noise', 'N1', { dataType: 'double[3]' }), [])).toBe('double[3]')
    expect(m.getOutputType(b('n', 'random_noise', 'N1', { dataType: 'double[2][2]' }), [])).toBe('double')
  })

  test('sample time: explicit, else inherited scope, else every step', () => {
    expect(RandomNoiseBlockModule.sampleTimeOf(b('n', 'random_noise', 'N', { sampleTime: 0.01 }))).toBe(0.01)
    expect(RandomNoiseBlockModule.sampleTimeOf(b('n', 'random_noise', 'N', { sampleTimeSec: 0.002 }))).toBe(0.002)
    expect(RandomNoiseBlockModule.sampleTimeOf(b('n', 'random_noise', 'N', {}))).toBe(0)
  })

  test('the config dialog parses scalars and vectors', () => {
    expect(parseScalarOrVector('0.5')).toBe(0.5)
    expect(parseScalarOrVector('[1, 2, 3]')).toEqual([1, 2, 3])
    expect(parseScalarOrVector('1 2e-3')).toEqual([1, 0.002])
    expect(parseScalarOrVector('')).toBeNull()
    expect(parseScalarOrVector('[1, x]')).toBeNull()
  })
})

describe('Random Noise native codegen', () => {
  const N = 20000
  const dt = 0.01
  let rows: number[][] = []
  let outDir: string | undefined

  beforeAll(() => {
    const sources = [
      b('g', 'random_noise', 'G', { mean: 2, stdDev: 0.5, seed: 1 }),
      b('g2', 'random_noise', 'G2', { mean: 2, stdDev: 0.5, seed: 1 }),
      b('g3', 'random_noise', 'G3', { mean: 2, stdDev: 0.5, seed: 2 }),
      b('u', 'random_noise', 'U', { distribution: 'uniform', mean: -1, stdDev: 2, seed: 3 }),
      b('h', 'random_noise', 'H', { stdDev: 1, sampleTime: 0.05, seed: 4 }),
      b('d', 'random_noise', 'D', { amplitudeMode: 'density', noiseDensity: 0.01, seed: 5 }),
      b('v', 'random_noise', 'V', { dataType: 'double[3]', mean: [0, 10, 20], stdDev: [1, 2, 3], seed: 6 }),
    ]
    const outs = sources.map(s =>
      b(`o_${s.id}`, 'output_port', `O_${s.name}`, {
        portName: `O_${s.name}`,
        dataType: s.parameters?.dataType ?? 'double',
      })
    )
    // An integrator fed by noise, so the RK4 path is generated and exercised.
    const integ = b('i', 'integrator', 'I', { initialCondition: 0 })
    const intOut = b('o_i', 'output_port', 'O_I', { portName: 'O_I', dataType: 'double' })
    const sheets: Sheet[] = [
      {
        id: 'main',
        name: 'Main',
        blocks: [...sources, ...outs, integ, intOut],
        connections: [
          ...sources.map(s => w(`w_${s.id}`, s.id, `o_${s.id}`)),
          w('w_gi', 'g', 'i'),
          w('w_io', 'i', 'o_i'),
        ],
        extents: { width: 800, height: 600 },
      },
    ]

    const result = compileAndRunNative({
      modelName: 'noise_smoke',
      sheets,
      dt,
      smokeMainBody: `
  /* As the WASM runner and obliq-cgen do: block states are seeded here */
  noise_smoke_seed_from_inputs(&model);
  for (int i = 0; i < ${N}; ++i) {
    noise_smoke_step(&model);
    printf("%.17g %.17g %.17g %.17g %.17g %.17g %.17g %.17g %.17g %.17g\\n",
      model.outputs.O_G, model.outputs.O_G2, model.outputs.O_G3, model.outputs.O_U,
      model.outputs.O_H, model.outputs.O_D,
      model.outputs.O_V[0], model.outputs.O_V[1], model.outputs.O_V[2], model.outputs.O_I);
  }
  return 0;
`,
    })
    outDir = result.outDir
    rows = result.stdout.trim().split('\n').map(l => l.split(' ').map(Number))
  })

  afterAll(() => cleanupNativeDir(outDir))

  const col = (k: number) => rows.map(r => r[k]!)

  test('runs every step with finite values', () => {
    expect(rows).toHaveLength(N)
    expect(rows.every(r => r.length === 10 && r.every(Number.isFinite))).toBe(true)
  })

  test('matches the TypeScript reference generator, one draw per step from tick 0', () => {
    // Row i is the value drawn at sample_tick i. If _init's double evaluation
    // advanced the stream, row 0 would be the reference's second draw.
    const ref = new Reference(1)
    for (let i = 0; i < 1000; i++) {
      expect(col(0)[i]).toBeCloseTo(2 + 0.5 * ref.gaussian(), 12)
    }
  })

  test('the same seed repeats the sequence; a different seed does not', () => {
    expect(col(1)).toEqual(col(0))
    const g = col(0), g3 = col(2)
    const diff = g.filter((x, i) => x !== g3[i]).length
    expect(diff).toBe(N)
    // Seeds 1 and 2 are uncorrelated
    const mg = mean(g), m3 = mean(g3)
    const cov = mean(g.map((x, i) => (x - mg) * (g3[i]! - m3)))
    expect(Math.abs(cov / (std(g) * std(g3)))).toBeLessThan(0.03)
  })

  test('gaussian mean and standard deviation', () => {
    const g = col(0)
    expect(mean(g)).toBeCloseTo(2, 1) // 4σ/√N ≈ 0.014
    expect(Math.abs(std(g) - 0.5)).toBeLessThan(0.02)
    // Roughly 68% within 1σ
    const inside = g.filter(x => Math.abs(x - 2) < 0.5).length / N
    expect(Math.abs(inside - 0.6827)).toBeLessThan(0.02)
  })

  test('uniform values stay on mean ± √3σ with the requested variance', () => {
    const u = col(3)
    const half = 2 * Math.sqrt(3)
    expect(Math.min(...u)).toBeGreaterThanOrEqual(-1 - half)
    expect(Math.max(...u)).toBeLessThanOrEqual(-1 + half)
    expect(Math.min(...u)).toBeLessThan(-1 - 0.95 * half)
    expect(Math.max(...u)).toBeGreaterThan(-1 + 0.95 * half)
    expect(Math.abs(mean(u) + 1)).toBeLessThan(0.06)
    expect(Math.abs(std(u) - 2)).toBeLessThan(0.06)
  })

  test('sampleTime holds each value for round(Ts/dt) steps, changing at period starts', () => {
    const h = col(4)
    for (let i = 1; i < 500; i++) {
      if (i % 5 === 0) expect(h[i]).not.toBe(h[i - 1])
      else expect(h[i]).toBe(h[i - 1])
    }
    // One draw per period: the held values are the reference sequence
    const ref = new Reference(4)
    for (let k = 0; k < 100; k++) expect(h[5 * k]).toBeCloseTo(ref.gaussian(), 12)
  })

  test('noise density scales by 1/√Ts', () => {
    // N = 0.01/√Hz at Ts = dt = 0.01 s → σ = 0.1
    expect(Math.abs(std(col(5)) - 0.1)).toBeLessThan(0.004)
  })

  test('vector output draws independent elements with per-element mean and σ', () => {
    const expected = [
      [0, 1],
      [10, 2],
      [20, 3],
    ]
    expected.forEach(([mu, sigma], k) => {
      const v = col(6 + k)
      expect(Math.abs(mean(v) - mu!)).toBeLessThan(4 * sigma! / Math.sqrt(N))
      expect(Math.abs(std(v) - sigma!) / sigma!).toBeLessThan(0.04)
    })
    // Elements are uncorrelated
    const a = col(6), c = col(7)
    const ma = mean(a), mc = mean(c)
    const r = mean(a.map((x, i) => (x - ma) * (c[i]! - mc))) / (std(a) * std(c))
    expect(Math.abs(r)).toBeLessThan(0.03)
  })

  test('RK4 integrates the held value without advancing the generator', () => {
    // RK4 of a signal held over the step integrates exactly. Outputs are
    // published before integration, so row i shows I(t_i) = Σ_{j<i} G_j·dt.
    const g = col(0), integ = col(9)
    let sum = 0
    for (let i = 0; i < 200; i++) {
      expect(integ[i]).toBeCloseTo(sum, 9)
      sum += g[i]! * dt
    }
  })
})

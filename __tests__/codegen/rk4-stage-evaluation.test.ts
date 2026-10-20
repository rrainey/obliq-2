/**
 * RK4 must re-evaluate the algebra at each stage. A state whose derivative
 * reaches its integrator through other blocks (here an oscillator closed
 * through a Scale block, and an integrator of cos(t) driven by a Clock) is
 * otherwise integrated with k1 for every stage: forward Euler.
 *
 * Halving dt divides the global error by 2^4 = 16 for RK4 (by 2 for Euler).
 */

import { Sheet } from '@/lib/simulationTypes'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { cleanupNativeDir, compileAndRunNative } from '../support/nativeCgen'

jest.setTimeout(120000)

const b = (id: string, type: string, name: string, parameters: Record<string, unknown> = {}): BlockData => ({
  id, type, name, position: { x: 0, y: 0 }, parameters,
})
const w = (id: string, s: string, t: string, tp = 0): WireData => ({
  id, sourceBlockId: s, sourcePortIndex: 0, targetBlockId: t, targetPortIndex: tp,
})

const OMEGA = 2
const T_END = 1

function run(integration: 'rk4' | 'euler') {
  const sheets: Sheet[] = [{
    id: 'main', name: 'Main', extents: { width: 800, height: 600 },
    blocks: [
      // x'' = -omega^2 x, x(0) = 1, v(0) = 0  →  x = cos(omega t)
      b('v', 'integrator', 'Vint', { initialValue: 0 }),
      b('x', 'integrator', 'Xint', { initialValue: 1 }),
      b('k', 'scale', 'Spring', { gain: -OMEGA * OMEGA }),
      // s' = cos(t), s(0) = 0  →  s = sin(t)
      b('clk', 'clock', 'Clk'),
      b('cos', 'trig', 'Cos', { function: 'cos' }),
      b('s', 'integrator', 'Sint', { initialValue: 0 }),
      // A discrete counter: stage evaluations must not advance it
      b('one', 'source', 'One', { signalType: 'constant', value: 1, dataType: 'double' }),
      b('cnt', 'sum', 'Count', { signs: '++', numInputs: 2 }),
      b('ud', 'unit_delay', 'CountDelay', { initialValue: 0 }),
      b('ox', 'output_port', 'X', { portName: 'X', dataType: 'double' }),
      b('oc', 'output_port', 'N', { portName: 'N', dataType: 'double' }),
    ],
    connections: [
      w('w1', 'v', 'x'), w('w2', 'x', 'k'), w('w3', 'k', 'v'),
      w('w4', 'clk', 'cos'), w('w5', 'cos', 's'),
      w('w6', 'one', 'cnt', 0), w('w7', 'ud', 'cnt', 1), w('w8', 'cnt', 'ud'),
      w('w9', 'x', 'ox'), w('w10', 'ud', 'oc'),
    ],
  }]
  const name = `rk4stage_${integration}`
  return compileAndRunNative({
    modelName: name,
    sheets,
    integrationAlgorithm: integration,
    smokeMainBody: `
  const double dts[3] = { 0.1, 0.05, 0.025 };
  for (int d = 0; d < 3; ++d) {
    ${name}_init(&model, dts[d]);
    ${name}_seed_from_inputs(&model);
    const int n = (int)llround(${T_END} / dts[d]);
    for (int i = 0; i < n; ++i) ${name}_step(&model);
    printf("dt=%.17g x=%.17g s=%.17g n=%.17g\\n", dts[d],
      model.states.Xint_states[0], model.states.Sint_states[0], model.states.CountDelay_state);
  }
  return 0;
`,
  })
}

const parse = (stdout: string) =>
  stdout.trim().split('\n').map(l => Object.fromEntries(l.split(' ').map(kv => kv.split('=')).map(([k, v]) => [k, Number(v)])))

describe('RK4 stage evaluation', () => {
  const dirs: string[] = []
  afterAll(() => dirs.forEach(cleanupNativeDir))

  it('is fourth order for states coupled through other blocks and for time-varying inputs', () => {
    const r = run('rk4')
    dirs.push(r.outDir)
    const rows = parse(r.stdout)
    const ex = rows.map(row => Math.abs(row.x! - Math.cos(OMEGA * T_END)))
    const es = rows.map(row => Math.abs(row.s! - Math.sin(T_END)))
    for (let i = 1; i < rows.length; i++) {
      expect(ex[i - 1]! / ex[i]!).toBeGreaterThan(12) // ≈ 16
      expect(es[i - 1]! / es[i]!).toBeGreaterThan(12)
    }
    expect(ex[2]).toBeLessThan(1e-6)
    expect(es[2]).toBeLessThan(1e-8)
  })

  it('stage evaluations leave discrete states alone: the counter advances once per step', () => {
    const rows = parse(run('rk4').stdout)
    // seed_from_inputs' final algebra pass latches 1; each step then adds exactly
    // one. Stage evaluations leaking through would add about four per step.
    expect(rows.map(r => r.n)).toEqual([11, 21, 41])
  })

  it('Euler stays first order (for comparison)', () => {
    const r = run('euler')
    dirs.push(r.outDir)
    const rows = parse(r.stdout)
    const ex = rows.map(row => Math.abs(row.x! - Math.cos(OMEGA * T_END)))
    for (let i = 1; i < rows.length; i++) expect(ex[i - 1]! / ex[i]!).toBeLessThan(3)
  })
})

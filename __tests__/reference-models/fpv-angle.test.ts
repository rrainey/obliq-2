/**
 * FPV quadcopter reference model, Phase 5: angle (self-level) mode on the
 * AUX switch, flown with the modelled sensors and the Mahony estimate.
 */

import { AIRBORNE_DEMO_STICKS, buildFpvModel, FC, FPV, HOVER_THROTTLE, type StickProfile } from '../../scripts/build-fpv-reference-model'
import { cleanupNativeDir, compileAndRunNative } from '../support/nativeCgen'

jest.setTimeout(240000)

const R2D = 180 / Math.PI
const thr = Number(HOVER_THROTTLE.toFixed(4))
const hold = (v: number): Array<[number, number]> => [[0, v]]
const pulse = (t0: number, t1: number, v: number): Array<[number, number]> => [[0, 0], [t0, 0], [t0 + 0.05, v], [t1, v], [t1 + 0.05, 0]]

interface Row { t: number; sp: number[]; w: number[]; e: number[]; est: number[] }

function fly(name: string, opts: { sticks?: StickProfile; initialOmega?: number[]; initialEuler?: number[] }, seconds: number) {
  // Start in the air, clear of the ground
  const model = buildFpvModel({ initialAltitude: 30, ...opts })
  const n = Math.round(seconds / FPV.dt)
  const result = compileAndRunNative({
    modelName: `fpva_${name}`,
    sheets: (model.data as any).sheets,
    dt: FPV.dt,
    smokeMainBody: `
  fpva_${name}_seed_from_inputs(&model);
  for (int i = 0; i < ${n}; ++i) {
    fpva_${name}_step(&model);
    if (i % 10) continue;
    const fpva_${name}_outputs_t *o = &model.outputs;
    printf("%.6f", model.time - model.dt);
    for (int k = 0; k < 3; ++k) printf(" %.9g", o->rate_setpoint[k]);
    for (int k = 0; k < 3; ++k) printf(" %.9g", o->omega[k] * ${R2D});
    for (int k = 0; k < 3; ++k) printf(" %.9g", o->euler[k] * ${R2D});
    for (int k = 0; k < 3; ++k) printf(" %.9g", o->euler_est[k] * ${R2D});
    printf("\\n");
  }
  return 0;
`,
  })
  const rows: Row[] = result.stdout.trim().split('\n').map(line => {
    const v = line.split(' ').map(Number)
    return { t: v[0]!, sp: v.slice(1, 4), w: v.slice(4, 7), e: v.slice(7, 10), est: v.slice(10, 13) }
  })
  return { rows, outDir: result.outDir }
}

const at = (rows: Row[], t: number) => rows.reduce((b, r) => (Math.abs(r.t - t) < Math.abs(b.t - t) ? r : b))
const between = (rows: Row[], t0: number, t1: number) => rows.filter(r => r.t >= t0 && r.t <= t1)

describe('FPV reference model: angle mode', () => {
  const dirs: string[] = []
  const runs: Record<string, Row[]> = {}
  const run = (name: string, opts: Parameters<typeof fly>[1], seconds: number) => {
    const r = fly(name, opts, seconds)
    dirs.push(r.outDir)
    runs[name] = r.rows
  }
  const tilted = [25, -15, 0] // deg, initial attitude

  beforeAll(() => {
    const centred = { roll: hold(0), pitch: hold(0), yaw: hold(0), throttle: hold(thr) }
    run('levelAngle', { initialEuler: tilted, sticks: { ...centred, aux: hold(1) } }, 2)
    run('levelAcro', { initialEuler: tilted, sticks: { ...centred, aux: hold(0) } }, 2)
    run('bank', { sticks: { ...centred, roll: pulse(0.5, 2.0, 0.5), aux: hold(1) } }, 3)
    run('yaw', { sticks: { ...centred, yaw: pulse(0.5, 2.0, 0.5), aux: hold(1) } }, 2.5)
    run('demo', { sticks: AIRBORNE_DEMO_STICKS }, 5)
  })
  afterAll(() => dirs.forEach(cleanupNativeDir))

  it('self-levels from a 25/-15 deg tilt; acro holds the tilt', () => {
    expect(at(runs['levelAngle']!, 0).e[0]).toBeCloseTo(25, 0)
    const angle = at(runs['levelAngle']!, 1.0)
    expect(Math.abs(angle.e[0]!)).toBeLessThan(3)
    expect(Math.abs(angle.e[1]!)).toBeLessThan(3)
    // Acro has no attitude reference: no rate error, so no correction
    const acro = at(runs['levelAcro']!, 1.0)
    expect(acro.e[0]).toBeCloseTo(25, -1)
    expect(acro.e[1]).toBeCloseTo(-15, -1)
  })

  it('half roll stick holds a 30 degree bank (estimated), and the true bank follows', () => {
    const target = 0.5 * FC.angle.limitDeg
    for (const r of between(runs['bank']!, 1.2, 2.0)) {
      expect(Math.abs(r.est[0]! - target)).toBeLessThan(3)
      // The accelerometer sees thrust, so the estimate lags toward level and the
      // controller banks a little further to hold it (up to 6.0 deg with the tuned level gain)
      expect(r.e[0]! - target).toBeGreaterThan(-1)
      expect(r.e[0]! - target).toBeLessThan(7)
    }
  })

  it('levels again when the stick is released', () => {
    const r = at(runs['bank']!, 2.8)
    expect(Math.abs(r.est[0]!)).toBeLessThan(2)
    // True attitude is off by the estimator's remaining bank-induced error
    expect(Math.abs(r.e[0]!)).toBeLessThan(8)
  })

  it('yaw stays a rate command in angle mode', () => {
    for (const r of between(runs['yaw']!, 1.2, 2.0)) expect(Math.abs(r.w[2]! - 185)).toBeLessThan(0.05 * 185)
    for (const r of between(runs['yaw']!, 1.2, 2.0)) expect(Math.hypot(r.e[0]!, r.e[1]!)).toBeLessThan(4)
  })

  it('the airborne demo switches from acro to angle mode at 2.4 s', () => {
    const rows = runs['demo']!
    // Acro: roll doublet tracked as rates
    expect(at(rows, 0.9).sp[0]).toBeCloseTo(185, 6)
    // Angle mode: the 30 deg bank command and the 18 deg pitch command
    expect(Math.abs(at(rows, 3.35).est[0]! - 30)).toBeLessThan(3)
    expect(Math.abs(at(rows, 4.45).est[1]! - 18)).toBeLessThan(3)
    expect(Math.abs(at(rows, 4.95).est[1]!)).toBeLessThan(3)
  })
})

/**
 * FPV quadcopter reference model, Phase 3: Betaflight-style acro flight
 * controller (rates, gyro filters, rate PID with feed-forward, quad-X mixer
 * with airmode) flying the plant with ideal sensors.
 *
 * Each scenario builds the model with its own stick profile (or initial body
 * rates), compiles it to native C and logs every plant step.
 */

import {
  buildFpvModel,
  FC,
  FPV,
  HOVER_THROTTLE,
  type StickProfile,
} from '../../scripts/build-fpv-reference-model'
import { cleanupNativeDir, compileAndRunNative } from '../support/nativeCgen'
import { validateMultiSheetTypeCompatibility } from '@/lib/multiSheetTypeValidator'

jest.setTimeout(240000)

const R2D = 180 / Math.PI
const thr = Number(HOVER_THROTTLE.toFixed(4))
const hold = (v: number): Array<[number, number]> => [[0, v]]
const stepAt = (t: number, v: number): Array<[number, number]> => [[0, 0], [t, 0], [t + 0.001, v]]

/** Acro manoeuvres: roll doublet, pitch doublet, yaw step. */
const ACRO_DEMO: StickProfile = {
  roll: [[0, 0], [1.0, 0], [1.05, 0.5], [1.5, 0.5], [1.55, -0.5], [2.0, -0.5], [2.05, 0]],
  pitch: [[0, 0], [2.5, 0], [2.55, 0.5], [3.0, 0.5], [3.05, -0.5], [3.5, -0.5], [3.55, 0]],
  yaw: [[0, 0], [4.0, 0], [4.05, 0.5], [4.5, 0.5], [4.55, 0]],
  throttle: [[0, thr]],
}

interface Row {
  t: number
  sp: number[] // deg/s
  w: number[] // deg/s
  e: number[] // deg
  m: number[] // motor commands
}

function fly(name: string, opts: { sticks?: StickProfile; initialOmega?: number[] }, seconds: number) {
  // Ideal sensors: these tests check the controller, not the sensor models
  const model = buildFpvModel({ ...opts, sensors: 'ideal' })
  const n = Math.round(seconds / FPV.dt)
  const result = compileAndRunNative({
    modelName: `fpv_${name}`,
    sheets: (model.data as any).sheets,
    dt: FPV.dt,
    smokeMainBody: `
  fpv_${name}_seed_from_inputs(&model);
  for (int i = 0; i < ${n}; ++i) {
    fpv_${name}_step(&model);
    const fpv_${name}_outputs_t *o = &model.outputs;
    printf("%.6f", model.time - model.dt);
    for (int k = 0; k < 3; ++k) printf(" %.9g", o->rate_setpoint[k]);
    for (int k = 0; k < 3; ++k) printf(" %.9g", o->omega[k] * ${R2D});
    for (int k = 0; k < 3; ++k) printf(" %.9g", o->euler[k] * ${R2D});
    for (int k = 0; k < 4; ++k) printf(" %.9g", o->motor_cmd[k]);
    printf("\\n");
  }
  return 0;
`,
  })
  const rows: Row[] = result.stdout.trim().split('\n').map(line => {
    const v = line.split(' ').map(Number)
    return { t: v[0]!, sp: v.slice(1, 4), w: v.slice(4, 7), e: v.slice(7, 10), m: v.slice(10, 14) }
  })
  return { rows, outDir: result.outDir }
}

const at = (rows: Row[], t: number) => rows.reduce((best, r) => (Math.abs(r.t - t) < Math.abs(best.t - t) ? r : best))
const between = (rows: Row[], t0: number, t1: number) => rows.filter(r => r.t >= t0 && r.t <= t1)
const maxOf = (xs: number[]) => xs.reduce((a, b) => Math.max(a, b), -Infinity)
const minOf = (xs: number[]) => xs.reduce((a, b) => Math.min(a, b), Infinity)

describe('FPV reference model: acro flight controller', () => {
  const dirs: string[] = []
  const runs: Record<string, Row[]> = {}
  const run = (name: string, opts: Parameters<typeof fly>[1], seconds: number) => {
    const r = fly(name, opts, seconds)
    dirs.push(r.outDir)
    runs[name] = r.rows
    return r.rows
  }

  beforeAll(() => {
    run('demo', { sticks: ACRO_DEMO }, 5)
    run('roll', { sticks: { roll: stepAt(0.5, 0.5), pitch: hold(0), yaw: hold(0), throttle: hold(thr) } }, 2)
    run('yaw', { sticks: { roll: hold(0), pitch: hold(0), yaw: stepAt(0.5, 0.5), throttle: hold(thr) } }, 3)
    run('disturb', { initialOmega: [3, -2, 1], sticks: { roll: hold(0), pitch: hold(0), yaw: hold(0), throttle: hold(thr) } }, 2)
    run('flip', { sticks: { roll: stepAt(0.5, 1), pitch: hold(0), yaw: hold(0), throttle: hold(0) } }, 1.5)
  })
  afterAll(() => dirs.forEach(cleanupNativeDir))

  it('validates in the editor with no errors or warnings', () => {
    const result = validateMultiSheetTypeCompatibility((buildFpvModel().data as any).sheets)
    expect(result.errors.map(e => e.message)).toEqual([])
    expect(result.warnings.map(w => w.message)).toEqual([])
  })

  it('maps sticks to rates with the Betaflight "Actual" curve', () => {
    // center*s + (max - center)*s*|s|: half stick 185 deg/s, full stick 670 deg/s
    expect(at(runs['roll']!, 1.0).sp[0]).toBeCloseTo(70 * 0.5 + 600 * 0.25, 6)
    expect(at(runs['flip']!, 1.0).sp[0]).toBeCloseTo(670, 6)
  })

  it('holds a level hover with centred sticks', () => {
    const r = at(runs['demo']!, 0.9)
    for (const x of [...r.w, ...r.e]) expect(Math.abs(x)).toBeLessThan(1e-9)
    for (const m of r.m) expect(m).toBeCloseTo(FC.motorIdle + (1 - FC.motorIdle) * thr, 6)
  })

  it('tracks a roll-rate step: fast rise, bounded overshoot, no cross-coupling', () => {
    const rows = runs['roll']!
    const response = between(rows, 0.5, 2)
    // An instantaneous stick step: feed-forward kicks hardest here (~41%)
    expect(maxOf(response.map(r => r.w[0]!))).toBeLessThan(185 * 1.5)
    // Within 3% from 0.25 s after the step
    for (const r of between(rows, 0.75, 2)) expect(Math.abs(r.w[0]! - 185)).toBeLessThan(0.03 * 185)
    for (const r of rows) {
      expect(Math.abs(r.w[1]!)).toBeLessThan(1e-6)
      expect(Math.abs(r.w[2]!)).toBeLessThan(1e-6)
    }
  })

  it('tracks a yaw-rate step: rotor spin-up torque gives a fast rise, drag torque holds the rate', () => {
    // Without the rotor-inertia reaction torque the yaw loop (drag torque only)
    // overshot ~65% and rang for 2 s; with it, yaw behaves like a real quad.
    const rows = runs['yaw']!
    expect(at(rows, 0.55).w[2]).toBeGreaterThan(120)
    expect(Math.max(...between(rows, 0.5, 3).map(r => r.w[2]!))).toBeLessThan(185 * 1.15)
    for (const r of between(rows, 1.1, 3)) expect(Math.abs(r.w[2]! - 185)).toBeLessThan(0.03 * 185)
  })

  it('damps a body-rate disturbance', () => {
    const rows = runs['disturb']!
    // Starts at (172, -115, 57) deg/s with centred sticks
    expect(at(rows, 0).w[0]).toBeCloseTo(3 * R2D, 6)
    const r = at(rows, 0.3)
    expect(Math.abs(r.w[0]!)).toBeLessThan(2)
    expect(Math.abs(r.w[1]!)).toBeLessThan(2)
    for (const late of between(rows, 1.0, 2)) for (const w of late.w) expect(Math.abs(w)).toBeLessThan(2)
  })

  it('roll and pitch doublets return the vehicle to level', () => {
    const rows = runs['demo']!
    expect(Math.abs(at(rows, 2.4).e[0]!)).toBeLessThan(2)
    expect(Math.abs(at(rows, 3.9).e[1]!)).toBeLessThan(2)
  })

  it('airmode: a full-stick roll at zero throttle still rotates, motors stay within idle..full', () => {
    const rows = runs['flip']!
    for (const r of rows) for (const m of r.m) {
      expect(m).toBeGreaterThanOrEqual(FC.motorIdle - 1e-12)
      expect(m).toBeLessThanOrEqual(1 + 1e-12)
    }
    // The mix saturates during the response...
    const ms = between(rows, 0.5, 1.5).flatMap(r => r.m)
    expect(maxOf(ms)).toBeGreaterThan(0.99)
    // ...yet the rate reaches the 670 deg/s setpoint
    expect(Math.abs(at(rows, 1.4).w[0]! - 670)).toBeLessThan(0.05 * 670)
  })

  it('runs the controller at 1 kHz: motor commands hold for two 0.5 ms plant steps', () => {
    const rows = between(runs['roll']!, 0.5, 0.6)
    const ratio = Math.round(FC.ts / FPV.dt)
    expect(ratio).toBe(2)
    let changes = 0
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]!.m[0] !== rows[i - 1]!.m[0]) {
        changes++
        // A new command appears only on controller ticks
        expect(Math.round(rows[i]!.t / FPV.dt) % ratio).toBe(0)
      }
    }
    expect(changes).toBeGreaterThan(50)
  })

  it('flies the scripted acro manoeuvres', () => {
    const rows = runs['demo']!
    expect(at(rows, 1.4).w[0]).toBeCloseTo(185, 0)
    expect(at(rows, 1.9).w[0]).toBeCloseTo(-185, 0)
    expect(at(rows, 2.9).w[1]).toBeCloseTo(185, 0)
    expect(at(rows, 3.4).w[1]).toBeCloseTo(-185, 0)
    expect(maxOf(between(rows, 4, 4.6).map(r => r.w[2]!))).toBeGreaterThan(150)
    expect(minOf(rows.flatMap(r => r.m))).toBeGreaterThanOrEqual(FC.motorIdle - 1e-12)
  })
})

/**
 * FPV quadcopter reference model: ground contact, arming and take-off.
 */

import {
  buildFpvModel,
  DEMO_STICKS,
  FC,
  FPV,
  GROUND_REST_Z,
  LOCATION,
  SENSORS,
  type StickProfile,
} from '../../scripts/build-fpv-reference-model'
import { cleanupNativeDir, compileAndRunNative } from '../support/nativeCgen'

jest.setTimeout(240000)

const R2D = 180 / Math.PI
interface Row { t: number; z: number; vz: number; vh: number; e: number[]; m: number[]; f: number[]; altEst: number }

function fly(name: string, opts: { sticks?: StickProfile; initialAltitude?: number }, seconds: number) {
  const model = buildFpvModel(opts)
  const n = Math.round(seconds / FPV.dt)
  const result = compileAndRunNative({
    modelName: `fpvg_${name}`,
    sheets: (model.data as any).sheets,
    dt: FPV.dt,
    smokeMainBody: `
  fpvg_${name}_seed_from_inputs(&model);
  for (int i = 0; i < ${n}; ++i) {
    fpvg_${name}_step(&model);
    if (i % 4) continue;
    const fpvg_${name}_outputs_t *o = &model.outputs;
    printf("%.6f %.12g %.12g %.12g", model.time - model.dt, o->pos_ned[2], o->vel_ned[2], hypot(o->vel_ned[0], o->vel_ned[1]));
    for (int k = 0; k < 3; ++k) printf(" %.9g", o->euler[k] * ${R2D});
    for (int k = 0; k < 4; ++k) printf(" %.9g", o->motor_cmd[k]);
    for (int k = 0; k < 3; ++k) printf(" %.9g", o->accel[k]);
    printf(" %.9g\\n", o->altitude_est);
  }
  return 0;
`,
  })
  const rows: Row[] = result.stdout.trim().split('\n').map(l => {
    const x = l.split(' ').map(Number)
    return { t: x[0]!, z: x[1]!, vz: x[2]!, vh: x[3]!, e: x.slice(4, 7), m: x.slice(7, 11), f: x.slice(11, 14), altEst: x[14]! }
  })
  return { rows, outDir: result.outDir }
}

/** Field plane, NED down. Rest is 1 mm below it. */
const fieldZ = -LOCATION.elevationM
const restZ = fieldZ + GROUND_REST_Z

const at = (rows: Row[], t: number) => rows.reduce((b, r) => (Math.abs(r.t - t) < Math.abs(b.t - t) ? r : b))
const between = (rows: Row[], t0: number, t1: number) => rows.filter(r => r.t >= t0 && r.t <= t1)
const still: StickProfile = { roll: [[0, 0]], pitch: [[0, 0]], yaw: [[0, 0]], throttle: [[0, 0]] }

describe('FPV reference model: ground, arming and take-off', () => {
  const dirs: string[] = []
  const runs: Record<string, Row[]> = {}
  const run = (name: string, opts: Parameters<typeof fly>[1], seconds: number) => {
    const r = fly(name, opts, seconds)
    dirs.push(r.outDir)
    runs[name] = r.rows
  }

  beforeAll(() => {
    run('disarmed', { sticks: { ...still, arm: [[0, 0]] } }, 1)
    run('idle', { sticks: still }, 3) // armed at zero throttle, modelled sensors (biased gyro)
    run('drop', { sticks: { ...still, arm: [[0, 0]] }, initialAltitude: 2 }, 1.5)
    run('takeoff', { sticks: DEMO_STICKS }, 5)
  })
  afterAll(() => dirs.forEach(cleanupNativeDir))

  it('disarmed on the field: motors stopped, resting on the legs, accelerometer reads 1 g up', () => {
    for (const r of runs['disarmed']!) {
      for (const m of r.m) expect(m).toBe(0)
      expect(r.z).toBeCloseTo(restZ, 6)
      expect(Math.abs(r.vz)).toBeLessThan(1e-9)
    }
    const r = at(runs['disarmed']!, 0.5)
    expect(r.f[2]).toBeCloseTo(-FPV.gravity, 6)
  })

  it('armed at zero throttle: motors idle, the I-term stays reset, the quad stays put', () => {
    const rows = between(runs['idle']!, 0.5, 3)
    for (const r of rows) {
      for (const m of r.m) {
        expect(m).toBeGreaterThanOrEqual(FC.motorIdle - 1e-12)
        expect(m).toBeLessThan(0.1)
      }
      expect(r.z).toBeGreaterThan(fieldZ)
      expect(Math.hypot(r.e[0]!, r.e[1]!)).toBeLessThan(0.5)
    }
    // With the I-term running, the 0.3 deg/s gyro bias would wind it up over 3 s
    const spread = (r: Row) => Math.max(...r.m) - Math.min(...r.m)
    expect(spread(at(runs['idle']!, 2.9))).toBeLessThan(0.02)
  })

  it('a 2 m drop lands with at most a small hop and comes to rest', () => {
    const rows = runs['drop']!
    const contact = rows.findIndex(r => r.z > fieldZ)
    expect(contact).toBeGreaterThan(0)
    // Last sample before touching down: free fall slowed a little by drag
    const impact = rows[contact - 1]!.vz
    expect(impact).toBeGreaterThan(5.5)
    expect(impact).toBeLessThan(Math.sqrt(2 * FPV.gravity * 2))
    const after = rows.slice(contact)
    // Damped legs: a few cm of compression, then at most a small hop (the
    // legs push but cannot pull, so they let go while still extending)
    expect(Math.max(...after.map(r => r.z))).toBeLessThan(fieldZ + 0.05)
    expect(Math.min(...after.map(r => r.z))).toBeGreaterThan(fieldZ - 0.03)
    const last = rows[rows.length - 1]!
    expect(last.z).toBeCloseTo(restZ, 4)
    expect(Math.abs(last.vz)).toBeLessThan(1e-3)
  })

  it('the demo arms, takes off, climbs and hovers level', () => {
    const rows = runs['takeoff']!
    // Disarmed until 0.25 s, then idle on the ground until the throttle comes up
    for (const r of between(rows, 0, 0.24)) for (const m of r.m) expect(m).toBe(0)
    for (const r of between(rows, 0.3, 0.55)) expect(r.z).toBeGreaterThan(fieldZ)
    // Airborne and climbing: more than 1 m above the field plane
    expect(at(rows, 1.5).z).toBeLessThan(fieldZ - 1)
    for (const r of between(rows, 0.6, 2.0)) expect(Math.hypot(r.e[0]!, r.e[1]!)).toBeLessThan(2)
    // The altitude estimate follows the climb from the field elevation
    for (const r of rows) expect(Math.abs(r.altEst - (SENSORS.baro.homeAltitude - r.z))).toBeLessThan(0.5)
  })
})

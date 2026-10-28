/**
 * FPV GNSS receiver (docs/fpv-hud-gnss-test-plan.md, Level 2): the ideal fix
 * equals truth at every 10 Hz sample, runs are deterministic, and errors scale
 * exactly with the UERE scale, HDOP and VDOP (same seeds, compared sample by
 * sample). Statistics, fix rules and course are checked by the obliq test
 * models T03–T05.
 */
import {
  buildFpvModel,
  FPV,
  LOCATION,
  SENSORS,
  type ConditionsProfile,
  type StickProfile,
} from '../../scripts/build-fpv-reference-model'
import { cleanupNativeDir, compileAndRunNative } from '../support/nativeCgen'

jest.setTimeout(300000)

/** Disarmed at rest on the field: truth is constant, so the fix is all error. */
const REST: StickProfile = { roll: [[0, 0]], pitch: [[0, 0]], yaw: [[0, 0]], throttle: [[0, 0]], arm: [[0, 0]] }
/** Take-off and a turn, so truth moves in all axes. */
const MOVING: StickProfile = {
  roll: [[0, 0], [1.5, 0], [1.6, 0.3], [2.5, 0.3], [2.6, 0]],
  pitch: [[0, 0], [1.8, 0], [1.9, -0.3], [2.8, -0.3], [2.9, 0]],
  yaw: [[0, 0]],
  throttle: [[0, 0], [0.3, 0], [0.4, 0.6]],
  aux: [[0, 1]],
  arm: [[0, 0], [0.2, 0], [0.21, 1]],
}

interface Row { tick: number; pos: number[]; vel: number[]; gpos: number[]; gvel: number[]; fix: number[] }

const dirs: string[] = []
afterAll(() => dirs.forEach(cleanupNativeDir))

let seq = 0
function run(sticks: StickProfile, seconds: number, opts: { ideal?: boolean; conditions?: ConditionsProfile } = {}): Row[] {
  const name = `fpvgnss${seq++}`
  const model = buildFpvModel({ sticks, sensors: opts.ideal ? 'ideal' : 'modelled', conditions: opts.conditions })
  const n = Math.round(seconds / FPV.dt)
  const result = compileAndRunNative({
    modelName: name,
    sheets: (model.data as any).sheets,
    dt: FPV.dt,
    smokeMainBody: `
  ${name}_seed_from_inputs(&model);
  for (int i = 0; i < ${n}; ++i) {
    ${name}_step(&model);
    const ${name}_outputs_t *o = &model.outputs;
    printf("%d", i);
    for (int k = 0; k < 3; ++k) printf(" %.17g", o->pos_ned[k]);
    for (int k = 0; k < 3; ++k) printf(" %.17g", o->vel_ned[k]);
    for (int k = 0; k < 3; ++k) printf(" %.17g", o->gnss_pos[k]);
    for (int k = 0; k < 3; ++k) printf(" %.17g", o->gnss_vel_ned[k]);
    for (int k = 0; k < 3; ++k) printf(" %.17g", o->gnss_fix[k]);
    printf("\\n");
  }
  return 0;
`,
  })
  dirs.push(result.outDir)
  return result.stdout.trim().split('\n').map(line => {
    const v = line.trim().split(' ').map(Number)
    return { tick: v[0]!, pos: v.slice(1, 4), vel: v.slice(4, 7), gpos: v.slice(7, 10), gvel: v.slice(10, 13), fix: v.slice(13, 16) }
  })
}

const samples = (rows: Row[]) => rows.filter(r => r.tick % Math.round(SENSORS.gnss.ts / FPV.dt) === 0)
/** Grid → true NED, as the receiver reports velocity. */
const toTrue = (v: number[], gammaDeg: number) => {
  const r = (gammaDeg * Math.PI) / 180
  return [v[0]! * Math.cos(r) - v[1]! * Math.sin(r), v[0]! * Math.sin(r) + v[1]! * Math.cos(r), v[2]!]
}
/** Fix error: [n, e, alt] position and [vn, ve, vd] velocity against truth. */
const errors = (r: Row) => ({
  pos: [r.gpos[0]! - r.pos[0]!, r.gpos[1]! - r.pos[1]!, r.gpos[2]! + r.pos[2]!],
  vel: r.gvel.map((v, k) => v - toTrue(r.vel, LOCATION.gridConvergenceDeg)[k]!),
})

describe('FPV GNSS receiver', () => {
  test('ideal: the fix is truth (grid n, e, MSL) and true-north velocity at every 10 Hz sample', () => {
    const rows = samples(run(MOVING, 3, { ideal: true }))
    expect(rows.length).toBe(30)
    for (const r of rows) {
      expect(r.gpos).toEqual([r.pos[0], r.pos[1], -r.pos[2]!])
      const v = toTrue(r.vel, LOCATION.gridConvergenceDeg)
      for (let k = 0; k < 3; k++) expect(Math.abs(r.gvel[k]! - v[k]!)).toBeLessThan(1e-12)
      expect(r.fix.slice(0, 2)).toEqual([3, 14])
      expect(Math.abs(r.fix[2]! - Math.hypot(0.8, 1.3))).toBeLessThan(1e-12)
    }
    // The truth moved, so this is not a trivial comparison
    expect(Math.abs(rows[rows.length - 1]!.pos[2]! - rows[0]!.pos[2]!)).toBeGreaterThan(1)
  })

  test('outputs change only at 10 Hz sample instants', () => {
    const rows = run(MOVING, 2)
    let changes = 0
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]!.gpos.some((x, k) => x !== rows[i - 1]!.gpos[k])) {
        changes++
        expect(rows[i]!.tick % Math.round(SENSORS.gnss.ts / FPV.dt)).toBe(0)
      }
    }
    expect(changes).toBeGreaterThan(15)
  })

  test('deterministic: two runs give identical output', () => {
    const a = run(MOVING, 2)
    const b = run(MOVING, 2)
    expect(b).toEqual(a)
  })

  test('errors scale exactly with the UERE scale, HDOP and VDOP (same seeds)', () => {
    const seconds = 20
    const base = samples(run(REST, seconds)).map(errors)
    const scaled = samples(run(REST, seconds, { conditions: { gnssEnv: { uereScale: 2 } } })).map(errors)
    const hdop = samples(run(REST, seconds, { conditions: { gnssEnv: { hdop: 1.6 } } })).map(errors)
    const vdop = samples(run(REST, seconds, { conditions: { gnssEnv: { vdop: 2.6 } } })).map(errors)
    // Each output is quantized to 1 cm (or 1 cm/s): allow half a step on each side, doubled
    const q = 0.015
    base.forEach((e, i) => {
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(scaled[i]!.pos[k]! - 2 * e.pos[k]!)).toBeLessThan(q)
        expect(Math.abs(scaled[i]!.vel[k]! - 2 * e.vel[k]!)).toBeLessThan(q)
        const h = k < 2
        expect(Math.abs(hdop[i]!.pos[k]! - (h ? 2 : 1) * e.pos[k]!)).toBeLessThan(q)
        expect(Math.abs(vdop[i]!.pos[k]! - (h ? 1 : 2) * e.pos[k]!)).toBeLessThan(q)
      }
    })
    // The errors are not trivially zero
    expect(Math.max(...base.map(e => Math.abs(e.pos[0]!)))).toBeGreaterThan(0.5)
  })
})

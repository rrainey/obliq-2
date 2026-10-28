/**
 * FPV flight-controller OSD outputs (docs/fpv-hud-gnss-test-plan.md, Level 2):
 * the mode flags follow the controller, home is taken only on the arming
 * sample with 8 or more satellites and cleared on disarm, and distance and
 * bearing to home update on each fix and agree with the true geometry.
 */
import {
  buildFpvModel,
  COURSE_STICKS,
  DEMO_STICKS,
  FC,
  FPV,
  HOVER_STICKS,
  LOCATION,
  SENSORS,
  type ConditionsProfile,
  type StickProfile,
} from '../../scripts/build-fpv-reference-model'
import { cleanupNativeDir, compileAndRunNative } from '../support/nativeCgen'

jest.setTimeout(300000)

interface Row {
  tick: number; t: number; sticks: number[]; pos: number[]
  armed: number; angle: number; airmode: number; homeValid: number; dist: number; bearing: number
}

const dirs: string[] = []
afterAll(() => dirs.forEach(cleanupNativeDir))

let seq = 0
function run(sticks: StickProfile, seconds: number, conditions?: ConditionsProfile): Row[] {
  const name = `fpvosd${seq++}`
  const model = buildFpvModel({ sticks, conditions })
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
    printf("%d %.6f", i, model.time - model.dt);
    for (int k = 0; k < 6; ++k) printf(" %.17g", model.signals.Pilot_Sticks[k]);
    for (int k = 0; k < 3; ++k) printf(" %.17g", o->pos_ned[k]);
    printf(" %g %g %g %g %.17g %.17g\\n", o->fc_armed, o->fc_angle_mode, o->fc_airmode, o->home_valid, o->home_distance_m, o->home_bearing_deg);
  }
  return 0;
`,
  })
  dirs.push(result.outDir)
  return result.stdout.trim().split('\n').map(line => {
    const v = line.trim().split(' ').map(Number)
    return {
      tick: v[0]!, t: v[1]!, sticks: v.slice(2, 8), pos: v.slice(8, 11),
      armed: v[11]!, angle: v[12]!, airmode: v[13]!, homeValid: v[14]!, dist: v[15]!, bearing: v[16]!,
    }
  })
}

const armTime = (rows: Row[]) => rows.find(r => r.armed > 0.5)!.t
const wrap = (d: number) => ((d % 360) + 540) % 360 - 180

describe('FPV flight-controller OSD outputs', () => {
  test('mode flags follow the controller: armed, angle mode, airmode latched at 25% throttle', () => {
    const sticks: StickProfile = { ...DEMO_STICKS, aux: [[0, 1], [3, 1], [3.001, 0]] }
    const rows = run(sticks, 4)
    // The controller samples at 1 kHz (every other plant step) and holds between
    const fcTicks = rows.filter(r => r.tick % Math.round(FC.ts / FPV.dt) === 0)
    for (const r of fcTicks) {
      expect(r.armed).toBe(r.sticks[5]! > 0.5 ? 1 : 0)
      expect(r.angle).toBe(r.sticks[4]! > 0.5 ? 1 : 0)
    }
    // Airmode starts at the first sample with throttle above 25% after arming, and stays on
    const first = rows.findIndex(r => r.airmode > 0.5)
    expect(rows[first]!.sticks[3]!).toBeGreaterThan(FC.airmodeStartThrottle)
    expect(rows.slice(first).every(r => r.airmode === 1)).toBe(true)
    expect(rows.slice(0, first).every(r => r.armed === 0 || r.sticks[3]! <= FC.airmodeStartThrottle + 0.01)).toBe(true)
  })

  test('home: taken on the arming sample with 8+ satellites, cleared on disarm, re-taken on re-arm', () => {
    const sticks: StickProfile = { ...HOVER_STICKS, arm: [[0, 0], [0.25, 0], [0.251, 1], [2.0, 1], [2.001, 0], [2.5, 0], [2.501, 1]] }
    const rows = run(sticks, 3)
    for (const r of rows) expect(r.homeValid).toBe(r.armed)
    expect(rows.filter(r => r.armed === 0 && r.t > 2.1 && r.t < 2.4).every(r => r.dist === 0 && r.bearing === 0)).toBe(true)
  })

  test('home: arming with 7 satellites gives no home for the flight, even after the count rises', () => {
    const conditions: ConditionsProfile = { gnssEnv: { satellites: [[0, 7], [1.0, 7], [1.001, 14]] } }
    const rows = run(HOVER_STICKS, 3, conditions)
    expect(armTime(rows)).toBeLessThan(1)
    expect(rows.every(r => r.homeValid === 0 && r.dist === 0)).toBe(true)
    // With FC.homeMinSats = 8 the same flight does take home
    expect(FC.homeMinSats).toBe(8)
    expect(run(HOVER_STICKS, 1, { gnssEnv: { satellites: 8 } }).some(r => r.homeValid === 1)).toBe(true)
  })

  test('distance and bearing update only on GNSS fixes, and match the true geometry beyond 10 m', () => {
    const rows = run(COURSE_STICKS, 12)
    const per = Math.round(SENSORS.gnss.ts / FPV.dt)
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]!.dist !== rows[i - 1]!.dist || rows[i]!.bearing !== rows[i - 1]!.bearing) {
        // On a fix, or on the arming sample's first fix after home is taken
        expect(rows[i]!.tick % per).toBe(0)
      }
    }
    const armRow = rows.find(r => r.armed > 0.5)!
    const home = armRow.pos
    const far = rows.filter(r => r.tick % per === 0 && Math.hypot(r.pos[0]! - home[0]!, r.pos[1]! - home[1]!) > 10)
    expect(far.length).toBeGreaterThan(20)
    for (const r of far) {
      const dn = home[0]! - r.pos[0]!, de = home[1]! - r.pos[1]!
      expect(Math.abs(r.dist - Math.hypot(dn, de))).toBeLessThan(4)
      const trueBearing = (Math.atan2(de, dn) * 180) / Math.PI + LOCATION.gridConvergenceDeg
      expect(Math.abs(wrap(r.bearing - trueBearing))).toBeLessThan(20)
      expect(r.bearing).toBeGreaterThanOrEqual(0)
      expect(r.bearing).toBeLessThan(360)
    }
    // Flying away toward grid north, home is behind: bearing near 180° + γ
    expect(Math.abs(wrap(far[far.length - 1]!.bearing - (180 + LOCATION.gridConvergenceDeg)))).toBeLessThan(15)
  })
})

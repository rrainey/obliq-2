/**
 * FPV quadcopter reference model, Phase 4: sensor models (IMU at 1 kHz,
 * magnetometer at 100 Hz, barometer at 50 Hz) and the flight controller's
 * estimators (Mahony attitude filter, baro/accelerometer altitude filter).
 */

import {
  AIRBORNE_DEMO_STICKS,
  buildFpvModel,
  ESTIMATOR,
  FC,
  FPV,
  HOVER_THROTTLE,
  LOCATION,
  SITE_FIELD,
  standardPressure,
  SENSORS,
  type StickProfile,
} from '../../scripts/build-fpv-reference-model'
import { cleanupNativeDir, compileAndRunNative } from '../support/nativeCgen'
import { loadWmm2025, wmmField } from '../../scripts/lib/wmm'

jest.setTimeout(240000)

const thr = Number(HOVER_THROTTLE.toFixed(4))
const ALT0 = 30 // m above the field at the start
const centred: StickProfile = { roll: [[0, 0]], pitch: [[0, 0]], yaw: [[0, 0]], throttle: [[0, thr]] }

interface Row {
  t: number
  w: number[]; gyro: number[]
  f: number[]; acc: number[]
  mag: number[]; p: number; pos: number[]
  q: number[]; qEst: number[]; altEst: number
}

function fly(name: string, sticks: StickProfile | undefined, seconds: number) {
  const model = buildFpvModel({ sticks: sticks ?? AIRBORNE_DEMO_STICKS, initialAltitude: ALT0 })
  const n = Math.round(seconds / FPV.dt)
  const result = compileAndRunNative({
    modelName: `fpvs_${name}`,
    sheets: (model.data as any).sheets,
    dt: FPV.dt,
    smokeMainBody: `
  fpvs_${name}_seed_from_inputs(&model);
  for (int i = 0; i < ${n}; ++i) {
    fpvs_${name}_step(&model);
    const fpvs_${name}_outputs_t *o = &model.outputs;
    printf("%.6f", model.time - model.dt);
    for (int k = 0; k < 3; ++k) printf(" %.12g %.12g", o->omega[k], o->imu_gyro[k]);
    for (int k = 0; k < 3; ++k) printf(" %.12g %.12g", o->accel[k], o->imu_accel[k]);
    for (int k = 0; k < 3; ++k) printf(" %.12g", o->mag[k]);
    printf(" %.12g", o->pressure);
    for (int k = 0; k < 3; ++k) printf(" %.12g", o->pos_ned[k]);
    for (int k = 0; k < 4; ++k) printf(" %.12g %.12g", o->quat[k][0], o->quat_est[k][0]);
    printf(" %.12g\\n", o->altitude_est);
  }
  return 0;
`,
  })
  const rows: Row[] = result.stdout.trim().split('\n').map(line => {
    const v = line.split(' ').map(Number)
    const pair = (o: number, i: number) => v[o + 2 * i]!
    return {
      t: v[0]!,
      w: [0, 1, 2].map(i => pair(1, i) as number), gyro: [0, 1, 2].map(i => v[2 + 2 * i]!),
      f: [0, 1, 2].map(i => v[7 + 2 * i]!), acc: [0, 1, 2].map(i => v[8 + 2 * i]!),
      mag: v.slice(13, 16), p: v[16]!, pos: v.slice(17, 20),
      q: [0, 1, 2, 3].map(i => v[20 + 2 * i]!), qEst: [0, 1, 2, 3].map(i => v[21 + 2 * i]!),
      altEst: v[28]!,
    }
  })
  return { rows, outDir: result.outDir }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const std = (xs: number[]) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)) }
/** Angle (deg) between two unit quaternions. */
const qAngle = (a: number[], b: number[]) => {
  const d = Math.abs(a.reduce((s, x, i) => s + x * b[i]!, 0))
  return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI
}
/** True NED → grid NED by the grid convergence γ (deg). */
const toGrid = (v: number[], gammaDeg: number) => {
  const r = (gammaDeg * Math.PI) / 180
  return [v[0]! * Math.cos(r) + v[1]! * Math.sin(r), -v[0]! * Math.sin(r) + v[1]! * Math.cos(r), v[2]!]
}
const trueAltitude = (r: Row) => SENSORS.baro.homeAltitude - r.pos[2]!
/** C_bn(q) v for a scalar-first unit quaternion (same convention as quat_to_dcm). */
const toBody = (q: number[], v: number[]) => {
  const [a, b, c, d] = q as [number, number, number, number]
  const C = [
    [a * a + b * b - c * c - d * d, 2 * (b * c + a * d), 2 * (b * d - a * c)],
    [2 * (b * c - a * d), a * a - b * b + c * c - d * d, 2 * (c * d + a * b)],
    [2 * (b * d + a * c), 2 * (c * d - a * b), a * a - b * b - c * c + d * d],
  ]
  return C.map(row => row.reduce((s, x, i) => s + x * v[i]!, 0))
}

describe('FPV reference model: sensors and estimators', () => {
  const dirs: string[] = []
  let hover: Row[] = []
  let demo: Row[] = []

  beforeAll(() => {
    const h = fly('hover', centred, 3)
    const d = fly('demo', undefined, 5)
    dirs.push(h.outDir, d.outDir)
    hover = h.rows
    demo = d.rows
  })
  afterAll(() => dirs.forEach(cleanupNativeDir))

  /** Rows at IMU sample instants (the IMU runs every other plant step). */
  const imuTicks = (rows: Row[]) => rows.filter(r => Math.round(r.t / FPV.dt) % Math.round(SENSORS.imu.ts / FPV.dt) === 0)

  it('gyro: bias plus white noise of the datasheet density, quantized to 16 bits', () => {
    const g = SENSORS.gyro
    const sigma = Math.hypot(g.density / Math.sqrt(SENSORS.imu.ts), g.lsb / Math.sqrt(12))
    const rows = imuTicks(hover)
    for (let k = 0; k < 3; k++) {
      const err = rows.map(r => r.gyro[k]! - r.w[k]!)
      expect(Math.abs(mean(err) - g.bias[k]!)).toBeLessThan((4 * sigma) / Math.sqrt(err.length))
      expect(std(err) / sigma).toBeCloseTo(1, 1)
      // Quantized: every reading is a whole number of LSBs
      for (const r of rows.slice(0, 50)) expect(Math.abs(r.gyro[k]! / g.lsb - Math.round(r.gyro[k]! / g.lsb))).toBeLessThan(1e-6)
    }
  })

  it('accelerometer: bias plus datasheet noise on the true specific force', () => {
    const a = SENSORS.accel
    const sigma = Math.hypot(a.density / Math.sqrt(SENSORS.imu.ts), a.lsb / Math.sqrt(12))
    const rows = imuTicks(hover)
    for (let k = 0; k < 3; k++) {
      const err = rows.map(r => r.acc[k]! - r.f[k]!)
      expect(Math.abs(mean(err) - a.bias[k]!)).toBeLessThan((4 * sigma) / Math.sqrt(err.length))
      expect(std(err) / sigma).toBeCloseTo(1, 1)
    }
  })

  it('the site is Prairie Creek Park with its WMM2025 field', () => {
    expect(LOCATION.name).toBe('Prairie Creek Park, Texas')
    expect(LOCATION.latitudeDeg).toBe(32.98562480100526)
    expect(LOCATION.longitudeDeg).toBe(-96.71872529973575)
    expect(LOCATION.elevationM).toBe(178.133)
    expect(SENSORS.baro.homeAltitude).toBe(0)
    // GEOID18 at the park; the WMM takes height above the ellipsoid
    expect(LOCATION.geoidHeightM).toBe(-26.103)
    const field = wmmField(loadWmm2025(), LOCATION.latitudeDeg, LOCATION.longitudeDeg, LOCATION.elevationM + LOCATION.geoidHeightM, LOCATION.epoch)
    // At the MSL height instead, the field differs by under 1 nT
    const atMsl = wmmField(loadWmm2025(), LOCATION.latitudeDeg, LOCATION.longitudeDeg, LOCATION.elevationM, LOCATION.epoch)
    expect(Math.abs(atMsl.totalNt - field.totalNt)).toBeLessThan(1)
    expect(SITE_FIELD.declinationDeg).toBe(field.declinationDeg)
    expect(SITE_FIELD.inclinationDeg).toBe(field.inclinationDeg)
    expect(SITE_FIELD.ned).toEqual([field.x, field.y, field.z].map(v => Number((v / 1000).toFixed(3))))
    expect(SENSORS.mag.field).toEqual(SITE_FIELD.ned)
  })

  it('magnetometer: updates at 100 Hz and reads the rotated field plus hard iron', () => {
    const m = SENSORS.mag
    let changes = 0
    for (let i = 1; i < hover.length; i++) {
      if (hover[i]!.mag[0] !== hover[i - 1]!.mag[0]) {
        changes++
        expect(Math.round(hover[i]!.t / FPV.dt) % Math.round(m.ts / FPV.dt)).toBe(0)
      }
    }
    expect(changes).toBeGreaterThan(200) // 3 s at 100 Hz, most samples differ
    // Measured minus the field (rotated from true into the grid frame by the
    // default γ, then into the body): hard iron plus noise
    const field = toGrid(m.field, LOCATION.gridConvergenceDeg)
    for (let k = 0; k < 3; k++) {
      const resid = hover.map(r => r.mag[k]! - toBody(r.q, field)[k]!)
      expect(Math.abs(mean(resid) - m.hardIron[k]!)).toBeLessThan(0.1)
    }
  })

  it('barometer: 50 Hz standard-atmosphere pressure (Atmosphere block) with noise and lag', () => {
    const b = SENSORS.baro
    let changes = 0
    for (let i = 1; i < hover.length; i++) {
      if (hover[i]!.p !== hover[i - 1]!.p) {
        changes++
        expect(Math.round(hover[i]!.t / FPV.dt) % Math.round(b.ts / FPV.dt)).toBe(0)
      }
    }
    expect(changes).toBeGreaterThan(140)
    // 1.3 Pa noise through the lag filter: residual about the standard pressure well under 2 Pa
    const resid = hover.filter(r => r.t > 0.5).map(r => r.p - standardPressure(trueAltitude(r)))
    expect(Math.abs(mean(resid))).toBeLessThan(0.6)
    expect(std(resid)).toBeLessThan(1.3)
  })

  it('attitude estimate stays within 2 degrees in hover', () => {
    // With no integral term (Betaflight's imu_dcm_ki is 0) the gyro bias leaves
    // a steady error of |bias|/Kp = 0.37 deg/s / 0.25 1/s ≈ 1.5 deg
    const steady = (Math.hypot(...SENSORS.gyro.bias) / ESTIMATOR.mahonyKp) * (180 / Math.PI)
    expect(steady).toBeCloseTo(1.5, 1)
    for (const r of hover) expect(qAngle(r.q, r.qEst)).toBeLessThan(2)
    expect(qAngle(hover[hover.length - 1]!.q, hover[hover.length - 1]!.qEst)).toBeCloseTo(steady, 0)
  })

  it('attitude estimate during the demo: tracks the manoeuvres, with bounded accelerometer-induced drift', () => {
    // Before the first manoeuvre
    for (const r of demo.filter(r => r.t < 0.5)) expect(qAngle(r.q, r.qEst)).toBeLessThan(2)
    // During and after the flips the accelerometer (which sees thrust, not
    // gravity) pulls the estimate toward level: several degrees, never runaway
    const worst = Math.max(...demo.map(r => qAngle(r.q, r.qEst)))
    expect(worst).toBeGreaterThan(2)
    expect(worst).toBeLessThan(15)
  })

  it('altitude estimate follows the true altitude within 0.5 m, including the sink during the demo', () => {
    for (const r of [...hover, ...demo]) expect(Math.abs(r.altEst - trueAltitude(r))).toBeLessThan(0.5)
    // The demo loses real altitude, so this is tracking, not a constant
    expect(trueAltitude(demo[demo.length - 1]!)).toBeLessThan(LOCATION.elevationM + ALT0 - 5)
  })

  it('the controller flies on the noisy gyro and still tracks the demo rates', () => {
    const hold = (t0: number, t1: number, k: number) => mean(demo.filter(r => r.t >= t0 && r.t <= t1).map(r => (r.w[k]! * 180) / Math.PI))
    // Demo roll doublet (acro): +185 then -185 deg/s
    expect(hold(0.8, 1.0, 0)).toBeCloseTo(185, -1)
    expect(hold(1.3, 1.5, 0)).toBeCloseTo(-185, -1)
    expect(FC.ts).toBe(SENSORS.imu.ts)
  })
})

describe('FPV reference model: grid convergence', () => {
  const dirs: string[] = []
  afterAll(() => dirs.forEach(cleanupNativeDir))

  /** Ideal sensors, hover at 30 m, nose 30° east of grid north; 5 s. */
  function run(name: string, gammaDeg: number) {
    const model = buildFpvModel({ sticks: centred, initialAltitude: ALT0, initialEuler: [0, 0, 30], sensors: 'ideal', conditions: { gridConvergenceDeg: gammaDeg } })
    const n = Math.round(5 / FPV.dt)
    const result = compileAndRunNative({
      modelName: `fpvg_${name}`,
      sheets: (model.data as any).sheets,
      dt: FPV.dt,
      smokeMainBody: `
  fpvg_${name}_seed_from_inputs(&model);
  for (int i = 0; i < ${n}; ++i) {
    fpvg_${name}_step(&model);
    const fpvg_${name}_outputs_t *o = &model.outputs;
    for (int k = 0; k < 3; ++k) printf("%.17g ", o->mag[k]);
    for (int k = 0; k < 4; ++k) printf("%.17g ", o->quat[k][0]);
    printf("%.17g %.17g %.17g\\n", o->euler[2], o->euler_est[2], o->heading_deg);
  }
  return 0;
`,
    })
    dirs.push(result.outDir)
    return result.stdout.trim().split('\n').map(line => {
      const v = line.trim().split(' ').map(Number)
      return { mag: v.slice(0, 3), q: v.slice(3, 7), yaw: v[7]!, yawEst: v[8]!, heading: v[9]! }
    })
  }
  const deg = (rad: number) => (rad * 180) / Math.PI
  const wrap = (d: number) => ((d % 360) + 540) % 360 - 180

  it('γ = 0: the magnetometer reads the true-NED field in the body, and heading is the estimate\'s yaw', () => {
    const rows = run('zero', 0)
    for (const r of rows.filter((_, i) => i % 20 === 0)) {
      const expected = toBody(r.q, SENSORS.mag.field)
      for (let k = 0; k < 3; k++) expect(Math.abs(r.mag[k]! - expected[k]!)).toBeLessThan(1e-9)
      expect(Math.abs(wrap(r.heading - deg(r.yawEst)))).toBeLessThan(1e-9)
    }
  })

  it('γ = 1.2425°: the field is rotated into the grid frame, the estimate stays on grid yaw, and heading is true', () => {
    const gamma = LOCATION.gridConvergenceDeg
    expect(gamma).toBe(1.2425)
    const rows = run('site', gamma)
    for (const r of rows.filter((_, i) => i % 20 === 0)) {
      const expected = toBody(r.q, toGrid(SENSORS.mag.field, gamma))
      for (let k = 0; k < 3; k++) expect(Math.abs(r.mag[k]! - expected[k]!)).toBeLessThan(1e-9)
      // The estimator's reference is in the same frame, so its yaw matches the true (grid) yaw
      expect(Math.abs(wrap(deg(r.yawEst) - deg(r.yaw)))).toBeLessThan(0.5)
      // True heading = grid yaw + γ: about 31.24° for a nose 30° east of grid north
      expect(Math.abs(wrap(r.heading - (deg(r.yaw) + gamma)))).toBeLessThan(0.5)
      expect(r.heading).toBeGreaterThanOrEqual(0)
      expect(r.heading).toBeLessThan(360)
    }
    // The sensor field and the estimator's reference are in the same frame:
    // after 5 s the estimate sits on the true yaw (a reference γ off would
    // pull it toward a 1.24° offset)
    const last = rows[rows.length - 1]!
    expect(Math.abs(wrap(deg(last.yawEst) - deg(last.yaw)))).toBeLessThan(0.2)
  })
})

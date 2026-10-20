/**
 * FPV quadcopter reference model, Phase 5: battery (4S LiPo, state of charge,
 * internal resistance) and voltage-dependent motor speed.
 */

import {
  BATTERY,
  buildFpvModel,
  FPV,
  HOVER_THROTTLE,
  HOVER_VOLTAGE,
  type StickProfile,
} from '../../scripts/build-fpv-reference-model'
import { cleanupNativeDir, compileAndRunNative } from '../support/nativeCgen'

jest.setTimeout(240000)

const thr = Number(HOVER_THROTTLE.toFixed(4))
const centred: StickProfile = { roll: [[0, 0]], pitch: [[0, 0]], yaw: [[0, 0]], throttle: [[0, thr]] }
const punch: StickProfile = { ...centred, throttle: [[0, thr], [1.0, thr], [1.05, 1.0], [1.5, 1.0], [1.55, thr]] }

interface Row { t: number; v: number; i: number; soc: number; rotor: number[]; vz: number }

function fly(name: string, sticks: StickProfile, seconds: number) {
  const model = buildFpvModel({ sticks, sensors: 'ideal', initialAltitude: 30 })
  const n = Math.round(seconds / FPV.dt)
  const result = compileAndRunNative({
    modelName: `fpvb_${name}`,
    sheets: (model.data as any).sheets,
    dt: FPV.dt,
    smokeMainBody: `
  fpvb_${name}_seed_from_inputs(&model);
  for (int i = 0; i < ${n}; ++i) {
    fpvb_${name}_step(&model);
    if (i % 10) continue;
    const fpvb_${name}_outputs_t *o = &model.outputs;
    printf("%.6f %.12g %.12g %.12g %.9g %.9g %.9g %.9g %.9g\\n", model.time - model.dt,
      o->battery_voltage, o->battery_current, o->battery_soc,
      o->motor_omega[0], o->motor_omega[1], o->motor_omega[2], o->motor_omega[3], o->vel_ned[2]);
  }
  return 0;
`,
  })
  const rows: Row[] = result.stdout.trim().split('\n').map(l => {
    const x = l.split(' ').map(Number)
    return { t: x[0]!, v: x[1]!, i: x[2]!, soc: x[3]!, rotor: x.slice(4, 8), vz: x[8]! }
  })
  return { rows, outDir: result.outDir }
}

const at = (rows: Row[], t: number) => rows.reduce((b, r) => (Math.abs(r.t - t) < Math.abs(b.t - t) ? r : b))
/** Pack open-circuit voltage at a state of charge (the model's lookup table). */
const packOcv = (soc: number) => {
  const pts = BATTERY.ocvPerCell
  for (let k = 1; k < pts.length; k++) {
    const [s0, v0] = pts[k - 1]!, [s1, v1] = pts[k]!
    if (soc <= s1) return BATTERY.cells * (v0 + ((v1 - v0) * (soc - s0)) / (s1 - s0))
  }
  return BATTERY.cells * pts[pts.length - 1]![1]
}

describe('FPV reference model: battery', () => {
  const dirs: string[] = []
  let hover: Row[] = []
  let boost: Row[] = []
  beforeAll(() => {
    const h = fly('hover', centred, 2)
    const p = fly('punch', punch, 2)
    dirs.push(h.outDir, p.outDir)
    hover = h.rows
    boost = p.rows
  })
  afterAll(() => dirs.forEach(cleanupNativeDir))

  it('hover current is the shaft power kappa T w / eta over the pack voltage', () => {
    const r = at(hover, 1.5)
    const thrust = (FPV.mass * FPV.gravity) / 4
    const omega = Math.sqrt(thrust / FPV.thrustCoeff)
    const power = (4 * FPV.torqueToThrust * thrust * omega) / FPV.driveEfficiency
    expect(r.i).toBeCloseTo(power / r.v, 1)
    expect(r.i).toBeGreaterThan(5)
    expect(r.i).toBeLessThan(10)
  })

  it('terminal voltage is OCV(SoC) minus I R, and the hover throttle holds altitude on it', () => {
    const r = at(hover, 1.5)
    expect(r.v).toBeCloseTo(packOcv(r.soc) - r.i * BATTERY.resistanceOhm, 2)
    // Close to the full-pack hover voltage the throttle was set for
    expect(Math.abs(r.v - HOVER_VOLTAGE)).toBeLessThan(0.05)
    // At fixed throttle the rotors slow slightly as the pack drains (no altitude hold in acro)
    const omegaHover = Math.sqrt((FPV.mass * FPV.gravity) / 4 / FPV.thrustCoeff)
    for (const w of r.rotor) expect(Math.abs(w / omegaHover - 1)).toBeLessThan(0.002)
    // Sink rate from the spin-up transient decays: no steady climb or descent
    expect(Math.abs(at(hover, 1.9).vz)).toBeLessThan(0.4)
    expect(Math.abs(at(hover, 1.9).vz)).toBeLessThan(Math.abs(at(hover, 0.2).vz))
  })

  it('state of charge falls by the integrated current over the capacity', () => {
    let charge = 0
    for (let k = 1; k < hover.length; k++) charge += 0.5 * (hover[k]!.i + hover[k - 1]!.i) * (hover[k]!.t - hover[k - 1]!.t)
    const last = hover[hover.length - 1]!
    expect((BATTERY.initialSoc - last.soc) / (charge / 3600 / BATTERY.capacityAh)).toBeCloseTo(1, 2)
  })

  it('full throttle sags the pack, and the motors slow with it', () => {
    const r = at(boost, 1.45)
    expect(r.i).toBeGreaterThan(40)
    expect(packOcv(r.soc) - r.v).toBeCloseTo(r.i * BATTERY.resistanceOhm, 1)
    // Full command reaches OMEGA_MAX only at the reference voltage
    const omegaMax = Math.sqrt(FPV.maxThrust / FPV.thrustCoeff)
    for (const w of r.rotor) {
      expect(w).toBeLessThan(omegaMax)
      expect(w / (omegaMax * (r.v / BATTERY.referenceVoltage))).toBeCloseTo(1, 1)
    }
  })
})

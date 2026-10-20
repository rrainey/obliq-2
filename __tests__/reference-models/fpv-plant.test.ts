/**
 * FPV quadcopter reference model, Phase 2 (plant): motors and 6-DOF frame.
 * Compiles the model to native C once and flies several open-loop motor
 * command scenarios, checking physical invariants and sign conventions.
 */

import * as fs from 'fs'
import * as path from 'path'
import { buildFpvModel, FPV, HOVER_COMMAND, OMEGA_MAX } from '../../scripts/build-fpv-reference-model'
import { cleanupNativeDir, compileAndRunNative } from '../support/nativeCgen'
import { validateMultiSheetTypeCompatibility } from '@/lib/multiSheetTypeValidator'

jest.setTimeout(180000)

const MODEL_FILE = path.join(__dirname, '../../reference-models/fpv-quadcopter.json')
const h = HOVER_COMMAND
const d = 0.03

/** name → per-motor command [RR, FR, RL, FL] */
const SCENARIOS: Record<string, number[]> = {
  hover: [h, h, h, h],
  off: [0, 0, 0, 0],
  rollRight: [h - d, h - d, h + d, h + d], // left motors up
  pitchUp: [h - d, h + d, h - d, h + d], // front motors up
  yawRight: [h - d, h + d, h + d, h - d], // CCW props (FR, RL) up
}

interface Row {
  t: number
  p: number[]
  v: number[]
  q: number[]
  e: number[]
  w: number[]
  a: number[]
  rotor: number[]
}

describe('FPV reference model: plant', () => {
  const runs: Record<string, Row[]> = {}
  let outDir: string | undefined

  beforeAll(() => {
    // High enough that 2 s of free fall stays clear of the ground
    const model = buildFpvModel({ openLoop: true, initialAltitude: 50 })
    const names = Object.keys(SCENARIOS)
    const cmds = names.map(n => `{${SCENARIOS[n]!.join(', ')}}`).join(',\n    ')
    const result = compileAndRunNative({
      modelName: 'fpv',
      sheets: (model.data as any).sheets,
      dt: FPV.dt,
      smokeMainBody: `
  static const double cmds[${names.length}][4] = {
    ${cmds}
  };
  for (int s = 0; s < ${names.length}; ++s) {
    fpv_init(&model, ${FPV.dt});
    for (int k = 0; k < 4; ++k) model.signals.MotorCmd[k] = cmds[s][k];
    fpv_seed_from_inputs(&model);
    for (int i = 0; i < (int)llround(2.0 / ${FPV.dt}); ++i) {
      fpv_step(&model);
      /* Outputs were published at the start of the step, at time - dt */
      const double t = model.time - model.dt;
      printf("%d %.6f", s, t);
      for (int k = 0; k < 3; ++k) printf(" %.12g", model.outputs.pos_ned[k]);
      for (int k = 0; k < 3; ++k) printf(" %.12g", model.outputs.vel_ned[k]);
      for (int k = 0; k < 4; ++k) printf(" %.12g", model.outputs.quat[k][0]);
      for (int k = 0; k < 3; ++k) printf(" %.12g", model.outputs.euler[k]);
      for (int k = 0; k < 3; ++k) printf(" %.12g", model.outputs.omega[k]);
      for (int k = 0; k < 3; ++k) printf(" %.12g", model.outputs.accel[k]);
      for (int k = 0; k < 4; ++k) printf(" %.12g", model.outputs.motor_omega[k]);
      printf("\\n");
    }
  }
  return 0;
`,
    })
    outDir = result.outDir
    for (const line of result.stdout.trim().split('\n')) {
      const n = line.split(' ').map(Number)
      const name = names[n[0]!]!
      ;(runs[name] ??= []).push({
        t: n[1]!,
        p: n.slice(2, 5),
        v: n.slice(5, 8),
        q: n.slice(8, 12),
        e: n.slice(12, 15),
        w: n.slice(15, 18),
        a: n.slice(18, 21),
        rotor: n.slice(21, 25),
      })
    }
  })

  afterAll(() => cleanupNativeDir(outDir))

  const at = (name: string, t: number) => runs[name]!.reduce((best, r) => (Math.abs(r.t - t) < Math.abs(best.t - t) ? r : best))

  it('the committed reference model matches the builder', () => {
    const committed = JSON.parse(fs.readFileSync(MODEL_FILE, 'utf8'))
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildFpvModel())))
  })

  it('validates in the editor with no errors or warnings (references and loop integrators are typed)', () => {
    const result = validateMultiSheetTypeCompatibility((buildFpvModel({ openLoop: true }).data as any).sheets)
    expect(result.errors.map(e => e.message)).toEqual([])
    expect(result.warnings.map(w => w.message)).toEqual([])
  })

  it('hover: rotors settle at sqrt(mg/4c) and thrust balances weight', () => {
    const r = at('hover', 1.5)
    const omegaHover = Math.sqrt((FPV.mass * FPV.gravity) / 4 / FPV.thrustCoeff)
    expect(omegaHover).toBeCloseTo(1084.6, 0)
    for (const w of r.rotor) expect(w).toBeCloseTo(omegaHover, 3)
    // Specific force = (thrust + drag)/m; remove the vertical drag term
    const thrustAccel = r.a[2]! + (FPV.linearDrag[2]! * r.v[2]!) / FPV.mass
    expect(thrustAccel).toBeCloseTo(-FPV.gravity, 4)
    // Level, not rotating, not drifting sideways
    for (const k of [0, 1]) expect(Math.abs(r.p[k]!)).toBeLessThan(1e-12)
    for (const x of [...r.e, ...r.w]) expect(Math.abs(x)).toBeLessThan(1e-12)
  })

  it('hover: after spin-up only drag decelerates the initial sink', () => {
    // dv/dt = -(k_z/m) v once thrust = weight
    const a = at('hover', 1.0), b = at('hover', 1.5)
    const decay = Math.log(a.v[2]! / b.v[2]!) / (b.t - a.t)
    expect(decay).toBeCloseTo(FPV.linearDrag[2]! / FPV.mass, 3)
  })

  it('motor lag: first-order response with time constant tau', () => {
    const target = h * OMEGA_MAX
    const r = at('hover', FPV.motorTau)
    expect(r.rotor[0]! / target).toBeCloseTo(1 - Math.exp(-1), 3)
  })

  it('motors off: free fall at g, slowed only by linear drag', () => {
    const r = at('off', 0.5)
    const k = FPV.linearDrag[2]! / FPV.mass
    // The accelerometer reads only drag: specific force = -k v
    expect(r.a[2]! + k * r.v[2]!).toBeCloseTo(0, 9)
    expect(Math.abs(r.a[0]!) + Math.abs(r.a[1]!)).toBeLessThan(1e-12)
    // v = (g/k)(1 - e^{-kt}); the drag loop closes through other blocks, so this
    // also checks that RK4 re-evaluates the algebra at each stage
    expect(r.v[2]! / ((FPV.gravity / k) * (1 - Math.exp(-k * r.t)))).toBeCloseTo(1, 10)
  })

  it('more thrust on the left rolls right and drifts east', () => {
    const r = at('rollRight', 0.3)
    expect(r.w[0]).toBeGreaterThan(0.5)
    expect(Math.abs(r.w[1]!)).toBeLessThan(1e-9)
    expect(Math.abs(r.w[2]!)).toBeLessThan(1e-9)
    expect(r.e[0]).toBeGreaterThan(0) // phi
    expect(r.v[1]).toBeGreaterThan(0) // east
  })

  it('more thrust at the front pitches nose-up and drifts backwards (south)', () => {
    const r = at('pitchUp', 0.3)
    expect(r.w[1]).toBeGreaterThan(0.5)
    expect(Math.abs(r.w[0]!)).toBeLessThan(1e-9)
    expect(Math.abs(r.w[2]!)).toBeLessThan(1e-9)
    expect(r.e[1]).toBeGreaterThan(0) // theta, nose up
    expect(r.v[0]).toBeLessThan(0) // thrust tilts back: moves south
  })

  it('more thrust on the CCW props yaws right (nose right, clockwise from above)', () => {
    const r = at('yawRight', 0.3)
    expect(r.w[2]).toBeGreaterThan(0.05)
    expect(Math.abs(r.w[0]!)).toBeLessThan(1e-9)
    expect(Math.abs(r.w[1]!)).toBeLessThan(1e-9)
    expect(r.e[2]).toBeGreaterThan(0) // psi
  })

  it('initial angular acceleration matches the moment arms and inertia', () => {
    // At t=0.3 s the rotor speeds have settled to within e^-9; the change in
    // roll rate over a short window gives p_dot = dMx / Jxx.
    const a = at('rollRight', 0.3), b = at('rollRight', 0.32)
    const pDot = (b.w[0]! - a.w[0]!) / (b.t - a.t)
    const thrust = (c: number) => FPV.maxThrust * c * c
    const dMx = 2 * 0.1 * (thrust(h + d) - thrust(h - d))
    expect(pDot / (dMx / FPV.inertia[0]!)).toBeCloseTo(1, 2)
  })

  it('the published quaternion stays a unit quaternion while spinning up to tens of rad/s', () => {
    for (const name of ['rollRight', 'pitchUp', 'yawRight']) {
      const r = runs[name]![runs[name]!.length - 1]!
      expect(Math.abs(Math.hypot(...r.q) - 1)).toBeLessThan(1e-12)
    }
  })

  it('a pure yaw spin integrates attitude consistently with the rate', () => {
    // Only r is non-zero, so psi(t) = integral of r dt (wrapped to ±pi)
    const rows = runs['yawRight']!.filter(r => r.t <= 0.6)
    let psi = 0
    for (let i = 1; i < rows.length; i++) psi += 0.5 * (rows[i]!.w[2]! + rows[i - 1]!.w[2]!) * (rows[i]!.t - rows[i - 1]!.t)
    expect(rows[rows.length - 1]!.e[2]).toBeCloseTo(psi, 2)
  })
})

/**
 * Builds reference-models/fpv-quadcopter.json, the FPV quadcopter reference
 * model. See docs/fpv-reference-model-plan.md for the design, parameters and
 * sources.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/build-fpv-reference-model.ts [out.json]
 *
 * The model is generated rather than drawn so it stays reviewable and
 * reproducible: parameters live in one place below, and the diagram is laid
 * out with the same algorithm as Tune Model Layout.
 *
 * Conventions: NED world frame, FRD body frame (x forward, y right, z down),
 * scalar-first quaternion q (body attitude; quat_to_dcm gives C_bn, which
 * maps NED vectors into the body frame). Motors are numbered as in
 * Betaflight's quad X: 0 rear-right, 1 front-right, 2 rear-left, 3 front-left.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'
import type { Sheet } from '@/lib/simulationTypes'
import { tuneModelLayout, DEFAULT_TUNE_OPTIONS } from '@/lib/layout/tuneModelLayout'

// ---------------------------------------------------------------------------
// Parameters (kingfisher 5-inch, agile_flight MIT; see the plan for sources)

export const FPV = {
  mass: 0.75, // kg
  inertia: [2.5e-3, 2.1e-3, 4.3e-3], // kg m^2, principal axes
  gravity: 9.80665, // m/s^2
  /** Rotor positions in the body frame [x, y] (m), motor order RR, FR, RL, FL. */
  rotorXY: [
    [-0.0775, 0.1],
    [0.0775, 0.1],
    [-0.0775, -0.1],
    [0.0775, -0.1],
  ],
  /** Sign of each rotor's reaction torque about body z: +1 for props spinning CCW seen from above. */
  rotorYawSign: [-1, 1, 1, -1],
  thrustCoeff: 1.563e-6, // N/(rad/s)^2
  torqueToThrust: 0.0122, // m (kappa = c_d / c_l)
  motorTau: 0.033, // s
  maxThrust: 8.5, // N per motor
  linearDrag: [0.3, 0.3, 0.15], // N s/m, body axes
  dt: 0.0005, // s, model (plant) step: 2 kHz
}

/**
 * Betaflight-style flight controller. Behaviour and default values follow
 * Betaflight 4.x documentation (GPL-3; no code is translated). Gains are the
 * firmware's integer values; the scale factors convert them to its internal
 * units (rates in deg/s, PID sum in per-mille of motor range).
 */
export const FC = {
  /** Controller (PID loop) period: 1 kHz. Must be a multiple of FPV.dt. */
  ts: 0.001,
  /** Rates ("Actual"): center sensitivity, max rate (deg/s), expo; roll, pitch, yaw. */
  rates: { center: [70, 70, 70], max: [670, 670, 670], expo: [0, 0, 0] },
  /** P, I, D, FF per axis [roll, pitch, yaw]. */
  pid: { p: [45, 47, 45], i: [80, 84, 80], d: [30, 34, 0], ff: [120, 125, 120] },
  /** Per-unit scale of each gain. Betaflight's FF coefficient is FEEDFORWARD_SCALE * (F / 100). */
  scale: { p: 0.032029, i: 0.244381, d: 0.000529, ff: 0.013754 / 100 },
  itermLimit: 400,
  pidSumLimit: [500, 500, 400],
  /** PID sum is per-mille of the motor range. */
  mixerScaling: 1000,
  gyroLpfHz: [250, 500],
  dtermLpfHz: 150,
  /** Digital idle: lowest motor output while armed. */
  motorIdle: 0.055,
}

/**
 * Sensor models. Noise values are datasheet figures (TDK ICM-42688-P, iSentek
 * IST8310, Bosch BMP280); turn-on biases and the magnetic field are
 * representative values (est.), not measurements.
 */
export const SENSORS = {
  imu: { ts: 0.001 },
  gyro: {
    /** rad/s/√Hz (2.8 mdps/√Hz) */
    density: 2.8e-3 * (Math.PI / 180),
    /** rad/s, turn-on bias (est. ~0.1–0.3 dps) */
    bias: [0.3, -0.2, 0.1].map(d => d * (Math.PI / 180)),
    /** ±2000 dps, 16-bit */
    range: 2000 * (Math.PI / 180),
    lsb: (4000 / 65536) * (Math.PI / 180),
    seed: 101,
  },
  accel: {
    /** m/s²/√Hz (70 µg/√Hz) */
    density: 70e-6 * 9.80665,
    /** m/s², turn-on bias (est. ~2–5 mg) */
    bias: [0.02, -0.03, 0.05],
    /** ±16 g, 16-bit */
    range: 16 * 9.80665,
    lsb: (32 * 9.80665) / 65536,
    seed: 102,
  },
  mag: {
    ts: 0.01,
    /** µT in NED: a representative mid-latitude field (est.; use WMM2025 for a real site). */
    field: [21.0, 1.5, 44.0],
    /** µT hard-iron offset (est.) */
    hardIron: [3.0, -2.0, 1.0],
    /** µT RMS */
    noise: 0.4,
    lsb: 0.3,
    seed: 103,
  },
  baro: {
    ts: 0.02,
    /** m above MSL at the NED origin */
    homeAltitude: 500,
    /** Pa RMS */
    noise: 1.3,
    /** s, first-order sensor/filter lag */
    lag: 0.03,
    seed: 104,
  },
}

/** ISA troposphere: p = p0 (1 - L h)^n and its inverse. */
const ISA = { p0: 101325, l: 2.25577e-5, n: 5.25588 }
export const isaPressure = (h: number) => ISA.p0 * Math.pow(1 - ISA.l * h, ISA.n)

/** Estimators (in the flight controller, at FC.ts). */
export const ESTIMATOR = {
  /** Mahony proportional gain, 1/s (Betaflight imu_dcm_kp 2500 / 10000). */
  mahonyKp: 0.25,
  /** Altitude complementary filter: natural frequency (rad/s) and damping. */
  altOmega: 1.0,
  altZeta: 1.0,
}

/**
 * Quad-X mixer [roll, pitch, yaw] per motor (RR, FR, RL, FL), in FRD axes:
 * +roll raises the left motors, +pitch (nose up) the front motors, +yaw (nose
 * right) the CCW props. Betaflight's own table uses its pitch sign convention,
 * so its pitch column is the negative of this one.
 */
export const MIXER = [
  [-1, -1, -1],
  [-1, 1, 1],
  [1, -1, 1],
  [1, 1, -1],
]

/** 1/s: rate at which the quaternion state is pulled back to unit norm (Euler-stable for k·dt < 2). */
const QUAT_NORM_GAIN = 10

/** Rotor speed at full command, so that full command gives maxThrust. */
export const OMEGA_MAX = Math.sqrt(FPV.maxThrust / FPV.thrustCoeff)
/** Per-motor command that holds hover: thrust = m g / 4, and thrust ∝ command². */
export const HOVER_COMMAND = Math.sqrt((FPV.mass * FPV.gravity) / 4 / FPV.maxThrust)
/** Throttle stick that gives the hover command through idle + (1 - idle)·throttle. */
export const HOVER_THROTTLE = (HOVER_COMMAND - FC.motorIdle) / (1 - FC.motorIdle)

/** Piecewise-linear stick inputs over time: [time s, value] pairs per axis. */
export interface StickProfile {
  roll: Array<[number, number]>
  pitch: Array<[number, number]>
  yaw: Array<[number, number]>
  throttle: Array<[number, number]>
}

/** Demo flight: roll doublet, pitch doublet, then a yaw step, at hover throttle. */
export const DEMO_STICKS: StickProfile = {
  roll: [[0, 0], [1.0, 0], [1.05, 0.5], [1.5, 0.5], [1.55, -0.5], [2.0, -0.5], [2.05, 0]],
  pitch: [[0, 0], [2.5, 0], [2.55, 0.5], [3.0, 0.5], [3.05, -0.5], [3.5, -0.5], [3.55, 0]],
  yaw: [[0, 0], [4.0, 0], [4.05, 0.5], [4.5, 0.5], [4.55, 0]],
  throttle: [[0, Number(HOVER_THROTTLE.toFixed(4))]],
}

// ---------------------------------------------------------------------------
// Sheet construction helpers

class SheetBuilder {
  blocks: BlockData[] = []
  connections: WireData[] = []
  constructor(readonly id: string, readonly name: string) {}

  /** Add a block; returns its id (the sheet id plus the block name). */
  add(type: string, name: string, parameters: Record<string, unknown> = {}): string {
    const id = `${this.id}__${name}`.replace(/[^A-Za-z0-9_]/g, '_')
    if (this.blocks.some(b => b.id === id)) throw new Error(`Duplicate block ${name} on ${this.name}`)
    this.blocks.push({ id, type, name, position: { x: 0, y: 0 }, parameters: { showName: true, ...parameters } } as BlockData)
    return id
  }

  wire(from: string, to: string, toPort = 0, fromPort = 0): void {
    this.connections.push({
      id: `w_${this.connections.length + 1}_${from}_${to}`.slice(0, 120),
      sourceBlockId: from,
      sourcePortIndex: fromPort,
      targetBlockId: to,
      targetPortIndex: toPort,
    })
  }

  input(name: string, dataType: string): string {
    return this.add('input_port', name, { portName: name, dataType })
  }

  output(name: string, from: string, dataType: string, fromPort = 0): string {
    const id = this.add('output_port', name, { portName: name, dataType })
    this.wire(from, id, 0, fromPort)
    return id
  }

  constant(name: string, value: unknown, dataType: string): string {
    return this.add('source', name, { signalType: 'constant', value, dataType })
  }

  sheet(): Sheet {
    return { id: this.id, name: this.name, blocks: this.blocks, connections: this.connections, extents: { width: 1200, height: 800 } }
  }
}

const subsystem = (
  inputPorts: string[],
  outputPorts: string[],
  body: SheetBuilder,
  extra: Record<string, unknown> = {}
) => ({ inputPorts, outputPorts, showPortNames: true, codeGenStrategy: 'flatten', sheets: [body.sheet()], ...extra })

/** Block sizes so port labels stay legible. */
const MOTOR_SIZE = { width: 140, height: 80 }
const FRAME_SIZE = { width: 160, height: 260 }
const FC_SIZE = { width: 180, height: 180 }
const SENSORS_SIZE = { width: 170, height: 150 }
const FC_OUTPUTS = ['motors', 'setpoint', 'gyro_dps', 'euler_est', 'altitude_est', 'quat_est']

// ---------------------------------------------------------------------------
// Motor / ESC / propeller (one definition, referenced by the other three)

function buildMotorSheet(): SheetBuilder {
  const s = new SheetBuilder('motor', 'Motor')
  const cmd = s.input('cmd', 'double')
  const clamp = s.add('limit', 'CmdLimit', { lowerLimit: 0, upperLimit: 1 })
  s.wire(cmd, clamp)
  const omegaCmd = s.add('scale', 'OmegaMax', { gain: OMEGA_MAX })
  s.wire(clamp, omegaCmd)
  // First-order rotor-speed lag: omega / omega_cmd = 1 / (tau s + 1)
  const lag = s.add('transfer_function', 'MotorLag', { numerator: [1], denominator: [FPV.motorTau, 1] })
  s.wire(omegaCmd, lag)
  const sq = s.add('square', 'OmegaSq')
  s.wire(lag, sq)
  const thrust = s.add('scale', 'ThrustCoeff', { gain: FPV.thrustCoeff })
  s.wire(sq, thrust)
  s.output('omega', lag, 'double')
  s.output('thrust', thrust, 'double')
  return s
}

// ---------------------------------------------------------------------------
// Rigid body: 6-DOF, quaternion attitude

function buildFrameSheet(initialOmega: number[] = [0, 0, 0]): SheetBuilder {
  const s = new SheetBuilder('frame', 'Frame')
  const { mass, inertia, gravity, rotorXY, rotorYawSign, torqueToThrust, linearDrag } = FPV
  const T = s.input('thrust', 'double[4]')

  // Rotor forces and moments from the four thrusts (allocation matrices)
  const Bf = s.constant('ThrustDirection', [[0, 0, 0, 0], [0, 0, 0, 0], [-1, -1, -1, -1]], 'double[3][4]')
  const Bm = s.constant(
    'MomentArms',
    [
      rotorXY.map(([, y]) => -y), // Mx = -y T (thrust acts along -z)
      rotorXY.map(([x]) => x), // My = x T
      rotorYawSign.map(sg => sg * torqueToThrust), // Mz = ±kappa T
    ],
    'double[3][4]'
  )
  const fThrust = s.add('matrix_multiply', 'RotorForce')
  s.wire(Bf, fThrust, 0)
  s.wire(T, fThrust, 1)
  const mRotor = s.add('matrix_multiply', 'RotorMoment')
  s.wire(Bm, mRotor, 0)
  s.wire(T, mRotor, 1)

  // Attitude. Numerical integration does not preserve |q| = 1 exactly, so the
  // quaternion is renormalized: everything downstream uses q_n = q/|q|, and
  // q_dot pulls the state back to unit norm.
  const q = s.add('integrator', 'q', { initialValue: [[1], [0], [0], [0]] })
  const qNorm = s.add('mag', 'qNorm')
  s.wire(q, qNorm)
  const qn = s.add('divide', 'q_n')
  s.wire(q, qn, 0)
  s.wire(qNorm, qn, 1)
  const Cbn = s.add('orientation_conversion', 'C_bn', { conversionType: 'quat_to_dcm' })
  s.wire(qn, Cbn)
  const Cnb = s.add('transpose', 'C_nb')
  s.wire(Cbn, Cnb)

  // Translation: body-axis linear drag, rotate to NED, add gravity
  const vNed = s.add('integrator', 'v_ned', { initialValue: [0, 0, 0] })
  const vBody = s.add('matrix_multiply', 'v_body')
  s.wire(Cbn, vBody, 0)
  s.wire(vNed, vBody, 1)
  const kd = s.constant('DragCoeff', linearDrag.map(k => -k), 'double[3]')
  const fDrag = s.add('multiply', 'DragForce', { numInputs: 2 })
  s.wire(vBody, fDrag, 0)
  s.wire(kd, fDrag, 1)
  const fBody = s.add('sum', 'F_body', { signs: '++', numInputs: 2 })
  s.wire(fThrust, fBody, 0)
  s.wire(fDrag, fBody, 1)
  const fNed = s.add('matrix_multiply', 'F_ned')
  s.wire(Cnb, fNed, 0)
  s.wire(fBody, fNed, 1)
  const aForce = s.add('scale', 'InvMass', { gain: 1 / mass })
  s.wire(fNed, aForce)
  const g = s.constant('Gravity', [0, 0, gravity], 'double[3]')
  const aNed = s.add('sum', 'a_ned', { signs: '++', numInputs: 2 })
  s.wire(aForce, aNed, 0)
  s.wire(g, aNed, 1)
  s.wire(aNed, vNed)
  const pNed = s.add('integrator', 'p_ned', { initialValue: [0, 0, 0] })
  s.wire(vNed, pNed)
  // Specific force in body axes (what an accelerometer measures)
  const fSpecific = s.add('scale', 'SpecificForce', { gain: 1 / mass })
  s.wire(fBody, fSpecific)

  // Rotation: J w_dot = M - w x (J w)
  const omega = s.add('integrator', 'omega_body', { initialValue: initialOmega })
  const J = s.constant('Inertia', inertia, 'double[3]')
  const Jw = s.add('multiply', 'Jw', { numInputs: 2 })
  s.wire(J, Jw, 0)
  s.wire(omega, Jw, 1)
  const gyro = s.add('cross', 'GyroTorque')
  s.wire(omega, gyro, 0)
  s.wire(Jw, gyro, 1)
  const mNet = s.add('sum', 'M_net', { signs: '+-', numInputs: 2 })
  s.wire(mRotor, mNet, 0)
  s.wire(gyro, mNet, 1)
  const wDot = s.add('divide', 'omega_dot')
  s.wire(mNet, wDot, 0)
  s.wire(J, wDot, 1)
  s.wire(wDot, omega)

  // Quaternion kinematics: q_dot = 1/2 q ⊗ [0, w]
  const pqr = s.add('demux', 'pqr', { outputCount: 3, inputDimensions: [3] })
  s.wire(omega, pqr)
  const qDot = s.add('body2quaternion_rates', 'q_dot')
  s.wire(qn, qDot, 0)
  s.wire(pqr, qDot, 1, 0)
  s.wire(pqr, qDot, 2, 1)
  s.wire(pqr, qDot, 3, 2)
  const qErr = s.add('sum', 'qNormError', { signs: '+-', numInputs: 2 })
  s.wire(qn, qErr, 0)
  s.wire(q, qErr, 1)
  const qFix = s.add('scale', 'qNormGain', { gain: QUAT_NORM_GAIN })
  s.wire(qErr, qFix)
  const qDotTotal = s.add('sum', 'q_dot_total', { signs: '++', numInputs: 2 })
  s.wire(qDot, qDotTotal, 0)
  s.wire(qFix, qDotTotal, 1)
  s.wire(qDotTotal, q)

  const euler = s.add('orientation_conversion', 'Euler', { conversionType: 'quat_to_euler' })
  s.wire(qn, euler)

  s.output('pos_ned', pNed, 'double[3]')
  s.output('vel_ned', vNed, 'double[3]')
  s.output('quat', qn, 'double[4][1]')
  s.output('euler', euler, 'double[3]')
  s.output('omega', omega, 'double[3]')
  s.output('accel', fSpecific, 'double[3]')
  return s
}


// ---------------------------------------------------------------------------
// Pilot: scripted sticks [roll, pitch, yaw, throttle]

function buildPilotSheet(sticks: StickProfile): SheetBuilder {
  const s = new SheetBuilder('pilot', 'Pilot')
  const clock = s.add('clock', 'Time')
  const mux = s.add('mux', 'Sticks', { rows: 4, cols: 1, baseType: 'double', outputType: 'double[4]' })
  const axes: Array<[keyof StickProfile, string]> = [['roll', 'RollStick'], ['pitch', 'PitchStick'], ['yaw', 'YawStick'], ['throttle', 'ThrottleStick']]
  axes.forEach(([axis, name], i) => {
    const pts = sticks[axis].length > 1 ? sticks[axis] : [sticks[axis][0]!, [sticks[axis][0]![0] + 1, sticks[axis][0]![1]] as [number, number]]
    const lut = s.add('lookup_1d', name, {
      inputValues: pts.map(p => p[0]),
      outputValues: pts.map(p => p[1]),
      extrapolation: 'clamp',
    })
    s.wire(clock, lut)
    s.wire(lut, mux, i)
  })
  s.output('sticks', mux, 'double[4]')
  return s
}


// ---------------------------------------------------------------------------
// Sensors (read the true plant state; ideal = no noise, bias or quantization)

function noise(s: SheetBuilder, name: string, width: number, params: Record<string, unknown>): string {
  return s.add('random_noise', name, { distribution: 'gaussian', mean: 0, sampleTime: 0, dataType: width > 1 ? `double[${width}]` : 'double', ...params })
}

/** y = clamp(quantize(x + bias + noise)), or y = x when ideal. */
function corrupt(
  s: SheetBuilder,
  prefix: string,
  x: string,
  width: number,
  opts: { bias?: number[]; noise: Record<string, unknown>; lsb: number; range?: number },
  ideal: boolean
): string {
  if (ideal) return x
  const parts = [x]
  if (opts.bias) parts.push(s.constant(`${prefix}Bias`, opts.bias, `double[${width}]`))
  parts.push(noise(s, `${prefix}Noise`, width, opts.noise))
  const sum = s.add('sum', `${prefix}Sum`, { signs: '+'.repeat(parts.length), numInputs: parts.length })
  parts.forEach((id, i) => s.wire(id, sum, i))
  const q = s.add('quantizer', `${prefix}Quantize`, { quantum: opts.lsb })
  s.wire(sum, q)
  if (opts.range === undefined) return q
  const lim = s.add('limit', `${prefix}Range`, { lowerLimit: -opts.range, upperLimit: opts.range })
  s.wire(q, lim)
  return lim
}

function buildImuSheet(ideal: boolean): SheetBuilder {
  const s = new SheetBuilder('imu', 'IMU')
  const w = s.input('omega', 'double[3]')
  const f = s.input('specific_force', 'double[3]')
  const g = SENSORS.gyro, a = SENSORS.accel
  const gyro = corrupt(s, 'Gyro', w, 3, { bias: g.bias, noise: { amplitudeMode: 'density', noiseDensity: g.density, seed: g.seed }, lsb: g.lsb, range: g.range }, ideal)
  const acc = corrupt(s, 'Accel', f, 3, { bias: a.bias, noise: { amplitudeMode: 'density', noiseDensity: a.density, seed: a.seed }, lsb: a.lsb, range: a.range }, ideal)
  s.output('gyro', gyro, 'double[3]')
  s.output('accel', acc, 'double[3]')
  return s
}

function buildMagSheet(ideal: boolean): SheetBuilder {
  const s = new SheetBuilder('magn', 'Magnetometer')
  const q = s.input('quat', 'double[4][1]')
  const m = SENSORS.mag
  const cbn = s.add('orientation_conversion', 'C_bn', { conversionType: 'quat_to_dcm' })
  s.wire(q, cbn)
  const field = s.constant('EarthField', m.field, 'double[3]')
  const body = s.add('matrix_multiply', 'FieldInBody')
  s.wire(cbn, body, 0)
  s.wire(field, body, 1)
  const out = corrupt(s, 'Mag', body, 3, { bias: m.hardIron, noise: { stdDev: m.noise, seed: m.seed }, lsb: m.lsb }, ideal)
  s.output('mag', out, 'double[3]')
  return s
}

function buildBaroSheet(ideal: boolean): SheetBuilder {
  const s = new SheetBuilder('baro', 'Barometer')
  const pos = s.input('pos_ned', 'double[3]')
  const b = SENSORS.baro
  const down = s.add('selector', 'Down', { indices: [2] })
  s.wire(pos, down)
  // ISA troposphere pressure at the geometric altitude home - down
  const p = s.add('evaluate', 'ISAPressure', {
    numInputs: 1,
    expression: `${ISA.p0} * pow(1.0 - ${ISA.l} * (${b.homeAltitude} - in(0)), ${ISA.n})`,
  })
  s.wire(down, p)
  if (ideal) {
    s.output('pressure', p, 'double')
    return s
  }
  const n = noise(s, 'BaroNoise', 1, { stdDev: b.noise, seed: b.seed })
  const sum = s.add('sum', 'BaroSum', { signs: '++', numInputs: 2 })
  s.wire(p, sum, 0)
  s.wire(n, sum, 1)
  // First-order lag y += a (u - y), starting at the home pressure so the
  // sensor does not power up reading vacuum
  const a = b.ts / (b.lag + b.ts)
  const prev = s.add('unit_delay', 'BaroPrev', { initialValue: Number(isaPressure(b.homeAltitude).toFixed(3)), sampleInterval: b.ts })
  const lag = s.add('evaluate', 'BaroLag', { numInputs: 2, expression: `in(1) + ${a} * (in(0) - in(1))` })
  s.wire(sum, lag, 0)
  s.wire(prev, lag, 1)
  s.wire(lag, prev)
  s.output('pressure', lag, 'double')
  return s
}

function buildSensorsSheet(ideal: boolean): SheetBuilder {
  const s = new SheetBuilder('sensors', 'Sensors')
  const pos = s.input('pos_ned', 'double[3]')
  const quat = s.input('quat', 'double[4][1]')
  const omega = s.input('omega', 'double[3]')
  const force = s.input('specific_force', 'double[3]')
  const imu = s.add('subsystem', 'IMU', { ...subsystem(['omega', 'specific_force'], ['gyro', 'accel'], buildImuSheet(ideal)), sampleTimeSec: SENSORS.imu.ts })
  s.wire(omega, imu, 0)
  s.wire(force, imu, 1)
  const mag = s.add('subsystem', 'Magnetometer', { ...subsystem(['quat'], ['mag'], buildMagSheet(ideal)), sampleTimeSec: SENSORS.mag.ts })
  s.wire(quat, mag)
  const baro = s.add('subsystem', 'Barometer', { ...subsystem(['pos_ned'], ['pressure'], buildBaroSheet(ideal)), sampleTimeSec: SENSORS.baro.ts })
  s.wire(pos, baro)
  s.output('gyro', imu, 'double[3]', 0)
  s.output('accel', imu, 'double[3]', 1)
  s.output('mag', mag, 'double[3]')
  s.output('pressure', baro, 'double')
  return s
}

// ---------------------------------------------------------------------------
// Estimators

/** Normalize a vector or column vector: v / |v|. Returns the unit vector and the magnitude block. */
function normalizeWithNorm(s: SheetBuilder, name: string, v: string): { unit: string; norm: string } {
  const norm = s.add('mag', `${name}Norm`)
  s.wire(v, norm)
  const unit = s.add('divide', name)
  s.wire(v, unit, 0)
  s.wire(norm, unit, 1)
  return { unit, norm }
}

const normalize = (s: SheetBuilder, name: string, v: string) => normalizeWithNorm(s, name, v).unit

/**
 * Mahony explicit complementary filter (Mahony, Hamel & Pflimlin 2008):
 * w_c = w_gyro + Kp (a x v_a + ((m x v_m) . v_a) v_a), q+ = norm(q + Ts/2 q ⊗ [0, w_c]).
 * The magnetometer correction is projected on the estimated vertical so it
 * only corrects yaw. A multirotor's accelerometer mostly sees thrust along
 * body -z, so tilted flight pulls the estimate toward level; that drift (the
 * familiar FPV horizon drift) is real behaviour, not a modelling error.
 */
function buildAttitudeEstimatorSheet(): SheetBuilder {
  const s = new SheetBuilder('att', 'AttitudeEstimator')
  const gyro = s.input('gyro', 'double[3]')
  const acc = s.input('accel', 'double[3]')
  const mag = s.input('mag', 'double[3]')
  const qPrev = s.add('unit_delay', 'qPrev', { initialValue: [[1], [0], [0], [0]], sampleInterval: FC.ts })
  const cbn = s.add('orientation_conversion', 'C_bn', { conversionType: 'quat_to_dcm' })
  s.wire(qPrev, cbn)

  // Gravity: the accelerometer measures "up" (specific force opposes gravity)
  const upRef = s.constant('UpNED', [0, 0, -1], 'double[3]')
  const upEst = s.add('matrix_multiply', 'UpEstimated')
  s.wire(cbn, upEst, 0)
  s.wire(upRef, upEst, 1)
  const { unit: upMeas, norm: accNorm } = normalizeWithNorm(s, 'UpMeasured', acc)
  const eAccRaw = s.add('cross', 'AccelError')
  s.wire(upMeas, eAccRaw, 0)
  s.wire(upEst, eAccRaw, 1)
  // As in Betaflight, trust the accelerometer only while it reads about 1 g
  const g = FPV.gravity
  const accOk = s.add('evaluate', 'AccelHealthy', {
    numInputs: 1,
    expression: `(in(0) > ${(0.9 * g).toFixed(5)} && in(0) < ${(1.1 * g).toFixed(5)}) ? 1.0 : 0.0`,
  })
  s.wire(accNorm, accOk)
  const eAcc = s.add('multiply', 'AccelErrorGated', { numInputs: 2 })
  s.wire(eAccRaw, eAcc, 0)
  s.wire(accOk, eAcc, 1)

  // Heading: compare measured and predicted field directions, yaw part only
  const m = SENSORS.mag.field
  const mn = Math.hypot(...m)
  const fieldRef = s.constant('FieldDirectionNED', m.map(x => x / mn), 'double[3]')
  const fieldEst = s.add('matrix_multiply', 'FieldEstimated')
  s.wire(cbn, fieldEst, 0)
  s.wire(fieldRef, fieldEst, 1)
  const fieldMeas = normalize(s, 'FieldMeasured', mag)
  const eMag = s.add('cross', 'MagError')
  s.wire(fieldMeas, eMag, 0)
  s.wire(fieldEst, eMag, 1)
  const yawPart = s.add('dot', 'MagErrorAlongUp')
  s.wire(eMag, yawPart, 0)
  s.wire(upEst, yawPart, 1)
  const eYaw = s.add('multiply', 'MagYawError', { numInputs: 2 })
  s.wire(upEst, eYaw, 0)
  s.wire(yawPart, eYaw, 1)

  const err = s.add('sum', 'Error', { signs: '++', numInputs: 2 })
  s.wire(eAcc, err, 0)
  s.wire(eYaw, err, 1)
  const kp = s.add('scale', 'Kp', { gain: ESTIMATOR.mahonyKp })
  s.wire(err, kp)
  const wc = s.add('sum', 'CorrectedRate', { signs: '++', numInputs: 2 })
  s.wire(gyro, wc, 0)
  s.wire(kp, wc, 1)

  const pqr = s.add('demux', 'pqr', { outputCount: 3, inputDimensions: [3] })
  s.wire(wc, pqr)
  const qDot = s.add('body2quaternion_rates', 'q_dot')
  s.wire(qPrev, qDot, 0)
  s.wire(pqr, qDot, 1, 0)
  s.wire(pqr, qDot, 2, 1)
  s.wire(pqr, qDot, 3, 2)
  const step = s.add('scale', 'Ts', { gain: FC.ts })
  s.wire(qDot, step)
  const qSum = s.add('sum', 'qIntegrate', { signs: '++', numInputs: 2 })
  s.wire(qPrev, qSum, 0)
  s.wire(step, qSum, 1)
  const q = normalize(s, 'q', qSum)
  s.wire(q, qPrev)

  const euler = s.add('orientation_conversion', 'Euler', { conversionType: 'quat_to_euler' })
  s.wire(q, euler)
  s.output('quat', q, 'double[4][1]')
  s.output('euler', euler, 'double[3]')
  return s
}

/**
 * Vertical complementary filter: integrates the accelerometer's vertical
 * acceleration (rotated with the attitude estimate) and corrects with the
 * barometric altitude through gains k1 = 2 zeta w, k2 = w^2.
 */
function buildAltitudeEstimatorSheet(): SheetBuilder {
  const s = new SheetBuilder('alt', 'AltitudeEstimator')
  const acc = s.input('accel', 'double[3]')
  const q = s.input('quat', 'double[4][1]')
  const p = s.input('pressure', 'double')
  const { altOmega: w, altZeta: z } = ESTIMATOR
  const k1 = 2 * z * w, k2 = w * w, ts = FC.ts

  const baroAlt = s.add('evaluate', 'BaroAltitude', {
    numInputs: 1,
    expression: `(1.0 - pow(in(0) / ${ISA.p0}, ${1 / ISA.n})) / ${ISA.l}`,
  })
  s.wire(p, baroAlt)

  const cbn = s.add('orientation_conversion', 'C_bn', { conversionType: 'quat_to_dcm' })
  s.wire(q, cbn)
  const cnb = s.add('transpose', 'C_nb')
  s.wire(cbn, cnb)
  const fNed = s.add('matrix_multiply', 'ForceNED')
  s.wire(cnb, fNed, 0)
  s.wire(acc, fNed, 1)
  const fDown = s.add('selector', 'ForceDown', { indices: [2] })
  s.wire(fNed, fDown)
  const aUp = s.add('evaluate', 'AccelUp', { numInputs: 1, expression: `-(in(0) + ${FPV.gravity})` })
  s.wire(fDown, aUp)

  const hPrev = s.add('unit_delay', 'hPrev', { initialValue: SENSORS.baro.homeAltitude, sampleInterval: ts })
  const vPrev = s.add('unit_delay', 'vPrev', { initialValue: 0, sampleInterval: ts })
  const v = s.add('evaluate', 'ClimbRate', { numInputs: 4, expression: `in(0) + ${ts} * (in(1) + ${k2} * (in(2) - in(3)))` })
  s.wire(vPrev, v, 0)
  s.wire(aUp, v, 1)
  s.wire(baroAlt, v, 2)
  s.wire(hPrev, v, 3)
  const h = s.add('evaluate', 'Altitude', { numInputs: 3, expression: `in(0) + ${ts} * (in(1) + ${k1} * (in(2) - in(0)))` })
  s.wire(hPrev, h, 0)
  s.wire(vPrev, h, 1)
  s.wire(baroAlt, h, 2)
  s.wire(v, vPrev)
  s.wire(h, hPrev)
  s.output('altitude', h, 'double')
  s.output('climb_rate', v, 'double')
  return s
}

// ---------------------------------------------------------------------------
// Flight controller (acro), all at FC.ts

const pt1Gain = (hz: number, ts: number) => ts / (1 / (2 * Math.PI * hz) + ts)

/** PT1 low-pass as a discrete transfer function: y[k] = a u[k] + (1 - a) y[k-1]. */
function pt1(s: SheetBuilder, name: string, hz: number): string {
  const a = pt1Gain(hz, FC.ts)
  return s.add('discrete_transform', name, { numerator: [a, 0], denominator: [1, -(1 - a)], sampleInterval: FC.ts })
}

/** Backward difference (u[k] - u[k-1]) / Ts. */
function derivative(s: SheetBuilder, name: string): string {
  return s.add('discrete_transform', name, { numerator: [1, -1], denominator: [FC.ts, 0], sampleInterval: FC.ts })
}

const perAxis = (gains: number[], scale: number) => gains.map(g => g * scale)

function buildRatesSheet(): SheetBuilder {
  const s = new SheetBuilder('rates', 'Rates')
  const sticks = s.input('sticks', 'double[4]')
  const split = s.add('demux', 'StickSplit', { outputCount: 4, inputDimensions: [4] })
  s.wire(sticks, split)
  const setpoint = s.add('mux', 'Setpoint', { rows: 3, cols: 1, baseType: 'double', outputType: 'double[3]' })
  ;['Roll', 'Pitch', 'Yaw'].forEach((axis, i) => {
    const c = FC.rates.center[i]!, m = FC.rates.max[i]!, e = FC.rates.expo[i]!
    // Betaflight "Actual" rates: center*s + max(0, max - center) * |s| * (s^5 e + s (1 - e))
    const expr = `${c} * in(0) + ${Math.max(0, m - c)} * fabs(in(0)) * (pow(in(0), 5) * ${e} + in(0) * ${1 - e})`
    const ev = s.add('evaluate', `${axis}Rate`, { numInputs: 1, expression: expr })
    s.wire(split, ev, 0, i)
    s.wire(ev, setpoint, i)
  })
  s.output('setpoint', setpoint, 'double[3]')
  s.output('throttle', split, 'double', 3)
  return s
}

function buildGyroFilterSheet(): SheetBuilder {
  const s = new SheetBuilder('gyro', 'GyroFilters')
  const gyro = s.input('gyro', 'double[3]')
  const deg = s.add('scale', 'RadToDeg', { gain: 180 / Math.PI })
  s.wire(gyro, deg)
  const lpf1 = pt1(s, 'GyroLPF1', FC.gyroLpfHz[0]!)
  s.wire(deg, lpf1)
  const lpf2 = pt1(s, 'GyroLPF2', FC.gyroLpfHz[1]!)
  s.wire(lpf1, lpf2)
  s.output('gyro_dps', lpf2, 'double[3]')
  return s
}

function buildRatePidSheet(): SheetBuilder {
  const s = new SheetBuilder('pid', 'RatePID')
  const sp = s.input('setpoint', 'double[3]')
  const gyro = s.input('gyro_dps', 'double[3]')

  const err = s.add('sum', 'RateError', { signs: '+-', numInputs: 2 })
  s.wire(sp, err, 0)
  s.wire(gyro, err, 1)

  // P
  const kp = s.constant('Kp', perAxis(FC.pid.p, FC.scale.p), 'double[3]')
  const pTerm = s.add('multiply', 'P', { numInputs: 2 })
  s.wire(kp, pTerm, 0)
  s.wire(err, pTerm, 1)

  // I: accumulate Ki * error * Ts, clamped to ±itermLimit
  const ki = s.constant('KiTs', perAxis(FC.pid.i, FC.scale.i * FC.ts), 'double[3]')
  const iInc = s.add('multiply', 'IIncrement', { numInputs: 2 })
  s.wire(ki, iInc, 0)
  s.wire(err, iInc, 1)
  const iPrev = s.add('unit_delay', 'IPrev', { initialValue: [0, 0, 0], sampleInterval: FC.ts })
  const iSum = s.add('sum', 'IAccumulate', { signs: '++', numInputs: 2 })
  s.wire(iPrev, iSum, 0)
  s.wire(iInc, iSum, 1)
  const iTerm = s.add('limit', 'I', { lowerLimit: -FC.itermLimit, upperLimit: FC.itermLimit })
  s.wire(iSum, iTerm)
  s.wire(iTerm, iPrev)

  // D on measurement: filter the gyro, differentiate, -Kd
  const dLpf = pt1(s, 'DtermLPF', FC.dtermLpfHz)
  s.wire(gyro, dLpf)
  const dGyro = derivative(s, 'GyroRateOfChange')
  s.wire(dLpf, dGyro)
  const kd = s.constant('Kd', perAxis(FC.pid.d, -FC.scale.d), 'double[3]')
  const dTerm = s.add('multiply', 'D', { numInputs: 2 })
  s.wire(kd, dTerm, 0)
  s.wire(dGyro, dTerm, 1)

  // Feed-forward on the setpoint rate of change
  const dSp = derivative(s, 'SetpointRateOfChange')
  s.wire(sp, dSp)
  const kff = s.constant('Kff', perAxis(FC.pid.ff, FC.scale.ff), 'double[3]')
  const ffTerm = s.add('multiply', 'FF', { numInputs: 2 })
  s.wire(kff, ffTerm, 0)
  s.wire(dSp, ffTerm, 1)

  const pidSum = s.add('sum', 'PIDSum', { signs: '++++', numInputs: 4 })
  ;[pTerm, iTerm, dTerm, ffTerm].forEach((id, i) => s.wire(id, pidSum, i))
  const hi = s.constant('PIDSumMax', FC.pidSumLimit, 'double[3]')
  const lo = s.constant('PIDSumMin', FC.pidSumLimit.map(v => -v), 'double[3]')
  const sat = s.add('saturation_dynamic', 'PIDSumLimit')
  s.wire(hi, sat, 0)
  s.wire(pidSum, sat, 1)
  s.wire(lo, sat, 2)
  const scaled = s.add('scale', 'MixerScaling', { gain: 1 / FC.mixerScaling })
  s.wire(sat, scaled)
  s.output('pid', scaled, 'double[3]')
  return s
}

function buildMixerSheet(): SheetBuilder {
  const s = new SheetBuilder('mixer', 'Mixer')
  const pid = s.input('pid', 'double[3]')
  const thr = s.input('throttle', 'double')
  const M = s.constant('MixerTable', MIXER, 'double[4][3]')
  const mix = s.add('matrix_multiply', 'MotorMix')
  s.wire(M, mix, 0)
  s.wire(pid, mix, 1)

  // Airmode: scale the mix into range, then shift throttle to keep it there
  const split = s.add('demux', 'MixSplit', { outputCount: 4, inputDimensions: [4] })
  s.wire(mix, split)
  const mixMax = s.add('evaluate', 'MixMax', { numInputs: 4, expression: 'fmax(fmax(in(0), in(1)), fmax(in(2), in(3)))' })
  const mixMin = s.add('evaluate', 'MixMin', { numInputs: 4, expression: 'fmin(fmin(in(0), in(1)), fmin(in(2), in(3)))' })
  for (let i = 0; i < 4; i++) {
    s.wire(split, mixMax, i, i)
    s.wire(split, mixMin, i, i)
  }
  const range = s.add('evaluate', 'MixRange', { numInputs: 2, expression: 'fmax(1.0, in(0) - in(1))' })
  s.wire(mixMax, range, 0)
  s.wire(mixMin, range, 1)
  const mixN = s.add('divide', 'MixNormalized')
  s.wire(mix, mixN, 0)
  s.wire(range, mixN, 1)
  // range > 1: mix was normalized, centre throttle; else keep throttle inside [-min, 1 - max]
  const thrA = s.add('evaluate', 'AirmodeThrottle', {
    numInputs: 4,
    expression: '(in(3) > 1.0) ? 0.5 : fmin(fmax(in(0), -in(2)), 1.0 - in(1))',
  })
  s.wire(thr, thrA, 0)
  s.wire(mixMax, thrA, 1)
  s.wire(mixMin, thrA, 2)
  const rawRange = s.add('evaluate', 'MixSpread', { numInputs: 2, expression: 'in(0) - in(1)' })
  s.wire(mixMax, rawRange, 0)
  s.wire(mixMin, rawRange, 1)
  s.wire(rawRange, thrA, 3)

  const motor = s.add('sum', 'ThrottlePlusMix', { signs: '++', numInputs: 2 })
  s.wire(mixN, motor, 0)
  s.wire(thrA, motor, 1)
  const clamp = s.add('limit', 'MotorRange', { lowerLimit: 0, upperLimit: 1 })
  s.wire(motor, clamp)
  const span = s.add('scale', 'IdleToFull', { gain: 1 - FC.motorIdle })
  s.wire(clamp, span)
  const idle = s.constant('MotorIdle', FC.motorIdle, 'double')
  const out = s.add('sum', 'MotorOutput', { signs: '++', numInputs: 2 })
  s.wire(span, out, 0)
  s.wire(idle, out, 1)
  s.output('motors', out, 'double[4]')
  return s
}

function buildFlightControllerSheet(): SheetBuilder {
  const s = new SheetBuilder('fc', 'FlightController')
  const sticks = s.input('sticks', 'double[4]')
  const gyro = s.input('gyro', 'double[3]')
  const acc = s.input('accel', 'double[3]')
  const mag = s.input('mag', 'double[3]')
  const pressure = s.input('pressure', 'double')
  const rates = s.add('subsystem', 'Rates', subsystem(['sticks'], ['setpoint', 'throttle'], buildRatesSheet()))
  s.wire(sticks, rates)
  const filt = s.add('subsystem', 'GyroFilters', subsystem(['gyro'], ['gyro_dps'], buildGyroFilterSheet()))
  s.wire(gyro, filt)
  const pid = s.add('subsystem', 'RatePID', subsystem(['setpoint', 'gyro_dps'], ['pid'], buildRatePidSheet()))
  s.wire(rates, pid, 0, 0)
  s.wire(filt, pid, 1, 0)
  const mixer = s.add('subsystem', 'Mixer', subsystem(['pid', 'throttle'], ['motors'], buildMixerSheet()))
  s.wire(pid, mixer, 0, 0)
  s.wire(rates, mixer, 1, 1)
  const att = s.add('subsystem', 'AttitudeEstimator', subsystem(['gyro', 'accel', 'mag'], ['quat', 'euler'], buildAttitudeEstimatorSheet()))
  s.wire(gyro, att, 0)
  s.wire(acc, att, 1)
  s.wire(mag, att, 2)
  const alt = s.add('subsystem', 'AltitudeEstimator', subsystem(['accel', 'quat', 'pressure'], ['altitude', 'climb_rate'], buildAltitudeEstimatorSheet()))
  s.wire(acc, alt, 0)
  s.wire(att, alt, 1, 0)
  s.wire(pressure, alt, 2)
  s.output('motors', mixer, 'double[4]')
  s.output('setpoint', rates, 'double[3]')
  s.output('gyro_dps', filt, 'double[3]')
  s.output('euler_est', att, 'double[3]', 1)
  s.output('altitude_est', alt, 'double', 0)
  s.output('quat_est', att, 'double[4][1]', 0)
  return s
}

// ---------------------------------------------------------------------------
// Top level

export const MOTOR_NAMES = ['Motor_RR', 'Motor_FR', 'Motor_RL', 'Motor_FL']
const FRAME_OUTPUTS = ['pos_ned', 'vel_ned', 'quat', 'euler', 'omega', 'accel']
const FRAME_OUTPUT_TYPES = ['double[3]', 'double[3]', 'double[4][1]', 'double[3]', 'double[3]', 'double[3]']

export interface FpvModelOptions {
  /** Plant only: a constant motor command (default hover) instead of pilot and flight controller. */
  openLoop?: boolean
  motorCommand?: number[]
  sticks?: StickProfile
  /** Initial body rates (rad/s), e.g. to test disturbance rejection. */
  initialOmega?: number[]
  /** 'ideal' sensors report the true state exactly (no noise, bias or quantization). */
  sensors?: 'modelled' | 'ideal'
}

export function buildFpvModel(opts: FpvModelOptions = {}): { name: string; data: Record<string, unknown> } {
  const main = new SheetBuilder('main', 'Main')
  const split = main.add('demux', 'MotorCmdSplit', { outputCount: 4, inputDimensions: [4] })
  let fc: string | null = null
  if (opts.openLoop) {
    const hover = Number(HOVER_COMMAND.toFixed(6))
    const cmd = main.constant('MotorCmd', opts.motorCommand ?? [hover, hover, hover, hover], 'double[4]')
    main.wire(cmd, split)
  } else {
    const pilot = main.add('subsystem', 'Pilot', subsystem([], ['sticks'], buildPilotSheet(opts.sticks ?? DEMO_STICKS)))
    fc = main.add('subsystem', 'FlightController', {
      ...subsystem(['sticks', 'gyro', 'accel', 'mag', 'pressure'], FC_OUTPUTS, buildFlightControllerSheet(), FC_SIZE),
      sampleTimeSec: FC.ts,
    })
    main.wire(pilot, fc, 0)
    main.wire(fc, split, 0, 0)
  }

  const motorDef = buildMotorSheet()
  const motorIds = MOTOR_NAMES.map((name, i) => {
    const params =
      i === 0
        ? subsystem(['cmd'], ['omega', 'thrust'], motorDef, MOTOR_SIZE)
        : {
            ...MOTOR_SIZE,
            inputPorts: ['cmd'],
            outputPorts: ['omega', 'thrust'],
            showPortNames: true,
            isReference: true,
            referencedSubsystemId: `main__${MOTOR_NAMES[0]}`,
            codeGenStrategy: 'segregated_atomic',
            sheets: [],
          }
    const id = main.add('subsystem', name, params)
    main.wire(split, id, 0, i)
    return id
  })
  // The definition compiles as a shared module either way; say so explicitly.
  ;(main.blocks.find(b => b.id === motorIds[0])!.parameters as Record<string, unknown>).codeGenStrategy = 'segregated_atomic'

  const thrustVec = main.add('mux', 'Thrusts', { rows: 4, cols: 1, baseType: 'double', outputType: 'double[4]' })
  const omegaVec = main.add('mux', 'RotorSpeeds', { rows: 4, cols: 1, baseType: 'double', outputType: 'double[4]' })
  motorIds.forEach((id, i) => {
    main.wire(id, thrustVec, i, 1)
    main.wire(id, omegaVec, i, 0)
  })

  const frame = main.add('subsystem', 'Frame', subsystem(['thrust'], FRAME_OUTPUTS, buildFrameSheet(opts.initialOmega), FRAME_SIZE))
  main.wire(thrustVec, frame)
  if (fc) {
    const sensors = main.add('subsystem', 'Sensors', subsystem(
      ['pos_ned', 'quat', 'omega', 'specific_force'], ['gyro', 'accel', 'mag', 'pressure'],
      buildSensorsSheet(opts.sensors === 'ideal'), SENSORS_SIZE))
    main.wire(frame, sensors, 0, 0)
    main.wire(frame, sensors, 1, 2)
    main.wire(frame, sensors, 2, 4)
    main.wire(frame, sensors, 3, 5)
    for (let i = 0; i < 4; i++) main.wire(sensors, fc, i + 1, i)
    main.output('imu_gyro', sensors, 'double[3]', 0)
    main.output('imu_accel', sensors, 'double[3]', 1)
    main.output('mag', sensors, 'double[3]', 2)
    main.output('pressure', sensors, 'double', 3)
  }

  FRAME_OUTPUTS.forEach((name, i) => main.output(name, frame, FRAME_OUTPUT_TYPES[i]!, i))
  main.output('motor_omega', omegaVec, 'double[4]')
  if (fc) {
    main.output('motor_cmd', fc, 'double[4]', 0)
    main.output('rate_setpoint', fc, 'double[3]', 1)
    main.output('gyro_dps', fc, 'double[3]', 2)
    main.output('euler_est', fc, 'double[3]', 3)
    main.output('altitude_est', fc, 'double', 4)
    main.output('quat_est', fc, 'double[4][1]', 5)
  }

  const displays: Array<[string, string, number]> = [
    ['Position', frame, 0],
    ['Attitude', frame, 3],
    ['RotorSpeed', omegaVec, 0],
  ]
  if (fc) displays.push(['RateSetpoint', fc, 1], ['GyroRate', fc, 2], ['MotorCommand', fc, 0], ['AttitudeEstimate', fc, 3], ['AltitudeEstimate', fc, 4])
  else displays.push(['BodyRates', frame, 4])
  for (const [label, from, port] of displays) {
    const d = main.add('signal_display', label, { maxSamples: 10000 })
    main.wire(from, d, 0, port)
  }

  let sheets: Sheet[] = [main.sheet()]
  sheets = tuneModelLayout(sheets as any, null, {
    ...DEFAULT_TUNE_OPTIONS,
    cleanUpLayout: true,
    resizeSubsystems: false,
    scope: 'model',
  }).sheets as unknown as Sheet[]
  fitExtents(sheets)

  return {
    name: 'FPV Quadcopter',
    data: {
      version: '2.2',
      metadata: {
        created: '2026-10-19T00:00:00.000Z',
        description:
          '5-inch FPV quadcopter reference model. ' +
          'NED world / FRD body axes, quaternion 6-DOF rigid body, four first-order motor/propeller subsystems, ' +
          'and a Betaflight-style acro flight controller at 1 kHz (rates, gyro PT1 filters, rate PID with feed-forward, ' +
          'quad-X mixer with airmode) re-implemented from documented behaviour and defaults. ' +
          'Sensors: IMU (gyro, accelerometer) at 1 kHz, magnetometer at 100 Hz and barometer at 50 Hz with datasheet noise, ' +
          'bias, quantization and range; the controller flies on the sensor gyro and runs a Mahony attitude filter and a ' +
          'baro/accelerometer altitude filter. ' +
          'The Pilot subsystem scripts a roll doublet, a pitch doublet and a yaw step at hover throttle. ' +
          'Parameters from the kingfisher model in uzh-rpg/agile_flight (MIT) and Kaufmann et al. 2022; ' +
          'equation structure after uzh-rpg/flightmare (MIT). See docs/fpv-reference-model-plan.md.',
      },
      globalSettings: {
        simulationTimeStep: FPV.dt,
        simulationDuration: 5,
        integrationAlgorithm: 'rk4',
        debugMath: false,
      },
      parameters: [],
      dataStores: [],
      sheets,
    },
  }
}

/** Grow each sheet's extents to cover its laid-out blocks. */
function fitExtents(sheets: Sheet[]): void {
  for (const sheet of sheets) {
    let w = 400, h = 300
    for (const b of sheet.blocks) {
      w = Math.max(w, (b.position?.x ?? 0) + 300)
      h = Math.max(h, (b.position?.y ?? 0) + 200)
      const inner = (b.parameters as any)?.sheets as Sheet[] | undefined
      if (inner?.length) fitExtents(inner)
    }
    sheet.extents = { width: Math.ceil(w), height: Math.ceil(h) }
  }
}

if (require.main === module) {
  const out = process.argv[2] || path.join(__dirname, '..', 'reference-models', 'fpv-quadcopter.json')
  fs.writeFileSync(out, JSON.stringify(buildFpvModel(), null, 2) + '\n')
  console.log(`Wrote ${out} (hover command ${HOVER_COMMAND.toFixed(4)}, omega_max ${OMEGA_MAX.toFixed(1)} rad/s)`)
}

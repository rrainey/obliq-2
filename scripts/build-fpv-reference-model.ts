/**
 * Builds the FPV quadcopter reference models in reference-models/: the
 * vehicle (fpv-vehicle.json) and test models that embed it with a model
 * reference (fpv-demo-flight.json, fpv-acro-rate-step.json). See
 * docs/fpv-reference-model-plan.md for the design, parameters and sources.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/build-fpv-reference-model.ts [out-dir]
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
import { ussa1976, USSA1976 } from '@/lib/atmosphere/ussa1976'
import { loadWmm2025, wmmField } from './lib/wmm'
import { modelInterface } from '@/lib/modelReferences'

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
  /** kg m², spinning part of one motor + 5" propeller (est.: prop ~6e-6, bell ~2.5e-6) */
  rotorInertia: 8.5e-6,
  /** Electrical efficiency from battery to shaft power (motor and ESC, est.) */
  driveEfficiency: 0.8,
  /**
   * Ground contact at the field plane (NED z = 0 is the CG height when resting).
   * Spring-damper normal force (1 mm static compression), viscous friction, and a
   * righting torque from the landing legs (all est.).
   */
  ground: {
    stiffness: (0.75 * 9.80665) / 0.001, // N/m
    damping: 150, // N s/m (about critical)
    friction: 20, // N s/m, horizontal
    tiltStiffness: 75, // N m/rad
    tiltDamping: 1.0, // N m s/rad
    yawDamping: 0.5, // N m s/rad
  },
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
  /** Angle (self-level) mode: full stick = angleLimitDeg; rate setpoint = gain * angle error (deg/s per deg). */
  angle: { limitDeg: 60, gain: 5 },
  /** Airmode (and the I-term) starts once throttle first exceeds this after arming (airmode_start_throttle_percent 25). */
  airmodeStartThrottle: 0.25,
}

/**
 * Prairie Creek Park, Texas. The 1 km terrain database is centered here.
 * elevationM is the NAVD88 height of the DEM cell that contains the park
 * center (environment/dem/prairie-creek-1km.json in obliq-fpv-unity), rounded
 * to a millimeter. z = 0 is 0 m MSL in this vehicle and in that database, so
 * the field plane is z = −elevationM and altitude MSL is −z.
 */
export const LOCATION = {
  name: 'Prairie Creek Park, Texas',
  latitudeDeg: 32.98562480100526,
  longitudeDeg: -96.71872529973575,
  /** m NAVD88 of the origin DEM cell; the field plane is NED z = −elevationM */
  elevationM: 178.133,
  /** Decimal year for the magnetic field (2026-10-20) */
  epoch: 2026.8,
  /**
   * Geoid height N (m) at the park center, NGS GEOID18 (±0.043 m): the
   * ellipsoid is 26.1 m below NAVD88 here, so ellipsoid height = H + N.
   */
  geoidHeightM: -26.103,
  /** UTM zone of the terrain database's grid (NAD83 / UTM 14N) */
  utmZone: 14,
  /**
   * Grid convergence γ (deg) at the park center: the angle from true north to
   * UTM 14N grid north, positive when grid north is east of true north. The
   * model's x axis is grid north. This is the default for test models; the
   * Unity host supplies PROJ's value at run time (the DEM sidecar records it).
   */
  gridConvergenceDeg: 1.2425,
}

/**
 * WMM2025 field at the site, true NED, µT, evaluated at the field's height
 * above the ellipsoid (elevation + geoid height). Across the 1 km terrain box
 * and 150 m of climb the field changes by at most 4 nT, far below the
 * magnetometer's 0.3 µT LSB, so it is a constant.
 */
export const SITE_FIELD = (() => {
  const f = wmmField(loadWmm2025(), LOCATION.latitudeDeg, LOCATION.longitudeDeg, LOCATION.elevationM + LOCATION.geoidHeightM, LOCATION.epoch)
  return { ned: [f.x, f.y, f.z].map(v => Number((v / 1000).toFixed(3))), declinationDeg: f.declinationDeg, inclinationDeg: f.inclinationDeg }
})()

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
    /** µT in NED at the site (WMM2025) */
    field: SITE_FIELD.ned,
    /** µT hard-iron offset (est.) */
    hardIron: [3.0, -2.0, 1.0],
    /** µT RMS */
    noise: 0.4,
    lsb: 0.3,
    seed: 103,
  },
  baro: {
    ts: 0.02,
    /**
     * m above MSL at the NED origin. The origin is 0 m MSL. The field is
     * LOCATION.elevationM, at z = −elevationM, not at this altitude.
     */
    homeAltitude: 0,
    /** Pa RMS */
    noise: 1.3,
    /** s, first-order sensor/filter lag */
    lag: 0.03,
    seed: 104,
  },
}

/** Standard-atmosphere pressure (Pa) at geometric altitude z (m): what the Atmosphere block computes. */
export const standardPressure = (z: number) => ussa1976(z).pressure_Pa

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

/**
 * 4S LiPo pack. Open-circuit voltage per cell versus state of charge is a
 * typical resting-voltage curve for hobby LiPo cells (est.); resistance is
 * the whole pack's (est. for a 1300 mAh 4S racing pack).
 */
export const BATTERY = {
  cells: 4,
  capacityAh: 1.3,
  resistanceOhm: 0.02,
  initialSoc: 1.0,
  ocvPerCell: [
    [0, 3.27], [0.05, 3.61], [0.1, 3.69], [0.2, 3.74], [0.3, 3.77], [0.4, 3.79],
    [0.5, 3.82], [0.6, 3.87], [0.7, 3.92], [0.8, 3.98], [0.9, 4.06], [1.0, 4.2],
  ] as Array<[number, number]>,
  /** V at which the motors reach OMEGA_MAX at full command (a full pack, unloaded) */
  referenceVoltage: 16.8,
}

/** Rotor speed at full command, so that full command gives maxThrust. */
export const OMEGA_MAX = Math.sqrt(FPV.maxThrust / FPV.thrustCoeff)
/** Per-motor command that holds hover: thrust = m g / 4, and thrust ∝ command². */
export const HOVER_COMMAND = Math.sqrt((FPV.mass * FPV.gravity) / 4 / FPV.maxThrust)
/** Throttle stick that gives the hover command through idle + (1 - idle)·throttle. */
/**
 * Pack terminal voltage while hovering on a full battery: each motor draws
 * kappa T w / eta at hover thrust and speed, and V = OCV - I R.
 */
export const HOVER_VOLTAGE = (() => {
  const thrust = (FPV.mass * FPV.gravity) / 4
  const omega = Math.sqrt(thrust / FPV.thrustCoeff)
  const power = (4 * FPV.torqueToThrust * thrust * omega) / FPV.driveEfficiency
  const ocv = BATTERY.cells * BATTERY.ocvPerCell[BATTERY.ocvPerCell.length - 1]![1]
  let v = ocv
  for (let i = 0; i < 20; i++) v = ocv - (power / v) * BATTERY.resistanceOhm
  return v
})()
/** Throttle stick that holds hover on a full pack: idle + (1 - idle)·throttle = hover command at that voltage. */
export const HOVER_THROTTLE = (HOVER_COMMAND * (BATTERY.referenceVoltage / HOVER_VOLTAGE) - FC.motorIdle) / (1 - FC.motorIdle)

/** Piecewise-linear stick inputs over time: [time s, value] pairs per axis. */
export interface StickProfile {
  roll: Array<[number, number]>
  pitch: Array<[number, number]>
  yaw: Array<[number, number]>
  throttle: Array<[number, number]>
  /** AUX1 switch: above 0.5 selects angle (self-level) mode; default acro. */
  aux?: Array<[number, number]>
  /** AUX2 arm switch: above 0.5 is armed; default armed from the start. */
  arm?: Array<[number, number]>
}

/** A piecewise-linear schedule ([time s, value] pairs), or a constant. */
export type Schedule = number | Array<[number, number]>

/** GNSS conditions over time: the receiver's satellites used, HDOP, VDOP and UERE scale. */
export interface GnssEnvProfile {
  satellites?: Schedule
  hdop?: Schedule
  vdop?: Schedule
  uereScale?: Schedule
}

/** Open sky: the receiver's default conditions (u-blox M10 class, multi-GNSS). */
export const DEFAULT_GNSS_ENV = { satellites: 14, hdop: 0.8, vdop: 1.3, uereScale: 1.0 }

/**
 * The vehicle's inputs other than the sticks, over time. Test models feed
 * them from a Conditions subsystem; the Unity host sets them directly.
 */
export interface ConditionsProfile {
  gnssEnv?: GnssEnvProfile
  /** Grid convergence γ (deg); default LOCATION.gridConvergenceDeg */
  gridConvergenceDeg?: Schedule
}

/** The vehicle's Input Ports, in port order, with their types. */
export const VEHICLE_INPUTS: Array<[string, string]> = [
  ['sticks', 'double[6]'],
  ['gnss_env', 'double[4]'],
  ['grid_convergence_deg', 'double'],
]

/**
 * Default demo: take off from rest on the field. Armed at 0.25 s, climb on
 * 0.55 throttle, hover, then in angle mode a 24 deg bank, an 18 deg
 * nose-down pitch (flying forward) and a yaw turn.
 */
export const DEMO_STICKS: StickProfile = {
  roll: [[0, 0], [2.0, 0], [2.1, 0.4], [2.8, 0.4], [2.9, 0]],
  pitch: [[0, 0], [3.1, 0], [3.2, -0.3], [3.8, -0.3], [3.9, 0]],
  yaw: [[0, 0], [4.1, 0], [4.15, 0.5], [4.6, 0.5], [4.65, 0]],
  throttle: [[0, 0], [0.5, 0], [0.6, 0.55], [1.1, 0.55], [1.3, Number(HOVER_THROTTLE.toFixed(4))]],
  aux: [[0, 1]],
  arm: [[0, 0], [0.25, 0], [0.251, 1]],
}

/**
 * Pass/fail limits for the default demo flight, checked by the Assert blocks
 * on the Tests sheet. Windows sit inside each manoeuvre's hold, after it has
 * settled; limits leave a margin of a degree or two around the flown values.
 */
export const DEMO_TESTS = {
  /** Motors stay off until the arm switch (0.25 s); after it, at least idle */
  armTime: 0.25,
  /** Height above the field from 1.5 s (1.45 m flown) */
  climbFrom: 1.5,
  minHeightM: 1.0,
  /** Roll and pitch while climbing on the throttle alone */
  levelWindow: [0.6, 2.0] as [number, number],
  levelDeg: 2,
  /** Angle mode: 0.4 roll stick held 2.1–2.8 s commands a 24 deg bank */
  bankWindow: [2.6, 2.8] as [number, number],
  bankDeg: [22, 26.5] as [number, number],
  /** −0.3 pitch stick held 3.2–3.8 s commands 18 deg nose-down */
  pitchWindow: [3.6, 3.8] as [number, number],
  pitchDeg: [-19.5, -15.5] as [number, number],
  /** The yaw stick (4.15–4.6 s) turns the heading about 90 deg */
  yawFrom: 4.7,
  yawDeg: [80, 100] as [number, number],
  /** The estimators against the true state, over the whole flight */
  attitudeEstimateDeg: 5,
  altitudeEstimateM: 0.5,
  /** 3.5 V per cell under load */
  minBatteryV: 4 * 3.5,
  /** Roll or pitch beyond this ends the run (stop on failure) */
  uprightDeg: 60,
}

/**
 * Airborne demo (start at altitude, armed) at hover throttle: in acro, a roll
 * doublet and a yaw step; then angle mode from 2.4 s: a 30 deg bank held and
 * released, then an 18 deg pitch.
 */
export const AIRBORNE_DEMO_STICKS: StickProfile = {
  roll: [[0, 0], [0.5, 0], [0.55, 0.5], [1.0, 0.5], [1.05, -0.5], [1.5, -0.5], [1.55, 0], [2.6, 0], [2.65, 0.5], [3.4, 0.5], [3.45, 0]],
  pitch: [[0, 0], [3.9, 0], [3.95, 0.3], [4.5, 0.3], [4.55, 0]],
  yaw: [[0, 0], [1.8, 0], [1.85, 0.5], [2.2, 0.5], [2.25, 0]],
  throttle: [[0, Number(HOVER_THROTTLE.toFixed(4))]],
  aux: [[0, 0], [2.4, 0], [2.401, 1]],
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

/**
 * Tests-sheet helpers: turn events and statistics into signals that Assert
 * blocks can check (docs/fpv-hud-gnss-test-plan.md, section 2.2). Inputs are
 * scalars; select vector elements first. `ts` is the accumulation interval
 * (0 = every model step).
 */
export class TestHelpers {
  private clockId: string | null = null
  constructor(private readonly s: SheetBuilder) {}

  /** The sheet's clock (one per sheet). */
  clock(): string {
    return (this.clockId ??= this.s.add('clock', 'Time'))
  }

  private feedback(name: string, initialValue: number, ts: number, expression: string, inputs: string[]): string {
    const prev = this.s.add('unit_delay', `${name}Prev`, { initialValue, sampleInterval: ts })
    const ev = this.s.add('evaluate', name, { numInputs: inputs.length + 1, expression })
    inputs.forEach((id, i) => this.s.wire(id, ev, i))
    this.s.wire(prev, ev, inputs.length)
    this.s.wire(ev, prev)
    return ev
  }

  /** 1 once x has ever exceeded 0.5, else 0. */
  latch(name: string, x: string): string {
    return this.feedback(name, 0, 0, '(in(0) > 0.5 || in(1) > 0.5) ? 1.0 : 0.0', [x])
  }

  /** The time x first exceeded 0.5, held; −1 until then. */
  firstTime(name: string, x: string): string {
    return this.feedback(name, -1, 0, '(in(2) < 0.0 && in(0) > 0.5) ? in(1) : in(2)', [x, this.clock()])
  }

  /** Running maximum of x. */
  runMax(name: string, x: string): string {
    return this.feedback(name, -1e30, 0, 'fmax(in(0), in(1))', [x])
  }

  /** Running minimum of x. */
  runMin(name: string, x: string): string {
    return this.feedback(name, 1e30, 0, 'fmin(in(0), in(1))', [x])
  }

  /** x until time t, then held at its value there. */
  heldAt(name: string, x: string, t: number): string {
    return this.feedback(name, 0, 0, `(in(1) <= ${t}) ? in(0) : in(2)`, [x, this.clock()])
  }

  /** 1 when the clock is in [t0, t1), else 0. */
  private gate(name: string, t0: number, t1: number): string {
    const g = this.s.add('evaluate', name, { numInputs: 1, expression: `(in(0) >= ${t0} && in(0) < ${t1}) ? 1.0 : 0.0` })
    this.s.wire(this.clock(), g)
    return g
  }

  /** Accumulate term (an expression in in(0)…) while the gate is open, every ts. */
  private accumulate(name: string, gate: string, ts: number, term: string, inputs: string[]): string {
    const n = inputs.length
    return this.feedback(name, 0, ts, `(in(${n}) > 0.5) ? in(${n + 1}) + (${term}) : in(${n + 1})`, [...inputs, gate])
  }

  /** Mean of x² over [t0, t1), sampled every ts; held after t1 (0 before any sample). */
  windowMeanSquare(name: string, x: string, t0: number, t1: number, ts = 0): string {
    const g = this.gate(`${name}Window`, t0, t1)
    const sum = this.accumulate(`${name}Sum`, g, ts, 'in(0) * in(0)', [x])
    const one = this.s.constant(`${name}One`, 1, 'double')
    const count = this.accumulate(`${name}Count`, g, ts, 'in(0)', [one])
    const out = this.s.add('evaluate', name, { numInputs: 2, expression: '(in(1) > 0.0) ? in(0) / in(1) : 0.0' })
    this.s.wire(sum, out, 0)
    this.s.wire(count, out, 1)
    return out
  }

  /**
   * Normalised correlation of x with x delayed by `lag` samples of ts, over
   * [t0, t1): Σ x·x₋ / √(Σ x² · Σ x₋²). Held after t1.
   */
  windowCorr(name: string, x: string, lag: number, ts: number, t0: number, t1: number): string {
    let delayed = x
    for (let i = 1; i <= lag; i++) {
      const d = this.s.add('unit_delay', `${name}Lag${i}`, { initialValue: 0, sampleInterval: ts })
      this.s.wire(delayed, d)
      delayed = d
    }
    const g = this.gate(`${name}Window`, t0 + lag * ts, t1)
    const sab = this.accumulate(`${name}Sab`, g, ts, 'in(0) * in(1)', [x, delayed])
    const saa = this.accumulate(`${name}Saa`, g, ts, 'in(0) * in(0)', [x])
    const sbb = this.accumulate(`${name}Sbb`, g, ts, 'in(0) * in(0)', [delayed])
    const out = this.s.add('evaluate', name, { numInputs: 3, expression: '(in(1) > 0.0 && in(2) > 0.0) ? in(0) / sqrt(in(1) * in(2)) : 0.0' })
    this.s.wire(sab, out, 0)
    this.s.wire(saa, out, 1)
    this.s.wire(sbb, out, 2)
    return out
  }

  /** 1 once a phase signal has equalled k. */
  phaseVisited(name: string, phase: string, k: number): string {
    const eq = this.s.add('evaluate', `${name}Now`, { numInputs: 1, expression: `(fabs(in(0) - ${k}) < 0.5) ? 1.0 : 0.0` })
    this.s.wire(phase, eq)
    return this.latch(name, eq)
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
const FC_SIZE = { width: 220, height: 180 }
const SENSORS_SIZE = { width: 170, height: 150 }
const FC_OUTPUTS = ['motors', 'setpoint', 'gyro_dps', 'euler_est', 'altitude_est', 'quat_est']

// ---------------------------------------------------------------------------
// Motor / ESC / propeller (one definition, referenced by the other three)

function buildMotorSheet(): SheetBuilder {
  const s = new SheetBuilder('motor', 'Motor')
  const cmd = s.input('cmd', 'double')
  const volts = s.input('voltage', 'double')
  const clamp = s.add('limit', 'CmdLimit', { lowerLimit: 0, upperLimit: 1 })
  s.wire(cmd, clamp)
  // The ESC's speed at a given command scales with supply voltage
  const cmdV = s.add('multiply', 'CmdTimesVoltage', { numInputs: 2 })
  s.wire(clamp, cmdV, 0)
  s.wire(volts, cmdV, 1)
  const omegaCmd = s.add('scale', 'OmegaMax', { gain: OMEGA_MAX / BATTERY.referenceVoltage })
  s.wire(cmdV, omegaCmd)
  // First-order rotor-speed lag: omega / omega_cmd = 1 / (tau s + 1)
  const lag = s.add('transfer_function', 'MotorLag', { numerator: [1], denominator: [FPV.motorTau, 1] })
  s.wire(omegaCmd, lag)
  const sq = s.add('square', 'OmegaSq')
  s.wire(lag, sq)
  const thrust = s.add('scale', 'ThrustCoeff', { gain: FPV.thrustCoeff })
  s.wire(sq, thrust)
  // Rotor angular acceleration, (omega_cmd - omega) / tau: its reaction torque yaws the frame
  const err = s.add('sum', 'SpeedError', { signs: '+-', numInputs: 2 })
  s.wire(omegaCmd, err, 0)
  s.wire(lag, err, 1)
  const accel = s.add('scale', 'InvTau', { gain: 1 / FPV.motorTau })
  s.wire(err, accel)
  // Electrical power drawn: shaft power Q w = kappa T w, over the drive efficiency
  const tw = s.add('multiply', 'ThrustTimesSpeed', { numInputs: 2 })
  s.wire(thrust, tw, 0)
  s.wire(lag, tw, 1)
  const power = s.add('scale', 'ElectricalPower', { gain: FPV.torqueToThrust / FPV.driveEfficiency })
  s.wire(tw, power)
  s.output('omega', lag, 'double')
  s.output('thrust', thrust, 'double')
  s.output('omega_dot', accel, 'double')
  s.output('power', power, 'double')
  return s
}

// ---------------------------------------------------------------------------
// Battery: open-circuit voltage from state of charge, internal resistance

function buildBatterySheet(): SheetBuilder {
  const s = new SheetBuilder('battery', 'Battery')
  const power = s.input('motor_power', 'double[4]')
  const b = BATTERY
  const total = s.add('sum', 'TotalPower', { signs: '+', numInputs: 1 })
  s.wire(power, total)
  // Current from the previous step's terminal voltage (breaks the V-I loop)
  const ocv0 = b.cells * b.ocvPerCell[b.ocvPerCell.length - 1]![1]
  const vPrev = s.add('unit_delay', 'VoltagePrev', { initialValue: ocv0, sampleInterval: 0 })
  const current = s.add('divide', 'Current')
  s.wire(total, current, 0)
  s.wire(vPrev, current, 1)
  const drain = s.add('scale', 'ChargeRate', { gain: -1 / (3600 * b.capacityAh) })
  s.wire(current, drain)
  const soc = s.add('integrator', 'StateOfCharge', { initialValue: b.initialSoc, useLimits: true, lowerLimit: 0, upperLimit: 1 })
  s.wire(drain, soc)
  const ocvCell = s.add('lookup_1d', 'CellOCV', {
    inputValues: b.ocvPerCell.map(p => p[0]),
    outputValues: b.ocvPerCell.map(p => p[1]),
    extrapolation: 'clamp',
  })
  s.wire(soc, ocvCell)
  const v = s.add('evaluate', 'TerminalVoltage', { numInputs: 2, expression: `${b.cells} * in(0) - ${b.resistanceOhm} * in(1)` })
  s.wire(ocvCell, v, 0)
  s.wire(current, v, 1)
  s.wire(v, vPrev)
  // The motors read the previous step's voltage: a segregated subsystem counts
  // as direct feedthrough, so feeding them the current one would close an
  // algebraic loop (motor power -> current -> voltage -> motor speed)
  s.output('voltage', vPrev, 'double')
  s.output('current', current, 'double')
  s.output('soc', soc, 'double')
  return s
}

// ---------------------------------------------------------------------------
// Rigid body: 6-DOF, quaternion attitude

/** Scalar-first quaternion (as a 4x1 column) for ZYX Euler angles in degrees. */
export function eulerToQuat([rollDeg, pitchDeg, yawDeg]: number[]): number[][] {
  const [r, p, y] = [rollDeg!, pitchDeg!, yawDeg!].map(d => (d * Math.PI) / 360)
  const [cr, sr, cp, sp, cy, sy] = [Math.cos(r!), Math.sin(r!), Math.cos(p!), Math.sin(p!), Math.cos(y!), Math.sin(y!)]
  return [[cr * cp * cy + sr * sp * sy], [sr * cp * cy - cr * sp * sy], [cr * sp * cy + sr * cp * sy], [cr * cp * sy - sr * sp * cy]]
}

/** CG height above its resting position: NED z where the vehicle sits on the ground. */
export const GROUND_REST_Z = (0.75 * 9.80665) / ((0.75 * 9.80665) / 0.001)

function buildFrameSheet(
  initialOmega: number[] = [0, 0, 0],
  initialQuat: number[][] = [[1], [0], [0], [0]],
  initialPos: number[] = [0, 0, 0]
): SheetBuilder {
  const s = new SheetBuilder('frame', 'Frame')
  const { mass, inertia, gravity, rotorXY, rotorYawSign, torqueToThrust, linearDrag } = FPV
  const T = s.input('thrust', 'double[4]')
  const rotorAccel = s.input('rotor_accel', 'double[4]')

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
  // Speeding up a rotor takes torque from the frame: M_z = sum(s_i J_r w_dot_i),
  // with the same sign as that rotor's drag torque
  const Bi = s.constant('RotorInertiaTorque', [[0, 0, 0, 0], [0, 0, 0, 0], rotorYawSign.map(sg => sg * FPV.rotorInertia)], 'double[3][4]')
  const mInertia = s.add('matrix_multiply', 'RotorReactionMoment')
  s.wire(Bi, mInertia, 0)
  s.wire(rotorAccel, mInertia, 1)

  // Attitude. Numerical integration does not preserve |q| = 1 exactly, so the
  // quaternion is renormalized: everything downstream uses q_n = q/|q|, and
  // q_dot pulls the state back to unit norm.
  const q = s.add('integrator', 'q', { initialValue: initialQuat })
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
  const fBody = s.add('sum', 'F_body', { signs: '+++', numInputs: 3 })
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
  const pNed = s.add('integrator', 'p_ned', { initialValue: initialPos })
  s.wire(vNed, pNed)

  // Ground contact (field plane at z = −elevationM): pushes up, never pulls;
  // friction on horizontal motion; enters F_body so the accelerometer feels it too.
  // Penetration is how far z is below the plane (positive down).
  const gc = FPV.ground
  const penetration = `(in(0) - (${-LOCATION.elevationM}))`
  const pos = s.add('demux', 'PosSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(pNed, pos)
  const vel = s.add('demux', 'VelSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(vNed, vel)
  const fGround = s.add('mux', 'GroundForceNED', { rows: 3, cols: 1, baseType: 'double', outputType: 'double[3]' })
  ;['GroundFrictionN', 'GroundFrictionE'].forEach((name, k) => {
    const f = s.add('evaluate', name, { numInputs: 2, expression: `(${penetration} > 0.0) ? ${-gc.friction} * in(1) : 0.0` })
    s.wire(pos, f, 0, 2)
    s.wire(vel, f, 1, k)
    s.wire(f, fGround, k)
  })
  const fN = s.add('evaluate', 'GroundNormal', {
    numInputs: 2,
    expression: `(${penetration} > 0.0) ? fmin(0.0, -(${gc.stiffness} * ${penetration} + ${gc.damping} * in(1))) : 0.0`,
  })
  s.wire(pos, fN, 0, 2)
  s.wire(vel, fN, 1, 2)
  s.wire(fN, fGround, 2)
  const fGroundBody = s.add('matrix_multiply', 'GroundForceBody')
  s.wire(Cbn, fGroundBody, 0)
  s.wire(fGround, fGroundBody, 1)
  s.wire(fGroundBody, fBody, 2)
  const contact = s.add('evaluate', 'OnGround', { numInputs: 1, expression: `(${penetration} > 0.0) ? 1.0 : 0.0` })
  s.wire(pos, contact, 0, 2)
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
  // Landing legs: right the frame toward level and damp rotation while in contact
  const downRef = s.constant('DownNED', [0, 0, 1], 'double[3]')
  const downBody = s.add('matrix_multiply', 'DownInBody')
  s.wire(Cbn, downBody, 0)
  s.wire(downRef, downBody, 1)
  const bodyZ = s.constant('BodyZ', [0, 0, 1], 'double[3]')
  const tilt = s.add('cross', 'Tilt')
  s.wire(downBody, tilt, 0)
  s.wire(bodyZ, tilt, 1)
  const kTilt = s.constant('LegStiffness', [-gc.tiltStiffness, -gc.tiltStiffness, 0], 'double[3]')
  const mSpring = s.add('multiply', 'LegSpringMoment', { numInputs: 2 })
  s.wire(kTilt, mSpring, 0)
  s.wire(tilt, mSpring, 1)
  const cTilt = s.constant('LegDamping', [-gc.tiltDamping, -gc.tiltDamping, -gc.yawDamping], 'double[3]')
  const mDamp = s.add('multiply', 'LegDampingMoment', { numInputs: 2 })
  s.wire(cTilt, mDamp, 0)
  s.wire(omega, mDamp, 1)
  const mLegs = s.add('sum', 'LegMoment', { signs: '++', numInputs: 2 })
  s.wire(mSpring, mLegs, 0)
  s.wire(mDamp, mLegs, 1)
  const mGround = s.add('multiply', 'GroundMoment', { numInputs: 2 })
  s.wire(mLegs, mGround, 0)
  s.wire(contact, mGround, 1)

  const mNet = s.add('sum', 'M_net', { signs: '+-++', numInputs: 4 })
  s.wire(mRotor, mNet, 0)
  s.wire(gyro, mNet, 1)
  s.wire(mInertia, mNet, 2)
  s.wire(mGround, mNet, 3)
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
  const mux = s.add('mux', 'Sticks', { rows: 6, cols: 1, baseType: 'double', outputType: 'double[6]' })
  const axes: Array<[keyof StickProfile, string]> = [['roll', 'RollStick'], ['pitch', 'PitchStick'], ['yaw', 'YawStick'], ['throttle', 'ThrottleStick'], ['aux', 'AngleModeSwitch'], ['arm', 'ArmSwitch']]
  axes.forEach(([axis, name], i) => {
    const raw = sticks[axis] ?? [[0, axis === 'arm' ? 1 : 0]]
    const pts = raw.length > 1 ? raw : [raw[0]!, [raw[0]![0] + 1, raw[0]![1]] as [number, number]]
    const lut = s.add('lookup_1d', name, {
      inputValues: pts.map(p => p[0]),
      outputValues: pts.map(p => p[1]),
      extrapolation: 'clamp',
    })
    s.wire(clock, lut)
    s.wire(lut, mux, i)
  })
  s.output('sticks', mux, 'double[6]')
  return s
}

/** A scheduled value: a constant, or a clamped lookup on the clock. */
function scheduled(s: SheetBuilder, clock: () => string, name: string, sched: Schedule): string {
  if (typeof sched === 'number') return s.constant(name, sched, 'double')
  const pts = sched.length > 1 ? sched : [sched[0]!, [sched[0]![0] + 1, sched[0]![1]] as [number, number]]
  const lut = s.add('lookup_1d', name, {
    inputValues: pts.map(p => p[0]),
    outputValues: pts.map(p => p[1]),
    extrapolation: 'clamp',
  })
  s.wire(clock(), lut)
  return lut
}

/** Conditions: the vehicle's non-pilot inputs, scheduled over time (defaults when not given). */
function buildConditionsSheet(c: ConditionsProfile = {}): SheetBuilder {
  const s = new SheetBuilder('conditions', 'Conditions')
  let clockId: string | null = null
  const clock = () => (clockId ??= s.add('clock', 'Time'))
  const env = { ...DEFAULT_GNSS_ENV, ...(c.gnssEnv ?? {}) }
  const mux = s.add('mux', 'GnssEnv', { rows: 4, cols: 1, baseType: 'double', outputType: 'double[4]' })
  ;([['satellites', 'Satellites'], ['hdop', 'HDOP'], ['vdop', 'VDOP'], ['uereScale', 'UereScale']] as const).forEach(([key, name], i) => {
    s.wire(scheduled(s, clock, name, env[key]), mux, i)
  })
  s.output('gnss_env', mux, 'double[4]')
  const gamma = scheduled(s, clock, 'GridConvergence', c.gridConvergenceDeg ?? LOCATION.gridConvergenceDeg)
  s.output('grid_convergence_deg', gamma, 'double')
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

function buildBaroSheet(ideal: boolean, altitude0: number): SheetBuilder {
  const s = new SheetBuilder('baro', 'Barometer')
  const pos = s.input('pos_ned', 'double[3]')
  const b = SENSORS.baro
  const down = s.add('selector', 'Down', { indices: [2] })
  s.wire(pos, down)
  // Geometric altitude above MSL. z = 0 is 0 m MSL, so this is −down.
  const alt = s.add('evaluate', 'AltitudeMSL', { numInputs: 1, expression: `${b.homeAltitude} - in(0)` })
  s.wire(down, alt)
  const atm = s.add('atmosphere', 'Atmosphere', { model: 'coesa1976', extrapolation: 'clamp' })
  s.wire(alt, atm)
  const p = atm
  const pPort = 2 // Atmosphere outputs: T, a, P, rho
  if (ideal) {
    s.output('pressure', p, 'double', pPort)
    return s
  }
  const n = noise(s, 'BaroNoise', 1, { stdDev: b.noise, seed: b.seed })
  const sum = s.add('sum', 'BaroSum', { signs: '++', numInputs: 2 })
  s.wire(p, sum, 0, pPort)
  s.wire(n, sum, 1)
  // First-order lag y += a (u - y), starting at the home pressure so the
  // sensor does not power up reading vacuum
  const a = b.ts / (b.lag + b.ts)
  const prev = s.add('unit_delay', 'BaroPrev', { initialValue: Number(standardPressure(LOCATION.elevationM + altitude0).toFixed(3)), sampleInterval: b.ts })
  const lag = s.add('evaluate', 'BaroLag', { numInputs: 2, expression: `in(1) + ${a} * (in(0) - in(1))` })
  s.wire(sum, lag, 0)
  s.wire(prev, lag, 1)
  s.wire(lag, prev)
  s.output('pressure', lag, 'double')
  return s
}

function buildSensorsSheet(ideal: boolean, altitude0: number): SheetBuilder {
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
  const baro = s.add('subsystem', 'Barometer', { ...subsystem(['pos_ned'], ['pressure'], buildBaroSheet(ideal, altitude0)), sampleTimeSec: SENSORS.baro.ts })
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
function buildAttitudeEstimatorSheet(initialQuat: number[][]): SheetBuilder {
  const s = new SheetBuilder('att', 'AttitudeEstimator')
  const gyro = s.input('gyro', 'double[3]')
  const acc = s.input('accel', 'double[3]')
  const mag = s.input('mag', 'double[3]')
  const qPrev = s.add('unit_delay', 'qPrev', { initialValue: initialQuat, sampleInterval: FC.ts })
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
function buildAltitudeEstimatorSheet(altitude0: number): SheetBuilder {
  const s = new SheetBuilder('alt', 'AltitudeEstimator')
  const acc = s.input('accel', 'double[3]')
  const q = s.input('quat', 'double[4][1]')
  const p = s.input('pressure', 'double')
  const { altOmega: w, altZeta: z } = ESTIMATOR
  const k1 = 2 * z * w, k2 = w * w, ts = FC.ts

  // Pressure altitude: invert the standard atmosphere's lowest layer
  // (geopotential H from pressure, then geometric z = r0 H / (r0 - H))
  const { Tb, Lb } = USSA1976.layers[0]
  const gmr = (USSA1976.g0 * USSA1976.M0) / USSA1976.Rstar
  const H = `(${Tb / Lb} * (pow(in(0) / ${USSA1976.P0}, ${-Lb / gmr}) - 1.0))`
  const baroAlt = s.add('evaluate', 'BaroAltitude', {
    numInputs: 1,
    expression: `${USSA1976.r0} * ${H} / (${USSA1976.r0} - ${H})`,
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

  const hPrev = s.add('unit_delay', 'hPrev', { initialValue: LOCATION.elevationM + altitude0, sampleInterval: ts })
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
  const sticks = s.input('sticks', 'double[6]')
  const split = s.add('demux', 'StickSplit', { outputCount: 6, inputDimensions: [6] })
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

/**
 * Angle (self-level) mode, after Betaflight's: the roll and pitch sticks set
 * an angle target (full stick = angleLimitDeg) and the rate setpoint becomes
 * gain * (target - estimated angle); yaw keeps the acro rate. The AUX switch
 * selects between this and the acro setpoint.
 */
function buildAngleModeSheet(): SheetBuilder {
  const s = new SheetBuilder('angle', 'AngleMode')
  const sticks = s.input('sticks', 'double[6]')
  const euler = s.input('euler_est', 'double[3]')
  const acro = s.input('acro_setpoint', 'double[3]')
  const split = s.add('demux', 'StickSplit', { outputCount: 6, inputDimensions: [6] })
  s.wire(sticks, split)
  const est = s.add('demux', 'AttitudeSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(euler, est)
  const acroSplit = s.add('demux', 'AcroSplit', { outputCount: 3, inputDimensions: [3] })
  s.wire(acro, acroSplit)
  const level = s.add('mux', 'LevelSetpoint', { rows: 3, cols: 1, baseType: 'double', outputType: 'double[3]' })
  const { limitDeg, gain } = FC.angle
  ;['Roll', 'Pitch'].forEach((axis, i) => {
    // in(0): stick, in(1): estimated angle (rad)
    const ev = s.add('evaluate', `${axis}Level`, {
      numInputs: 2,
      expression: `${gain} * (${limitDeg} * in(0) - in(1) * ${180 / Math.PI})`,
    })
    s.wire(split, ev, 0, i)
    s.wire(est, ev, 1, i)
    s.wire(ev, level, i)
  })
  s.wire(acroSplit, level, 2, 2)
  const on = s.add('evaluate', 'AngleModeOn', { numInputs: 1, expression: 'in(0) > 0.5' })
  s.wire(split, on, 0, 4)
  const select = s.add('if', 'ModeSelect')
  s.wire(acro, select, 0)
  s.wire(on, select, 1)
  s.wire(level, select, 2)
  s.output('setpoint', select, 'double[3]')
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
  const iEnable = s.input('iterm_enable', 'double')
  const iPrev = s.add('unit_delay', 'IPrev', { initialValue: [0, 0, 0], sampleInterval: FC.ts })
  const iSum = s.add('sum', 'IAccumulate', { signs: '++', numInputs: 2 })
  s.wire(iPrev, iSum, 0)
  s.wire(iInc, iSum, 1)
  // Held at zero until airmode starts, so it cannot wind up on the ground
  const iGated = s.add('multiply', 'IReset', { numInputs: 2 })
  s.wire(iSum, iGated, 0)
  s.wire(iEnable, iGated, 1)
  const iTerm = s.add('limit', 'I', { lowerLimit: -FC.itermLimit, upperLimit: FC.itermLimit })
  s.wire(iGated, iTerm)
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

/**
 * Arming, after Betaflight: disarmed stops the motors; armed runs them at
 * idle. Airmode, and with it the I-term, starts once throttle first exceeds
 * airmodeStartThrottle after arming, and stays on until disarmed.
 */
function buildArmingSheet(): SheetBuilder {
  const s = new SheetBuilder('arming', 'Arming')
  const sticks = s.input('sticks', 'double[6]')
  const split = s.add('demux', 'StickSplit', { outputCount: 6, inputDimensions: [6] })
  s.wire(sticks, split)
  const armed = s.add('evaluate', 'Armed', { numInputs: 1, expression: '(in(0) > 0.5) ? 1.0 : 0.0' })
  s.wire(split, armed, 0, 5)
  const latchPrev = s.add('unit_delay', 'AirmodePrev', { initialValue: 0, sampleInterval: FC.ts })
  // in(0) armed, in(1) throttle, in(2) latched previously
  const latch = s.add('evaluate', 'AirmodeActive', {
    numInputs: 3,
    expression: `(in(0) > 0.5 && (in(2) > 0.5 || in(1) > ${FC.airmodeStartThrottle})) ? 1.0 : 0.0`,
  })
  s.wire(armed, latch, 0)
  s.wire(split, latch, 1, 3)
  s.wire(latchPrev, latch, 2)
  s.wire(latch, latchPrev)
  s.output('armed', armed, 'double')
  s.output('airmode', latch, 'double')
  return s
}

function buildFlightControllerSheet(initialQuat: number[][], altitude0: number): SheetBuilder {
  const s = new SheetBuilder('fc', 'FlightController')
  const sticks = s.input('sticks', 'double[6]')
  const gyro = s.input('gyro', 'double[3]')
  const acc = s.input('accel', 'double[3]')
  const mag = s.input('mag', 'double[3]')
  const pressure = s.input('pressure', 'double')

  // Estimators
  const att = s.add('subsystem', 'AttitudeEstimator', subsystem(['gyro', 'accel', 'mag'], ['quat', 'euler'], buildAttitudeEstimatorSheet(initialQuat)))
  s.wire(gyro, att, 0)
  s.wire(acc, att, 1)
  s.wire(mag, att, 2)
  const alt = s.add('subsystem', 'AltitudeEstimator', subsystem(['accel', 'quat', 'pressure'], ['altitude', 'climb_rate'], buildAltitudeEstimatorSheet(altitude0)))
  s.wire(acc, alt, 0)
  s.wire(att, alt, 1, 0)
  s.wire(pressure, alt, 2)

  // Setpoint: acro rates, or angle mode on the AUX switch
  const rates = s.add('subsystem', 'Rates', subsystem(['sticks'], ['setpoint', 'throttle'], buildRatesSheet()))
  s.wire(sticks, rates)
  const angle = s.add('subsystem', 'AngleMode', subsystem(['sticks', 'euler_est', 'acro_setpoint'], ['setpoint'], buildAngleModeSheet()))
  s.wire(sticks, angle, 0)
  s.wire(att, angle, 1, 1)
  s.wire(rates, angle, 2, 0)

  // Rate loop and mixer
  const filt = s.add('subsystem', 'GyroFilters', subsystem(['gyro'], ['gyro_dps'], buildGyroFilterSheet()))
  s.wire(gyro, filt)
  const arming = s.add('subsystem', 'Arming', subsystem(['sticks'], ['armed', 'airmode'], buildArmingSheet()))
  s.wire(sticks, arming)
  const pid = s.add('subsystem', 'RatePID', subsystem(['setpoint', 'gyro_dps', 'iterm_enable'], ['pid'], buildRatePidSheet()))
  s.wire(angle, pid, 0, 0)
  s.wire(filt, pid, 1, 0)
  s.wire(arming, pid, 2, 1)
  const mixer = s.add('subsystem', 'Mixer', subsystem(['pid', 'throttle'], ['motors'], buildMixerSheet()))
  s.wire(pid, mixer, 0, 0)
  s.wire(rates, mixer, 1, 1)
  // Disarmed: motors stopped
  const motors = s.add('multiply', 'MotorsArmed', { numInputs: 2 })
  s.wire(mixer, motors, 0)
  s.wire(arming, motors, 1, 0)

  s.output('motors', motors, 'double[4]')
  s.output('setpoint', angle, 'double[3]')
  s.output('gyro_dps', filt, 'double[3]')
  s.output('euler_est', att, 'double[3]', 1)
  s.output('altitude_est', alt, 'double', 0)
  s.output('quat_est', att, 'double[4][1]', 0)
  return s
}

// ---------------------------------------------------------------------------
// Top level

export const MOTOR_NAMES = ['Motor_RR', 'Motor_FR', 'Motor_RL', 'Motor_FL']
const MOTOR_OUTPUTS = ['omega', 'thrust', 'omega_dot', 'power']
const FRAME_OUTPUTS = ['pos_ned', 'vel_ned', 'quat', 'euler', 'omega', 'accel']
const FRAME_OUTPUT_TYPES = ['double[3]', 'double[3]', 'double[4][1]', 'double[3]', 'double[3]', 'double[3]']

/** The vehicle model's name; test models reference it by this name. */
export const FPV_VEHICLE_NAME = 'FPV Vehicle'

export interface FpvModelOptions {
  /**
   * The vehicle alone, for embedding with a model reference: the pilot's
   * sticks come in on a top-level Input Port "sticks" (double[6]) and the
   * Telemetry sheet holds only the Output Ports (no scopes, no Tests sheet).
   */
  vehicleOnly?: boolean
  /** Plant only: a constant motor command (default hover) instead of pilot and flight controller. */
  openLoop?: boolean
  motorCommand?: number[]
  sticks?: StickProfile
  /** Initial body rates (rad/s), e.g. to test disturbance rejection. */
  initialOmega?: number[]
  /** 'ideal' sensors report the true state exactly (no noise, bias or quantization). */
  sensors?: 'modelled' | 'ideal'
  /**
   * Initial attitude, ZYX Euler degrees [roll, pitch, yaw]. The attitude
   * estimator starts aligned to it (as if it had converged before take-off).
   */
  initialEuler?: number[]
  /** Initial height (m) above the field; 0 (default) starts at rest on the ground. */
  initialAltitude?: number
  /** Scheduled GNSS conditions and grid convergence (builds with a Pilot; vehicleOnly takes them as inputs) */
  conditions?: ConditionsProfile
}

export function buildFpvModel(opts: FpvModelOptions = {}): { name: string; data: Record<string, unknown> } {
  const main = new SheetBuilder('main', 'Main')
  // Model outputs and scopes live on their own top-level sheet, fed by sheet
  // labels, so the main diagram stays about the vehicle
  const telemetry = new SheetBuilder('telemetry', 'Telemetry')
  const published = new Map<string, string>()
  const publish = (name: string, from: string, dataType: string, port = 0) => {
    const tag = main.add('sheet_label_sink', `Tag_${name}`, { signalName: name })
    main.wire(from, tag, 0, port)
    const src = telemetry.add('sheet_label_source', `From_${name}`, { signalName: name })
    telemetry.output(name, src, dataType)
    published.set(name, src)
  }
  const initialQuat = eulerToQuat(opts.initialEuler ?? [0, 0, 0])
  const altitude0 = Math.max(0, opts.initialAltitude ?? 0)
  const split = main.add('demux', 'MotorCmdSplit', { outputCount: 4, inputDimensions: [4] })
  let fc: string | null = null
  if (opts.openLoop) {
    const hover = Number(HOVER_COMMAND.toFixed(6))
    const cmd = main.constant('MotorCmd', opts.motorCommand ?? [hover, hover, hover, hover], 'double[4]')
    main.wire(cmd, split)
  } else {
    const pilot = opts.vehicleOnly
      ? main.input('sticks', 'double[6]')
      : main.add('subsystem', 'Pilot', subsystem([], ['sticks'], buildPilotSheet(opts.sticks ?? DEMO_STICKS)))
    // GNSS conditions and grid convergence: Input Ports on the vehicle, or a
    // Conditions schedule. Wired to their consumers in later phases.
    if (opts.vehicleOnly) {
      for (const [name, type] of VEHICLE_INPUTS.slice(1)) main.input(name, type)
    } else {
      main.add('subsystem', 'Conditions', subsystem([], VEHICLE_INPUTS.slice(1).map(([n]) => n), buildConditionsSheet(opts.conditions)))
    }
    fc = main.add('subsystem', 'FlightController', {
      ...subsystem(['sticks', 'gyro', 'accel', 'mag', 'pressure'], FC_OUTPUTS, buildFlightControllerSheet(initialQuat, altitude0), FC_SIZE),
      sampleTimeSec: FC.ts,
    })
    main.wire(pilot, fc, 0)
    main.wire(fc, split, 0, 0)
  }

  const motorDef = buildMotorSheet()
  const motorIds = MOTOR_NAMES.map((name, i) => {
    const params =
      i === 0
        ? subsystem(['cmd', 'voltage'], MOTOR_OUTPUTS, motorDef, MOTOR_SIZE)
        : {
            ...MOTOR_SIZE,
            inputPorts: ['cmd', 'voltage'],
            outputPorts: MOTOR_OUTPUTS,
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
  const accelVec = main.add('mux', 'RotorAccelerations', { rows: 4, cols: 1, baseType: 'double', outputType: 'double[4]' })
  const powerVec = main.add('mux', 'MotorPower', { rows: 4, cols: 1, baseType: 'double', outputType: 'double[4]' })
  motorIds.forEach((id, i) => {
    main.wire(id, thrustVec, i, 1)
    main.wire(id, omegaVec, i, 0)
    main.wire(id, accelVec, i, 2)
    main.wire(id, powerVec, i, 3)
  })
  // Supply: the battery model, or (open loop) a fixed reference voltage
  let supply: string
  if (opts.openLoop) {
    supply = main.constant('SupplyVoltage', BATTERY.referenceVoltage, 'double')
  } else {
    supply = main.add('subsystem', 'Battery', subsystem(['motor_power'], ['voltage', 'current', 'soc'], buildBatterySheet()))
    main.wire(powerVec, supply)
    publish('battery_voltage', supply, 'double', 0)
    publish('battery_current', supply, 'double', 1)
    publish('battery_soc', supply, 'double', 2)
  }
  motorIds.forEach(id => main.wire(supply, id, 1, 0))

  const z0 = altitude0 > 0 ? -LOCATION.elevationM - altitude0 : -LOCATION.elevationM + GROUND_REST_Z
  const frame = main.add('subsystem', 'Frame', subsystem(['thrust', 'rotor_accel'], FRAME_OUTPUTS, buildFrameSheet(opts.initialOmega, initialQuat, [0, 0, z0]), FRAME_SIZE))
  main.wire(thrustVec, frame, 0)
  main.wire(accelVec, frame, 1)
  if (fc) {
    const sensors = main.add('subsystem', 'Sensors', subsystem(
      ['pos_ned', 'quat', 'omega', 'specific_force'], ['gyro', 'accel', 'mag', 'pressure'],
      buildSensorsSheet(opts.sensors === 'ideal', altitude0), SENSORS_SIZE))
    main.wire(frame, sensors, 0, 0)
    main.wire(frame, sensors, 1, 2)
    main.wire(frame, sensors, 2, 4)
    main.wire(frame, sensors, 3, 5)
    for (let i = 0; i < 4; i++) main.wire(sensors, fc, i + 1, i)
    publish('imu_gyro', sensors, 'double[3]', 0)
    publish('imu_accel', sensors, 'double[3]', 1)
    publish('mag', sensors, 'double[3]', 2)
    publish('pressure', sensors, 'double', 3)
  }

  FRAME_OUTPUTS.forEach((name, i) => publish(name, frame, FRAME_OUTPUT_TYPES[i]!, i))
  publish('motor_omega', omegaVec, 'double[4]')
  if (fc) {
    publish('motor_cmd', fc, 'double[4]', 0)
    publish('rate_setpoint', fc, 'double[3]', 1)
    publish('gyro_dps', fc, 'double[3]', 2)
    publish('euler_est', fc, 'double[3]', 3)
    publish('altitude_est', fc, 'double', 4)
    publish('quat_est', fc, 'double[4][1]', 5)
  }

  // Scopes, on the Telemetry sheet
  const displays: Array<[string, string]> = [
    ['Position', 'pos_ned'],
    ['Attitude', 'euler'],
    ['RotorSpeed', 'motor_omega'],
  ]
  if (fc) {
    displays.push(['RateSetpoint', 'rate_setpoint'], ['GyroRate', 'gyro_dps'], ['MotorCommand', 'motor_cmd'],
      ['AttitudeEstimate', 'euler_est'], ['AltitudeEstimate', 'altitude_est'], ['Battery', 'battery_voltage'])
  } else {
    displays.push(['BodyRates', 'omega'])
  }
  if (!opts.vehicleOnly) {
    for (const [label, signal] of displays) {
      const d = telemetry.add('signal_display', label, { maxSamples: 10000 })
      telemetry.wire(published.get(signal)!, d)
    }
  }

  // The default demo flight carries its pass/fail checks on a Tests sheet
  const isDefaultDemo =
    !!fc && !opts.vehicleOnly && opts.sticks === undefined && !opts.initialAltitude && !opts.initialEuler && !opts.initialOmega
  let sheets: Sheet[] = [main.sheet(), telemetry.sheet()]
  if (isDefaultDemo) sheets.push(buildTestsSheet().sheet())
  sheets = tuneModelLayout(sheets as any, null, {
    ...DEFAULT_TUNE_OPTIONS,
    cleanUpLayout: true,
    resizeSubsystems: false,
    scope: 'model',
  }).sheets as unknown as Sheet[]
  fitExtents(sheets)

  const model = {
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
          `Site: ${LOCATION.name}, ${LOCATION.latitudeDeg} N ${-LOCATION.longitudeDeg} W, elevation ${LOCATION.elevationM.toFixed(1)} m; ` +
          `WMM2025 field (${LOCATION.epoch}) N/E/D ${SITE_FIELD.ned.join(' / ')} uT. ` +
          'Sensors: IMU (gyro, accelerometer) at 1 kHz, magnetometer at 100 Hz and barometer at 50 Hz with datasheet noise, ' +
          'bias, quantization and range; the controller flies on the sensor gyro and runs a Mahony attitude filter and a ' +
          'baro/accelerometer altitude filter. ' +
          'Motors draw from a 4S LiPo battery model (state of charge, internal resistance; speed scales with voltage) and ' +
          'their rotor-acceleration reaction torque is included. ' +
          'Ground contact (spring-damper legs) and Betaflight-style arming: the Pilot subsystem arms at 0.25 s, takes off ' +
          'from rest on the field, hovers, then in angle (self-level) mode flies a 24 deg bank, an 18 deg forward pitch and a ' +
          'yaw turn. Model outputs and scopes are on the Telemetry sheet (run results show there). ' +
          'Assert blocks on the Tests sheet check the flight: arming, the climb, each manoeuvre, the estimators and the ' +
          'battery (npm run obliq:test -- "FPV Quadcopter"). ' +
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
  if (opts.vehicleOnly) {
    model.name = FPV_VEHICLE_NAME
    model.data.metadata.description =
      '5-inch FPV quadcopter vehicle, for embedding in test models with a Model Reference block. ' +
      'Frame and 6-DOF body, four motor/propeller subsystems, 4S battery, IMU/magnetometer/barometer models, ground contact ' +
      `and a Betaflight-style flight controller (acro and angle modes, arming, Mahony and altitude estimators) at ${LOCATION.name}. ` +
      'Input: sticks = [roll, pitch, yaw, throttle, AUX1 angle mode, AUX2 arm] (double[6], sticks -1..1, throttle 0..1, switches above 0.5 on). ' +
      'Outputs (Telemetry sheet): the true state, sensor readings, motor commands and speeds, rate setpoints, estimates and battery. ' +
      'Test models such as "FPV Demo Flight" drive it and check it with Assert blocks. Built by scripts/build-fpv-reference-model.ts; ' +
      'see docs/fpv-reference-model-plan.md.'
  }
  return model
}

// ---------------------------------------------------------------------------
// Test models: a Pilot and the FPV Vehicle (by model reference), with scopes
// on a Telemetry sheet and Assert blocks on a Tests sheet

export interface FpvTestSpec {
  name: string
  description: string
  sticks: StickProfile
  /** Simulated seconds */
  duration: number
  /** Telemetry scopes: [label, vehicle output] */
  displays: Array<[string, string]>
  /** The Tests sheet (Assert blocks reading vehicle outputs through sheet labels) */
  tests: () => SheetBuilder
  /** GNSS conditions and grid convergence over time (defaults: open sky, the site's γ) */
  conditions?: ConditionsProfile
  /** The vehicle model to reference by name (default FPV_VEHICLE_NAME) */
  vehicleName?: string
}

/**
 * A test model that embeds the vehicle. The reference records the vehicle's
 * name, so it resolves after the models are imported or seeded (new ids).
 */
export function buildFpvTestModel(spec: FpvTestSpec): { name: string; data: Record<string, unknown> } {
  const vehicle = buildFpvModel({ vehicleOnly: true })
  const iface = modelInterface(vehicle.data as any)

  const telemetry = new SheetBuilder('telemetry', 'Telemetry')
  for (const [label, signal] of spec.displays) {
    const src = telemetry.add('sheet_label_source', `From_${signal}`, { signalName: signal })
    const d = telemetry.add('signal_display', label, { maxSamples: 10000 })
    telemetry.wire(src, d)
  }
  const tests = spec.tests()

  // Publish from the vehicle every output the other sheets read
  const used = new Set<string>()
  for (const sheet of [telemetry, tests]) {
    for (const b of sheet.blocks) {
      if (b.type === 'sheet_label_source') used.add(String(b.parameters?.signalName))
    }
  }
  const main = new SheetBuilder('main', 'Main')
  const pilot = main.add('subsystem', 'Pilot', subsystem([], ['sticks'], buildPilotSheet(spec.sticks)))
  const vehicleBlock = main.add('subsystem', 'Vehicle', {
    showPortNames: true,
    sheets: [],
    inputPorts: iface.inputs,
    outputPorts: iface.outputs,
    modelRef: { modelId: FPV_VEHICLE_REF_ID, version: null, name: spec.vehicleName ?? FPV_VEHICLE_NAME },
    modelRefName: spec.vehicleName ?? FPV_VEHICLE_NAME,
  })
  main.wire(pilot, vehicleBlock, iface.inputs.indexOf('sticks'))
  // Every other vehicle input comes from the Conditions schedule, by name
  const condOutputs = VEHICLE_INPUTS.slice(1).map(([n]) => n)
  const conditions = main.add('subsystem', 'Conditions', subsystem([], condOutputs, buildConditionsSheet(spec.conditions)))
  for (const name of iface.inputs) {
    if (name === 'sticks') continue
    const k = condOutputs.indexOf(name)
    if (k < 0) throw new Error(`${spec.name}: no Conditions output for vehicle input ${name}`)
    main.wire(conditions, vehicleBlock, iface.inputs.indexOf(name), k)
  }
  for (const signal of iface.outputs) {
    if (!used.has(signal)) continue
    const tag = main.add('sheet_label_sink', `Tag_${signal}`, { signalName: signal })
    main.wire(vehicleBlock, tag, 0, iface.outputs.indexOf(signal))
  }
  const missing = [...used].filter(sig => !iface.outputs.includes(sig))
  if (missing.length) throw new Error(`${spec.name}: the vehicle has no output ${missing.join(', ')}`)

  let sheets: Sheet[] = [main.sheet(), telemetry.sheet(), tests.sheet()]
  sheets = tuneModelLayout(sheets as any, null, {
    ...DEFAULT_TUNE_OPTIONS,
    cleanUpLayout: true,
    resizeSubsystems: false,
    scope: 'model',
  }).sheets as unknown as Sheet[]
  fitExtents(sheets)
  return {
    name: spec.name,
    data: {
      version: '2.2',
      metadata: { created: '2026-10-21T00:00:00.000Z', description: spec.description },
      globalSettings: { simulationTimeStep: FPV.dt, simulationDuration: spec.duration, integrationAlgorithm: 'rk4', debugMath: false },
      parameters: [],
      dataStores: [],
      sheets,
    },
  }
}

/**
 * Placeholder id for the vehicle in shipped test models. No store has it, so
 * the reference falls back to the model named FPV_VEHICLE_NAME (and the
 * editor then records that model's real id).
 */
export const FPV_VEHICLE_REF_ID = 'reference-model:fpv-vehicle'

const DEMO_DISPLAYS: Array<[string, string]> = [
  ['Position', 'pos_ned'], ['Attitude', 'euler'], ['RotorSpeed', 'motor_omega'], ['RateSetpoint', 'rate_setpoint'],
  ['GyroRate', 'gyro_dps'], ['MotorCommand', 'motor_cmd'], ['AttitudeEstimate', 'euler_est'],
  ['AltitudeEstimate', 'altitude_est'], ['Battery', 'battery_voltage'],
]

/** The default demo flight as a test model: the original FPV model's Pilot, scopes and Tests sheet. */
export function buildFpvDemoFlightModel() {
  return buildFpvTestModel({
    name: 'FPV Demo Flight',
    description:
      'Test model for the FPV Vehicle: the Pilot arms at 0.25 s, takes off from the field, hovers, then in angle mode flies a ' +
      '24 deg bank, an 18 deg forward pitch and a yaw turn. The Vehicle block is a Model Reference to "FPV Vehicle". ' +
      'Scopes are on the Telemetry sheet; Assert blocks on the Tests sheet check arming, the climb, each manoeuvre, ' +
      'the estimators and the battery (npm run obliq:test -- "FPV Demo Flight").',
    sticks: DEMO_STICKS,
    duration: 5,
    displays: DEMO_DISPLAYS,
    tests: buildTestsSheet,
  })
}

/**
 * Acro rate step: take off as in the demo, then in acro mode a 0.3 roll stick
 * step (75 deg/s) held 0.23 s, reversed for 0.23 s to roll back, and released.
 */
export const ACRO_STEP_STICKS: StickProfile = {
  roll: [[0, 0], [2.0, 0], [2.02, 0.3], [2.25, 0.3], [2.27, -0.3], [2.5, -0.3], [2.52, 0]],
  pitch: [[0, 0]],
  yaw: [[0, 0]],
  throttle: DEMO_STICKS.throttle,
  aux: [[0, 0]],
  arm: DEMO_STICKS.arm,
}

/** Limits for the acro rate step (deg/s and deg), around the flown response. */
export const ACRO_STEP_TESTS = {
  /** After the overshoot, roll rate within this of the 75 deg/s setpoint */
  rateTrackDps: 10,
  rollRightWindow: [2.14, 2.25] as [number, number],
  rollLeftWindow: [2.42, 2.5] as [number, number],
  /** Peak roll rate while stepping (the reversal swings 150 deg/s) */
  peakDps: 140,
  stepWindow: [2.0, 2.6] as [number, number],
  /** Pitch and yaw rates stay quiet during a pure roll step */
  crossAxisDps: 5,
  /** Back within this of level once the stick is released */
  levelFrom: 2.7,
  levelDeg: 3,
  uprightDeg: 60,
}

function buildAcroStepTestsSheet(): SheetBuilder {
  const t = ACRO_STEP_TESTS
  const s = new SheetBuilder('tests', 'Tests')
  const R2D = Number((180 / Math.PI).toFixed(4))
  const from = (signal: string) => s.add('sheet_label_source', `From_${signal}`, { signalName: signal })
  const pick = (name: string, src: string, indices: number[]) => {
    const id = s.add('selector', name, { indices })
    s.wire(src, id)
    return id
  }
  const check = (name: string, input: string, params: Record<string, unknown>, expected?: string) => {
    const id = s.add('assert', name, { mode: 'bounds', checkFrom: 0, checkUntil: null, onFailure: 'record', ...params })
    s.wire(input, id, 0)
    if (expected) s.wire(expected, id, 1)
  }
  const gyro = from('gyro_dps')
  const setpoint = from('rate_setpoint')
  const eulerDeg = s.add('scale', 'EulerDeg', { gain: R2D })
  s.wire(from('euler'), eulerDeg)
  const rollRate = pick('RollRate', gyro, [0])
  const rollSetpoint = pick('RollRateSetpoint', setpoint, [0])
  const pitchYawRate = pick('PitchYawRate', gyro, [1, 2])
  const rollPitch = pick('RollPitch', eulerDeg, [0, 1])

  const track = { mode: 'near', absTol: t.rateTrackDps, relTol: 0 }
  check('RollRateTracksRight', rollRate, { ...track, checkFrom: t.rollRightWindow[0], checkUntil: t.rollRightWindow[1] }, rollSetpoint)
  check('RollRateTracksLeft', rollRate, { ...track, checkFrom: t.rollLeftWindow[0], checkUntil: t.rollLeftWindow[1] }, rollSetpoint)
  check('RollRatePeakBounded', rollRate, { lower: -t.peakDps, upper: t.peakDps, checkFrom: t.stepWindow[0], checkUntil: t.stepWindow[1] })
  check('PitchYawQuiet', pitchYawRate, { lower: -t.crossAxisDps, upper: t.crossAxisDps, checkFrom: t.stepWindow[0], checkUntil: t.stepWindow[1] })
  check('ReturnsLevel', pick('Roll', eulerDeg, [0]), { lower: -t.levelDeg, upper: t.levelDeg, checkFrom: t.levelFrom })
  check('StaysUpright', rollPitch, { lower: -t.uprightDeg, upper: t.uprightDeg, onFailure: 'stop' })
  return s
}

/** A focused test model: the acro roll-rate step response. */
export function buildFpvAcroRateStepModel() {
  return buildFpvTestModel({
    name: 'FPV Acro Rate Step',
    description:
      'Test model for the FPV Vehicle: after take-off, in acro mode, a 75 deg/s roll-rate step and its reversal. ' +
      'Assert blocks on the Tests sheet check that the roll rate settles on its setpoint, the overshoot is bounded, ' +
      'pitch and yaw stay quiet, and the quad returns level. The Vehicle block is a Model Reference to "FPV Vehicle" ' +
      '(npm run obliq:test -- "FPV Acro Rate Step").',
    sticks: ACRO_STEP_STICKS,
    duration: 3,
    displays: [['GyroRate', 'gyro_dps'], ['RateSetpoint', 'rate_setpoint'], ['Attitude', 'euler'], ['MotorCommand', 'motor_cmd']],
    tests: buildAcroStepTestsSheet,
  })
}

/** The FPV files shipped in reference-models/: [file name, model]. */
export function SHIPPED_FPV_MODELS(): Array<[string, { name: string; data: Record<string, unknown> }]> {
  return [
    ['fpv-vehicle.json', buildFpvModel({ vehicleOnly: true })],
    ['fpv-demo-flight.json', buildFpvDemoFlightModel()],
    ['fpv-acro-rate-step.json', buildFpvAcroRateStepModel()],
  ]
}

/**
 * T00: the Tests-sheet helpers checked on signals with known answers (a
 * ramp, a 0.5 Hz sine, unit Gaussian noise), so the test infrastructure is
 * itself tested. No vehicle.
 */
export function buildFpvHelpersTestModel(): { name: string; data: Record<string, unknown> } {
  const s = new SheetBuilder('tests', 'Tests')
  const h = new TestHelpers(s)
  const t = h.clock()
  const check = (name: string, input: string, lower: number, upper: number, from = 0, until: number | null = null) => {
    const id = s.add('assert', name, { mode: 'bounds', lower, upper, checkFrom: from, checkUntil: until, onFailure: 'record' })
    s.wire(input, id)
  }
  const after2 = s.add('evaluate', 'After2s', { numInputs: 1, expression: '(in(0) > 2.0) ? 1.0 : 0.0' })
  s.wire(t, after2)
  const sine = s.add('evaluate', 'Sine', { numInputs: 1, expression: `sin(${Math.PI} * in(0))` })
  s.wire(t, sine)
  const noise = s.add('random_noise', 'UnitNoise', { distribution: 'gaussian', mean: 0, stdDev: 1, seed: 7, sampleTime: 0, dataType: 'double' })
  const phase = s.add('evaluate', 'WholeSeconds', { numInputs: 1, expression: 'floor(in(0))' })
  s.wire(t, phase)

  const latched = h.latch('LatchAfter2s', after2)
  check('LatchOffBefore', latched, 0, 0, 0, 1.99)
  check('LatchOnAfter', latched, 1, 1, 2.01)
  const first = h.firstTime('FirstAfter2s', after2)
  check('FirstTimeUnsetBefore', first, -1, -1, 0, 1.99)
  check('FirstTimeRecorded', first, 2.0, 2.0011, 2.01)
  check('RunningMax', h.runMax('SineMax', sine), 0.999, 1.0, 1.6)
  check('RunningMin', h.runMin('SineMin', sine), -1.0, -0.999, 1.6)
  check('HeldAt3s', h.heldAt('ClockAt3s', t, 3), 2.999, 3.0, 3.01)
  // Two whole periods: mean of sin² is 1/2
  check('SineMeanSquare', h.windowMeanSquare('SineMS', sine, 1, 5), 0.499, 0.501, 5.01)
  // 8000 unit-variance samples: the estimate's standard deviation is 0.016
  check('NoiseMeanSquare', h.windowMeanSquare('NoiseMS', noise, 1, 5), 0.95, 1.05, 5.01)
  // A half-period lag (1 s) inverts the sine; a quarter period (0.5 s) is uncorrelated
  check('CorrHalfPeriod', h.windowCorr('SineCorr1s', sine, 10, 0.1, 1, 5.5), -1.0, -0.98, 5.51)
  check('CorrQuarterPeriod', h.windowCorr('SineCorr05s', sine, 5, 0.1, 1, 5.5), -0.05, 0.05, 5.51)
  const visited = h.phaseVisited('Visited3', phase, 3)
  check('PhaseNotYetVisited', visited, 0, 0, 0, 2.99)
  check('PhaseVisited', visited, 1, 1, 3.01)

  let sheets: Sheet[] = [s.sheet()]
  sheets = tuneModelLayout(sheets as any, null, { ...DEFAULT_TUNE_OPTIONS, cleanUpLayout: true, resizeSubsystems: false, scope: 'model' }).sheets as unknown as Sheet[]
  fitExtents(sheets)
  return {
    name: 'FPV T00 Test Helpers',
    data: {
      version: '2.2',
      metadata: {
        created: '2026-10-28T00:00:00.000Z',
        description:
          'Checks the Tests-sheet helpers used by the FPV test models (latch, first-event time, running extremes, ' +
          'value held at a time, windowed mean square and lag correlation, phase visited) on a ramp, a 0.5 Hz sine ' +
          'and unit Gaussian noise. See docs/fpv-hud-gnss-test-plan.md.',
      },
      globalSettings: { simulationTimeStep: FPV.dt, simulationDuration: 6, integrationAlgorithm: 'rk4', debugMath: false },
      parameters: [],
      dataStores: [],
      sheets,
    },
  }
}

/** A test model renamed for the validation suite ("FPV Tnn …"). */
const renamed = (model: { name: string; data: Record<string, unknown> }, name: string) => ({ ...model, name })

/**
 * The validation suite written to test-models/fpv/ (docs/fpv-hud-gnss-test-plan.md):
 * its own copy of the vehicle, so the folder runs on its own with
 * `npm run obliq:test -- test-models/fpv/*.json`, and the Tnn test models.
 */
export function TEST_FPV_MODELS(): Array<[string, { name: string; data: Record<string, unknown> }]> {
  return [
    ['fpv-vehicle.json', buildFpvModel({ vehicleOnly: true })],
    ['t00-test-helpers.json', buildFpvHelpersTestModel()],
    ['t01-demo-flight.json', renamed(buildFpvDemoFlightModel(), 'FPV T01 Demo Flight')],
    ['t02-acro-rate-step.json', renamed(buildFpvAcroRateStepModel(), 'FPV T02 Acro Rate Step')],
  ]
}

/** Grow each sheet's extents to cover its laid-out blocks. */
/**
 * The Tests sheet: Assert blocks that check the default demo flight against
 * DEMO_TESTS, fed by sheet labels from Main like the Telemetry sheet.
 */
function buildTestsSheet(): SheetBuilder {
  const t = DEMO_TESTS
  const s = new SheetBuilder('tests', 'Tests')
  // Rounded so the Scale blocks stay readable; 4e-7 relative error is far
  // inside every limit
  const R2D = Number((180 / Math.PI).toFixed(4))
  const from = (signal: string) => s.add('sheet_label_source', `From_${signal}`, { signalName: signal })
  const pick = (name: string, src: string, indices: number[]) => {
    const id = s.add('selector', name, { indices })
    s.wire(src, id)
    return id
  }
  const check = (name: string, input: string, params: Record<string, unknown>, expected?: string) => {
    const id = s.add('assert', name, { mode: 'bounds', checkFrom: 0, checkUntil: null, onFailure: 'record', ...params })
    s.wire(input, id, 0)
    if (expected) s.wire(expected, id, 1)
  }

  const motorCmd = from('motor_cmd')
  const pos = from('pos_ned')
  const euler = from('euler')
  const eulerDeg = s.add('scale', 'EulerDeg', { gain: R2D })
  s.wire(euler, eulerDeg)
  const eulerEstDeg = s.add('scale', 'EulerEstimateDeg', { gain: R2D })
  s.wire(from('euler_est'), eulerEstDeg)
  const rollPitch = pick('RollPitch', eulerDeg, [0, 1])
  const down = pick('Down', pos, [2])
  const height = s.add('evaluate', 'HeightAboveField', { numInputs: 1, expression: `-${LOCATION.elevationM} - in(0)` })
  s.wire(down, height)
  const trueAltitude = s.add('evaluate', 'TrueAltitude', { numInputs: 1, expression: `${SENSORS.baro.homeAltitude} - in(0)` })
  s.wire(down, trueAltitude)

  check('DisarmedMotorsOff', motorCmd, { lower: 0, upper: 0, checkUntil: t.armTime - 0.01 })
  check('ArmedMotorsAtIdle', motorCmd, { lower: FC.motorIdle - 1e-9, upper: 1, checkFrom: t.armTime + 0.05 })
  check('ClimbsAfterTakeoff', height, { lower: t.minHeightM, upper: null, checkFrom: t.climbFrom })
  check('LevelClimb', rollPitch, { lower: -t.levelDeg, upper: t.levelDeg, checkFrom: t.levelWindow[0], checkUntil: t.levelWindow[1] })
  check('BankFollowsStick', pick('Roll', eulerDeg, [0]), { lower: t.bankDeg[0], upper: t.bankDeg[1], checkFrom: t.bankWindow[0], checkUntil: t.bankWindow[1] })
  check('PitchFollowsStick', pick('Pitch', eulerDeg, [1]), { lower: t.pitchDeg[0], upper: t.pitchDeg[1], checkFrom: t.pitchWindow[0], checkUntil: t.pitchWindow[1] })
  check('YawTurnCompletes', pick('Yaw', eulerDeg, [2]), { lower: t.yawDeg[0], upper: t.yawDeg[1], checkFrom: t.yawFrom })
  check('AttitudeEstimateTracks', eulerEstDeg, { mode: 'near', absTol: t.attitudeEstimateDeg, relTol: 0 }, eulerDeg)
  check('AltitudeEstimateTracks', from('altitude_est'), { mode: 'near', absTol: t.altitudeEstimateM, relTol: 0 }, trueAltitude)
  check('BatteryAboveCutoff', from('battery_voltage'), { lower: t.minBatteryV, upper: null })
  check('StaysUpright', rollPitch, { lower: -t.uprightDeg, upper: t.uprightDeg, onFailure: 'stop' })
  return s
}

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
  // Shipped reference models (the vehicle and the test models that embed
  // it), then the validation suite: [reference dir] [test-models dir]
  const write = (dir: string, models: Array<[string, { name: string; data: Record<string, unknown> }]>) => {
    fs.mkdirSync(dir, { recursive: true })
    for (const [file, model] of models) {
      fs.writeFileSync(path.join(dir, file), JSON.stringify(model, null, 2) + '\n')
      console.log(`Wrote ${path.join(dir, file)}`)
    }
  }
  write(process.argv[2] || path.join(__dirname, '..', 'reference-models'), SHIPPED_FPV_MODELS())
  write(process.argv[3] || path.join(__dirname, '..', 'test-models', 'fpv'), TEST_FPV_MODELS())
  console.log(`(hover command ${HOVER_COMMAND.toFixed(4)}, omega_max ${OMEGA_MAX.toFixed(1)} rad/s)`)
}

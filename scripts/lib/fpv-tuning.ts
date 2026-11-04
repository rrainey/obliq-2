/**
 * Measurements of the FPV rate loop, for tuning studies. Each one builds a variant
 * of the model, compiles it to native C and flies it high above the ground.
 * Used by scripts/fpv-tuning-sweep.ts and __tests__/reference-models/fpv-tuning.test.ts.
 */

import {
  buildFpvModel,
  butterworth2,
  HOVER_THROTTLE,
  rescueFlyoutSticks,
  FPV,
  hoverThrottleFor,
  withFpvVariant,
  BATTERY,
  type FpvVariant,
  type SensorMode,
  type StickProfile,
  type VibrationOptions,
} from '../build-fpv-reference-model'
import { cleanupNativeDir, compileAndRunNative } from '../../__tests__/support/nativeCgen'

export const AXES = ['roll', 'pitch', 'yaw'] as const
const R2D = 180 / Math.PI
const STEP_AT_S = 2
const STEP_LENGTH_S = 0.5
/** m: high enough that a test never reaches the ground */
const ALTITUDE_M = 200

export interface FlightRow {
  tS: number
  setpointDps: number[]
  rateDps: number[]
  motorCmd: number[]
  /** The IMU's reading, deg/s */
  imuGyroDps: number[]
  /** After the flight controller's gyro filters, deg/s */
  gyroFilteredDps: number[]
  rotorHz: number[]
}

let runCount = 0

/** Flies a variant at its own hover trim and returns the log at no more than 2 kHz. */
export function flyVariant(
  variant: FpvVariant,
  sticks: (hoverThrottle: number) => StickProfile,
  seconds: number,
  sensors: SensorMode,
  vibration?: VibrationOptions | false
): FlightRow[] {
  return withFpvVariant(variant, () => {
    const hover = hoverThrottleFor(FPV.mass, BATTERY.initialSoc)
    const model = buildFpvModel({ sticks: sticks(hover), sensors, vibration, initialAltitude: ALTITUDE_M })
    const name = `fpvtune_${process.pid}_${runCount++}`
    const steps = Math.round(seconds / FPV.dt)
    const stride = Math.max(1, Math.round(0.0005 / FPV.dt))
    const result = compileAndRunNative({
      modelName: name,
      sheets: (model.data as { sheets: never }).sheets,
      dt: FPV.dt,
      smokeMainBody: `
  ${name}_seed_from_inputs(&model);
  for (int i = 0; i < ${steps}; ++i) {
    ${name}_step(&model);
    if (i % ${stride}) continue;
    const ${name}_outputs_t *o = &model.outputs;
    printf("%.6f", model.time - model.dt);
    for (int k = 0; k < 3; ++k) printf(" %.7g", o->rate_setpoint[k]);
    for (int k = 0; k < 3; ++k) printf(" %.7g", o->omega[k] * ${R2D});
    for (int k = 0; k < 4; ++k) printf(" %.7g", o->motor_cmd[k]);
    for (int k = 0; k < 3; ++k) printf(" %.7g", o->imu_gyro[k] * ${R2D});
    for (int k = 0; k < 3; ++k) printf(" %.7g", o->gyro_dps[k]);
    for (int k = 0; k < 4; ++k) printf(" %.7g", o->motor_omega[k] / ${2 * Math.PI});
    printf("\\n");
  }
  return 0;
`,
    })
    cleanupNativeDir(result.outDir)
    return result.stdout.trim().split('\n').map(line => {
      const v = line.split(' ').map(Number)
      return { tS: v[0]!, setpointDps: v.slice(1, 4), rateDps: v.slice(4, 7), motorCmd: v.slice(7, 11), imuGyroDps: v.slice(11, 14), gyroFilteredDps: v.slice(14, 17), rotorHz: v.slice(17, 21) }
    })
  })
}

const hold = (x: number): Array<[number, number]> => [[0, x]]
const stdDev = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length)
}

export interface StepResult {
  targetDps: number
  /** % above the setpoint */
  overshootPct: number
  /** ms from the start of the stick move */
  t90Ms: number
  /** ms from the start of the stick move until the rate stays within 5% */
  settle5Ms: number
  /** Highest and lowest motor command during and after the step */
  maxMotor: number
  minMotor: number
}

/** A rate step on one axis. Stick 0.4 is 124 deg/s. `rampS` is the time the stick takes to move. */
export function rateStep(
  variant: FpvVariant,
  axis: number,
  opts: { stick?: number; rampS?: number; sensors?: SensorMode } = {}
): StepResult {
  const stick = opts.stick ?? 0.4
  const ramp = opts.rampS ?? 0.001
  const pulse: Array<[number, number]> = [[0, 0], [STEP_AT_S, 0], [STEP_AT_S + ramp, stick], [STEP_AT_S + STEP_LENGTH_S, stick], [STEP_AT_S + STEP_LENGTH_S + ramp, 0]]
  const rows = flyVariant(
    variant,
    thr => ({ roll: axis === 0 ? pulse : hold(0), pitch: axis === 1 ? pulse : hold(0), yaw: axis === 2 ? pulse : hold(0), throttle: hold(thr) }),
    STEP_AT_S + STEP_LENGTH_S + 1,
    opts.sensors ?? 'noiseless'
  )
  const during = rows.filter(r => r.tS >= STEP_AT_S && r.tS < STEP_AT_S + STEP_LENGTH_S)
  const target = during[during.length - 1]!.setpointDps[axis]!
  let peak = 0, t90 = NaN, settle = 0
  for (const r of during) {
    const w = r.rateDps[axis]!
    peak = Math.max(peak, w)
    if (Number.isNaN(t90) && w >= 0.9 * target) t90 = r.tS - STEP_AT_S
    if (Math.abs(w - target) > 0.05 * target) settle = r.tS - STEP_AT_S
  }
  const after = rows.filter(r => r.tS >= STEP_AT_S).flatMap(r => r.motorCmd)
  return {
    targetDps: target,
    overshootPct: (peak / target - 1) * 100,
    t90Ms: t90 * 1000,
    settle5Ms: settle * 1000,
    maxMotor: Math.max(...after),
    minMotor: Math.min(...after),
  }
}

/** deg/s: a tail above this after a small doublet is a sustained oscillation */
const UNSTABLE_TAIL_DPS = 0.5
const DOUBLET_STICK = 0.1
const SCAN_SECONDS = 5

/** Standard deviation of each axis's rate in the last second after a small doublet on all axes. */
export function doubletTailDps(variant: FpvVariant, sensors: SensorMode = 'noiseless'): number[] {
  const x = DOUBLET_STICK
  const doublet: Array<[number, number]> = [[0, 0], [1, 0], [1.001, x], [1.1, x], [1.101, -x], [1.2, -x], [1.201, 0]]
  const rows = flyVariant(variant, thr => ({ roll: doublet, pitch: doublet, yaw: doublet, throttle: hold(thr) }), SCAN_SECONDS, sensors)
  const tail = rows.filter(r => r.tS > SCAN_SECONDS - 1)
  return [0, 1, 2].map(a => stdDev(tail.map(r => r.rateDps[a]!)))
}

export const isStable = (tailDps: number[]) => tailDps.every(x => x <= UNSTABLE_TAIL_DPS)

export const LOOP_GAIN_GRID = [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40]

/** The first grid gain at which each axis oscillates (Infinity if none does): the gain margin, to the grid's resolution. */
export function firstUnstableGain(variant: FpvVariant): number[] {
  const first = [Infinity, Infinity, Infinity]
  for (const k of LOOP_GAIN_GRID) {
    const tail = doubletTailDps({ ...variant, loopGain: (variant.loopGain ?? 1) * k })
    tail.forEach((x, a) => {
      if (x > UNSTABLE_TAIL_DPS && first[a] === Infinity) first[a] = k
    })
    if (first[0] !== Infinity && first[1] !== Infinity) break
  }
  return first
}

export interface MotorNoise {
  /** ‰ of full command */
  sdPermille: number
  /** Total motor command movement per second, at 2 kHz, full ranges per second */
  travelPerS: number
}

/** Motor activity in a steady hover with sensor noise: the signal that heats real motors. */
export function hoverMotorNoise(variant: FpvVariant, vibration: VibrationOptions | false = false): MotorNoise {
  const rows = flyVariant(variant, thr => ({ roll: hold(0), pitch: hold(0), yaw: hold(0), throttle: hold(thr) }), 4, 'modelled', vibration)
  const m = rows.filter(r => r.tS > 2).map(r => r.motorCmd[0]!)
  let travel = 0
  for (let i = 1; i < m.length; i++) travel += Math.abs(m[i]! - m[i - 1]!)
  return { sdPermille: stdDev(m) * 1000, travelPerS: travel / 2 }
}

export interface VibrationLevels {
  /** RMS above 80 Hz of the IMU's reading, deg/s, roll/pitch/yaw */
  rawDps: number[]
  /** RMS above 80 Hz after the flight controller's gyro filters, deg/s */
  filteredDps: number[]
  /** SD above 80 Hz of a motor command, ‰ of full command */
  motorPermille: number
  /** Mean rotor speed, Hz */
  rotorHz: number
}

/** What is left above 80 Hz: x minus a 2nd-order 80 Hz low-pass, run forward. The log analysis uses the same cutoff. */
function aboveEightyHz(xs: number[], ts: number): number[] {
  const { numerator: b, denominator: a } = butterworth2(80, ts)
  let x1 = xs[0]!, x2 = xs[0]!, y1 = xs[0]!, y2 = xs[0]!
  return xs.map(x => {
    const y = b[0]! * x + b[1]! * x1 + b[2]! * x2 - a[1]! * y1 - a[2]! * y2
    x2 = x1; x1 = x; y2 = y1; y1 = y
    return x - y
  })
}

/** Vibration in a steady hover, in the same terms as a blackbox log. */
export function hoverVibration(variant: FpvVariant, scale = 1): VibrationLevels {
  const rows = flyVariant(variant, thr => ({ roll: hold(0), pitch: hold(0), yaw: hold(0), throttle: hold(thr) }), 4, 'modelled', { scale })
  const tail = rows.filter(r => r.tS > 2)
  const ts = tail[1]!.tS - tail[0]!.tS
  const rms = (xs: number[]) => stdDev(aboveEightyHz(xs, ts).slice(40))
  return {
    rawDps: [0, 1, 2].map(a => rms(tail.map(r => r.imuGyroDps[a]!))),
    filteredDps: [0, 1, 2].map(a => rms(tail.map(r => r.gyroFilteredDps[a]!))),
    motorPermille: rms(tail.map(r => r.motorCmd[0]!)) * 1000,
    rotorHz: tail.reduce((t, r) => t + r.rotorHz.reduce((p, q) => p + q, 0) / 4, 0) / tail.length,
  }
}

export interface RescueFlight {
  /** s; NaN if the phase was not reached */
  flyHomeS: number
  descentS: number
  landingS: number
  /** deg: SD about a 1 s moving mean, the unsteadiness a pilot sees */
  flyHomePitchDeg: number
  landingPitchDeg: number
  landingRollDeg: number
  /** m/s: mean ground speed in FLY_HOME, from 4.5 s after it starts */
  flyHomeSpeedMps: number
  /** m: from home at disarm */
  landDistanceM: number
  disarmed: boolean
}

const RESCUE_ON_S = 20
const PHASE = { flyHome: 4, descent: 5, landing: 6 }

/** SD of a signal about its own 1 s moving mean. */
function jitterDeg(xs: number[], samplesPerS: number): number {
  const half = Math.round(samplesPerS / 2)
  const sum = [0]
  for (const x of xs) sum.push(sum[sum.length - 1]! + x)
  const d = xs.map((x, i) => {
    const lo = Math.max(0, i - half), hi = Math.min(xs.length, i + half)
    return x - (sum[hi]! - sum[lo]!) / (hi - lo)
  })
  return Math.sqrt(d.reduce((a, x) => a + x * x, 0) / d.length)
}

/** The T11 flight on any airframe: fly out about 80 m, then the rescue switch. Calm air. */
export function rescueFlight(variant: FpvVariant): RescueFlight {
  return withFpvVariant(variant, () => {
    const seconds = 75
    const on: Array<[number, number]> = [[0, 0], [RESCUE_ON_S - 0.001, 0], [RESCUE_ON_S, 1], [seconds, 1]]
    const flyout = rescueFlyoutSticks(on, RESCUE_ON_S)
    const scale = hoverThrottleFor(FPV.mass, BATTERY.initialSoc) / HOVER_THROTTLE
    const sticks = { ...flyout, throttle: flyout.throttle.map(([t, v]): [number, number] => [t, v * scale]) }
    const model = buildFpvModel({ sticks })
    const name = `fpvrescue_${process.pid}_${runCount++}`
    const result = compileAndRunNative({
      modelName: name,
      sheets: (model.data as { sheets: never }).sheets,
      dt: FPV.dt,
      smokeMainBody: `
  ${name}_seed_from_inputs(&model);
  for (int i = 0; i < ${Math.round(seconds / FPV.dt)}; ++i) {
    ${name}_step(&model);
    if (i % 10) continue;
    const ${name}_outputs_t *o = &model.outputs;
    printf("%.3f %.0f %.4f %.4f %.4f %.4f %.4f %.4f %.0f\\n", model.time - model.dt, o->rescue_phase, o->euler[0] * ${R2D}, o->euler[1] * ${R2D},
      o->pos_ned[0], o->pos_ned[1], o->vel_ned[0], o->vel_ned[1], o->fc_armed);
  }
  return 0;
`,
    })
    cleanupNativeDir(result.outDir)
    const rows = result.stdout.trim().split('\n').map(l => l.split(' ').map(Number))
    const samplesPerS = 1 / (rows[1]![0]! - rows[0]![0]!)
    const first = (phase: number) => rows.find(r => r[1] === phase)?.[0] ?? NaN
    const flyHomeS = first(PHASE.flyHome), descentS = first(PHASE.descent), landingS = first(PHASE.landing)
    const off = rows.find(r => r[0]! > landingS && r[8] === 0)
    const span = (a: number, b: number) => rows.filter(r => r[0]! >= a && r[0]! < b)
    const cruise = span(flyHomeS + 4.5, descentS)
    const landing = span(landingS, off?.[0] ?? seconds)
    const home = rows.find(r => r[0]! >= 0.3)!, end = off ?? rows[rows.length - 1]!
    return {
      flyHomeS, descentS, landingS,
      flyHomePitchDeg: jitterDeg(cruise.map(r => r[3]!), samplesPerS),
      landingPitchDeg: jitterDeg(landing.map(r => r[3]!), samplesPerS),
      landingRollDeg: jitterDeg(landing.map(r => r[2]!), samplesPerS),
      flyHomeSpeedMps: cruise.reduce((a, r) => a + Math.hypot(r[6]!, r[7]!), 0) / cruise.length,
      landDistanceM: Math.hypot(end[4]! - home[4]!, end[5]! - home[5]!),
      disarmed: !!off,
    }
  })
}

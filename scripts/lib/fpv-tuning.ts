/**
 * Measurements of the FPV rate loop, for tuning studies. Each one builds a variant
 * of the model, compiles it to native C and flies it high above the ground.
 * Used by scripts/fpv-tuning-sweep.ts and __tests__/reference-models/fpv-tuning.test.ts.
 */

import {
  buildFpvModel,
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
}

let runCount = 0

/** Flies a variant at its own hover trim and returns the log at no more than 2 kHz. */
export function flyVariant(
  variant: FpvVariant,
  sticks: (hoverThrottle: number) => StickProfile,
  seconds: number,
  sensors: SensorMode,
  vibration?: VibrationOptions
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
    printf("\\n");
  }
  return 0;
`,
    })
    cleanupNativeDir(result.outDir)
    return result.stdout.trim().split('\n').map(line => {
      const v = line.split(' ').map(Number)
      return { tS: v[0]!, setpointDps: v.slice(1, 4), rateDps: v.slice(4, 7), motorCmd: v.slice(7, 11) }
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
export function hoverMotorNoise(variant: FpvVariant, vibration?: VibrationOptions): MotorNoise {
  const rows = flyVariant(variant, thr => ({ roll: hold(0), pitch: hold(0), yaw: hold(0), throttle: hold(thr) }), 4, 'modelled', vibration)
  const m = rows.filter(r => r.tS > 2).map(r => r.motorCmd[0]!)
  let travel = 0
  for (let i = 1; i < m.length; i++) travel += Math.abs(m[i]! - m[i - 1]!)
  return { sdPermille: stdDev(m) * 1000, travelPerS: travel / 2 }
}

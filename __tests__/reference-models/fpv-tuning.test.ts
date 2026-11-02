/**
 * The FPV rate tune across mass configurations. One set of gains must fly every
 * airframe in AIRFRAMES within these limits, with the IMU's anti-alias lag and
 * TPA in the loop. Measured values and the reasons for the limits are in
 * docs/fpv-hud-gnss-plan.md, "Tuning across mass configurations". To see all the
 * numbers, run scripts/fpv-tuning-sweep.ts.
 */

import { AIRFRAMES, airframeWith, BATTERY, buildFpvModel, FC, FPV, hoverThrottleFor, HOVER_THROTTLE, withFpvVariant } from '../../scripts/build-fpv-reference-model'
import { doubletTailDps, hoverMotorNoise, hoverVibration, isStable, rateStep } from '../../scripts/lib/fpv-tuning'

jest.setTimeout(600000)

const OVERSHOOT_LIMIT_PCT = [25, 25, 12]
const OVERSHOOT_LOW_CHARGE_LIMIT_PCT = 30
const T90_LIMIT_MS = [55, 55, 100]
/** A step undershoots by about 5%, so this metric can jump by 40 ms for a 1% change: it only catches large changes */
const SETTLE_LIMIT_MS = [200, 200]
/** Loop gain that every airframe must survive: 12 dB, double the usual 6 dB, because the plant has no frame flex or ESC delay */
const REQUIRED_GAIN_MARGIN = 4
const MOTOR_NOISE_LIMIT_PERMILLE = 0.6
const LOW_CHARGE = 0.2
const MOTOR_VIBRATION_LIMIT_PERMILLE = 5

const airframes = Object.entries(AIRFRAMES)

describe('FPV tuning: airframes', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterAll(() => jest.restoreAllMocks())

  it('the baseline airframe is the quad the model ships', () => {
    expect(AIRFRAMES.baseline!.mass).toBe(FPV.mass)
    expect(AIRFRAMES.baseline!.inertia).toEqual(FPV.inertia)
    expect(hoverThrottleFor(FPV.mass, 1)).toBeCloseTo(HOVER_THROTTLE, 9)
    expect(BATTERY.initialSoc).toBe(1)
  })

  it('an added item moves the CG and adds inertia by the parallel-axis theorem', () => {
    // 0.25 kg point mass 0.1 m ahead of a 0.75 kg quad: CG 25 mm forward; reduced mass 0.1875 kg
    const a = airframeWith([{ mass: 0.25, x: 0.1, z: 0 }])
    expect(a.mass).toBeCloseTo(1, 12)
    expect(a.cgX).toBeCloseTo(0.025, 12)
    expect(a.inertia[0]).toBeCloseTo(FPV.inertia[0]!, 12)
    expect(a.inertia[1]).toBeCloseTo(FPV.inertia[1]! + 0.1875 * 0.01, 12)
    expect(a.inertia[2]).toBeCloseTo(FPV.inertia[2]! + 0.1875 * 0.01, 12)
  })

  it.each(airframes)('%s: rate steps stay within the limits on all axes', (_name, airframe) => {
    for (const axis of [0, 1, 2]) {
      const r = rateStep({ airframe }, axis)
      expect(r.overshootPct).toBeLessThan(OVERSHOOT_LIMIT_PCT[axis]!)
      expect(r.t90Ms).toBeLessThan(T90_LIMIT_MS[axis]!)
      if (axis < 2) expect(r.settle5Ms).toBeLessThan(SETTLE_LIMIT_MS[axis]!)
    }
  })

  it.each(airframes)('%s: a battery at 20%% charge keeps roll and pitch overshoot within the limit', (_name, airframe) => {
    for (const axis of [0, 1]) {
      expect(rateStep({ airframe, initialSoc: LOW_CHARGE }, axis).overshootPct).toBeLessThan(OVERSHOOT_LOW_CHARGE_LIMIT_PCT)
    }
  })

  it.each(airframes)('%s: stable at the required loop gain with motor lag 20, 33 and 50 ms', (_name, airframe) => {
    for (const motorTau of [0.02, 0.033, 0.05]) {
      expect(isStable(doubletTailDps({ airframe, motorTau, loopGain: REQUIRED_GAIN_MARGIN }))).toBe(true)
    }
  })

  it.each(airframes)('%s: motor noise in a hover stays within the limit', (_name, airframe) => {
    expect(hoverMotorNoise({ airframe }).sdPermille).toBeLessThan(MOTOR_NOISE_LIMIT_PERMILLE)
  })
})

describe('FPV tuning: model features', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterAll(() => jest.restoreAllMocks())

  it('TPA reduces D above the breakpoint, so overshoot grows', () => {
    expect(rateStep({}, 0).overshootPct).toBeGreaterThan(rateStep({ tpaRatePct: 0 }, 0).overshootPct + 1)
  })

  it('an IMU faster than the controller does not add motor noise: LPF2 runs at the IMU rate', () => {
    const same = hoverMotorNoise({ dt: 0.000125 }).sdPermille
    const fast = hoverMotorNoise({ imuTs: 0.000125, dt: 0.000125 }).sdPermille
    expect(fast / same).toBeLessThan(1.1)
  })

  it('a controller below 2 kHz has no dynamic notch, as in Betaflight', () => {
    const hasBlock = (fn: () => { data: unknown }, name: string) => JSON.stringify(fn().data).includes(`"name":"${name}"`)
    const build = () => buildFpvModel({ sensors: 'ideal', initialAltitude: 10 })
    expect(hasBlock(build, 'DynamicNotch')).toBe(true)
    expect(withFpvVariant({ imuTs: 0.001, fcTs: 0.001 }, () => hasBlock(build, 'DynamicNotch'))).toBe(false)
    expect(withFpvVariant({ imuTs: 0.001, fcTs: 0.001 }, () => hasBlock(build, 'RpmFilter'))).toBe(true)
  })

  it('rotor vibration reaches the motors through the rate loop', () => {
    const quiet = hoverMotorNoise({})
    const shaken = hoverMotorNoise({ rpmHarmonics: 0, dynNotchCount: 0 }, { scale: 1 })
    expect(shaken.sdPermille).toBeGreaterThan(5 * quiet.sdPermille)
  })
})

/**
 * Vibration against one public log: a 4S 5-inch quad, Betaflight 4.3.1 (Oscar Liang's practice log;
 * see docs/fpv-hud-gnss-plan.md, "Notch filters"). One log is an order of magnitude, so the bands are wide.
 */
describe('FPV tuning: vibration and notch filters', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterAll(() => jest.restoreAllMocks())

  it('raw gyro vibration at hover agrees with the log: 4.0 / 3.2 / 2.8 deg/s at a rotor speed of 160-190 Hz', () => {
    const v = hoverVibration({})
    expect(v.rotorHz).toBeGreaterThan(160)
    expect(v.rotorHz).toBeLessThan(190)
    expect(v.rawDps[0]).toBeGreaterThan(2.5)
    expect(v.rawDps[0]).toBeLessThan(5.5)
    expect(v.rawDps[1]).toBeGreaterThan(2)
    expect(v.rawDps[1]).toBeLessThan(4.5)
  })

  it('raw gyro vibration near the frame resonance agrees with the log: 8.7-11 deg/s on roll', () => {
    const v = hoverVibration({ airframe: AIRFRAMES.allUp })
    expect(v.rotorHz).toBeGreaterThan(200)
    expect(v.rotorHz).toBeLessThan(235)
    expect(v.rawDps[0]).toBeGreaterThan(6)
    expect(v.rawDps[0]).toBeLessThan(13)
  })

  it("with the log's filter settings, attenuation and motor activity agree with the log: 8-21 times, 4.5-6.3 per mille", () => {
    const lpf = FC.gyroLpfHz, dyn = { ...FC.dynNotch }
    try {
      FC.gyroLpfHz = [1900, 750] // LPF1 off in the log; 1900 Hz has almost no effect at 2 kHz
      Object.assign(FC.dynNotch, { count: 1, q: 5, minHz: 150 })
      const v = hoverVibration({ airframe: AIRFRAMES.allUp })
      const attenuation = v.rawDps[0]! / v.filteredDps[0]!
      expect(attenuation).toBeGreaterThan(8)
      expect(attenuation).toBeLessThan(40)
      expect(v.motorPermille).toBeGreaterThan(2.5)
      expect(v.motorPermille).toBeLessThan(10)
    } finally {
      FC.gyroLpfHz = lpf
      Object.assign(FC.dynNotch, dyn)
    }
  })

  it.each(airframes)('%s: the notch filters remove most of the vibration', (_name, airframe) => {
    const off = hoverVibration({ airframe, rpmHarmonics: 0, dynNotchCount: 0 })
    const on = hoverVibration({ airframe })
    expect(on.filteredDps[0]!).toBeLessThan(off.filteredDps[0]! / 8)
    expect(on.motorPermille).toBeLessThan(off.motorPermille / 8)
    expect(on.motorPermille).toBeLessThan(MOTOR_VIBRATION_LIMIT_PERMILLE)
  })

  it('each filter alone removes vibration, and together they remove more', () => {
    const none = hoverVibration({ rpmHarmonics: 0, dynNotchCount: 0 }).filteredDps[0]!
    const rpm = hoverVibration({ dynNotchCount: 0 }).filteredDps[0]!
    const dynamic = hoverVibration({ rpmHarmonics: 0 }).filteredDps[0]!
    const both = hoverVibration({}).filteredDps[0]!
    expect(rpm).toBeLessThan(none / 3)
    expect(dynamic).toBeLessThan(none / 3)
    expect(both).toBeLessThan(Math.min(rpm, dynamic))
  })
})

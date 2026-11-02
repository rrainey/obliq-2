/**
 * The FPV rate tune across mass configurations. One set of gains must fly every
 * airframe in AIRFRAMES within these limits, with the IMU's anti-alias lag and
 * TPA in the loop. Measured values and the reasons for the limits are in
 * docs/fpv-hud-gnss-plan.md, "Tuning across mass configurations". To see all the
 * numbers, run scripts/fpv-tuning-sweep.ts.
 */

import { AIRFRAMES, airframeWith, BATTERY, FPV, hoverThrottleFor, HOVER_THROTTLE } from '../../scripts/build-fpv-reference-model'
import { doubletTailDps, hoverMotorNoise, isStable, rateStep } from '../../scripts/lib/fpv-tuning'

jest.setTimeout(600000)

const OVERSHOOT_LIMIT_PCT = [25, 25, 12]
const OVERSHOOT_LOW_CHARGE_LIMIT_PCT = 30
const T90_LIMIT_MS = [55, 55, 100]
const SETTLE_LIMIT_MS = [150, 150]
/** Loop gain that every airframe must survive: 12 dB, double the usual 6 dB, because the plant has no frame flex or ESC delay */
const REQUIRED_GAIN_MARGIN = 4
const MOTOR_NOISE_LIMIT_PERMILLE = 0.6
const LOW_CHARGE = 0.2

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

  it('rotor vibration reaches the motors through the rate loop', () => {
    const quiet = hoverMotorNoise({})
    const shaken = hoverMotorNoise({}, { gyroDps: 1, accelMps2: 0.1 })
    expect(shaken.sdPermille).toBeGreaterThan(5 * quiet.sdPermille)
  })
})

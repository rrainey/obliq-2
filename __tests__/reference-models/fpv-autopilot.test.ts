/**
 * FPV altitude controller and Altitude Hold (docs/fpv-hud-gnss-test-plan.md,
 * Level 2, F36–F37): Betaflight 2025.12's autopilot checked by hand
 * computation at every 100 Hz sample while the hold is active — the throttle
 * formula (P, I, D with boost, F, hover offset, tilt, limits), the I-term
 * rules, the stick factor (deadband, low throttle, AUTO-LAND) and the target.
 */
import {
  buildFpvModel,
  CLIMB_STICKS,
  DEMO_STICKS,
  FAILSAFE_PROCEDURE,
  FC,
  FPV,
  HOVER_THROTTLE,
  type ConditionsProfile,
  type StickProfile,
} from '../../scripts/build-fpv-reference-model'
import { cleanupNativeDir, compileAndRunNative } from '../support/nativeCgen'

jest.setTimeout(300000)

const dirs: string[] = []
afterAll(() => dirs.forEach(cleanupNativeDir))

interface Row {
  active: number; activePrev: number; thrStick: number; stage: number; altCm: number; vario: number; roll: number; pitch: number
  stickFactor: number; targetVel: number; target: number; targetPrev: number; err: number; iTerm: number; iPrev: number; throttle: number
}

describe('FPV altitude controller (Betaflight autopilot)', () => {
  let rows: Row[] = []
  const A = FC.autopilot

  function run(name: string, sticks: StickProfile, seconds: number, conditions?: ConditionsProfile): Row[] {
    const model = buildFpvModel({ sticks, conditions })
    const per = Math.round(A.ts / FPV.dt)
    const g = 'g->FlightController_AltHold_'
    const result = compileAndRunNative({
      modelName: name,
      sheets: (model.data as any).sheets,
      dt: FPV.dt,
      smokeMainBody: `
  ${name}_seed_from_inputs(&model);
  double prevActive = 0, prevTarget = 0, prevI = 0;
  for (int i = 0; i < ${Math.round(seconds / FPV.dt)}; ++i) {
    ${name}_step(&model);
    if (i % ${per} != 0) continue;
    const ${name}_outputs_t *o = &model.outputs;
    const ${name}_signals_t *g = &model.signals;
    printf("%.17g %.17g %.17g %.17g %.17g %.17g %.17g %.17g %.17g %.17g %.17g %.17g %.17g %.17g %.17g %.17g\\n",
      ${g}Active, prevActive, g->FlightController_FailsafeStickSplit_3, o->failsafe_stage, ${g}AltitudeCm, o->vario_est,
      o->euler_est[0], o->euler_est[1], ${g}StickFactor, ${g}TargetVelocity, ${g}TargetCm, prevTarget,
      ${g}AltitudeErrorCm, ${g}ITerm, prevI, ${g}Throttle);
    prevActive = ${g}Active; prevTarget = ${g}TargetCm; prevI = ${g}ITerm;
  }
  return 0;
`,
    })
    dirs.push(result.outDir)
    return result.stdout.trim().split('\n').map(line => {
      const v = line.trim().split(' ').map(Number)
      return {
        active: v[0]!, activePrev: v[1]!, thrStick: v[2]!, stage: v[3]!, altCm: v[4]!, vario: v[5]!, roll: v[6]!, pitch: v[7]!,
        stickFactor: v[8]!, targetVel: v[9]!, target: v[10]!, targetPrev: v[11]!, err: v[12]!, iTerm: v[13]!, iPrev: v[14]!, throttle: v[15]!,
      }
    })
  }

  beforeAll(() => {
    const hov = Number(HOVER_THROTTLE.toFixed(4))
    // Climb, engage the hold at 3 s; stick in the deadband, then above, then below it, then low; a banked climb
    const sticks: StickProfile = {
      roll: [[0, 0], [5, 0], [5.5, 0.4], [6.5, 0.4], [7, 0], [8.4, 0], [8.5, 0.6], [9.5, 0.6], [9.6, 0]], pitch: [[0, 0]], yaw: [[0, 0]], aux: [[0, 1]], arm: DEMO_STICKS.arm,
      throttle: [[0, 0], [1.0, 0], [1.001, 0.6], [1.6, 0.6], [1.601, hov], [8, hov], [8.001, 0.9], [10, 0.9], [10.001, 0.06], [12, 0.06], [12.001, 0]],
      hold: [[0, 0], [2.999, 0], [3, 0.5]],
    }
    // AUTO-LAND arresting the stage-1 drop: D boost drives the throttle into its limit
    const autoLand: ConditionsProfile = { rcLinkValid: [[0, 1], [9.999, 1], [10, 0]], failsafeProcedure: FAILSAFE_PROCEDURE.autoLand }
    rows = [...run('fpvap', sticks, 14), ...run('fpvapland', CLIMB_STICKS, 16, autoLand)]
  })

  const activeRows = () => rows.filter(r => r.active === 1)

  test('the hold engages, and the scenario exercises every stick region', () => {
    expect(activeRows().length).toBeGreaterThan(900)
    const factors = activeRows().map(r => r.stickFactor)
    expect(factors.some(f => f > 0)).toBe(true)
    expect(factors.some(f => f < 0)).toBe(true)
    expect(factors.filter(f => f === 0).length).toBeGreaterThan(100)
    expect(activeRows().some(r => r.stage > 1.5)).toBe(true)
  })

  test('stick factor: 0 in the deadband and at low throttle, linear to ±1 outside it; the AUTO-LAND descent factor', () => {
    const hover = A.hoverUs
    const low = hover - A.deadband * (hover - 1000), high = hover + A.deadband * (2000 - hover)
    for (const r of activeRows()) {
      const us = 1000 + 1000 * r.thrStick
      const expected = r.stage > 1.5
        ? -(0.9 + Math.min(Math.max(r.altCm / 2000, 0.1), 9)) // AUTO-LAND: faster when higher
        : r.thrStick < FC.minCheck ? 0 : us < low ? (us - 1000) / (low - 1000) - 1 : us > high ? (us - high) / (2000 - high) : 0
      expect(Math.abs(r.stickFactor - expected)).toBeLessThan(1e-12)
      expect(Math.abs(r.targetVel - expected * A.climbRateCmS)).toBeLessThan(1e-9)
    }
  })

  test('target: the altitude on entry, then moved by the target velocity only within 1 s of travel', () => {
    for (const r of activeRows()) {
      const expected = r.activePrev === 0
        ? r.altCm
        : Math.abs(r.altCm - r.targetPrev) < A.climbRateCmS ? r.targetPrev + r.targetVel * A.ts : r.targetPrev
      expect(Math.abs(r.target - expected)).toBeLessThan(1e-9)
    }
    expect(activeRows().some(r => r.activePrev === 1 && r.target !== r.targetPrev)).toBe(true)
  })

  test('I: reset on entry, 0.1× beyond 2 m of error, limited to ±200 µs', () => {
    for (const r of activeRows()) {
      const expected = r.activePrev === 0
        ? 0
        : Math.min(Math.max(r.iPrev + r.err * A.i * 0.003 * (Math.abs(r.err) < A.iRelaxCm ? 1 : 0.1) * A.ts, -A.iLimitUs), A.iLimitUs)
      expect(Math.abs(r.iTerm - expected)).toBeLessThan(1e-9)
    }
  })

  test('throttle: (P + I − D·boost + F + hover offset) / max(cos tilt, 0.5), limited, in stick units', () => {
    // The expected value includes the 1100–1700 µs clamp. These scenarios stay inside it
    // (measured 1255–1638 µs, including a 36° banked full-stick climb and an AUTO-LAND
    // arresting a 10 m/s sink): with this quad and Betaflight's default gains the limits
    // are a backstop that normal flight does not reach.
    for (const r of activeRows()) {
      const vz = r.vario * 100
      const boost = Math.abs(vz) > A.dBoostStartCmS ? (3 * Math.abs(vz) / A.dBoostStartCmS - 2) / (Math.abs(vz) / A.dBoostStartCmS) : 1
      const offset = (r.err * A.p * 0.01 + r.iTerm - vz * boost * A.d * 0.01 + r.targetVel * A.f * 0.01 + (A.hoverUs - 1000)) /
        Math.max(Math.cos(r.roll) * Math.cos(r.pitch), 0.5)
      const raw = 1000 + offset
      const us = Math.min(Math.max(raw, A.throttleMinUs), A.throttleMaxUs)
      expect(Math.abs(r.throttle - (us - 1000) / 1000)).toBeLessThan(1e-9)
    }
    // The tilt term was exercised by the roll stick
    expect(activeRows().some(r => Math.abs(r.roll) > 0.5)).toBe(true)
  })
})

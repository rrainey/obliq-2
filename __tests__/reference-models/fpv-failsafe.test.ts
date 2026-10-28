/**
 * FPV failsafe rules (docs/fpv-hud-gnss-test-plan.md, Level 2): the
 * throttle-low disarm on link loss, and stage-2 recovery (DROP needs only
 * the link back for recoveryS; the other procedures also need a stick moved
 * beyond the threshold). Timings are checked at controller samples.
 */
import {
  buildFpvModel,
  CLIMB_STICKS,
  FAILSAFE_PROCEDURE,
  FC,
  FPV,
  type ConditionsProfile,
  type StickProfile,
} from '../../scripts/build-fpv-reference-model'
import { cleanupNativeDir, compileAndRunNative } from '../support/nativeCgen'

jest.setTimeout(300000)

interface Row { t: number; armed: number; stage: number }

const dirs: string[] = []
afterAll(() => dirs.forEach(cleanupNativeDir))

let seq = 0
function run(sticks: StickProfile, seconds: number, conditions: ConditionsProfile): Row[] {
  const name = `fpvfs${seq++}`
  const model = buildFpvModel({ sticks, conditions })
  const n = Math.round(seconds / FPV.dt)
  const result = compileAndRunNative({
    modelName: name,
    sheets: (model.data as any).sheets,
    dt: FPV.dt,
    smokeMainBody: `
  ${name}_seed_from_inputs(&model);
  for (int i = 0; i < ${n}; ++i) {
    ${name}_step(&model);
    if (i % 2 == 0) printf("%.6f %g %g\\n", model.time - model.dt, model.outputs.fc_armed, model.outputs.failsafe_stage);
  }
  return 0;
`,
  })
  dirs.push(result.outDir)
  return result.stdout.trim().split('\n').map(line => {
    const v = line.trim().split(' ').map(Number)
    return { t: v[0]!, armed: v[1]!, stage: v[2]! }
  })
}

const lossAt = (t: number): Array<[number, number]> => [[0, 1], [t - 0.001, 1], [t, 0]]
const firstTime = (rows: Row[], pred: (r: Row) => boolean) => rows.find(pred)?.t ?? NaN

describe('FPV failsafe rules', () => {
  /** Armed on the ground at idle, throttle closed throughout. */
  const IDLE: StickProfile = { roll: [[0, 0]], pitch: [[0, 0]], yaw: [[0, 0]], throttle: [[0, 0]], aux: [[0, 1]], arm: [[0, 0], [0.25, 0], [0.251, 1]] }

  test('after more than 10 s at low throttle, a loss with DROP disarms at once; with GPS-RESCUE it does not', () => {
    const loss = 12
    const drop = run(IDLE, 13, { rcLinkValid: lossAt(loss), failsafeProcedure: FAILSAFE_PROCEDURE.drop })
    expect(firstTime(drop, r => r.armed === 1)).toBeLessThan(0.3)
    expect(firstTime(drop, r => r.t > 1 && r.armed === 0)).toBeCloseTo(loss, 2)
    const rescue = run(IDLE, 14, { rcLinkValid: lossAt(loss), failsafeProcedure: FAILSAFE_PROCEDURE.gpsRescue })
    // Armed through stage 1. Stage 2 starts GPS Rescue, which on the ground at home (within 5 m and
    // below the landing altitude) aborts on its next 100 Hz tick and disarms, as Betaflight does
    const disarmedAt = firstTime(rescue, r => r.t > 1 && r.armed === 0)
    expect(disarmedAt).toBeGreaterThan(loss + FC.failsafe.delayS)
    expect(disarmedAt).toBeLessThan(loss + FC.failsafe.delayS + 0.025)
  })

  test('the throttle-low rule needs more than 10 s: after 5 s at low throttle a DROP loss waits for stage 2', () => {
    const rows = run(IDLE, 7.5, { rcLinkValid: lossAt(5.5), failsafeProcedure: FAILSAFE_PROCEDURE.drop })
    expect(firstTime(rows, r => r.t > 1 && r.armed === 0)).toBeCloseTo(5.5 + FC.failsafe.delayS, 2)
  })

  test('stage-2 recovery: DROP ends with the link back for 0.5 s; AUTO-LAND also needs a stick moved past 30%', () => {
    const link: Array<[number, number]> = [[0, 1], [2.999, 1], [3, 0], [4.999, 0], [5, 1]]
    const drop = run(CLIMB_STICKS, 7.5, { rcLinkValid: link, failsafeProcedure: FAILSAFE_PROCEDURE.drop })
    expect(firstTime(drop, r => r.stage === 2)).toBeCloseTo(3 + FC.failsafe.delayS, 2)
    expect(firstTime(drop, r => r.t > 5 && r.stage === 0)).toBeCloseTo(5 + FC.failsafe.recoveryS, 2)

    const sticks: StickProfile = { ...CLIMB_STICKS, roll: [[0, 0], [6.999, 0], [7, 0.4]] }
    const land = run(sticks, 7.5, { rcLinkValid: link, failsafeProcedure: FAILSAFE_PROCEDURE.autoLand })
    // The link is back from 5 s, but stage 2 holds until the roll stick moves at 7 s
    expect(land.filter(r => r.t > 5.6 && r.t < 6.99).every(r => r.stage === 2)).toBe(true)
    expect(firstTime(land, r => r.t > 5 && r.stage === 0)).toBeCloseTo(7, 2)
  })
})

/**
 * FPV quadcopter reference model: the Tests sheet's Assert blocks pass on the
 * default demo, and each one reads the signal it is meant to (in the units
 * DEMO_TESTS uses).
 */
import { buildFpvModel, DEMO_STICKS, DEMO_TESTS, FC, LOCATION } from '../../scripts/build-fpv-reference-model'
import { runModelTests } from '@/lib/testing/modelTestRunner'

jest.setTimeout(240000)

const testsSheet = (model: ReturnType<typeof buildFpvModel>) =>
  ((model.data as any).sheets as any[]).find(s => s.name === 'Tests')

describe('FPV reference model: Tests sheet', () => {
  test('the default demo carries 11 Asserts, and all pass', () => {
    const model = buildFpvModel()
    const asserts = testsSheet(model).blocks.filter((b: any) => b.type === 'assert')
    expect(asserts).toHaveLength(11)
    expect(asserts.find((b: any) => b.name === 'StaysUpright').parameters.onFailure).toBe('stop')

    const r = runModelTests({ name: 'fpv_tests', data: model.data as any })
    expect(r.status).toBe('passed')
    expect(r.stepsRun).toBe(10000)
    expect(r.asserts.map(a => a.status)).toEqual(Array(11).fill('passed'))
  })

  test('each Assert reads the intended signal: impossible limits report the value at the window start', () => {
    const model = buildFpvModel()
    for (const b of testsSheet(model).blocks.filter((b: any) => b.type === 'assert')) {
      // Fail every check (near: zero tolerance), and never stop the run
      Object.assign(b.parameters, b.parameters.mode === 'near' ? { absTol: 0 } : { lower: 1e9, upper: null }, { onFailure: 'record' })
    }
    const r = runModelTests({ name: 'fpv_probe', data: model.data as any })
    const first = (name: string) => r.asserts.find(a => a.name === name)!
    const t = DEMO_TESTS

    expect(first('DisarmedMotorsOff')).toMatchObject({ firstFailTime: 0, firstFailValue: 0, firstFailIndex: 0 })
    expect(first('ArmedMotorsAtIdle').firstFailTime).toBeCloseTo(t.armTime + 0.05, 6)
    expect(first('ArmedMotorsAtIdle').firstFailValue).toBeGreaterThanOrEqual(FC.motorIdle)
    // Height above the field, in metres, at 1.5 s
    expect(first('ClimbsAfterTakeoff').firstFailValue).toBeGreaterThan(1.3)
    expect(first('ClimbsAfterTakeoff').firstFailValue).toBeLessThan(1.6)
    // Roll at the start of the climb window: level, in degrees
    expect(Math.abs(first('LevelClimb').firstFailValue!)).toBeLessThan(1)
    // Roll and pitch in degrees at their windows' starts, yaw after the turn
    expect(first('BankFollowsStick').firstFailTime).toBeCloseTo(t.bankWindow[0], 6)
    expect(first('BankFollowsStick').firstFailValue).toBeGreaterThan(20)
    expect(first('PitchFollowsStick').firstFailValue).toBeLessThan(-14)
    expect(first('YawTurnCompletes').firstFailValue).toBeGreaterThan(85)
    // The battery in volts, full at the start
    expect(first('BatteryAboveCutoff').firstFailValue).toBeCloseTo(16.8, 3)
    // Estimates against the truth: roll estimate vs true roll (degrees), and
    // altitude estimate vs field elevation at rest (metres above MSL)
    expect(Math.abs(first('AttitudeEstimateTracks').firstFailValue!)).toBeLessThan(1)
    expect(first('AltitudeEstimateTracks').firstFailValue).toBeCloseTo(LOCATION.elevationM, 0)
    // Worst estimate errors stay inside the real limits
    expect(first('AttitudeEstimateTracks').worstViolation).toBeLessThan(t.attitudeEstimateDeg)
    expect(first('AltitudeEstimateTracks').worstViolation).toBeLessThan(t.altitudeEstimateM)
  })

  test('other builds (custom sticks, open loop, airborne) have no Tests sheet', () => {
    expect(testsSheet(buildFpvModel({ sticks: DEMO_STICKS }))).toBeUndefined()
    expect(testsSheet(buildFpvModel({ openLoop: true }))).toBeUndefined()
    expect(testsSheet(buildFpvModel({ initialAltitude: 2 }))).toBeUndefined()
  })
})

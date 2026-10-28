/**
 * The shipped FPV models: the vehicle, and test models that embed it by model
 * reference. Each test model passes against the vehicle, its Asserts read the
 * intended signals, and the shipped files resolve each other by name.
 */
import * as path from 'path'
import {
  ACRO_STEP_TESTS,
  FPV_VEHICLE_NAME,
  buildFpvAcroRateStepModel,
  buildFpvDemoFlightModel,
  buildFpvModel,
} from '../../scripts/build-fpv-reference-model'
import { expandModelReferences, modelInterface } from '@/lib/modelReferences'
import { runModelTests } from '@/lib/testing/modelTestRunner'
import { resolveTestTargets } from '@/lib/testing/resolveTestTargets'
import { validateMultiSheetTypeCompatibility } from '@/lib/multiSheetTypeValidator'

jest.setTimeout(240000)

const vehicle = buildFpvModel({ vehicleOnly: true })
const expandAgainstVehicle = (data: any) =>
  expandModelReferences(data, () => ({ id: 'v', name: vehicle.name, version: null, hash: 'v', data: vehicle.data as any })).data

describe('FPV vehicle model', () => {
  test('takes the sticks as an Input Port and publishes telemetry as Output Ports', () => {
    expect(vehicle.name).toBe(FPV_VEHICLE_NAME)
    const iface = modelInterface(vehicle.data as any)
    expect(iface.inputs).toEqual(['sticks', 'gnss_env', 'grid_convergence_deg', 'rc_link_valid', 'failsafe_procedure', 'wind_ned'])
    expect(iface.outputs).toEqual(expect.arrayContaining(['pos_ned', 'euler', 'gyro_dps', 'rate_setpoint', 'motor_cmd', 'altitude_est', 'battery_voltage']))
    const sheets = (vehicle.data as any).sheets as any[]
    expect(sheets.map(s => s.name)).toEqual(['Main', 'Telemetry'])
    const types = new Set(sheets.flatMap(s => s.blocks.map((b: any) => b.type)))
    expect(types.has('signal_display')).toBe(false)
    expect(types.has('assert')).toBe(false)
  })

  test('validates with no errors or warnings', () => {
    const result = validateMultiSheetTypeCompatibility((vehicle.data as any).sheets)
    expect(result.errors.map(e => e.message)).toEqual([])
    expect(result.warnings.map(w => w.message)).toEqual([])
  })
})

describe('FPV test models', () => {
  test('the demo flight passes all 19 Asserts with no warnings', () => {
    const r = runModelTests({ name: 'demo', data: expandAgainstVehicle(buildFpvDemoFlightModel().data) })
    expect(r.status).toBe('passed')
    expect(r.asserts).toHaveLength(19)
    expect(r.warnings).toEqual([])
  })

  test('the acro rate step passes all 6 Asserts with no warnings', () => {
    const r = runModelTests({ name: 'acro', data: expandAgainstVehicle(buildFpvAcroRateStepModel().data) })
    expect(r.status).toBe('passed')
    expect(r.asserts.map(a => a.name).sort()).toEqual(
      ['PitchYawQuiet', 'ReturnsLevel', 'RollRatePeakBounded', 'RollRateTracksLeft', 'RollRateTracksRight', 'StaysUpright']
    )
    expect(r.warnings).toEqual([])
  })

  test('the acro Asserts read the intended signals (impossible limits report the value at the window start)', () => {
    const model = buildFpvAcroRateStepModel()
    const tests = ((model.data as any).sheets as any[]).find(s => s.name === 'Tests')
    for (const b of tests.blocks.filter((x: any) => x.type === 'assert')) {
      Object.assign(b.parameters, b.parameters.mode === 'near' ? { absTol: 0 } : { lower: 1e9, upper: null }, { onFailure: 'record' })
    }
    const r = runModelTests({ name: 'acro_probe', data: expandAgainstVehicle(model.data) })
    const first = (name: string) => r.asserts.find(a => a.name === name)!
    const t = ACRO_STEP_TESTS
    // Roll rate (deg/s) near +75 after the step, near -75 after the reversal
    expect(first('RollRateTracksRight').firstFailTime).toBeCloseTo(t.rollRightWindow[0], 6)
    expect(first('RollRateTracksRight').firstFailValue).toBeGreaterThan(60)
    expect(first('RollRateTracksLeft').firstFailValue).toBeLessThan(-60)
    // ...and the worst tracking error stays inside the real limit
    expect(first('RollRateTracksRight').worstViolation).toBeLessThan(t.rateTrackDps)
    expect(first('RollRateTracksLeft').worstViolation).toBeLessThan(t.rateTrackDps)
    // Pitch/yaw rates and the roll angle are small in the windows
    expect(Math.abs(first('PitchYawQuiet').firstFailValue!)).toBeLessThan(1)
    expect(Math.abs(first('ReturnsLevel').firstFailValue!)).toBeLessThan(t.levelDeg)
  })

  test('the shipped files resolve the vehicle by name from beside them (no store needed)', () => {
    const dir = path.join(__dirname, '../../reference-models')
    const { targets, errors } = resolveTestTargets(
      [path.join(dir, 'fpv-demo-flight.json'), path.join(dir, 'fpv-acro-rate-step.json')],
      { home: path.join(dir, 'no-store-here') }
    )
    expect(errors).toEqual([])
    expect(targets.map(t => t.name)).toEqual(['FPV Demo Flight', 'FPV Acro Rate Step'])
  })
})

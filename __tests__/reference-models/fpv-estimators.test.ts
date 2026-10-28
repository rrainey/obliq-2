/**
 * FPV altitude estimator (docs/fpv-hud-gnss-test-plan.md, Level 2, F29): the
 * Betaflight blend checked by hand computation at every 100 Hz sample. GPS
 * trust is min(1/pDOP, 0.9) / max(1, |gpsRel − baroRel|) with a 3D fix and a
 * GPS zero, else 0; the blend is held at 0 while disarmed; alt_est and
 * vario_est are the PT2 filters of the blend and of its derivative.
 */
import {
  buildFpvModel,
  CLIMB_STICKS,
  DEFAULT_GNSS_ENV,
  ESTIMATOR,
  FPV,
  pt2Gain,
} from '../../scripts/build-fpv-reference-model'
import { cleanupNativeDir, compileAndRunNative } from '../support/nativeCgen'

jest.setTimeout(300000)

const dirs: string[] = []
afterAll(() => dirs.forEach(cleanupNativeDir))

interface Row { armed: number; fix: number; pdop: number; baroRel: number; gpsRel: number; zeroValid: number; trust: number; blend: number; alt: number; vario: number }

describe('FPV altitude estimator (Betaflight blend)', () => {
  let rows: Row[] = []

  beforeAll(() => {
    // Climb at pDOP 1.5, then pDOP 6 from 4 s, no fix from 7 s, fix back at 9 s
    const model = buildFpvModel({
      sticks: CLIMB_STICKS,
      conditions: {
        gnssEnv: {
          vdop: [[0, DEFAULT_GNSS_ENV.vdop], [3.999, DEFAULT_GNSS_ENV.vdop], [4, Math.sqrt(36 - 0.64)]],
          satellites: [[0, 14], [6.999, 14], [7, 2], [8.999, 2], [9, 14]],
        },
      },
    })
    const name = 'fpvest'
    const per = Math.round(ESTIMATOR.altitude.ts / FPV.dt)
    const result = compileAndRunNative({
      modelName: name,
      sheets: (model.data as any).sheets,
      dt: FPV.dt,
      smokeMainBody: `
  ${name}_seed_from_inputs(&model);
  for (int i = 0; i < ${Math.round(12 / FPV.dt)}; ++i) {
    ${name}_step(&model);
    if (i % ${per} != 0) continue;
    const ${name}_outputs_t *o = &model.outputs;
    const ${name}_signals_t *g = &model.signals;
    printf("%.17g %.17g %.17g %.17g %.17g %.17g %.17g %.17g %.17g %.17g\\n", o->fc_armed, o->gnss_fix[0], o->gnss_fix[2],
      g->FlightController_AltitudeEstimator_BaroRelative, g->FlightController_AltitudeEstimator_GpsRelative,
      g->FlightController_AltitudeEstimator_GpsZeroValid, g->FlightController_AltitudeEstimator_GpsTrust,
      g->FlightController_AltitudeEstimator_AltitudeBlend, o->alt_est, o->vario_est);
  }
  return 0;
`,
    })
    dirs.push(result.outDir)
    rows = result.stdout.trim().split('\n').map(line => {
      const v = line.trim().split(' ').map(Number)
      return { armed: v[0]!, fix: v[1]!, pdop: v[2]!, baroRel: v[3]!, gpsRel: v[4]!, zeroValid: v[5]!, trust: v[6]!, blend: v[7]!, alt: v[8]!, vario: v[9]! }
    })
  })

  test('GPS trust follows the formula, and is 0 without a 3D fix', () => {
    const A = ESTIMATOR.altitude
    let noFix = 0
    for (const r of rows) {
      const expected = r.fix > 2.5 && r.zeroValid > 0.5
        ? Math.min(r.pdop > 0 ? 1 / r.pdop : A.noPdopTrust, A.maxGpsTrust) / Math.max(1, Math.abs(r.gpsRel - r.baroRel) * A.preferBaro / 100)
        : 0
      expect(Math.abs(r.trust - expected)).toBeLessThan(1e-12)
      if (r.fix < 2.5) { noFix++; expect(r.trust).toBe(0) }
    }
    expect(noFix).toBeGreaterThan(100)
    // Both pDOP regimes were exercised
    expect(rows.some(r => Math.abs(r.pdop - 6) < 1e-6 && r.trust > 0)).toBe(true)
    expect(rows.some(r => Math.abs(r.pdop - Math.hypot(0.8, 1.3)) < 1e-9 && r.trust > 0.5)).toBe(true)
  })

  test('the blend is held at 0 while disarmed and weights GPS by the trust while armed', () => {
    expect(rows.filter(r => r.armed < 0.5).length).toBeGreaterThan(10)
    for (const r of rows) {
      const expected = r.armed > 0.5 ? r.gpsRel * r.trust + r.baroRel * (1 - r.trust) : 0
      expect(Math.abs(r.blend - expected)).toBeLessThan(1e-12)
    }
  })

  test('alt_est and vario_est are Betaflight PT2s of the blend and its derivative', () => {
    const ts = ESTIMATOR.altitude.ts
    const k = pt2Gain(ESTIMATOR.altitude.lpfHz, ts)
    const kv = pt2Gain(ESTIMATOR.altitude.varioLpfHz, ts)
    let a1 = 0, a2 = 0, v1 = 0, v2 = 0, last = 0
    for (const r of rows) {
      a1 += k * (r.blend - a1)
      a2 += k * (a1 - a2)
      const d = (a2 - last) / ts
      last = a2
      v1 += kv * (d - v1)
      v2 += kv * (v1 - v2)
      expect(Math.abs(r.alt - a2)).toBeLessThan(1e-9)
      expect(Math.abs(r.vario - v2)).toBeLessThan(1e-6)
    }
  })
})

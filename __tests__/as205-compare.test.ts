/**
 * AS-205 comparison helpers (TN-AP-67-158 baseline policy)
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  loadTrajectoryCsv,
  compareTrajectories,
  formatCompareReport,
  mapLoggerRowToSample,
  shiftTrajectoryTime,
  compareCsvTexts
} from '../examples/saturn-ib/as205Compare'

const REF_DIR = path.join(__dirname, '../docs/sample-models/saturn/as205-reference')

describe('AS-205 trajectory compare utilities', () => {
  const smokePath = path.join(REF_DIR, 'as205_trajectory_smoke.csv')

  test('loads smoke CSV', () => {
    const text = fs.readFileSync(smokePath, 'utf8')
    const series = loadTrajectoryCsv(text, 'smoke')
    expect(series.samples.length).toBeGreaterThanOrEqual(4)
    expect(series.samples[0].t_s).toBe(0)
    expect(series.samples[0].h_m).toBe(50)
  })

  test('compare identical series → near-zero residuals', () => {
    const text = fs.readFileSync(smokePath, 'utf8')
    const ref = loadTrajectoryCsv(text, 'ref')
    const model = loadTrajectoryCsv(text, 'model')
    const result = compareTrajectories(ref, model, {
      fields: ['h_m', 'v_mps', 'mass_kg'],
      timeMatchTol_s: 0.1
    })
    expect(result.paired).toBeGreaterThan(0)
    for (const r of result.residuals) {
      if (r.n === 0) continue
      expect(r.maxAbs).toBeLessThan(1e-9)
      expect(r.rms).toBeLessThan(1e-9)
    }
  })

  test('compare offset altitude reports residual', () => {
    const text = fs.readFileSync(smokePath, 'utf8')
    const ref = loadTrajectoryCsv(text, 'ref')
    // model = ref with +100 m altitude
    const model = {
      name: 'model+100m',
      samples: ref.samples.map(s => ({
        ...s,
        h_m: (s.h_m ?? 0) + 100
      }))
    }
    const result = compareTrajectories(ref, model, {
      fields: ['h_m'],
      timeMatchTol_s: 0.1
    })
    const h = result.residuals.find(r => r.field === 'h_m')!
    expect(h.n).toBeGreaterThan(0)
    expect(h.maxAbs).toBeCloseTo(100, 5)
    expect(h.rms).toBeCloseTo(100, 5)
  })

  test('formatCompareReport is non-empty markdown', () => {
    const text = fs.readFileSync(smokePath, 'utf8')
    const ref = loadTrajectoryCsv(text, 'ref')
    const result = compareTrajectories(ref, ref, { fields: ['h_m'] })
    const md = formatCompareReport(result)
    expect(md).toContain('Trajectory comparison')
    expect(md).toContain('TN-AP-67-158')
  })

  test('mapLoggerRowToSample maps common names', () => {
    const s = mapLoggerRowToSample({
      time: 12.5,
      altitude_m: 1000,
      mass: 500000,
      qbar: 3000
    })
    expect(s?.t_s).toBe(12.5)
    expect(s?.h_m).toBe(1000)
    expect(s?.mass_kg).toBe(500000)
    expect(s?.qbar_Pa).toBe(3000)
  })

  test('TN-AP-67-158 reference CSV loads with S-IB coverage', () => {
    const realPath = path.join(REF_DIR, 'as205_trajectory_reference.csv')
    expect(fs.existsSync(realPath)).toBe(true)
    const text = fs.readFileSync(realPath, 'utf8')
    const series = loadTrajectoryCsv(text, 'tn-ap-67-158')
    expect(series.samples.length).toBeGreaterThanOrEqual(30)
    // First motion + staging markers
    expect(series.samples[0].t_s).toBe(0)
    expect(series.samples[0].h_m).toBe(30)
    expect(series.samples[0].mass_kg).toBe(586593)
    const sep = series.samples.find(s => s.t_s === 147.26)
    expect(sep?.h_m).toBe(61260)
    expect(sep?.mass_kg).toBe(183924)
    // Max-q near t=78 s (~31.9 kPa from TN kgf/m² column)
    const maxq = series.samples.find(s => s.t_s === 78)
    expect(maxq?.qbar_Pa).toBeGreaterThan(30000)
    expect(maxq?.qbar_Pa).toBeLessThan(35000)
  })

  test('TN reference self-compare is near-zero residual', () => {
    const text = fs.readFileSync(
      path.join(REF_DIR, 'as205_trajectory_reference.csv'),
      'utf8'
    )
    const ref = loadTrajectoryCsv(text, 'tn')
    const result = compareTrajectories(ref, ref, {
      fields: ['h_m', 'v_mps', 'mass_kg', 'qbar_Pa'],
      timeMatchTol_s: 0.1
    })
    expect(result.paired).toBe(ref.samples.length)
    for (const r of result.residuals) {
      if (r.n === 0) continue
      expect(r.maxAbs).toBeLessThan(1e-9)
    }
  })

  test('loads multi-logger export shape (time + log_*)', () => {
    const p = path.join(REF_DIR, 'example_model_logger_export.csv')
    const text = fs.readFileSync(p, 'utf8')
    const series = loadTrajectoryCsv(text, 'example-logger')
    expect(series.samples.length).toBeGreaterThan(10)
    expect(series.samples[0].t_s).toBe(0)
    expect(series.samples.some(s => s.h_m !== undefined)).toBe(true)
    expect(series.samples.some(s => s.mass_kg !== undefined)).toBe(true)
    expect(series.samples.some(s => s.qbar_Pa !== undefined)).toBe(true)
  })

  test('modelTimeOffset_s shifts model into liftoff frame', () => {
    const text = fs.readFileSync(smokePath, 'utf8')
    const ref = loadTrajectoryCsv(text, 'ref')
    // model times are all +1 s vs ref
    const model = {
      name: 'model+1s',
      samples: ref.samples.map(s => ({ ...s, t_s: s.t_s + 1 }))
    }
    const bad = compareTrajectories(ref, model, {
      fields: ['h_m'],
      timeMatchTol_s: 0.1
    })
    // With tight tol, few or no pairs without offset
    const good = compareTrajectories(ref, model, {
      fields: ['h_m'],
      timeMatchTol_s: 0.1,
      modelTimeOffset_s: 1
    })
    expect(good.paired).toBeGreaterThan(0)
    const h = good.residuals.find(r => r.field === 'h_m')!
    expect(h.maxAbs).toBeLessThan(1e-9)
    // sanity: offset path used
    expect(good.warnings.some(w => w.includes('shifted'))).toBe(true)
    expect(bad.paired).toBeLessThanOrEqual(good.paired)
  })

  test('shiftTrajectoryTime does not mutate original', () => {
    const text = fs.readFileSync(smokePath, 'utf8')
    const series = loadTrajectoryCsv(text, 's')
    const t0 = series.samples[0].t_s
    const shifted = shiftTrajectoryTime(series, 1)
    expect(series.samples[0].t_s).toBe(t0)
    expect(shifted.samples[0].t_s).toBe(t0 - 1)
  })

  test('compareCsvTexts produces residual report vs TN reference', () => {
    const refText = fs.readFileSync(
      path.join(REF_DIR, 'as205_trajectory_reference.csv'),
      'utf8'
    )
    const modelText = fs.readFileSync(
      path.join(REF_DIR, 'example_model_logger_export.csv'),
      'utf8'
    )
    const { result, report } = compareCsvTexts(refText, modelText, {
      fields: ['h_m', 'mass_kg', 'qbar_Pa'],
      tMin: 0,
      tMax: 150,
      timeMatchTol_s: 2,
      modelTimeOffset_s: 1,
      modelName: 'example_logger'
    })
    expect(result.paired).toBeGreaterThan(5)
    expect(report).toContain('Trajectory comparison')
    expect(report).toContain('h_m')
    expect(report).toContain('mass_kg')
    // Synthetic example is intentionally not a tight match
    const h = result.residuals.find(r => r.field === 'h_m')!
    expect(h.n).toBeGreaterThan(0)
    expect(Number.isFinite(h.rms)).toBe(true)
  })
})

/**
 * AS-205 comparison helpers (TN-AP-67-158 baseline policy)
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  loadTrajectoryCsv,
  compareTrajectories,
  formatCompareReport,
  mapLoggerRowToSample
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

  test('optional real TN CSV loads if present', () => {
    const realPath = path.join(REF_DIR, 'as205_trajectory_reference.csv')
    if (!fs.existsSync(realPath)) {
      return // not required until digitized
    }
    const text = fs.readFileSync(realPath, 'utf8')
    // May be template-only (header, no rows)
    try {
      const series = loadTrajectoryCsv(text, 'tn-ap-67-158')
      expect(series.name).toBe('tn-ap-67-158')
    } catch (e) {
      // header-only template without t_s data rows is ok
      expect(String(e)).toMatch(/t_s/)
    }
  })
})

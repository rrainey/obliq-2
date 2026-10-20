/**
 * The builders' World Magnetic Model evaluator against NOAA's published
 * WMM2025 test values (100 points, 2025.0–2029.5, 0–98 km).
 */

import * as fs from 'fs'
import * as path from 'path'
import { loadWmm2025, wmmField } from '../../scripts/lib/wmm'

const rows = fs
  .readFileSync(path.join(__dirname, '../../scripts/data/WMM2025_TestValues.txt'), 'utf8')
  .split('\n')
  .filter(l => l.trim() && !l.startsWith('#'))
  .map(l => l.trim().split(/\s+/).map(Number))

describe('WMM2025', () => {
  const c = loadWmm2025()

  it('parses the coefficient file', () => {
    expect(c.epoch).toBe(2025)
    expect(c.nMax).toBe(12)
    expect(c.g[1]![0]).toBe(-29351.8)
    expect(rows.length).toBe(100)
  })

  it('matches every NOAA test value: X, Y, Z within 0.05 nT, D and I within 0.01 deg', () => {
    for (const [year, altKm, lat, lon, decl, incl, , x, y, z] of rows) {
      const f = wmmField(c, lat!, lon!, altKm! * 1000, year!)
      expect(Math.abs(f.x - x!)).toBeLessThan(0.05)
      expect(Math.abs(f.y - y!)).toBeLessThan(0.05)
      expect(Math.abs(f.z - z!)).toBeLessThan(0.05)
      expect(Math.abs(f.declinationDeg - decl!)).toBeLessThan(0.01)
      expect(Math.abs(f.inclinationDeg - incl!)).toBeLessThan(0.01)
    }
  })
})

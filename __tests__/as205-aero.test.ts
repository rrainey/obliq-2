/**
 * Simulink aerodynamic forces/moments tables and offline evaluation
 */

import {
  AERO_S_REF_M2,
  CA_MACH_BREAKPOINTS,
  CA_VALUES,
  CN_TABLE,
  evaluateAs205Aero
} from '../examples/saturn-ib/as205Aero'
import { buildSixDofOpenLoopChiAscent } from '../examples/saturn-ib/sixDofVarMassEom'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { propagateSignalTypes } from '@/lib/signalTypePropagation'

describe('as205Aero tables (mdl port)', () => {
  test('S_ref matches Simulink 34.25 m²', () => {
    expect(AERO_S_REF_M2).toBe(34.25)
  })

  test('CA_T at M=0 is 1.2', () => {
    expect(CA_VALUES[0]).toBe(1.2)
    expect(CA_MACH_BREAKPOINTS[0]).toBe(0)
  })

  test('CN table shape 7×9', () => {
    expect(CN_TABLE).toHaveLength(7)
    expect(CN_TABLE[0]).toHaveLength(9)
    expect(CN_TABLE[0][0]).toBe(0)
  })

  test('axial drag dominates at α=β=0, high q̄ (air-rel body vel)', () => {
    // v_b here means air-relative body velocity (not inertial pad Earth-rate)
    const a = evaluateAs205Aero({
      v_b: [1000, 0, 0],
      rho: 1.0,
      a_sound: 340
    })
    expect(a.F_aero[0]).toBeLessThan(0) // aft force
    expect(Math.abs(a.F_aero[1])).toBeLessThan(1e-6)
    expect(Math.abs(a.F_aero[2])).toBeLessThan(1e-6)
    expect(a.qbar_Pa).toBeCloseTo(0.5 * 1e6, 3)
  })

  test('non-zero α produces normal force and pitch moment about CG', () => {
    const a = evaluateAs205Aero({
      v_b: [500, 0, 50],
      rho: 0.5,
      a_sound: 320
    })
    expect(a.alpha_rad).not.toBe(0)
    expect(Math.abs(a.F_aero[2])).toBeGreaterThan(0)
    // CP ≠ CG ⇒ moment from F_z
    expect(Math.abs(a.M_aero[1])).toBeGreaterThan(0)
  })

  test('pad-like Earth-rate body vel would be wrong for aero (α≈90°) — use air-rel ≈0', () => {
    // Inertial pad v_b ~ [0, 51, 406] with X vertical → disaster if used as airspeed
    const wrong = evaluateAs205Aero({
      v_b: [0, 51, 406],
      rho: 1.2,
      a_sound: 340
    })
    expect(Math.abs(wrong.alpha_rad)).toBeGreaterThan(1.0) // ~90°
    // Air-relative on pad ≈ 0 → negligible aero
    const padAir = evaluateAs205Aero({
      v_b: [0.01, 0, 0],
      rho: 1.2,
      a_sound: 340
    })
    expect(Math.hypot(...padAir.F_aero)).toBeLessThan(1e3)
  })
})

describe('9.4 plant aero wiring', () => {
  test('type-prop and codegen with Simulink aero', () => {
    const m = buildSixDofOpenLoopChiAscent()
    const sheet = m.sheets[0]
    const prop = propagateSignalTypes(
      sheet.blocks as any,
      sheet.connections as any
    )
    const typeErrors = prop.errors.filter(e => e.severity === 'error')
    expect(typeErrors.map(e => e.message)).toEqual([])

    const gen = new CodeGenerator({
      modelName: 'sixdof_aero',
      integrationAlgorithm: 'rk4'
    })
    const result = gen.generate(m.sheets as any, m.parameters || [])
    expect(result.source).not.toMatch(/Error generating code for/)
    expect(result.source).toContain('_step')
  })
})

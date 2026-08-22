/**
 * MDL `LVDC Chi to Psi Transformation` — Eqn 8.3.3 / 8.3.4 / 8.2.2
 */

import {
  chiToPsiDeg,
  saturatePsiDeg,
  CHI_TO_PSI_SAT_DEG
} from '../examples/saturn-ib/igmChiToPsi'

describe('igmChiToPsi', () => {
  test('matched angles → Ψ ≈ 0', () => {
    const r = chiToPsiDeg([5, -40, 8], [5, -40, 8])
    expect(r.Psi_R_deg).toBeCloseTo(0, 12)
    expect(r.Psi_P_deg).toBeCloseTo(0, 12)
    expect(r.Psi_Y_deg).toBeCloseTo(0, 12)
  })

  test('pure pitch → Ψ_P = Θ_P − χ_P', () => {
    const r = chiToPsiDeg([0, -30, 0], [0, -60, 0])
    expect(r.Psi_R_deg).toBeCloseTo(0, 12)
    expect(r.Psi_P_deg).toBeCloseTo(30, 12)
    expect(r.Psi_Y_deg).toBeCloseTo(0, 12)
  })

  test('pure yaw → Ψ_Y = Θ_Y − χ_Y', () => {
    const r = chiToPsiDeg([0, 0, 10], [0, 0, 0])
    expect(r.Psi_R_deg).toBeCloseTo(0, 12)
    expect(r.Psi_P_deg).toBeCloseTo(0, 12)
    expect(r.Psi_Y_deg).toBeCloseTo(10, 12)
  })

  test('pure roll → Ψ_R = Θ_R − χ_R', () => {
    const r = chiToPsiDeg([7, 0, 0], [2, 0, 0])
    expect(r.Psi_R_deg).toBeCloseTo(5, 12)
    expect(r.Psi_P_deg).toBeCloseTo(0, 12)
    expect(r.Psi_Y_deg).toBeCloseTo(0, 12)
  })

  test('finite-angle coupling mixes pitch/yaw', () => {
    const r = chiToPsiDeg([5, -40, 8], [0, -55, 2])
    // Not equal to raw ΔΘ because half-angle trig couples axes
    expect(r.delta_deg[1]).toBeCloseTo(15, 12)
    expect(r.Psi_P_deg).not.toBeCloseTo(15, 1)
    expect(r.Psi_R_deg).toBeGreaterThan(5) // roll picks up pitch coupling via A3
    expect(Number.isFinite(r.Psi_P_deg)).toBe(true)
    expect(Number.isFinite(r.Psi_Y_deg)).toBe(true)
  })

  test('saturate clamps to ±15.3°', () => {
    const raw = chiToPsiDeg([0, 0, 0], [0, -60, 0]) // Ψ_P = 60
    expect(raw.Psi_P_deg).toBeCloseTo(60, 10)
    const s = saturatePsiDeg(raw)
    expect(s.Psi_P_deg).toBeCloseTo(CHI_TO_PSI_SAT_DEG, 12)
    expect(s.Psi_R_deg).toBeCloseTo(0, 12)
  })
})

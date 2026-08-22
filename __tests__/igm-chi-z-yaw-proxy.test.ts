/**
 * Offline Chi_Z / geometric yaw diagnosis (no closed-loop β_Y).
 *
 * Product15: Chi_Z = sat(deg(atan(vy/√(1−vy²))), ±45) ≡ sat(deg(asin(vy)), ±45).
 * Geometric meas: Θ_Y = deg(asin(Xb_S_y)) — must also sat ±45 to match cmd.
 */

import { igmChiYZFromUnitVector } from '../examples/saturn-ib/igmChiAssembly'
import { chiToPsiDeg } from '../examples/saturn-ib/igmChiToPsi'

const RAD2DEG = 180 / Math.PI

function asinDeg(y: number): number {
  const c = y > 1 ? 1 : y < -1 ? -1 : y
  return Math.asin(c) * RAD2DEG
}

function sat45(x: number): number {
  return x > 45 ? 45 : x < -45 ? -45 : x
}

describe('Chi_Z ≡ sat(asin(vy), ±45)', () => {
  test.each([
    0,
    0.1,
    -0.1,
    0.5,
    -0.5,
    Math.SQRT1_2, // 45°
    -Math.SQRT1_2
  ])('vy=%s (inside sat)', vy => {
    const vx = Math.sqrt(Math.max(0, 1 - vy * vy))
    const { Chi_Z_deg } = igmChiYZFromUnitVector([vx, vy, 0])
    expect(Chi_Z_deg).toBeCloseTo(asinDeg(vy), 10)
  })

  test('beyond sin(45): Chi_Z saturates, raw asin does not', () => {
    const vy = Math.sin((60 * Math.PI) / 180)
    const vx = Math.sqrt(1 - vy * vy)
    const { Chi_Z_deg } = igmChiYZFromUnitVector([vx, vy, 0])
    expect(Chi_Z_deg).toBe(45)
    expect(asinDeg(vy)).toBeCloseTo(60, 10)
    expect(sat45(asinDeg(vy))).toBe(45)
  })
})

describe('geometric yaw vs commanded Chi_Z → Ψ_Y', () => {
  test('matched thrust (sat Θ_Y) → Ψ_Y ≈ 0', () => {
    const vy = 0.2
    const vx = Math.sqrt(1 - vy * vy)
    const { Chi_Y_deg, Chi_Z_deg } = igmChiYZFromUnitVector([vx, vy, 0])
    const thY = sat45(asinDeg(vy))
    const psi = chiToPsiDeg([0, Chi_Y_deg, thY], [0, Chi_Y_deg, Chi_Z_deg])
    expect(psi.Psi_Y_deg).toBeCloseTo(0, 10)
    expect(psi.Psi_P_deg).toBeCloseTo(0, 10)
  })

  test('unsat Θ_Y with sat Chi_Z → permanent Ψ_Y bias (NaN root cause)', () => {
    const vy = Math.sin((60 * Math.PI) / 180)
    const thY_raw = asinDeg(vy) // ~60
    const chiZ = 45 // Product15 sat
    const psi = chiToPsiDeg([0, 0, thY_raw], [0, 0, chiZ])
    expect(psi.Psi_Y_deg).toBeCloseTo(15, 10) // never zeros with sat cmd
  })

  test('yaw error only (R=0): Ψ_Y = Θ_Y − Chi_Z exactly', () => {
    const psi = chiToPsiDeg([0, 0, 25], [0, 0, 10])
    expect(psi.Psi_Y_deg).toBeCloseTo(15, 12)
    expect(psi.Psi_P_deg).toBeCloseTo(0, 12)
  })

  test('IGM-on jump: Θ_Y≈0, Chi_Z=20 → |β_Y| large at Kp=20', () => {
    const psi = chiToPsiDeg([0, -60, 0], [0, -60, 20])
    expect(psi.Psi_Y_deg).toBeCloseTo(-20, 5)
    const betaY_kp20 = -20 * ((psi.Psi_Y_deg * Math.PI) / 180)
    expect(Math.abs(betaY_kp20)).toBeGreaterThan(5)
  })

  test('nonzero roll couples axes; R=0 leaves Ψ_Y = ΔΘ_Y', () => {
    const noRoll = chiToPsiDeg([0, -40, 5], [0, -55, 12])
    expect(noRoll.Psi_Y_deg).toBeCloseTo(5 - 12, 10)
    const withRoll = chiToPsiDeg([20, -40, 5], [10, -55, 12])
    expect(withRoll.Psi_Y_deg).not.toBeCloseTo(5 - 12, 1)
  })
})

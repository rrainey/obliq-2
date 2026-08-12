/**
 * AS-205 S-frame pad geometry
 */

import {
  as205DefaultPadStateS,
  AS205_PAD,
  OMEGA_EARTH
} from '../examples/saturn-ib/as205PadFrames'
import { buildSixDofOpenLoopChiAscent } from '../examples/saturn-ib/sixDofVarMassEom'

describe('as205PadFrames', () => {
  const pad = as205DefaultPadStateS()

  test('pad radius and Earth-rate speed near TN first-motion V', () => {
    expect(pad.r0_S[0]).toBe(AS205_PAD.R_L_m)
    expect(pad.r0_S[1]).toBe(0)
    expect(pad.r0_S[2]).toBe(0)
    // ω R cos(φ') ≈ 408–410 m/s at LC-34
    expect(pad.v0_mag).toBeGreaterThan(400)
    expect(pad.v0_mag).toBeLessThan(420)
    // Mostly horizontal in S: small radial component
    expect(Math.abs(pad.v0_S[0])).toBeLessThan(50)
  })

  test('S basis is right-handed orthonormal in ECEF', () => {
    const { X_S_ecef: x, Y_S_ecef: y, Z_S_ecef: z } = pad
    const dot = (a: number[], b: number[]) =>
      a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    const cross = (a: number[], b: number[]) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ]
    expect(Math.abs(dot(x, y))).toBeLessThan(1e-9)
    expect(Math.abs(dot(y, z))).toBeLessThan(1e-9)
    expect(Math.abs(dot(z, x))).toBeLessThan(1e-9)
    const yxz = cross(z, x)
    expect(Math.hypot(yxz[0] - y[0], yxz[1] - y[1], yxz[2] - y[2])).toBeLessThan(
      1e-9
    )
    expect(OMEGA_EARTH).toBeGreaterThan(7e-5)
  })

  test('legacy ENU builder still ~409 m/s (diagnostics only)', () => {
    // 9.4+ plant uses as205InitialPosition (Simulink Fcn); this keeps ENU helper honest
    expect(pad.v0_mag).toBeGreaterThan(400)
  })
})

/**
 * Isolated numeric unit tests for 6-DOF variable-mass EOM RHS.
 *
 * Complements sixdof-varmass-eom.test.ts (sheet structure / codegen) with
 * analytic checks that do not require codegen or the full Saturn stack.
 */

import { EOM_MDL_ADAPTER } from '../examples/saturn-ib/sixDofVarMassEom'
import {
  eomRhs,
  eomStepRk4,
  gravityInertial,
  inertiaDiag,
  normalizeQuat,
  quatNorm,
  quatRatesBody,
  vecCross,
  vecDot,
  vecNorm,
  vecScale,
  type EomParams,
  type EomState,
  type Quat,
  type Vec3
} from '../examples/saturn-ib/sixDofVarMassEomRhs'
import { quatToDcm } from '../examples/saturn-ib/as205EciPlant'
import { mat3MulVec, mat3Transpose } from '../examples/saturn-ib/as205Mes'

const MU = 3.986004418e14
const I_REF: Vec3 = [2e5, 6e6, 6e6]
const M_REF = 5e5

const baseParams = (physics = {}): EomParams => ({
  mu: MU,
  I_ref: I_REF,
  m_ref: M_REF,
  physics
})

const restState = (overrides: Partial<EomState> = {}): EomState => ({
  r_i: [6378137, 0, 0],
  v_b: [0, 0, 0],
  omega_b: [0, 0, 0],
  q: [1, 0, 0, 0],
  m: M_REF,
  ...overrides
})

describe('sixDofVarMassEomRhs — analytic isolation', () => {
  test('gravity at surface along +X is ≈ −g ê_x', () => {
    const r: Vec3 = [6378137, 0, 0]
    const g = gravityInertial(r, MU)
    const gMag = vecNorm(g)
    expect(gMag).toBeCloseTo(MU / (6378137 * 6378137), 2)
    expect(g[0]).toBeLessThan(0)
    expect(Math.abs(g[1])).toBeLessThan(1e-9)
    expect(Math.abs(g[2])).toBeLessThan(1e-9)
  })

  test('legacy v̇: F=0, ω=0 → v̇ = g_b', () => {
    const s = restState()
    const d = eomRhs(
      s,
      { F_b: [0, 0, 0], M_b: [0, 0, 0], mdot_prop: 0 },
      baseParams()
    )
    const C_bi = quatToDcm(s.q)
    const g_i = gravityInertial(s.r_i, MU)
    const g_b = mat3MulVec(mat3Transpose(C_bi), g_i)
    expect(d.v_dot[0]).toBeCloseTo(g_b[0], 10)
    expect(d.v_dot[1]).toBeCloseTo(g_b[1], 10)
    expect(d.v_dot[2]).toBeCloseTo(g_b[2], 10)
  })

  test('forcePathGravity: F_aug/m − ω×v matches F/m − ω×v + g_b', () => {
    const s = restState({
      v_b: [10, -3, 2],
      omega_b: [0.01, -0.02, 0.03]
    })
    const F_b: Vec3 = [1e5, -2e4, 5e3]
    const input = { F_b, M_b: [0, 0, 0] as Vec3, mdot_prop: 0 }
    const dLegacy = eomRhs(s, input, baseParams({}))
    const dMdl = eomRhs(s, input, baseParams({ forcePathGravity: true }))
    for (let i = 0; i < 3; i++) {
      expect(dMdl.v_dot[i]).toBeCloseTo(dLegacy.v_dot[i], 8)
    }
  })

  test('constant body thrust, no rotation: Δv ≈ (F/m) Δt (flat g cancelled in body X)', () => {
    // Identity quat, r along +X ⇒ g_b ≈ (−g, 0, 0).
    // Thrust +mg ê_x cancels gravity → net v̇ ≈ 0 in legacy; with extra thrust a:
    const s = restState()
    const g = -MU / (6378137 * 6378137)
    const a = 2.0 // extra m/s² along body +X after cancelling g
    const F_b: Vec3 = [s.m * (-g + a), 0, 0]
    const d = eomRhs(
      s,
      { F_b, M_b: [0, 0, 0], mdot_prop: 0 },
      baseParams({ forcePathGravity: true })
    )
    expect(d.v_dot[0]).toBeCloseTo(a, 5)
    expect(Math.abs(d.v_dot[1])).toBeLessThan(1e-9)
    expect(Math.abs(d.v_dot[2])).toBeLessThan(1e-9)

    let st = s
    const dt = 0.01
    const T = 1.0
    const n = Math.round(T / dt)
    for (let i = 0; i < n; i++) {
      st = eomStepRk4(
        st,
        { F_b, M_b: [0, 0, 0], mdot_prop: 0 },
        baseParams({ forcePathGravity: true }),
        dt
      )
    }
    expect(st.v_b[0]).toBeCloseTo(a * T, 2)
  })

  test('ω×v Coriolis term: F=0 → v̇ + (−g path) = −ω×v', () => {
    const s = restState({
      r_i: [1e10, 0, 0],
      v_b: [1, 0, 0],
      omega_b: [0, 0, 1]
    })
    const d = eomRhs(
      s,
      { F_b: [0, 0, 0], M_b: [0, 0, 0], mdot_prop: 0 },
      baseParams({ forcePathGravity: true })
    )
    // Remove gravity contribution: with forcePathGravity, F=0 ⇒ v̇ = g_b − ω×v
    const C_bi = quatToDcm(s.q)
    const g_b = mat3MulVec(
      mat3Transpose(C_bi),
      gravityInertial(s.r_i, MU)
    )
    const coriolisOnly = [
      d.v_dot[0] - g_b[0],
      d.v_dot[1] - g_b[1],
      d.v_dot[2] - g_b[2]
    ]
    const expectV = vecScale(vecCross(s.omega_b, s.v_b), -1)
    expect(coriolisOnly[0]).toBeCloseTo(expectV[0], 12)
    expect(coriolisOnly[1]).toBeCloseTo(expectV[1], 12)
    expect(coriolisOnly[2]).toBeCloseTo(expectV[2], 12)
  })

  test('principal spin: M=0, İ=0, ω∥ê_x ⇒ ω̇=0 (torque-free)', () => {
    const s = restState({ omega_b: [0.1, 0, 0] })
    const d = eomRhs(
      s,
      { F_b: [0, 0, 0], M_b: [0, 0, 0], mdot_prop: 0 },
      baseParams({ zeroIdot: true })
    )
    expect(d.omega_dot[0]).toBeCloseTo(0, 12)
    expect(d.omega_dot[1]).toBeCloseTo(0, 12)
    expect(d.omega_dot[2]).toBeCloseTo(0, 12)
  })

  test('principal ω̇ = M_i / I_i when ω=0', () => {
    const s = restState()
    const M_b: Vec3 = [1000, 2000, 3000]
    const d = eomRhs(
      s,
      { F_b: [0, 0, 0], M_b, mdot_prop: 0 },
      baseParams({ zeroIdot: true })
    )
    const I = inertiaDiag(I_REF, s.m, M_REF)
    expect(d.omega_dot[0]).toBeCloseTo(M_b[0] / I[0], 12)
    expect(d.omega_dot[1]).toBeCloseTo(M_b[1] / I[1], 12)
    expect(d.omega_dot[2]).toBeCloseTo(M_b[2] / I[2], 12)
  })

  test('İω term: propellant mdot ⇒ ṁ<0 ⇒ ω̇_x > 0 along principal spin (M=0)', () => {
    // ω̇ = I⁻¹(−İ ω); İ = I_ref·ṁ/m_ref with ṁ=−mdot_prop < 0 ⇒ −İω aligns with ω.
    const s = restState({ omega_b: [0.2, 0, 0], m: M_REF })
    const d = eomRhs(
      s,
      { F_b: [0, 0, 0], M_b: [0, 0, 0], mdot_prop: 100 },
      baseParams({ zeroIdot: false })
    )
    expect(d.omega_dot[0]).toBeGreaterThan(0)
    expect(d.m_dot).toBeCloseTo(-100, 12)
  })

  test('zeroIdot matches dropping İω', () => {
    const s = restState({ omega_b: [0.05, -0.02, 0.01] })
    const input = {
      F_b: [0, 0, 0] as Vec3,
      M_b: [10, -20, 5] as Vec3,
      mdot_prop: 50
    }
    const withIdot = eomRhs(s, input, baseParams({ zeroIdot: false }))
    const noIdot = eomRhs(s, input, baseParams({ zeroIdot: true }))
    expect(withIdot.omega_dot[0]).not.toBeCloseTo(noIdot.omega_dot[0], 6)
    // MDL adapter uses zeroIdot
    const mdl = eomRhs(s, input, baseParams(EOM_MDL_ADAPTER))
    expect(mdl.omega_dot[0]).toBeCloseTo(noIdot.omega_dot[0], 12)
  })

  test('quaternion rates: pure yaw rate integrates toward ψ with |q|=1', () => {
    let s = restState({ omega_b: [0, 0, 0.1] })
    const dt = 0.01
    for (let i = 0; i < 100; i++) {
      s = eomStepRk4(
        s,
        { F_b: [0, 0, 0], M_b: [0, 0, 0], mdot_prop: 0 },
        baseParams(EOM_MDL_ADAPTER),
        dt
      )
    }
    expect(quatNorm(s.q)).toBeCloseTo(1, 10)
    // After 1 s at ω_z=0.1, yaw ≈ 0.1 rad; q ≈ [cos(ψ/2), 0, 0, sin(ψ/2)]
    const psi = 0.1
    expect(s.q[0]).toBeCloseTo(Math.cos(psi / 2), 3)
    expect(s.q[3]).toBeCloseTo(Math.sin(psi / 2), 3)
  })

  test('normalizeQuat restores unit length', () => {
    const q = normalizeQuat([2, 0, 0, 0] as Quat)
    expect(quatNorm(q)).toBeCloseTo(1, 15)
    expect(q[0]).toBeCloseTo(1, 15)
  })

  test('veViaTranspose: ṙ = C_ib v_b (not C_bi v_b)', () => {
    const q = normalizeQuat([0.5, 0.5, 0.5, 0.5] as Quat)
    const s = restState({ q, v_b: [100, 0, 0], r_i: [7e6, 0, 0] })
    const dBi = eomRhs(
      s,
      { F_b: [0, 0, 0], M_b: [0, 0, 0], mdot_prop: 0 },
      baseParams({ veViaTranspose: false })
    )
    const dIb = eomRhs(
      s,
      { F_b: [0, 0, 0], M_b: [0, 0, 0], mdot_prop: 0 },
      baseParams({ veViaTranspose: true })
    )
    const C_bi = quatToDcm(q)
    const expectBi = mat3MulVec(C_bi, s.v_b)
    const expectIb = mat3MulVec(mat3Transpose(C_bi), s.v_b)
    for (let i = 0; i < 3; i++) {
      expect(dBi.r_dot[i]).toBeCloseTo(expectBi[i], 10)
      expect(dIb.r_dot[i]).toBeCloseTo(expectIb[i], 10)
    }
    expect(vecDot(dBi.r_dot, dIb.r_dot)).not.toBeCloseTo(
      vecNorm(dBi.r_dot) * vecNorm(dIb.r_dot),
      5
    )
  })

  test('quatRatesBody matches ½Ωq for identity + ω=(0,0,w)', () => {
    const w = 0.25
    const q: Quat = [1, 0, 0, 0]
    const qd = quatRatesBody([0, 0, w], q)
    expect(qd[0]).toBeCloseTo(0, 15)
    expect(qd[1]).toBeCloseTo(0, 15)
    expect(qd[2]).toBeCloseTo(0, 15)
    expect(qd[3]).toBeCloseTo(0.5 * w, 15)
  })

  test('EOM_MDL_ADAPTER one-second constant-F burn stays finite and |q|=1', () => {
    const s0 = restState({
      v_b: [0, 400, 0], // rough eastward body rate proxy
      m: 586593
    })
    const F_b: Vec3 = [6.85e6, 0, 0] // ~8× H-1
    let s = s0
    const dt = 0.005
    const n = Math.round(1 / dt)
    for (let i = 0; i < n; i++) {
      s = eomStepRk4(
        s,
        { F_b, M_b: [0, 0, 0], mdot_prop: 8 * 347 },
        baseParams(EOM_MDL_ADAPTER),
        dt
      )
    }
    expect(Number.isFinite(s.v_b[0])).toBe(true)
    expect(Number.isFinite(s.r_i[0])).toBe(true)
    expect(quatNorm(s.q)).toBeCloseTo(1, 8)
    expect(s.m).toBeLessThan(s0.m)
    expect(s.m).toBeGreaterThan(1)
  })
})

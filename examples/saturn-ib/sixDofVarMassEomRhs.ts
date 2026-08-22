/**
 * Pure RHS for 6-DOF variable-mass quaternion EOM (no Obliq sheet / codegen).
 *
 * Oracle matching SIXDOF_VARMASS_EOM.md and EomPhysicsOptions / EOM_MDL_ADAPTER.
 * Use for isolated unit tests before full MDL-translated plant compares.
 */

import { quatToDcm } from './as205EciPlant'
import { mat3MulVec, mat3Transpose, type Mat3, type Vec3 } from './as205Mes'
import type { EomPhysicsOptions } from './sixDofVarMassEom'

export type Quat = [number, number, number, number]

export interface EomState {
  r_i: Vec3
  v_b: Vec3
  omega_b: Vec3
  /** Raw quaternion (pre-normalize); consumers use qHat */
  q: Quat
  m: number
}

export interface EomInput {
  F_b: Vec3
  M_b: Vec3
  /** Propellant mass-flow ≥ 0; ṁ = −mdot_prop */
  mdot_prop: number
}

export interface EomParams {
  mu: number
  /** Principal reference inertia [Ixx, Iyy, Izz] at m_ref */
  I_ref: Vec3
  m_ref: number
  m_min?: number
  physics?: EomPhysicsOptions
}

export interface EomDeriv {
  r_dot: Vec3
  v_dot: Vec3
  omega_dot: Vec3
  q_dot: Quat
  m_dot: number
}

const EPS = 1e-15

export function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function vecSub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function vecScale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s]
}

export function vecCross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
}

export function vecDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function vecNorm(a: Vec3): number {
  return Math.sqrt(vecDot(a, a))
}

export function quatNorm(q: Quat): number {
  return Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3])
}

export function normalizeQuat(q: Quat): Quat {
  const n = quatNorm(q)
  if (n < EPS) return [1, 0, 0, 0]
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]
}

/** g_i = −μ r / |r|³ */
export function gravityInertial(r_i: Vec3, mu: number): Vec3 {
  const r2 = vecDot(r_i, r_i)
  const r = Math.sqrt(r2)
  if (r < EPS) return [0, 0, 0]
  const s = -mu / (r2 * r)
  return vecScale(r_i, s)
}

/** Principal I(m) = I_ref · (m / m_ref) */
export function inertiaDiag(I_ref: Vec3, m: number, m_ref: number): Vec3 {
  const s = m / m_ref
  return vecScale(I_ref, s)
}

/** İ = I_ref · (ṁ / m_ref) */
export function inertiaDotDiag(
  I_ref: Vec3,
  mdot: number,
  m_ref: number
): Vec3 {
  return vecScale(I_ref, mdot / m_ref)
}

/** Element-wise I^{-1} (principal): y_i = x_i / I_i */
export function invDiagMul(I: Vec3, x: Vec3): Vec3 {
  return [
    Math.abs(I[0]) > EPS ? x[0] / I[0] : 0,
    Math.abs(I[1]) > EPS ? x[1] / I[1] : 0,
    Math.abs(I[2]) > EPS ? x[2] / I[2] : 0
  ]
}

/**
 * q̇ = ½ Ω(ω) q  (scalar-first quaternion, body rates).
 * Matches body2quaternion_rates convention used in the Obliq plant.
 */
export function quatRatesBody(omega: Vec3, q: Quat): Quat {
  const [q0, q1, q2, q3] = q
  const [wx, wy, wz] = omega
  return [
    0.5 * (-wx * q1 - wy * q2 - wz * q3),
    0.5 * (wx * q0 + wz * q2 - wy * q3),
    0.5 * (wy * q0 - wz * q1 + wx * q3),
    0.5 * (wz * q0 + wy * q1 - wx * q2)
  ]
}

/**
 * Continuous RHS at one instant. Attitude consumers use unit quat.
 */
export function eomRhs(
  state: EomState,
  input: EomInput,
  params: EomParams
): EomDeriv {
  const physics = params.physics ?? {}
  const m = Math.max(state.m, params.m_min ?? 1)
  const mdot = -Math.max(0, input.mdot_prop)
  const qHat = normalizeQuat(state.q)
  const C_bi = quatToDcm(qHat) // body → inertial
  const C_ib = mat3Transpose(C_bi)

  const g_i = gravityInertial(state.r_i, params.mu)
  const g_b = mat3MulVec(C_ib, g_i) // inertial → body

  const wxv = vecCross(state.omega_b, state.v_b)
  let v_dot: Vec3
  if (physics.forcePathGravity) {
    const F_aug = vecAdd(input.F_b, vecScale(g_b, m))
    v_dot = vecSub(vecScale(F_aug, 1 / m), wxv)
  } else {
    v_dot = vecAdd(vecSub(vecScale(input.F_b, 1 / m), wxv), g_b)
  }

  const I = inertiaDiag(params.I_ref, m, params.m_ref)
  const Iomega = [
    I[0] * state.omega_b[0],
    I[1] * state.omega_b[1],
    I[2] * state.omega_b[2]
  ] as Vec3
  const wIw = vecCross(state.omega_b, Iomega)
  let M_net = vecSub(input.M_b, wIw)
  if (!physics.zeroIdot) {
    const Idot = inertiaDotDiag(params.I_ref, mdot, params.m_ref)
    const Idot_w = [
      Idot[0] * state.omega_b[0],
      Idot[1] * state.omega_b[1],
      Idot[2] * state.omega_b[2]
    ] as Vec3
    M_net = vecSub(M_net, Idot_w)
  }
  const omega_dot = invDiagMul(I, M_net)

  const r_dot = physics.veViaTranspose
    ? mat3MulVec(C_ib, state.v_b)
    : mat3MulVec(C_bi, state.v_b)

  return {
    r_dot,
    v_dot,
    omega_dot,
    q_dot: quatRatesBody(state.omega_b, qHat),
    m_dot: mdot
  }
}

/** Classic RK4 step; renormalizes quaternion after the update. */
export function eomStepRk4(
  state: EomState,
  input: EomInput,
  params: EomParams,
  dt: number
): EomState {
  const addState = (s: EomState, d: EomDeriv, h: number): EomState => ({
    r_i: vecAdd(s.r_i, vecScale(d.r_dot, h)),
    v_b: vecAdd(s.v_b, vecScale(d.v_dot, h)),
    omega_b: vecAdd(s.omega_b, vecScale(d.omega_dot, h)),
    q: [
      s.q[0] + d.q_dot[0] * h,
      s.q[1] + d.q_dot[1] * h,
      s.q[2] + d.q_dot[2] * h,
      s.q[3] + d.q_dot[3] * h
    ],
    m: Math.max(s.m + d.m_dot * h, params.m_min ?? 1)
  })
  const combine = (
    k1: EomDeriv,
    k2: EomDeriv,
    k3: EomDeriv,
    k4: EomDeriv
  ): EomDeriv => ({
    r_dot: vecScale(
      vecAdd(vecAdd(k1.r_dot, vecScale(k2.r_dot, 2)), vecAdd(vecScale(k3.r_dot, 2), k4.r_dot)),
      1 / 6
    ),
    v_dot: vecScale(
      vecAdd(vecAdd(k1.v_dot, vecScale(k2.v_dot, 2)), vecAdd(vecScale(k3.v_dot, 2), k4.v_dot)),
      1 / 6
    ),
    omega_dot: vecScale(
      vecAdd(
        vecAdd(k1.omega_dot, vecScale(k2.omega_dot, 2)),
        vecAdd(vecScale(k3.omega_dot, 2), k4.omega_dot)
      ),
      1 / 6
    ),
    q_dot: [
      (k1.q_dot[0] + 2 * k2.q_dot[0] + 2 * k3.q_dot[0] + k4.q_dot[0]) / 6,
      (k1.q_dot[1] + 2 * k2.q_dot[1] + 2 * k3.q_dot[1] + k4.q_dot[1]) / 6,
      (k1.q_dot[2] + 2 * k2.q_dot[2] + 2 * k3.q_dot[2] + k4.q_dot[2]) / 6,
      (k1.q_dot[3] + 2 * k2.q_dot[3] + 2 * k3.q_dot[3] + k4.q_dot[3]) / 6
    ],
    m_dot: (k1.m_dot + 2 * k2.m_dot + 2 * k3.m_dot + k4.m_dot) / 6
  })

  const k1 = eomRhs(state, input, params)
  const k2 = eomRhs(addState(state, k1, dt / 2), input, params)
  const k3 = eomRhs(addState(state, k2, dt / 2), input, params)
  const k4 = eomRhs(addState(state, k3, dt), input, params)
  const d = combine(k1, k2, k3, k4)
  const next = addState(state, d, dt)
  return { ...next, q: normalizeQuat(next.q) }
}

export type { Mat3, Vec3 }

/**
 * Body → S (plumbline / SM) attitude — Simulink BODYtoSM / EDD [MBS] path.
 *
 * Composition used in plant (matches ECI 6DoF + MES):
 *   C_bE = quat_to_dcm(q)     // body → E
 *   C_bS = MES · C_bE         // body → S  (v_S = C_bS v_b)
 *
 * Aerospace ZYX Euler of C_bS (scalar-first quat intermediate):
 *   Φ = roll, Θ = pitch, Ψ = yaw  (body relative to S)
 * At pad B‖S: C_bS ≈ I ⇒ (Φ,Θ,Ψ) ≈ 0.
 *
 * Geometric elev from horizontal (TN open-loop program mapping):
 *   elev = asin(clamp(C_bS[0][0])) = asin(X_b · X_S)
 *   elev = π/2 at vertical; decreases as nose tips toward Z_S.
 * Note: elev is **not** the same quantity as Euler Θ (Θ=0 at B‖S).
 *
 * Full EDD [MBS] element formulas (gimbal angles) not expanded here —
 * plant uses C_bS from MES·C_bE (same DCM as stacked Body→E→S).
 */

import {
  dcmToQuat,
  elevRadFromCbS,
  quatToDcm,
  type QuatCol
} from './as205EciPlant'
import {
  mat3Mul,
  mat3Transpose,
  type Mat3
} from './as205Mes'
import type { Vec3 } from './as205PadFrames'

export interface BodyToSmAttitude {
  /** Body → S DCM */
  C_bS: Mat3
  /** Roll Φ (rad) about body X relative to S */
  phi_rad: number
  /** Pitch Θ (rad) about body Y relative to S */
  theta_rad: number
  /** Yaw Ψ (rad) about body Z relative to S */
  psi_rad: number
  /** Geometric elev from horizontal (rad); π/2 vertical */
  elev_rad: number
  /** Body +X unit vector in S */
  X_b_S: Vec3
  notes: string[]
}

/**
 * Aerospace ZYX Euler from body→fixed DCM (matches OrientationConversionBlockModule
 * quat_to_euler after dcm_to_quat). DCM is body→fixed (here fixed = S).
 */
export function eulerZyxFromDcmBodyToFixed(dcm: Mat3): {
  phi_rad: number
  theta_rad: number
  psi_rad: number
} {
  // Prefer quat path for consistency with plant orientation_conversion
  const q = dcmToQuat(dcm)
  const [q0, q1, q2, q3] = q

  const sinr_cosp = 2.0 * (q0 * q1 + q2 * q3)
  const cosr_cosp = 1.0 - 2.0 * (q1 * q1 + q2 * q2)
  const phi_rad = Math.atan2(sinr_cosp, cosr_cosp)

  const sinp = 2.0 * (q0 * q2 - q3 * q1)
  let theta_rad: number
  if (Math.abs(sinp) >= 1.0) {
    theta_rad = Math.sign(sinp) * (Math.PI / 2)
  } else {
    theta_rad = Math.asin(sinp)
  }

  const siny_cosp = 2.0 * (q0 * q3 + q1 * q2)
  const cosy_cosp = 1.0 - 2.0 * (q2 * q2 + q3 * q3)
  const psi_rad = Math.atan2(siny_cosp, cosy_cosp)

  return { phi_rad, theta_rad, psi_rad }
}

/** C_bS = MES · C_bE */
export function bodyToSDcm(MES: Mat3, C_bE: Mat3): Mat3 {
  return mat3Mul(MES, C_bE)
}

/**
 * Full Body→S attitude package from MES and body→E DCM.
 */
export function computeBodyToSm(MES: Mat3, C_bE: Mat3): BodyToSmAttitude {
  const C_bS = bodyToSDcm(MES, C_bE)
  const eul = eulerZyxFromDcmBodyToFixed(C_bS)
  const elev_rad = elevRadFromCbS(C_bS)
  const X_b_S: Vec3 = [C_bS[0][0], C_bS[1][0], C_bS[2][0]]
  return {
    C_bS,
    phi_rad: eul.phi_rad,
    theta_rad: eul.theta_rad,
    psi_rad: eul.psi_rad,
    elev_rad,
    X_b_S,
    notes: [
      'C_bS = MES · C_bE (Body→E→S)',
      'Euler ZYX via dcm_to_quat + quat_to_euler (plant orientation_conversion)',
      'elev = asin(X_b·X_S); not equal to Euler Θ'
    ]
  }
}

/**
 * Pad check: C_bE = MESᵀ ⇒ C_bS = I ⇒ Euler ~0, elev ~ π/2.
 */
export function bodyToSmAtPad(MES: Mat3): BodyToSmAttitude {
  return computeBodyToSm(MES, mat3Transpose(MES))
}

/** Column quat for plant IC from C_bS (usually identity at pad). */
export function quatColFromCbS(C_bS: Mat3): QuatCol {
  const q = dcmToQuat(C_bS)
  return [[q[0]], [q[1]], [q[2]], [q[3]]]
}

// Re-export for plant wiring docs
export { elevRadFromCbS, quatToDcm }

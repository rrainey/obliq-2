/**
 * AS-205 / Simulink Initial Position & Velocity in S-frame.
 *
 * Ported from `saturn_ib_stack.mdl` subsystem
 *   "Initial Position and Velocity (Eqns. 3.4.3-4)"
 * which builds pad state for the Custom Variable Mass 6DoF block.
 *
 * Mux into Fcn blocks (1-based u as in Simulink Fcn):
 *   u1 = R_L_m
 *   u2 = sin(A_z),  u3 = cos(A_z)
 *   u4 = sin(φ_L),  u5 = cos(φ_L)          (geodetic)
 *   u6 = sin(φ_L − φ_L′), u7 = cos(φ_L − φ_L′)
 *   u8 = sin(φ_L′), u9 = cos(φ_L′)         (geocentric)
 *
 * R_S_0 = [ u1*u7,  u1*u6*u2,  −u1*u6*u3 ]
 * V_S_0 = [ 0,  u1*ω*u9*u3,  u1*ω*u9*u2 ]
 *   with ω = omega_E_rps * π  (mdl mask stores ω/π ≈ 2.321e-5)
 *
 * S-frame (EDD plumbline, space-fixed at GRR): X_S up, Z_S downrange, Y_S RH.
 * TN Space frame ≈ S (working assumption). Prefer h/mass residuals until full
 * ECI→S matches Simulink MES.
 */

import { AS205_PAD, OMEGA_EARTH, type Vec3 } from './as205PadFrames'

/** Simulink mask value: Earth rate / π (rad/s). ω = this * π. */
export const SIMULINK_OMEGA_E_RPS_OVER_PI = 0.000023211523

export interface InitialPositionS {
  /** Position in S-frame (m) — Simulink `R_S_0_m` */
  R_S_0_m: Vec3
  /** Inertial velocity in S-frame (m/s) — Simulink `V_S_0_mps` */
  V_S_0_m: Vec3
  /** |V_S_0| */
  V_S_0_mag: number
  /** ω used (rad/s) */
  omega_E_radps: number
  /** Geodetic − geocentric latitude (rad) */
  delta_phi_rad: number
  notes: string[]
}

function deg2rad(d: number): number {
  return (d * Math.PI) / 180
}

/**
 * Exact Simulink Fcn chain for pad R_S, V_S.
 */
export function computeSimulinkInitialPositionS(opts?: {
  R_L_m?: number
  A_z_deg?: number
  phi_L_deg?: number
  phi_L_prime_deg?: number
  /** If true, use mask omega/π * π; else OMEGA_EARTH */
  useSimulinkOmegaMask?: boolean
}): InitialPositionS {
  const R = opts?.R_L_m ?? AS205_PAD.R_L_m
  const az = deg2rad(opts?.A_z_deg ?? AS205_PAD.A_z_deg)
  const phi = deg2rad(opts?.phi_L_deg ?? AS205_PAD.phi_L_deg)
  const phiP = deg2rad(opts?.phi_L_prime_deg ?? AS205_PAD.phi_L_prime_deg)

  const sAz = Math.sin(az)
  const cAz = Math.cos(az)
  const sPhi = Math.sin(phi)
  const cPhi = Math.cos(phi)
  const dPhi = phi - phiP
  const sD = Math.sin(dPhi)
  const cD = Math.cos(dPhi)
  const sPp = Math.sin(phiP)
  const cPp = Math.cos(phiP)

  // Match Simulink mask path by default for stack fidelity
  const omega =
    opts?.useSimulinkOmegaMask === false
      ? OMEGA_EARTH
      : SIMULINK_OMEGA_E_RPS_OVER_PI * Math.PI

  // Fcn / Fcn1 / Fcn2 → R_S_0
  const R_S_0_m: Vec3 = [
    R * cD, // u1*u7
    R * sD * sAz, // u1*u6*u2
    -R * sD * cAz // -u1*u6*u3
  ]

  // Fcn3 / Fcn4 / Fcn5 → V_S_0
  const V_S_0_m: Vec3 = [
    0.0,
    R * omega * cPp * cAz, // u1*ω*u9*u3
    R * omega * cPp * sAz // u1*ω*u9*u2
  ]

  const V_S_0_mag = Math.hypot(V_S_0_m[0], V_S_0_m[1], V_S_0_m[2])

  return {
    R_S_0_m,
    V_S_0_m,
    V_S_0_mag,
    omega_E_radps: omega,
    delta_phi_rad: dPhi,
    notes: [
      'Port of saturn_ib_stack Initial Position and Velocity (Eqns 3.4.3-4)',
      `ω_E = ${omega.toExponential(6)} rad/s (Simulink mask uses ω/π)`,
      `|R_S|=${Math.hypot(...R_S_0_m).toFixed(3)} m (≠ R_L when φ≠φ′)`,
      `|V_S|=${V_S_0_mag.toFixed(3)} m/s (TN first-motion space-fixed V ≈ 409 m/s)`,
      'B‖S at pad still uses identity quat; plant r0/v0 should use these vectors'
    ]
  }
}

/** Default AS-205 LC-34 pad state matching Simulink formulas. */
export function as205SimulinkPadStateS(): InitialPositionS {
  return computeSimulinkInitialPositionS({ useSimulinkOmegaMask: true })
}

/**
 * Parent IGM Chi path helpers — MDL/RTW `<S356>` / `<S419>` / `<S420>`.
 *
 * Ports:
 * - S419 combinations of Intermediate Params
 * - AP·(R,V,A), φ_T / Rot, ΔV targeting (S384 Add9), Gain1_h, T_3 correction
 * - S420 K_p / ΔX_V trig → commanded angles → Product15 unit vector
 * - Terminal atan2 Chi_Y/Z from Product15 v
 *
 * RTW: Saturn_IB_Stack.c ~9995–10730. AP from ConstB `<S413>` (orthonormal);
 * MDL MaskValueString for AP_dcm was line-wrap corrupted (extra digits).
 */

import type { IgmIntermediateOut } from './igmIntermediateParameters'
import { IGM_V_EX3_MPS } from './igmIntermediateParameters'

export const IGM_V_T_MPS = 7780.976
export const IGM_R_T_M = 6570774.0
export const IGM_XDOTDOT_VGT = -9.251

/** RTW ConstB `<S413>` AP (row-major). Unit rows/cols — not the corrupted mask string. */
export const IGM_AP_DCM: [
  [number, number, number],
  [number, number, number],
  [number, number, number]
] = [
  [-0.18761025481983781, 0.020946732548935004, 0.98202017631103633],
  [-0.0032640844541337311, 0.99975377243113506, -0.021948582241013453],
  [-0.98223812695247759, -0.007323175898313234, -0.18749568809882156]
]

/**
 * APᵀ — RTW `<S356>/Math Function5` (transpose) before terminal Product15.
 * State rotation still uses AP; Chi unit-vector Product15 uses APᵀ · v_cmd.
 */
export const IGM_AP_DCM_T: typeof IGM_AP_DCM = [
  [IGM_AP_DCM[0][0], IGM_AP_DCM[1][0], IGM_AP_DCM[2][0]],
  [IGM_AP_DCM[0][1], IGM_AP_DCM[1][1], IGM_AP_DCM[2][1]],
  [IGM_AP_DCM[0][2], IGM_AP_DCM[1][2], IGM_AP_DCM[2][2]]
]

/** RTW `<S356>/Divide1` invariant (= 1) */
export const IGM_PHI_IT_SCALE = 1.5218907239847239e-7

export type Vec3 = [number, number, number]

export function mat3Vec(M: typeof IGM_AP_DCM, v: Vec3): Vec3 {
  return [
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]
  ]
}

/** Product8/9/10-style: rotate S-frame state by AP */
/** AP · (R_S, V_S, G_S). Third vector is gravity (Product10), not A_m. */
export function igmApRotateState(
  XS: Vec3,
  VS: Vec3,
  GS: Vec3,
  AP: typeof IGM_AP_DCM = IGM_AP_DCM
): { R: Vec3; V: Vec3; G: Vec3 } {
  return { R: mat3Vec(AP, XS), V: mat3Vec(AP, VS), G: mat3Vec(AP, GS) }
}

/**
 * φ-frame DCM from RTW `<S356>` Product9/10 buffer (column-major):
 *   [ c, 0,  s]
 *   [ 0, 1,  0]
 *   [-s, 0,  c]
 * i.e. Rot_Y(−φ) in the usual right-handed sense — NOT the +φ form.
 */
export function rotPhiY(phi: number): typeof IGM_AP_DCM {
  const c = Math.cos(phi)
  const s = Math.sin(phi)
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c]
  ]
}

/**
 * RTW φ_iT (rad) — range/velocity target bias before atan2(R).
 * Divide1_ia = 1.
 */
export function igmPhiIT(
  inter: IgmIntermediateOut,
  T1: number,
  tau1: number,
  tau3: number,
  T3: number,
  V_mag: number,
  V_ex3 = IGM_V_EX3_MPS,
  V_T = IGM_V_T_MPS
): number {
  const T_star = T1 + T3
  const L_prime_y = inter.L1 + inter.L_prime_3
  const term1 =
    V_mag * T_star - inter.J_prime_3 + L_prime_y * T3
  const massTerm =
    (tau1 - T1) * inter.L1 + (tau3 - T3) * inter.L_prime_3
  const term2 =
    massTerm * (1.8 / V_ex3) * (L_prime_y + V_mag - V_T)
  return (term1 - term2 + inter.S1) * IGM_PHI_IT_SCALE
}

/**
 * RTW `<S384>/Add9` — velocity to be gained (φ/V-frame).
 * Add9 = V_T − V − T_star * ½ (G_TV + G)
 *
 * `G` is **gravity** in the φ-frame (MDL Product10 / G_V_bar), not A_m /
 * XYZdotdot. `G_TV` mask const is named XYZdotdot_VT in the MDL but fed as
 * the G_TV port of Estimated Velocity-to-be-gained.
 */
export function igmDeltaV(
  V: Vec3,
  G: Vec3,
  T_star: number,
  V_T: Vec3 = [0, 0, IGM_V_T_MPS],
  G_TV: Vec3 = [IGM_XDOTDOT_VGT, 0, 0]
): Vec3 {
  return [
    V_T[0] - V[0] - T_star * 0.5 * (G_TV[0] + G[0]),
    V_T[1] - V[1] - T_star * 0.5 * (G_TV[1] + G[1]),
    V_T[2] - V[2] - T_star * 0.5 * (G_TV[2] + G[2])
  ]
}

/** RTW Gain1_h = (|ΔV|² / L_y − L_y) / 2 */
export function igmGain1_h(dV: Vec3, L_y: number): number {
  const mag2 = dV[0] * dV[0] + dV[1] * dV[1] + dV[2] * dV[2]
  if (!(L_y > 1e-9)) return 0
  return (mag2 / L_y - L_y) * 0.5
}

/** RTW Gain5_k = (τ3 − T3) * 2.3851001837481181e-4 */
export function igmGain5_k(tau3: number, T3: number): number {
  return (tau3 - T3) * 2.3851001837481181e-4
}

/**
 * Interim Chi from ΔV (until full S420 K_p unit vector):
 * Chi_Y ≈ deg(atan2(-dV_x, dV_z)) in the AP/V frame.
 */
export function chiYDegFromDeltaV(dV: Vec3): number {
  return (Math.atan2(-dV[0], dV[2]) * 180) / Math.PI
}

/** χ_α = atan(ΔV_x / ΔV_z); χ_β = atan(ΔV_y / √(ΔV_x²+ΔV_z²)) */
export function igmChiAlphaBeta(dV: Vec3): { chi_a: number; chi_b: number } {
  const chi_a = Math.atan(dV[0] / (dV[2] !== 0 ? dV[2] : 1e-12))
  const horiz = Math.hypot(dV[0], dV[2])
  const chi_b = Math.atan(dV[1] / (horiz > 1e-12 ? horiz : 1e-12))
  return { chi_a, chi_b }
}

export interface IgmS419Combos {
  /** L_y = L1 + L′3 + Gain1_h  (RTW: Gain_m + Add11) */
  L_y: number
  /** J_3 = T3_eff * Gain1_h + J′3 */
  J_3: number
  /** S_3 = T3_eff * Add11 − J_3 */
  S_3: number
  /** Q_3 = S_3 * τ3 − ½ V_ex3 T3_eff² */
  Q_3: number
  /** Q_y = Q1 + Q_3 + S_3*T1 + J1*T3_eff */
  Q_y: number
  /** J_y = J1 + J_3 + Add11*T1 */
  J_y: number
  /** S_y = S1 − J_3 + L_y*T3_eff */
  S_y: number
  /** L_y / J_y (RTW Divide before pitch channel) */
  L_over_J: number
}

/**
 * @param inter Intermediate Parameters outs
 * @param T1 Multiport T_1_i
 * @param tau3 Multiport τ3
 * @param T3 Multiport T_3_i (before Add8 correction)
 * @param V_ex3 mask
 * @param Gain1_h RTW `( |ΔV|² / L'_y − L'_y ) / 2`
 * @param T3_eff RTW Add8 = T3 + Gain5_k*Gain1_h
 */
export function igmS419Combos(
  inter: IgmIntermediateOut,
  T1: number,
  tau3: number,
  T3: number,
  V_ex3: number,
  Gain1_h = 0,
  T3_eff = T3
): IgmS419Combos {
  const Add11 = inter.L_prime_3 + Gain1_h
  const L_y = inter.L1 + Add11
  const J_3 = T3_eff * Gain1_h + inter.J_prime_3
  const S_3 = T3_eff * Add11 - J_3
  const Q_3 = S_3 * tau3 - 0.5 * V_ex3 * T3_eff * T3_eff
  const Q_y =
    inter.Q1 + Q_3 + S_3 * T1 + inter.J1 * T3_eff
  const J_y = inter.J1 + J_3 + Add11 * T1
  const S_y = inter.S1 - J_3 + L_y * T3_eff
  const L_over_J = Math.abs(J_y) > 1e-12 ? L_y / J_y : 0
  return { L_y, J_3, S_3, Q_3, Q_y, J_y, S_y, L_over_J }
}

export interface IgmS420Out {
  K_p: number
  DeltaX_V: number
  /** χ̇_β / chi-rate channel (Divide1_g) */
  chi_b_rate: number
  /** χ̇_β * L/J (Product6) */
  chi_b_rate_LJ: number
  /** χ̇_α channel (Divide1 after K_p) */
  chi_a_rate: number
  /** χ̇_α * K_p */
  chi_a_rate_Kp: number
  /** Commanded angles (rad) feeding Product15 unit vector */
  chi_a_cmd: number
  chi_b_cmd: number
  /** Unit vector before AP (Product15 in) */
  v_cmd: Vec3
  /** Product15 = APᵀ · v_cmd (RTW Math Function5) */
  v: Vec3
  Chi_Y_deg: number
  Chi_Z_deg: number
  elev_cmd_deg: number
}

/**
 * RTW `<S420>` + Product15 + terminal Chi_Y/Z.
 *
 * When T3_eff ≤ 15 (RTW Compare), chi-rate switches force 0 (near cutoff).
 */
export function igmS420Product15(args: {
  inter: IgmIntermediateOut
  s419: IgmS419Combos
  T1: number
  tau1: number
  tau3: number
  T3_eff: number
  /** R, V, G already in φ_T (terminal) frame — G = Product10 gravity */
  R: Vec3
  V: Vec3
  G: Vec3
  dV: Vec3
  phi_T: number
  delta_T?: number
  SMCY_rad?: number
  SMCZ_rad?: number
  AP?: typeof IGM_AP_DCM
  R_T?: number
  V_ex3?: number
}): IgmS420Out {
  const {
    inter,
    s419,
    T1,
    tau3,
    T3_eff,
    R,
    V,
    G,
    dV,
    phi_T,
    delta_T = 1.6,
    SMCY_rad = 0,
    SMCZ_rad = 0,
    AP = IGM_AP_DCM,
    R_T = IGM_R_T_M,
    V_ex3 = IGM_V_EX3_MPS
  } = args
  const { chi_a, chi_b } = igmChiAlphaBeta(dV)
  const T_star = T1 + T3_eff
  const { L_y, J_y, S_y, Q_y, J_3, S_3, Q_3, L_over_J } = s419

  const sin_b = Math.sin(chi_b)
  const cos_b = Math.cos(chi_b)
  const sin_a = Math.sin(chi_a)
  const cos_a = Math.cos(chi_a)

  // S419 Divide1 / Product6 (out-of-plane channel) — RTW uses G_φ (Product10)
  const num_b =
    T_star * T_star * G[1] * 0.5 + (V[1] * T_star + R[1]) + sin_b * S_y
  const den_b = (S_y - Q_y * L_over_J) * cos_b
  const chi_b_rate = Math.abs(den_b) > 1e-12 ? num_b / den_b : 0
  const chi_b_rate_LJ = chi_b_rate * L_over_J

  // S420 C2, C4, S_p, ΔX_V
  const C_2 = sin_b * chi_b_rate + cos_b
  const C_4 = sin_b * chi_b_rate_LJ
  const S_p = S_y * C_2 - Q_y * C_4
  const DeltaX_V =
    R[0] -
    R_T +
    V[0] * T_star +
    T_star * T_star * G[0] * 0.5 +
    sin_a * S_p

  // K_p — RTW Divide
  const Add_kq = 2 * T1 + tau3
  const halfVex3T3sq = 0.5 * V_ex3 * T3_eff * T3_eff
  // Gain1_h = L_y − L1 − L′3; Add11 = L′3 + Gain1_h
  const Gain1_h = L_y - inter.L1 - inter.L_prime_3
  const Add11_g = inter.L_prime_3 + Gain1_h
  const P1 = inter.P1
  const K_p_den =
    C_2 * J_y -
    (P1 + (Add_kq * J_3 - halfVex3T3sq) + T1 * T1 * Add11_g) * C_4
  const K_p =
    Math.abs(K_p_den) > 1e-12 ? (L_y * cos_b) / K_p_den : 0

  // χ̇_α = DeltaX_V / ((S_p - (C_2*Q_y - U_term*C_4)*K_p) * cos χ_α)
  const poly_T3 = (V_ex3 / 6) * T3_eff * T3_eff * T3_eff
  const U1 = inter.U1
  const U_term =
    Add_kq * Q_3 -
    poly_T3 +
    U1 +
    S_3 * T1 * T1 +
    T3_eff * P1
  const Sp_corr = S_p - (C_2 * Q_y - U_term * C_4) * K_p
  const den_a = Sp_corr * cos_a
  const chi_a_rate = Math.abs(den_a) > 1e-12 ? DeltaX_V / den_a : 0
  const chi_a_rate_Kp = chi_a_rate * K_p

  // Near-cutoff freeze (T3_eff ≤ 15)
  const freeze = T3_eff <= 15
  const sw_b = freeze ? 0 : chi_b_rate
  const sw_b_LJ = freeze ? 0 : chi_b_rate_LJ
  const sw_a = freeze ? 0 : chi_a_rate
  const sw_a_Kp = freeze ? 0 : chi_a_rate_Kp

  // Commanded angles (RTW Add12 / Add14)
  const chi_a_cmd =
    chi_a - (sw_a - sw_a_Kp * delta_T) - phi_T - Math.PI / 2
  const chi_b_cmd = chi_b - (sw_b - sw_b_LJ * delta_T)

  // Unit vector → Product15
  const ca = Math.cos(chi_a_cmd)
  const sa = Math.sin(chi_a_cmd)
  const cb = Math.cos(chi_b_cmd)
  const sb = Math.sin(chi_b_cmd)
  const v_cmd: Vec3 = [ca * cb, sb, -sa * cb]
  // RTW `<S356>/Math Function5` = transpose(AP) before Product15
  const APT: typeof IGM_AP_DCM = [
    [AP[0][0], AP[1][0], AP[2][0]],
    [AP[0][1], AP[1][1], AP[2][1]],
    [AP[0][2], AP[1][2], AP[2][2]]
  ]
  const v = mat3Vec(APT, v_cmd)
  const { Chi_Y_deg, Chi_Z_deg } = igmChiYZFromUnitVector(
    v,
    SMCY_rad,
    SMCZ_rad
  )

  return {
    K_p,
    DeltaX_V,
    chi_b_rate,
    chi_b_rate_LJ,
    chi_a_rate,
    chi_a_rate_Kp,
    chi_a_cmd,
    chi_b_cmd,
    v_cmd,
    v,
    Chi_Y_deg,
    Chi_Z_deg,
    elev_cmd_deg: 90 + Chi_Y_deg
  }
}

export interface IgmChiPipelineIn {
  inter: IgmIntermediateOut
  T1: number
  tau1: number
  tau3: number
  T3: number
  XS: Vec3
  VS: Vec3
  /** S-frame gravity (MDL G_S / Product10), not A_m */
  GS: Vec3
}

/**
 * Full pipeline: AP → φ_T/Rot → ΔV(G) → Gain1_h → T3_eff → S419 → S420 Product15 Chi.
 */
export function igmChiPipeline(inp: IgmChiPipelineIn): {
  Chi_Y_deg: number
  Chi_Z_deg: number
  elev_cmd_deg: number
  Gain1_h: number
  T3_eff: number
  dV: Vec3
  s419: IgmS419Combos
  s420: IgmS420Out
  phi_T: number
} {
  const { R: Rap, V: Vap, G: Gap } = igmApRotateState(
    inp.XS,
    inp.VS,
    inp.GS
  )
  const V_mag = Math.hypot(inp.VS[0], inp.VS[1], inp.VS[2])
  const phi_iT = igmPhiIT(
    inp.inter,
    inp.T1,
    inp.tau1,
    inp.tau3,
    inp.T3,
    V_mag
  )
  const phi_T = Math.atan2(Rap[2], Rap[0]) + phi_iT
  const Rot = rotPhiY(phi_T)
  const R = mat3Vec(Rot, Rap)
  const V = mat3Vec(Rot, Vap)
  const G = mat3Vec(Rot, Gap)

  const T_star0 = inp.T1 + inp.T3
  const dV0 = igmDeltaV(V, G, T_star0)
  const seed = igmS419Combos(
    inp.inter,
    inp.T1,
    inp.tau3,
    inp.T3,
    IGM_V_EX3_MPS,
    0,
    inp.T3
  )
  const Gain1_h = igmGain1_h(dV0, seed.L_y)
  const T3_eff = inp.T3 + igmGain5_k(inp.tau3, inp.T3) * Gain1_h
  const s419 = igmS419Combos(
    inp.inter,
    inp.T1,
    inp.tau3,
    inp.T3,
    IGM_V_EX3_MPS,
    Gain1_h,
    T3_eff
  )
  const dV = igmDeltaV(V, G, inp.T1 + T3_eff)
  const s420 = igmS420Product15({
    inter: inp.inter,
    s419,
    T1: inp.T1,
    tau1: inp.tau1,
    tau3: inp.tau3,
    T3_eff,
    R,
    V,
    G,
    dV,
    phi_T
  })

  return {
    Chi_Y_deg: s420.Chi_Y_deg,
    Chi_Z_deg: s420.Chi_Z_deg,
    elev_cmd_deg: s420.elev_cmd_deg,
    Gain1_h,
    T3_eff,
    dV,
    s419,
    s420,
    phi_T
  }
}

/** Terminal Chi_Y/Z from commanded unit vector in S (after AP×cmd). */
export function igmChiYZFromUnitVector(
  v: [number, number, number],
  SMCY_rad = 0,
  SMCZ_rad = 0
): { Chi_Y_deg: number; Chi_Z_deg: number } {
  const Chi_Y_deg =
    ((Math.atan2(-v[2], v[0]) + SMCY_rad) * 180) / Math.PI
  const s = 1 - v[1] * v[1]
  const denom = s > 0 ? Math.sqrt(s) : 0
  let Chi_Z_deg =
    denom > 1e-12
      ? ((Math.atan(v[1] / denom) + SMCZ_rad) * 180) / Math.PI
      : 0
  if (Chi_Z_deg > 45) Chi_Z_deg = 45
  if (Chi_Z_deg < -45) Chi_Z_deg = -45
  return { Chi_Y_deg, Chi_Z_deg }
}

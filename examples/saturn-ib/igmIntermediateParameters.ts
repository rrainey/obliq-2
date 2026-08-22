/**
 * MDL `IGM Intermediate Parameters` (EDD eqn. 4.4.20–28).
 *
 * Ins: tau_1, T_1_i, tau_3, T_3_i (from mode multiport / presets)
 * Outs: L1, J1, S1, Q1, P1, U1, L'_3, L'_y, J'_3
 *
 * Algebra cross-checked against RTW `<S388>` (log form).
 * Mask presets: V_ex1=4135.6997, V_ex3=4192.696 (MDL MaskValueString).
 */

/** MDL mask V_ex1 (m/s) */
export const IGM_V_EX1_MPS = 4135.6997
/** MDL mask V_ex3 (m/s) */
export const IGM_V_EX3_MPS = 4192.696

export interface IgmTauState {
  tau_1_sec: number
  T_1_i_sec: number
  tau_3_sec: number
  T_3_i_sec: number
}

export interface IgmIntermediateOut {
  L1: number
  J1: number
  S1: number
  Q1: number
  P1: number
  U1: number
  L_prime_3: number
  L_prime_y: number
  J_prime_3: number
}

function safeLogRatio(tau: number, T: number): number {
  const den = tau - T
  if (!(tau > 0) || !(den > 0)) return Number.NEGATIVE_INFINITY
  return Math.log(tau / den)
}

/**
 * Stage-1 (and shared) integrals — MDL Gain/Add/Divide chain for L1…U1.
 *
 * L1 = V_ex1 * log(τ1/(τ1−T1))
 * J1 = L1*τ1 − T1*V_ex1
 * S1 = L1*T1 − J1
 * Then Q1,P1,U1 from squared / polynomial chain (EDD 4.4.23–25).
 */
export function igmIntermediateParameters(
  s: IgmTauState,
  V_ex1 = IGM_V_EX1_MPS,
  V_ex3 = IGM_V_EX3_MPS
): IgmIntermediateOut {
  const { tau_1_sec: tau1, T_1_i_sec: T1, tau_3_sec: tau3, T_3_i_sec: T3 } = s

  // RTW <S388>: L1=V_ex1*log(τ1/(τ1−T1)); J1=L1*τ1−T1*V_ex1; S1=L1*T1−J1
  const L1 = V_ex1 * safeLogRatio(tau1, T1)
  const J1 = L1 * tau1 - T1 * V_ex1
  const S1 = L1 * T1 - J1

  // Gain2 = ½ V_ex1 T1²; Q1 = S1*τ1 − Gain2; P1 = J1*τ1 − Gain2
  const halfVexT2 = 0.5 * V_ex1 * T1 * T1
  const Q1 = S1 * tau1 - halfVexT2
  const P1 = J1 * tau1 - halfVexT2

  // U1 = Q1*τ1 − (V_ex1/6) T1³  (Divide5 − Polynomial)
  const U1 = Q1 * tau1 - (V_ex1 / 6.0) * T1 * T1 * T1

  // Stage-3: L′3 = V_ex3*log(τ3/(τ3−T3)); L′y = L1+L′3; J′3 = L′3*τ3 − T3*V_ex3
  const L_prime_3 = V_ex3 * safeLogRatio(tau3, T3)
  const L_prime_y = L1 + L_prime_3
  const J_prime_3 = L_prime_3 * tau3 - T3 * V_ex3

  return {
    L1,
    J1,
    S1,
    Q1,
    P1,
    U1,
    L_prime_3,
    L_prime_y,
    J_prime_3
  }
}

/**
 * Representative τ/T state for tests (T1 &lt; τ1 required for finite log).
 * Mask presets: τ1=286.9, τ3=262.52, T3_i IC=116; T1 counts down from 286.9 in First Phase.
 */
export const IGM_TAU_PRESETS: IgmTauState = {
  tau_1_sec: 286.9,
  T_1_i_sec: 200.0,
  tau_3_sec: 262.52,
  T_3_i_sec: 116.0
}

/**
 * Interim Chi_Y (deg) from body-X expressed in S — placeholder until full
 * Product15/K_p assembly is ported. Matches RTW final atan2(-vz,vx) shape
 * with v = Xb_S and SMCY=0.
 */
export function chiYDegFromXbS(Xb_S: [number, number, number]): number {
  return (Math.atan2(-Xb_S[2], Xb_S[0]) * 180) / Math.PI
}

/** elev_cmd ≈ 90 + Chi_Y (boost convention: vertical Chi=0 → elev=90) */
export function elevCmdDegFromChiY(chiY_deg: number): number {
  return 90 + chiY_deg
}

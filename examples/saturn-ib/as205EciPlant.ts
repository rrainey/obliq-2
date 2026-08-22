/**
 * AS-205 plant state in E (classical ECI) for Simulink-parity 6DoF.
 *
 * Pipeline (matches saturn_ib_stack intent):
 *   1. Initial Position → R_S_0, V_S_0  (as205InitialPosition)
 *   2. [MES] E→S from Az, φ_L, Θ_E      (as205Mes; Θ_E from Apollo 7 LaunchDate)
 *   3. r_E = MESᵀ · R_S ,  v_E = MESᵀ · V_S
 *   4. Pad body = Position I (RTW LVInert Az=100°), not B‖S (Az=A_z).
 *      LIO = computeMes(pad_roll_L, φ_L, Θ_E)  (same Fcn chain as MES, Az=100)
 *      C_b→E = LIOᵀ ,  v_b0 = LIO · v_E
 *   5. q0 = dcm_to_quat(C_b→E)  (Shepperd; matches OrientationConversionBlockModule)
 *
 * Plant EOM integrates r_i in **E**, body v/ω, quaternion body→E.
 * Recover S for TN Space-frame columns: v_S = MES · v_E, r_S = MES · r_E.
 *
 * Residual policy: still prefer h, mass vs TN-AP-67-158 until S-component
 * residual path is exercised. Epoch = Apollo 7 actual (Simulink practice).
 */

import {
  as205DefaultMes,
  as205Mes,
  as205MesFromLaunchDate,
  computeMes,
  eciToS,
  mat3Mul,
  mat3MulVec,
  mat3OrthonormalityError,
  mat3Transpose,
  padStateSToEci,
  sToEci,
  type LaunchDate,
  type Mat3,
  type MesResult
} from './as205Mes'
import {
  as205SimulinkPadStateS,
  type InitialPositionS
} from './as205InitialPosition'
import { AS205_PAD, type Vec3 } from './as205PadFrames'

/** Column quaternion [[q0],[q1],[q2],[q3]] scalar-first (plant IC format). */
export type QuatCol = [[number], [number], [number], [number]]

export interface PadStateEci {
  /** Inertial position in E (m) — plant r0_i */
  r0_E: Vec3
  /**
   * Body velocity IC (m/s). Position I (Az=pad_roll), not B‖S.
   * Plant integrates v_b; ṙ_E = C_bE · v_b.
   */
  v0_b: Vec3
  /** Inertial velocity in E (m/s) — diagnostic / MES check */
  v0_E: Vec3
  /** Body → E quaternion IC (scalar-first column) */
  q0_bE: QuatCol
  /** C_b→E = LIOᵀ (body→ECI; LIO uses Az=pad_roll_L) */
  C_bE: Mat3
  /** [MES] E→S used for this pad (Az=A_z) */
  MES: Mat3
  /** [LIO] E→body at pad (Az=pad_roll_L), RTW LVInert */
  LIO: Mat3
  Theta_E_deg: number
  /** Source S pad */
  padS: InitialPositionS
  notes: string[]
}

/**
 * DCM → quaternion (Shepperd), scalar-first.
 * Matches `OrientationConversionBlockModule` dcm_to_quat codegen.
 * DCM is body→inertial (same as plant quat_to_dcm inverse).
 */
export function dcmToQuat(dcm: Mat3): [number, number, number, number] {
  const trace = dcm[0][0] + dcm[1][1] + dcm[2][2]
  let q0: number, q1: number, q2: number, q3: number

  if (trace > 0.0) {
    const s = 0.5 / Math.sqrt(trace + 1.0)
    q0 = 0.25 / s
    q1 = (dcm[1][2] - dcm[2][1]) * s
    q2 = (dcm[2][0] - dcm[0][2]) * s
    q3 = (dcm[0][1] - dcm[1][0]) * s
  } else if (dcm[0][0] > dcm[1][1] && dcm[0][0] > dcm[2][2]) {
    const s = 2.0 * Math.sqrt(1.0 + dcm[0][0] - dcm[1][1] - dcm[2][2])
    q0 = (dcm[1][2] - dcm[2][1]) / s
    q1 = 0.25 * s
    q2 = (dcm[1][0] + dcm[0][1]) / s
    q3 = (dcm[2][0] + dcm[0][2]) / s
  } else if (dcm[1][1] > dcm[2][2]) {
    const s = 2.0 * Math.sqrt(1.0 + dcm[1][1] - dcm[0][0] - dcm[2][2])
    q0 = (dcm[2][0] - dcm[0][2]) / s
    q1 = (dcm[1][0] + dcm[0][1]) / s
    q2 = 0.25 * s
    q3 = (dcm[2][1] + dcm[1][2]) / s
  } else {
    const s = 2.0 * Math.sqrt(1.0 + dcm[2][2] - dcm[0][0] - dcm[1][1])
    q0 = (dcm[0][1] - dcm[1][0]) / s
    q1 = (dcm[2][0] + dcm[0][2]) / s
    q2 = (dcm[2][1] + dcm[1][2]) / s
    q3 = 0.25 * s
  }

  // Prefer q0 ≥ 0 for continuity
  if (q0 < 0) {
    q0 = -q0
    q1 = -q1
    q2 = -q2
    q3 = -q3
  }
  return [q0, q1, q2, q3]
}

/** Quaternion → DCM body→inertial (matches plant quat_to_dcm). */
export function quatToDcm(q: [number, number, number, number]): Mat3 {
  const [q0, q1, q2, q3] = q
  const q0_sq = q0 * q0
  const q1_sq = q1 * q1
  const q2_sq = q2 * q2
  const q3_sq = q3 * q3
  return [
    [
      q0_sq + q1_sq - q2_sq - q3_sq,
      2.0 * (q1 * q2 + q0 * q3),
      2.0 * (q1 * q3 - q0 * q2)
    ],
    [
      2.0 * (q1 * q2 - q0 * q3),
      q0_sq - q1_sq + q2_sq - q3_sq,
      2.0 * (q2 * q3 + q0 * q1)
    ],
    [
      2.0 * (q1 * q3 + q0 * q2),
      2.0 * (q2 * q3 - q0 * q1),
      q0_sq - q1_sq - q2_sq + q3_sq
    ]
  ]
}

export function quatToColumn(q: [number, number, number, number]): QuatCol {
  return [[q[0]], [q[1]], [q[2]], [q[3]]]
}

/**
 * Build pad ICs for ECI 6DoF plant from S pad + MES.
 * @param mes Optional MES result; default Apollo 7 LaunchDate stack epoch.
 */
export function buildAs205PadStateEci(opts?: {
  mes?: MesResult
  launchDate?: LaunchDate
  Theta_E_deg?: number
  padS?: InitialPositionS
  /**
   * If true, match RTW IC wiring: q = dcmToQuat(LIO) and reconstruct
   * v_E via Transpose(quat_to_dcm(q))·v_b. Default false = legacy LIOᵀ.
   */
  mdlWireAsIs?: boolean
}): PadStateEci {
  const padS = opts?.padS ?? as205SimulinkPadStateS()
  let mes: MesResult
  if (opts?.mes) {
    mes = opts.mes
  } else if (opts?.Theta_E_deg !== undefined) {
    mes = as205Mes(opts.Theta_E_deg)
  } else if (opts?.launchDate) {
    mes = as205MesFromLaunchDate(opts.launchDate)
  } else {
    mes = as205DefaultMes()
  }

  // RTW `<S5>/Position 1 Azimuth` = 100° → LVInert LIO (E→body), not MES Az=A_z.
  const lio = computeMes(
    AS205_PAD.pad_roll_L_deg,
    AS205_PAD.phi_L_deg,
    mes.Theta_E_deg
  )
  const LIO = lio.MES // same Fcn chain as MES; Az = pad_roll
  const C_bE = mat3Transpose(LIO)
  /**
   * Attitude IC convention (see DCM_QUAT_EOM_AUDIT.md):
   * - legacy / default: dcmToQuat(LIOᵀ)=dcmToQuat(C_bE); Ve = C_bE·Vb
   * - mdlWireAsIs: dcmToQuat(LIO) as RTW DCM2Quat; Ve = Transpose(ASB(q))·Vb
   */
  const mdlWire = opts?.mdlWireAsIs === true
  const qRaw = mdlWire ? dcmToQuat(LIO) : dcmToQuat(C_bE)
  // RTW does not force q0≥0; for mdlWire keep raw sign. Legacy path keeps dcmToQuat flip.
  const q = qRaw
  const { r_E, v_E } = padStateSToEci(padS.R_S_0_m, padS.V_S_0_m, mes.MES)
  // v_b = C_Eb · v_E = LIO · v_E  (body = Position I, not S)
  const v0_b = mat3MulVec(LIO, v_E)

  const C_from_q = quatToDcm(q)
  // Legacy check: C_bE·vb ≈ v_E. MDL-wire: Transpose(C_from_q)·vb ≈ v_E.
  const v_check = mdlWire
    ? mat3MulVec(mat3Transpose(C_from_q), v0_b)
    : mat3MulVec(C_bE, v0_b)
  const notes = [
    mdlWire
      ? 'ECI pad (MDL wire-as-is): q0=dcmToQuat(LIO); Ve↔Transpose(ASB(q))·Vb'
      : 'ECI plant pad: r_E = MESᵀ R_S; q0=dcmToQuat(LIOᵀ); Ve=C_bE·Vb (legacy)',
    `Θ_E=${mes.Theta_E_deg.toFixed(6)}°, |r_E|=${Math.hypot(...r_E).toFixed(3)} m`,
    `|v_E|=${Math.hypot(...v_E).toFixed(3)} m/s, |v_b0|=${Math.hypot(...v0_b).toFixed(3)} m/s`,
    `pad_roll=${AS205_PAD.pad_roll_L_deg}°, A_z=${AS205_PAD.A_z_deg}° (Δ=${(AS205_PAD.pad_roll_L_deg - AS205_PAD.A_z_deg).toFixed(2)}°)`,
    `‖MES‖ ortho err=${mat3OrthonormalityError(mes.MES).toExponential(2)}`,
    `‖LIO‖ ortho err=${mat3OrthonormalityError(LIO).toExponential(2)}`,
    ...mes.notes,
    ...padS.notes
  ]
  const dv = Math.hypot(
    v_check[0] - v_E[0],
    v_check[1] - v_E[1],
    v_check[2] - v_E[2]
  )
  if (dv > 1e-6) {
    notes.push(`WARNING: Ve reconstruct residual ${dv} m/s`)
  }

  return {
    r0_E: r_E,
    v0_b,
    v0_E: v_E,
    q0_bE: quatToColumn(q),
    C_bE,
    MES: mes.MES,
    LIO,
    Theta_E_deg: mes.Theta_E_deg,
    padS,
    notes
  }
}

/** Default AS-205 LC-34 ECI pad for 9.4+ plants (legacy LIOᵀ quat). */
export function as205DefaultPadStateEci(): PadStateEci {
  return buildAs205PadStateEci()
}

/** MDL wire-as-is IC: DCM2Quat(LIO); use with Ve = Transpose(quat_to_dcm(q))·Vb. */
export function as205MdlWirePadStateEci(): PadStateEci {
  return buildAs205PadStateEci({ mdlWireAsIs: true })
}

/** Flatten Mat3 to nested array for Source block double[3][3]. */
export function mat3ToSourceValue(m: Mat3): number[][] {
  return [
    [m[0][0], m[0][1], m[0][2]],
    [m[1][0], m[1][1], m[1][2]],
    [m[2][0], m[2][1], m[2][2]]
  ]
}

/**
 * Elevation from horizontal (rad) of body +X in S-frame.
 * C_bS = MES · C_bE (body→S); elev = asin((C_bS e1) · X_S) = asin(C_bS[0][0]).
 * Vertical B‖S → π/2; tips downrange toward Z_S → decreases (plant elev convention).
 */
export function elevRadFromCbS(C_bS: Mat3): number {
  const up = Math.max(-1, Math.min(1, C_bS[0][0]))
  return Math.asin(up)
}

/** elev from MES and body→E DCM (same as plant chain). */
export function elevRadFromMesAndCbE(MES: Mat3, C_bE: Mat3): number {
  const C_bS = mat3Mul(MES, C_bE)
  return elevRadFromCbS(C_bS)
}

// Re-export common transforms for plant wiring docs
export { eciToS, sToEci, mat3MulVec }

/**
 * EDD / Simulink [MES]: direction cosine matrix E → S.
 *
 * Ported from `saturn_ib_stack.mdl` subsystem
 *   "E-Frame to s-Frame (MES matrix)"  (Eqn 2.3.10)
 * Mask: "DCM transforming the E-frame to the S-Frame"
 *   ⇒  v_S = MES · v_E ,   v_E = MESᵀ · v_S
 *
 * Mux / SinCos annotation (1-based u as in Simulink Fcn):
 *   u1 = sin A_z,  u2 = sin φ_L,  u3 = sin Θ_E
 *   u4 = cos A_z,  u5 = cos φ_L,  u6 = cos Θ_E
 *
 * Elements (row-major 3×3; mdl reshape is column-major of the same set):
 *   M11 = cφ cΘ          M12 = cφ sΘ          M13 = sφ
 *   M21 = sφ sAz cΘ − cAz sΘ
 *   M22 = sφ sAz sΘ + cAz cΘ
 *   M23 = −cφ sAz
 *   M31 = −sφ cAz cΘ − sAz sΘ
 *   M32 = −sφ cAz sΘ + sAz cΘ
 *   M33 = cφ cAz
 *
 * Θ_E (deg) = λ_L + θ_GMST  (MES Transform outer Sum2)
 * After T_GRR, MES is constant (epoch freezes Θ_E and thus S in E).
 *
 * EDD §2.3.10: MES = MSGᵀ · MEG (via G). Element formulas match Simulink.
 * φ_L is **geodetic** (AS205_presettings / mdl Constant8).
 */

import { AS205_PAD, type Vec3 } from './as205PadFrames'

/** 3×3 matrix, row-major storage: m[row][col] */
export type Mat3 = [[number, number, number], [number, number, number], [number, number, number]]

/** Launch date as Simulink root inport: [YYYY, mm, dd, hh, mm, ss.s] */
export type LaunchDate = [number, number, number, number, number, number]

/** J2000.0 epoch (TT ≈ UT1 for this stack), JD. */
export const JD_J2000 = 2451545.0

export interface MesResult {
  /** DCM E → S: v_S = MES · v_E */
  MES: Mat3
  /** Azimuth used (rad) */
  A_z_rad: number
  /** Geodetic latitude used (rad) */
  phi_L_rad: number
  /** Θ_E used (rad) */
  Theta_E_rad: number
  /** Θ_E (deg), unwrapped input */
  Theta_E_deg: number
  notes: string[]
}

function deg2rad(d: number): number {
  return (d * Math.PI) / 180
}

function rad2deg(r: number): number {
  return (r * 180) / Math.PI
}

/** Wrap angle to [0, 360) degrees. */
export function wrapDeg360(deg: number): number {
  let x = deg % 360
  if (x < 0) x += 360
  return x
}

/**
 * Julian Date from calendar date (Meeus / Vallado), matching mdl
 * subsystem "Date to JD" (YYYY,mm,dd,hh,mm,ss.s).
 *
 * Month ≤ 2 ⇒ year−1, month+12 (standard algorithm).
 */
export function dateToJulianDate(date: LaunchDate): number {
  let Y = date[0]
  let M = date[1]
  const D = date[2]
  const hh = date[3]
  const mm = date[4]
  const ss = date[5]

  // Compare month ≤ 2 → year = year−1, month = month+12
  if (M <= 2) {
    Y = Y - 1
    M = M + 12
  }

  // B = 2 − floor(Y/100) + floor(floor(Y/100)/4)
  const B = 2.0 - Math.floor(Y / 100.0) + Math.floor(Math.floor(Y / 100.0) / 4.0)
  // C = day fraction
  const C = (((ss / 60.0 + mm) / 60.0 + hh) / 24.0)
  // C1 = floor(365.25*(Y+4716)) + floor(30.6001*(M+1)) + D
  const C1 =
    Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + D

  // JD = (B − 1524.5) + C + C1
  return B - 1524.5 + C + C1
}

/**
 * GMST (deg) from Julian Date — mdl "T to GMST":
 *   T = (JD − 2451545) / 36525
 *   sec = 67310.54841 + (876600·3600 + 8640184.81266)·T + 0.093104·T² − 6.2e−6·T³
 *   θ = mod(sec, 86400) / 240   (seconds of time → degrees)
 */
export function gmstDegFromJulianDate(jd: number): number {
  const T = (jd - JD_J2000) / 36525
  const sec =
    67310.54841 +
    (876600 * 3600 + 8640184.81266) * T +
    0.093104 * T * T -
    6.2e-6 * T * T * T
  // mod to one sidereal-day seconds (86400 in stack; civil day length used as in mdl)
  let s = sec % 86400
  if (s < 0) s += 86400
  return s / 240.0
}

/**
 * Θ_E (deg) = λ_L + θ_GMST  (MES Transform Sum2).
 * λ_L east-positive (AS-205: −80.56°).
 */
export function thetaEDegFromGmst(
  gmstDeg: number,
  lambda_L_deg: number = AS205_PAD.lambda_L_deg
): number {
  return gmstDeg + lambda_L_deg
}

/** Θ_E from LaunchDate [Y,M,D,h,m,s] and site longitude. */
export function thetaEDegFromLaunchDate(
  date: LaunchDate,
  lambda_L_deg: number = AS205_PAD.lambda_L_deg
): number {
  const jd = dateToJulianDate(date)
  const gmst = gmstDegFromJulianDate(jd)
  return thetaEDegFromGmst(gmst, lambda_L_deg)
}

/**
 * Build [MES] from azimuth, geodetic latitude, and Θ_E (all degrees).
 * Exact Simulink Fcn chain (Eqn 2.3.10).
 */
export function computeMes(
  A_z_deg: number,
  phi_L_deg: number,
  Theta_E_deg: number
): MesResult {
  const az = deg2rad(A_z_deg)
  const phi = deg2rad(phi_L_deg)
  const th = deg2rad(Theta_E_deg)

  const sAz = Math.sin(az)
  const cAz = Math.cos(az)
  const sPhi = Math.sin(phi)
  const cPhi = Math.cos(phi)
  const sTh = Math.sin(th)
  const cTh = Math.cos(th)

  // u1..u6 as annotated in mdl
  // Mij from Fcn blocks named 11..33
  const MES: Mat3 = [
    [cPhi * cTh, cPhi * sTh, sPhi],
    [sPhi * sAz * cTh - cAz * sTh, sPhi * sAz * sTh + cAz * cTh, -cPhi * sAz],
    [-sPhi * cAz * cTh - sAz * sTh, -sPhi * cAz * sTh + sAz * cTh, cPhi * cAz]
  ]

  return {
    MES,
    A_z_rad: az,
    phi_L_rad: phi,
    Theta_E_rad: th,
    Theta_E_deg,
    notes: [
      'Port of saturn_ib_stack E-Frame to s-Frame (MES matrix) Eqn 2.3.10',
      `A_z=${A_z_deg}°, φ_L=${phi_L_deg}° (geodetic), Θ_E=${Theta_E_deg}°`,
      'v_S = MES · v_E; constant after T_GRR for fixed epoch'
    ]
  }
}

/** AS-205 LC-34 MES from explicit Θ_E (deg). */
export function as205Mes(Theta_E_deg: number): MesResult {
  return computeMes(AS205_PAD.A_z_deg, AS205_PAD.phi_L_deg, Theta_E_deg)
}

/** AS-205 MES from LaunchDate (Simulink 6-vector). */
export function as205MesFromLaunchDate(date: LaunchDate): MesResult {
  const thetaE = thetaEDegFromLaunchDate(date, AS205_PAD.lambda_L_deg)
  const r = as205Mes(thetaE)
  r.notes.push(
    `LaunchDate=[${date.join(',')}] → Θ_E=${thetaE.toFixed(6)}° (λ_L+GMST)`
  )
  return r
}

/**
 * Default LaunchDate for MES / Θ_E — matches RTW / batch-sim stack practice.
 *
 * RTW `SaturnIBStack` / `SaturnStartupHelper` / `AS-205-reference.json` use
 * **1968-10-11 14:57:45** (not 15:02:45). Comments in the C++ host show
 * 15:02:45 (approx Apollo 7 liftoff) was tried and replaced with 14:57:45
 * (GRR / stack epoch −5 min). Obliq must bake the **same** epoch or MES / Xe_0
 * / q0 disagree with RTW before liftoff.
 *
 * TN-AP-67-158 remains the residual trajectory target; epoch only freezes S in E.
 */
export const AS205_DEFAULT_LAUNCH_DATE: LaunchDate = [
  1968, 10, 11, 14, 57, 45
]

/** AS-205 MES at default launch epoch (for offline transforms / future ECI plant). */
export function as205DefaultMes(): MesResult {
  return as205MesFromLaunchDate(AS205_DEFAULT_LAUNCH_DATE)
}

// ── Linear algebra helpers ──────────────────────────────────────────

export function mat3Identity(): Mat3 {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ]
}

export function mat3Transpose(m: Mat3): Mat3 {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]]
  ]
}

/** y = M · x */
export function mat3MulVec(m: Mat3, x: Vec3): Vec3 {
  return [
    m[0][0] * x[0] + m[0][1] * x[1] + m[0][2] * x[2],
    m[1][0] * x[0] + m[1][1] * x[1] + m[1][2] * x[2],
    m[2][0] * x[0] + m[2][1] * x[1] + m[2][2] * x[2]
  ]
}

/** C = A · B */
export function mat3Mul(a: Mat3, b: Mat3): Mat3 {
  const c: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      c[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]
    }
  }
  return c
}

export function mat3Det(m: Mat3): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  )
}

/** Frobenius residual ‖M Mᵀ − I‖_F */
export function mat3OrthonormalityError(m: Mat3): number {
  const p = mat3Mul(m, mat3Transpose(m))
  let s = 0
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const target = i === j ? 1 : 0
      const d = p[i][j] - target
      s += d * d
    }
  }
  return Math.sqrt(s)
}

/** v_S = MES · v_E */
export function eciToS(mes: Mat3, v_E: Vec3): Vec3 {
  return mat3MulVec(mes, v_E)
}

/** v_E = MESᵀ · v_S */
export function sToEci(mes: Mat3, v_S: Vec3): Vec3 {
  return mat3MulVec(mat3Transpose(mes), v_S)
}

/**
 * Map pad S-frame state through MESᵀ into E (ECI).
 * Use when 6DoF runs in E and S outputs are recovered with MES.
 */
export function padStateSToEci(
  R_S: Vec3,
  V_S: Vec3,
  mes: Mat3
): { r_E: Vec3; v_E: Vec3 } {
  return {
    r_E: sToEci(mes, R_S),
    v_E: sToEci(mes, V_S)
  }
}

/** Diagnostic: degrees from rad (export for tests/docs). */
export { deg2rad, rad2deg }

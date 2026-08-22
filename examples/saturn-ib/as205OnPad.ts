/**
 * Closed-form On Pad (<S8>) state at time t — Path B IC with live GMST.
 *
 * Matches RTW: nested <S74> LLA→ECF→ECI at θ_GMST(t)=θ_GMST₀+ω_E·t,
 * OUT22 Ve = ω×Xe, LLA from ECI→LLA (<S72>).
 *
 * See ON_PAD_MATCHED_COMPARE.md
 */

import {
  AS205_DEFAULT_LAUNCH_DATE,
  computeMes,
  dateToJulianDate,
  gmstDegFromJulianDate,
  mat3MulVec,
  mat3Transpose,
  type LaunchDate,
  type Mat3
} from './as205Mes'
import { dcmToQuat } from './as205EciPlant'
import { AS205_PAD, OMEGA_EARTH, type Vec3 } from './as205PadFrames'

/** RTW <S72> / LLA semi-major (m) — slightly ≠ WGS-84 6378137 */
const RTW_A = 6378136.3
/** WGS-84 f-derived e² used in S5/S74 LLA→ECF path */
const WGS84_A = 6378137.0
const WGS84_E2 = 6.6943800042608068e-3
const WGS84_ONE_MINUS_E2 = 1 - WGS84_E2

export const AS205_ONPAD_DEFAULT_H_M = 34.7

function deg2rad(d: number): number {
  return (d * Math.PI) / 180
}

function rad2deg(r: number): number {
  return (r * 180) / Math.PI
}

function mat3FromColMajor9(a: number[]): Mat3 {
  return [
    [a[0]!, a[3]!, a[6]!],
    [a[1]!, a[4]!, a[7]!],
    [a[2]!, a[5]!, a[8]!]
  ]
}

/** ECEF→ECI DCM for Euler (0,0,−θ_GMST) — same as ic-dual-path-compare. */
export function ecefToEciDcmNegGmst(thetaGmstDeg: number): Mat3 {
  const th = deg2rad(-thetaGmstDeg)
  const s0 = 0
  const s1 = 0
  const s2 = Math.sin(th)
  const c0 = 1
  const c1 = 1
  const c2 = Math.cos(th)
  const flat = [
    c2 * c1,
    c2 * s1 * s0 - s2 * c0,
    c0 * s1 * c2 + s2 * s0,
    s2 * c1,
    s2 * s1 * s0 + c2 * c0,
    s2 * s1 * c0 - c2 * s0,
    -s1,
    c1 * s0,
    c1 * c0
  ]
  return mat3FromColMajor9(flat)
}

export function llaToEcefWgs84(
  latDeg: number,
  lonDeg: number,
  h_m: number
): Vec3 {
  const lat = deg2rad(latDeg)
  const lon = deg2rad(lonDeg)
  const s = Math.sin(lat)
  const c = Math.cos(lat)
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * s * s)
  return [
    (N + h_m) * c * Math.cos(lon),
    (N + h_m) * c * Math.sin(lon),
    (WGS84_ONE_MINUS_E2 * N + h_m) * s
  ]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
}

function wrapPi(a: number): number {
  let x = a
  while (x <= -Math.PI) x += 2 * Math.PI
  while (x > Math.PI) x -= 2 * Math.PI
  return x
}

/**
 * ECI → geodetic LLA using RTW On Pad lon = atan2(y,x)−GMST and
 * Bowring-ish lat/h on ECEF after +GMST rotation (inverse of Path B DCM).
 */
export function eciToLlaOnPad(
  Xe: Vec3,
  thetaGmstDeg: number
): { lat_deg: number; lon_deg: number; h_m: number } {
  // ECEF ≈ RotZ(+GMST) · Xe_ECI when Xe = RotZ(−GMST)·r_ecef
  const th = deg2rad(thetaGmstDeg)
  const c = Math.cos(th)
  const s = Math.sin(th)
  const x = c * Xe[0] - s * Xe[1]
  const y = s * Xe[0] + c * Xe[1]
  const z = Xe[2]

  let lon = Math.atan2(Xe[1], Xe[0]) - deg2rad(thetaGmstDeg)
  lon = wrapPi(lon)

  // Standard ECEF→geodetic (WGS-84 a/e²; h matches RTW ~0.7 m bias vs 34.7)
  const a = RTW_A
  const e2 = WGS84_E2
  const lonDeg = rad2deg(lon)
  const p = Math.hypot(x, y)
  let lat = Math.atan2(z, p * (1 - e2))
  for (let i = 0; i < 8; i++) {
    const sLat = Math.sin(lat)
    const N = a / Math.sqrt(1 - e2 * sLat * sLat)
    const h = p / Math.cos(lat) - N
    const latNew = Math.atan2(z, p * (1 - (e2 * N) / (N + h)))
    if (Math.abs(latNew - lat) < 1e-14) {
      lat = latNew
      break
    }
    lat = latNew
  }
  const sLat = Math.sin(lat)
  const N = a / Math.sqrt(1 - e2 * sLat * sLat)
  const h = p / Math.cos(lat) - N
  return { lat_deg: rad2deg(lat), lon_deg: lonDeg, h_m: h }
}

export interface As205OnPadState {
  t_sec: number
  theta_GMST_deg: number
  theta_E_deg: number
  Xe_m: Vec3
  Ve_mps: Vec3
  Vb_mps: Vec3
  q_ECI: [number, number, number, number]
  LIO: Mat3
  lat_deg: number
  lon_deg: number
  h_m: number
  notes: string[]
}

export function as205OnPadStateAtTime(
  t_sec: number,
  opts?: {
    launchDate?: LaunchDate
    lat_deg?: number
    lon_deg?: number
    h_m?: number
    pad_roll_deg?: number
  }
): As205OnPadState {
  const date = opts?.launchDate ?? AS205_DEFAULT_LAUNCH_DATE
  const lat = opts?.lat_deg ?? AS205_PAD.phi_L_deg
  const lon = opts?.lon_deg ?? AS205_PAD.lambda_L_deg
  const h = opts?.h_m ?? AS205_ONPAD_DEFAULT_H_M
  const roll = opts?.pad_roll_deg ?? AS205_PAD.pad_roll_L_deg

  const jd = dateToJulianDate(date)
  const gmst0 = gmstDegFromJulianDate(jd)
  const gmst = gmst0 + rad2deg(OMEGA_EARTH * t_sec)
  const thetaE = gmst + lon

  const r_ecef = llaToEcefWgs84(lat, lon, h)
  const C = ecefToEciDcmNegGmst(gmst)
  const Xe = mat3MulVec(C, r_ecef)
  const omega: Vec3 = [0, 0, OMEGA_EARTH]
  const Ve = cross(omega, Xe)
  const lio = computeMes(roll, lat, thetaE).MES
  const Vb = mat3MulVec(lio, Ve)
  const q = dcmToQuat(mat3Transpose(lio))
  const lla = eciToLlaOnPad(Xe, gmst)

  return {
    t_sec,
    theta_GMST_deg: gmst,
    theta_E_deg: thetaE,
    Xe_m: Xe,
    Ve_mps: Ve,
    Vb_mps: Vb,
    q_ECI: [q[0], q[1], q[2], q[3]],
    LIO: lio,
    lat_deg: lla.lat_deg,
    lon_deg: lla.lon_deg,
    h_m: lla.h_m,
    notes: [
      'Path B LLA→WGS84→ECI at live GMST (On Pad nested IC)',
      'Ve = ω_E × Xe; Vb = LIO(Az=pad_roll)·Ve',
      'LLA from ECI with lon=atan2(y,x)−GMST (RTW <S72> style)'
    ]
  }
}

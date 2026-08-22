/**
 * IC dual-path numeric compare (no translator choice yet).
 *
 * Path A — Eqns 3.4: R_S, V_S → r_E = MESᵀ·R_S, v_E = MESᵀ·V_S
 *           v_b = LIO·v_E, q = dcmToQuat(LIOᵀ)   (current as205EciPlant)
 *
 * Path B — RTW S5 live: LLA→WGS-84 ECF → C_ecef→ECI(−θ_GMST) → Xe_0
 *           V_ECI = ω_E × Xe_0, Vb_0 = LIO · V_ECI
 *
 * Writes /tmp/ic-matched/ic-dual-path.json and prints a table.
 */
import * as fs from 'fs'
import {
  AS205_DEFAULT_LAUNCH_DATE,
  computeMes,
  dateToJulianDate,
  gmstDegFromJulianDate,
  mat3MulVec,
  mat3Transpose,
  type Mat3
} from '../examples/saturn-ib/as205Mes'
import {
  as205DefaultPadStateEci,
  dcmToQuat
} from '../examples/saturn-ib/as205EciPlant'
import { as205SimulinkPadStateS } from '../examples/saturn-ib/as205InitialPosition'
import { AS205_PAD, type Vec3 } from '../examples/saturn-ib/as205PadFrames'

const WGS84_A = 6378137.0
const WGS84_E2 = 6.6943800042608068e-3
const WGS84_ONE_MINUS_E2 = 1 - WGS84_E2 // RTW Divide1 ≈ this
const OMEGA_E = 7.292115e-5

const CG_LLA = {
  lat_deg: AS205_PAD.phi_L_deg,
  lon_deg: AS205_PAD.lambda_L_deg,
  h_m: 34.7
}

function deg2rad(d: number): number {
  return (d * Math.PI) / 180
}

function hypot3(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2])
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/** Column-major 9 → row-major Mat3 (RTW LVInert / reshape order). */
function mat3FromColMajor9(a: number[]): Mat3 {
  return [
    [a[0]!, a[3]!, a[6]!],
    [a[1]!, a[4]!, a[7]!],
    [a[2]!, a[5]!, a[8]!]
  ]
}

/**
 * Euler angles (0, 0, −θ_GMST_rad) → DCM as in RTW S33 Fcn chain
 * (column-major flat then mat-mult). Matches Saturn_IB_Stack.c buffer 1080.
 */
function ecefToEciDcmNegGmst(thetaGmstDeg: number): Mat3 {
  const th = deg2rad(-thetaGmstDeg)
  const s0 = 0,
    s1 = 0,
    s2 = Math.sin(th)
  const c0 = 1,
    c1 = 1,
    c2 = Math.cos(th)
  // Flat column-major as RTW builds, then interpret as Mat3 for v = M·r
  // RTW order: [0]=c2*c1, [1]=c2*s1*s0 - s2*c0, ... then rt_MatMultRR
  // Using same element formulas as C (row-wise assignment into col-major slots):
  const flat = [
    c2 * c1, // 0
    c2 * s1 * s0 - s2 * c0, // 1
    c0 * s1 * c2 + s2 * s0, // 2
    s2 * c1, // 3
    s2 * s1 * s0 + c2 * c0, // 4
    s2 * s1 * c0 - c2 * s0, // 5
    -s1, // 6
    c1 * s0, // 7
    c1 * c0 // 8
  ]
  // rt_MatMultRR_Dbl with dims {3,3,1}: treats first arg as 3×3 column-major
  return mat3FromColMajor9(flat)
}

/** WGS-84 LLA → ECEF (RTW LLA to ECF). */
function llaToEcefWgs84(
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

function main(): void {
  const date = AS205_DEFAULT_LAUNCH_DATE
  const jd = dateToJulianDate(date)
  const gmstDeg = gmstDegFromJulianDate(jd)
  const thetaE_deg = gmstDeg + AS205_PAD.lambda_L_deg // = RTW S5 Sum at t=0

  // —— Path A: Eqns 3.4 + MESᵀ ——
  const padA = as205DefaultPadStateEci()
  const padS = as205SimulinkPadStateS()

  // —— Path B: RTW LLA / ω×r ——
  const r_ecef = llaToEcefWgs84(CG_LLA.lat_deg, CG_LLA.lon_deg, CG_LLA.h_m)
  const C_ecef_eci = ecefToEciDcmNegGmst(gmstDeg)
  const Xe_0 = mat3MulVec(C_ecef_eci, r_ecef)
  const omega: Vec3 = [0, 0, OMEGA_E]
  const V_ECI = cross(omega, Xe_0)
  // LIO = computeMes(100, φ, Θ_E) with Θ_E = GMST+lon (same as RTW Sum)
  const lio = computeMes(100.0, AS205_PAD.phi_L_deg, thetaE_deg)
  // RTW Product1: mat-mult LIO (col-major from LVInert fields) · V_ECI
  // Our computeMes is row-major MES formula — same as LVInert Fcn chain
  const Vb_0 = mat3MulVec(lio.MES, V_ECI)
  const qB = dcmToQuat(mat3Transpose(lio.MES))

  const dXe = sub3(padA.r0_E, Xe_0)
  const dVb = sub3(padA.v0_b, Vb_0)
  const dVe = sub3(padA.v0_E, V_ECI)
  const qA = [
    padA.q0_bE[0][0],
    padA.q0_bE[1][0],
    padA.q0_bE[2][0],
    padA.q0_bE[3][0]
  ]
  const dqPlus = Math.hypot(
    qA[0]! - qB[0],
    qA[1]! - qB[1],
    qA[2]! - qB[2],
    qA[3]! - qB[3]
  )
  const dqMinus = Math.hypot(
    qA[0]! + qB[0],
    qA[1]! + qB[1],
    qA[2]! + qB[2],
    qA[3]! + qB[3]
  )

  const report = {
    launchDate: date,
    jd,
    gmst_deg: gmstDeg,
    thetaE_deg_S5_Sum: thetaE_deg,
    CG_LLA,
    pathA_eqns34: {
      R_S: padS.R_S_0_m,
      V_S: padS.V_S_0_m,
      Xe_0: padA.r0_E,
      V_ECI: padA.v0_E,
      Vb_0: padA.v0_b,
      q_ECI_0: qA,
      Xe_mag: hypot3(padA.r0_E),
      Vb_mag: hypot3(padA.v0_b)
    },
    pathB_rtw_lla: {
      r_ecef,
      Xe_0,
      V_ECI,
      Vb_0,
      q_ECI_0: qB,
      Xe_mag: hypot3(Xe_0),
      Vb_mag: hypot3(Vb_0),
      r_ecef_mag: hypot3(r_ecef)
    },
    delta_A_minus_B: {
      dXe_m: dXe,
      dXe_mag_m: hypot3(dXe),
      dV_ECI_mps: dVe,
      dV_ECI_mag: hypot3(dVe),
      dVb_mps: dVb,
      dVb_mag: hypot3(dVb),
      dq_min: Math.min(dqPlus, dqMinus)
    },
    notes: [
      'Path A = as205DefaultPadStateEci (Eqns 3.4 + MESᵀ + LIO Az=100)',
      'Path B = RTW S5 LLA→WGS84 ECF → DCM(−GMST) → ω×r → LIO·V',
      'No preferred path chosen — report only (user gate-both)',
      'Live RTW dump still optional to validate Path B constants (Divide1, DCM layout)'
    ]
  }

  fs.mkdirSync('/tmp/ic-matched', { recursive: true })
  const outPath = '/tmp/ic-matched/ic-dual-path.json'
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2))

  console.log('LaunchDate', date.join('-'))
  console.log(
    'GMST_deg',
    gmstDeg.toFixed(6),
    'Θ_E (S5 Sum)',
    thetaE_deg.toFixed(6)
  )
  console.log('\n|Xe| A', report.pathA_eqns34.Xe_mag.toFixed(3), 'B', report.pathB_rtw_lla.Xe_mag.toFixed(3))
  console.log('|Vb| A', report.pathA_eqns34.Vb_mag.toFixed(6), 'B', report.pathB_rtw_lla.Vb_mag.toFixed(6))
  console.log('\nDelta A-B:')
  console.log('  |dXe|_m   ', report.delta_A_minus_B.dXe_mag_m.toExponential(4))
  console.log('  |dV_ECI|  ', report.delta_A_minus_B.dV_ECI_mag.toExponential(4))
  console.log('  |dVb|     ', report.delta_A_minus_B.dVb_mag.toExponential(4))
  console.log('  |dq|_min  ', report.delta_A_minus_B.dq_min.toExponential(4))
  console.log('  dXe       ', dXe.map(x => +x.toFixed(3)))
  console.log('\nWrote', outPath)
}

main()

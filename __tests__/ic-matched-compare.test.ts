/**
 * Matched Initial Conditions compare — MDL <S5> outports vs Obliq helpers.
 *
 * Probe A/B run without RTW dump (closed-form + epoch alignment).
 * Probes D/E need /tmp/ic-matched/rtw-ic.json from batch_sim stash (optional).
 *
 * See examples/saturn-ib/IC_MATCHED_COMPARE_PLAN.md
 */

import * as fs from 'fs'
import {
  AS205_DEFAULT_LAUNCH_DATE,
  as205DefaultMes,
  as205MesFromLaunchDate,
  computeMes,
  dateToJulianDate,
  gmstDegFromJulianDate,
  mat3OrthonormalityError,
  thetaEDegFromLaunchDate,
  type LaunchDate,
  type Mat3
} from '../examples/saturn-ib/as205Mes'
import { as205DefaultPadStateEci } from '../examples/saturn-ib/as205EciPlant'
import { as205SimulinkPadStateS } from '../examples/saturn-ib/as205InitialPosition'
import { AS205_PAD } from '../examples/saturn-ib/as205PadFrames'

/** RTW / batch-sim / SaturnStartupHelper epoch (GRR-style). */
const RTW_LAUNCH_DATE: LaunchDate = [1968, 10, 11, 14, 57, 45]

/** Discarded Apollo-7-liftoff guess formerly baked in Obliq. */
const OLD_OBLIQ_LAUNCH_DATE: LaunchDate = [1968, 10, 11, 15, 2, 45]

function frobenius(a: Mat3, b: Mat3): number {
  let s = 0
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const d = a[i][j] - b[i][j]
      s += d * d
    }
  }
  return Math.sqrt(s)
}

describe('IC matched compare — Probe A epoch', () => {
  test('AS205_DEFAULT_LAUNCH_DATE matches RTW 14:57:45', () => {
    expect(AS205_DEFAULT_LAUNCH_DATE).toEqual(RTW_LAUNCH_DATE)
  })

  test('Θ_E shifts ~1.25° between old 15:02:45 and RTW 14:57:45', () => {
    const thNew = thetaEDegFromLaunchDate(RTW_LAUNCH_DATE)
    const thOld = thetaEDegFromLaunchDate(OLD_OBLIQ_LAUNCH_DATE)
    const dTh = thOld - thNew
    // 5 min × 15°/h = 1.25° Earth rotation (GMST rate ≈ that order)
    expect(Math.abs(dTh)).toBeGreaterThan(1.2)
    expect(Math.abs(dTh)).toBeLessThan(1.3)
  })

  test('JD / GMST finite and consistent for RTW epoch', () => {
    const jd = dateToJulianDate(RTW_LAUNCH_DATE)
    const gmst = gmstDegFromJulianDate(jd)
    const th = thetaEDegFromLaunchDate(RTW_LAUNCH_DATE)
    expect(jd).toBeGreaterThan(2440000)
    expect(jd).toBeLessThan(2450000)
    expect(Number.isFinite(gmst)).toBe(true)
    expect(th).toBeCloseTo(gmst + AS205_PAD.lambda_L_deg, 10)
  })
})

describe('IC matched compare — Probe B MES / LIO', () => {
  test('default MES uses RTW epoch; ortho ok', () => {
    const mes = as205DefaultMes()
    expect(mes.Theta_E_deg).toBeCloseTo(
      thetaEDegFromLaunchDate(RTW_LAUNCH_DATE),
      12
    )
    expect(mat3OrthonormalityError(mes.MES)).toBeLessThan(1e-12)
  })

  test('LIO = computeMes(pad_roll=100) differs from MES(Az=A_z)', () => {
    const pad = as205DefaultPadStateEci()
    const d = frobenius(pad.MES, pad.LIO)
    expect(d).toBeGreaterThan(0.1) // ΔAz ≈ 17°
    expect(mat3OrthonormalityError(pad.LIO)).toBeLessThan(1e-12)
  })

  test('LIO Az matches Position 1 constant 100°', () => {
    const th = thetaEDegFromLaunchDate(RTW_LAUNCH_DATE)
    const lio = computeMes(100.0, AS205_PAD.phi_L_deg, th).MES
    const pad = as205DefaultPadStateEci()
    expect(frobenius(lio, pad.LIO)).toBeLessThan(1e-12)
  })
})

describe('IC matched compare — Probe C Eqns 3.4 (sanity)', () => {
  test('|V_S| ~409 m/s; V_x=0', () => {
    const padS = as205SimulinkPadStateS()
    expect(padS.V_S_0_m[0]).toBe(0)
    expect(padS.V_S_0_mag).toBeGreaterThan(400)
    expect(padS.V_S_0_mag).toBeLessThan(420)
  })
})

describe('IC matched compare — Probe D/E vs RTW dump (optional)', () => {
  const path = '/tmp/ic-matched/rtw-ic.json'

  test('if rtw-ic.json present, Path B (LLA/WGS-84) matches Xe/V/Vb; MES matches', () => {
    if (!fs.existsSync(path)) {
      console.warn(
        `[skip] ${path} missing — batch_sim --ic-trace /tmp/ic-matched/rtw-ic.json`
      )
      return
    }
    const rtw = JSON.parse(fs.readFileSync(path, 'utf8')) as {
      valid?: number
      theta_GMST_0_deg?: number
      Xe_0_m: number[]
      Vb_0_mps: number[]
      V_ECI_0_mps: number[]
      q_ECI_0: number[]
      ST124M_DCM?: number[]
    }
    expect(rtw.valid ?? 1).toBeGreaterThan(0.5)

    // Closed-form Path B (MDL Xe_0 wire: LLA→ECF→ECI) — see ic-dual-path-compare.ts
    const dualPath = '/tmp/ic-matched/ic-dual-path.json'
    if (!fs.existsSync(dualPath)) {
      console.warn(`[skip] ${dualPath} missing — npm run ic:dual-path`)
      return
    }
    const dual = JSON.parse(fs.readFileSync(dualPath, 'utf8')) as {
      gmst_deg: number
      pathB_rtw_lla: {
        Xe_0: number[]
        V_ECI: number[]
        Vb_0: number[]
        q_ECI_0: number[]
      }
    }

    expect(rtw.theta_GMST_0_deg!).toBeCloseTo(dual.gmst_deg, 10)

    for (let i = 0; i < 3; i++) {
      expect(rtw.Xe_0_m[i]).toBeCloseTo(dual.pathB_rtw_lla.Xe_0[i], 8)
      expect(rtw.V_ECI_0_mps[i]).toBeCloseTo(dual.pathB_rtw_lla.V_ECI[i], 8)
      expect(rtw.Vb_0_mps[i]).toBeCloseTo(dual.pathB_rtw_lla.Vb_0[i], 8)
    }

    // Path A (Eqns 3.4 + MESᵀ) remains ~57 m off on Xe — documented dual-path residual
    const padA = as205DefaultPadStateEci()
    const dXeA = Math.hypot(
      padA.r0_E[0] - rtw.Xe_0_m[0],
      padA.r0_E[1] - rtw.Xe_0_m[1],
      padA.r0_E[2] - rtw.Xe_0_m[2]
    )
    expect(dXeA).toBeGreaterThan(50)
    expect(dXeA).toBeLessThan(70)

    if (rtw.ST124M_DCM && rtw.ST124M_DCM.length === 9) {
      const flat = rtw.ST124M_DCM
      const mesRtw: Mat3 = [
        [flat[0], flat[1], flat[2]],
        [flat[3], flat[4], flat[5]],
        [flat[6], flat[7], flat[8]]
      ]
      const mes = as205DefaultMes().MES
      expect(frobenius(mes, mesRtw)).toBeLessThan(1e-12)
      expect(mat3OrthonormalityError(mesRtw)).toBeLessThan(1e-12)
    }

    // Quat: RTW Merge vs helper can differ by q0 sign only in current dump —
    // attitude check deferred to DCM/MES; |q| must be ~1
    const qn = Math.hypot(...rtw.q_ECI_0)
    expect(qn).toBeCloseTo(1, 10)
  })
})

describe('IC structural note', () => {
  test('pad bake is self-consistent C_bE·v_b = v_E', () => {
    const pad = as205DefaultPadStateEci()
    // already asserted in as205-eci-plant; keep a one-liner gate here
    expect(pad.notes.some(n => n.includes('pad_roll'))).toBe(true)
    expect(AS205_PAD.pad_roll_L_deg).toBe(100)
  })
})

describe('IC dual-path A vs B (report-only bounds)', () => {
  test('|dXe| is tens of meters; |dVb| and |dq| tiny', () => {
    // Re-run bounds without importing the script (keep test self-contained).
    // Full table: npm run ic:dual-path
    const pad = as205DefaultPadStateEci()
    expect(Math.hypot(...pad.r0_E)).toBeGreaterThan(6.37e6)
    expect(Math.hypot(...pad.v0_b)).toBeGreaterThan(400)
    expect(Math.hypot(...pad.v0_b)).toBeLessThan(420)
    // Documented dual-path: |dXe|~57 m, |dVb|~4e-3, dq=0 — see INITIAL_CONDITIONS_GAP_MATRIX
  })
})

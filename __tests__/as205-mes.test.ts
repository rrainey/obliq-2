/**
 * Simulink / EDD [MES] E→S DCM (Eqn 2.3.10)
 */

import {
  AS205_DEFAULT_LAUNCH_DATE,
  as205DefaultMes,
  as205Mes,
  as205MesFromLaunchDate,
  computeMes,
  dateToJulianDate,
  eciToS,
  gmstDegFromJulianDate,
  JD_J2000,
  mat3Det,
  mat3MulVec,
  mat3OrthonormalityError,
  mat3Transpose,
  padStateSToEci,
  sToEci,
  thetaEDegFromGmst,
  thetaEDegFromLaunchDate,
  wrapDeg360,
  type Mat3
} from '../examples/saturn-ib/as205Mes'
import { AS205_PAD } from '../examples/saturn-ib/as205PadFrames'
import { as205SimulinkPadStateS } from '../examples/saturn-ib/as205InitialPosition'

describe('as205Mes — Date→JD / GMST / Θ_E', () => {
  test('J2000 noon is JD 2451545.0', () => {
    const jd = dateToJulianDate([2000, 1, 1, 12, 0, 0])
    expect(jd).toBeCloseTo(JD_J2000, 9)
  })

  test('J2000 midnight is JD 2451544.5', () => {
    // Noon J2000 = 2451545.0 ⇒ 00:00 same civil day = 2451544.5
    const jd = dateToJulianDate([2000, 1, 1, 0, 0, 0])
    expect(jd).toBeCloseTo(2451544.5, 9)
  })

  test('January uses month-shift (Y−1, M+12)', () => {
    // 1999-12-31 12:00 and 2000-01-01 12:00 differ by 1 day
    const a = dateToJulianDate([1999, 12, 31, 12, 0, 0])
    const b = dateToJulianDate([2000, 1, 1, 12, 0, 0])
    expect(b - a).toBeCloseTo(1, 9)
  })

  test('GMST at J2000 T=0 is 67310.54841 s → 280.460618…°', () => {
    const g = gmstDegFromJulianDate(JD_J2000)
    expect(g).toBeCloseTo(67310.54841 / 240, 9)
    expect(g).toBeCloseTo(280.460618375, 8)
  })

  test('Θ_E = λ_L + GMST (AS-205 longitude)', () => {
    const gmst = 280.460618375
    const th = thetaEDegFromGmst(gmst, AS205_PAD.lambda_L_deg)
    expect(th).toBeCloseTo(gmst + AS205_PAD.lambda_L_deg, 12)
  })

  test('default Apollo-7-class launch date yields finite Θ_E', () => {
    const th = thetaEDegFromLaunchDate(AS205_DEFAULT_LAUNCH_DATE)
    expect(Number.isFinite(th)).toBe(true)
    // LC-34 west + GMST: not constrained tightly; just sanity range
    expect(Math.abs(th)).toBeLessThan(720)
  })
})

describe('as205Mes — Eqn 2.3.10 Fcn elements', () => {
  test('matches closed-form Fcn expressions', () => {
    const Az = 82.82
    const phi = 28.521963
    const Th = 123.456
    const m = computeMes(Az, phi, Th).MES
    const sAz = Math.sin((Az * Math.PI) / 180)
    const cAz = Math.cos((Az * Math.PI) / 180)
    const sPhi = Math.sin((phi * Math.PI) / 180)
    const cPhi = Math.cos((phi * Math.PI) / 180)
    const sTh = Math.sin((Th * Math.PI) / 180)
    const cTh = Math.cos((Th * Math.PI) / 180)

    // u1=sAz u2=sPhi u3=sTh u4=cAz u5=cPhi u6=cTh
    expect(m[0][0]).toBeCloseTo(cPhi * cTh, 12) // 11: u5*u6
    expect(m[0][1]).toBeCloseTo(cPhi * sTh, 12) // 12: u5*u3
    expect(m[0][2]).toBeCloseTo(sPhi, 12) // 13: u2
    expect(m[1][0]).toBeCloseTo(sPhi * sAz * cTh - cAz * sTh, 12) // 21
    expect(m[1][1]).toBeCloseTo(sPhi * sAz * sTh + cAz * cTh, 12) // 22
    expect(m[1][2]).toBeCloseTo(-cPhi * sAz, 12) // 23
    expect(m[2][0]).toBeCloseTo(-sPhi * cAz * cTh - sAz * sTh, 12) // 31
    expect(m[2][1]).toBeCloseTo(-sPhi * cAz * sTh + sAz * cTh, 12) // 32
    expect(m[2][2]).toBeCloseTo(cPhi * cAz, 12) // 33
  })

  test('orthonormal det≈+1 for varied Θ_E', () => {
    for (const th of [0, 45, 90, 180, -80.56, 199.9]) {
      const { MES } = as205Mes(th)
      expect(mat3OrthonormalityError(MES)).toBeLessThan(1e-12)
      expect(mat3Det(MES)).toBeCloseTo(1, 10)
    }
  })

  test('round-trip E ↔ S preserves vectors', () => {
    const { MES } = as205Mes(37.5)
    const vE: [number, number, number] = [1e6, -2e5, 3e5]
    const vS = eciToS(MES, vE)
    const back = sToEci(MES, vS)
    expect(back[0]).toBeCloseTo(vE[0], 6)
    expect(back[1]).toBeCloseTo(vE[1], 6)
    expect(back[2]).toBeCloseTo(vE[2], 6)
  })

  test('row 1 of MES is E-components of X_S (local up direction in E)', () => {
    // X_S unit in S is [1,0,0]; in E: MESᵀ · [1,0,0] = first column of MESᵀ = first row of MES
    const { MES } = as205Mes(0)
    const xS_in_E = sToEci(MES, [1, 0, 0])
    expect(xS_in_E[0]).toBeCloseTo(MES[0][0], 12)
    expect(xS_in_E[1]).toBeCloseTo(MES[0][1], 12)
    expect(xS_in_E[2]).toBeCloseTo(MES[0][2], 12)
    // |X_S| = 1
    expect(Math.hypot(...xS_in_E)).toBeCloseTo(1, 12)
  })
})

describe('as205Mes — pad S → E via MES', () => {
  test('maps Simulink pad R_S/V_S into E and back', () => {
    const pad = as205SimulinkPadStateS()
    const { MES } = as205DefaultMes()
    const { r_E, v_E } = padStateSToEci(pad.R_S_0_m, pad.V_S_0_m, MES)
    // Magnitudes preserved (rotation)
    expect(Math.hypot(...r_E)).toBeCloseTo(Math.hypot(...pad.R_S_0_m), 6)
    expect(Math.hypot(...v_E)).toBeCloseTo(pad.V_S_0_mag, 6)
    // Round-trip
    const rS2 = eciToS(MES, r_E)
    expect(rS2[0]).toBeCloseTo(pad.R_S_0_m[0], 4)
    expect(rS2[1]).toBeCloseTo(pad.R_S_0_m[1], 4)
    expect(rS2[2]).toBeCloseTo(pad.R_S_0_m[2], 4)
  })

  test('from LaunchDate path matches explicit Θ_E path', () => {
    const date = AS205_DEFAULT_LAUNCH_DATE
    const th = thetaEDegFromLaunchDate(date)
    const a = as205MesFromLaunchDate(date).MES
    const b = as205Mes(th).MES
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(a[i][j]).toBeCloseTo(b[i][j], 12)
      }
    }
  })
})

describe('as205Mes — helpers', () => {
  test('wrapDeg360', () => {
    expect(wrapDeg360(370)).toBeCloseTo(10, 12)
    expect(wrapDeg360(-10)).toBeCloseTo(350, 12)
  })

  test('mat3MulVec identity', () => {
    const I: Mat3 = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ]
    expect(mat3MulVec(I, [3, 4, 5])).toEqual([3, 4, 5])
    expect(mat3Transpose(I)).toEqual(I)
  })
})

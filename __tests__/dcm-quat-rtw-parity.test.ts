/**
 * DCM→quat: Obliq Shepperd vs full RTW Positive/Negative Trace.
 * Pad LIO has T<0 → Negative Trace (max A22). See DCM_QUAT_EOM_AUDIT.md
 */

import {
  as205DefaultPadStateEci,
  as205MdlWirePadStateEci,
  dcmToQuat,
  quatToDcm
} from '../examples/saturn-ib/as205EciPlant'
import {
  mat3MulVec,
  mat3Transpose,
  type Mat3
} from '../examples/saturn-ib/as205Mes'

/** Full RTW DCM→quat (Positive if T>0, else Negative with A22→A33→A11 preference). */
export function rtwDcmToQuat(A: Mat3): [number, number, number, number] {
  const T = A[0][0] + A[1][1] + A[2][2]
  if (T > 0) {
    const s0 = Math.sqrt(T + 1.0)
    const s = 0.5 / s0
    return [
      0.5 * s0,
      (A[1][2] - A[2][1]) * s,
      (A[2][0] - A[0][2]) * s,
      (A[0][1] - A[1][0]) * s
    ]
  }
  const a11 = A[0][0]
  const a22 = A[1][1]
  const a33 = A[2][2]
  if (a22 > a11 && a22 > a33) {
    const s0 = Math.sqrt(1 + a22 - a33 - a11)
    const s = s0 !== 0 ? 0.5 / s0 : 0
    return [
      (A[2][0] - A[0][2]) * s,
      (A[1][0] + A[0][1]) * s,
      0.5 * s0,
      (A[1][2] + A[2][1]) * s
    ]
  }
  if (a33 > a11) {
    const s0 = Math.sqrt(1 + a33 - a11 - a22)
    const s = s0 !== 0 ? 0.5 / s0 : 0
    return [
      (A[0][1] - A[1][0]) * s,
      (A[2][0] + A[0][2]) * s,
      (A[2][1] + A[1][2]) * s,
      0.5 * s0
    ]
  }
  const s0 = Math.sqrt(1 + a11 - a22 - a33)
  const s = s0 !== 0 ? 0.5 / s0 : 0
  return [
    (A[1][2] - A[2][1]) * s,
    0.5 * s0,
    (A[1][0] + A[0][1]) * s,
    (A[2][0] + A[0][2]) * s
  ]
}

function quatDist(
  a: [number, number, number, number],
  b: [number, number, number, number]
): number {
  const dPlus = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3])
  const dMinus = Math.hypot(a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3])
  return Math.min(dPlus, dMinus)
}

describe('DCM→quat RTW full parity', () => {
  test('pad LIO uses Negative Trace (T<0) and matches RTW', () => {
    const pad = as205DefaultPadStateEci()
    const C = pad.C_bE
    const T = C[0][0] + C[1][1] + C[2][2]
    expect(T).toBeLessThan(0) // documents Negative Trace on pad

    const rtw = rtwDcmToQuat(C)
    const obliq = dcmToQuat(C)
    expect(quatDist(obliq, rtw)).toBeLessThan(1e-12)
  })

  test('T>0 random rotations match RTW Positive', () => {
    for (let k = 0; k < 20; k++) {
      const a = 0.01 * (k + 1)
      const q0 = Math.cos(a / 2)
      const q1 = Math.sin(a / 2) * 0.1
      const q2 = Math.sin(a / 2) * 0.2
      const q3 = Math.sin(a / 2) * Math.sqrt(Math.max(0, 1 - 0.01 - 0.04))
      const n = Math.hypot(q0, q1, q2, q3)
      const q: [number, number, number, number] = [
        q0 / n,
        q1 / n,
        q2 / n,
        q3 / n
      ]
      const C = quatToDcm(q)
      expect(C[0][0] + C[1][1] + C[2][2]).toBeGreaterThan(0)
      expect(quatDist(dcmToQuat(C), rtwDcmToQuat(C))).toBeLessThan(1e-10)
    }
  })

  test('quat_to_dcm ∘ dcm_to_quat round-trip on pad', () => {
    const pad = as205DefaultPadStateEci()
    const q = dcmToQuat(pad.C_bE)
    const C2 = quatToDcm(q)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(C2[i][j]).toBeCloseTo(pad.C_bE[i][j], 9)
      }
    }
  })
})

/**
 * E1 — DCM sense for EOM:
 * MDL: Ve = Transpose(ASB_Quaternion2DCM) · Vb  ⇒ ASB DCM maps inertial→body
 * Obliq: ṙ = quat_to_dcm(q) · v_b              ⇒ Obliq DCM maps body→inertial
 *
 * If both use the same quat→matrix element formula, Obliq C should equal ASB^T,
 * i.e. transforming Vb→Ve with Obliq C matches MDL Transpose(ASB)·Vb.
 */
describe('E1 DCM sense + MDL wire-as-is IC', () => {
  test('legacy pad: C_bE · v_b = v_E', () => {
    const pad = as205DefaultPadStateEci()
    const qflat: [number, number, number, number] = [
      pad.q0_bE[0][0],
      pad.q0_bE[1][0],
      pad.q0_bE[2][0],
      pad.q0_bE[3][0]
    ]
    const C_bi = quatToDcm(qflat)
    const ve = mat3MulVec(C_bi, pad.v0_b)
    for (let i = 0; i < 3; i++) {
      expect(ve[i]).toBeCloseTo(pad.v0_E[i], 6)
    }
  })

  test('mdlWireAsIs: Transpose(quat_to_dcm(q)) · v_b = v_E', () => {
    const pad = as205MdlWirePadStateEci()
    expect(pad.notes.some(n => n.includes('MDL wire-as-is'))).toBe(true)
    const qflat: [number, number, number, number] = [
      pad.q0_bE[0][0],
      pad.q0_bE[1][0],
      pad.q0_bE[2][0],
      pad.q0_bE[3][0]
    ]
    // q ≈ ± RTW DCM2Quat(LIO); ASB DCM = quat_to_dcm(q); Ve = ASB^T · Vb
    const ASB = quatToDcm(qflat)
    const ve = mat3MulVec(mat3Transpose(ASB), pad.v0_b)
    for (let i = 0; i < 3; i++) {
      expect(ve[i]).toBeCloseTo(pad.v0_E[i], 6)
    }
    // Same DCM2Quat(LIO) as RTW up to overall ±q
    const qRtw = rtwDcmToQuat(pad.LIO)
    expect(quatDist(qflat, qRtw)).toBeLessThan(1e-12)
  })
})

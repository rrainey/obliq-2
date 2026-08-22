/**
 * On Pad (<S8>) matched compare vs RTW --onpad-trace dump.
 * See examples/saturn-ib/ON_PAD_MATCHED_COMPARE.md
 */

import * as fs from 'fs'
import { as205OnPadStateAtTime } from '../examples/saturn-ib/as205OnPad'

const ONPAD = '/tmp/ic-matched/rtw-onpad.json'
const IC = '/tmp/ic-matched/rtw-ic.json'

function hypot(xs: number[]): number {
  return Math.sqrt(xs.reduce((s, x) => s + x * x, 0))
}

function dmag(a: number[], b: number[]): number {
  return hypot(a.map((x, i) => x - b[i]!))
}

describe('On Pad matched compare', () => {
  test('if obliq-out22-t02.json present: OUT22 matches rtw-onpad @ t=0.01', () => {
    const OBLIQ = '/tmp/ic-matched/obliq-out22-t02.json'
    if (!fs.existsSync(OBLIQ) || !fs.existsSync(ONPAD)) {
      console.warn(
        `[skip] need ${OBLIQ} (smoke --duration 0.02) and ${ONPAD}`
      )
      return
    }
    const ob = JSON.parse(fs.readFileSync(OBLIQ, 'utf8')) as {
      pad_lat_deg: number
      pad_lon_deg: number
      pad_h_m: number
      pad_Xe_x_m: number
      pad_Xe_y_m: number
      pad_Xe_z_m: number
      pad_Ve_x_mps: number
      pad_Ve_y_mps: number
      pad_Ve_z_mps: number
    }
    const rtw = JSON.parse(fs.readFileSync(ONPAD, 'utf8')) as {
      lat_deg: number
      lon_deg: number
      h_m: number
      Xe_m: number[]
      Ve_mps: number[]
    }
    const xe = [ob.pad_Xe_x_m, ob.pad_Xe_y_m, ob.pad_Xe_z_m]
    const ve = [ob.pad_Ve_x_mps, ob.pad_Ve_y_mps, ob.pad_Ve_z_mps]
    expect(dmag(xe, rtw.Xe_m)).toBeLessThan(1e-6)
    expect(dmag(ve, rtw.Ve_mps)).toBeLessThan(1e-9)
    expect(ob.pad_lat_deg).toBeCloseTo(rtw.lat_deg, 10)
    expect(ob.pad_lon_deg).toBeCloseTo(rtw.lon_deg, 10)
    expect(ob.pad_h_m).toBeCloseTo(rtw.h_m, 6)
  })

  test('closed-form Path B @ live GMST matches rtw-onpad.json', () => {
    if (!fs.existsSync(ONPAD)) {
      console.warn(
        `[skip] ${ONPAD} missing — batch_sim --onpad-trace /tmp/ic-matched/rtw-onpad.json`
      )
      return
    }

    const op = JSON.parse(fs.readFileSync(ONPAD, 'utf8')) as {
      valid: number
      t_sec: number
      lat_deg: number
      lon_deg: number
      h_m: number
      Xe_m: number[]
      Ve_mps: number[]
      theta_GMST_0_deg: number
      CG_LLA_deg_m: number[]
      q_ECI: number[]
      LIO_DCM: number[]
    }
    expect(op.valid).toBeGreaterThan(0.5)

    const pred = as205OnPadStateAtTime(op.t_sec)

    expect(pred.theta_GMST_deg).toBeCloseTo(op.theta_GMST_0_deg, 10)
    expect(dmag(pred.Xe_m, op.Xe_m)).toBeLessThan(1e-8)
    expect(dmag(pred.Ve_mps, op.Ve_mps)).toBeLessThan(1e-10)
    expect(pred.lat_deg).toBeCloseTo(op.lat_deg, 5)
    expect(pred.lon_deg).toBeCloseTo(op.lon_deg, 10)
    // Helper h vs RTW ECI→LLA: ~mm-level with RTW_A
    expect(Math.abs(pred.h_m - op.h_m)).toBeLessThan(0.05)
    // vs input CG h: ~0.7 m ellipsoidal round-trip
    expect(Math.abs(op.h_m - op.CG_LLA_deg_m[2]!)).toBeGreaterThan(0.5)
    expect(Math.abs(op.h_m - op.CG_LLA_deg_m[2]!)).toBeLessThan(1.0)

    expect(hypot(op.q_ECI)).toBeCloseTo(1, 10)
  })

  test('if rtw-ic.json present: On Pad vs S5 shows ωΔt GMST advance', () => {
    if (!fs.existsSync(ONPAD) || !fs.existsSync(IC)) {
      console.warn(`[skip] need ${ONPAD} and ${IC}`)
      return
    }
    const op = JSON.parse(fs.readFileSync(ONPAD, 'utf8')) as {
      t_sec: number
      theta_GMST_0_deg: number
      Xe_m: number[]
      LIO_DCM: number[]
      q_ECI: number[]
    }
    const ic = JSON.parse(fs.readFileSync(IC, 'utf8')) as {
      Xe_0_m: number[]
      theta_GMST_0_deg: number
      LIO_DCM: number[]
      q_ECI_0: number[]
    }

    const dGmst = op.theta_GMST_0_deg - ic.theta_GMST_0_deg
    const expected = ((7.292115e-5 * op.t_sec) * 180) / Math.PI
    expect(dGmst).toBeCloseTo(expected, 10)

    const dXe = dmag(op.Xe_m, ic.Xe_0_m)
    expect(dXe).toBeGreaterThan(0.1)
    expect(dXe).toBeLessThan(20)

    // LIO / q nearly identical (Θ_E shift is tiny over 0.01 s)
    expect(dmag(op.LIO_DCM, ic.LIO_DCM)).toBeLessThan(1e-12)
    expect(dmag(op.q_ECI, ic.q_ECI_0)).toBeLessThan(1e-12)
  })
})

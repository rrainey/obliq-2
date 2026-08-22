/**
 * S-IB Stage matched compare gates.
 * See examples/saturn-ib/S_IB_MATCHED_COMPARE.md
 */

import * as fs from 'fs'

const SIB = '/tmp/ic-matched/rtw-sib.json'
const ONPAD = '/tmp/ic-matched/rtw-onpad-sibpad.json'
const IC = '/tmp/ic-matched/rtw-ic-sibpad.json'
const SIB_LIFTOFF = '/tmp/ic-matched/rtw-sib-liftoff.json'
const RTW_ASCENT20 = '/tmp/ic-matched/rtw-sib-ascent20-final.json'
const OBLIQ_ASCENT20 = '/tmp/ic-matched/obliq-sib-ascent20-final.json'
const RTW_320 = '/tmp/ic-matched/rtw-sib-320-final.json'
const OBLIQ_320 = '/tmp/ic-matched/obliq-sib-320-final.json'

function hypot(xs: number[]): number {
  return Math.sqrt(xs.reduce((s, x) => s + x * x, 0))
}

function dmag(a: number[], b: number[]): number {
  return hypot(a.map((x, i) => x - b[i]!))
}

function xeOf(j: Record<string, unknown>): number[] {
  return [j.s1_Xe_x_m, j.s1_Xe_y_m, j.s1_Xe_z_m].map(Number)
}

describe('S-IB matched compare — pad handoff', () => {
  test('if rtw-sib.json present: OUT11 ≈ On Pad; earth-scale Xe', () => {
    if (!fs.existsSync(SIB) || !fs.existsSync(ONPAD)) {
      console.warn(
        `[skip] need ${SIB} + ${ONPAD} — batch_sim examples/AS-205-sib-pad.json --sib-trace …`
      )
      return
    }

    const sib = JSON.parse(fs.readFileSync(SIB, 'utf8')) as {
      valid: number
      bLiftoff: number
      lat_deg: number
      lon_deg: number
      h_m: number
      Xe_m: number[]
      Ve_mps: number[]
      q_ECI: number[]
    }
    const op = JSON.parse(fs.readFileSync(ONPAD, 'utf8')) as {
      lat_deg: number
      lon_deg: number
      h_m: number
      Xe_m: number[]
      Ve_mps: number[]
    }

    expect(sib.valid).toBeGreaterThan(0.5)
    expect(hypot(sib.Xe_m)).toBeGreaterThan(6.37e6)

    // Pad handoff
    expect(dmag(sib.Xe_m, op.Xe_m)).toBeLessThan(1e-2)
    expect(dmag(sib.Ve_mps, op.Ve_mps)).toBeLessThan(0.05)
    expect(sib.lat_deg).toBeCloseTo(op.lat_deg, 8)
    expect(sib.lon_deg).toBeCloseTo(op.lon_deg, 8)
    expect(Math.abs(sib.h_m - op.h_m)).toBeLessThan(1e-2)

    expect(hypot(sib.q_ECI)).toBeCloseTo(1, 5)

    // With T_L_prime_sec=0, RTW sets bLiftoff immediately
    expect(sib.bLiftoff).toBe(1)

    if (fs.existsSync(IC)) {
      const ic = JSON.parse(fs.readFileSync(IC, 'utf8')) as { Xe_0_m: number[] }
      // Live GMST vs frozen S5 — order ~ meters, not Path A 57 m
      const dXeIc = dmag(sib.Xe_m, ic.Xe_0_m)
      expect(dXeIc).toBeGreaterThan(0.1)
      expect(dXeIc).toBeLessThan(20)
    }
  })
})

describe('S-IB matched compare — delayed liftoff (RTW)', () => {
  test('if rtw-sib-liftoff.json present: enable at t≈300 with earth-scale Xe', () => {
    if (!fs.existsSync(SIB_LIFTOFF)) {
      console.warn(
        `[skip] need ${SIB_LIFTOFF} — nopad reference.json --run-time 320 --sib-trace …`
      )
      return
    }

    const sib = JSON.parse(fs.readFileSync(SIB_LIFTOFF, 'utf8')) as {
      t_sec: number
      valid: number
      bLiftoff: number
      Xe_m: number[]
      h_m: number
    }

    expect(sib.valid).toBeGreaterThan(0.5)
    expect(sib.bLiftoff).toBe(1)
    expect(sib.t_sec).toBeGreaterThan(299.99)
    expect(sib.t_sec).toBeLessThan(300.05)
    expect(hypot(sib.Xe_m)).toBeGreaterThan(6.37e6)
  })

  test('if rtw-sib-320-final present: early ascent motion', () => {
    if (!fs.existsSync(RTW_320)) {
      console.warn(`[skip] need ${RTW_320}`)
      return
    }
    const j = JSON.parse(fs.readFileSync(RTW_320, 'utf8')) as Record<string, unknown>
    expect(j.bLiftoff).toBe(true)
    expect(Number(j.s1_h_m)).toBeGreaterThan(400)
    expect(Number(j.s1_h_m)).toBeLessThan(800)
    expect(Number(j.s1_Vb_mps)).toBeGreaterThan(40)
    expect(Number(j.s1_Vb_mps)).toBeLessThan(100)
    expect(hypot(xeOf(j))).toBeGreaterThan(6.37e6)
  })
})

describe('S-IB matched compare — Obliq vs RTW +20 s physics', () => {
  function assertXeClose(rtwPath: string, obliqPath: string, label: string) {
    if (!fs.existsSync(rtwPath) || !fs.existsSync(obliqPath)) {
      console.warn(`[skip] need ${rtwPath} + ${obliqPath} (${label})`)
      return
    }
    const rtw = JSON.parse(fs.readFileSync(rtwPath, 'utf8')) as Record<string, unknown>
    const obq = JSON.parse(fs.readFileSync(obliqPath, 'utf8')) as Record<string, unknown>

    const rXe = xeOf(rtw)
    const oXe = xeOf(obq)
    const dR = Math.abs(hypot(rXe) - hypot(oXe))
    const dVec = dmag(rXe, oXe)

    // Plant radial/state truth — packing gaps (lon/Ve/Vb/h field) are separate
    expect(dR).toBeLessThan(50) // ~17 m observed
    expect(dVec).toBeLessThan(80)
    expect(rtw.bLiftoff).toBe(true)
    expect(obq.bLiftoff).toBe(true)
  }

  test('T_L=0 ascent20: |Xe| residual small', () => {
    assertXeClose(RTW_ASCENT20, OBLIQ_ASCENT20, 'ascent20')
  })

  test('T_L=300 +20s: |Xe| residual small', () => {
    assertXeClose(RTW_320, OBLIQ_320, '320')
  })
})

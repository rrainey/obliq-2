/**
 * Simulink Initial Position (Eqns 3.4.3-4) → R_S_0, V_S_0
 */

import {
  as205SimulinkPadStateS,
  computeSimulinkInitialPositionS,
  SIMULINK_OMEGA_E_RPS_OVER_PI
} from '../examples/saturn-ib/as205InitialPosition'
import { AS205_PAD, OMEGA_EARTH } from '../examples/saturn-ib/as205PadFrames'
import { buildSixDofOpenLoopChiAscent } from '../examples/saturn-ib/sixDofVarMassEom'

describe('as205InitialPosition (Simulink Eqns 3.4.3-4)', () => {
  const pad = as205SimulinkPadStateS()

  test('omega mask recovers ~7.292e-5 rad/s', () => {
    expect(SIMULINK_OMEGA_E_RPS_OVER_PI * Math.PI).toBeCloseTo(OMEGA_EARTH, 8)
    expect(pad.omega_E_radps).toBeCloseTo(OMEGA_EARTH, 8)
  })

  test('|R_S_0| equals R_L (geocentric radius)', () => {
    const r = pad.R_S_0_m
    const mag = Math.hypot(r[0], r[1], r[2])
    expect(mag).toBeCloseTo(AS205_PAD.R_L_m, 6)
  })

  test('R_S has small transverse offset from geodetic−geocentric', () => {
    // Not purely [R_L,0,0] — plumbline vs geocentric radial
    expect(Math.abs(pad.R_S_0_m[0] - AS205_PAD.R_L_m)).toBeGreaterThan(1)
    expect(Math.abs(pad.R_S_0_m[1])).toBeGreaterThan(1000)
    expect(Math.abs(pad.delta_phi_rad)).toBeGreaterThan(0.001)
  })

  test('|V_S_0| ≈ TN first-motion space-fixed speed ~409 m/s', () => {
    expect(pad.V_S_0_mag).toBeGreaterThan(400)
    expect(pad.V_S_0_mag).toBeLessThan(420)
    // Simulink: V_x = 0
    expect(pad.V_S_0_m[0]).toBe(0)
  })

  test('matches closed-form Fcn expressions', () => {
    const R = AS205_PAD.R_L_m
    const az = (AS205_PAD.A_z_deg * Math.PI) / 180
    const phi = (AS205_PAD.phi_L_deg * Math.PI) / 180
    const phiP = (AS205_PAD.phi_L_prime_deg * Math.PI) / 180
    const d = phi - phiP
    const omega = SIMULINK_OMEGA_E_RPS_OVER_PI * Math.PI
    const expectR: [number, number, number] = [
      R * Math.cos(d),
      R * Math.sin(d) * Math.sin(az),
      -R * Math.sin(d) * Math.cos(az)
    ]
    const expectV: [number, number, number] = [
      0,
      R * omega * Math.cos(phiP) * Math.cos(az),
      R * omega * Math.cos(phiP) * Math.sin(az)
    ]
    expect(pad.R_S_0_m[0]).toBeCloseTo(expectR[0], 9)
    expect(pad.R_S_0_m[1]).toBeCloseTo(expectR[1], 9)
    expect(pad.R_S_0_m[2]).toBeCloseTo(expectR[2], 9)
    expect(pad.V_S_0_m[1]).toBeCloseTo(expectV[1], 9)
    expect(pad.V_S_0_m[2]).toBeCloseTo(expectV[2], 9)
  })

  test('9.4 plant uses ECI pad (v_b0 still V_S; r0 is E not S)', () => {
    const m = buildSixDofOpenLoopChiAscent()
    const eom = m.sheets[0].blocks.find(b => b.name === 'EOM_6DoF_VarMass')!
    const blocks = eom.parameters?.sheets?.[0]?.blocks as Array<{
      name: string
      parameters?: { value?: unknown }
    }>
    const r0 = blocks.find(b => b.name === 'r0_i')?.parameters?.value as number[]
    const v0 = blocks.find(b => b.name === 'v0_b')?.parameters?.value as number[]
    // Body velocity IC still S components (B‖S)
    expect(v0[0]).toBeCloseTo(pad.V_S_0_m[0], 6)
    expect(v0[1]).toBeCloseTo(pad.V_S_0_m[1], 6)
    expect(v0[2]).toBeCloseTo(pad.V_S_0_m[2], 6)
    // Position is ECI: same magnitude, not equal to R_S components
    expect(Math.hypot(...r0)).toBeCloseTo(Math.hypot(...pad.R_S_0_m), 3)
    expect(Math.abs(r0[0] - pad.R_S_0_m[0])).toBeGreaterThan(1e3)
  })

  test('optional pure OMEGA_EARTH path still ~409 m/s', () => {
    const p = computeSimulinkInitialPositionS({ useSimulinkOmegaMask: false })
    expect(p.V_S_0_mag).toBeGreaterThan(400)
    expect(p.V_S_0_mag).toBeLessThan(420)
  })
})

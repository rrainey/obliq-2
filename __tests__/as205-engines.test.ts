/**
 * H-1 engine cluster + TVC + 9.4 plant wiring
 */

import {
  H1_DEFAULT_CG_M,
  H1_GIMBAL_LIMIT_DEG,
  computeH1ClusterForcesMoments,
  pitchGimbalMomentGain,
  thrustDirectionBody
} from '../examples/saturn-ib/as205Engines'
import { buildSixDofOpenLoopChiAscent } from '../examples/saturn-ib/sixDofVarMassEom'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { propagateSignalTypes } from '@/lib/signalTypePropagation'

describe('as205Engines H-1 cluster', () => {
  test('undeflected thrust is along +X', () => {
    const c = computeH1ClusterForcesMoments({
      T_total_N: 8e6,
      beta_P_deg: 0,
      beta_Y_deg: 0
    })
    expect(c.F_N[0]).toBeCloseTo(8e6, 0)
    expect(Math.abs(c.F_N[1])).toBeLessThan(1)
    expect(Math.abs(c.F_N[2])).toBeLessThan(1)
    // Undeflected, r_yz cancel → small moment if CG on axis
    expect(Math.hypot(c.M_Nm[0], c.M_Nm[1], c.M_Nm[2])).toBeLessThan(1e3)
  })

  test('pitch gimbal produces pitch moment and Fz', () => {
    const c = computeH1ClusterForcesMoments({
      T_total_N: 7e6,
      beta_P_deg: 2,
      beta_Y_deg: 0
    })
    expect(Math.abs(c.F_N[2])).toBeGreaterThan(1e4)
    expect(Math.abs(c.M_Nm[1])).toBeGreaterThan(1e5)
    // No large yaw from pure pitch cmd
    expect(Math.abs(c.M_Nm[2])).toBeLessThan(Math.abs(c.M_Nm[1]) * 0.1)
  })

  /**
   * H-1 yaw polarity probe (no Chi_Z loop).
   * Plant simplified: Mz ≈ −T_h · CG_x · sin(β_Y) with T_h = T/2.
   * β_Y > 0 → Fy > 0 → Mz < 0 (for CG_x > 0).
   * Restoring Ψ_Y>0 (nose +Y of cmd) wants Mz that reduces +yaw rate/angle:
   * with Mz∝−β_Y, need β_Y > 0 when Ψ_Y > 0 → β_Y = +Kp·Ψ_Y (not −Kp).
   * (Closed-loop Chi_Z still parked; this documents the sign for a future retry.)
   */
  test('yaw gimbal polarity: β_Y>0 ⇒ Fy>0 and Mz<0', () => {
    const pos = computeH1ClusterForcesMoments({
      T_total_N: 7e6,
      beta_P_deg: 0,
      beta_Y_deg: 2
    })
    const neg = computeH1ClusterForcesMoments({
      T_total_N: 7e6,
      beta_P_deg: 0,
      beta_Y_deg: -2
    })
    expect(pos.F_N[1]).toBeGreaterThan(1e4)
    expect(pos.M_Nm[2]).toBeLessThan(-1e5)
    expect(neg.F_N[1]).toBeLessThan(-1e4)
    expect(neg.M_Nm[2]).toBeGreaterThan(1e5)
    // Antisymmetric
    expect(pos.M_Nm[2]).toBeCloseTo(-neg.M_Nm[2], -1)
  })

  test('plant simplified FM matches cluster at β_P=2°', () => {
    const T = 7e6
    const bp = (2 * Math.PI) / 180
    const by = 0
    const Th = 0.5 * T
    const CGx = H1_DEFAULT_CG_M[0]
    const Fx = Th * (Math.cos(bp) * Math.cos(by) + 1)
    const Fy = Th * Math.sin(by)
    const Fz = Th * Math.sin(bp) * Math.cos(by)
    const My = Th * CGx * Math.sin(bp) * Math.cos(by)
    const Mz = -Th * CGx * Math.sin(by)
    const c = computeH1ClusterForcesMoments({
      T_total_N: T,
      beta_P_deg: 2,
      beta_Y_deg: 0
    })
    expect(c.F_N[0]).toBeCloseTo(Fx, -1)
    expect(c.F_N[1]).toBeCloseTo(Fy, 0)
    expect(c.F_N[2]).toBeCloseTo(Fz, -1)
    expect(c.M_Nm[1]).toBeCloseTo(My, -1)
    expect(c.M_Nm[2]).toBeCloseTo(Mz, 0)
  })

  test('gimbal limits clamp command', () => {
    const c = computeH1ClusterForcesMoments({
      T_total_N: 7e6,
      beta_P_deg: 45
    })
    expect(Math.abs((c.beta_P_rad * 180) / Math.PI)).toBeCloseTo(
      H1_GIMBAL_LIMIT_DEG,
      6
    )
  })

  test('thrust direction unit-ish at zero', () => {
    const u = thrustDirectionBody(0, 0)
    expect(u[0]).toBeCloseTo(1, 12)
    expect(u[1]).toBeCloseTo(0, 12)
    expect(u[2]).toBeCloseTo(0, 12)
  })

  test('pitch moment gain is finite and large', () => {
    const g = pitchGimbalMomentGain(7e6)
    expect(Math.abs(g)).toBeGreaterThan(1e6)
  })
})

describe('9.4 plant H-1 engine wiring', () => {
  test('F_engines + M_engines feed F_b / M_b; type-prop + codegen', () => {
    const m = buildSixDofOpenLoopChiAscent()
    const sheet = m.sheets[0]
    const Feng = sheet.blocks.find(b => b.name === 'F_engines_N')!
    const Meng = sheet.blocks.find(b => b.name === 'M_engines_Nm')!
    const Fb = sheet.blocks.find(b => b.name === 'F_b_cmd')!
    const Mb = sheet.blocks.find(b => b.name === 'M_b_cmd')!
    const eom = sheet.blocks.find(b => b.name === 'EOM_6DoF_VarMass')!
    expect(
      sheet.connections.some(
        c => c.sourceBlockId === Feng.id && c.targetBlockId === Fb.id
      )
    ).toBe(true)
    expect(
      sheet.connections.some(
        c => c.sourceBlockId === Meng.id && c.targetBlockId === Mb.id
      )
    ).toBe(true)
    expect(
      sheet.connections.some(
        c => c.sourceBlockId === Fb.id && c.targetBlockId === eom.id
      )
    ).toBe(true)
    expect(
      sheet.connections.some(
        c => c.sourceBlockId === Mb.id && c.targetBlockId === eom.id
      )
    ).toBe(true)
    // No free My actuator blocks
    expect(sheet.blocks.some(b => b.name === 'My_raw')).toBe(false)
    expect(sheet.blocks.some(b => b.name === 'M_b_ctrl')).toBe(false)
    // Gimbal limits ±8°
    const bpLim = sheet.blocks.find(b => b.name === 'beta_P_lim')!
    expect(bpLim.parameters?.upperLimit).toBe(H1_GIMBAL_LIMIT_DEG)

    const prop = propagateSignalTypes(
      sheet.blocks as any,
      sheet.connections as any
    )
    const typeErrors = prop.errors.filter(e => e.severity === 'error')
    expect(typeErrors.map(e => e.message)).toEqual([])

    const gen = new CodeGenerator({
      modelName: 'sixdof_engines',
      integrationAlgorithm: 'rk4'
    })
    const result = gen.generate(m.sheets as any, m.parameters || [])
    expect(result.source).not.toMatch(/Error generating code for/)
    expect(result.source).toContain('_step')
  })
})

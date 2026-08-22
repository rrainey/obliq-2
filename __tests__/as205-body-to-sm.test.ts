/**
 * Body→S / BODYtoSM attitude
 */

import {
  bodyToSmAtPad,
  computeBodyToSm,
  eulerZyxFromDcmBodyToFixed
} from '../examples/saturn-ib/as205BodyToSm'
import { as205DefaultPadStateEci } from '../examples/saturn-ib/as205EciPlant'
import { mat3Identity, mat3Mul, mat3Transpose } from '../examples/saturn-ib/as205Mes'
import { buildSixDofOpenLoopChiAttitudePd } from '../examples/saturn-ib/sixDofVarMassEom'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { propagateSignalTypes } from '@/lib/signalTypePropagation'

describe('as205BodyToSm', () => {
  test('pad Position I: elev ~ π/2 (X_B ‖ X_S), roll about X', () => {
    const padE = as205DefaultPadStateEci()
    const a = computeBodyToSm(padE.MES, padE.C_bE)
    expect(a.elev_rad).toBeCloseTo(Math.PI / 2, 6)
    // Not B‖S — pad_roll − A_z ≈ 17.18° about X
    expect(Math.abs(a.phi_rad) + Math.abs(a.psi_rad)).toBeGreaterThan(0.1)
  })

  test('computeBodyToSm matches MES·C_bE', () => {
    const padE = as205DefaultPadStateEci()
    const a = computeBodyToSm(padE.MES, padE.C_bE)
    expect(a.elev_rad).toBeCloseTo(Math.PI / 2, 6)
    expect(Number.isFinite(a.theta_rad)).toBe(true)
  })

  test('identity DCM Euler zero', () => {
    const e = eulerZyxFromDcmBodyToFixed(mat3Identity())
    expect(e.phi_rad).toBeCloseTo(0, 12)
    expect(e.theta_rad).toBeCloseTo(0, 12)
    expect(e.psi_rad).toBeCloseTo(0, 12)
  })

  test('C_bS = MES · MESᵀ is identity', () => {
    const padE = as205DefaultPadStateEci()
    const C = mat3Mul(padE.MES, mat3Transpose(padE.MES))
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(C[i][j]).toBeCloseTo(i === j ? 1 : 0, 9)
      }
    }
  })
})

describe('9.6 BodyToSM plant wiring', () => {
  test('logs BodyToSM Euler + elev PD; type-prop and codegen', () => {
    const m = buildSixDofOpenLoopChiAttitudePd()
    const sheet = m.sheets[0]
    expect(sheet.blocks.some(b => b.name === 'eul_BodyToSM')).toBe(true)
    expect(sheet.blocks.some(b => b.name === 'log_BodyToSM_Phi')).toBe(true)
    expect(sheet.blocks.some(b => b.name === 'log_BodyToSM_Theta')).toBe(true)
    expect(sheet.blocks.some(b => b.name === 'log_BodyToSM_Psi')).toBe(true)
    expect(sheet.blocks.some(b => b.name === 'elev_meas_rad')).toBe(true)
    // İω lives inside EOM subsystem (variable-mass 6DoF)
    const eom = sheet.blocks.find(b => b.name === 'EOM_6DoF_VarMass')!
    const eomBlocks = eom.parameters?.sheets?.[0]?.blocks as Array<{ name: string }>
    expect(eomBlocks.some(b => b.name === 'Idot_omega')).toBe(true)

    const prop = propagateSignalTypes(
      sheet.blocks as any,
      sheet.connections as any
    )
    const typeErrors = prop.errors.filter(e => e.severity === 'error')
    expect(typeErrors.map(e => e.message)).toEqual([])

    const gen = new CodeGenerator({
      modelName: 'sixdof_bodytosm',
      integrationAlgorithm: 'rk4'
    })
    const result = gen.generate(m.sheets as any, m.parameters || [])
    expect(result.source).not.toMatch(/Error generating code for/)
    expect(result.source).toContain('_step')
  })
})

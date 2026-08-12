/**
 * ECI pad IC + MES export for 9.4+ plant
 */

import {
  as205DefaultPadStateEci,
  buildAs205PadStateEci,
  dcmToQuat,
  mat3ToSourceValue,
  quatToDcm
} from '../examples/saturn-ib/as205EciPlant'
import {
  eciToS,
  mat3MulVec,
  mat3OrthonormalityError,
  mat3Transpose
} from '../examples/saturn-ib/as205Mes'
import { as205SimulinkPadStateS } from '../examples/saturn-ib/as205InitialPosition'
import {
  buildSixDofOpenLoopChiAscent,
  buildSixDofOpenLoopChiAttitudePd
} from '../examples/saturn-ib/sixDofVarMassEom'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { propagateSignalTypes } from '@/lib/signalTypePropagation'

describe('as205EciPlant', () => {
  test('dcmToQuat ↔ quatToDcm round-trip (identity)', () => {
    const I: [[number, number, number], [number, number, number], [number, number, number]] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ]
    const q = dcmToQuat(I)
    expect(q[0]).toBeCloseTo(1, 10)
    expect(Math.hypot(q[1], q[2], q[3])).toBeLessThan(1e-12)
    const C = quatToDcm(q)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(C[i][j]).toBeCloseTo(I[i][j], 10)
      }
    }
  })

  test('pad ECI: |r_E|=|R_S|, C_bE=MESᵀ, v_E = C_bE·V_S', () => {
    const padS = as205SimulinkPadStateS()
    const padE = as205DefaultPadStateEci()
    expect(Math.hypot(...padE.r0_E)).toBeCloseTo(Math.hypot(...padS.R_S_0_m), 6)
    expect(padE.v0_b[0]).toBeCloseTo(padS.V_S_0_m[0], 9)
    expect(padE.v0_b[1]).toBeCloseTo(padS.V_S_0_m[1], 9)
    expect(padE.v0_b[2]).toBeCloseTo(padS.V_S_0_m[2], 9)

    const C = padE.C_bE
    const vFromC = mat3MulVec(C, padS.V_S_0_m)
    expect(vFromC[0]).toBeCloseTo(padE.v0_E[0], 6)
    expect(vFromC[1]).toBeCloseTo(padE.v0_E[1], 6)
    expect(vFromC[2]).toBeCloseTo(padE.v0_E[2], 6)

    // MES · r_E = R_S
    const rSback = eciToS(padE.MES, padE.r0_E)
    expect(rSback[0]).toBeCloseTo(padS.R_S_0_m[0], 3)
    expect(rSback[1]).toBeCloseTo(padS.R_S_0_m[1], 3)
    expect(rSback[2]).toBeCloseTo(padS.R_S_0_m[2], 3)

    // q reconstructs C_bE
    const q: [number, number, number, number] = [
      padE.q0_bE[0][0],
      padE.q0_bE[1][0],
      padE.q0_bE[2][0],
      padE.q0_bE[3][0]
    ]
    const Cq = quatToDcm(q)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(Cq[i][j]).toBeCloseTo(C[i][j], 9)
      }
    }
    expect(mat3OrthonormalityError(C)).toBeLessThan(1e-12)
    // C_bE should equal MESᵀ
    const Mt = mat3Transpose(padE.MES)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        expect(C[i][j]).toBeCloseTo(Mt[i][j], 12)
      }
    }
  })

  test('explicit Θ_E overrides LaunchDate path', () => {
    const a = buildAs205PadStateEci({ Theta_E_deg: 0 })
    const b = buildAs205PadStateEci({ Theta_E_deg: 90 })
    expect(Math.hypot(...a.r0_E)).toBeCloseTo(Math.hypot(...b.r0_E), 6)
    // Different epoch → different ECI components
    expect(Math.hypot(a.r0_E[0] - b.r0_E[0], a.r0_E[1] - b.r0_E[1])).toBeGreaterThan(
      1e5
    )
  })

  test('mat3ToSourceValue is 3×3 nested', () => {
    const padE = as205DefaultPadStateEci()
    const v = mat3ToSourceValue(padE.MES)
    expect(v).toHaveLength(3)
    expect(v[0]).toHaveLength(3)
  })
})

describe('9.4 ECI plant wiring', () => {
  test('ICs + MES export blocks + codegen', () => {
    const padE = as205DefaultPadStateEci()
    const m = buildSixDofOpenLoopChiAscent()
    const sheet = m.sheets[0]
    const eom = sheet.blocks.find(b => b.name === 'EOM_6DoF_VarMass')!
    const blocks = eom.parameters?.sheets?.[0]?.blocks as Array<{
      name: string
      parameters?: { value?: unknown }
    }>
    const r0 = blocks.find(b => b.name === 'r0_i')?.parameters?.value as number[]
    const q0 = blocks.find(b => b.name === 'q0')?.parameters?.value as number[][]
    expect(r0[0]).toBeCloseTo(padE.r0_E[0], 4)
    expect(r0[1]).toBeCloseTo(padE.r0_E[1], 4)
    expect(r0[2]).toBeCloseTo(padE.r0_E[2], 4)
    expect(q0[0][0]).toBeCloseTo(padE.q0_bE[0][0], 9)
    // Not identity quaternion for real MES
    expect(Math.abs(q0[0][0] - 1) > 1e-6 || Math.abs(q0[1][0]) > 1e-6).toBe(true)

    expect(sheet.blocks.some(b => b.name === 'MES_E_to_S')).toBe(true)
    expect(sheet.blocks.some(b => b.name === 'r_S')).toBe(true)
    expect(sheet.blocks.some(b => b.name === 'log_X_S')).toBe(true)
    expect(sheet.blocks.some(b => b.name === 'log_Y_S')).toBe(true)
    expect(sheet.blocks.some(b => b.name === 'log_Z_S')).toBe(true)

    const prop = propagateSignalTypes(
      sheet.blocks as any,
      sheet.connections as any
    )
    const typeErrors = prop.errors.filter(e => e.severity === 'error')
    expect(typeErrors.map(e => e.message)).toEqual([])

    const gen = new CodeGenerator({
      modelName: 'sixdof_eci',
      integrationAlgorithm: 'rk4'
    })
    const result = gen.generate(m.sheets as any, m.parameters || [])
    expect(result.source).not.toMatch(/Error generating code for/)
    expect(result.source).toContain('_step')
  })

  test('9.6 still builds on ECI base', () => {
    const m = buildSixDofOpenLoopChiAttitudePd()
    expect(m.name).toBe('saturn-9.6-chi-table2b-attitude-pd')
    expect(m.sheets[0].blocks.some(b => b.name === 'MES_E_to_S')).toBe(true)
    expect(m.description).toMatch(/ECI/i)
  })
})

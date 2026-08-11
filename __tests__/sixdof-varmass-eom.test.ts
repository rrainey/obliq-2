/**
 * 6-DOF variable-mass quaternion EOM sheet — codegen regression
 */

import * as fs from 'fs'
import * as path from 'path'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import {
  buildSixDofVariableMassEom,
  buildSixDofVehicleBurnDemo
} from '../examples/saturn-ib/sixDofVarMassEom'
import { sliceToModelData } from '../examples/saturn-ib/sliceModels'

describe('6-DOF variable-mass quaternion EOM', () => {
  const model = buildSixDofVariableMassEom()
  const sheet = model.sheets[0]

  test('includes required physics blocks', () => {
    const types = new Set(sheet.blocks.map(b => b.type))
    expect(types.has('body2quaternion_rates')).toBe(true)
    expect(types.has('orientation_conversion')).toBe(true)
    expect(types.has('integrator')).toBe(true)
    expect(types.has('cross')).toBe(true)
    expect(types.has('matrix_multiply')).toBe(true)
    expect(types.has('mag')).toBe(true)
    expect(types.has('divide')).toBe(true)
    expect(types.has('transpose')).toBe(true)
  })

  test('five continuous state integrators (r, v, ω, q_raw, m)', () => {
    const ints = sheet.blocks.filter(b => b.type === 'integrator')
    const names = ints.map(b => b.name).sort()
    expect(names).toEqual(['mass', 'omega_b', 'q_raw', 'r_i', 'v_b'].sort())
    for (const i of ints) {
      expect(i.parameters?.showInitPort).toBe(true)
    }
  })

  test('quaternion unit renormalization chain present', () => {
    expect(sheet.blocks.some(b => b.name === 'q_hat')).toBe(true)
    expect(sheet.blocks.some(b => b.name === 'q_mag')).toBe(true)
    expect(sheet.blocks.some(b => b.name === 'q_mag_safe')).toBe(true)
    // body2quat and DCM consume unit quaternion, not raw
    const qdot = sheet.blocks.find(b => b.name === 'q_dot')!
    const qHat = sheet.blocks.find(b => b.name === 'q_hat')!
    const toQdot = sheet.connections.find(
      c => c.targetBlockId === qdot.id && c.targetPortIndex === 0
    )
    expect(toQdot?.sourceBlockId).toBe(qHat.id)
  })

  test('quaternion IC is identity 4×1', () => {
    const q0 = sheet.blocks.find(b => b.name === 'q0')
    expect(q0?.parameters?.dataType).toBe('double[4][1]')
    expect(q0?.parameters?.value).toEqual([[1], [0], [0], [0]])
  })

  test('mass rate is negative of propellant mdot', () => {
    const mdot = sheet.blocks.find(b => b.name === 'm_dot')
    expect(mdot?.type).toBe('uminus')
    const mInt = sheet.blocks.find(b => b.name === 'mass')
    const w = sheet.connections.find(
      c => c.sourceBlockId === mdot!.id && c.targetBlockId === mInt!.id
    )
    expect(w).toBeDefined()
  })

  test('codegen succeeds', () => {
    const gen = new CodeGenerator({
      modelName: 'sixdof_varmass_quat',
      integrationAlgorithm: 'rk4'
    })
    const result = gen.generate(model.sheets as any, model.parameters || [])
    expect(result.source).toContain('_step')
    expect(result.source).not.toMatch(/Error generating code for/)
    expect(result.source).toMatch(/Body2QuaternionRates|q_dot|Quaternion kinematic/i)
    expect(result.header).toContain('sixdof_varmass_quat')
  })

  test('vehicle burn demo packages EOM as subsystem and codegens', () => {
    const demo = buildSixDofVehicleBurnDemo()
    expect(demo.sheets[0].blocks.some(b => b.type === 'subsystem')).toBe(true)
    expect(demo.sheets[0].blocks.some(b => b.type === 'edge_detect')).toBe(true)
    const gen = new CodeGenerator({
      modelName: 'sixdof_vehicle_burn',
      integrationAlgorithm: 'rk4'
    })
    const result = gen.generate(demo.sheets as any, demo.parameters || [])
    expect(result.source).not.toMatch(/Error generating code for/)
    expect(result.source).toContain('_step')
  })

  test('exports JSON fixtures', () => {
    const dir = path.join(__dirname, '../docs/sample-models/saturn')
    fs.mkdirSync(dir, { recursive: true })
    for (const m of [model, buildSixDofVehicleBurnDemo()]) {
      const data = sliceToModelData(m as any)
      const fp = path.join(dir, `${m.name}.json`)
      fs.writeFileSync(fp, JSON.stringify({ name: m.name, data }, null, 2))
      expect(fs.existsSync(fp)).toBe(true)
    }
  })
})

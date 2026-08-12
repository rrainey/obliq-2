/**
 * 6-DOF variable-mass quaternion EOM sheet — codegen regression
 */

import * as fs from 'fs'
import * as path from 'path'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import {
  buildSixDofVariableMassEom,
  buildSixDofVehicleBurnDemo,
  buildSixDofOpenLoopAscent,
  buildSixDofClosedLoopPitchRateDamp,
  buildSixDofOpenLoopAscentWithAero,
  buildSixDofOpenLoopChiAscent,
  buildSixDofOpenLoopChiAscentTable2B
} from '../examples/saturn-ib/sixDofVarMassEom'
import {
  TN_TABLE_2B_CHI_C,
  chiCToPlantElevDeg,
  table2bPlantElevDeg
} from '../examples/saturn-ib/as205ChiTable'
import { sliceToModelData } from '../examples/saturn-ib/sliceModels'
import { propagateSignalTypes } from '@/lib/signalTypePropagation'

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

  test('9.1 open-loop 6-DoF ascent: propulsion + atmosphere plots + sinks', () => {
    const ascent = buildSixDofOpenLoopAscent()
    const types = new Set(ascent.sheets[0].blocks.map(b => b.type))
    expect(types.has('subsystem')).toBe(true)
    expect(types.has('edge_detect')).toBe(true)
    expect(types.has('lookup_1d')).toBe(true)
    expect(types.has('atmosphere')).toBe(true)
    expect(types.has('signal_display')).toBe(true)
    expect(types.has('signal_logger')).toBe(true)
    expect(ascent.globalSettings.simulationDuration).toBeGreaterThanOrEqual(150)
    expect(ascent.globalSettings.simulationTimeStep).toBeLessThanOrEqual(0.1)

    const gen = new CodeGenerator({
      modelName: 'sixdof_open_loop_ascent',
      integrationAlgorithm: 'rk4'
    })
    const result = gen.generate(ascent.sheets as any, ascent.parameters || [])
    expect(result.source).not.toMatch(/Error generating code for/)
    expect(result.source).toContain('_step')
    expect(result.header).toMatch(/Atm_density|altitude|ThrustMag/i)
  })

  test('9.2 closed-loop pitch-rate damp: Q feedback TF+limit → My', () => {
    const m = buildSixDofClosedLoopPitchRateDamp()
    const types = new Set(m.sheets[0].blocks.map(b => b.type))
    expect(types.has('subsystem')).toBe(true)
    expect(types.has('transfer_function')).toBe(true)
    expect(types.has('limit')).toBe(true)
    expect(types.has('demux')).toBe(true)
    // My wired to EOM M_b
    const eom = m.sheets[0].blocks.find(b => b.name === 'EOM_6DoF_VarMass')!
    const myLim = m.sheets[0].blocks.find(b => b.name === 'My_limit')!
    const Mb = m.sheets[0].blocks.find(b => b.name === 'M_b_cmd')!
    expect(
      m.sheets[0].connections.some(
        c => c.sourceBlockId === myLim.id && c.targetBlockId === Mb.id
      )
    ).toBe(true)
    expect(
      m.sheets[0].connections.some(
        c => c.sourceBlockId === Mb.id && c.targetBlockId === eom.id
      )
    ).toBe(true)

    const gen = new CodeGenerator({
      modelName: 'sixdof_cl_pitch_damp',
      integrationAlgorithm: 'rk4'
    })
    const result = gen.generate(m.sheets as any, m.parameters || [])
    expect(result.source).not.toMatch(/Error generating code for/)
    expect(result.source).toContain('_step')
  })

  test('9.3 open-loop 6-DoF + aero drag: q̄·CdA·v̂ into F_b', () => {
    const m = buildSixDofOpenLoopAscentWithAero()
    const types = new Set(m.sheets[0].blocks.map(b => b.type))
    expect(types.has('subsystem')).toBe(true)
    expect(types.has('atmosphere')).toBe(true)
    expect(types.has('uminus')).toBe(true)
    expect(types.has('signal_logger')).toBe(true)
    expect(m.sheets[0].blocks.some(b => b.name === 'F_aero')).toBe(true)
    expect(m.sheets[0].blocks.some(b => b.name === 'CdA_m2')).toBe(true)
    expect(m.sheets[0].blocks.some(b => b.name === 'F_b_cmd')).toBe(true)
    // F_b_cmd (sum) feeds EOM F_b, not bare thrust
    const eom = m.sheets[0].blocks.find(b => b.name === 'EOM_6DoF_VarMass')!
    const Fb = m.sheets[0].blocks.find(b => b.name === 'F_b_cmd')!
    expect(
      m.sheets[0].connections.some(
        c => c.sourceBlockId === Fb.id && c.targetBlockId === eom.id
      )
    ).toBe(true)

    // Parent-sheet type propagation must type D_vec / F_aero / F_b_cmd
    const prop = propagateSignalTypes(
      m.sheets[0].blocks as any,
      m.sheets[0].connections as any
    )
    const typeErrors = prop.errors.filter(e => e.severity === 'error')
    expect(typeErrors.map(e => e.message)).toEqual([])
    const dvec = m.sheets[0].blocks.find(b => b.name === 'D_vec')!
    const faero = m.sheets[0].blocks.find(b => b.name === 'F_aero')!
    expect(prop.blockOutputTypes.get(`${dvec.id}:0`)).toBe('double[3]')
    expect(prop.blockOutputTypes.get(`${faero.id}:0`)).toBe('double[3]')
    expect(prop.blockOutputTypes.get(`${Fb.id}:0`)).toBe('double[3]')

    const gen = new CodeGenerator({
      modelName: 'sixdof_ascent_aero',
      integrationAlgorithm: 'rk4'
    })
    const result = gen.generate(m.sheets as any, m.parameters || [])
    expect(result.source).not.toMatch(/Error generating code for/)
    expect(result.source).toContain('_step')
  })

  test('9.4 open-loop χ time-tilt on 6-DoF + aero + rate loop', () => {
    const m = buildSixDofOpenLoopChiAscent()
    const types = new Set(m.sheets[0].blocks.map(b => b.type))
    expect(types.has('subsystem')).toBe(true)
    expect(types.has('lookup_1d')).toBe(true)
    expect(types.has('rate_limiter')).toBe(true)
    expect(types.has('unit_delay')).toBe(true)
    expect(types.has('units_conversion')).toBe(true)
    expect(types.has('transfer_function')).toBe(true)
    expect(types.has('atmosphere')).toBe(true)
    expect(m.sheets[0].blocks.some(b => b.name === 'chi_deg_cmd')).toBe(true)
    expect(m.sheets[0].blocks.some(b => b.name === 'Q_cmd')).toBe(true)
    expect(m.sheets[0].blocks.some(b => b.name === 'F_aero')).toBe(true)
    expect(m.sheets[0].blocks.some(b => b.name === 'M_b_cmd')).toBe(true)

    // TN Table 5 thrust schedule (~7–8 MN class)
    const thrust = m.sheets[0].blocks.find(b => b.name === 'ThrustMag_N')!
    const thrustPeak = Math.max(...(thrust.parameters?.outputValues as number[]))
    expect(thrustPeak).toBeGreaterThan(5e6)
    expect((thrust.parameters?.inputValues as number[]).length).toBeGreaterThan(20)
    const mdot = m.sheets[0].blocks.find(b => b.name === 'mdot_scale')!
    expect(mdot.parameters?.value).toBeCloseTo(1 / 2740, 8)

    // P0: full-run logger buffers (duration/dt ≈ 3600 → maxSamples ≥ 3600)
    const loggers = m.sheets[0].blocks.filter(b => b.type === 'signal_logger')
    expect(loggers.length).toBeGreaterThanOrEqual(3)
    for (const log of loggers) {
      expect(log.parameters?.maxSamples).toBeGreaterThanOrEqual(3600)
    }

    // EOM mass IC aligned with TN first-motion mass
    const eom = m.sheets[0].blocks.find(b => b.name === 'EOM_6DoF_VarMass')!
    const eomBlocks = eom.parameters?.sheets?.[0]?.blocks as Array<{
      name: string
      parameters?: { value?: number }
    }>
    const m0 = eomBlocks.find(b => b.name === 'm0')
    expect(m0?.parameters?.value).toBe(586593)

    const Fb = m.sheets[0].blocks.find(b => b.name === 'F_b_cmd')!
    const Mb = m.sheets[0].blocks.find(b => b.name === 'M_b_cmd')!
    expect(
      m.sheets[0].connections.some(
        c => c.sourceBlockId === Fb.id && c.targetBlockId === eom.id
      )
    ).toBe(true)
    expect(
      m.sheets[0].connections.some(
        c => c.sourceBlockId === Mb.id && c.targetBlockId === eom.id
      )
    ).toBe(true)

    const prop = propagateSignalTypes(
      m.sheets[0].blocks as any,
      m.sheets[0].connections as any
    )
    const typeErrors = prop.errors.filter(e => e.severity === 'error')
    expect(typeErrors.map(e => e.message)).toEqual([])

    const gen = new CodeGenerator({
      modelName: 'sixdof_chi_ascent',
      integrationAlgorithm: 'rk4'
    })
    const result = gen.generate(m.sheets as any, m.parameters || [])
    expect(result.source).not.toMatch(/Error generating code for/)
    expect(result.source).toContain('_step')
    // Logger buffer size embedded in init
    expect(result.source).toMatch(/max_samples\s*=\s*38\d{2}/)
    // Parameter macro must not clobber Kq_gain signal
    expect(result.header).not.toMatch(/#define\s+Kq_gain\b/)
  })

  test('9.5 Table 2B χ program on 9.4 plant', () => {
    const m = buildSixDofOpenLoopChiAscentTable2B()
    expect(m.name).toBe('saturn-9.5-open-loop-chi-table2b-ascent')
    const lut = m.sheets[0].blocks.find(b => b.name === 'chi_deg_cmd')!
    const times = lut.parameters?.inputValues as number[]
    const elev = lut.parameters?.outputValues as number[]
    expect(times[0]).toBe(0)
    expect(elev[0]).toBe(90) // vertical
    // Staging / IGM initiation χ_c ≈ −60.83 → elev ≈ 29.17
    const i138 = times.indexOf(138)
    expect(i138).toBeGreaterThan(0)
    expect(elev[i138]).toBeCloseTo(chiCToPlantElevDeg(-60.8349), 3)
    // More breakpoints than simplified 9.4 table
    expect(times.length).toBeGreaterThan(40)
    expect(elev).toEqual(table2bPlantElevDeg())

    const gen = new CodeGenerator({
      modelName: 'sixdof_chi_table2b',
      integrationAlgorithm: 'rk4'
    })
    const result = gen.generate(m.sheets as any, m.parameters || [])
    expect(result.source).not.toMatch(/Error generating code for/)
    expect(result.source).toContain('_step')
  })

  test('TN Table 2B chi table continuity', () => {
    expect(TN_TABLE_2B_CHI_C.length).toBeGreaterThan(40)
    expect(TN_TABLE_2B_CHI_C[0].chi_c_deg).toBe(0)
    // Monotonic more-negative after hold (pitch over)
    const afterHold = TN_TABLE_2B_CHI_C.filter(s => s.t_s >= 12 && s.t_s <= 138)
    for (let i = 1; i < afterHold.length; i++) {
      expect(afterHold[i].chi_c_deg).toBeLessThanOrEqual(afterHold[i - 1].chi_c_deg + 1e-9)
    }
    const last = TN_TABLE_2B_CHI_C.find(s => s.t_s === 138)!
    expect(last.chi_c_deg).toBeCloseTo(-60.8349, 3)
  })

  test('exports JSON fixtures', () => {
    const dir = path.join(__dirname, '../docs/sample-models/saturn')
    fs.mkdirSync(dir, { recursive: true })
    for (const m of [
      model,
      buildSixDofVehicleBurnDemo(),
      buildSixDofOpenLoopAscent(),
      buildSixDofClosedLoopPitchRateDamp(),
      buildSixDofOpenLoopAscentWithAero(),
      buildSixDofOpenLoopChiAscent(),
      buildSixDofOpenLoopChiAscentTable2B()
    ]) {
      const data = sliceToModelData(m as any)
      const fp = path.join(dir, `${m.name}.json`)
      fs.writeFileSync(fp, JSON.stringify({ name: m.name, data }, null, 2))
      expect(fs.existsSync(fp)).toBe(true)
    }
    // Table 2B reference CSV
    const { table2bToCsv } = require('../examples/saturn-ib/as205ChiTable')
    const refDir = path.join(dir, 'as205-reference')
    fs.mkdirSync(refDir, { recursive: true })
    fs.writeFileSync(path.join(refDir, 'as205_table2b_chi.csv'), table2bToCsv())
  })
})

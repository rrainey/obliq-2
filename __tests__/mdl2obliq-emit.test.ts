/**
 * Phase 1: emit Obliq JSON from Initial Conditions (strict, no stubs).
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  buildCoverageReport,
  coverageSummary,
  emitObliqFromSystem,
  findSubsystem,
  parseMdl
} from '../src/lib/mdl2obliq'

const MDL = path.join(__dirname, '../saturn-1B/saturn_ib_stack.mdl')

describe('mdl2obliq emit Initial Conditions', () => {
  const model = parseMdl(fs.readFileSync(MDL, 'latin1'), MDL)
  const ic = findSubsystem(model.root, 'Initial Conditions')!

  test('IC system exists', () => {
    expect(ic.system).toBeDefined()
  })

  test('strict emit succeeds without MapError', () => {
    const result = emitObliqFromSystem(ic.system!, {
      modelName: 'ic_test',
      strict: true,
      // IC-only sheet has pre-existing type gaps unrelated to this suite
      validate: false,
      expandMuxVectors: false
    })
    expect(result.errors).toEqual([])
    const sheet = result.model.sheets[0]!
    expect(sheet.blocks.length).toBeGreaterThan(20)
    expect(sheet.connections.length).toBeGreaterThan(20)
    // Nested Date to JD etc. (names C-sanitized)
    const subs = sheet.blocks.filter(b => b.type === 'subsystem').map(s => s.name)
    expect(subs.some(n => /Date_to_JD/i.test(n))).toBe(true)
    expect(subs.some(n => /Inertial_Orientation/i.test(n))).toBe(true)
    expect(subs.some(n => /LLA_to_ECF/i.test(n))).toBe(true)
    expect(subs.some(n => /MES_Transform/i.test(n))).toBe(true)
    expect(subs.some(n => /T_to_GMST/i.test(n))).toBe(true)
  })

  test('no silent stub subsystems in emit', () => {
    const result = emitObliqFromSystem(ic.system!, { strict: true })
    const names: string[] = []
    const walk = (blocks: Array<{ name: string; type: string; parameters?: any }>) => {
      for (const b of blocks) {
        names.push(b.name)
        if (b.type === 'subsystem' && b.parameters?.sheets) {
          for (const sh of b.parameters.sheets) walk(sh.blocks)
        }
      }
    }
    walk(result.model.sheets[0]!.blocks)
    expect(names.some(n => /stub/i.test(n))).toBe(false)
    // Real algebra blocks present
    expect(names.some(n => n.includes('Date to JD') || n === 'T_UT1')).toBe(
      true
    )
  })

  test('coverage: Memory mapped to unit_delay; Compare to condition', () => {
    const rows = buildCoverageReport(model)
    const mem = rows.find(r => r.kind === 'BlockType' && r.key === 'Memory')
    expect(mem?.status).toBe('MAPPED')
    expect(mem?.obliqType).toBe('unit_delay')
    const cmp = rows.find(
      r => r.kind === 'SourceType' && r.key === 'Compare To Constant'
    )
    expect(cmp?.status).toBe('MAPPED')
    expect(cmp?.obliqType).toBe('condition')
    const sum = coverageSummary(rows)
    // After audit: NEED_BLOCK should be tiny (ActionPort / SwitchCase / MultiPort / …)
    expect(sum.byStatus.NEED_BLOCK).toBeLessThan(50)
    expect(sum.unmappedKeys).toEqual([])
  })

  test('Branch fan-out produces multiple logical lines', () => {
    // Demux port 1 fans to Bias + Switch in Date path
    const lines = ic.system!.lines.filter(L => L.srcBlock === 'Demux')
    expect(lines.length).toBeGreaterThanOrEqual(2)
  })

  test('Matrix(*) Product maps to matrix_multiply', () => {
    const { mapBlock } = require('../src/lib/mdl2obliq/mapper')
    const prod = ic.system!.blocks.find(b => b.name === 'Product')!
    expect(prod.params.Multiplication).toBe('Matrix(*)')
    expect(mapBlock(prod).type).toBe('matrix_multiply')
    const elem = ic.system!.blocks.find(
      b => b.blockType === 'Product' && b.params.Multiplication !== 'Matrix(*)'
    )
    // Nested IC may only have Matrix at top; if an element-wise exists, check
    if (elem) {
      expect(mapBlock(elem).type).toBe('multiply')
    }
  })

  test('six IC outports present; Xe_0 fed by matrix Product', () => {
    const result = emitObliqFromSystem(ic.system!, { strict: true })
    const sheet = result.model.sheets[0]!
    const outs = sheet.blocks
      .filter(b => b.type === 'output_port')
      .map(b => b.name)
    expect(outs).toEqual(
      expect.arrayContaining([
        'theta_GMST_0_deg',
        'ST124M_DCM',
        'q_ECI_0',
        'Xe_0_m',
        'Vb_0_mps',
        'V_ECI_0_mps'
      ])
    )
    const xe = sheet.blocks.find(b => b.name === 'Xe_0_m')!
    const feed = sheet.connections.find(c => c.targetBlockId === xe.id)!
    const src = sheet.blocks.find(b => b.id === feed.sourceBlockId)!
    expect(src.type).toBe('matrix_multiply')
    expect(src.name).toBe('Product')
  })

  test('both position paths exist as nested subsystems', () => {
    const result = emitObliqFromSystem(ic.system!, { strict: true })
    const subs = result.model.sheets[0]!.blocks
      .filter(b => b.type === 'subsystem')
      .map(b => b.name)
    // Names are sanitized to C-safe identifiers (spaces → _)
    expect(subs.some(n => /LLA_to_ECF/i.test(n))).toBe(true)
    expect(subs.some(n => /Initial_Position/i.test(n))).toBe(true)
    expect(subs.some(n => /Date_to_JD/i.test(n))).toBe(true)
    expect(subs.some(n => /T_to_GMST/i.test(n))).toBe(true)
    expect(subs.some(n => /MES_Transform/i.test(n))).toBe(true)
    expect(subs.some(n => /Inertial_Orientation/i.test(n))).toBe(true)
  })
})

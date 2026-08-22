/**
 * Phase 0: MDL parser + coverage against saturn_ib_stack.mdl
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  buildCoverageReport,
  childSubsystemNames,
  coverageSummary,
  findSubsystem,
  parseMdl,
  walkBlocks
} from '../src/lib/mdl2obliq'

const MDL = path.join(__dirname, '../saturn-1B/saturn_ib_stack.mdl')

describe('mdl2obliq parseMdl', () => {
  const text = fs.readFileSync(MDL, 'latin1')
  const model = parseMdl(text, MDL)

  test('parses Model name', () => {
    expect(model.name).toMatch(/saturn/i)
  })

  test('finds Initial Conditions with 3 in / 6 out ports in params', () => {
    const ic = findSubsystem(model.root, 'Initial Conditions')
    expect(ic).toBeDefined()
    expect(ic!.system).toBeDefined()
    expect(ic!.params.Ports).toMatch(/3/)
    const names = ic!.system!.blocks.map(b => b.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'Launch Date',
        'A_z_deg',
        'CG_LLA_deg_m',
        'Date to JD',
        'L/V Inertial Orientation',
        'MES Transform',
        'LLA to ECF'
      ])
    )
  })

  test('Initial Position name keeps newline from MDL', () => {
    const ic = findSubsystem(model.root, 'Initial Conditions')!
    const ip = ic.system!.blocks.find(b =>
      b.name.startsWith('Initial Position and Velocity')
    )
    expect(ip).toBeDefined()
    expect(ip!.name).toContain('\n')
  })

  test('Reference blocks carry SourceType', () => {
    const ic = findSubsystem(model.root, 'Initial Conditions')!
    const cross = ic.system!.blocks.find(b => b.name === '3x3 Cross Product')
    expect(cross?.blockType).toBe('Reference')
    expect(cross?.sourceType).toBe('CrossProduct')
    expect(cross?.sourceBlock).toMatch(/aerolibutil/)
  })

  test('Saturn_IB_Stack children include major stages', () => {
    const stack = findSubsystem(model.root, 'Saturn_IB_Stack')
    expect(stack?.system).toBeDefined()
    const kids = childSubsystemNames(stack!.system!)
    expect(kids).toEqual(
      expect.arrayContaining([
        'Initial Conditions',
        'S-IB Stage',
        'S-IVB Stage',
        'Saturn Instrument Unit (IU)'
      ])
    )
  })

  test('walkBlocks counts thousands of instances', () => {
    let n = 0
    walkBlocks(model.root, () => {
      n++
    })
    expect(n).toBeGreaterThan(3000)
    expect(n).toBeLessThan(5000)
  })

  test('coverage report has no surprise if catalog is seeded', () => {
    const rows = buildCoverageReport(model)
    const sum = coverageSummary(rows)
    expect(sum.instanceTotal).toBeGreaterThan(3000)
    // Reference is EXPAND — counted in BlockType
    const ref = rows.find(r => r.kind === 'BlockType' && r.key === 'Reference')
    expect(ref?.status).toBe('EXPAND')
    expect(ref!.count).toBeGreaterThan(200)
  })

  test('IC lines connect Date to JD', () => {
    const ic = findSubsystem(model.root, 'Initial Conditions')!
    const lines = ic.system!.lines
    expect(lines.length).toBeGreaterThan(10)
    const hit = lines.some(
      L =>
        L.dstBlock === 'Date to JD' ||
        L.srcBlock === 'Date to JD'
    )
    expect(hit).toBe(true)
  })
})

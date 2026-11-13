// Tidy signal labels (src/lib/layout/tidyLabels.ts, Phase 5 of
// docs/layout-improvement-plan-pass-2.md).
//
// The unit tests use a layouter that keeps the given block positions, so the
// geometry of each case is known. The FPV tests use the ELK layout of the tune.
// The equivalence test simulates the FPV Acro Rate Step model with the
// original and the tidied FPV vehicle and compares the signals and states of
// every step, bit for bit. It needs a C compiler ($CC, else cc).

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawnSync } from 'child_process'
import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'
import type { Sheet } from '@/lib/modelStore'
import {
  tidySignalLabels, labelEndpointFaults, uniqueSignalName, unitSuffix, baseSignalName, forwardPathBlocks,
  DEFAULT_TIDY_OPTIONS, type SheetLayouter, type TidyLabelOptions,
} from '@/lib/layout/tidyLabels'
import { tuneModelLayout, DEFAULT_TUNE_OPTIONS } from '@/lib/layout/tuneModelLayout'
import { buildFullPlan } from '@/lib/export/sheetTree'
import { scoreSheetLayout } from '@/lib/layout/layoutMetrics'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { normalizeGlobalSettings } from '@/lib/globalSettings'
import { simulationStepCount } from '@/lib/simulation/assertResults'
import { expandModelReferences } from '@/lib/modelReferences'
import { validateMultiSheetTypeCompatibility } from '@/lib/multiSheetTypeValidator'
import { validateModelTypeCompatibilityMultiSheet } from '@/lib/typeCompatibilityValidator'
import { propagateSignalTypesMultiSheet } from '@/lib/signalTypePropagation'
import { validateSheetLabels } from '@/lib/sheetLabelUtils'

const blk = (id: string, x: number, y: number, type = 'scale', parameters: Record<string, any> = { gain: 1 }): BlockData =>
  ({ id, type, name: id, position: { x, y }, parameters })
const sub = (id: string, x: number, y: number, inputs: string[], outputs: string[], extra: Record<string, any> = {}): BlockData =>
  ({ id, type: 'subsystem', name: id, position: { x, y }, parameters: { inputPorts: inputs, outputPorts: outputs, sheets: [], ...extra } })
const label = (id: string, kind: 'sink' | 'source', name: string, x: number, y: number): BlockData =>
  ({ id, type: `sheet_label_${kind}`, name: id, position: { x, y }, parameters: { signalName: name } })
const wire = (id: string, s: string, t: string, sp = 0, tp = 0): WireData =>
  ({ id, sourceBlockId: s, sourcePortIndex: sp, targetBlockId: t, targetPortIndex: tp })
const sheet = (id: string, blocks: BlockData[], connections: WireData[]): Sheet =>
  ({ id, name: id, blocks, connections, extents: { width: 1000, height: 800 } })

/** A layouter that keeps the stored positions: the score is that of the given drawing. */
const asDrawn: SheetLayouter = async s => s

/**
 * As asDrawn, but the blocks that the tidy adds (ids `tidy_...`) go above the
 * sheet (sinks) or below it (sources), where their wires cross nothing.
 */
const labelsAside: SheetLayouter = async s => {
  let k = 0
  return {
    connections: s.connections,
    blocks: s.blocks.map(b => {
      if (!b.id.startsWith('tidy_')) return b
      const x = 300 * k++
      return { ...b, position: b.type === 'sheet_label_sink' ? { x: 1200 + x, y: -400 } : { x: 500 + x, y: 900 } }
    }),
  }
}

/** Loose thresholds for the small hand-drawn cases. */
const SMALL: Partial<TidyLabelOptions> = {
  pairToWire: true, splitSources: true, wireMinLength: 300, wireMinCrossings: 1, minCrossingDrop: 1,
  minCrossingDropPct: 0, pairMaxLength: 250, minLengthDrop: 100, maxAreaGrowthPct: 100,
}

/**
 * A long wire S -> T. Its vertical run at x = 540 crosses the horizontal
 * wires of two other nets (P1 -> Q1 and P2 -> Q2).
 */
function crossingSheet(s: BlockData, t: BlockData, extraWires: WireData[] = []): Sheet {
  return sheet('main', [
    s, t,
    blk('P1', 200, 200), blk('Q1', 800, 200),
    blk('P2', 200, 300), blk('Q2', 800, 300),
  ], [
    wire('w_st', s.id, t.id), ...extraWires,
    wire('w_p1', 'P1', 'Q1'), wire('w_p2', 'P2', 'Q2'),
  ])
}

describe('names', () => {
  test('a unit suffix stays at the end of a unique name', () => {
    expect(unitSuffix('rate_dps')).toBe('_dps')
    expect(unitSuffix('accel_mps2')).toBe('_mps2')
    expect(unitSuffix('fc_armed')).toBe('')
    expect(uniqueSignalName('rate_dps', new Set(['rate_dps']))).toBe('rate_2_dps')
    expect(uniqueSignalName('rate_dps', new Set(['rate_dps', 'rate_2_dps']))).toBe('rate_3_dps')
    expect(uniqueSignalName('armed', new Set(['armed']))).toBe('armed_2')
    expect(uniqueSignalName('new_name', new Set(['armed']))).toBe('new_name')
  })

  test('the base name comes from the port name, and the tidy adds no unit', () => {
    expect(baseSignalName(sub('S', 0, 0, [], ['a', 'heading_deg']), 1)).toBe('heading_deg')
    expect(baseSignalName(blk('in', 0, 0, 'input_port', { portName: 'gyro_dps' }), 0)).toBe('gyro_dps')
    expect(baseSignalName({ ...blk('Split', 0, 0, 'demux'), outputs: ['a', 'b', 'c'] }, 2)).toBe('Split_3')
    expect(baseSignalName(blk('Run', 0, 0, 'evaluate'), 0)).toBe('Run')
    expect(baseSignalName(blk('9 bad name!', 0, 0), 0)).toBe('sig_9_bad_name')
  })
})

describe('B: wire to label pair', () => {
  test('a long wire that crosses other nets becomes a label pair', async () => {
    const model = [crossingSheet(blk('S', 0, 0), blk('T', 1000, 400))]
    const r = await tidySignalLabels(model, null, 'model', SMALL, asDrawn)
    expect(r.edits.map(e => e.kind)).toEqual(['wire-to-pair'])
    const s = r.sheets[0]
    const sink = s.blocks.find(b => b.type === 'sheet_label_sink')!
    const source = s.blocks.find(b => b.type === 'sheet_label_source')!
    expect(sink.parameters!.signalName).toBe('S')
    expect(source.parameters!.signalName).toBe('S')
    expect(s.connections).toContainEqual(expect.objectContaining({ sourceBlockId: 'S', targetBlockId: sink.id }))
    // The consumer wire keeps the id of the replaced wire
    expect(s.connections).toContainEqual(expect.objectContaining({ id: 'w_st', sourceBlockId: source.id, targetBlockId: 'T' }))
    expect(labelEndpointFaults(s.blocks, s.connections)).toEqual([])
  })

  test('the new name is unique in the whole model and keeps its unit suffix', async () => {
    const nested = sheet('inner', [label('far', 'source', 'out_dps', 0, 0), label('far_sink', 'sink', 'out_dps', 0, 100)], [])
    const host = { ...sub('Host', 0, 600, [], []), parameters: { inputPorts: [], outputPorts: [], sheets: [nested] } }
    const main = crossingSheet(sub('S', 0, 0, [], ['out_dps']), blk('T', 1000, 400))
    main.blocks.push(host)
    const r = await tidySignalLabels([main], null, 'sheet', SMALL, asDrawn)
    expect(r.edits).toHaveLength(1)
    expect(r.edits[0].signalName).toBe('out_2_dps')
  })

  test('an existing sink of the net is used again; only a source is added', async () => {
    const main = crossingSheet(blk('S', 0, 0), blk('T', 1000, 400), [wire('w_tag', 'S', 'tag')])
    main.blocks.push(label('tag', 'sink', 'speed_mps', 120, -60), label('reader', 'source', 'speed_mps', 120, 600))
    main.blocks.push(blk('R', 260, 600))
    main.connections.push(wire('w_r', 'reader', 'R'))
    const r = await tidySignalLabels([main], null, 'model', SMALL, asDrawn)
    expect(r.edits).toHaveLength(1)
    expect(r.edits[0].signalName).toBe('speed_mps')
    expect(r.edits[0].blocksAdded).toHaveLength(1)
    expect(r.sheets[0].blocks.filter(b => b.type === 'sheet_label_sink')).toHaveLength(1)
  })

  test('forward-path guard: the wires from controller to actuator to plant stay drawn', async () => {
    const roles = { controller: 'controller', plant: 'plant' }
    const main = crossingSheet(
      sub('Ctrl', 0, 0, ['e'], ['u'], { subsystemFunction: roles.controller }),
      sub('Plant', 1000, 400, ['u'], ['y'], { subsystemFunction: roles.plant }),
    )
    const r = await tidySignalLabels([main], null, 'model', SMALL, asDrawn)
    expect(r.edits).toEqual([])
    expect(r.sheets[0]).toBe(main)
    expect(r.refused['forward-path']).toBeGreaterThan(0)
    // A block between the two is on the forward path too
    const fp = forwardPathBlocks([wire('a', 'Ctrl', 'Mix'), wire('b', 'Mix', 'Plant'), wire('c', 'X', 'Mix')],
      new Map([['Ctrl', 'controller'], ['Plant', 'plant']]))
    expect([...fp].sort()).toEqual(['Ctrl', 'Mix', 'Plant'])
  })

  test('role-stage guard: a feedback wire from a sensor to a controller stays drawn', async () => {
    const main = crossingSheet(
      sub('Sens', 0, 0, ['x'], ['y'], { subsystemFunction: 'sensor' }),
      sub('Ctrl', 1000, 400, ['y'], ['u'], { subsystemFunction: 'controller' }),
    )
    const r = await tidySignalLabels([main], null, 'model', SMALL, asDrawn)
    expect(r.edits).toEqual([])
    expect(r.refused['role-stage']).toBeGreaterThan(0)
  })

  test('jc_0171 guard: two connected subsystems keep one drawn wire in each direction', async () => {
    // One wire A -> B: it stays
    const one = crossingSheet(sub('A', 0, 0, [], ['x']), sub('B', 1000, 400, ['x'], []))
    const r1 = await tidySignalLabels([one], null, 'model', SMALL, asDrawn)
    expect(r1.edits).toEqual([])
    expect(r1.refused.jc_0171).toBeGreaterThan(0)
    // Two wires A -> B: at most one becomes a label pair
    const two = crossingSheet(sub('A', 0, 0, [], ['x', 'z']), sub('B', 1000, 400, ['x', 'z'], []), [wire('w_st2', 'A', 'B', 1, 1)])
    const r2 = await tidySignalLabels([two], null, 'model', { ...SMALL, maxAreaGrowthPct: 1000 }, labelsAside)
    expect(r2.edits).toHaveLength(1)
    expect(r2.sheets[0].connections.filter(w => w.sourceBlockId === 'A' && w.targetBlockId === 'B')).toHaveLength(1)
  })

  test('channel guard: a wire between the return row and the forward rows stays drawn', async () => {
    const s = blk('S', 0, 0)
    const main = crossingSheet({ ...s, parameters: { ...s.parameters, flipped: true } }, blk('T', 1000, 400))
    const r = await tidySignalLabels([main], null, 'model', SMALL, asDrawn)
    expect(r.edits).toEqual([])
    expect(r.refused.channel).toBeGreaterThan(0)
  })

  test('an edit that does not remove enough crossings is not kept', async () => {
    const main = crossingSheet(blk('S', 0, 0), blk('T', 1000, 400))
    const r = await tidySignalLabels([main], null, 'model', { ...SMALL, minCrossingDrop: 3 }, asDrawn)
    expect(r.edits).toEqual([])
    expect(r.sheets[0]).toBe(main)
  })
})

describe('A: label pair to wire', () => {
  /** D -> sink "x" and a local source "x" -> C, near each other. A second top-level sheet may also read "x". */
  const pairModel = (remote: boolean): Sheet[] => {
    const s1 = sheet('s1', [
      blk('D', 0, 0), label('sink', 'sink', 'x', 120, -150), label('src', 'source', 'x', 120, 100), blk('C', 220, 0),
    ], [wire('w_d', 'D', 'sink'), wire('w_c', 'src', 'C')])
    const s2 = sheet('s2', remote ? [label('far', 'source', 'x', 0, 0), blk('E', 200, 0)] : [], remote ? [wire('w_e', 'far', 'E')] : [])
    return [s1, s2]
  }

  test('a local pair becomes a wire; the sink goes when no source needs it', async () => {
    const r = await tidySignalLabels(pairModel(false), null, 'model', SMALL, asDrawn)
    expect(r.edits.map(e => e.kind)).toEqual(['pair-to-wire'])
    const s1 = r.sheets[0]
    expect(s1.blocks.map(b => b.id).sort()).toEqual(['C', 'D'])
    expect(s1.connections).toEqual([expect.objectContaining({ id: 'w_c', sourceBlockId: 'D', targetBlockId: 'C' })])
  })

  test('scope with a remote source: the sink stays for the source on the other sheet', async () => {
    const model = pairModel(true)
    const r = await tidySignalLabels(model, null, 'model', SMALL, asDrawn)
    expect(r.edits.map(e => e.kind)).toEqual(['pair-to-wire'])
    const s1 = r.sheets[0]
    expect(s1.blocks.map(b => b.id).sort()).toEqual(['C', 'D', 'sink'])
    expect(s1.connections).toContainEqual(expect.objectContaining({ id: 'w_d', targetBlockId: 'sink' }))
    expect(r.sheets[1]).toBe(model[1])
    // The remote source still resolves
    expect(validateSheetLabels([...s1.blocks, ...r.sheets[1].blocks]).filter(i => i.type === 'unmatched_source')).toEqual([])
  })

  test('off by default', async () => {
    const r = await tidySignalLabels(pairModel(false), null, 'model', { ...SMALL, pairToWire: DEFAULT_TIDY_OPTIONS.pairToWire }, asDrawn)
    expect(DEFAULT_TIDY_OPTIONS.pairToWire).toBe(false)
    expect(r.edits).toEqual([])
  })
})

describe('C: one source for each group of consumers', () => {
  test('a source with consumers far apart is split', async () => {
    const main = sheet('main', [
      label('src', 'source', 'x', 0, 0), blk('C1', 120, 0), blk('C2', 1200, 600), blk('C3', 1200, 700),
    ], [wire('w1', 'src', 'C1'), wire('w2', 'src', 'C2'), wire('w3', 'src', 'C3')])
    const holder = sheet('other', [blk('D', 0, 0), label('sink', 'sink', 'x', 120, 0)], [wire('wd', 'D', 'sink')])
    const r = await tidySignalLabels([main, holder], null, 'model', SMALL, asDrawn)
    expect(r.edits.map(e => e.kind)).toEqual(['split-source'])
    const sources = r.sheets[0].blocks.filter(b => b.type === 'sheet_label_source')
    expect(sources).toHaveLength(2)
    expect(sources.every(b => b.parameters!.signalName === 'x')).toBe(true)
    expect(new Set(sources.map(b => b.name)).size).toBe(2)
    const second = sources.find(b => b.id !== 'src')!
    expect(r.sheets[0].connections.filter(w => w.sourceBlockId === second.id).map(w => w.id).sort()).toEqual(['w2', 'w3'])
  })
})

describe('Telemetry structure', () => {
  test('sources that feed Output Ports are not touched, with every edit kind on', async () => {
    const telemetry = sheet('telemetry', [
      label('fa', 'source', 'a', 0, 0), blk('oa', 2000, 900, 'output_port', { portName: 'a' }),
      label('fb', 'source', 'b', 0, 900), blk('ob', 2000, 0, 'output_port', { portName: 'b' }),
      label('fc', 'source', 'c', 0, 450), blk('oc1', 120, 450, 'output_port', { portName: 'c1' }), blk('oc2', 2000, 450, 'output_port', { portName: 'c2' }),
    ], [wire('wa', 'fa', 'oa'), wire('wb', 'fb', 'ob'), wire('wc1', 'fc', 'oc1'), wire('wc2', 'fc', 'oc2')])
    const main = sheet('main', [
      blk('A', 0, 0), label('ta', 'sink', 'a', 120, 0), label('tb', 'sink', 'b', 120, 100), label('tc', 'sink', 'c', 120, 200),
    ], [wire('m1', 'A', 'ta'), wire('m2', 'A', 'tb'), wire('m3', 'A', 'tc')])
    const r = await tidySignalLabels([main, telemetry], null, 'model', { ...SMALL, wireMinCrossings: 0, wireMinLength: 0 }, asDrawn)
    expect(r.edits).toEqual([])
    expect(r.sheets[1]).toBe(telemetry)
  })
})

describe('D: endpoint rule', () => {
  test('a sink must be the right-hand end of its wire, a source the left-hand end', () => {
    const ok = [blk('D', 0, 0), label('k', 'sink', 'x', 200, 0), label('s', 'source', 'x', 0, 200), blk('C', 200, 200)]
    const wires = [wire('a', 'D', 'k'), wire('b', 's', 'C')]
    expect(labelEndpointFaults(ok, wires)).toEqual([])
    // Sink left of its driver, source right of its consumer: the wires go around
    const bad = [blk('D', 400, 0), label('k', 'sink', 'x', 0, 0), label('s', 'source', 'x', 400, 200), blk('C', 0, 200)]
    expect(labelEndpointFaults(bad, wires).map(f => f.kind).sort()).toEqual(['sink', 'source'])
    // Flipped labels are the mirrored case
    const flip = (b: BlockData) => ({ ...b, parameters: { ...b.parameters, flipped: true } })
    const mirrored = [flip(blk('D', 400, 0)), flip(label('k', 'sink', 'x', 0, 0)), flip(label('s', 'source', 'x', 400, 200)), flip(blk('C', 0, 200))]
    expect(labelEndpointFaults(mirrored, wires)).toEqual([])
  })
})

// --- FPV vehicle --------------------------------------------------------------

const ROOT = path.join(__dirname, '..')
const readModel = (name: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'reference-models', name), 'utf8'))

describe('FPV vehicle', () => {
  const vehicle = readModel('fpv-vehicle.json')
  const sheets: Sheet[] = vehicle.data.sheets
  const plan = buildFullPlan(sheets).sheets
  const posHold = plan.find(s => s.name === 'PosHold')!
  const telemetry = plan.find(s => s.name === 'Telemetry')!
  const tidy = (input: Sheet[], active: string, scope: 'subsystem' | 'sheet' = 'subsystem', extra: Partial<TidyLabelOptions> = {}) =>
    tuneModelLayout(input, active, { ...DEFAULT_TUNE_OPTIONS, scope, tidySignalLabels: true, tidyLabelOptions: extra })

  let first: Awaited<ReturnType<typeof tidy>>
  beforeAll(async () => { first = await tidy(sheets, posHold.id) }, 60000)

  test('PosHold: wires become label pairs, with fewer crossings and no fault', async () => {
    const plain = await tuneModelLayout(sheets, posHold.id, { ...DEFAULT_TUNE_OPTIONS, scope: 'subsystem' })
    const score = (list: Sheet[]) => {
      const s = buildFullPlan(list).sheets.find(x => x.id === posHold.id)!
      return scoreSheetLayout(s.blocks, s.connections)
    }
    const a = score(plain.sheets), b = score(first.sheets)
    expect(b.crossings).toBeLessThan(a.crossings)
    expect([b.throughBlock, b.overlaps, b.blockOverlaps, b.diagonalSegments, b.portDirection]).toEqual([0, 0, 0, 0, 0])
    const t = first.labelTidy!
    expect(t.counts['wire-to-pair']).toBeGreaterThan(0)
    expect(t.counts['pair-to-wire'] + t.counts['split-source']).toBe(0)
    expect(t.endpointFaults).toEqual([])
    expect(t.notSettled).toEqual([])
    expect(first.summary.labelEdits).toBe(t.edits.length)
    // Each new signal name is an identifier
    const after = buildFullPlan(first.sheets).sheets.find(s => s.id === posHold.id)!
    expect(after.blocks.filter(b => b.type === 'sheet_label_sink').every(b => /^[A-Za-z][A-Za-z0-9_]*$/.test(b.parameters!.signalName))).toBe(true)
  })

  test('deterministic and idempotent', async () => {
    const again = await tidy(sheets, posHold.id)
    expect(JSON.stringify(again.sheets)).toBe(JSON.stringify(first.sheets))
    const second = await tidy(first.sheets, posHold.id)
    expect(second.labelTidy!.edits).toEqual([])
    expect(second.summary.sheetsAffected).toBe(0)
  }, 60000)

  test('Telemetry is not touched, with every edit kind on', async () => {
    const r = await tidy(sheets, telemetry.id, 'sheet', { pairToWire: true, splitSources: true, wireMinCrossings: 0, wireMinLength: 0 })
    expect(r.labelTidy!.edits).toEqual([])
    const before = telemetry
    const after = buildFullPlan(r.sheets).sheets.find(s => s.id === telemetry.id)!
    expect(after.blocks.map(b => [b.id, b.type, b.parameters?.signalName])).toEqual(before.blocks.map(b => [b.id, b.type, b.parameters?.signalName]))
    expect(after.connections.map(w => [w.sourceBlockId, w.targetBlockId])).toEqual(before.connections.map(w => [w.sourceBlockId, w.targetBlockId]))
  }, 60000)

  test('validation and type propagation give no new errors or warnings', () => {
    const checks = (list: Sheet[]) => {
      const labels = buildFullPlan(list).sheets.flatMap(s => validateSheetLabels(s.blocks).map(i => i.message)).sort()
      const multi = validateMultiSheetTypeCompatibility(list)
      const compat = validateModelTypeCompatibilityMultiSheet(list)
      const prop = propagateSignalTypesMultiSheet(list)
      return {
        labels,
        multi: [...multi.errors, ...multi.warnings].map(e => e.message).sort(),
        compat: [...compat.errors, ...compat.warnings].map(e => e.message).sort(),
        prop: prop.errors.map(e => e.message).sort(),
      }
    }
    const quiet = jest.spyOn(console, 'log').mockImplementation(() => {})
    const quietWarn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(checks(first.sheets)).toEqual(checks(sheets))
    } finally {
      quiet.mockRestore(); quietWarn.mockRestore()
    }
  })

  const hasCompiler = spawnSync(process.env.CC || 'cc', ['--version']).status === 0
  ;(hasCompiler ? test : test.skip)('simulation is the same to the bit (FPV Acro Rate Step)', () => {
    const test = readModel('fpv-acro-rate-step.json')
    const run = (vehicleSheets: Sheet[]) => {
      const data: any = expandModelReferences(test.data, (ref: any) => ({
        id: ref.modelId, name: vehicle.name, version: null, hash: 'x', data: { ...vehicle.data, sheets: vehicleSheets },
      }) as any, { rootName: test.name }).data
      const s = normalizeGlobalSettings(data.globalSettings)
      const steps = simulationStepCount(s.simulationDuration, s.simulationTimeStep)
      const quiet = jest.spyOn(console, 'log').mockImplementation(() => {})
      const quietWarn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      let r
      try {
        r = new CodeGenerator({ modelName: 'm', integrationAlgorithm: s.integrationAlgorithm, asserts: true })
          .generate(data.sheets, data.parameters || [], data.dataStores || [])
      } finally {
        quiet.mockRestore(); quietWarn.mockRestore()
      }
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obliq-tidy-'))
      try {
        const sources = ['m.c', 'main.c']
        fs.writeFileSync(path.join(dir, 'm.h'), r.header)
        fs.writeFileSync(path.join(dir, 'm.c'), r.source)
        for (const f of r.subsystemFiles || []) {
          fs.writeFileSync(path.join(dir, `${f.subsystemName}.h`), f.header)
          fs.writeFileSync(path.join(dir, `${f.subsystemName}.c`), f.source)
          sources.push(`${f.subsystemName}.c`)
        }
        // The hash covers the inputs, outputs, signals, states and data stores
        // after each step. The logger buffers after them hold heap addresses.
        fs.writeFileSync(path.join(dir, 'main.c'), `#include "m.h"
#include <stdio.h>
#include <stddef.h>
#include <stdint.h>
int main(void) {
  static m_t model;
  uint64_t h = 1469598103934665603ULL;
  m_init(&model, ${s.simulationTimeStep});
  m_seed_from_inputs(&model);
  long n = 0;
  while (n < ${steps}L) {
    m_step(&model); n++;
    const unsigned char *p = (const unsigned char *)&model;
    for (size_t i = 0; i < offsetof(m_t, enable_states); i++) { h ^= p[i]; h *= 1099511628211ULL; }
    if (m_stop_requested(&model)) break;
  }
  printf("%ld %016llx\\n", n, (unsigned long long)h);
  return 0;
}
`)
        const build = spawnSync(process.env.CC || 'cc', ['-O1', '-o', 'x', ...sources, '-lm'], { cwd: dir, encoding: 'utf8' })
        expect(build.status).toBe(0)
        return { out: spawnSync(path.join(dir, 'x'), [], { encoding: 'utf8' }).stdout.trim(), warnings: r.warnings.length }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    }
    const a = run(sheets)
    const b = run(first.sheets)
    expect(a.out).toMatch(/^6000 [0-9a-f]{16}$/)
    expect(b).toEqual(a)
  }, 120000)
})

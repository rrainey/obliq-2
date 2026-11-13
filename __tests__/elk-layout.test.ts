// ELK layout engine (src/lib/layout/elkLayout.ts).
//
// The checks use the geometry that the editor draws (layoutMetrics.ts), not
// the ELK coordinates, so they test the whole path: ELK graph, ELK result,
// rounding, and the routes that tuneModelLayout writes. The hard-metric
// golden values of the FPV model for this engine are in
// layout-metrics.test.ts (entry `fpv-vehicle:elk`).

import * as fs from 'fs'
import * as path from 'path'
import { computeElkLayout, orthogonalRoute, buildElkGraph, tieWorse } from '@/lib/layout/elkLayout'
import { tuneModelLayout, DEFAULT_TUNE_OPTIONS, type TuneLayoutOptions } from '@/lib/layout/tuneModelLayout'
import { scoreSheetLayout, scoreSheetTree, blockWireGeometry } from '@/lib/layout/layoutMetrics'
import { buildFullPlan } from '@/lib/export/sheetTree'
import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'
import type { Sheet } from '@/lib/modelStore'

const blk = (id: string, type = 'scale', parameters: Record<string, any> = { gain: 1 }, x = 0, y = 0): BlockData =>
  ({ id, type, name: id, position: { x, y }, parameters })
const wire = (id: string, s: string, t: string, sp = 0, tp = 0, routing?: WireData['routing']): WireData =>
  ({ id, sourceBlockId: s, sourcePortIndex: sp, targetBlockId: t, targetPortIndex: tp, routing })
const sheet = (blocks: BlockData[], connections: WireData[]): Sheet =>
  ({ id: 'main', name: 'Main', blocks, connections, extents: { width: 1000, height: 800 } })
const ELK: TuneLayoutOptions = { ...DEFAULT_TUNE_OPTIONS, scope: 'model', engine: 'elk' }

/** Every wire is drawn orthogonal, and its end segments are horizontal at the port y. */
function expectExactEnds(s: Sheet) {
  const byId = new Map(s.blocks.map(b => [b.id, b]))
  for (const w of s.connections) {
    const wp = w.routing?.waypoints
    if (!wp || w.targetPortIndex < 0) continue
    const src = blockWireGeometry(byId.get(w.sourceBlockId)!).sourceEnd(w.sourcePortIndex)
    const tgt = blockWireGeometry(byId.get(w.targetBlockId)!).targetEnd(w.targetPortIndex)
    expect(wp[0].y).toBe(src.y)
    expect(wp[wp.length - 1].y).toBe(tgt.y)
    const pts = [src, ...wp, tgt]
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1]
      expect(a.x === b.x || a.y === b.y).toBe(true)
    }
    // The end segments leave the source, and enter the target, in the
    // direction that each port faces (right for an output, left for an
    // input, the opposite on a flipped block)
    expect((wp[0].x - src.x) * src.dir).toBeGreaterThan(0)
    expect((wp[wp.length - 1].x - tgt.x) * tgt.dir).toBeGreaterThan(0)
  }
}

/** No two laid-out blocks overlap. */
function expectNoBlockOverlap(blocks: BlockData[]) {
  const rects = blocks.filter(b => b.type !== 'comment').map(b => ({ id: b.id, ...blockWireGeometry(b).rect }))
  const bad: string[] = []
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const p = rects[i], q = rects[j]
      if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) bad.push(`${p.id}/${q.id}`)
    }
  }
  expect(bad).toEqual([])
}

describe('orthogonalRoute', () => {
  const src = { x: 0, y: 10.4 }
  const tgt = { x: 100, y: 60.6 }

  it('puts the end bends at the exact port y and rounds the other coordinates to 0.5 px', () => {
    const elk = [{ x: 0, y: 10 }, { x: 20.3, y: 10 }, { x: 20.3, y: 90.2 }, { x: 70.1, y: 90.2 }, { x: 70.1, y: 61 }, { x: 100, y: 61 }]
    expect(orthogonalRoute(elk, src, tgt)).toEqual({
      kind: 'waypoints',
      waypoints: [{ x: 20.5, y: 10.4 }, { x: 20.5, y: 90 }, { x: 70, y: 90 }, { x: 70, y: 60.6 }],
    })
  })

  it('gives a two-bend route as a turn x', () => {
    expect(orthogonalRoute([{ x: 0, y: 10 }, { x: 40.2, y: 10 }, { x: 40.2, y: 61 }, { x: 100, y: 61 }], src, tgt))
      .toEqual({ kind: 'step', turnX: 40 })
  })

  it('gives a straight route for a jog of less than 1 px', () => {
    expect(orthogonalRoute([{ x: 0, y: 10 }, { x: 100, y: 10 }], { x: 0, y: 10.2 }, { x: 100, y: 10.6 }))
      .toEqual({ kind: 'straight' })
  })

  it('removes a run that the rounding makes zero length', () => {
    const elk = [{ x: 0, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30.1 }, { x: 30.2, y: 30.1 }, { x: 30.2, y: 61 }, { x: 100, y: 61 }]
    expect(orthogonalRoute(elk, src, tgt)).toEqual({ kind: 'step', turnX: 30 })
  })

  it('joins a run less than 2 px from the run before it, so there is no small step', () => {
    // ELK's trunk leaves the port at 10, steps 1.5 px down, then goes on (a hyperedge junction)
    const elk = [{ x: 0, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 11.5 }, { x: 70, y: 11.5 }, { x: 70, y: 61 }, { x: 100, y: 61 }]
    expect(orthogonalRoute(elk, { x: 0, y: 10 }, tgt)).toEqual({ kind: 'step', turnX: 70 })
    // Also a run less than 2 px from the end run into the target
    const late = [{ x: 0, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 59.5 }, { x: 70, y: 59.5 }, { x: 70, y: 61 }, { x: 100, y: 61 }]
    expect(orthogonalRoute(late, { x: 0, y: 10 }, { x: 100, y: 60.6 })).toEqual({ kind: 'step', turnX: 30 })
  })
})

describe('ELK graph', () => {
  it('does not read block positions, so the graph is the same wherever the blocks are', () => {
    const blocks = [blk('a', 'source', { value: 1 }, 0, 0), blk('b', 'scale', { gain: 1 }, 500, 300)]
    const moved = blocks.map(b => ({ ...b, position: { x: b.position.x + 123, y: -b.position.y } }))
    const ws = [wire('w', 'a', 'b')]
    expect(buildElkGraph(moved, ws).graph).toEqual(buildElkGraph(blocks, ws).graph)
  })

  it('puts input ports on the west side and output ports on the east side, HANDLE_OUTSET outside the block', () => {
    const { graph } = buildElkGraph([blk('a'), blk('b')], [wire('w', 'a', 'b')])
    const a = graph.children.find(n => n.id === 'n:a')!
    const b = graph.children.find(n => n.id === 'n:b')!
    expect(a.ports).toEqual([{ id: 'p:a:out:0', x: 80, y: 32, width: 6, height: 0, layoutOptions: { 'elk.port.side': 'EAST' } }])
    expect(b.ports).toEqual([{ id: 'p:b:in:0', x: -6, y: 32, width: 6, height: 0, layoutOptions: { 'elk.port.side': 'WEST' } }])
    expect(a.layoutOptions['elk.portConstraints']).toBe('FIXED_POS')
  })

  it('pins Input Ports to the first layer and Output Ports to the last', () => {
    const { graph } = buildElkGraph(
      [blk('o', 'output_port', { portName: 'y' }), blk('g'), blk('i', 'input_port', { portName: 'u' })],
      [wire('w1', 'i', 'g'), wire('w2', 'g', 'o')])
    const opt = (id: string) => graph.children.find(n => n.id === id)!.layoutOptions['elk.layered.layering.layerConstraint']
    expect(opt('n:i')).toBe('FIRST')
    expect(opt('n:o')).toBe('LAST')
    expect(opt('n:g')).toBeUndefined()
  })
})

describe('computeElkLayout', () => {
  it('does not resize blocks itself: tuneModelLayout gives it the resized blocks', async () => {
    await expect(computeElkLayout([blk('a')], [], { resizeBlocks: true })).rejects.toThrow(/does not resize/)
  })

  it('resizes subsystems with the classic fit, then lays out the sheet with the new sizes', async () => {
    // A subsystem with four outputs, each to its own block: the fit spreads the ports
    const sub = blk('sub', 'subsystem', { inputPorts: ['u'], outputPorts: ['a', 'b', 'c', 'd'], sheets: [] })
    const blocks = [blk('in', 'input_port', { portName: 'u' }), sub, blk('g0'), blk('g1'), blk('g2'), blk('g3')]
    const ws = [wire('w', 'in', 'sub'), ...[0, 1, 2, 3].map(i => wire(`o${i}`, 'sub', `g${i}`, i, 0))]
    const classic = await tuneModelLayout([sheet(blocks, ws)], 'main', { ...ELK, engine: 'classic', resizeSubsystems: true })
    const { sheets, summary } = await tuneModelLayout([sheet(blocks, ws)], 'main', { ...ELK, resizeSubsystems: true })
    expect(summary.blocksResized).toBe(1)
    const size = (s: Sheet[]) => {
      const p = s[0].blocks.find(b => b.id === 'sub')!.parameters!
      return { width: p.width, height: p.height }
    }
    expect(size(sheets)).toEqual(size(classic.sheets))
    expect(size(sheets).height).toBeGreaterThan(100)
    const m = scoreSheetLayout(sheets[0].blocks, sheets[0].connections)
    expect(m).toMatchObject({ throughBlock: 0, overlaps: 0, blockOverlaps: 0 })
    expectExactEnds(sheets[0])
  })

  it('routes a fan-out and multi-port blocks with exact orthogonal ends', async () => {
    const blocks = [
      blk('src', 'source', { value: 1 }),
      blk('sum', 'sum', { signs: '++-' }),
      blk('g1'), blk('g2'), blk('g3'),
      blk('mux', 'mux', { inputs: 3 }),
      blk('out', 'output_port', { portName: 'y' }),
    ]
    const ws = [
      wire('a', 'src', 'g1'), wire('b', 'src', 'g2'), wire('c', 'src', 'g3'),
      wire('d', 'g1', 'sum', 0, 0), wire('e', 'g2', 'sum', 0, 1), wire('f', 'g3', 'sum', 0, 2),
      wire('h', 'src', 'mux', 0, 2), wire('i', 'sum', 'mux', 0, 0), wire('j', 'g2', 'mux', 0, 1),
      wire('k', 'mux', 'out'),
    ]
    const { sheets } = await tuneModelLayout([sheet(blocks, ws)], 'main', ELK)
    const s = sheets[0]
    expectExactEnds(s)
    expectNoBlockOverlap(s.blocks)
    const m = scoreSheetLayout(s.blocks, s.connections)
    expect(m).toMatchObject({ diagonalSegments: 0, throughBlock: 0, overlaps: 0 })
    // At least one wire needs more than two bends here
    expect(s.connections.some(w => (w.routing?.waypoints?.length ?? 0) > 2)).toBe(true)
  })

  it('gives a straight wire no routing and clears a stale route', async () => {
    const ws = [wire('w', 'a', 'b', 0, 0, { waypoints: [{ x: 5, y: 5 }, { x: 5, y: 500 }] })]
    const { sheets, summary } = await tuneModelLayout([sheet([blk('a', 'source', { value: 1 }), blk('b')], ws)], 'main', ELK)
    expect(sheets[0].connections[0].routing).toBeUndefined()
    expect(summary.wiresRouted).toBe(1)
    expect(scoreSheetLayout(sheets[0].blocks, sheets[0].connections).straight).toBe(1)
  })

  it('keeps a wire between fractional port rows exactly straight (no sub-pixel step)', async () => {
    // A scale output is at y + 32; input 0 of a two-input evaluate (64 px high)
    // is at y + 21.33. ELK aligns them, so one block is at a fractional y.
    // Rounding both blocks to whole px would leave a step of 0.67 px.
    const blocks = [blk('a'), blk('b', 'evaluate', { numInputs: 2, expression: 'in(0) + in(1)' }), blk('c')]
    const ws = [wire('w', 'a', 'b', 0, 0), wire('w2', 'c', 'b', 0, 1)]
    const { sheets } = await tuneModelLayout([sheet(blocks, ws)], 'main', ELK)
    const [s0] = sheets
    const byId = new Map(s0.blocks.map(b => [b.id, b]))
    const sy = blockWireGeometry(byId.get('a')!).sourceEnd(0).y
    const ty = blockWireGeometry(byId.get('b')!).targetEnd(0).y
    expect(Math.abs(sy - ty)).toBeLessThan(1e-6)
    expect(s0.connections[0].routing).toBeUndefined()
    // The first block of the group is at a whole px
    expect(Number.isInteger(byId.get('a')!.position.y) || Number.isInteger(byId.get('b')!.position.y)).toBe(true)
    expect(scoreSheetLayout(s0.blocks, s0.connections)).toMatchObject({ microJogs: 0, diagonalSegments: 0 })
  })

  it('routes a feedback loop around the blocks into the front of the target', async () => {
    // in -> sum -> plant -> sensor -> sum (port 1)
    const blocks = [
      blk('in', 'input_port', { portName: 'r' }), blk('sum', 'sum', { signs: '+-' }),
      blk('plant', 'transfer_function', { numerator: [1], denominator: [1, 1] }), blk('sensor'),
      blk('out', 'output_port', { portName: 'y' }),
    ]
    const ws = [
      wire('r', 'in', 'sum', 0, 0), wire('e', 'sum', 'plant'), wire('y', 'plant', 'sensor'),
      wire('fb', 'sensor', 'sum', 0, 1), wire('o', 'plant', 'out'),
    ]
    const { sheets } = await tuneModelLayout([sheet(blocks, ws)], 'main', ELK)
    const s = sheets[0]
    expectExactEnds(s)
    const m = scoreSheetLayout(s.blocks, s.connections)
    expect(m).toMatchObject({ throughBlock: 0, throughOwnBlock: 0, overlaps: 0, diagonalSegments: 0, backward: 1 })
    // The feedback wire is the backward one, and it needs more than one turn
    const fb = s.connections.find(w => w.id === 'fb')!
    expect(fb.routing?.waypoints?.length).toBeGreaterThanOrEqual(4)
    // Forward order left to right: in, sum, plant, sensor
    const x = (id: string) => s.blocks.find(b => b.id === id)!.position.x
    expect(x('in')).toBeLessThan(x('sum'))
    expect(x('sum')).toBeLessThan(x('plant'))
    expect(x('plant')).toBeLessThan(x('sensor'))
  })

  it('lays out enable and reset wires but writes no route for them', async () => {
    const blocks = [
      blk('u', 'source', { value: 1 }), blk('en', 'source', { value: 1 }), blk('rst', 'source', { value: 0 }),
      blk('int', 'integrator', { initialValue: 0, showResetInput: true, showEnableInput: true }),
      blk('out', 'output_port', { portName: 'y' }),
    ]
    const ws = [
      wire('d', 'u', 'int'), wire('o', 'int', 'out'),
      wire('ce', 'en', 'int', 0, -1, { midpointOffset: 40 }), wire('cr', 'rst', 'int', 0, -2),
    ]
    const { graph, nodes } = buildElkGraph(blocks, ws)
    const node = graph.children.find(n => n.id === 'n:int')!
    // The constant `u` is a satellite on the west side: the integrator sits inside a wider node
    const host = nodes.get('int')!
    expect(host.hostX).toBeGreaterThan(0)
    expect(node.ports.find(p => p.id === 'p:int:enable:0')).toMatchObject({ x: host.hostX + 40, y: -6, layoutOptions: { 'elk.port.side': 'NORTH' } })
    expect(node.ports.find(p => p.id === 'p:int:reset:0')).toMatchObject({ x: host.hostX + 40, y: node.height, layoutOptions: { 'elk.port.side': 'SOUTH' } })

    const { sheets } = await tuneModelLayout([sheet(blocks, ws)], 'main', ELK)
    const s = sheets[0]
    expect(s.connections.find(w => w.id === 'ce')!.routing).toBeUndefined()
    expect(s.connections.find(w => w.id === 'cr')!.routing).toBeUndefined()
    expectNoBlockOverlap(s.blocks)
    const x = (id: string) => s.blocks.find(b => b.id === id)!.position.x
    // The control sources are placed before the block they control
    expect(x('en')).toBeLessThan(x('int'))
    expect(x('rst')).toBeLessThan(x('int'))
  })

  it('does not move comment blocks', async () => {
    const note = blk('note', 'comment', { text: 'hello' }, 1234, 567)
    const { sheets } = await tuneModelLayout(
      [sheet([blk('a', 'source', { value: 1 }, 900, 900), note, blk('b', 'scale', { gain: 1 }, 0, 0)], [wire('w', 'a', 'b')])],
      'main', ELK)
    expect(sheets[0].blocks.find(b => b.id === 'note')).toBe(note)
  })

  it('packs disconnected parts of a sheet without overlap', async () => {
    const blocks = [
      blk('a1', 'source', { value: 1 }), blk('a2'), blk('a3'),
      blk('b1', 'source', { value: 2 }), blk('b2'),
      blk('lonely', 'scale', { gain: 3 }),
      blk('c1', 'source', { value: 3 }), blk('c2', 'signal_display', {}),
    ]
    const ws = [wire('x1', 'a1', 'a2'), wire('x2', 'a2', 'a3'), wire('y1', 'b1', 'b2'), wire('z1', 'c1', 'c2')]
    // Start with all blocks on top of each other
    const { sheets, summary } = await tuneModelLayout([sheet(blocks, ws)], 'main', ELK)
    expect(summary.blocksMoved).toBeGreaterThanOrEqual(blocks.length - 1)
    expectNoBlockOverlap(sheets[0].blocks)
    const m = scoreSheetLayout(sheets[0].blocks, sheets[0].connections)
    expect(m).toMatchObject({ throughBlock: 0, overlaps: 0, crossings: 0, straight: 4 })
  })

  it('is idempotent: a second layout changes nothing', async () => {
    const blocks = [
      blk('in', 'input_port', { portName: 'r' }), blk('sum', 'sum', { signs: '+-' }),
      blk('k', 'scale', { gain: 2 }), blk('plant', 'integrator', { initialValue: 0 }),
      blk('out', 'output_port', { portName: 'y' }), blk('d', 'signal_display', {}),
    ]
    const ws = [
      wire('r', 'in', 'sum', 0, 0), wire('e', 'sum', 'k'), wire('u', 'k', 'plant'),
      wire('y', 'plant', 'out'), wire('fb', 'plant', 'sum', 0, 1), wire('dd', 'k', 'd'),
    ]
    const first = await tuneModelLayout([sheet(blocks, ws)], 'main', ELK)
    const second = await tuneModelLayout(first.sheets, 'main', ELK)
    expect(second.summary).toMatchObject({ blocksMoved: 0, wiresRouted: 0, sheetsAffected: 0 })
    expect(second.sheets[0]).toBe(first.sheets[0])
  })
})

describe('tie rule of the satellite candidates', () => {
  // a: all satellites; b: Sheet Label satellites only. Both have the same crossings.
  const m = (v: Partial<ReturnType<typeof scoreSheetLayout>>) => ({
    ...scoreSheetLayout([], []), crossings: 11, bends: 30, wireLength: 4000, width: 1000, height: 300, ...v,
  })

  it('prefers fewer bends, then shorter wires, then smaller area', () => {
    expect(tieWorse(m({ bends: 32 }), m({ bends: 30, wireLength: 9000 }))).toBe(true)
    expect(tieWorse(m({ bends: 30 }), m({ bends: 32, wireLength: 100 }))).toBe(false)
    expect(tieWorse(m({ wireLength: 4001 }), m({ width: 5000 }))).toBe(true)
    expect(tieWorse(m({ wireLength: 3999 }), m({ width: 10 }))).toBe(false)
    expect(tieWorse(m({ width: 1001 }), m({}))).toBe(true)
    expect(tieWorse(m({ height: 299 }), m({}))).toBe(false)
  })

  it('keeps the candidate with all satellites on a full tie or when a candidate has a hard fault', () => {
    expect(tieWorse(m({}), m({}))).toBe(false)
    expect(tieWorse(m({ bends: 40 }), m({ overlaps: 1 }))).toBe(false)
    expect(tieWorse(m({ bends: 40, microJogs: 1 }), m({}))).toBe(false)
    expect(tieWorse(m({ bends: 40 }), m({ portDirection: 1 }))).toBe(false)
  })
})

describe('ELK layout of the FPV vehicle', () => {
  const modelPath = path.join(__dirname, '..', 'reference-models', 'fpv-vehicle.json')
  let original: Sheet[]
  let first: Awaited<ReturnType<typeof tuneModelLayout>>

  beforeAll(async () => {
    const raw = JSON.parse(fs.readFileSync(modelPath, 'utf8'))
    original = (raw.data ?? raw).sheets
    first = await tuneModelLayout(original, null, ELK)
  })

  it('has no diagonal segment, exact wire ends and no block overlap on any sheet', () => {
    for (const s of buildFullPlan(first.sheets).sheets) {
      expectExactEnds({ id: s.id, name: s.name, blocks: s.blocks, connections: s.connections, extents: { width: 0, height: 0 } })
      expectNoBlockOverlap(s.blocks)
    }
    const scores = scoreSheetTree(first.sheets)
    expect(scores.map(s => [s.path.join('/'), s.metrics.diagonalSegments]).filter(([, d]) => d !== 0)).toEqual([])
    // No small visible step (two bends less than 2 px apart, or a bend that near a wire end)
    expect(scores.map(s => [s.path.join('/'), s.metrics.microJogs]).filter(([, d]) => d !== 0)).toEqual([])
    expect(scores.reduce((n, s) => n + s.metrics.throughBlock, 0)).toBe(0)
    // The end checks above saw many waypoint routes
    const routed = buildFullPlan(first.sheets).sheets.flatMap(s => s.connections).filter(w => w.routing?.waypoints?.length)
    expect(routed.length).toBeGreaterThan(300)
  })

  it('Mixer: on the crossing tie, keeps the candidate with fewer bends (constants in the ELK graph)', () => {
    const mixer = scoreSheetTree(first.sheets).find(s => s.path.join('/') === 'Main/FlightController/FlightController/Mixer/Mixer')!
    expect(mixer.metrics).toMatchObject({ crossings: 11, bends: 30, straight: 15, width: 1968, height: 288 })
  })

  it('is idempotent on the whole model', async () => {
    const second = await tuneModelLayout(first.sheets, null, ELK)
    expect(second.summary).toMatchObject({ blocksMoved: 0, wiresRouted: 0, sheetsAffected: 0 })
  })
})

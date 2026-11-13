// Satellite blocks of the ELK layout (src/lib/layout/satellites.ts and
// elkLayout.ts, Phase 2 of docs/layout-improvement-plan-pass-2.md).
//
// The geometry checks use the shapes that the editor draws (layoutMetrics.ts):
// block rectangles, the 12 px name label above a block, and the wire polylines.

import * as fs from 'fs'
import * as path from 'path'
import { findSatellites, arrangeSide, BLOCK_NAME_HEIGHT, type SidePort, type SatelliteGeometry } from '@/lib/layout/satellites'
import { buildElkGraph, computeElkLayout, applyToSheet, chooseOutputPorts } from '@/lib/layout/elkLayout'
import { tuneModelLayout, DEFAULT_TUNE_OPTIONS, type TuneLayoutOptions } from '@/lib/layout/tuneModelLayout'
import { scoreSheetLayout, blockWireGeometry, wirePolyline } from '@/lib/layout/layoutMetrics'
import { buildFullPlan } from '@/lib/export/sheetTree'
import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'
import type { Sheet } from '@/lib/modelStore'

const blk = (id: string, type = 'scale', parameters: Record<string, any> = { gain: 1 }): BlockData =>
  ({ id, type, name: id, position: { x: 0, y: 0 }, parameters })
const label = (id: string, type: 'sheet_label_sink' | 'sheet_label_source' = 'sheet_label_sink') =>
  blk(id, type, { signalName: id })
const wire = (id: string, s: string, t: string, sp = 0, tp = 0): WireData =>
  ({ id, sourceBlockId: s, sourcePortIndex: sp, targetBlockId: t, targetPortIndex: tp })
const sheet = (blocks: BlockData[], connections: WireData[]): Sheet =>
  ({ id: 'main', name: 'Main', blocks, connections, extents: { width: 1000, height: 800 } })
const ELK: TuneLayoutOptions = { ...DEFAULT_TUNE_OPTIONS, scope: 'model', engine: 'elk' }
/** A subsystem with `n` outputs and no stored size. */
const sub = (id: string, n: number, inputs = 1) =>
  blk(id, 'subsystem', { inputPorts: Array.from({ length: inputs }, (_, i) => `u${i}`), outputPorts: Array.from({ length: n }, (_, i) => `y${i}`), sheets: [] })

interface Rect { x: number; y: number; w: number; h: number }
const overlaps = (p: Rect, q: Rect, gap = 0) =>
  p.x < q.x + q.w + gap && q.x < p.x + p.w + gap && p.y < q.y + q.h + gap && q.y < p.y + p.h + gap
const nameRect = (b: BlockData): Rect | null => {
  if (b.type === 'no_connection' || b.type === 'subsystem' || b.parameters?.showName === false) return null
  const r = blockWireGeometry(b).rect
  return { x: r.x, y: r.y - BLOCK_NAME_HEIGHT, w: r.w, h: BLOCK_NAME_HEIGHT }
}

/** True when the segment a-b (horizontal or vertical) runs through the inside of r. */
function segmentHits(a: { x: number; y: number }, b: { x: number; y: number }, r: Rect): boolean {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y)
  return x0 < r.x + r.w - 0.5 && x1 > r.x + 0.5 && y0 < r.y + r.h - 0.5 && y1 > r.y + 0.5
}

/**
 * The satellite checks on a laid-out sheet:
 *   - each satellite wire that has no routing is straight (a jog of less than 1 px);
 *   - no satellite, or its name label, overlaps another block or its name label;
 *   - no wire runs through a satellite or its name label, except the satellite's own wire at its end.
 * Returns the number of straight satellite wires.
 */
function checkSatellites(blocks: BlockData[], wires: WireData[], satelliteIds: Set<string>): { straight: number; total: number } {
  const byId = new Map(blocks.map(b => [b.id, b]))
  const problems: string[] = []
  let straight = 0, total = 0
  const shapes = new Map<string, Rect[]>()
  for (const b of blocks) {
    if (b.type === 'comment') continue
    const name = nameRect(b)
    shapes.set(b.id, [blockWireGeometry(b).rect, ...(name ? [name] : [])])
  }
  for (const id of satelliteIds) {
    for (const [other, rects] of shapes) {
      if (other === id) continue
      for (const p of shapes.get(id)!) for (const q of rects) if (overlaps(p, q)) problems.push(`${id} overlaps ${other}`)
    }
  }
  for (const w of wires) {
    if (w.targetPortIndex < 0) continue
    const a = byId.get(w.sourceBlockId)!, b = byId.get(w.targetBlockId)!
    const pts = wirePolyline(blockWireGeometry(a).sourceEnd(w.sourcePortIndex), blockWireGeometry(b).targetEnd(w.targetPortIndex), w.routing)
    if (satelliteIds.has(a.id) || satelliteIds.has(b.id)) {
      total++
      if (!w.routing && Math.abs(pts[0].y - pts[pts.length - 1].y) < 1) straight++
    }
    for (const id of satelliteIds) {
      if (id === a.id || id === b.id) continue
      for (const r of shapes.get(id)!) {
        for (let i = 0; i + 1 < pts.length; i++) if (segmentHits(pts[i], pts[i + 1], r)) problems.push(`wire ${w.id} through ${id}`)
      }
    }
  }
  expect([...new Set(problems)]).toEqual([])
  return { straight, total }
}

async function layOut(blocks: BlockData[], wires: WireData[]) {
  const { sheets } = await tuneModelLayout([sheet(blocks, wires)], 'main', ELK)
  return sheets[0]
}

describe('findSatellites', () => {
  it('finds leaf blocks with one wire, on the side of their host port', () => {
    const blocks = [blk('k', 'source', { value: 2 }), blk('g'), label('out'), blk('d', 'signal_display', {})]
    const ws = [wire('a', 'k', 'g'), wire('b', 'g', 'out'), wire('c', 'g', 'd')]
    const { satellites, kept } = findSatellites(blocks, ws)
    expect(satellites.get('k')).toMatchObject({ hostId: 'g', side: 'west', hostPort: 0, shared: false })
    // `out` is the first satellite on g's output; the display is a second one on the same port
    // The display stays in the graph, so the label's net is shared
    expect(satellites.get('out')).toMatchObject({ hostId: 'g', side: 'east', hostPort: 0, shared: true })
    expect(satellites.has('d')).toBe(false)
    expect(kept).toEqual([{ id: 'd', reason: 'second-on-port' }])
  })

  it('does not use input ports, output ports, subsystems or blocks with two wires', () => {
    const blocks = [blk('in', 'input_port', { portName: 'u' }), blk('g'), blk('o', 'output_port', { portName: 'y' }),
      sub('s', 1), blk('k', 'source', { value: 1 }), blk('m', 'sum', { signs: '++' })]
    const ws = [wire('a', 'in', 'g'), wire('b', 'g', 'o'), wire('c', 'g', 's'), wire('d', 'k', 'm', 0, 0), wire('e', 'k', 'm', 0, 1)]
    expect(findSatellites(blocks, ws).satellites.size).toBe(0)
  })

  it('keeps a pair of candidates and control wires in the graph', () => {
    const blocks = [label('src', 'sheet_label_source'), blk('disp', 'signal_display', {}),
      blk('en', 'source', { value: 1 }), blk('int', 'integrator', { initialValue: 0, showEnableInput: true })]
    const ws = [wire('a', 'src', 'disp'), wire('b', 'en', 'int', 0, -1)]
    const { satellites, kept } = findSatellites(blocks, ws)
    expect(satellites.size).toBe(0)
    expect(kept.map(k => k.reason).sort()).toEqual(['control', 'pair', 'pair'])
  })

  it('marks a sink satellite whose host port also feeds other blocks as shared', () => {
    const blocks = [blk('g'), label('tag'), blk('h')]
    const { satellites } = findSatellites(blocks, [wire('a', 'g', 'tag'), wire('b', 'g', 'h')])
    expect(satellites.get('tag')!.shared).toBe(true)
  })
})

describe('arrangeSide', () => {
  const g = (id: string, nameHeight = BLOCK_NAME_HEIGHT): SatelliteGeometry =>
    ({ id, width: 80, height: 64, portY: 32, nameHeight, nameOverhang: 0 })
  const ports = (pitch: number, n: number, through: (i: number) => boolean = () => false): SidePort[] =>
    Array.from({ length: n }, (_, i) => ({ port: i, y: pitch * (i + 1), satellite: g(`s${i}`), through: through(i) }))

  it('keeps every wire straight in one sub-column when the ports are far apart', () => {
    const a = arrangeSide(ports(100, 4), 500)
    expect(a.pattern.columns).toBe(1)
    expect(a.satellites.map(s => s.row)).toEqual([100, 200, 300, 400])
    expect(a.satellites.every(s => s.turnU === undefined)).toBe(true)
    expect(a.jogs).toEqual({ satellites: 0, lanes: 0 })
  })

  it('staggers across two sub-columns with straight wires at a 50 px port pitch', () => {
    // One column would need 64 + 12 + 8 = 84 px a satellite. Two columns
    // need 32 + 6 below a nearer satellite and 32 + 12 + 6 above one.
    const a = arrangeSide(ports(50, 6), 350)
    expect(a.pattern.columns).toBe(2)
    expect(a.jogs.satellites).toBe(0)
    expect(a.satellites.map(s => s.column)).toEqual([0, 1, 0, 1, 0, 1])
    // A sub-column is the same distance from the host for each of its satellites
    const u0 = a.satellites.filter(s => s.column === 0).map(s => s.u)
    expect(new Set(u0).size).toBe(1)
  })

  it('fans out the wires of ports that are too close, without crossings', () => {
    const a = arrangeSide(ports(8, 10), 88)
    const rows = a.satellites.map(s => s.row)
    // In port order, and spread wider than the host
    for (let i = 1; i < rows.length; i++) expect(rows[i]).toBeGreaterThan(rows[i - 1])
    expect(a.bottom - a.top).toBeGreaterThan(88)
    // Wires that go up turn nearer the higher they are; wires that go down, the lower they are
    const up = a.satellites.filter((s, i) => s.row < 8 * (i + 1))
    const down = a.satellites.filter((s, i) => s.row > 8 * (i + 1))
    for (let i = 1; i < up.length; i++) expect(up[i].turnU!).toBeGreaterThan(up[i - 1].turnU!)
    for (let i = 1; i < down.length; i++) expect(down[i].turnU!).toBeLessThan(down[i - 1].turnU!)
  })

  it('is deterministic', () => {
    expect(arrangeSide(ports(21, 7), 160)).toEqual(arrangeSide(ports(21, 7), 160))
  })

  it('keeps a through wire straight and moves the satellite instead', () => {
    // Port 0 has a constant; port 1 is fed from the ELK graph. The constant does not fit at a 21 px pitch.
    const a = arrangeSide([
      { port: 0, y: 21.3, satellite: g('k'), through: false },
      { port: 1, y: 42.7, through: true },
    ], 64)
    expect(a.lanes.get(1)!.row).toBe(42.7)
    expect(a.jogs).toEqual({ satellites: 1, lanes: 0 })
    // The lane clears the satellite box by the clearance
    const s = a.satellites[0]
    expect(42.7 - (s.top + 64)).toBeGreaterThanOrEqual(6 - 0.5)
  })

  it('gives a shared net a branch from a junction in front of its satellite', () => {
    const a = arrangeSide(ports(50, 3, i => i === 1), 200)
    const lane = a.lanes.get(1)!
    const sat = a.satellites.find(s => s.id === 's1')!
    // Path: wire end, junction on the satellite row, branch row, node border
    const junction = lane.path[lane.path.length - 3]
    expect(junction.y).toBe(sat.row)
    expect(junction.u).toBeLessThan(sat.u - 6)
    expect(lane.path[lane.path.length - 1]).toEqual({ u: a.width, y: lane.row })
    // The branch clears the satellite box or its name label
    const clear = lane.row > sat.row ? lane.row - (sat.top + 64) : (sat.top - BLOCK_NAME_HEIGHT) - lane.row
    expect(clear).toBeGreaterThanOrEqual(6 - 0.5)
  })
})

describe('satellite placement in the ELK layout', () => {
  it('puts sink labels right of the host and source labels left of it, with straight wires', async () => {
    const blocks = [label('a', 'sheet_label_source'), blk('g'), label('b')]
    const ws = [wire('w1', 'a', 'g'), wire('w2', 'g', 'b')]
    const s = await layOut(blocks, ws)
    const x = (id: string) => s.blocks.find(b => b.id === id)!.position.x
    expect(x('a')).toBeLessThan(x('g'))
    expect(x('b')).toBeGreaterThan(x('g'))
    expect(checkSatellites(s.blocks, s.connections, new Set(['a', 'b']))).toEqual({ straight: 2, total: 2 })
    expect(s.connections.every(w => !w.routing)).toBe(true)
  })

  it('staggers many labels of a crowded host without overlaps or wires through labels', async () => {
    const host = sub('fc', 12)
    const labels = Array.from({ length: 12 }, (_, i) => label(`t${i}`))
    const ws = labels.map((l, i) => wire(`w${i}`, 'fc', l.id, i, 0))
    const s = await layOut([blk('in', 'input_port', { portName: 'u' }), host, ...labels], [wire('u', 'in', 'fc'), ...ws])
    checkSatellites(s.blocks, s.connections, new Set(labels.map(l => l.id)))
    const m = scoreSheetLayout(s.blocks, s.connections)
    expect(m).toMatchObject({ crossings: 0, throughBlock: 0, overlaps: 0, blockOverlaps: 0 })
    // More than one sub-column: the labels are not one tall stack
    expect(new Set(labels.map(l => s.blocks.find(b => b.id === l.id)!.position.x)).size).toBeGreaterThan(1)
  })

  it('keeps a shared label beside its host and routes the other branch from a junction', async () => {
    const blocks = [blk('src', 'source', { value: 1 }), blk('g'), label('tag'), blk('h'), blk('o', 'output_port', { portName: 'y' })]
    const ws = [wire('a', 'src', 'g'), wire('b', 'g', 'tag'), wire('c', 'g', 'h'), wire('d', 'h', 'o')]
    const conversion = buildElkGraph(blocks, ws)
    expect(conversion.satellites.get('tag')!.shared).toBe(true)
    const s = await layOut(blocks, ws)
    expect(checkSatellites(s.blocks, s.connections, new Set(['src', 'tag']))).toMatchObject({ straight: 2 })
    // The branch to h leaves the label's row in front of the label (checkSatellites: not through it)
    const branch = s.connections.find(w => w.id === 'c')!
    expect(branch.routing).toBeDefined()
    const tagX = s.blocks.find(b => b.id === 'tag')!.position.x
    const g = blockWireGeometry(s.blocks.find(b => b.id === 'g')!).sourceEnd(0)
    const h = blockWireGeometry(s.blocks.find(b => b.id === 'h')!).targetEnd(0)
    const firstTurn = wirePolyline(g, h, branch.routing)[1]
    expect(firstTurn.y).toBe(g.y)
    expect(firstTurn.x).toBeLessThan(tagX - 6)
    expect(scoreSheetLayout(s.blocks, s.connections)).toMatchObject({ throughBlock: 0, overlaps: 0, blockOverlaps: 0 })
  })

  it('is idempotent', async () => {
    const blocks = [sub('fc', 6), ...Array.from({ length: 6 }, (_, i) => label(`t${i}`)), blk('k', 'source', { value: 3 }), blk('m', 'multiply', { inputs: 2 })]
    const ws = [...Array.from({ length: 6 }, (_, i) => wire(`w${i}`, 'fc', `t${i}`, i, 0)), wire('x', 'k', 'm', 0, 0), wire('y', 'fc', 'm', 0, 1)]
    const first = await tuneModelLayout([sheet(blocks, ws)], 'main', ELK)
    const second = await tuneModelLayout(first.sheets, 'main', ELK)
    expect(second.summary).toMatchObject({ blocksMoved: 0, wiresRouted: 0, sheetsAffected: 0 })
  })

  it('can leave satellites in the graph', async () => {
    const blocks = [label('a', 'sheet_label_source'), blk('g')]
    expect(buildElkGraph(blocks, [wire('w', 'a', 'g')], {}, 'flow', { satellites: false }).graph.children).toHaveLength(2)
    expect(buildElkGraph(blocks, [wire('w', 'a', 'g')]).graph.children).toHaveLength(1)
  })
})

describe('Output Ports beside their hosts (outputPorts)', () => {
  // in -> S; S.y0 -> g -> og; S.y1 -> o1
  // S is tall (ports 67 px apart), so that the two satellites on its outputs fit on straight wires
  const tall = sub('S', 2)
  tall.parameters = { ...tall.parameters, width: 120, height: 200 }
  const blocks = [blk('in', 'input_port', { portName: 'u' }), tall, blk('g'), blk('og', 'output_port', { portName: 'a' }), blk('o1', 'output_port', { portName: 'b' })]
  const ws = [wire('w0', 'in', 'S'), wire('w1', 'S', 'g'), wire('w2', 'g', 'og'), wire('w3', 'S', 'o1', 1)]
  const laid = async (outputPorts: 'column' | 'beside' | 'auto') => {
    const layout = await computeElkLayout(blocks, ws, { outputPorts })
    return applyToSheet(blocks, ws, layout)
  }
  const x = (list: BlockData[], id: string) => list.find(b => b.id === id)!.position.x

  it('column: an Output Port is in a layer after the blocks before it, not beside its host', async () => {
    // ELK puts the Output Ports in the last layer; the post-compaction can then move a port to the left
    const [b] = await laid('column')
    expect(x(b, 'o1')).toBeGreaterThan(x(b, 'g'))
  })

  it('beside: an Output Port with one wire is a satellite beside its host port, on a straight wire', async () => {
    expect(buildElkGraph(blocks, ws, {}, 'flow', { outputPortSatellites: true }).satellites.get('o1')).toMatchObject({ hostId: 'S', hostPort: 1, side: 'east' })
    expect(buildElkGraph(blocks, ws).satellites.has('o1')).toBe(false)
    const [b, w] = await laid('beside')
    expect(x(b, 'o1')).toBeLessThan(x(b, 'g'))
    expect(checkSatellites(b, w, new Set(['o1', 'og']))).toMatchObject({ straight: 2, total: 2 })
  })

  it('auto: keeps the right column when the crossings are equal', async () => {
    expect(await laid('auto')).toEqual(await laid('column'))
    expect(await computeElkLayout(blocks, ws)).toEqual(await computeElkLayout(blocks, ws, { outputPorts: 'column' }))
  })

  it('auto rule: beside only with fewer crossings and no hard fault', () => {
    const score = (crossings: number, extra: Partial<ReturnType<typeof scoreSheetLayout>> = {}) =>
      ({ ...scoreSheetLayout([], []), crossings, ...extra })
    expect(chooseOutputPorts(score(5), score(4))).toBe(true)
    expect(chooseOutputPorts(score(5), score(5))).toBe(false)
    expect(chooseOutputPorts(score(5), score(6))).toBe(false)
    expect(chooseOutputPorts(score(5), score(1, { throughBlock: 1 }))).toBe(false)
    expect(chooseOutputPorts(score(5), score(1, { microJogs: 1 }))).toBe(false)
    expect(chooseOutputPorts(score(1, { overlaps: 1 }), score(9))).toBe(true)
  })
})

describe('grid of a pass-through sheet', () => {
  const pairs = (n: number) => {
    const blocks: BlockData[] = []
    const ws: WireData[] = []
    for (let i = 0; i < n; i++) {
      blocks.push(label(`l${i}`, 'sheet_label_source'), blk(`o${i}`, 'output_port', { portName: `sig${i}` }))
      ws.push(wire(`w${i}`, `l${i}`, `o${i}`))
    }
    return { blocks, ws }
  }

  it('puts the pairs in model order, top to bottom and then the next column, near the page aspect', async () => {
    const { blocks, ws } = pairs(20)
    const layout = await computeElkLayout(blocks, ws)
    const [laid, wired] = applyToSheet(blocks, ws, layout)
    const pos = new Map(laid.map(b => [b.id, b.position]))
    const xs = [...new Set(Array.from({ length: 20 }, (_, i) => pos.get(`o${i}`)!.x))]
    const columns = xs.length
    expect(columns).toBeGreaterThan(1)
    const rows = Math.ceil(20 / columns)
    for (let i = 0; i < 20; i++) {
      const c = Math.floor(i / rows), r = i % rows
      // Output Ports of one column align; columns go left to right, rows top to bottom
      expect(pos.get(`o${i}`)!.x).toBe(pos.get(`o${c * rows}`)!.x)
      if (r > 0) expect(pos.get(`o${i}`)!.y).toBeGreaterThan(pos.get(`o${i - 1}`)!.y)
    }
    const m = scoreSheetLayout(laid, wired)
    expect(m).toMatchObject({ straight: 20, blockOverlaps: 0, throughBlock: 0 })
    expect(m.aspect).toBeGreaterThan(0.9)
    expect(m.aspect).toBeLessThan(2.2)
    checkSatellites(laid, wired, new Set(Array.from({ length: 20 }, (_, i) => `l${i}`)))
  })

  it('keeps the ELK packing for a sheet with a larger part', async () => {
    const { blocks, ws } = pairs(3)
    blocks.push(blk('a'), blk('b'), blk('c'), blk('d'))
    ws.push(wire('x1', 'a', 'b'), wire('x2', 'b', 'c'), wire('x3', 'c', 'd'))
    const grid = await computeElkLayout(blocks, ws, { pack: 'grid' })
    const auto = await computeElkLayout(blocks, ws)
    const elk = await computeElkLayout(blocks, ws, { pack: 'elk' })
    expect(auto).toEqual(elk)
    expect(grid).not.toEqual(elk)
  })
})

describe('satellites on the FPV vehicle', () => {
  const modelPath = path.join(__dirname, '..', 'reference-models', 'fpv-vehicle.json')
  let tuned: Sheet[]

  beforeAll(async () => {
    const raw = JSON.parse(fs.readFileSync(modelPath, 'utf8'))
    tuned = (await tuneModelLayout((raw.data ?? raw).sheets, null, ELK)).sheets
  })

  it('places the satellites without overlaps, collisions with name labels or wires through them', () => {
    let satellites = 0
    for (const s of buildFullPlan(tuned).sheets) {
      // Main keeps its Output Ports beside their hosts (outputPorts `auto`)
      const ids = new Set(buildElkGraph(s.blocks, s.connections, {}, 'flow', { outputPortSatellites: s.path.join('/') === 'Main' }).satellites.keys())
      satellites += ids.size
      checkSatellites(s.blocks, s.connections, ids)
      expect(scoreSheetLayout(s.blocks, s.connections)).toMatchObject({ throughBlock: 0, overlaps: 0, blockOverlaps: 0 })
    }
    // 24 constants and the 41 Output Ports of Main
    expect(satellites).toBeGreaterThan(60)
  })

  it('meets the Phase 2 size target on Main', async () => {
    // The target is for the layout without the mirrored return row (Phase 4
    // adds a row below Main's forward path, which makes Main taller)
    const raw = JSON.parse(fs.readFileSync(modelPath, 'utf8'))
    const flat = (await tuneModelLayout((raw.data ?? raw).sheets, null, { ...ELK, mirrorReturnPath: false })).sheets
    const main = buildFullPlan(flat).sheets.find(s => s.path.join('/') === 'Main')!
    expect(scoreSheetLayout(main.blocks, main.connections).height).toBeLessThan(2400)
  })
})

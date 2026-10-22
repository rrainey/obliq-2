/**
 * Wire turn routing: where each wire's vertical segment goes.
 */
import { routeWires, type RoutableWire, type RoutingRect } from '@/lib/layout/wireRouting'
import { computeAutoLayout } from '@/lib/layout/autoLayout'
import { tuneModelLayout, DEFAULT_TUNE_OPTIONS } from '@/lib/layout/tuneModelLayout'
import { HANDLE_OUTSET } from '@/lib/layout/blockGeometry'
import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'
import type { Sheet } from '@/lib/modelStore'

const block = (id: string, type: string, parameters: Record<string, any> = {}, y = 0): BlockData =>
  ({ id, type, name: id, position: { x: 0, y }, parameters })
const wire = (id: string, s: string, sp: number, t: string, tp: number, routing?: WireData['routing']): WireData =>
  ({ id, sourceBlockId: s, sourcePortIndex: sp, targetBlockId: t, targetPortIndex: tp, ...(routing ? { routing } : {}) })

/** Count crossings between drawn H-V-H wires (different nets only). */
function crossings(wires: RoutableWire[], turnX: Map<string, number>): number {
  type S = { net: string; h: boolean; at: number; a: number; b: number }
  const segs: S[] = []
  for (const w of wires) {
    const t = turnX.get(w.id) ?? (w.x1 + w.x2) / 2
    segs.push({ net: w.net, h: true, at: w.y1, a: Math.min(w.x1, t), b: Math.max(w.x1, t) })
    segs.push({ net: w.net, h: true, at: w.y2, a: Math.min(t, w.x2), b: Math.max(t, w.x2) })
    segs.push({ net: w.net, h: false, at: t, a: Math.min(w.y1, w.y2), b: Math.max(w.y1, w.y2) })
  }
  let n = 0
  for (const p of segs) for (const q of segs) {
    if (!p.h || q.h || p.net === q.net) continue
    if (q.at > p.a + 0.5 && q.at < p.b - 0.5 && p.at > q.a + 0.5 && p.at < q.b - 0.5) n++
  }
  return n
}

describe('routeWires', () => {
  // Two columns of blocks with one gap between them (x 100..300).
  const columns = [{ left: 0, right: 100 }, { left: 300, right: 400 }]
  const rects = new Map<string, RoutingRect>([
    ['src', { x: 0, y: 0, w: 100, h: 200 }],
    ['t0', { x: 300, y: 100, w: 100, h: 40 }],
    ['t1', { x: 300, y: 200, w: 100, h: 40 }],
    ['t2', { x: 300, y: 300, w: 100, h: 40 }],
  ])
  // Three outputs of one block (y 50/100/150) each going down to its own target.
  const fan = (ys: number[]): RoutableWire[] => ys.map((y1, i) => ({
    id: `w${i}`, net: `src:${i}`, src: 'src', tgt: `t${i}`, srcCol: 0, tgtCol: 1,
    x1: 100 + HANDLE_OUTSET, y1, x2: 300 - HANDLE_OUTSET, y2: 120 + 100 * i,
  }))

  it('gives each net its own track instead of stacking turns at the midpoint', () => {
    const wires = fan([50, 100, 150])
    const { turnX, tracksPerGap } = routeWires(columns, rects, wires)
    const xs = wires.map(w => turnX.get(w.id)!)
    expect(new Set(xs).size).toBe(3)
    expect(tracksPerGap.get(0)).toBe(3)
    // Tracks are 8px apart (default) and stay inside the gap.
    const sorted = [...xs].sort((a, b) => a - b)
    expect(sorted[1] - sorted[0]).toBeCloseTo(8)
    for (const x of xs) expect(x > 100 && x < 300).toBe(true)
  })

  it('orders tracks so parallel downward wires do not cross', () => {
    const wires = fan([50, 100, 150])
    const { turnX } = routeWires(columns, rects, wires)
    expect(crossings(wires, turnX)).toBe(0)
    // With all turns at the shared midpoint they would overlap instead.
  })

  it('lets wires of one net share a single track', () => {
    const wires: RoutableWire[] = [0, 1, 2].map(i => ({
      id: `b${i}`, net: 'src:0', src: 'src', tgt: `t${i}`, srcCol: 0, tgtCol: 1,
      x1: 106, y1: 100, x2: 294, y2: 120 + 100 * i,
    }))
    const { turnX } = routeWires(columns, rects, wires)
    expect(new Set(wires.map(w => turnX.get(w.id))).size).toBe(1)
  })

  it('leaves straight, backward, and same-column wires alone', () => {
    const wires: RoutableWire[] = [
      { id: 'straight', net: 'a', src: 'src', tgt: 't0', srcCol: 0, tgtCol: 1, x1: 106, y1: 120, x2: 294, y2: 120 },
      { id: 'back', net: 'b', src: 't0', tgt: 'src', srcCol: 1, tgtCol: 0, x1: 406, y1: 120, x2: -6, y2: 50 },
    ]
    expect(routeWires(columns, rects, wires).turnX.size).toBe(0)
  })
})

describe('computeAutoLayout routes', () => {
  // A subsystem-like block with several outputs feeding a long chain and two far outputs.
  const blocks = [
    block('in', 'input_port'),
    block('mux', 'mux', { inputCount: 1, outputCount: 3 }),
    block('g1', 'scale'),
    block('g2', 'scale'),
    block('g3', 'scale'),
    block('o1', 'output_port'),
    block('o2', 'output_port'),
    block('o3', 'output_port'),
  ]

  it('returns a route for every wire, offsets only where a wire turns', () => {
    const blocks2 = [block('src', 'source'), block('g', 'scale'), block('out', 'output_port')]
    const wires = [wire('a', 'src', 0, 'g', 0), wire('b', 'g', 0, 'out', 0)]
    const r = computeAutoLayout(blocks2, wires)
    expect(r.routes.map(x => x.id).sort()).toEqual(['a', 'b'])
    // A straight chain needs no turns: the default midpoint is right.
    for (const x of r.routes) expect(x.midpointOffset).toBeUndefined()
  })

  it('can be switched off', () => {
    const blocks2 = [block('src', 'source'), block('g', 'scale')]
    expect(computeAutoLayout(blocks2, [wire('a', 'src', 0, 'g', 0)], { routeWires: false }).routes).toEqual([])
  })

  it('does not route enable/reset wires (they attach top/bottom)', () => {
    const blocks2 = [block('src', 'source'), block('en', 'source', {}, 300), block('i', 'integrator')]
    const wires = [wire('a', 'src', 0, 'i', 0), wire('ctl', 'en', 0, 'i', -1)]
    const ctl = computeAutoLayout(blocks2, wires).routes.find(r => r.id === 'ctl')!
    expect(ctl.midpointOffset).toBeUndefined()
  })

  it('widens a crowded gap so every track fits', () => {
    // 12 outputs of one block, each to its own far Output Port with a vertical offset.
    const n = 12
    const bs = [block('big', 'subsystem', { inputPorts: [], outputPorts: Array.from({ length: n }, (_, i) => `o${i}`), sheets: [] })]
    const ws: WireData[] = []
    for (let i = 0; i < n; i++) {
      bs.push(block(`out${i}`, 'output_port', {}, i * 37))
      ws.push(wire(`w${i}`, 'big', i, `out${i}`, 0))
    }
    const narrow = computeAutoLayout(bs, ws, { routeWires: false })
    const wide = computeAutoLayout(bs, ws)
    const xOut = (r: typeof wide) => r.moves.find(m => m.id === 'out0')!.position.x
    expect(wide.routes.filter(r => r.midpointOffset !== undefined)).toHaveLength(n)
    // 12 tracks at 8px plus 14px margins each side need 116px; the default gap is 80px.
    expect(xOut(wide) - xOut(narrow)).toBe(116 - 80)
  })
})

describe('tuneModelLayout writes wire routes', () => {
  const sheet = (wires: WireData[], blocks: BlockData[]): Sheet => ({
    id: 'main', name: 'Main', blocks, connections: wires, extents: { width: 1000, height: 800 },
  })

  it('clears a stale hand-dragged turn when the wire no longer needs one', () => {
    const blocks = [block('src', 'source'), block('g', 'scale'), block('out', 'output_port')]
    const wires = [wire('a', 'src', 0, 'g', 0, { midpointOffset: 120 }), wire('b', 'g', 0, 'out', 0)]
    const { sheets, summary } = tuneModelLayout([sheet(wires, blocks)], 'main', DEFAULT_TUNE_OPTIONS)
    const a = sheets[0].connections.find(w => w.id === 'a')!
    expect(a.routing).toBeUndefined()
    expect(summary.wiresRouted).toBe(1)
  })

  it('leaves wires untouched when the layout is not being cleaned up', () => {
    const blocks = [block('src', 'source'), block('g', 'scale')]
    const wires = [wire('a', 'src', 0, 'g', 0, { midpointOffset: 120 })]
    const { sheets } = tuneModelLayout([sheet(wires, blocks)], 'main', {
      ...DEFAULT_TUNE_OPTIONS, cleanUpLayout: false, hideBlockNames: true,
    })
    expect(sheets[0].connections[0].routing).toEqual({ midpointOffset: 120 })
  })
})

describe('feedback wires', () => {
  // A controller (column 1) fed back from a plant's sensor block (column 3)
  // through four wires into its ports 1..4; an input feeds port 0.
  const blocks = [
    block('in', 'input_port'),
    block('ctrl', 'subsystem', { inputPorts: ['ref', 'a', 'b', 'c', 'd'], outputPorts: ['u'], sheets: [] }),
    block('plant', 'scale'),
    block('sens', 'subsystem', { inputPorts: ['x'], outputPorts: ['a', 'b', 'c', 'd'], sheets: [] }),
  ]
  const wires = [
    wire('w0', 'in', 0, 'ctrl', 0),
    wire('wu', 'ctrl', 0, 'plant', 0),
    wire('wx', 'plant', 0, 'sens', 0),
    ...[0, 1, 2, 3].map(i => wire(`f${i}`, 'sens', i, 'ctrl', i + 1)),
  ]

  it('turn in front of their target, on staggered tracks, instead of crossing it from behind', () => {
    const { moves, routes } = computeAutoLayout(blocks, wires)
    const at = (id: string) => moves.find(m => m.id === id)!.position
    const ctrlLeft = at('ctrl').x
    const sensRight = at('sens').x + 80 // natural subsystem width
    const turns = [0, 1, 2, 3].map(i => {
      const off = routes.find(r => r.id === `f${i}`)!.midpointOffset
      expect(off).toBeDefined()
      const mid = (sensRight + HANDLE_OUTSET + ctrlLeft - HANDLE_OUTSET) / 2
      return mid + off!
    })
    // Every turn is left of the controller (a short run into the port), and
    // each wire has its own track
    for (const t of turns) {
      expect(t).toBeLessThan(ctrlLeft)
      expect(t).toBeGreaterThan(at('in').x)
    }
    expect(new Set(turns).size).toBe(4)
  })
})

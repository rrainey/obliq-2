// Return row: the feedback path of a control loop, drawn mirrored on a row
// below the forward path (Phase 4 of docs/layout-improvement-plan-pass-2.md).
//
// The return path (`signalFlowAnalysis().returnPath` in autoLayout.ts: the
// sensors and compensators of a loop that has subsystem functions, and the
// plain blocks from the plant back to the controller side) goes on its own
// row. Its blocks are flipped (inputs on the right, outputs on the left), so
// the row reads right to left: the plant output comes down into the right
// side of the sensor, and the sensor output goes left and up into the
// controller.
//
// Method. ELK Layered has no row constraint. Tests with inverted port sides
// and reversed edges in one graph put the return blocks into their own layer
// between the controller and the plant, at the top of that layer, and made
// the sheet wider by the width of the sensor; the in-layer position options
// (`positionChoiceConstraint`, `inLayerSuccOf`) had no effect. So this module
// lays out two graphs:
//   1. The forward graph F: all blocks that are not on the return path. Each
//      net from F to the return path ends at a connector node with the layer
//      constraint LAST (the right column of F). Each net from the return path
//      to F starts at a connector node with the layer constraint FIRST (the
//      left column of F).
//   2. The return graph R: the return-path blocks and their satellites,
//      unflipped, with connector nodes FIRST (for the nets from F) and LAST
//      (for the nets to F). It is laid out left to right like any sheet, then
//      mirrored (x -> -x). Mirrored, its blocks are flipped blocks, and its
//      satellites and port-name reservations are on the correct sides.
//   3. R goes below F, centred between the controller side and the plant side
//      that it connects. Each connecting net is a path in reserved lanes:
//      from F's right column, right of everything in F, down to a channel
//      between F and R, along the channel, and down right of everything in R
//      into R's right column (and the mirror of this on the left side for the
//      nets from R to F). Nothing else is in these lanes, so they cross no
//      block and overlap no wire. Each net has its own lane and track; the
//      nesting order (the top net outermost) prevents crossings among the
//      lanes on the F side.
// The connector nodes are not blocks: they only reserve the place where a
// connecting wire leaves F or R. The caller (computeElkLayout) scores the
// result and uses the layout without a return row when a hard metric is not 0.
//
// The result depends only on the wiring and the block sizes, not on block
// positions or on the stored `flipped` flags, so a second layout gives the
// same result.

import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'
import { BLOCK_NAME_HEIGHT, findSatellites } from './satellites'
import { measure, isAnnotation, type AutoLayoutResult, type LayoutFlip, type Metrics, type WireRoute } from './autoLayout'
import { wireEndAt, type WireEnd } from './blockGeometry'
import { routeForEnds, simplifyPolyline, type ElkLayoutDetail } from './elkLayout'

interface Pt { x: number; y: number }

/** Size of a connector node (px). Its one port is at mid-height. */
const CONNECTOR_W = 12
const CONNECTOR_H = 20
/** Gap between a graph's bounding box and the nearest lane or track (px). */
const LANE_GAP = 20
/** Distance between two lanes, and between two channel tracks (px). */
const TRACK = 10
/** Gap between the last channel track and the return row (px). */
const ROW_GAP = 24

/** Lays out one part (F or R) with the ELK adapter, without a return row. */
export type RunPart = (
  blocks: BlockData[],
  wires: WireData[],
  metricsOverride: ReadonlyMap<string, Metrics>,
  /** Connector nodes without the FIRST or LAST layer constraint. */
  unconstrained: ReadonlySet<string>,
) => Promise<ElkLayoutDetail>

const unflipped = (b: BlockData): BlockData => {
  if (b.parameters?.flipped === undefined) return b
  const { flipped: _f, ...rest } = b.parameters
  return { ...b, parameters: rest }
}

/** The blocks with `flipped` removed: the input of the layout. */
export function withoutFlips(blocks: BlockData[]): BlockData[] {
  return blocks.map(unflipped)
}

/** Flip changes that make each block's flag equal to `wanted` (absent: not flipped). */
export function flipChanges(blocks: BlockData[], flippedIds: ReadonlySet<string>): LayoutFlip[] {
  const out: LayoutFlip[] = []
  for (const b of blocks) {
    if (isAnnotation(b.type)) continue
    const now = b.parameters?.flipped === true
    const want = flippedIds.has(b.id)
    if (now !== want) out.push({ id: b.id, flipped: want })
  }
  return out
}

interface Net {
  key: string
  sourceId: string
  sourcePort: number
  /** The real wires of the net that cross between F and R. */
  wires: WireData[]
}

/**
 * Lay out a sheet with its return path on a mirrored row below the forward
 * path. `blocks` must be unflipped (withoutFlips()). Returns null when the
 * sheet has no forward part or no return part to lay out. The result has
 * `flips` for every block whose flag must change.
 */
export async function layoutWithReturnRow(
  blocks: BlockData[],
  wires: WireData[],
  returnPath: ReadonlySet<string>,
  runPart: RunPart,
  origin: { x: number; y: number },
  storedBlocks: BlockData[] = blocks,
): Promise<AutoLayoutResult | null> {
  const laidOut = blocks.filter(b => !isAnnotation(b.type))
  const byId = new Map(laidOut.map(b => [b.id, b]))
  // The return part: the return-path blocks and the satellites of their hosts
  const inR = new Set([...returnPath].filter(id => byId.has(id)))
  if (inR.size === 0) return null
  // Blocks with no input wire that feed only the return row (for example an
  // Input Port of sensor data) go on the row too, at its right end
  const inputs = new Set(wires.map(w => w.targetBlockId))
  for (const b of laidOut) {
    if (inR.has(b.id) || inputs.has(b.id)) continue
    const outs = wires.filter(w => w.sourceBlockId === b.id && byId.has(w.targetBlockId))
    if (outs.length > 0 && outs.every(w => inR.has(w.targetBlockId))) inR.add(b.id)
  }
  for (const s of findSatellites(laidOut, wires).satellites.values()) {
    if (inR.has(s.hostId)) inR.add(s.id)
  }
  const fBlocks = laidOut.filter(b => !inR.has(b.id))
  const rBlocks = laidOut.filter(b => inR.has(b.id))
  if (fBlocks.length === 0) return null

  // Wires of each part, and the nets that cross between the parts
  const fWires: WireData[] = [], rWires: WireData[] = []
  const toR = new Map<string, Net>(), toF = new Map<string, Net>()
  const crossControl: WireData[] = []
  const seen = new Set<string>()
  for (const w of wires) {
    if (seen.has(w.id) || !byId.has(w.sourceBlockId) || !byId.has(w.targetBlockId)) continue
    seen.add(w.id)
    const sr = inR.has(w.sourceBlockId), tr = inR.has(w.targetBlockId)
    if (sr === tr) { (sr ? rWires : fWires).push(w); continue }
    if (w.targetPortIndex < 0) { crossControl.push(w); continue }
    const port = Math.max(0, w.sourcePortIndex)
    const key = `${w.sourceBlockId}:${port}`
    const nets = sr ? toF : toR
    if (!nets.has(key)) nets.set(key, { key, sourceId: w.sourceBlockId, sourcePort: port, wires: [] })
    nets.get(key)!.wires.push(w)
  }

  // Connector nodes: one for each crossing net at each end
  const override = new Map<string, Metrics>()
  const connector = (id: string, type: 'input_port' | 'output_port'): BlockData => {
    override.set(id, {
      width: CONNECTOR_W, height: CONNECTOR_H,
      inputs: type === 'output_port' ? 1 : 0, outputs: type === 'input_port' ? 1 : 0,
      minHeight: CONNECTOR_H, naturalWidth: CONNECTOR_W, resizable: false, flipped: false,
    })
    return { id, type, name: id, position: { x: 0, y: 0 }, parameters: {} } as BlockData
  }
  const id = (kind: string, net: Net) => `__returnrow:${kind}:${net.key}`
  const fConnectors: BlockData[] = [], rConnectors: BlockData[] = []
  const link = (wid: string, s: string, sp: number, t: string, tp: number): WireData =>
    ({ id: wid, sourceBlockId: s, sourcePortIndex: sp, targetBlockId: t, targetPortIndex: tp } as WireData)
  for (const net of toR.values()) {
    fConnectors.push(connector(id('f-out', net), 'output_port'))
    fWires.push(link(id('f-wire', net), net.sourceId, net.sourcePort, id('f-out', net), 0))
    rConnectors.push(connector(id('r-in', net), 'input_port'))
    for (const w of net.wires) rWires.push(link(w.id, id('r-in', net), 0, w.targetBlockId, w.targetPortIndex))
  }
  for (const net of toF.values()) {
    rConnectors.push(connector(id('r-out', net), 'output_port'))
    rWires.push(link(id('r-wire', net), net.sourceId, net.sourcePort, id('r-out', net), 0))
    fConnectors.push(connector(id('f-in', net), 'input_port'))
    for (const w of net.wires) fWires.push(link(w.id, id('f-in', net), 0, w.targetBlockId, w.targetPortIndex))
  }

  const metricsOf = (b: BlockData) => override.get(b.id) ?? measure(b)
  const sizes = new Map<string, Metrics>([...laidOut, ...fConnectors, ...rConnectors].map(b => [b.id, metricsOf(b)]))
  const fConnectorIds = new Set(fConnectors.map(c => c.id))

  // Bounding boxes: blocks (with the name label above), connectors and wires
  const box = (pos: Map<string, Pt>, paths: Map<string, Pt[]>) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [bid, p] of pos) {
      const m = sizes.get(bid)!
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x + m.width)
      y0 = Math.min(y0, p.y - BLOCK_NAME_HEIGHT); y1 = Math.max(y1, p.y + m.height)
    }
    for (const pts of paths.values()) for (const q of pts) {
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x)
      y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y)
    }
    return { x0, y0, x1, y1 }
  }

  // F. First, each connector is in the layer next to its block, and its wire
  // turns down to the channel in the column of the connector. A connector
  // whose column is not free (a block, or a vertical wire of another net, is
  // below it) gets the LAST (or FIRST) layer and a lane in the margin, and F
  // is laid out again.
  const ownPaths = new Map<string, Set<string>>()
  for (const net of toR.values()) ownPaths.set(id('f-out', net), new Set([id('f-wire', net)]))
  for (const net of toF.values()) ownPaths.set(id('f-in', net), new Set(net.wires.map(w => w.id)))
  const margin = new Set<string>()
  let F: ElkLayoutDetail
  let columns = new Map<string, number>()
  for (let pass = 0; ; pass++) {
    const free = new Set(fConnectors.map(c => c.id).filter(c => !margin.has(c)))
    F = await runPart([...fBlocks, ...fConnectors], fWires, override, free)
    if (free.size === 0) break
    const found = freeColumns(F, free, fConnectorIds, ownPaths, sizes, box(F.positions, F.paths).y1)
    columns = found.columns
    if (found.blocked.size === 0) break
    // After three passes, all remaining connectors go to the margins
    for (const c of pass >= 2 ? free : found.blocked) margin.add(c)
    columns = new Map()
  }
  const R = await runPart([...rBlocks, ...rConnectors], rWires, override, new Set())
  if (fBlocks.some(b => !F.positions.has(b.id)) || rBlocks.some(b => !R.positions.has(b.id))) return null

  // Mirror R (x -> -x): a block's left edge goes to -(x + width)
  const rPos = new Map<string, Pt>()
  for (const [bid, p] of R.positions) rPos.set(bid, { x: -(p.x + sizes.get(bid)!.width), y: p.y })
  const rPaths = new Map<string, Pt[]>()
  for (const [wid, pts] of R.paths) rPaths.set(wid, pts.map(p => ({ x: -p.x, y: p.y })))

  const fBox = box(F.positions, F.paths)
  const rBox0 = box(rPos, rPaths)

  // The nets, with their ends at the connectors
  const frEnds = [...toR.values()].map(net => ({
    net,
    p1: last(F.paths.get(id('f-wire', net))),
    p2: first(rPaths.get(net.wires[0].id)),
  }))
  const rfEnds = [...toF.values()].map(net => ({
    net,
    q1: last(rPaths.get(id('r-wire', net))),
    q2: first(F.paths.get(net.wires[0].id)),
  }))
  if (frEnds.some(n => !n.p1 || !n.p2) || rfEnds.some(n => !n.q1 || !n.q2)) return null

  // Place R: below the channel, centred between the controller side (the F
  // blocks that R feeds) and the plant side (the F blocks that feed R)
  const tracks = Math.max(1, frEnds.length + rfEnds.length)
  const channelTop = fBox.y1 + LANE_GAP
  const trackY = (i: number) => channelTop + i * TRACK
  const dyR = Math.round(trackY(tracks - 1) + ROW_GAP - rBox0.y0)
  const rectRight = (bid: string) => F.positions.get(bid)!.x + sizes.get(bid)!.width
  const plantX = Math.max(...frEnds.map(n => rectRight(n.net.sourceId)), -Infinity)
  const ctrlX = Math.min(...rfEnds.flatMap(n => n.net.wires.map(w => F.positions.get(w.targetBlockId)!.x)), Infinity)
  const centre = Number.isFinite(plantX) && Number.isFinite(ctrlX) ? (plantX + ctrlX) / 2
    : Number.isFinite(plantX) ? plantX : Number.isFinite(ctrlX) ? ctrlX : (fBox.x0 + fBox.x1) / 2
  const dxR = Math.round(centre - (rBox0.x0 + rBox0.x1) / 2)
  const moveR = (p: Pt): Pt => ({ x: p.x + dxR, y: p.y + dyR })
  for (const [bid, p] of rPos) rPos.set(bid, moveR(p))
  for (const [wid, pts] of rPaths) rPaths.set(wid, pts.map(moveR))
  const rBox = { x0: rBox0.x0 + dxR, x1: rBox0.x1 + dxR, y0: rBox0.y0 + dyR, y1: rBox0.y1 + dyR }

  // The F end of each net: its vertical x (the connector column, or a margin
  // lane) and its row. Margin lanes: the top net is the outermost.
  type End = { key: string; fx: number; fy: number; ry: number; fPt: Pt; rPt: Pt; dir: 1 | -1 }
  const ends: End[] = []
  {
    const fr = frEnds.map(n => ({ n, p1: n.p1!, p2: moveR(n.p2!) }))
    const marginNets = fr.filter(e => margin.has(id('f-out', e.n.net))).sort((a, b) => a.p1.y - b.p1.y || a.p1.x - b.p1.x)
    marginNets.forEach((e, r) => ends.push({ key: e.n.net.key, fx: fBox.x1 + LANE_GAP + TRACK * (marginNets.length - 1 - r), fy: e.p1.y, ry: e.p2.y, fPt: e.p1, rPt: e.p2, dir: 1 }))
    for (const e of fr) {
      const c = columns.get(id('f-out', e.n.net))
      if (c !== undefined) ends.push({ key: e.n.net.key, fx: c, fy: e.p1.y, ry: e.p2.y, fPt: e.p1, rPt: e.p2, dir: 1 })
    }
    const rf = rfEnds.map(n => ({ n, q1: moveR(n.q1!), q2: n.q2! }))
    const marginL = rf.filter(e => margin.has(id('f-in', e.n.net))).sort((a, b) => a.q2.y - b.q2.y || a.q2.x - b.q2.x)
    marginL.forEach((e, r) => ends.push({ key: e.n.net.key, fx: fBox.x0 - LANE_GAP - TRACK * (marginL.length - 1 - r), fy: e.q2.y, ry: e.q1.y, fPt: e.q2, rPt: e.q1, dir: -1 }))
    for (const e of rf) {
      const c = columns.get(id('f-in', e.n.net))
      if (c !== undefined) ends.push({ key: e.n.net.key, fx: c, fy: e.q2.y, ry: e.q1.y, fPt: e.q2, rPt: e.q1, dir: -1 })
    }
  }
  if (ends.length !== frEnds.length + rfEnds.length) return null

  // R lanes: right of R for the nets into R (dir 1), left of R for the nets
  // out of R (dir -1), at x that no F vertical uses. Tracks: the net farthest
  // from its R lanes is the lowest. The order of the R lanes and which group
  // has the lower tracks are selected for the fewest crossings.
  const fxs = ends.map(e => e.fx)
  const laneSlots = (edge: number, out: 1 | -1, count: number) => {
    const slots: number[] = []
    for (let k = 0; slots.length < count; k++) {
      const x = edge + out * (LANE_GAP + TRACK * k)
      if (fxs.every(f => Math.abs(f - x) > TRACK / 2)) slots.push(x)
    }
    return slots
  }
  const groups = ([1, -1] as const).map(dir => {
    const list = ends.filter(e => e.dir === dir)
    const edge = dir > 0 ? rBox.x1 : rBox.x0
    // Farthest first: the lowest track
    list.sort((a, b) => Math.abs(b.fx - edge) - Math.abs(a.fx - edge) || a.fy - b.fy || a.fx - b.fx)
    return { dir, list, slots: laneSlots(edge, dir, list.length) }
  })
  let best: { paths: Map<string, Pt[]>; crossings: number } | null = null
  for (const lowerGroup of [0, 1]) {
    for (const flipA of [false, true]) {
      for (const flipB of [false, true]) {
        const paths = new Map<string, Pt[]>()
        let next = tracks - 1
        for (const gi of lowerGroup === 0 ? [0, 1] : [1, 0]) {
          const g = groups[gi]
          const reverse = gi === 0 ? flipA : flipB
          g.list.forEach((e, i) => {
            const ty = trackY(next - i)
            // Innermost slot first, or outermost first
            const rx = g.slots[reverse ? g.list.length - 1 - i : i]
            const fSide = [e.fPt, { x: e.fx, y: e.fy }, { x: e.fx, y: ty }]
            const rSide = [{ x: rx, y: ty }, { x: rx, y: e.ry }, e.rPt]
            // From F to R (dir 1), or from R to F (dir -1)
            paths.set(e.key, e.dir > 0 ? [...fSide, ...rSide] : [...rSide.reverse(), ...fSide.reverse()])
          })
          next -= g.list.length
        }
        const crossings = countCrossings([...paths.values()])
        if (!best || crossings < best.crossings) best = { paths, crossings }
      }
    }
  }
  const connectors = best!.paths

  // Final positions: left edge at origin.x, vertical centre at origin.y
  const positions = new Map<string, Pt>()
  for (const b of fBlocks) positions.set(b.id, F.positions.get(b.id)!)
  for (const b of rBlocks) positions.set(b.id, rPos.get(b.id)!)
  let minX = Infinity, minY = Infinity, maxY = -Infinity
  for (const [bid, p] of positions) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y + sizes.get(bid)!.height)
  }
  const dx = Math.round(origin.x - minX)
  const dy = Math.round(origin.y - (minY + maxY) / 2)
  const shift = (p: Pt): Pt => ({ x: p.x + dx, y: p.y + dy })

  // Drawn paths of the real wires
  const paths = new Map<string, Pt[]>()
  const fReal = new Set(fWires.filter(w => !w.id.startsWith('__returnrow:') && !w.sourceBlockId.startsWith('__returnrow:')).map(w => w.id))
  for (const w of fWires) if (fReal.has(w.id) && F.paths.has(w.id)) paths.set(w.id, F.paths.get(w.id)!)
  for (const w of rWires) {
    if (w.id.startsWith('__returnrow:') || w.sourceBlockId.startsWith('__returnrow:')) continue
    if (rPaths.has(w.id)) paths.set(w.id, rPaths.get(w.id)!)
  }
  for (const n of frEnds) {
    const head = F.paths.get(id('f-wire', n.net))!
    for (const w of n.net.wires) paths.set(w.id, join(head, connectors.get(n.net.key)!, rPaths.get(w.id)!))
  }
  for (const n of rfEnds) {
    const head = rPaths.get(id('r-wire', n.net))!
    for (const w of n.net.wires) paths.set(w.id, join(head, connectors.get(n.net.key)!, F.paths.get(w.id)!))
  }

  // Moves, flips and routes
  const flipped = new Set(rBlocks.map(b => b.id))
  const moves = [...positions].map(([bid, p]) => ({ id: bid, position: shift(p) }))
  const finalPos = new Map(moves.map(m => [m.id, m.position]))
  const flipState = (b: BlockData): BlockData => {
    const { flipped: _f, ...rest } = b.parameters ?? {}
    return { ...b, parameters: flipped.has(b.id) ? { ...rest, flipped: true } : rest }
  }
  const end = (bid: string, kind: 'input' | 'output', port: number): WireEnd => {
    const b = flipState(byId.get(bid)!)
    const m = sizes.get(bid)!
    return wireEndAt(b, finalPos.get(bid)!, kind, port, kind === 'input' ? m.inputs : m.outputs, m.width, m.height)
  }
  const rect = (bid: string) => ({ ...finalPos.get(bid)!, w: sizes.get(bid)!.width, h: sizes.get(bid)!.height })
  const routes: WireRoute[] = []
  const fRoutes = new Map(F.routes.map(r => [r.id, r]))
  for (const w of wires) {
    if (!seen.has(w.id)) continue
    if (w.targetPortIndex < 0) { routes.push({ id: w.id, midpointOffset: undefined }); continue }
    const pts = paths.get(w.id)
    if (!pts) continue
    if (fReal.has(w.id) && fRoutes.has(w.id)) {
      // A forward wire keeps the route of the forward layout, moved with the sheet
      const r = fRoutes.get(w.id)!
      routes.push(r.waypoints ? { id: w.id, midpointOffset: undefined, waypoints: r.waypoints.map(shift) } : r)
      continue
    }
    const source = end(w.sourceBlockId, 'output', Math.max(0, w.sourcePortIndex))
    const target = end(w.targetBlockId, 'input', w.targetPortIndex)
    const moved = pts.map(shift)
    // Exact ends (the parts round their block positions the same way)
    moved[0] = { x: source.x, y: source.y }
    moved[moved.length - 1] = { x: target.x, y: target.y }
    routes.push(routeForEnds(w.id, moved, source, target, { source: rect(w.sourceBlockId), target: rect(w.targetBlockId) }))
  }

  const order = new Map(blocks.map((b, i) => [b.id, i]))
  return {
    moves,
    resizes: [],
    routes,
    returnPath: [...returnPath].filter(i => byId.has(i)).sort((a, b) => order.get(a)! - order.get(b)!),
    flips: flipChanges(storedBlocks, flipped),
  }
}

/**
 * The column of each connector whose wire can turn and run straight down
 * from the connector to `bottom` (the bottom of F): no block and no vertical
 * wire of another net is in the way. Columns of two connectors must not be
 * on the same x. The other connectors are `blocked`.
 */
function freeColumns(
  F: ElkLayoutDetail,
  free: ReadonlySet<string>,
  connectorIds: ReadonlySet<string>,
  ownPaths: ReadonlyMap<string, ReadonlySet<string>>,
  sizes: ReadonlyMap<string, Metrics>,
  bottom: number,
): { columns: Map<string, number>; blocked: Set<string> } {
  const rects: Array<{ x0: number; x1: number; y0: number; y1: number }> = []
  for (const [bid, p] of F.positions) {
    if (connectorIds.has(bid)) continue
    const m = sizes.get(bid)!
    rects.push({ x0: p.x - 1, x1: p.x + m.width + 1, y0: p.y - BLOCK_NAME_HEIGHT, y1: p.y + m.height + 1 })
  }
  const verticals: Array<{ wire: string; x: number; y0: number; y1: number }> = []
  for (const [wid, pts] of F.paths) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1]
      if (Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) >= 1) verticals.push({ wire: wid, x: a.x, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) })
    }
  }
  const columns = new Map<string, number>()
  const blocked = new Set<string>()
  const order = [...free].sort((a, b) => F.positions.get(a)!.y - F.positions.get(b)!.y || F.positions.get(a)!.x - F.positions.get(b)!.x || (a < b ? -1 : 1))
  for (const c of order) {
    const p = F.positions.get(c)!
    const x = p.x + CONNECTOR_W / 2
    const y0 = p.y + CONNECTOR_H / 2
    const own = ownPaths.get(c) ?? new Set<string>()
    const hit = rects.some(r => x > r.x0 && x < r.x1 && r.y1 > y0 && r.y0 < bottom)
      || verticals.some(v => !own.has(v.wire) && Math.abs(v.x - x) <= TRACK / 2 && v.y1 > y0 && v.y0 < bottom)
      || [...columns.values()].some(cx => Math.abs(cx - x) <= TRACK / 2)
    if (hit) blocked.add(c)
    else columns.set(c, x)
  }
  return { columns, blocked }
}

/** Proper crossings between orthogonal polylines (each pair of paths, horizontal with vertical). */
function countCrossings(paths: Pt[][]): number {
  const segs = paths.map(pts => {
    const out: Array<{ h: boolean; at: number; a: number; b: number }> = []
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1]
      if (Math.abs(p.y - q.y) < 0.5 && Math.abs(p.x - q.x) >= 0.5) out.push({ h: true, at: p.y, a: Math.min(p.x, q.x), b: Math.max(p.x, q.x) })
      else if (Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) >= 0.5) out.push({ h: false, at: p.x, a: Math.min(p.y, q.y), b: Math.max(p.y, q.y) })
    }
    return out
  })
  let n = 0
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    for (const s of segs[i]) for (const t of segs[j]) {
      if (s.h === t.h) continue
      const h = s.h ? s : t, v = s.h ? t : s
      if (v.at > h.a + 0.5 && v.at < h.b - 0.5 && h.at > v.a + 0.5 && h.at < v.b - 0.5) n++
    }
  }
  return n
}

const first = (pts: Pt[] | undefined) => pts?.[0]
const last = (pts: Pt[] | undefined) => (pts && pts.length ? pts[pts.length - 1] : undefined)

/** Join polylines that share their end points. */
function join(...parts: Pt[][]): Pt[] {
  const out: Pt[] = []
  for (const part of parts) for (const p of part) out.push({ x: p.x, y: p.y })
  return simplifyPolyline(out)
}

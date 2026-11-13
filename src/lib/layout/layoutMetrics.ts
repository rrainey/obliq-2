// Layout score: measures how readable a laid-out sheet is.
//
// The values come from the geometry the editor draws, so they are a fair
// measure of any layout engine, the classic one or a later one:
//   - Block rectangles use blockGeometry.ts with the port counts that the
//     canvas uses (PortCountAdapter), as `measure()` in autoLayout.ts does.
//   - A wire starts HANDLE_OUTSET px outside its source port and ends
//     HANDLE_OUTSET px outside its target port, at the port's y. The side of
//     each port comes from dataPortGeometry() in blockGeometry.ts: inputs on
//     the left and outputs on the right, or the opposite for a flipped block.
//   - A wire with `routing.waypoints` is the polyline source -> waypoints ->
//     target, joined with straight lines exactly as EditableStepEdge in
//     CustomEdge.tsx (generatePathSegments) and pdfRenderer.ts draw it. The
//     editor does not make these lines orthogonal, so a waypoint path can have
//     diagonal segments; they are measured as drawn and counted separately.
//   - Any other wire has the default path of defaultWirePath() in
//     blockGeometry.ts: for ports that face each other, three segments that
//     turn at (x1 + x2) / 2 + (routing.midpointOffset ?? 0).
//
// Enable/reset wires (targetPortIndex < 0) attach to the top or bottom of the
// target block. They are counted, but they are not part of the routed metrics.
// Comment blocks are ignored.
//
// A net is all wires from one source block and source port. Wires of one net
// often share a segment (the trunk of a junction), so crossings and overlaps
// are measured on the union of each net's segments: two nets that cross once
// on the canvas count as one crossing, however many wires share the trunk.

import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'
import { PortCountAdapter } from '@/lib/validation/PortCountAdapter'
import { buildFullPlan } from '@/lib/export/sheetTree'
import {
  getBlockWidth, getBlockHeight, wireEndAt, defaultWirePath,
  type WireEnd, type WirePoint, type WireRect,
} from './blockGeometry'

export interface SheetLayoutMetrics {
  /** Blocks measured (comments excluded). */
  blocks: number
  /** Routed wires: both ends on the sheet, target port index >= 0. */
  wires: number
  /** Enable/reset wires (target port index < 0); not in the other metrics. */
  controlWires: number
  /** Wires whose source or target block is not on the sheet (or is a comment). */
  unresolvedWires: number
  /** Distinct nets among the routed wires. */
  nets: number
  /**
   * (net, block) pairs where a wire of the net runs through the inside of a
   * block that is not that wire's source or target. Hard metric.
   */
  throughBlock: number
  /**
   * (net, block) pairs where a wire runs through the inside of its own source
   * or target block (a feedback wire that leaves backward, for example).
   */
  throughOwnBlock: number
  /** Pairs of collinear segments of different nets that share more than 2 px. Hard metric. */
  overlaps: number
  /** Total shared length of those overlaps (px). */
  overlapLength: number
  /** Points where segments of different nets cross. Hard metric. */
  crossings: number
  /** Pairs of blocks whose rectangles overlap (comments excluded). Hard metric. */
  blockOverlaps: number
  /** Direction changes, summed over all routed wires. */
  bends: number
  /** Routed wires with no bend. */
  straight: number
  /**
   * Routed wires whose target port is behind their source port: to the left
   * of a source port that faces right, or to the right of one that faces left
   * (a flipped block).
   */
  backward: number
  /** Drawn length of the backward wires (px). */
  backwardLength: number
  /** Drawn length of all routed wires, each wire in full (px). */
  wireLength: number
  /** Drawn length with shared net segments counted once (px). */
  inkLength: number
  /** Segments that are neither horizontal nor vertical (waypoint paths only). Hard metric. */
  diagonalSegments: number
  /**
   * Routed wires whose first segment goes back from the source port (against
   * the direction the port faces), or whose last segment comes into the
   * target port from behind it. Such a wire runs back through its own block.
   * Hard metric.
   */
  portDirection: number
  /**
   * Small steps in the drawn wires: a segment shorter than MICRO_JOG (2 px)
   * with a bend at one or both ends. Two bends that are this near each other
   * (a jog between two rows that differ by a fraction of a pixel), or a bend
   * this near a wire end, show as a visible kink. Counted for each such
   * segment, on the exact polyline (not with the 1 px tolerance of the other
   * metrics). A step that the port pitches force is not counted: two blocks
   * joined by two wires, one exactly straight, whose port pitches differ by
   * less than MICRO_JOG (forcedJogWires()). Hard metric.
   */
  microJogs: number
  /** Bounding box of blocks and wires (px). */
  width: number
  height: number
  /** width / height; 0 for an empty sheet. */
  aspect: number
}

/** The metrics that must not get worse. */
export const HARD_METRICS = ['throughBlock', 'overlaps', 'crossings', 'blockOverlaps', 'diagonalSegments', 'portDirection', 'microJogs'] as const
export type HardMetric = typeof HARD_METRICS[number]

interface Pt { x: number; y: number }

interface Rect { id: string; x: number; y: number; w: number; h: number }

/** One straight piece of a drawn wire. */
interface Seg {
  net: string
  kind: 'h' | 'v' | 'd'
  x1: number
  y1: number
  x2: number
  y2: number
}

/** Tolerance (px) for the ends of a crossing and for joins along one line. */
const EPS = 0.5
/**
 * A segment that moves less than this (px) across its direction is drawn as
 * horizontal or vertical, and a shorter segment is dropped. Port positions are
 * fractions of a block height, so a wire between two rows that differ by less
 * than 1 px has a sub-pixel jog that nobody can see. The router in
 * wireRouting.ts uses the same 1 px limit to decide that a wire is straight.
 */
const JOG = 1
/** A segment with a bend at an end that is shorter than this (px) is a micro jog (microJogs). */
export const MICRO_JOG = 2
/** Points nearer than this (px) are the same point (floating-point noise only). */
const SAME_POINT = 1e-6
/** Collinear segments closer than this (px) are drawn on top of each other. */
const OVERLAP_GAP = 2
/** A rectangle is shrunk by this (px) before a wire is tested against it. */
const BLOCK_INSET = 1

interface BlockGeom {
  rect: Rect
  inputs: number
  outputs: number
  /** End of a wire from output port `index`. */
  sourceEnd: (index: number) => WireEnd
  /** End of a wire into input port `index`. */
  targetEnd: (index: number) => WireEnd
}

/** A size that replaces the block geometry in the score (for nodes that are not model blocks). */
export interface BlockSize { width: number; height: number; inputs: number; outputs: number }

function measureBlock(block: BlockData, size?: BlockSize): BlockGeom {
  const counts = size ? { inputCount: size.inputs, outputCount: size.outputs } : PortCountAdapter.getPortCounts(block)
  // Mirror BlockNode and autoLayout: an Output Port block reports an output it does not draw.
  const outputs = block.type === 'output_port' ? 0 : counts.outputCount
  const inputs = counts.inputCount
  const w = size ? size.width : getBlockWidth(block)
  const h = size ? size.height : getBlockHeight(block, inputs, outputs)
  const position = { x: block.position?.x ?? 0, y: block.position?.y ?? 0 }
  return {
    rect: { id: block.id, ...position, w, h },
    inputs,
    outputs,
    sourceEnd: index => wireEndAt(block, position, 'output', Math.max(0, index), outputs, w, h),
    targetEnd: index => wireEndAt(block, position, 'input', index, inputs, w, h),
  }
}

/**
 * The points of a wire as the editor draws it. `source` and `target` are the
 * wire ends; an end without `dir` has the usual side (a source port that faces
 * right, a target port that faces left). `rects` are the source and target
 * block rectangles, for the default path around blocks (defaultWirePath()).
 */
export function wirePolyline(
  source: Pt & { dir?: -1 | 1 },
  target: Pt & { dir?: -1 | 1 },
  routing?: WireData['routing'],
  rects: { source?: WireRect; target?: WireRect } = {},
): Pt[] {
  const waypoints = routing?.waypoints
  if (waypoints && waypoints.length > 0) {
    return [{ x: source.x, y: source.y }, ...waypoints.map(p => ({ x: p.x, y: p.y })), { x: target.x, y: target.y }]
  }
  return defaultWirePath(
    { x: source.x, y: source.y, dir: source.dir ?? 1 },
    { x: target.x, y: target.y, dir: target.dir ?? -1 },
    routing?.midpointOffset ?? 0,
    rects,
  ) as WirePoint[]
}

/**
 * True when the wire leaves its source port, and enters its target port, in
 * the direction that each port faces: the first segment that moves does not
 * move back toward the source block, and the last does not come from inside
 * the target block. A vertical end segment is permitted (a turn at the wire end).
 */
export function wireEndsFollowPorts(points: Pt[], sourceDir: -1 | 1, targetDir: -1 | 1): boolean {
  const moving = (a: Pt, b: Pt) => Math.abs(a.x - b.x) >= JOG || Math.abs(a.y - b.y) >= JOG
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1]
    if (!moving(a, b)) continue
    if ((b.x - a.x) * sourceDir <= -JOG) return false
    break
  }
  for (let i = points.length - 1; i > 0; i--) {
    const a = points[i - 1], b = points[i]
    if (!moving(a, b)) continue
    // The wire comes in toward the port: it moves against the port's outward direction
    if ((b.x - a.x) * targetDir >= JOG) return false
    break
  }
  return true
}

function kindOf(a: Pt, b: Pt): Seg['kind'] {
  if (Math.abs(a.y - b.y) < JOG) return 'h'
  if (Math.abs(a.x - b.x) < JOG) return 'v'
  return 'd'
}

const segLength = (s: Seg) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1)

/**
 * The micro jogs of a drawn wire (SheetLayoutMetrics.microJogs): segments
 * shorter than MICRO_JOG with a bend at one or both ends. The polyline is
 * exact: only repeated points and points in the middle of a straight run
 * (both within SAME_POINT) are removed first.
 */
export function microJogsOf(points: Pt[]): number {
  const p: Pt[] = []
  for (const q of points) {
    const last = p[p.length - 1]
    if (last && Math.abs(last.x - q.x) < SAME_POINT && Math.abs(last.y - q.y) < SAME_POINT) continue
    p.push({ x: q.x, y: q.y })
    while (p.length >= 3) {
      const [a, b, c] = p.slice(-3)
      const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y)
      // Same direction (a straight run): drop the middle point. A turn back is a bend.
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
      const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)
      if (Math.abs(cross) > SAME_POINT * l1 * l2 || dot <= 0) break
      p.splice(p.length - 2, 1)
    }
  }
  let n = 0
  for (let i = 0; i + 1 < p.length; i++) {
    const bendAtAnEnd = i > 0 || i + 2 < p.length
    if (bendAtAnEnd && Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y) < MICRO_JOG) n++
  }
  return n
}

/** Segments of a polyline, without zero-length pieces. */
function segmentsOf(points: Pt[], net: string): Seg[] {
  const out: Seg[] = []
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1]
    if (Math.abs(a.x - b.x) < JOG && Math.abs(a.y - b.y) < JOG) continue
    out.push({ net, kind: kindOf(a, b), x1: a.x, y1: a.y, x2: b.x, y2: b.y })
  }
  return out
}

/**
 * Wires whose small step the port pitches force: the wire's port rows differ
 * by more than 0 and less than MICRO_JOG, and another wire between the same
 * two blocks (same source and target) is exactly straight. No position of
 * the two blocks makes both wires straight, and a move of MICRO_JOG or more
 * would put a larger step in the other wire. Example: a demux with a 20 px
 * output pitch that feeds two inputs of a block with a 21.3 px pitch.
 */
function forcedJogWires(connections: WireData[], geom: Map<string, BlockGeom>): Set<string> {
  const rowGap = new Map<string, Array<{ id: string; dy: number }>>()
  for (const w of connections) {
    const src = geom.get(w.sourceBlockId), tgt = geom.get(w.targetBlockId)
    if (!src || !tgt || w.targetPortIndex < 0) continue
    const key = `${w.sourceBlockId}>${w.targetBlockId}`
    if (!rowGap.has(key)) rowGap.set(key, [])
    rowGap.get(key)!.push({ id: w.id, dy: Math.abs(tgt.targetEnd(w.targetPortIndex).y - src.sourceEnd(w.sourcePortIndex).y) })
  }
  const out = new Set<string>()
  for (const wires of rowGap.values()) {
    if (!wires.some(w => w.dy < SAME_POINT)) continue
    for (const w of wires) if (w.dy >= SAME_POINT && w.dy < MICRO_JOG) out.add(w.id)
  }
  return out
}

/** Direction changes along a polyline. A turn back along the same line is not a bend. */
function bendsOf(segs: Seg[]): number {
  let n = 0
  for (let i = 0; i + 1 < segs.length; i++) {
    const p = segs[i], q = segs[i + 1]
    const cross = (p.x2 - p.x1) * (q.y2 - q.y1) - (p.y2 - p.y1) * (q.x2 - q.x1)
    const scale = segLength(p) * segLength(q)
    if (Math.abs(cross) > 1e-6 * scale) n++
  }
  return n
}

/**
 * Union of a net's segments: collinear horizontal and vertical pieces that
 * touch or overlap become one segment. Diagonal pieces are kept, without
 * exact duplicates.
 */
function mergeNet(segs: Seg[]): Seg[] {
  const lines = new Map<string, Array<[number, number]>>()
  const diagonal = new Map<string, Seg>()
  for (const s of segs) {
    if (s.kind === 'd') {
      const key = [s.x1, s.y1, s.x2, s.y2].map(v => Math.round(v * 2)).join(',')
      const rev = [s.x2, s.y2, s.x1, s.y1].map(v => Math.round(v * 2)).join(',')
      if (!diagonal.has(rev)) diagonal.set(key, s)
      continue
    }
    const at = s.kind === 'h' ? s.y1 : s.x1
    const from = s.kind === 'h' ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2)
    const to = s.kind === 'h' ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2)
    const key = `${s.kind}|${Math.round(at * 2) / 2}`
    if (!lines.has(key)) lines.set(key, [])
    lines.get(key)!.push([from, to])
  }
  const net = segs[0]?.net ?? ''
  const out: Seg[] = [...diagonal.values()]
  for (const [key, spans] of lines) {
    const [kind, atText] = key.split('|')
    const at = Number(atText)
    spans.sort((a, b) => a[0] - b[0])
    let [from, to] = spans[0]
    const flush = () => out.push(kind === 'h'
      ? { net, kind: 'h', x1: from, y1: at, x2: to, y2: at }
      : { net, kind: 'v', x1: at, y1: from, x2: at, y2: to })
    for (let i = 1; i < spans.length; i++) {
      if (spans[i][0] <= to + EPS) {
        to = Math.max(to, spans[i][1])
      } else {
        flush()
        ;[from, to] = spans[i]
      }
    }
    flush()
  }
  return out
}

const orient = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

/** True when two segments cross at a point inside both (ends excluded). */
function properCrossing(p: Seg, q: Seg): boolean {
  if (p.kind !== 'd' && q.kind !== 'd') {
    if (p.kind === q.kind) return false
    const h = p.kind === 'h' ? p : q
    const v = p.kind === 'h' ? q : p
    const hx0 = Math.min(h.x1, h.x2), hx1 = Math.max(h.x1, h.x2)
    const vy0 = Math.min(v.y1, v.y2), vy1 = Math.max(v.y1, v.y2)
    return v.x1 > hx0 + EPS && v.x1 < hx1 - EPS && h.y1 > vy0 + EPS && h.y1 < vy1 - EPS
  }
  const a = { x: p.x1, y: p.y1 }, b = { x: p.x2, y: p.y2 }
  const c = { x: q.x1, y: q.y1 }, d = { x: q.x2, y: q.y2 }
  const d1 = orient(c, d, a), d2 = orient(c, d, b)
  const d3 = orient(a, b, c), d4 = orient(a, b, d)
  // Signed distances of each end from the other line, in px
  const lp = segLength(p) || 1, lq = segLength(q) || 1
  return ((d1 / lq > EPS && d2 / lq < -EPS) || (d1 / lq < -EPS && d2 / lq > EPS))
    && ((d3 / lp > EPS && d4 / lp < -EPS) || (d3 / lp < -EPS && d4 / lp > EPS))
}

/** Shared length (px) of two parallel horizontal or vertical segments, else 0. */
function overlapLength(p: Seg, q: Seg): number {
  if (p.kind === 'd' || p.kind !== q.kind) return 0
  const pAt = p.kind === 'h' ? p.y1 : p.x1
  const qAt = q.kind === 'h' ? q.y1 : q.x1
  if (Math.abs(pAt - qAt) > OVERLAP_GAP) return 0
  const span = (s: Seg) => s.kind === 'h'
    ? [Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)]
    : [Math.min(s.y1, s.y2), Math.max(s.y1, s.y2)]
  const [p0, p1] = span(p), [q0, q1] = span(q)
  const shared = Math.min(p1, q1) - Math.max(p0, q0)
  return shared > OVERLAP_GAP ? shared : 0
}

/** True when a segment runs through the inside of a rectangle (shrunk by BLOCK_INSET). */
function segmentHitsRect(s: Seg, r: Rect): boolean {
  const left = r.x + BLOCK_INSET, right = r.x + r.w - BLOCK_INSET
  const top = r.y + BLOCK_INSET, bottom = r.y + r.h - BLOCK_INSET
  if (right <= left || bottom <= top) return false
  // Liang-Barsky clip: the segment hits when a part of positive length is inside
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1
  let t0 = 0, t1 = 1
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q > 0
    const t = q / p
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t }
    else { if (t < t0) return false; if (t < t1) t1 = t }
    return true
  }
  if (!clip(-dx, s.x1 - left)) return false
  if (!clip(dx, right - s.x1)) return false
  if (!clip(-dy, s.y1 - top)) return false
  if (!clip(dy, bottom - s.y1)) return false
  return (t1 - t0) * Math.hypot(dx, dy) > 1e-6
}

/**
 * The rectangle and the wire ends of a block as the editor draws them. Shared
 * with waypointRepair.ts, so that the repair and the score use one geometry.
 */
export function blockWireGeometry(block: BlockData): {
  rect: { x: number; y: number; w: number; h: number }
  /** End of a wire from output port `index`, with the port direction. */
  sourceEnd: (index: number) => WireEnd
  /** End of a wire into input port `index`, with the port direction. */
  targetEnd: (index: number) => WireEnd
} {
  const g = measureBlock(block)
  const r = g.rect
  return {
    rect: { x: r.x, y: r.y, w: r.w, h: r.h },
    sourceEnd: g.sourceEnd,
    targetEnd: g.targetEnd,
  }
}

/** True when a polyline runs through the inside of a rectangle, as the score tests it. */
export function polylineHitsRect(points: Pt[], rect: { x: number; y: number; w: number; h: number }): boolean {
  const r: Rect = { id: '', ...rect }
  return segmentsOf(points, '').some(s => segmentHitsRect(s, r))
}

const emptyMetrics = (): SheetLayoutMetrics => ({
  blocks: 0, wires: 0, controlWires: 0, unresolvedWires: 0, nets: 0,
  throughBlock: 0, throughOwnBlock: 0, overlaps: 0, overlapLength: 0, crossings: 0, blockOverlaps: 0,
  bends: 0, straight: 0, backward: 0, backwardLength: 0, wireLength: 0, inkLength: 0,
  diagonalSegments: 0, portDirection: 0, microJogs: 0, width: 0, height: 0, aspect: 0,
})

/**
 * Score one sheet. `sizes` replaces the geometry of some blocks (the
 * connector nodes of the ELK return row, returnRow.ts).
 */
export function scoreSheetLayout(
  blocks: BlockData[],
  connections: WireData[],
  sizes?: ReadonlyMap<string, BlockSize>,
): SheetLayoutMetrics {
  const m = emptyMetrics()
  const geom = new Map<string, BlockGeom>()
  for (const b of blocks) if (b.type !== 'comment') geom.set(b.id, measureBlock(b, sizes?.get(b.id)))
  m.blocks = geom.size

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const extend = (x: number, y: number) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  for (const { rect } of geom.values()) {
    extend(rect.x, rect.y)
    extend(rect.x + rect.w, rect.y + rect.h)
  }

  const rects = [...geom.values()].map(g => g.rect)
  // Blocks that overlap by more than BLOCK_INSET in both directions
  for (let i = 0; i < rects.length; i++) {
    const p = rects[i]
    for (let j = i + 1; j < rects.length; j++) {
      const q = rects[j]
      const ox = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x)
      const oy = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y)
      if (ox > BLOCK_INSET && oy > BLOCK_INSET) m.blockOverlaps++
    }
  }
  const netSegs = new Map<string, Seg[]>()
  const through = new Set<string>()
  const throughOwn = new Set<string>()
  const forced = forcedJogWires(connections, geom)

  for (const wire of connections) {
    const src = geom.get(wire.sourceBlockId)
    const tgt = geom.get(wire.targetBlockId)
    if (!src || !tgt) { m.unresolvedWires++; continue }
    if (wire.targetPortIndex < 0) { m.controlWires++; continue }
    m.wires++

    const net = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
    const source = src.sourceEnd(wire.sourcePortIndex)
    const target = tgt.targetEnd(wire.targetPortIndex)
    const points = wirePolyline(source, target, wire.routing, { source: src.rect, target: tgt.rect })
    for (const p of points) extend(p.x, p.y)
    const segs = segmentsOf(points, net)

    const length = segs.reduce((sum, s) => sum + segLength(s), 0)
    const bends = bendsOf(segs)
    m.wireLength += length
    m.bends += bends
    if (bends === 0) m.straight++
    if ((target.x - source.x) * source.dir < -EPS) {
      m.backward++
      m.backwardLength += length
    }
    m.diagonalSegments += segs.filter(s => s.kind === 'd').length
    if (!wireEndsFollowPorts(points, source.dir, target.dir)) m.portDirection++
    if (!forced.has(wire.id)) m.microJogs += microJogsOf(points)

    for (const s of segs) {
      for (const r of rects) {
        if (!segmentHitsRect(s, r)) continue
        if (r.id === wire.sourceBlockId || r.id === wire.targetBlockId) throughOwn.add(`${net}|${r.id}`)
        else through.add(`${net}|${r.id}`)
      }
    }

    if (!netSegs.has(net)) netSegs.set(net, [])
    netSegs.get(net)!.push(...segs)
  }

  m.nets = netSegs.size
  m.throughBlock = through.size
  m.throughOwnBlock = throughOwn.size

  const merged: Seg[] = []
  for (const segs of netSegs.values()) merged.push(...mergeNet(segs))
  for (const s of merged) m.inkLength += segLength(s)
  for (let i = 0; i < merged.length; i++) {
    const p = merged[i]
    for (let j = i + 1; j < merged.length; j++) {
      const q = merged[j]
      if (p.net === q.net) continue
      if (properCrossing(p, q)) { m.crossings++; continue }
      const shared = overlapLength(p, q)
      if (shared > 0) { m.overlaps++; m.overlapLength += shared }
    }
  }

  if (Number.isFinite(minX)) {
    m.width = maxX - minX
    m.height = maxY - minY
    m.aspect = m.height > 0 ? m.width / m.height : 0
  }
  for (const k of ['overlapLength', 'backwardLength', 'wireLength', 'inkLength', 'width', 'height'] as const) {
    m[k] = Math.round(m[k])
  }
  m.aspect = Math.round(m.aspect * 1000) / 1000
  return m
}

/** The drawn geometry and crossings of one routed wire (wireDetails()). */
export interface WireDetail {
  id: string
  /** `sourceBlockId:sourcePortIndex` */
  net: string
  sourceBlockId: string
  targetBlockId: string
  /** Drawn length (px). */
  length: number
  bends: number
  /**
   * Points where a segment of this wire crosses a segment of another net. A
   * segment that the wire shares with other wires of its net (a trunk) counts
   * for each of these wires.
   */
  crossings: number
  /** The target port is behind the source port (as SheetLayoutMetrics.backward). */
  backward: boolean
  /** The drawn points, from the source end to the target end. */
  points: Array<{ x: number; y: number }>
}

/** The crossings and the drawn length of one net (wireDetails()). */
export interface NetDetail {
  net: string
  wires: number
  /** Crossings of the merged net shape with other nets, as SheetLayoutMetrics.crossings counts them. */
  crossings: number
  /** Drawn length with shared segments counted once (px). */
  inkLength: number
}

/**
 * Per-wire and per-net detail of the score of one sheet, with the geometry of
 * scoreSheetLayout(). The tidy of signal labels (tidyLabels.ts) uses it to
 * find the long wires that cross many other nets. Enable and reset wires and
 * wires with an end off the sheet are not included.
 */
export function wireDetails(
  blocks: BlockData[],
  connections: WireData[],
): { wires: WireDetail[]; nets: NetDetail[] } {
  const geom = new Map<string, BlockGeom>()
  for (const b of blocks) if (b.type !== 'comment') geom.set(b.id, measureBlock(b))
  const wires: Array<WireDetail & { segs: Seg[] }> = []
  const netSegs = new Map<string, Seg[]>()
  for (const wire of connections) {
    const src = geom.get(wire.sourceBlockId)
    const tgt = geom.get(wire.targetBlockId)
    if (!src || !tgt || wire.targetPortIndex < 0) continue
    const net = `${wire.sourceBlockId}:${wire.sourcePortIndex}`
    const source = src.sourceEnd(wire.sourcePortIndex)
    const target = tgt.targetEnd(wire.targetPortIndex)
    const points = wirePolyline(source, target, wire.routing, { source: src.rect, target: tgt.rect })
    const segs = segmentsOf(points, net)
    wires.push({
      id: wire.id, net, sourceBlockId: wire.sourceBlockId, targetBlockId: wire.targetBlockId,
      length: Math.round(segs.reduce((sum, s) => sum + segLength(s), 0)),
      bends: bendsOf(segs),
      crossings: 0,
      backward: (target.x - source.x) * source.dir < -EPS,
      points,
      segs,
    })
    if (!netSegs.has(net)) netSegs.set(net, [])
    netSegs.get(net)!.push(...segs)
  }
  const merged = new Map<string, Seg[]>()
  for (const [net, segs] of netSegs) merged.set(net, mergeNet(segs))
  const all: Seg[] = [...merged.values()].flat()
  const nets: NetDetail[] = []
  for (const [net, segs] of merged) {
    let crossings = 0
    for (const p of segs) for (const q of all) if (q.net !== net && properCrossing(p, q)) crossings++
    nets.push({
      net,
      wires: wires.filter(w => w.net === net).length,
      crossings,
      inkLength: Math.round(segs.reduce((sum, s) => sum + segLength(s), 0)),
    })
  }
  for (const w of wires) {
    for (const p of w.segs) for (const q of all) if (q.net !== w.net && properCrossing(p, q)) w.crossings++
  }
  return { wires: wires.map(({ segs: _s, ...w }) => w), nets }
}

export interface SheetScore {
  id: string
  name: string
  /** Breadcrumb from the model root, as in the PDF export. */
  path: string[]
  metrics: SheetLayoutMetrics
}

interface RawSheet {
  id?: string
  name?: string
  blocks?: BlockData[]
  connections?: WireData[]
}

/**
 * Score every sheet of a model, nested sheets included (a subsystem block
 * holds its sheets in `parameters.sheets`). The order and paths are those of
 * the PDF export.
 */
export function scoreSheetTree(sheets: RawSheet[]): SheetScore[] {
  return buildFullPlan(sheets).sheets.map(s => ({
    id: s.id,
    name: s.name,
    path: s.path,
    metrics: scoreSheetLayout(s.blocks, s.connections),
  }))
}

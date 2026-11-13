// Wire crossings and junctions: the hop marks and the junction dots that the
// canvas (CustomEdge.tsx) and the PDF export (pdfRenderer.ts) draw.
//
// The input is the drawn polyline of each wire on one sheet, with its net (all
// wires from one source block and source port). The output is:
//   - Hops. Where segments of two different nets cross, one net draws a small
//     semicircular "line hop" over the other (MAB guideline jc_0903). The
//     segment nearer to horizontal hops, so a horizontal wire hops over a
//     vertical wire. Parallel segments do not cross.
//   - Junction dots. A point where three or more branches of one net meet (a
//     T or a four-way point inside the net) gets a filled dot. Corners and
//     port ends get no dot.
//
// Rules for hops (all lengths in sheet px):
//   - Wires of one net never hop over each other. Where two wires of one net
//     cross and do not join (rare), nothing is drawn.
//   - A crossing is measured on the union of each net's segments, so a trunk
//     that several wires of a net share crosses once. The hop is given to each
//     wire of the hopping net that draws that trunk, because each wire is drawn
//     on its own and the copies lie on top of each other.
//   - A hop has the radius hopRadius() (larger for vector and matrix wires).
//     It is dropped (the crossing is drawn plain) when a corner, a wire end or
//     another vertex of any wire is in its zone: within the radius plus
//     HOP_CLEAR along the hopping segment, and from HOP_CLEAR below the line to
//     the radius plus HOP_CLEAR on the side of the arc. A hop must also be
//     HOP_PORT_CLEAR from a wire end, so it cannot touch an arrowhead.
//   - Hops on one segment that are closer than HOP_GAP join into one wider hop:
//     a quarter arc up, a straight run at the hop height, and a quarter arc down.
//
// The module is pure (no React, no pdf-lib), so the canvas and the PDF get the
// same result from the same polylines.

import { parseType } from '@/lib/typeValidator'
import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'
import { blockWireGeometry, wirePolyline } from '@/lib/layout/layoutMetrics'

export interface DecoPoint { x: number; y: number }

/** One wire on a sheet, as it is drawn. */
export interface DecorationWire {
  id: string
  /** Net key: the source block and the source port (for example `${blockId}:${port}`). */
  net: string
  /** The drawn polyline. Segment i goes from points[i] to points[i + 1]. */
  points: DecoPoint[]
  /** Parallel lines that the wire has in the PDF: 1 scalar, 2 vector, 3 matrix. */
  lines?: number
}

/** One hop mark on one segment of a wire. */
export interface WireHop {
  /** Index of the segment: points[segment] to points[segment + 1]. */
  segment: number
  /** Start of the hop on the segment, in the direction of the segment. */
  from: DecoPoint
  /** End of the hop on the segment. */
  to: DecoPoint
  /** Height of the hop and radius of its quarter arcs. */
  radius: number
  /** Nets that the hop passes over. */
  nets?: string[]
}

export interface JunctionDot extends DecoPoint {
  radius: number
}

export interface SheetDecorations {
  /** Hops of each wire, by wire id, in the order of the wire's segments. */
  hops: Map<string, WireHop[]>
  /** Junction dots that each wire draws, by wire id. Each junction has one owner wire. */
  dots: Map<string, JunctionDot[]>
  /** All junctions, with their net. */
  junctions: Array<JunctionDot & { net: string }>
  /** Crossings between different nets (counted on the union of each net). */
  crossings: number
  /** Crossings that got a hop mark. The others are drawn plain. */
  hopped: number
}

/** Radius of a hop on a scalar wire (sheet px). */
export const HOP_RADIUS = 4.5
/** Radius of a junction dot on a scalar wire (sheet px). */
export const JUNCTION_RADIUS = 3
/** Space between a hop and a corner or another vertex (sheet px). */
export const HOP_CLEAR = 2
/** Space between a hop and a wire end, so that a hop cannot touch an arrowhead (sheet px). */
export const HOP_PORT_CLEAR = 10
/** Hops closer than this (sheet px) join into one hop. */
export const HOP_GAP = 2
/**
 * Space between the parallel lines of a vector or matrix wire, in sheet px:
 * the PDF wire width (2) times its bundle spacing (1.75).
 */
export const BUNDLE_SPACING = 3.5

/** Tolerance (px) for points that are the same and for a point on a segment. */
const TOL = 0.75
/** A segment that moves less than this across its direction is horizontal or vertical. */
const JOG = 1

/**
 * How many parallel lines a wire's data type gets in the PDF. Anything not
 * matched (unknown type, error type, control ports) is one scalar line, so a
 * failure never blocks the export or the canvas.
 */
export function wireLineCount(rawType: string | undefined): 1 | 2 | 3 {
  if (!rawType) return 1
  try {
    const t = parseType(rawType)
    if (t.isMatrix) return 3
    if (t.isArray) return 2
    return 1
  } catch {
    return 1
  }
}

/** Half the distance between the outer lines of a wire with `lines` parallel lines. */
export function bundleHalfSpan(lines = 1): number {
  return (Math.max(1, lines) - 1) * BUNDLE_SPACING / 2
}

/**
 * Radius of a hop of a wire with `hopLines` lines over a wire with
 * `underLines` lines. The innermost arc of a bundle must stay clear of its own
 * inner line and of all lines of the wire below.
 */
export function hopRadius(hopLines = 1, underLines = 1): number {
  const h = bundleHalfSpan(hopLines), v = bundleHalfSpan(underLines)
  return Math.max(HOP_RADIUS, 2 * h + 2, h + v + 2.5)
}

/** Radius of a junction dot on a wire with `lines` lines. */
export function junctionRadius(lines = 1): number {
  return Math.max(JUNCTION_RADIUS, bundleHalfSpan(lines) + 2)
}

// --- Geometry ---------------------------------------------------------------

type Kind = 'h' | 'v' | 'd'

interface Seg {
  net: string
  kind: Kind
  x1: number; y1: number; x2: number; y2: number
  lines: number
}

const kindOf = (a: DecoPoint, b: DecoPoint): Kind =>
  Math.abs(a.y - b.y) < JOG ? 'h' : Math.abs(a.x - b.x) < JOG ? 'v' : 'd'

const sub = (a: DecoPoint, b: DecoPoint) => ({ x: a.x - b.x, y: a.y - b.y })
const dot = (a: DecoPoint, b: DecoPoint) => a.x * b.x + a.y * b.y
const len = (a: DecoPoint) => Math.hypot(a.x, a.y)

/** Unit direction of a segment. */
function unit(a: DecoPoint, b: DecoPoint): DecoPoint {
  const d = sub(b, a), l = len(d) || 1
  return { x: d.x / l, y: d.y / l }
}

/**
 * The side that a hop bulges to: the normal of the segment that points up
 * (toward negative y, the top of the sheet); for a vertical segment, the left.
 */
export function hopNormal(u: DecoPoint): DecoPoint {
  let n = { x: u.y, y: -u.x }
  if (n.y > 1e-9 || (Math.abs(n.y) <= 1e-9 && n.x > 0)) n = { x: -n.x, y: -n.y }
  return n
}

/** Distance from p to the segment a-b, and the position of p along it (0 at a). */
function project(p: DecoPoint, a: DecoPoint, b: DecoPoint): { dist: number; along: number; length: number } {
  const d = sub(b, a), l = len(d)
  if (l < 1e-9) return { dist: len(sub(p, a)), along: 0, length: 0 }
  const along = dot(sub(p, a), d) / l
  const t = Math.max(0, Math.min(l, along))
  const q = { x: a.x + d.x * t / l, y: a.y + d.y * t / l }
  return { dist: len(sub(p, q)), along, length: l }
}

/** Union of one net's segments: collinear horizontal or vertical pieces that touch become one. */
function unionOfNet(segs: Seg[]): Seg[] {
  const lines = new Map<string, { at: number; spans: Array<[number, number]>; kind: Kind; lines: number }>()
  const out: Seg[] = []
  const diagonal = new Set<string>()
  for (const s of segs) {
    if (s.kind === 'd') {
      const k = [s.x1, s.y1, s.x2, s.y2].map(v => Math.round(v * 2)).join(',')
      const r = [s.x2, s.y2, s.x1, s.y1].map(v => Math.round(v * 2)).join(',')
      if (diagonal.has(k) || diagonal.has(r)) continue
      diagonal.add(k)
      out.push(s)
      continue
    }
    const at = s.kind === 'h' ? s.y1 : s.x1
    const from = s.kind === 'h' ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2)
    const to = s.kind === 'h' ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2)
    const key = `${s.kind}|${Math.round(at * 2)}`
    let line = lines.get(key)
    if (!line) { line = { at, spans: [], kind: s.kind, lines: s.lines }; lines.set(key, line) }
    line.spans.push([from, to])
  }
  const net = segs[0]?.net ?? ''
  for (const line of lines.values()) {
    line.spans.sort((a, b) => a[0] - b[0])
    let [from, to] = line.spans[0]
    const flush = () => out.push(line.kind === 'h'
      ? { net, kind: 'h', x1: from, y1: line.at, x2: to, y2: line.at, lines: line.lines }
      : { net, kind: 'v', x1: line.at, y1: from, x2: line.at, y2: to, lines: line.lines })
    for (let i = 1; i < line.spans.length; i++) {
      const [a, b] = line.spans[i]
      if (a <= to + TOL) to = Math.max(to, b)
      else { flush(); [from, to] = [a, b] }
    }
    flush()
  }
  return out
}

/** The point where two segments cross inside both (ends excluded by TOL), else null. */
function crossingPoint(p: Seg, q: Seg): DecoPoint | null {
  if (p.kind !== 'd' && q.kind !== 'd') {
    if (p.kind === q.kind) return null
    const h = p.kind === 'h' ? p : q
    const v = p.kind === 'h' ? q : p
    const x = v.x1, y = h.y1
    if (x > Math.min(h.x1, h.x2) + TOL && x < Math.max(h.x1, h.x2) - TOL
      && y > Math.min(v.y1, v.y2) + TOL && y < Math.max(v.y1, v.y2) - TOL) return { x, y }
    return null
  }
  const r = { x: p.x2 - p.x1, y: p.y2 - p.y1 }
  const s = { x: q.x2 - q.x1, y: q.y2 - q.y1 }
  const den = r.x * s.y - r.y * s.x
  const lr = len(r), ls = len(s)
  if (Math.abs(den) < 1e-6 * lr * ls) return null // parallel
  const w = { x: q.x1 - p.x1, y: q.y1 - p.y1 }
  const t = (w.x * s.y - w.y * s.x) / den
  const u = (w.x * r.y - w.y * r.x) / den
  if (t * lr <= TOL || (1 - t) * lr <= TOL || u * ls <= TOL || (1 - u) * ls <= TOL) return null
  return { x: p.x1 + t * r.x, y: p.y1 + t * r.y }
}

/** How near a segment is to horizontal: 0 for horizontal, 1 for vertical. */
const steepness = (s: Seg) => Math.abs(s.y2 - s.y1) / (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1)

/** A grid of points, for the queries near a crossing. */
class PointGrid {
  private cells = new Map<number, DecoPoint[]>()
  constructor(private size = 32) {}
  private key(cx: number, cy: number) { return (cx + 32768) * 65536 + (cy + 32768) }
  add(p: DecoPoint) {
    const k = this.key(Math.floor(p.x / this.size), Math.floor(p.y / this.size))
    let c = this.cells.get(k)
    if (!c) { c = []; this.cells.set(k, c) }
    c.push(p)
  }
  /** True when some point within r of p (in x and in y) passes the test. */
  some(p: DecoPoint, r: number, test: (q: DecoPoint) => boolean): boolean {
    const x0 = Math.floor((p.x - r) / this.size), x1 = Math.floor((p.x + r) / this.size)
    const y0 = Math.floor((p.y - r) / this.size), y1 = Math.floor((p.y + r) / this.size)
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const c = this.cells.get(this.key(cx, cy))
        if (c) for (const q of c) if (test(q)) return true
      }
    }
    return false
  }
  /** True when a point within TOL is in the grid. */
  has(p: DecoPoint): boolean {
    return this.some(p, TOL, q => Math.abs(q.x - p.x) <= TOL && Math.abs(q.y - p.y) <= TOL)
  }
}

/** Index of segments by the line they are on (horizontal: y; vertical: x). Diagonal segments are kept in one list. */
class LineIndex<T extends { kind: Kind }> {
  private lines = new Map<string, T[]>()
  readonly diagonal: T[] = []
  add(s: T, a: DecoPoint) {
    if (s.kind === 'd') { this.diagonal.push(s); return }
    const k = `${s.kind}${Math.round((s.kind === 'h' ? a.y : a.x) * 2)}`
    let l = this.lines.get(k)
    if (!l) { l = []; this.lines.set(k, l) }
    l.push(s)
  }
  /** Segments of this kind on lines within TOL of `at`. */
  on(kind: 'h' | 'v', at: number): T[] {
    const c = Math.round(at * 2), out: T[] = []
    for (let k = c - 2; k <= c + 2; k++) {
      const l = this.lines.get(`${kind}${k}`)
      if (l) for (const s of l) out.push(s)
    }
    return out
  }
  /** Segments that can pass through p: on the horizontal and vertical lines of p, and the diagonals. */
  through(p: DecoPoint): T[] {
    return [...this.on('h', p.y), ...this.on('v', p.x), ...this.diagonal]
  }
}

// --- Decorations ------------------------------------------------------------

interface WireSegRef { wire: DecorationWire; index: number; a: DecoPoint; b: DecoPoint; kind: Kind }

/**
 * Hops and junction dots for all wires of one sheet. Wires with fewer than
 * two points are ignored.
 */
export function computeWireDecorations(wires: DecorationWire[]): SheetDecorations {
  const hops = new Map<string, WireHop[]>()
  const dots = new Map<string, JunctionDot[]>()
  const junctions: SheetDecorations['junctions'] = []

  // Segments of each wire, grouped by net, and all vertices
  const netWires = new Map<string, DecorationWire[]>()
  const netRefs = new Map<string, WireSegRef[]>()
  const netIndex = new Map<string, LineIndex<WireSegRef>>()
  const vertices = new PointGrid()
  for (const w of wires) {
    if (w.points.length < 2) continue
    if (!netWires.has(w.net)) { netWires.set(w.net, []); netRefs.set(w.net, []); netIndex.set(w.net, new LineIndex()) }
    netWires.get(w.net)!.push(w)
    for (const p of w.points) if (!vertices.has(p)) vertices.add(p)
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i], b = w.points[i + 1]
      if (Math.abs(a.x - b.x) < TOL && Math.abs(a.y - b.y) < TOL) continue
      const ref: WireSegRef = { wire: w, index: i, a, b, kind: kindOf(a, b) }
      netRefs.get(w.net)!.push(ref)
      netIndex.get(w.net)!.add(ref, a)
    }
  }

  const union: Seg[] = []
  const unionByNet = new Map<string, Seg[]>()
  for (const [net, refs] of netRefs) {
    if (refs.length === 0) continue
    const lines = netWires.get(net)![0].lines ?? 1
    const segs = unionOfNet(refs.map(r => ({
      net, kind: r.kind, x1: r.a.x, y1: r.a.y, x2: r.b.x, y2: r.b.y, lines,
    })))
    unionByNet.set(net, segs)
    for (const sg of segs) union.push(sg)
  }

  // Crossings between nets. Horizontal against vertical with a sweep over x;
  // diagonal segments (waypoint wires only) against all.
  const hs = union.filter(s => s.kind === 'h')
  const vs = union.filter(s => s.kind === 'v').sort((a, b) => a.x1 - b.x1)
  const ds = union.filter(s => s.kind === 'd')
  const pairs: Array<[Seg, Seg, DecoPoint]> = []
  const vx = vs.map(v => v.x1)
  const lowerBound = (x: number) => {
    let lo = 0, hi = vx.length
    while (lo < hi) { const m = (lo + hi) >> 1; if (vx[m] < x) lo = m + 1; else hi = m }
    return lo
  }
  for (const h of hs) {
    const x0 = Math.min(h.x1, h.x2), x1 = Math.max(h.x1, h.x2)
    for (let i = lowerBound(x0 + TOL); i < vs.length && vx[i] < x1 - TOL; i++) {
      const v = vs[i]
      if (v.net === h.net) continue
      const p = crossingPoint(h, v)
      if (p) pairs.push([h, v, p])
    }
  }
  for (let i = 0; i < ds.length; i++) {
    const d = ds[i]
    for (const s of union) {
      if (s === d || s.net === d.net) continue
      // Each diagonal pair once
      if (s.kind === 'd' && ds.indexOf(s) < i) continue
      const p = crossingPoint(d, s)
      if (!p) continue
      pairs.push(steepness(d) < steepness(s) || (steepness(d) === steepness(s) && d.net < s.net) ? [d, s, p] : [s, d, p])
    }
  }

  // Hops: given to the wires of the hopping net that draw the crossing point
  const raw = new Map<string, Array<WireHop & { at: number }>>() // key: wireId|segment
  let hopped = 0
  for (const [over, under, p] of pairs) {
    const radius = hopRadius(over.lines, under.lines)
    const u = unit({ x: over.x1, y: over.y1 }, { x: over.x2, y: over.y2 })
    const n = hopNormal(u)
    // The zone of the hop must hold no vertex of any wire
    const reach = radius + HOP_CLEAR
    const blocked = vertices.some(p, reach + 1, q => {
      const d = sub(q, p)
      const along = Math.abs(dot(d, u)), across = dot(d, n)
      return along <= reach && across >= -HOP_CLEAR && across <= reach
    })
    if (blocked) continue
    const owners: WireSegRef[] = []
    const index = netIndex.get(over.net)!
    const candidates = over.kind === 'd' ? index.diagonal : index.on(over.kind, over.kind === 'h' ? p.y : p.x)
    for (const r of candidates) {
      if (r.kind !== over.kind) continue
      const pr = project(p, r.a, r.b)
      if (pr.dist > TOL || pr.along <= TOL || pr.along >= pr.length - TOL) continue
      if (r.kind === 'd' && Math.abs(Math.abs(dot(unit(r.a, r.b), u)) - 1) > 1e-3) continue
      owners.push(r)
    }
    // Clear of the wire ends
    const nearEnd = owners.some(r => {
      const pr = project(p, r.a, r.b)
      return (r.index === 0 && pr.along < radius + HOP_PORT_CLEAR)
        || (r.index === r.wire.points.length - 2 && pr.length - pr.along < radius + HOP_PORT_CLEAR)
    })
    if (owners.length === 0 || nearEnd) continue
    hopped++
    for (const r of owners) {
      const ru = unit(r.a, r.b)
      const at = project(p, r.a, r.b).along
      const key = `${r.wire.id}|${r.index}`
      if (!raw.has(key)) raw.set(key, [])
      raw.get(key)!.push({
        segment: r.index,
        from: { x: p.x - ru.x * radius, y: p.y - ru.y * radius },
        to: { x: p.x + ru.x * radius, y: p.y + ru.y * radius },
        radius,
        nets: [under.net],
        at,
      })
    }
  }

  // Join hops on one segment that are too close
  for (const [key, list] of raw) {
    const wireId = key.slice(0, key.lastIndexOf('|'))
    list.sort((a, b) => a.at - b.at)
    const joined: Array<WireHop & { at: number; end: number }> = []
    for (const h of list) {
      const last = joined[joined.length - 1]
      const start = h.at - h.radius, end = h.at + h.radius
      if (last && start - last.end < HOP_GAP) {
        if (end > last.end) { last.end = end; last.to = h.to }
        last.radius = Math.max(last.radius, h.radius)
        for (const net of h.nets ?? []) if (!last.nets!.includes(net)) last.nets!.push(net)
      } else {
        joined.push({ ...h, nets: [...(h.nets ?? [])], end })
      }
    }
    if (!hops.has(wireId)) hops.set(wireId, [])
    hops.get(wireId)!.push(...joined.map(({ segment, from, to, radius, nets }) => ({ segment, from, to, radius, nets })))
  }
  for (const list of hops.values()) list.sort((a, b) => a.segment - b.segment)

  // Junctions of each net
  for (const [net, ws] of netWires) {
    if (ws.length < 2) continue
    const segs = unionByNet.get(net) ?? []
    const segIndex = new LineIndex<Seg>()
    for (const sg of segs) segIndex.add(sg, { x: sg.x1, y: sg.y1 })
    const same = (a: DecoPoint, b: DecoPoint) => Math.abs(a.x - b.x) <= TOL && Math.abs(a.y - b.y) <= TOL
    const endList = ws.flatMap(w => [w.points[0], w.points[w.points.length - 1]])
    const ends = { has: (q: DecoPoint) => endList.some(e => same(e, q)) }
    const seenList: DecoPoint[] = []
    const seen = { has: (q: DecoPoint) => seenList.some(e => same(e, q)), add: (q: DecoPoint) => { seenList.push(q) } }
    for (const w of ws) {
      for (let i = 1; i + 1 < w.points.length; i++) {
        const q = w.points[i]
        if (ends.has(q) || seen.has(q)) continue
        seen.add(q)
        const dirs = new Set<number>()
        const addDir = (to: DecoPoint) => {
          const deg = Math.round(Math.atan2(to.y - q.y, to.x - q.x) * 180 / Math.PI)
          dirs.add(((deg % 360) + 360) % 360)
        }
        for (const s of segIndex.through(q)) {
          const a = { x: s.x1, y: s.y1 }, b = { x: s.x2, y: s.y2 }
          const pr = project(q, a, b)
          if (pr.dist > TOL) continue
          if (pr.along > TOL) addDir(a)
          if (pr.along < pr.length - TOL) addDir(b)
        }
        if (dirs.size < 3) continue
        const lines = ws[0].lines ?? 1
        const j = { x: q.x, y: q.y, radius: junctionRadius(lines) }
        junctions.push({ ...j, net })
        // The first wire of the net that passes through the point draws the dot
        const owner = ws.find(o => o.points.some((a, k) =>
          k + 1 < o.points.length && project(q, a, o.points[k + 1]).dist <= TOL)) ?? w
        if (!dots.has(owner.id)) dots.set(owner.id, [])
        dots.get(owner.id)!.push(j)
      }
    }
  }

  return { hops, dots, junctions, crossings: pairs.length, hopped }
}

// --- Drawing helpers ----------------------------------------------------------

/**
 * The hops that still fit a segment as it is drawn now. The canvas computes
 * the hops from the model geometry; a wire whose segment has moved (while a
 * segment is dragged, for example) keeps only the hops that are still on it.
 * The hops are snapped onto the segment.
 */
export function hopsOnSegment(a: DecoPoint, b: DecoPoint, hops: WireHop[] | undefined, segment: number): WireHop[] {
  if (!hops || hops.length === 0) return []
  const out: WireHop[] = []
  const u = unit(a, b), l = len(sub(b, a))
  for (const h of hops) {
    if (h.segment !== segment) continue
    const pf = project(h.from, a, b), pt = project(h.to, a, b)
    if (pf.dist > 1.5 || pt.dist > 1.5 || pf.along < 0 || pt.along > l || pt.along <= pf.along) continue
    out.push({
      segment,
      from: { x: a.x + u.x * pf.along, y: a.y + u.y * pf.along },
      to: { x: a.x + u.x * pt.along, y: a.y + u.y * pt.along },
      radius: h.radius,
    })
  }
  return out.sort((p, q) => project(p.from, a, b).along - project(q.from, a, b).along)
}

/** True when the point is on the polyline (within 1.5 px). */
export function pointOnPolyline(p: DecoPoint, points: DecoPoint[]): boolean {
  for (let i = 0; i + 1 < points.length; i++) {
    if (project(p, points[i], points[i + 1]).dist <= 1.5) return true
  }
  return false
}

const fmt = (v: number) => String(Math.round(v * 100) / 100)

/**
 * SVG path of one segment from a to b with its hops: straight runs, and for
 * each hop a quarter arc up, a straight run at the hop height (only for joined
 * hops) and a quarter arc down. `hops` must be on the segment (hopsOnSegment()).
 */
export function segmentPathWithHops(a: DecoPoint, b: DecoPoint, hops: WireHop[]): string {
  let d = `M ${fmt(a.x)} ${fmt(a.y)}`
  const u = unit(a, b)
  const n = hopNormal(u)
  // SVG sweep flag: 1 when the turn from the start radius to the end radius is clockwise on screen
  const sweep = n.x * u.y - n.y * u.x > 0 ? 1 : 0
  for (const h of hops) {
    const r = h.radius
    const top1 = { x: h.from.x + u.x * r + n.x * r, y: h.from.y + u.y * r + n.y * r }
    const top2 = { x: h.to.x - u.x * r + n.x * r, y: h.to.y - u.y * r + n.y * r }
    d += ` L ${fmt(h.from.x)} ${fmt(h.from.y)}`
    d += ` A ${fmt(r)} ${fmt(r)} 0 0 ${sweep} ${fmt(top1.x)} ${fmt(top1.y)}`
    if (len(sub(top2, top1)) > 0.01) d += ` L ${fmt(top2.x)} ${fmt(top2.y)}`
    d += ` A ${fmt(r)} ${fmt(r)} 0 0 ${sweep} ${fmt(h.to.x)} ${fmt(h.to.y)}`
  }
  d += ` L ${fmt(b.x)} ${fmt(b.y)}`
  return d
}

/**
 * The polyline of a wire with its hops as sampled arcs, for a renderer that
 * draws straight lines (the PDF). `steps` is the number of pieces in each
 * quarter arc.
 */
export function polylineWithHops(points: DecoPoint[], hops: WireHop[] | undefined, steps = 8): DecoPoint[] {
  if (!hops || hops.length === 0) return points.map(p => ({ x: p.x, y: p.y }))
  const out: DecoPoint[] = [{ x: points[0].x, y: points[0].y }]
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1]
    const on = hopsOnSegment(a, b, hops, i)
    const u = unit(a, b)
    const n = hopNormal(u)
    for (const h of on) {
      const r = h.radius
      out.push({ ...h.from })
      // Quarter arc up: centre at from + r u
      const c1 = { x: h.from.x + u.x * r, y: h.from.y + u.y * r }
      for (let k = 1; k <= steps; k++) {
        const t = (k / steps) * Math.PI / 2
        out.push({ x: c1.x - u.x * r * Math.cos(t) + n.x * r * Math.sin(t), y: c1.y - u.y * r * Math.cos(t) + n.y * r * Math.sin(t) })
      }
      // Quarter arc down: centre at to - r u
      const c2 = { x: h.to.x - u.x * r, y: h.to.y - u.y * r }
      for (let k = 0; k <= steps; k++) {
        const t = (k / steps) * Math.PI / 2
        out.push({ x: c2.x + u.x * r * Math.sin(t) + n.x * r * Math.cos(t), y: c2.y + u.y * r * Math.sin(t) + n.y * r * Math.cos(t) })
      }
    }
    out.push({ x: b.x, y: b.y })
  }
  // Remove repeated points (a hop end on the arc end)
  return out.filter((p, i) => i === 0 || Math.abs(p.x - out[i - 1].x) > 1e-6 || Math.abs(p.y - out[i - 1].y) > 1e-6)
}

// --- Sheet adapter (canvas) ---------------------------------------------------

/**
 * The wires of a sheet as the canvas draws them, from the model geometry:
 * each wire from HANDLE_OUTSET px outside its source port to HANDLE_OUTSET px
 * outside its target port (layoutMetrics.ts, the same polylines as the layout
 * score). Enable and reset wires, and wires to a comment or to a block that is
 * not on the sheet, are left out.
 */
export function sheetDecorationWires(
  blocks: BlockData[],
  wires: WireData[],
  lineCountOf: (wireId: string) => number = () => 1,
): DecorationWire[] {
  const geom = new Map<string, ReturnType<typeof blockWireGeometry>>()
  for (const b of blocks) if (b.type !== 'comment') geom.set(b.id, blockWireGeometry(b))
  const out: DecorationWire[] = []
  for (const w of wires) {
    if (w.targetPortIndex < 0) continue
    const s = geom.get(w.sourceBlockId), t = geom.get(w.targetBlockId)
    if (!s || !t) continue
    out.push({
      id: w.id,
      net: `${w.sourceBlockId}:${w.sourcePortIndex}`,
      points: wirePolyline(s.sourceEnd(w.sourcePortIndex), t.targetEnd(w.targetPortIndex), w.routing, { source: s.rect, target: t.rect }),
      lines: lineCountOf(w.id),
    })
  }
  return out
}

// Orthogonal wire routing for laid-out sheets.
//
// The editor draws every wire as three segments: horizontal from the source
// port, one vertical "turn", horizontal into the target port. By default the
// turn sits midway between the two ports, so wires leaving a multi-output
// block turn at nearly the same x: their vertical segments stack on top of
// each other and often run straight through whatever block sits midway.
//
// This router decides where each wire turns:
//   1. Each wire's turn goes in one of the gaps between block columns it
//      spans, chosen by local search on the cost of its drawn segments:
//      crossings + 2 x overlaps + 4 x passes through a block.
//   2. Within a gap, wires from the same output port (a net) share a track,
//      which reads as a junction.
//   3. Tracks are ordered left to right to minimise crossings among them, and
//      spaced `trackSpacing` apart. The caller widens crowded gaps.
//
// The result is a turn x per wire, which the caller stores as the wire's
// `routing.midpointOffset` (relative to the editor's default midpoint).

export interface RoutingColumn {
  left: number
  right: number
}

export interface RoutingRect {
  x: number
  y: number
  w: number
  h: number
}

export interface RoutableWire {
  id: string
  /** Wires sharing a net (same source port) may share a track. */
  net: string
  src: string
  tgt: string
  /** Column indices (into `columns`) of the source and target blocks. */
  srcCol: number
  tgtCol: number
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface WireRoutingOptions {
  trackSpacing?: number
  /** Clearance between a column's blocks and the nearest track. */
  margin?: number
  passes?: number
}

export interface WireRoutingResult {
  /** Turn x for each routed wire. Wires not listed keep the default midpoint. */
  turnX: Map<string, number>
  /** Distinct tracks (nets) placed in each gap, keyed by the gap's left column index. */
  tracksPerGap: Map<number, number>
}

const OVERLAP_WEIGHT = 2
const BLOCK_WEIGHT = 4

interface Seg {
  net: string
  horizontal: boolean
  /** y for a horizontal segment, x for a vertical one */
  at: number
  from: number
  to: number
  src: string
  tgt: string
}

function segmentsOf(w: RoutableWire, turn: number): Seg[] {
  const base = { net: w.net, src: w.src, tgt: w.tgt }
  const segs: Seg[] = [
    { ...base, horizontal: true, at: w.y1, from: Math.min(w.x1, turn), to: Math.max(w.x1, turn) },
    { ...base, horizontal: true, at: w.y2, from: Math.min(turn, w.x2), to: Math.max(turn, w.x2) },
  ]
  if (Math.abs(w.y1 - w.y2) > 0.5) {
    segs.push({ ...base, horizontal: false, at: turn, from: Math.min(w.y1, w.y2), to: Math.max(w.y1, w.y2) })
  }
  return segs
}

/** Cost of two segments from different nets: a crossing, an overlap, or nothing. */
function pairCost(p: Seg, q: Seg): number {
  if (p.net === q.net) return 0
  if (p.horizontal !== q.horizontal) {
    const h = p.horizontal ? p : q
    const v = p.horizontal ? q : p
    const crosses = v.at > h.from + 0.5 && v.at < h.to - 0.5 && h.at > v.from + 0.5 && h.at < v.to - 0.5
    return crosses ? 1 : 0
  }
  if (Math.abs(p.at - q.at) > 2) return 0
  return Math.min(p.to, q.to) - Math.max(p.from, q.from) > 2 ? OVERLAP_WEIGHT : 0
}

function blockCost(s: Seg, rects: Map<string, RoutingRect>): number {
  let n = 0
  for (const [id, r] of rects) {
    if (id === s.src || id === s.tgt) continue
    const hit = s.horizontal
      ? s.at > r.y + 1 && s.at < r.y + r.h - 1 && s.to > r.x + 1 && s.from < r.x + r.w - 1
      : s.at > r.x + 1 && s.at < r.x + r.w - 1 && s.to > r.y + 1 && s.from < r.y + r.h - 1
    if (hit) n++
  }
  return n * BLOCK_WEIGHT
}

export function routeWires(
  columns: RoutingColumn[],
  rects: Map<string, RoutingRect>,
  wires: RoutableWire[],
  options: WireRoutingOptions = {},
): WireRoutingResult {
  const trackSpacing = options.trackSpacing ?? 8
  const margin = options.margin ?? 14
  const passes = options.passes ?? 4

  const gapCentre = (gap: number) => (columns[gap].right + columns[gap + 1].left) / 2
  const routable = (w: RoutableWire) =>
    w.tgtCol > w.srcCol && w.x2 > w.x1 && Math.abs(w.y1 - w.y2) >= 1

  const live = wires.filter(routable)
  const gapOf = new Map<string, number>()
  for (const w of live) {
    // Seed: the gap holding the editor's default midpoint, else the last spanned gap.
    const mid = (w.x1 + w.x2) / 2
    let seed = w.tgtCol - 1
    for (let gap = w.srcCol; gap < w.tgtCol; gap++) {
      if (mid >= columns[gap].right && mid <= columns[gap + 1].left) seed = gap
    }
    gapOf.set(w.id, seed)
  }

  // Wires we do not route still occupy the canvas at their default midpoint.
  const turnOf = (w: RoutableWire) =>
    gapOf.has(w.id) ? gapCentre(gapOf.get(w.id)!) : (w.x1 + w.x2) / 2

  // 1. Local search: move each wire's turn to the gap where its segments cost least.
  for (let pass = 0; pass < passes; pass++) {
    const segs = new Map(wires.map(w => [w.id, segmentsOf(w, turnOf(w))]))
    let changed = false
    for (const w of live) {
      const others: Seg[] = []
      for (const o of wires) if (o.id !== w.id) others.push(...segs.get(o.id)!)
      const current = gapOf.get(w.id)!
      let best = current
      let bestCost = Infinity
      for (let gap = w.srcCol; gap < w.tgtCol; gap++) {
        let cost = 0
        for (const s of segmentsOf(w, gapCentre(gap))) {
          cost += blockCost(s, rects)
          for (const o of others) cost += pairCost(s, o)
        }
        // Prefer the current gap on ties, so the search settles.
        if (cost < bestCost - 1e-9 || (Math.abs(cost - bestCost) < 1e-9 && gap === current)) {
          bestCost = cost
          best = gap
        }
      }
      if (best !== current) {
        gapOf.set(w.id, best)
        segs.set(w.id, segmentsOf(w, gapCentre(best)))
        changed = true
      }
    }
    if (!changed) break
  }

  // 2/3. Per gap: one track per net, ordered to minimise crossings, then spaced.
  const byGap = new Map<number, RoutableWire[]>()
  for (const w of live) {
    const gap = gapOf.get(w.id)!
    if (!byGap.has(gap)) byGap.set(gap, [])
    byGap.get(gap)!.push(w)
  }

  const turnX = new Map<string, number>()
  const tracksPerGap = new Map<number, number>()
  for (const [gap, members] of byGap) {
    interface Track { entries: number[]; exits: number[]; min: number; max: number; ids: string[] }
    const nets = new Map<string, Track>()
    for (const w of members) {
      let t = nets.get(w.net)
      if (!t) {
        t = { entries: [w.y1], exits: [], min: w.y1, max: w.y1, ids: [] }
        nets.set(w.net, t)
      }
      t.exits.push(w.y2)
      t.ids.push(w.id)
      t.min = Math.min(t.min, w.y2)
      t.max = Math.max(t.max, w.y2)
    }
    const tracks = [...nets.values()]
    const within = (y: number, t: Track) => y > t.min + 0.5 && y < t.max - 0.5
    // Crossings if track a sits left of track b: b's incoming run passes a's
    // vertical, and a's outgoing runs pass b's vertical.
    const leftOfCost = (a: Track, b: Track) =>
      b.entries.filter(y => within(y, a)).length + a.exits.filter(y => within(y, b)).length
    // Pairwise preferences need not be transitive, so rank globally first:
    // each track scores how much better it does on the left of every other
    // track (a Borda count), then adjacent swaps refine. Swapping neighbours
    // only changes their own pair's cost, so each swap is a true improvement.
    const score = new Map<Track, number>()
    for (const a of tracks) {
      let sc = 0
      for (const b of tracks) if (a !== b) sc += leftOfCost(b, a) - leftOfCost(a, b)
      score.set(a, sc)
    }
    tracks.sort((a, b) => (score.get(b)! - score.get(a)!) || ((a.min + a.max) - (b.min + b.max)))
    let swapped = true
    let rounds = 0
    while (swapped && rounds++ < tracks.length * 2) {
      swapped = false
      for (let i = 0; i + 1 < tracks.length; i++) {
        if (leftOfCost(tracks[i + 1], tracks[i]) < leftOfCost(tracks[i], tracks[i + 1])) {
          ;[tracks[i], tracks[i + 1]] = [tracks[i + 1], tracks[i]]
          swapped = true
        }
      }
    }

    tracksPerGap.set(gap, tracks.length)
    const left = columns[gap].right + margin
    const right = columns[gap + 1].left - margin
    const n = tracks.length
    const step = n > 1 ? Math.min(trackSpacing, Math.max(0, right - left) / (n - 1)) : 0
    const start = (left + right) / 2 - (step * (n - 1)) / 2
    tracks.forEach((t, i) => {
      for (const id of t.ids) turnX.set(id, start + i * step)
    })
  }

  return { turnX, tracksPerGap }
}

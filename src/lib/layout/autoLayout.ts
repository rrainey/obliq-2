// Auto-layout for signal-flow block diagrams.
//
// Sugiyama-style layered layout tailored to signal diagrams:
//   1. Classify blocks (sources / sinks / annotations).
//   2. Build a port-aware directed graph from wires; break back-edges
//      (feedback loops) via DFS so ranking sees only forward flow.
//   3. Rank via longest-path from sources -> left-to-right flow. Sinks are
//      hoisted to the rightmost column.
//   4. Order within columns using a *port-aware* barycenter, so the vertical
//      order of a block's output ports drives the vertical order of the
//      blocks it feeds.
//   5. Assign y-coordinates by pulling each block toward the port that feeds
//      it, then resolving overlaps optimally with isotonic regression.
//
// Feedback loops with chained dynamic/discontinuous blocks: because back-edges
// are excluded from ranking, the block closer to the input (shorter forward
// path from a source) always ends up in a lower-index column -- exactly what a
// multi-order integrator chain needs.
//
// Geometry (block sizes, port offsets) comes from blockGeometry.ts, which the
// canvas renderer also uses, so computed port coordinates match what is drawn.

import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'
import { PortCountAdapter } from '@/lib/validation/PortCountAdapter'
import { isResizable, RESIZE_SNAP, RESIZE_MIN_WIDTH } from '@/lib/blocks/resizableBlocks'
import {
  getBlockWidth,
  getBlockHeight,
  getIntrinsicBlockHeight,
  portOffsetY,
  portFraction,
} from './blockGeometry'

export interface AutoLayoutOptions {
  columnSpacing?: number   // horizontal gap between columns (px)
  rowSpacing?: number      // minimum vertical gap between blocks in a column (px)
  originX?: number         // x of leftmost column
  originY?: number         // y of the layout's vertical center
  barycenterPasses?: number
  alignmentPasses?: number // port-alignment refinement iterations
  /**
   * Allow the layout to resize resizable blocks (currently subsystems) so
   * their ports spread far enough apart for neighbours to line up with them.
   * Off by default: resizing writes model data, so it is an explicit opt-in.
   */
  resizeBlocks?: boolean
  maxBlockHeight?: number  // ceiling when resizing (px)
  resizePasses?: number    // resize/replace refinement iterations
}

export interface LayoutMove {
  id: string
  position: { x: number; y: number }
}

/** A block whose stored dimensions the layout wants to change. */
export interface LayoutResize {
  id: string
  width: number
  height: number
}

export interface AutoLayoutResult {
  moves: LayoutMove[]
  /** Empty unless `resizeBlocks` was enabled. */
  resizes: LayoutResize[]
}

// --- Block classification -------------------------------------------------

const SOURCE_TYPES = new Set<string>([
  'input_port',
  'source',
  'sheet_label_source',
  'data_store_read',
  'clock',
])

const SINK_TYPES = new Set<string>([
  'output_port',
  'signal_display',
  'signal_logger',
  'sheet_label_sink',
  'data_store_write',
])

// Blocks that carry no signal-flow meaning; leave them where the user put them.
const ANNOTATION_TYPES = new Set<string>(['comment'])

function isSource(type: string) { return SOURCE_TYPES.has(type) }
function isSink(type: string) { return SINK_TYPES.has(type) }
function isAnnotation(type: string) { return ANNOTATION_TYPES.has(type) }

// --- Geometry -------------------------------------------------------------

interface Metrics {
  width: number
  height: number
  inputs: number       // effective input port count
  outputs: number      // effective output port count
  minHeight: number    // natural height; a resize may not go below this
  resizable: boolean
}

function measure(block: BlockData): Metrics {
  const counts = PortCountAdapter.getPortCounts(block)
  // Mirror BlockNode: an Output Port block reports an output it does not draw.
  const outputs = block.type === 'output_port' ? 0 : counts.outputCount
  const inputs = counts.inputCount
  return {
    width: getBlockWidth(block),
    height: getBlockHeight(block, inputs, outputs),
    inputs,
    outputs,
    minHeight: getIntrinsicBlockHeight(block, inputs, outputs),
    resizable: isResizable(block.type),
  }
}

// --- Graph construction ---------------------------------------------------

/** One wire, retaining the port indices the ordering and alignment need. */
interface LEdge {
  u: string      // source block id
  uPort: number  // source port index
  v: string      // target block id
  vPort: number  // target port index
}

interface Graph {
  nodes: string[]
  /** All edges except self-loops, including feedback edges. */
  edges: LEdge[]
  /** Edges keyed by source / target, for ordering. */
  outEdges: Map<string, LEdge[]>
  inEdges: Map<string, LEdge[]>
  /** Deduplicated forward-only adjacency, for ranking. */
  fwdOut: Map<string, Set<string>>
  fwdIn: Map<string, Set<string>>
}

function buildGraph(
  blocks: BlockData[],
  wires: WireData[],
): { graph: Graph; laidOut: BlockData[] } {
  const laidOut = blocks.filter(b => !isAnnotation(b.type))
  const nodes = laidOut.map(b => b.id)
  const nodeSet = new Set(nodes)
  const typeOf = new Map(laidOut.map(b => [b.id, b.type]))

  const edges: LEdge[] = []
  const outEdges = new Map<string, LEdge[]>()
  const inEdges = new Map<string, LEdge[]>()
  const adjOut = new Map<string, Set<string>>()
  for (const id of nodes) {
    outEdges.set(id, [])
    inEdges.set(id, [])
    adjOut.set(id, new Set())
  }

  for (const w of wires) {
    if (!nodeSet.has(w.sourceBlockId) || !nodeSet.has(w.targetBlockId)) continue
    if (w.sourceBlockId === w.targetBlockId) continue // ignore self-loops
    // Control ports (enable/reset) use negative indices; treat them as port 0
    // for geometry purposes since they attach top/bottom rather than left/right.
    const e: LEdge = {
      u: w.sourceBlockId,
      uPort: Math.max(0, w.sourcePortIndex),
      v: w.targetBlockId,
      vPort: Math.max(0, w.targetPortIndex),
    }
    edges.push(e)
    outEdges.get(e.u)!.push(e)
    inEdges.get(e.v)!.push(e)
    adjOut.get(e.u)!.add(e.v)
  }

  // Detect back-edges via three-colour DFS. Visit sources first so forward
  // orientation is preferred.
  const color = new Map<string, 'white' | 'gray' | 'black'>()
  for (const id of nodes) color.set(id, 'white')
  const backEdges = new Set<string>() // key: "src->tgt"

  const dfs = (start: string) => {
    // Iterative to avoid blowing the stack on large sheets.
    const stack: Array<{ id: string; iter: Iterator<string> }> = []
    color.set(start, 'gray')
    stack.push({ id: start, iter: adjOut.get(start)![Symbol.iterator]() })
    while (stack.length) {
      const frame = stack[stack.length - 1]
      const next = frame.iter.next()
      if (next.done) {
        color.set(frame.id, 'black')
        stack.pop()
        continue
      }
      const v = next.value
      const c = color.get(v)
      if (c === 'gray') {
        backEdges.add(`${frame.id}->${v}`)
      } else if (c === 'white') {
        color.set(v, 'gray')
        stack.push({ id: v, iter: adjOut.get(v)![Symbol.iterator]() })
      }
    }
  }

  const dfsOrder = [
    ...nodes.filter(id => isSource(typeOf.get(id)!)),
    ...nodes.filter(id => !isSource(typeOf.get(id)!)),
  ]
  for (const id of dfsOrder) if (color.get(id) === 'white') dfs(id)

  const fwdOut = new Map<string, Set<string>>()
  const fwdIn = new Map<string, Set<string>>()
  for (const id of nodes) {
    fwdOut.set(id, new Set())
    fwdIn.set(id, new Set())
  }
  for (const [u, outs] of adjOut) {
    for (const v of outs) {
      if (backEdges.has(`${u}->${v}`)) continue
      fwdOut.get(u)!.add(v)
      fwdIn.get(v)!.add(u)
    }
  }

  return { graph: { nodes, edges, outEdges, inEdges, fwdOut, fwdIn }, laidOut }
}

// --- Ranking (column assignment) -----------------------------------------

function assignRanks(graph: Graph, laidOut: BlockData[]): Map<string, number> {
  const rank = new Map<string, number>()
  const typeOf = new Map(laidOut.map(b => [b.id, b.type]))

  // Longest-path rank on the DAG, in Kahn topological order.
  const indeg = new Map<string, number>()
  for (const id of graph.nodes) indeg.set(id, graph.fwdIn.get(id)!.size)
  const queue: string[] = []
  for (const id of graph.nodes) if (indeg.get(id) === 0) queue.push(id)

  const topo: string[] = []
  while (queue.length) {
    const u = queue.shift()!
    topo.push(u)
    for (const v of graph.fwdOut.get(u)!) {
      indeg.set(v, indeg.get(v)! - 1)
      if (indeg.get(v) === 0) queue.push(v)
    }
  }

  for (const u of topo) {
    let r = 0
    for (const p of graph.fwdIn.get(u)!) r = Math.max(r, (rank.get(p) ?? 0) + 1)
    rank.set(u, r)
  }
  for (const id of graph.nodes) if (!rank.has(id)) rank.set(id, 0)

  // Hoist sinks to the rightmost column.
  let maxNonSinkRank = 0
  for (const id of graph.nodes) {
    if (!isSink(typeOf.get(id)!)) maxNonSinkRank = Math.max(maxNonSinkRank, rank.get(id)!)
  }
  const sinkRank = maxNonSinkRank + 1
  for (const id of graph.nodes) if (isSink(typeOf.get(id)!)) rank.set(id, sinkRank)

  return rank
}

// --- Within-column ordering (port-aware crossing reduction) ---------------

/**
 * Order each column by barycenter, where a neighbour's contribution is its
 * column index plus the *normalised position of the port* the wire attaches
 * to. A subsystem at index 2 with four outputs contributes 2.2, 2.4, 2.6, 2.8
 * for ports 0..3, so the blocks it feeds sort into its port order rather than
 * an arbitrary one.
 */
function orderWithinColumns(
  graph: Graph,
  rank: Map<string, number>,
  laidOut: BlockData[],
  metrics: Map<string, Metrics>,
  passes: number,
): Map<number, string[]> {
  const columns = new Map<number, string[]>()
  for (const id of graph.nodes) {
    const r = rank.get(id)!
    if (!columns.has(r)) columns.set(r, [])
    columns.get(r)!.push(id)
  }

  // Seed ordering: original y, then name, for continuity and determinism.
  const posY = new Map(laidOut.map(b => [b.id, b.position?.y ?? 0]))
  const nameOf = new Map(laidOut.map(b => [b.id, b.name ?? b.id]))
  for (const [, ids] of columns) {
    ids.sort((a, b) => {
      const ya = posY.get(a)!, yb = posY.get(b)!
      if (ya !== yb) return ya - yb
      return nameOf.get(a)!.localeCompare(nameOf.get(b)!)
    })
  }

  const sortedRanks = [...columns.keys()].sort((a, b) => a - b)
  const maxRank = sortedRanks[sortedRanks.length - 1] ?? 0

  const barycenterFrom = (
    id: string,
    neighbourIndex: Map<string, number>,
    edges: LEdge[],
    /** For in-edges we read the source's output port; for out-edges the target's input port. */
    direction: 'in' | 'out',
  ): number => {
    let sum = 0, n = 0
    for (const e of edges) {
      const other = direction === 'in' ? e.u : e.v
      const idx = neighbourIndex.get(other)
      if (idx === undefined) continue
      const m = metrics.get(other)!
      const pos = direction === 'in'
        ? idx + portFraction(e.uPort, m.outputs)
        : idx + portFraction(e.vPort, m.inputs)
      sum += pos
      n++
    }
    return n > 0 ? sum / n : (neighbourIndex.get(id) ?? 0)
  }

  for (let pass = 0; pass < passes; pass++) {
    // Forward sweep: order each column by its predecessors' port positions.
    for (let c = 1; c <= maxRank; c++) {
      const prevIndex = new Map((columns.get(c - 1) ?? []).map((id, i) => [id, i]))
      const col = columns.get(c) ?? []
      const key = new Map(col.map(id =>
        [id, barycenterFrom(id, prevIndex, graph.inEdges.get(id)!, 'in')]))
      col.sort((a, b) => key.get(a)! - key.get(b)!)
    }
    // Backward sweep: order each column by its successors' port positions.
    for (let c = maxRank - 1; c >= 0; c--) {
      const nextIndex = new Map((columns.get(c + 1) ?? []).map((id, i) => [id, i]))
      const col = columns.get(c) ?? []
      const key = new Map(col.map(id =>
        [id, barycenterFrom(id, nextIndex, graph.outEdges.get(id)!, 'out')]))
      col.sort((a, b) => key.get(a)! - key.get(b)!)
    }
  }

  return columns
}

// --- Coordinate assignment (port-aligned) --------------------------------

/**
 * Weighted isotonic regression via pool-adjacent-violators.
 *
 * Places blocks at the y-values closest (least squares) to their desired
 * positions while guaranteeing they stay in the given order with at least
 * `gap` pixels between them. This is the exact optimum for that constraint
 * set, which beats ad-hoc "push down until it fits" passes -- those bias the
 * whole column in one direction.
 */
function isotonicPlace(
  desired: number[],
  weights: number[],
  heights: number[],
  gap: number,
): number[] {
  const n = desired.length
  if (n === 0) return []

  // y[i] = z[i] + offset[i] turns the spacing constraint into z[i+1] >= z[i].
  const offset: number[] = new Array(n)
  offset[0] = 0
  for (let i = 1; i < n; i++) offset[i] = offset[i - 1] + heights[i - 1] + gap

  const target = desired.map((d, i) => d - offset[i])

  // Pool adjacent violators: merge while the running mean would decrease.
  const blocks: Array<{ wsum: number; wtsum: number; count: number }> = []
  for (let i = 0; i < n; i++) {
    const w = Math.max(weights[i], 1e-6)
    blocks.push({ wsum: w, wtsum: w * target[i], count: 1 })
    while (blocks.length >= 2) {
      const top = blocks[blocks.length - 1]
      const prev = blocks[blocks.length - 2]
      if (top.wtsum / top.wsum >= prev.wtsum / prev.wsum) break
      prev.wsum += top.wsum
      prev.wtsum += top.wtsum
      prev.count += top.count
      blocks.pop()
    }
  }

  const z: number[] = new Array(n)
  let i = 0
  for (const b of blocks) {
    const mean = b.wtsum / b.wsum
    for (let k = 0; k < b.count; k++) z[i++] = mean
  }

  return z.map((zi, idx) => zi + offset[idx])
}

interface Placement {
  y: Map<string, number>
}

/** Column x-positions and widths; independent of vertical placement. */
function computeColumnGeometry(
  columns: Map<number, string[]>,
  metrics: Map<string, Metrics>,
  opts: Required<AutoLayoutOptions>,
) {
  const sortedRanks = [...columns.keys()].sort((a, b) => a - b)
  const colWidth = new Map<number, number>()
  for (const c of sortedRanks) {
    let w = 0
    for (const id of columns.get(c)!) w = Math.max(w, metrics.get(id)!.width)
    colWidth.set(c, Math.max(w, 1))
  }
  const colX = new Map<number, number>()
  let x = opts.originX
  for (const c of sortedRanks) {
    colX.set(c, x)
    x += colWidth.get(c)! + opts.columnSpacing
  }
  return { sortedRanks, colWidth, colX }
}

/**
 * Vertical placement: pull each block toward the port that feeds it, then
 * resolve overlaps optimally. Returns raw (uncentred) y values so the caller
 * can iterate on block sizes before committing to a final position.
 */
function computePlacement(
  graph: Graph,
  columns: Map<number, string[]>,
  rank: Map<string, number>,
  metrics: Map<string, Metrics>,
  opts: Required<AutoLayoutOptions>,
): Map<string, number> {
  const sortedRanks = [...columns.keys()].sort((a, b) => a - b)
  const y = new Map<string, number>()

  // Seed: each column stacked and centred on 0.
  for (const c of sortedRanks) {
    const ids = columns.get(c)!
    let totalH = 0
    for (const id of ids) totalH += metrics.get(id)!.height
    totalH += Math.max(0, ids.length - 1) * opts.rowSpacing
    let cursor = -totalH / 2
    for (const id of ids) {
      y.set(id, cursor)
      cursor += metrics.get(id)!.height + opts.rowSpacing
    }
  }

  const sourcePortY = (e: LEdge) => {
    const m = metrics.get(e.u)!
    return y.get(e.u)! + portOffsetY(e.uPort, m.outputs, m.height)
  }
  const targetPortY = (e: LEdge) => {
    const m = metrics.get(e.v)!
    return y.get(e.v)! + portOffsetY(e.vPort, m.inputs, m.height)
  }

  // Only edges that actually flow left-to-right inform alignment. Feedback
  // edges run against the grain, and pulling a block toward a far-downstream
  // source drags it away from everything it genuinely feeds.
  const isForward = (e: LEdge) => rank.get(e.u)! < rank.get(e.v)!

  /** Total vertical misalignment across forward wires; lower is straighter. */
  const misalignment = (): number => {
    let cost = 0
    for (const e of graph.edges) {
      if (!isForward(e)) continue
      cost += Math.abs(sourcePortY(e) - targetPortY(e))
    }
    return cost
  }

  const snapshot = (): Placement => ({ y: new Map(y) })
  const restore = (p: Placement) => { for (const [k, v] of p.y) y.set(k, v) }

  const placeColumn = (c: number, direction: 'forward' | 'backward') => {
    const ids = columns.get(c)!
    if (ids.length === 0) return

    const desired: number[] = []
    const weights: number[] = []
    const heights: number[] = []

    for (const id of ids) {
      const m = metrics.get(id)!
      heights.push(m.height)

      // Pull this block so its own port lines up with the port at the far end.
      let sum = 0, n = 0
      if (direction === 'forward') {
        for (const e of graph.inEdges.get(id)!) {
          if (!isForward(e)) continue
          sum += sourcePortY(e) - portOffsetY(e.vPort, m.inputs, m.height)
          n++
        }
      } else {
        for (const e of graph.outEdges.get(id)!) {
          if (!isForward(e)) continue
          sum += targetPortY(e) - portOffsetY(e.uPort, m.outputs, m.height)
          n++
        }
      }

      if (n > 0) {
        desired.push(sum / n)
        weights.push(n)
      } else {
        // Nothing to align to; hold position, but weakly so neighbours can
        // push this block aside rather than being blocked by it.
        desired.push(y.get(id)!)
        weights.push(0.25)
      }
    }

    const placed = isotonicPlace(desired, weights, heights, opts.rowSpacing)
    ids.forEach((id, i) => y.set(id, placed[i]))
  }

  // Alternate sweeps. Each sweep is feasible by construction, so the only
  // risk is a small limit cycle -- keep the best iterate rather than the last.
  let best = snapshot()
  let bestCost = misalignment()
  for (let pass = 0; pass < opts.alignmentPasses; pass++) {
    for (let i = 1; i < sortedRanks.length; i++) placeColumn(sortedRanks[i], 'forward')
    for (let i = sortedRanks.length - 2; i >= 0; i--) placeColumn(sortedRanks[i], 'backward')
    const cost = misalignment()
    if (cost < bestCost) {
      bestCost = cost
      best = snapshot()
    }
  }
  restore(best)

  return y
}

/**
 * Fit a new height to each resizable block so its ports land on the
 * neighbours they connect to.
 *
 * A block's port p sits at `top + height * fraction(p)`, so across all of a
 * block's connections the desired port positions are linear in the height:
 * regressing target-y against port-fraction gives `top` as the intercept and
 * the best-fitting **height as the slope**. Two connections at distinct port
 * fractions are enough to determine it.
 *
 * This is what makes alignment reachable at all. Neighbours need
 * `height + rowSpacing` of clearance between them, while a block's ports are
 * only `height / (portCount + 1)` apart, so at natural size a multi-port
 * subsystem simply cannot spread its ports far enough for its neighbours to
 * line up. Growing the block fixes that.
 *
 * Mutates `metrics`; returns whether anything moved materially.
 */
function refitResizableBlocks(
  graph: Graph,
  y: Map<string, number>,
  metrics: Map<string, Metrics>,
  rank: Map<string, number>,
  opts: Required<AutoLayoutOptions>,
): boolean {
  const isForward = (e: LEdge) => rank.get(e.u)! < rank.get(e.v)!
  let changed = false

  for (const [id, m] of metrics) {
    if (!m.resizable) continue

    // Sample (port fraction along this block, desired absolute y) pairs.
    const fractions: number[] = []
    const targets: number[] = []

    for (const e of graph.outEdges.get(id) ?? []) {
      if (!isForward(e)) continue
      const om = metrics.get(e.v)!
      fractions.push(portFraction(e.uPort, m.outputs))
      targets.push(y.get(e.v)! + portOffsetY(e.vPort, om.inputs, om.height))
    }
    for (const e of graph.inEdges.get(id) ?? []) {
      if (!isForward(e)) continue
      const om = metrics.get(e.u)!
      fractions.push(portFraction(e.vPort, m.inputs))
      targets.push(y.get(e.u)! + portOffsetY(e.uPort, om.outputs, om.height))
    }

    if (fractions.length < 2) continue

    const n = fractions.length
    const fBar = fractions.reduce((a, b) => a + b, 0) / n
    const tBar = targets.reduce((a, b) => a + b, 0) / n
    let num = 0, den = 0
    for (let i = 0; i < n; i++) {
      const df = fractions[i] - fBar
      num += df * (targets[i] - tBar)
      den += df * df
    }
    // Every connection attaches at the same port position: no slope to fit.
    if (den < 1e-9) continue

    let height = num / den
    if (!Number.isFinite(height)) continue
    height = Math.round(height / RESIZE_SNAP) * RESIZE_SNAP
    height = Math.max(m.minHeight, Math.min(opts.maxBlockHeight, height))

    // Keep a grown block from becoming a tall thin sliver. Width only ever
    // grows, which also guarantees this loop terminates.
    const wanted = Math.round(height / 4 / RESIZE_SNAP) * RESIZE_SNAP
    const width = Math.max(m.width, RESIZE_MIN_WIDTH, Math.min(200, wanted))

    if (Math.abs(height - m.height) >= RESIZE_SNAP || width !== m.width) {
      m.height = height
      m.width = width
      changed = true
    }
  }

  return changed
}

// --- Public entry point ---------------------------------------------------

export function computeAutoLayout(
  blocks: BlockData[],
  wires: WireData[],
  options: AutoLayoutOptions = {},
): AutoLayoutResult {
  const opts: Required<AutoLayoutOptions> = {
    columnSpacing: options.columnSpacing ?? 80,
    rowSpacing: options.rowSpacing ?? 80,
    originX: options.originX ?? 100,
    originY: options.originY ?? 400,
    barycenterPasses: options.barycenterPasses ?? 4,
    alignmentPasses: options.alignmentPasses ?? 4,
    resizeBlocks: options.resizeBlocks ?? false,
    maxBlockHeight: options.maxBlockHeight ?? 1200,
    resizePasses: options.resizePasses ?? 3,
  }

  const { graph, laidOut } = buildGraph(blocks, wires)
  if (laidOut.length === 0) return { moves: [], resizes: [] }

  const metrics = new Map(laidOut.map(b => [b.id, measure(b)]))
  const original = new Map([...metrics].map(([id, m]) => [id, { width: m.width, height: m.height }]))

  const rank = assignRanks(graph, laidOut)
  // Ordering depends only on graph structure and port indices, never on pixel
  // sizes, so resizing cannot invalidate it and it is computed once.
  const columns = orderWithinColumns(graph, rank, laidOut, metrics, opts.barycenterPasses)

  if (opts.resizeBlocks) {
    for (let pass = 0; pass < opts.resizePasses; pass++) {
      const trial = computePlacement(graph, columns, rank, metrics, opts)
      if (!refitResizableBlocks(graph, trial, metrics, rank, opts)) break
    }
  }

  const y = computePlacement(graph, columns, rank, metrics, opts)
  const { sortedRanks, colWidth, colX } = computeColumnGeometry(columns, metrics, opts)

  // Global centring: a single translation once alignment has settled.
  let minY = Infinity, maxY = -Infinity
  for (const id of graph.nodes) {
    const top = y.get(id)!
    minY = Math.min(minY, top)
    maxY = Math.max(maxY, top + metrics.get(id)!.height)
  }
  const shift = Number.isFinite(minY) ? opts.originY - (minY + maxY) / 2 : 0

  const moves: LayoutMove[] = []
  for (const c of sortedRanks) {
    const cX0 = colX.get(c)!
    const cW = colWidth.get(c)!
    for (const id of columns.get(c)!) {
      const m = metrics.get(id)!
      moves.push({
        id,
        position: {
          x: Math.round(cX0 + (cW - m.width) / 2),
          y: Math.round(y.get(id)! + shift),
        },
      })
    }
  }

  const resizes: LayoutResize[] = []
  if (opts.resizeBlocks) {
    for (const [id, m] of metrics) {
      const was = original.get(id)!
      if (m.width !== was.width || m.height !== was.height) {
        resizes.push({ id, width: m.width, height: m.height })
      }
    }
  }

  return { moves, resizes }
}

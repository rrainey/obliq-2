// Auto-layout for signal-flow block diagrams.
//
// Strategy: Sugiyama-style layered layout tailored to signal diagrams.
//   1. Classify blocks (sources / sinks / regular).
//   2. Build a directed graph from wires; break back-edges (feedback loops)
//      via DFS so ranking sees only forward flow.
//   3. Rank via longest-path from sources -> LTR flow. Sinks are hoisted
//      to the rightmost column.
//   4. Within each column, reduce edge crossings using barycenter iteration
//      that considers both forward and back edges (they are all visible).
//   5. Assign coordinates using each block's actual width/height with
//      configurable inter-column and inter-row spacing.
//
// Feedback loops with chained dynamic/discontinuous blocks: because
// back-edges are excluded from ranking, the block closer to the input
// (shorter forward path from a source) always ends up in a lower-index
// column -- exactly what a multi-order integrator chain needs.

import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'

export interface AutoLayoutOptions {
  columnSpacing?: number   // horizontal gap between columns (px)
  rowSpacing?: number      // vertical gap between blocks within a column (px)
  originX?: number         // x of leftmost column
  originY?: number         // y of vertical center of layout
  barycenterPasses?: number
}

export interface LayoutMove {
  id: string
  position: { x: number; y: number }
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

// --- Size estimation ------------------------------------------------------

// Mirrors BlockNode.tsx defaults so layout gaps look right on screen.
const DEFAULT_WIDTH = 80
const DEFAULT_HEIGHT = 64
const PORT_SPACING = 20

function portCount(block: BlockData): { inputs: number; outputs: number } {
  const params = block.parameters || {}
  if (block.type === 'subsystem') {
    return {
      inputs: (params.inputPorts?.length ?? 1),
      outputs: (params.outputPorts?.length ?? 1),
    }
  }
  // Sensible fallbacks for common blocks; exact counts don't matter much for
  // layout, only for approximating vertical extent.
  return { inputs: 1, outputs: 1 }
}

function blockSize(block: BlockData): { width: number; height: number } {
  const params = block.parameters || {}
  if (block.type === 'subsystem') {
    const width = typeof params.width === 'number' ? params.width : DEFAULT_WIDTH
    const height = typeof params.height === 'number'
      ? params.height
      : Math.max(DEFAULT_HEIGHT, Math.max(
          params.inputPorts?.length ?? 1,
          params.outputPorts?.length ?? 1,
        ) * PORT_SPACING + 20)
    return { width, height }
  }
  const { inputs, outputs } = portCount(block)
  return {
    width: DEFAULT_WIDTH,
    height: Math.max(DEFAULT_HEIGHT, Math.max(inputs, outputs) * PORT_SPACING + 20),
  }
}

// --- Graph construction ---------------------------------------------------

interface Graph {
  nodes: string[]                       // block IDs in the layout
  outEdges: Map<string, Set<string>>    // forward edges only (after back-edge removal)
  inEdges: Map<string, Set<string>>     // forward reverse
  allOut: Map<string, Set<string>>      // includes back-edges (for crossing reduction)
  allIn: Map<string, Set<string>>
}

function buildGraph(
  blocks: BlockData[],
  wires: WireData[],
): { graph: Graph; laidOut: BlockData[]; frozen: BlockData[] } {
  const laidOut = blocks.filter(b => !isAnnotation(b.type))
  const frozen = blocks.filter(b => isAnnotation(b.type))

  const nodes = laidOut.map(b => b.id)
  const nodeSet = new Set(nodes)

  const allOut = new Map<string, Set<string>>()
  const allIn = new Map<string, Set<string>>()
  for (const id of nodes) {
    allOut.set(id, new Set())
    allIn.set(id, new Set())
  }

  for (const w of wires) {
    if (!nodeSet.has(w.sourceBlockId) || !nodeSet.has(w.targetBlockId)) continue
    if (w.sourceBlockId === w.targetBlockId) continue // ignore self-loops
    allOut.get(w.sourceBlockId)!.add(w.targetBlockId)
    allIn.get(w.targetBlockId)!.add(w.sourceBlockId)
  }

  // Detect back-edges via three-color DFS. Order nodes with sources first so
  // forward orientation is preferred.
  const color = new Map<string, 'white' | 'gray' | 'black'>()
  for (const id of nodes) color.set(id, 'white')
  const backEdges = new Set<string>()  // key: "src->tgt"

  const dfs = (u: string) => {
    color.set(u, 'gray')
    for (const v of allOut.get(u)!) {
      const c = color.get(v)
      if (c === 'gray') {
        backEdges.add(`${u}->${v}`)
      } else if (c === 'white') {
        dfs(v)
      }
    }
    color.set(u, 'black')
  }

  const dfsOrder = [
    ...nodes.filter(id => isSource(byId(laidOut, id).type)),
    ...nodes.filter(id => !isSource(byId(laidOut, id).type)),
  ]
  for (const id of dfsOrder) {
    if (color.get(id) === 'white') dfs(id)
  }

  const outEdges = new Map<string, Set<string>>()
  const inEdges = new Map<string, Set<string>>()
  for (const id of nodes) {
    outEdges.set(id, new Set())
    inEdges.set(id, new Set())
  }
  for (const [u, outs] of allOut) {
    for (const v of outs) {
      if (backEdges.has(`${u}->${v}`)) continue
      outEdges.get(u)!.add(v)
      inEdges.get(v)!.add(u)
    }
  }

  return { graph: { nodes, outEdges, inEdges, allOut, allIn }, laidOut, frozen }
}

function byId(blocks: BlockData[], id: string): BlockData {
  return blocks.find(b => b.id === id)!
}

// --- Ranking (column assignment) -----------------------------------------

function assignRanks(
  graph: Graph,
  laidOut: BlockData[],
): Map<string, number> {
  const rank = new Map<string, number>()
  const typeOf = new Map(laidOut.map(b => [b.id, b.type]))

  // Longest-path rank on the DAG (forward edges only). Topological order via
  // Kahn's algorithm.
  const indeg = new Map<string, number>()
  for (const id of graph.nodes) indeg.set(id, graph.inEdges.get(id)!.size)
  const queue: string[] = []
  for (const id of graph.nodes) if (indeg.get(id) === 0) queue.push(id)

  const topo: string[] = []
  while (queue.length) {
    const u = queue.shift()!
    topo.push(u)
    for (const v of graph.outEdges.get(u)!) {
      indeg.set(v, indeg.get(v)! - 1)
      if (indeg.get(v) === 0) queue.push(v)
    }
  }

  for (const u of topo) {
    let r = 0
    for (const p of graph.inEdges.get(u)!) {
      r = Math.max(r, (rank.get(p) ?? 0) + 1)
    }
    rank.set(u, r)
  }
  // Any leftover node (shouldn't happen post back-edge removal) defaults to 0.
  for (const id of graph.nodes) if (!rank.has(id)) rank.set(id, 0)

  // Hoist sinks to the rightmost column.
  let maxNonSinkRank = 0
  for (const id of graph.nodes) {
    if (!isSink(typeOf.get(id)!)) {
      maxNonSinkRank = Math.max(maxNonSinkRank, rank.get(id)!)
    }
  }
  const sinkRank = maxNonSinkRank + 1
  for (const id of graph.nodes) {
    if (isSink(typeOf.get(id)!)) rank.set(id, sinkRank)
  }

  return rank
}

// --- Within-column ordering (crossing reduction) --------------------------

function orderWithinColumns(
  graph: Graph,
  rank: Map<string, number>,
  laidOut: BlockData[],
  passes: number,
): Map<number, string[]> {
  const columns = new Map<number, string[]>()
  for (const id of graph.nodes) {
    const r = rank.get(id)!
    if (!columns.has(r)) columns.set(r, [])
    columns.get(r)!.push(id)
  }

  // Initial ordering: by original y, then by name, for continuity + determinism.
  const posY = new Map(laidOut.map(b => [b.id, b.position?.y ?? 0]))
  const nameOf = new Map(laidOut.map(b => [b.id, b.name ?? b.id]))
  for (const [, ids] of columns) {
    ids.sort((a, b) => {
      const ya = posY.get(a)!, yb = posY.get(b)!
      if (ya !== yb) return ya - yb
      return nameOf.get(a)!.localeCompare(nameOf.get(b)!)
    })
  }

  const maxRank = Math.max(...columns.keys())

  const barycenter = (id: string, indexIn: Map<string, number>, edges: Set<string>): number => {
    if (edges.size === 0) return indexIn.get(id) ?? 0
    let sum = 0, n = 0
    for (const other of edges) {
      const idx = indexIn.get(other)
      if (idx !== undefined) { sum += idx; n++ }
    }
    return n > 0 ? sum / n : (indexIn.get(id) ?? 0)
  }

  for (let pass = 0; pass < passes; pass++) {
    // Forward sweep: order each column by average index of predecessors.
    for (let c = 1; c <= maxRank; c++) {
      const prev = columns.get(c - 1) ?? []
      const prevIndex = new Map(prev.map((id, i) => [id, i]))
      const col = columns.get(c) ?? []
      col.sort((a, b) =>
        barycenter(a, prevIndex, graph.allIn.get(a)!) -
        barycenter(b, prevIndex, graph.allIn.get(b)!)
      )
    }
    // Backward sweep: order each column by average index of successors.
    for (let c = maxRank - 1; c >= 0; c--) {
      const next = columns.get(c + 1) ?? []
      const nextIndex = new Map(next.map((id, i) => [id, i]))
      const col = columns.get(c) ?? []
      col.sort((a, b) =>
        barycenter(a, nextIndex, graph.allOut.get(a)!) -
        barycenter(b, nextIndex, graph.allOut.get(b)!)
      )
    }
  }

  return columns
}

// --- Coordinate assignment -----------------------------------------------

function assignCoordinates(
  columns: Map<number, string[]>,
  laidOut: BlockData[],
  opts: Required<AutoLayoutOptions>,
): LayoutMove[] {
  const sizes = new Map(laidOut.map(b => [b.id, blockSize(b)]))

  // Column widths = max block width in column.
  const sortedCols = [...columns.keys()].sort((a, b) => a - b)
  const colWidth = new Map<number, number>()
  for (const c of sortedCols) {
    let w = 0
    for (const id of columns.get(c)!) w = Math.max(w, sizes.get(id)!.width)
    colWidth.set(c, w)
  }

  // x for the top-left corner of each column's blocks.
  const colX = new Map<number, number>()
  let x = opts.originX
  for (const c of sortedCols) {
    colX.set(c, x)
    x += colWidth.get(c)! + opts.columnSpacing
  }

  // Vertically center each column around originY.
  const moves: LayoutMove[] = []
  for (const c of sortedCols) {
    const ids = columns.get(c)!
    let totalH = 0
    for (const id of ids) totalH += sizes.get(id)!.height
    totalH += Math.max(0, ids.length - 1) * opts.rowSpacing

    let y = opts.originY - totalH / 2
    const colX0 = colX.get(c)!
    const colW = colWidth.get(c)!
    for (const id of ids) {
      const sz = sizes.get(id)!
      // Center each block horizontally within its column so ports of
      // varying-width blocks line up nicely.
      const bx = colX0 + (colW - sz.width) / 2
      moves.push({ id, position: { x: Math.round(bx), y: Math.round(y) } })
      y += sz.height + opts.rowSpacing
    }
  }

  return moves
}

// --- Public entry point ---------------------------------------------------

export function computeAutoLayout(
  blocks: BlockData[],
  wires: WireData[],
  options: AutoLayoutOptions = {},
): LayoutMove[] {
  const opts: Required<AutoLayoutOptions> = {
    columnSpacing: options.columnSpacing ?? 80,
    rowSpacing: options.rowSpacing ?? 80,
    originX: options.originX ?? 100,
    originY: options.originY ?? 400,
    barycenterPasses: options.barycenterPasses ?? 4,
  }

  const { graph, laidOut } = buildGraph(blocks, wires)
  if (laidOut.length === 0) return []

  const rank = assignRanks(graph, laidOut)
  const columns = orderWithinColumns(graph, rank, laidOut, opts.barycenterPasses)
  return assignCoordinates(columns, laidOut, opts)
}

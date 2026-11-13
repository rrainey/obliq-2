// ELK Layered layout for one sheet (Phases 1 and 2 of
// docs/layout-improvement-plan-pass-2.md). This is the default engine.
//
// This adapter converts a sheet to an ELK graph, runs `elkjs` and converts the
// result back to the AutoLayoutResult that the classic engine (autoLayout.ts)
// returns. tuneModelLayout.ts selects the engine.
//
// Geometry:
//   - Node sizes and port counts come from `measure()` in autoLayout.ts, the
//     same blockGeometry.ts formulas that BlockNode draws.
//   - Every port has a fixed position (`elk.portConstraints: FIXED_POS`).
//     Inputs are on the WEST side, outputs on the EAST side, at `portOffsetY`;
//     on a flipped block (blockGeometry.dataPortGeometry()) the opposite.
//     Each data port is HANDLE_OUTSET px wide and 0 px high and lies outside
//     the block, so ELK starts and ends each edge where the editor draws the
//     wire end: HANDLE_OUTSET px outside the block edge, at the port's y.
//   - An enable wire (target port -1) goes to a NORTH port at the top centre
//     of the target, and a reset wire (-2) to a SOUTH port at the bottom
//     centre, as BlockNode draws them. ELK uses these wires for layering and
//     placement. The editor draws control wires with its own default shape,
//     so this adapter writes no route for them and clears a stale one, as the
//     classic engine does.
//   - Comment blocks are not in the graph and do not move.
//   - Satellites (satellites.ts: leaf blocks with one wire, such as Sheet
//     Labels and constants) are not in the graph. The node of each host block
//     is larger by the space of its satellites. The host ports that have ELK
//     edges move to the border of that space, at the row of their lane; the
//     route of such a wire starts (or ends) with the lane path inside the
//     node. ELK honours this: it ignores `elk.margins` that are set on a node,
//     and it moves a FIXED_POS port that is inside a node to the node border.
//   - Disconnected parts of a sheet are separate ELK components. ELK packs
//     them (`elk.separateConnectedComponents`, the default). A sheet of small
//     parts only (a pass-through sheet) becomes a grid (`packParts()`).
//   - When a sheet has satellites that are not Sheet Labels, ELK lays out a
//     smaller graph, which can have more crossings. computeElkLayout() then
//     also lays out the sheet with Sheet Label satellites only, and keeps the
//     result with fewer crossings (on a tie: fewer bends, then shorter wires,
//     then smaller area; see tieWorse()). When the post-compaction makes an overlap
//     or a wire through a block, it lays out the sheet again without it.
//
// Routes:
//   ELK routes all edges from one port as a hyperedge: one trunk with
//   junction points. Each edge still has its own section with the complete
//   path from its source port to its target port, so each wire gets a complete
//   orthogonal polyline. `orthogonalRoute()` makes that polyline exactly
//   axis-aligned for the final block positions:
//     - the first bend is at the source port's exact y, the last bend at the
//       target port's exact y, so the end segments are horizontal;
//     - other coordinates are rounded to 0.5 px;
//     - a run less than MICRO_JOG (2 px) from the run before it joins that
//       run, so no wire gets a small visible step (`microJogs` in
//       layoutMetrics.ts).
//   Then:
//     - a wire with no bend gets no routing (the editor draws it straight);
//     - a wire with two bends gets `midpointOffset` (the editor's three-segment
//       shape, which the user can still drag);
//     - a wire with more bends gets `waypoints` (the bend points only).
//
// Order: nodes and edges go to ELK in a model order that never depends on the
// current block positions. The default is signal-flow order
// (`signalFlowAnalysis()` in autoLayout.ts), with MODEL_ORDER cycle breaking,
// so ELK reverses the same feedback wires as the classic engine. Thus a second
// layout of a laid-out sheet gives the same result. Block x positions are
// whole px. Block y positions are whole px, except where a straight wire
// needs a fractional y to stay exactly straight (`alignedRows()`).
//
// Subsystem functions (Phase 3): with `roles` (subsystemRole.ts), a loop that
// has subsystems of two or more functions reads controller, actuator, plant,
// and the wires from its return path (sensors, compensators) into the
// controller side are the feedback wires. The result gives the return-path
// blocks (`returnPath`).
//
// Mirrored return row (Phase 4, `mirrorReturnPath`): the return path that a
// plant feeds goes on a flipped row below the forward path (returnRow.ts).
// The layout then owns the `flipped` flag of the blocks (the result's
// `flips`). Without the option, a block that the user flipped keeps its flag
// and gets inverted ports in the ELK graph.
//
// Port names: a block that draws its port names outside its edges
// (`showPortNames`) gets a reservation of the widest name on each side, with
// straight lanes (the satellite method), so ELK's first bend comes after the names.
//
// Subsystem resizing: this adapter does not fit sizes. tuneModelLayout.ts
// fits the sizes with the classic engine and gives the resized blocks to
// computeElkLayout().

import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'
import { HANDLE_OUTSET, portOffsetY, wireEndAt, defaultWireRoute, type WireEnd } from './blockGeometry'
import { scoreSheetLayout, MICRO_JOG } from './layoutMetrics'
import {
  measure, isAnnotation, signalFlowAnalysis,
  type AutoLayoutResult, type LayoutMove, type Metrics, type SignalFlow, type WireRoute,
} from './autoLayout'
import { layoutWithReturnRow, withoutFlips, flipChanges } from './returnRow'
import type { SubsystemFunction } from './subsystemRole'
import {
  findSatellites, arrangeSide, satelliteGeometry, portLabelWidth, SATELLITE_TYPES, OUTPUT_PORT_SATELLITE_TYPE,
  type ArrangeParams, type PlacedSatellite, type Satellite, type SatelliteDetection, type SatelliteSide,
  type SideArrangement, type SidePort,
} from './satellites'

/** ELK layout options, keyed by their full ELK id (`elk.…`). */
export type ElkOptionSet = Record<string, string>

/**
 * The options that the comparison in docs/layout-engine-comparison.md
 * selected. The criteria, in order: no wire through a block, no overlap,
 * fewest crossings, fewest bends, smallest sheet area.
 *
 * - MODEL_ORDER cycle breaking, with the signal-flow model order (the
 *   `order: 'flow'` default below): ELK reverses the feedback wires that
 *   the classic engine selects. This removed about 30 % of the
 *   crossings. GREEDY_MODEL_ORDER, GREEDY and the list order gave 40 % to
 *   70 % more crossings. DEPTH_FIRST gave a similar count but sheets with
 *   27 % more area.
 * - BRANDES_KOEPF node placement: about 1000 fewer bends than
 *   NETWORK_SIMPLEX, and no overlaps. NETWORK_SIMPLEX gives smaller sheets.
 *   LINEAR_SEGMENTS gave more bends and overlaps.
 * - Greedy switch at all graph sizes (activation threshold 0; ELK's default
 *   turns it off above 40 nodes): fewer crossings on the large sheets.
 * - Thoroughness 30: about 3 % fewer crossings than 7 for twice the time.
 *   100 removed 1 % more at almost three times the time again (1.8 s for
 *   GpsRescue), so it is not the default.
 * - ELK's default spacings: other spacings changed the crossings by less
 *   than 0.5 %. A 10 px gap between blocks (`elk.spacing.nodeNode`) gave 2
 *   fewer crossings and a smaller sheet, but it leaves too little room for
 *   the block name above a block, so the default 20 px stays.
 * - `elk.layered.feedbackEdges` has no effect on these sheets; it stays as
 *   the plan gives it.
 * - Post-compaction EDGE_LENGTH (Phase 2): 8 % less sheet area and shorter
 *   wires, with no sheet worse in crossings. It made one overlap on one
 *   sheet; computeElkLayout() then lays out that sheet without it.
 *
 * The numbers for each alternative are in the comparison document.
 */
export const DEFAULT_ELK_OPTIONS: ElkOptionSet = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.feedbackEdges': 'true',
  'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
  'elk.layered.crossingMinimization.greedySwitch.activationThreshold': '0',
  'elk.layered.thoroughness': '30',
  'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
}

export interface ElkLayoutOptions {
  /** x of the left edge of the laid-out blocks (px). The classic engine uses the same default. */
  originX?: number
  /** y of the vertical centre of the laid-out blocks (px). */
  originY?: number
  /** Write wire routes. On by default. When off, `routes` is empty. */
  routeWires?: boolean
  /**
   * `true` gives an error: this engine does not fit block sizes itself.
   * tuneModelLayout.ts resizes the subsystems first and gives this engine the
   * resized blocks.
   */
  resizeBlocks?: boolean
  /** ELK options that replace or add to DEFAULT_ELK_OPTIONS. */
  elkOptions?: ElkOptionSet
  /**
   * The model order that ELK receives. `flow` (the default): signal-flow
   * order from `signalFlowOrder()` in autoLayout.ts, so that the feedback
   * wires that ELK selects are those that the classic engine selects. `list`:
   * the order of the sheet's block list, Input Ports first and Output Ports
   * last.
   */
  order?: 'flow' | 'list'
  /**
   * The effective subsystem functions of the sheet's subsystems
   * (subsystemRole.ts). With the `flow` order, they select the feedback wire of
   * each loop and the forward order: controller, actuator, plant, with sensors
   * and compensators on the return path. Absent or empty: the order without
   * functions.
   */
  roles?: ReadonlyMap<string, SubsystemFunction>
  /** Reserve the space of the port names outside a block. On by default. See ElkGraphOptions. */
  portNameClearance?: boolean
  /** Place satellites beside their host blocks (satellites.ts). On by default. */
  satellites?: boolean
  /** Spacings of the satellite arrangement. */
  arrange?: Partial<ArrangeParams>
  /** Block types that can be satellites. Default SATELLITE_TYPES (satellites.ts). */
  satelliteTypes?: string[]
  /** Packing of disconnected parts. See PackOptions. Default `auto`. */
  pack?: PackOptions['pack']
  /** Width over height of the grid of a pass-through sheet. Default DEFAULT_PAGE_ASPECT. */
  aspectRatio?: number
  /**
   * Mirror the feedback path (Phase 4). With the `flow` order and `roles`, the
   * return-path blocks go on a row below the forward path, flipped
   * (returnRow.ts). The layout then owns the `flipped` flag of every block it
   * lays out: the result's `flips` sets it on the return-path blocks and
   * their satellites and removes it from all others. Off (the default): the
   * stored flags do not change, and the layout draws flipped blocks with
   * their ports on the swapped sides.
   */
  mirrorReturnPath?: boolean
  /** Sizes that replace `measure()` for some blocks (connector nodes of returnRow.ts). */
  metricsOverride?: ReadonlyMap<string, Metrics>
  /** Input and Output Port blocks that get no FIRST or LAST layer constraint (connector nodes of returnRow.ts). */
  unconstrained?: ReadonlySet<string>
  /**
   * Where the Output Ports go. `column`: in the right column of the sheet
   * (the layer constraint LAST). `beside`: an Output Port with one wire is a
   * satellite beside the host output port that drives it, as a Sheet Label
   * Sink is (on a mirrored return-row host, on its left). `auto` (the
   * default): the sheet is laid out both ways, and `beside` is kept only when
   * it has no hard fault and fewer crossings than `column`
   * (chooseOutputPorts()). A sheet without an Output Port is laid out once.
   */
  outputPorts?: 'column' | 'beside' | 'auto'
}

// --- ELK graph types (the subset this adapter uses) -----------------------

interface ElkPortIn {
  id: string
  x: number
  y: number
  width: number
  height: number
  layoutOptions: ElkOptionSet
}

interface ElkNodeIn {
  id: string
  width: number
  height: number
  layoutOptions: ElkOptionSet
  ports: ElkPortIn[]
}

interface ElkEdgeIn {
  id: string
  sources: string[]
  targets: string[]
}

export interface ElkGraphIn {
  id: string
  layoutOptions: ElkOptionSet
  children: ElkNodeIn[]
  edges: ElkEdgeIn[]
}

interface ElkPoint { x: number; y: number }

interface ElkGraphOut {
  children?: Array<{ id: string; x?: number; y?: number }>
  edges?: Array<{
    id: string
    sections?: Array<{ startPoint: ElkPoint; endPoint: ElkPoint; bendPoints?: ElkPoint[] }>
  }>
}

// --- Loader ---------------------------------------------------------------

interface ElkEngine {
  layout(graph: ElkGraphIn): Promise<ElkGraphOut>
}

let enginePromise: Promise<ElkEngine> | null = null

/**
 * Load elkjs on first use. The dynamic import keeps the 1.6 MB bundle out of
 * the initial page bundle. `elk.bundled.js` runs in the calling thread, in
 * Node (CLI, Jest) and in the browser, with no web worker file to serve.
 */
function loadElk(): Promise<ElkEngine> {
  if (!enginePromise) {
    enginePromise = import('elkjs/lib/elk.bundled.js').then(mod => {
      const ELK = ((mod as any).default ?? mod) as new () => ElkEngine
      return new ELK()
    })
    // A failed load can be tried again
    enginePromise.catch(() => { enginePromise = null })
  }
  return enginePromise
}

// --- Graph conversion -----------------------------------------------------

const nodeId = (blockId: string) => `n:${blockId}`
const portId = (blockId: string, kind: 'in' | 'out' | 'enable' | 'reset', index = 0) => `p:${blockId}:${kind}:${index}`
const edgeId = (wireId: string) => `e:${wireId}`

/** One wire that is in the ELK graph. */
interface GraphWire {
  wire: WireData
  control: boolean
  sourcePort: number
  targetPort: number
}

/**
 * The ELK node of one block. The node is the block plus the space that its
 * satellites reserve on each side. `hostX`, `hostY` give the block's top left
 * corner inside the node.
 */
export interface NodeGeometry {
  width: number
  height: number
  hostX: number
  hostY: number
  /**
   * The arrangement of the output side (`east`) and of the input side
   * (`west`). These are logical sides: on a flipped block the output side is
   * on the left of the block.
   */
  east?: SideArrangement
  west?: SideArrangement
  /** The block is flipped: inputs on the right, outputs on the left. */
  flipped: boolean
}

export interface ElkConversion {
  graph: ElkGraphIn
  metrics: Map<string, Metrics>
  /** The blocks of the sheet (comments excluded), by id. */
  blocks: Map<string, BlockData>
  /** The wires in the graph, in model order. */
  wires: GraphWire[]
  /** The ELK node of each block in the graph. */
  nodes: Map<string, NodeGeometry>
  /** The satellites, which are not in the graph. */
  satellites: Map<string, Satellite>
  /** Candidates that stay in the graph, and why. */
  keptSatellites: SatelliteDetection['kept']
  /** Index of each block in the sheet's block list. */
  blockOrder: Map<string, number>
  /** The return-path blocks of the loops with subsystem functions (`signalFlowAnalysis()`). */
  returnPath: Set<string>
}

/** Options of buildElkGraph that are not ELK options. */
export interface ElkGraphOptions {
  /** Remove satellites from the graph and place them beside their host. On by default. */
  satellites?: boolean
  /** Spacings of the satellite arrangement (satellites.ts). */
  arrange?: Partial<ArrangeParams>
  /** Block types that can be satellites. Default SATELLITE_TYPES. */
  satelliteTypes?: string[]
  /**
   * Reserve the space of the port names that a block draws outside its edges
   * (`showPortNames`), so that the first bend of a wire comes after the names.
   * On by default.
   */
  portNameClearance?: boolean
  /** The effective subsystem functions (subsystemRole.ts), for the `flow` order. */
  roles?: ReadonlyMap<string, SubsystemFunction>
  /**
   * Sizes that replace `measure()` for some blocks. The return row
   * (returnRow.ts) uses this for its connector nodes, which are not blocks
   * of the model.
   */
  metricsOverride?: ReadonlyMap<string, Metrics>
  /** Input and Output Port blocks that get no FIRST or LAST layer constraint. */
  unconstrained?: ReadonlySet<string>
  /** Output Ports with one wire are satellites too (ElkLayoutOptions.outputPorts `beside`). */
  outputPortSatellites?: boolean
}

/** The satellite types of a layout: `types` (default SATELLITE_TYPES), and the Output Port with `outputPorts`. */
export function satelliteTypeSet(types: readonly string[] | undefined, outputPorts: boolean): Set<string> {
  const set = new Set(types ?? SATELLITE_TYPES)
  if (outputPorts) set.add(OUTPUT_PORT_SATELLITE_TYPE)
  return set
}

/**
 * Model order. `list`: Input Ports first, Output Ports last, the others as
 * listed. `flow`: signal-flow order (see ElkLayoutOptions.order).
 */
function modelOrder(
  blocks: BlockData[],
  wires: WireData[],
  order: 'flow' | 'list',
  roles?: ReadonlyMap<string, SubsystemFunction>,
): { blocks: BlockData[]; flow: SignalFlow } {
  const flow = signalFlowAnalysis(blocks, wires, order === 'flow' ? roles : undefined)
  if (order === 'flow') {
    const byId = new Map(blocks.map(b => [b.id, b]))
    return { blocks: flow.order.map(id => byId.get(id)!), flow }
  }
  const rank = (b: BlockData) => (b.type === 'input_port' ? 0 : b.type === 'output_port' ? 2 : 1)
  const listed = blocks
    .map((b, i) => ({ b, i }))
    .sort((p, q) => rank(p.b) - rank(q.b) || p.i - q.i)
    .map(p => p.b)
  return { blocks: listed, flow }
}

/** Convert one sheet to an ELK graph. Pure: no block position is read. */
export function buildElkGraph(
  blocks: BlockData[],
  wires: WireData[],
  elkOptions: ElkOptionSet = {},
  order: 'flow' | 'list' = 'flow',
  graphOptions: ElkGraphOptions = {},
): ElkConversion {
  const laidOutAll = blocks.filter(b => !isAnnotation(b.type))
  const detection: SatelliteDetection = graphOptions.satellites === false
    ? { satellites: new Map(), kept: [] }
    : findSatellites(laidOutAll, wires, undefined, satelliteTypeSet(graphOptions.satelliteTypes, !!graphOptions.outputPortSatellites),
      new Set(graphOptions.metricsOverride?.keys() ?? []))
  const { satellites } = detection
  // The order of all blocks, satellites included, so that the feedback wires
  // that ELK selects do not change when the satellites leave the graph
  const ordered = modelOrder(laidOutAll, wires, order, graphOptions.roles)
  const laidOut = ordered.blocks.filter(b => !satellites.has(b.id))
  const orderIndex = new Map(laidOut.map((b, i) => [b.id, i]))
  const metrics = new Map(laidOutAll.map(b => [b.id, graphOptions.metricsOverride?.get(b.id) ?? measure(b)]))
  const blockById = new Map(laidOutAll.map(b => [b.id, b]))
  const satelliteWires = new Set([...satellites.values()].map(s => s.wireId))

  const graphWires: GraphWire[] = []
  const usedPorts = new Map<string, Set<string>>() // block id -> port ids in use
  const seen = new Set<string>()
  const use = (blockId: string, id: string) => {
    if (!usedPorts.has(blockId)) usedPorts.set(blockId, new Set())
    usedPorts.get(blockId)!.add(id)
  }
  for (const wire of wires) {
    if (!orderIndex.has(wire.sourceBlockId) || !orderIndex.has(wire.targetBlockId)) continue
    if (seen.has(wire.id) || satelliteWires.has(wire.id)) continue
    seen.add(wire.id)
    const control = wire.targetPortIndex < 0
    graphWires.push({
      wire,
      control,
      sourcePort: Math.max(0, wire.sourcePortIndex),
      targetPort: wire.targetPortIndex,
    })
  }
  // Edges in model order too: by source block, source port, target block, target port
  graphWires.sort((p, q) =>
    orderIndex.get(p.wire.sourceBlockId)! - orderIndex.get(q.wire.sourceBlockId)!
    || p.sourcePort - q.sourcePort
    || orderIndex.get(p.wire.targetBlockId)! - orderIndex.get(q.wire.targetBlockId)!
    || p.targetPort - q.targetPort)

  const edges: ElkEdgeIn[] = graphWires.map(g => {
    const source = portId(g.wire.sourceBlockId, 'out', g.sourcePort)
    const target = !g.control
      ? portId(g.wire.targetBlockId, 'in', g.targetPort)
      : portId(g.wire.targetBlockId, g.targetPort === -2 ? 'reset' : 'enable')
    use(g.wire.sourceBlockId, source)
    use(g.wire.targetBlockId, target)
    return { id: edgeId(g.wire.id), sources: [source], targets: [target] }
  })

  // Satellites of each host side
  const satsOf = new Map<string, Satellite[]>() // `${host}:${side}`
  for (const s of satellites.values()) {
    const key = `${s.hostId}:${s.side}`
    if (!satsOf.has(key)) satsOf.set(key, [])
    satsOf.get(key)!.push(s)
  }

  const nodes = new Map<string, NodeGeometry>()
  const children: ElkNodeIn[] = laidOut.map(b => {
    const m = metrics.get(b.id)!
    const used = usedPorts.get(b.id) ?? new Set<string>()
    const arrange = (side: SatelliteSide): SideArrangement | undefined => {
      const sats = satsOf.get(`${b.id}:${side}`)
      const count = side === 'east' ? m.outputs : m.inputs
      // Port-name clearance: the widest port name that the block draws outside this side
      let sideLabel = 0
      if (graphOptions.portNameClearance !== false) {
        for (let i = 0; i < count; i++) sideLabel = Math.max(sideLabel, portLabelWidth(b, side, i))
      }
      if (!sats && sideLabel === 0) return undefined
      const kind = side === 'east' ? 'out' : 'in'
      const sidePorts: SidePort[] = []
      for (let i = 0; i < count; i++) {
        const sat = sats?.find(s => s.hostPort === i)
        const through = used.has(portId(b.id, kind, i))
        if (!sat && !through) continue
        sidePorts.push({
          port: i,
          y: portOffsetY(i, count, m.height),
          through,
          satellite: sat ? satelliteGeometry(blockById.get(sat.id)!, metrics.get(sat.id)!, sat.satPort, side) : undefined,
          labelWidth: portLabelWidth(b, side, i),
        })
      }
      return arrangeSide(sidePorts, m.height, graphOptions.arrange, sideLabel)
    }
    const east = arrange('east')
    const west = arrange('west')
    const top = Math.min(east?.top ?? 0, west?.top ?? 0)
    const bottom = Math.max(east?.bottom ?? m.height, west?.bottom ?? m.height)
    // A flipped block has its output side (east arrangement) on the left
    const flipped = m.flipped
    const leftWidth = (flipped ? east?.width : west?.width) ?? 0
    const geom: NodeGeometry = {
      width: (west?.width ?? 0) + m.width + (east?.width ?? 0),
      height: bottom - top,
      hostX: leftWidth,
      hostY: -top,
      east,
      west,
      flipped,
    }
    nodes.set(b.id, geom)

    const ports: ElkPortIn[] = []
    // Ports in a fixed order (side, then index), so the graph is the same
    // whatever the order of the wire list
    const sorted = [...used].sort((p, q) => {
      const [, , kp, ip] = p.split(':')
      const [, , kq, iq] = q.split(':')
      return kp.localeCompare(kq) || Number(ip) - Number(iq)
    })
    for (const id of sorted) {
      const parts = id.split(':')
      const index = Number(parts[parts.length - 1])
      const kind = parts[parts.length - 2]
      // Inputs on the WEST border and outputs on the EAST border, or the
      // opposite for a flipped block (ELK then routes into the inverted ports)
      const westPort = (y: number) => ({ id, x: -HANDLE_OUTSET, y, width: HANDLE_OUTSET, height: 0, layoutOptions: { 'elk.port.side': 'WEST' } })
      const eastPort = (y: number) => ({ id, x: geom.width, y, width: HANDLE_OUTSET, height: 0, layoutOptions: { 'elk.port.side': 'EAST' } })
      if (kind === 'in') {
        // With satellites on the input side, the port is on the node border at its lane's row
        const lane = west?.lanes.get(index)
        const y = geom.hostY + (lane ? lane.row : portOffsetY(index, m.inputs, m.height))
        ports.push(flipped ? eastPort(y) : westPort(y))
      } else if (kind === 'out') {
        const lane = east?.lanes.get(index)
        const y = geom.hostY + (lane ? lane.row : portOffsetY(index, m.outputs, m.height))
        ports.push(flipped ? westPort(y) : eastPort(y))
      } else if (kind === 'enable') {
        ports.push({ id, x: geom.hostX + m.width / 2, y: -HANDLE_OUTSET, width: 0, height: HANDLE_OUTSET, layoutOptions: { 'elk.port.side': 'NORTH' } })
      } else {
        ports.push({ id, x: geom.hostX + m.width / 2, y: geom.height, width: 0, height: HANDLE_OUTSET, layoutOptions: { 'elk.port.side': 'SOUTH' } })
      }
    }
    const layoutOptions: ElkOptionSet = { 'elk.portConstraints': 'FIXED_POS' }
    const constrained = !graphOptions.unconstrained?.has(b.id)
    if (b.type === 'input_port' && constrained) layoutOptions['elk.layered.layering.layerConstraint'] = 'FIRST'
    if (b.type === 'output_port' && constrained) layoutOptions['elk.layered.layering.layerConstraint'] = 'LAST'
    return { id: nodeId(b.id), width: geom.width, height: geom.height, layoutOptions, ports }
  })

  return {
    graph: { id: 'root', layoutOptions: { ...DEFAULT_ELK_OPTIONS, ...elkOptions }, children, edges },
    metrics,
    blocks: blockById,
    wires: graphWires,
    nodes,
    satellites,
    keptSatellites: detection.kept,
    blockOrder: new Map(blocks.map((b, i) => [b.id, i])),
    returnPath: ordered.flow.returnPath,
  }
}

// --- Route conversion -----------------------------------------------------

const half = (v: number) => Math.round(v * 2) / 2

export type OrthogonalRoute =
  | { kind: 'straight' }
  | { kind: 'step'; turnX: number }
  | { kind: 'waypoints'; waypoints: ElkPoint[] }

/**
 * Make an ELK edge path exactly orthogonal between the given wire ends.
 *
 * `points` is the ELK path (start, bend points, end). `source` and `target`
 * are the wire ends that the editor draws for the final block positions. The
 * path is read as alternate horizontal and vertical runs. The first and the
 * last run are horizontal, at the source and the target y. The other run
 * coordinates are rounded to 0.5 px. A run that the rounding makes zero
 * length is removed.
 */
export function orthogonalRoute(points: ElkPoint[], source: ElkPoint, target: ElkPoint): OrthogonalRoute {
  // Runs: [kind, coordinate across the run]
  const runs: Array<{ h: boolean; at: number }> = []
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1]
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y)
    // A joint of less than 1 px (between a lane path and the ELK path, for example) is not a run
    if (dx < 1 && dy < 1 && i > 0 && i + 2 < points.length) continue
    if (dx < 1e-6 && dy < 1e-6) continue
    const h = dy <= dx
    const at = h ? (a.y + b.y) / 2 : (a.x + b.x) / 2
    if (runs.length && runs[runs.length - 1].h === h) continue // collinear: keep the first
    runs.push({ h, at })
  }
  if (runs.length === 0 || !runs[0].h) runs.unshift({ h: true, at: source.y })
  if (!runs[runs.length - 1].h) runs.push({ h: true, at: target.y })

  if (runs.length === 1) {
    // One horizontal run: straight, or a jog the editor's default step draws
    return Math.abs(source.y - target.y) < 1 ? { kind: 'straight' } : { kind: 'step', turnX: half((source.x + target.x) / 2) }
  }

  const at = runs.map((r, i) => (i === 0 ? source.y : i === runs.length - 1 ? target.y : half(r.at)))
  // A run less than MICRO_JOG from the run of the same direction before it
  // (or from the end run after it) joins that run: the short run between
  // them would be a visible small step. ELK makes such steps where a
  // hyperedge trunk leaves a port, and the exact port rows can make them.
  // The rule depends on the runs before, so wires of one net that share a
  // trunk keep one trunk.
  const last = runs.length - 1
  for (let i = 2; i < last; i++) {
    if (Math.abs(at[i] - at[i - 2]) < MICRO_JOG) at[i] = at[i - 2]
  }
  if (last >= 2 && runs[last - 2].h && last - 2 > 0 && Math.abs(at[last - 2] - at[last]) < MICRO_JOG) {
    at[last - 2] = at[last]
  }
  // Polyline: source, then a bend at each change of run, then target
  const pts: ElkPoint[] = [{ ...source }]
  let x = source.x, y = source.y
  for (let i = 1; i < runs.length; i++) {
    if (runs[i].h) {
      // The vertical run at x ends here: bend from the last y to the new y
      pts.push({ x, y }, { x, y: at[i] })
      y = at[i]
    } else {
      x = at[i]
    }
  }
  pts.push({ ...target })

  // Remove repeated points and points in the middle of a straight run
  const clean: ElkPoint[] = []
  for (const p of pts) {
    const last = clean[clean.length - 1]
    if (last && last.x === p.x && last.y === p.y) continue
    clean.push(p)
    while (clean.length >= 3) {
      const [a, b, c] = clean.slice(-3)
      const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)
      if (!collinear) break
      clean.splice(clean.length - 2, 1)
    }
  }
  const bends = clean.slice(1, -1)
  if (bends.length === 0) return { kind: 'straight' }
  if (bends.length === 2 && bends[0].x === bends[1].x && bends[0].y === source.y && bends[1].y === target.y) {
    return { kind: 'step', turnX: bends[0].x }
  }
  return { kind: 'waypoints', waypoints: bends }
}

// --- Public entry point ---------------------------------------------------

/** Run ELK on one sheet and convert the result to block moves and wire routes. */
export async function computeElkLayout(
  blocks: BlockData[],
  wires: WireData[],
  options: ElkLayoutOptions = {},
): Promise<AutoLayoutResult> {
  if (options.resizeBlocks) {
    throw new Error('computeElkLayout does not resize blocks. Give it the resized blocks (see tuneModelLayout.ts).')
  }
  const mode = options.outputPorts ?? 'auto'
  if (mode !== 'auto') return layoutWithOutputPorts(blocks, wires, options, mode === 'beside')
  if (!blocks.some(b => b.type === 'output_port')) return layoutWithOutputPorts(blocks, wires, options, false)
  const column = await layoutWithOutputPorts(blocks, wires, options, false)
  if (options.routeWires === false) return column
  const beside = await layoutWithOutputPorts(blocks, wires, options, true)
  const score = (layout: AutoLayoutResult) => scoreSheetLayout(...applyToSheet(blocks, wires, layout))
  return chooseOutputPorts(score(column), score(beside)) ? beside : column
}

/**
 * The rule of ElkLayoutOptions.outputPorts `auto`. True when the layout with
 * the Output Ports beside their hosts (`beside`) replaces the layout with
 * the Output Ports in the right column (`column`): `beside` has no hard
 * fault or small step, and it has fewer crossings. On a tie, the right
 * column stays, because it is the usual place of an Output Port (MAB
 * db_0042: Outports on the right, moved only to prevent crossings).
 */
export function chooseOutputPorts(column: ReturnType<typeof scoreSheetLayout>, beside: ReturnType<typeof scoreSheetLayout>): boolean {
  if (hardFaults(beside) + beside.microJogs !== 0) return false
  if (hardFaults(column) + column.microJogs !== 0) return true
  return beside.crossings < column.crossings
}

/** computeElkLayout() with the Output Ports in the right column, or (`beside`) as satellites. */
async function layoutWithOutputPorts(
  blocks: BlockData[],
  wires: WireData[],
  options: ElkLayoutOptions,
  beside: boolean,
): Promise<AutoLayoutResult> {
  options = { ...options, outputPorts: beside ? 'beside' : 'column' }
  if (!options.mirrorReturnPath) return computeElkLayoutDetail(blocks, wires, options)

  // Mirror the return path: the layout owns the flags. It lays out the
  // unflipped sheet, so the result does not depend on the stored flags.
  const plain = withoutFlips(blocks)
  const base: ElkLayoutOptions = { ...options, mirrorReturnPath: false }
  const order = options.order ?? 'flow'
  const returnPath = order === 'flow' && options.roles && options.roles.size > 0
    ? signalFlowAnalysis(plain.filter(b => !isAnnotation(b.type)), wires, options.roles).returnPath
    : new Set<string>()
  const mirrored = options.roles ? mirroredReturnPath(returnPath, wires, options.roles) : new Set<string>()
  if (mirrored.size > 0) {
    const row = await layoutWithReturnRow(
      plain, wires, mirrored,
      (partBlocks, partWires, metricsOverride, unconstrained) => computeElkLayoutDetail(partBlocks, partWires, {
        ...base, metricsOverride, unconstrained, pack: 'elk', originX: 0, originY: 0,
      }),
      { x: options.originX ?? 100, y: options.originY ?? 400 },
      blocks,
      satelliteTypeSet(options.satelliteTypes, beside),
    )
    if (row && options.routeWires !== false) {
      const score = scoreSheetLayout(...applyToSheet(blocks, wires, row))
      if (hardFaults(score) === 0) return row
    }
  }
  // No return row (none, or it has a fault): the layout of the unflipped sheet
  const flat = await computeElkLayoutDetail(plain, wires, base)
  return { ...flat, flips: flipChanges(blocks, new Set()) }
}

/**
 * The return-path blocks that go on the mirrored row: those that a plant
 * feeds, directly or through other return-path blocks. This is the
 * textbook feedback path, from the plant output back to the controller. A
 * return path without a plant before it (for example estimators in a loop
 * with mode logic, on a flight controller sheet) stays on the forward rows,
 * unflipped.
 */
export function mirroredReturnPath(
  returnPath: ReadonlySet<string>,
  wires: WireData[],
  roles: ReadonlyMap<string, SubsystemFunction>,
): Set<string> {
  const out = new Set<string>()
  const queue: string[] = []
  for (const w of wires) {
    if (w.targetPortIndex < 0 || roles.get(w.sourceBlockId) !== 'plant') continue
    if (returnPath.has(w.targetBlockId) && !out.has(w.targetBlockId)) { out.add(w.targetBlockId); queue.push(w.targetBlockId) }
  }
  while (queue.length) {
    const u = queue.shift()!
    for (const w of wires) {
      if (w.sourceBlockId !== u || w.targetPortIndex < 0) continue
      if (returnPath.has(w.targetBlockId) && !out.has(w.targetBlockId)) { out.add(w.targetBlockId); queue.push(w.targetBlockId) }
    }
  }
  return out
}

/** Faults that a layout must not have: the hard metrics that are 0 for every ELK layout. */
export function hardFaults(m: ReturnType<typeof scoreSheetLayout>): number {
  return m.throughBlock + m.overlaps + m.blockOverlaps + m.diagonalSegments + m.portDirection
}

/** computeElkLayout() without the return row, with the drawn paths and positions. */
async function computeElkLayoutDetail(
  blocks: BlockData[],
  wires: WireData[],
  options: ElkLayoutOptions = {},
): Promise<ElkLayoutDetail> {
  if (options.resizeBlocks) {
    throw new Error('computeElkLayout does not resize blocks. Give it the resized blocks (see tuneModelLayout.ts).')
  }
  const originX = options.originX ?? 100
  const originY = options.originY ?? 400
  const routeWires = options.routeWires ?? true

  const compactionKey = 'elk.layered.compaction.postCompaction.strategy'
  const run = async (satelliteTypes: string[] | undefined, compact: boolean) => {
    const elkOptions = { ...options.elkOptions }
    if (!compact) elkOptions[compactionKey] = 'NONE'
    const conversion = buildElkGraph(blocks, wires, elkOptions, options.order ?? 'flow', {
      satellites: options.satellites,
      arrange: options.arrange,
      satelliteTypes,
      portNameClearance: options.portNameClearance,
      roles: options.roles,
      metricsOverride: options.metricsOverride,
      unconstrained: options.unconstrained,
      outputPortSatellites: options.outputPorts === 'beside',
    })
    if (conversion.graph.children.length === 0) {
      const empty: ElkLayoutDetail = { moves: [], resizes: [], routes: [], returnPath: [], paths: new Map(), positions: new Map() }
      return { conversion, layout: empty, score: null }
    }
    const elk = await loadElk()
    const result = await elk.layout(conversion.graph)
    const layout = elkResultToLayout(result, conversion, originX, originY, routeWires, {
      pack: options.pack ?? 'auto',
      aspectRatio: options.aspectRatio ?? DEFAULT_PAGE_ASPECT,
    })
    // Connector nodes (metricsOverride) are scored with their own sizes
    const score = routeWires ? scoreSheetLayout(...applyToSheet(blocks, wires, layout), options.metricsOverride) : null
    return { conversion, layout, score }
  }
  const faults = (m: ReturnType<typeof scoreSheetLayout> | null) => (m ? m.throughBlock + m.overlaps + m.blockOverlaps : 0)
  // The adapter's post-compaction (DEFAULT_ELK_OPTIONS) can make an overlap on
  // a few sheets. Then lay out the sheet again without it.
  const compactByDefault = options.elkOptions?.[compactionKey] === undefined
  const runChecked = async (satelliteTypes?: string[]) => {
    const r = await run(satelliteTypes, true)
    if (!compactByDefault || faults(r.score) === 0) return r
    const plain = await run(satelliteTypes, false)
    return faults(plain.score) < faults(r.score) ? plain : r
  }

  const first = await runChecked(options.satelliteTypes)
  // Without a given type list: when blocks other than Sheet Labels are
  // satellites, ELK lays out a different graph, which can have more
  // crossings. Then lay out the sheet with Sheet Label satellites only also,
  // and keep the result with fewer faults, then fewer crossings. On a
  // crossing tie, tieWorse() decides.
  // With `beside`, the Output Port satellites stay in both candidates
  const besideTypes = options.outputPorts === 'beside' ? [OUTPUT_PORT_SATELLITE_TYPE] : []
  const others = [...first.conversion.satellites.keys()]
    .some(id => ![...LABEL_SATELLITE_TYPES, ...besideTypes].includes(blocks.find(b => b.id === id)!.type))
  if (options.satelliteTypes || !others || !first.score) return first.layout
  const second = await runChecked([...LABEL_SATELLITE_TYPES, ...besideTypes])
  const a = first.score, b = second.score!
  const worse = faults(a) !== faults(b) ? faults(a) > faults(b) : a.crossings !== b.crossings ? a.crossings > b.crossings : tieWorse(a, b)
  return worse ? second.layout : first.layout
}

/**
 * The tie rule of the two satellite candidates (computeElkLayoutDetail()),
 * when they have the same faults and crossings. True when the candidate with
 * all satellites (a) is worse than the candidate with Sheet Label satellites
 * only (b). When a candidate has a hard fault (hardFaults() or a micro jog),
 * a stays. Else the rule is: fewer bends, then shorter total wire length,
 * then smaller area. On a full tie, a stays, so the result is deterministic.
 */
export function tieWorse(a: ReturnType<typeof scoreSheetLayout>, b: ReturnType<typeof scoreSheetLayout>): boolean {
  if (hardFaults(a) + a.microJogs !== 0 || hardFaults(b) + b.microJogs !== 0) return false
  if (a.bends !== b.bends) return a.bends > b.bends
  if (a.wireLength !== b.wireLength) return a.wireLength > b.wireLength
  return a.width * a.height > b.width * b.height
}

/** Sheet Label blocks, the satellites that are always removed from the ELK graph. */
const LABEL_SATELLITE_TYPES = ['sheet_label_sink', 'sheet_label_source']

/** The blocks and wires of a sheet with a layout applied, as tuneModelLayout writes them. */
export function applyToSheet(blocks: BlockData[], wires: WireData[], layout: AutoLayoutResult): [BlockData[], WireData[]] {
  const moves = new Map(layout.moves.map(m => [m.id, m.position]))
  const routes = new Map(layout.routes.map(r => [r.id, r]))
  const flips = new Map((layout.flips ?? []).map(f => [f.id, f.flipped]))
  const flip = (b: BlockData): BlockData => {
    if (!flips.has(b.id)) return b
    const { flipped: _f, ...rest } = b.parameters ?? {}
    return { ...b, parameters: flips.get(b.id) ? { ...rest, flipped: true } : rest }
  }
  return [
    blocks.map(b => flip(moves.has(b.id) ? { ...b, position: moves.get(b.id)! } : b)),
    wires.map(w => {
      const r = routes.get(w.id)
      if (!r) return w
      const routing = r.waypoints?.length ? { waypoints: r.waypoints } : r.midpointOffset !== undefined ? { midpointOffset: r.midpointOffset } : undefined
      return { ...w, routing }
    }),
  ]
}

/** Width over height that the grid of a pass-through sheet aims at (landscape page). */
export const DEFAULT_PAGE_ASPECT = 1.4

export interface PackOptions {
  /**
   * `auto` (the default): a sheet of small independent parts (pass-through
   * sheet) becomes a grid; other sheets keep the packing of ELK. `grid`: always
   * a grid of the parts. `elk`: always the packing of ELK.
   */
  pack: 'auto' | 'grid' | 'elk'
  aspectRatio: number
}

/**
 * x of a point at distance `u` outward from the edge of a host block that
 * holds the given logical side: the output side (`east`) is on the right of
 * the block, the input side (`west`) on the left, and the opposite on a
 * flipped block.
 */
const ux = (hostLeft: number, hostWidth: number, side: SatelliteSide, u: number, flipped = false) =>
  (side === 'east') !== flipped ? hostLeft + hostWidth + u : hostLeft - u

/** The result of elkResultToLayout(), with the drawn polyline and the position of each block. */
export interface ElkLayoutDetail extends AutoLayoutResult {
  /**
   * The polyline of each routed wire, from its source wire end to its target
   * wire end (bends only between). Control wires have none.
   */
  paths: Map<string, ElkPoint[]>
  /** The top left corner of each block in the graph and of each satellite. */
  positions: Map<string, ElkPoint>
}

/** The points of a converted route between two wire ends. */
export function routePoints(route: OrthogonalRoute, source: ElkPoint, target: ElkPoint): ElkPoint[] {
  const s = { x: source.x, y: source.y }, t = { x: target.x, y: target.y }
  if (route.kind === 'straight') return [s, t]
  if (route.kind === 'step') return [s, { x: route.turnX, y: source.y }, { x: route.turnX, y: target.y }, t]
  return [s, ...route.waypoints.map(p => ({ x: p.x, y: p.y })), t]
}

/** Convert an ELK result to an AutoLayoutResult. Exported for tests. */
export function elkResultToLayout(
  result: ElkGraphOut,
  conversion: ElkConversion,
  originX = 100,
  originY = 400,
  routeWires = true,
  packOptions: PackOptions = { pack: 'auto', aspectRatio: DEFAULT_PAGE_ASPECT },
): ElkLayoutDetail {
  const { metrics, nodes, satellites } = conversion
  const placed = new Map<string, ElkPoint>()
  for (const c of result.children ?? []) placed.set(c.id.slice(2), { x: c.x ?? 0, y: c.y ?? 0 })

  // Parts of the sheet that are not connected: packed again as a grid when the sheet is a pass-through sheet
  const shift = packParts(conversion, result, placed, packOptions)

  // Translate: left edge at originX, vertical centre at originY, as the classic engine
  let minX = Infinity, minY = Infinity, maxY = -Infinity
  for (const [id, p] of placed) {
    const n = nodes.get(id)!
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y + n.height)
  }
  const dx = originX - minX
  const dy = originY - (minY + maxY) / 2

  const moves: LayoutMove[] = []
  const position = new Map<string, ElkPoint>()
  const exact = new Map<string, ElkPoint>()
  for (const c of conversion.graph.children) {
    const id = c.id.slice(2)
    const n = nodes.get(id)!
    const p = placed.get(id) ?? { x: 0, y: 0 }
    exact.set(id, { x: p.x + dx + n.hostX, y: p.y + dy + n.hostY })
  }
  const rowY = alignedRows(conversion, exact)
  for (const c of conversion.graph.children) {
    const id = c.id.slice(2)
    const pos = { x: Math.round(exact.get(id)!.x), y: rowY.get(id)! }
    position.set(id, pos)
    moves.push({ id, position: pos })
  }

  // Satellites, relative to the rounded host position
  const satPlace = new Map<string, { sat: Satellite; placedSat: PlacedSatellite; arrangement: SideArrangement }>()
  for (const [hostId, n] of nodes) {
    const hm = metrics.get(hostId)!
    const hp = position.get(hostId)!
    for (const side of ['east', 'west'] as const) {
      const a = side === 'east' ? n.east : n.west
      if (!a) continue
      // The satellites of a side on the right of the host start at u; on the left they end at u
      const onRight = (side === 'east') !== n.flipped
      for (const ps of a.satellites) {
        const sm = metrics.get(ps.id)!
        const x = onRight ? ux(hp.x, hm.width, side, ps.u, n.flipped) : ux(hp.x, hm.width, side, ps.u, n.flipped) - sm.width
        // A satellite with a straight wire takes the exact y of its host port.
        // Else its top is a whole px from the host's top, so that its turn
        // keeps the height that the arrangement gave it. The host can be at a
        // fractional y (alignedRows()).
        const sat = satellites.get(ps.id)!
        const pos = { x: Math.round(x), y: hp.y + ps.top }
        if (ps.turnU === undefined) {
          const sb = conversion.blocks.get(ps.id)!, hb = conversion.blocks.get(hostId)!
          const kind = sat.side === 'east' ? 'output' : 'input'
          const satKind = sat.side === 'east' ? 'input' : 'output'
          const hostPortY = wireEndAt(hb, hp, kind, sat.hostPort, kind === 'output' ? hm.outputs : hm.inputs, hm.width, hm.height).y
          const satPortY = wireEndAt(sb, { x: 0, y: 0 }, satKind, sat.satPort, satKind === 'output' ? sm.outputs : sm.inputs, sm.width, sm.height).y
          pos.y = hostPortY - satPortY
        }
        position.set(ps.id, pos)
        moves.push({ id: ps.id, position: pos })
        satPlace.set(ps.id, { sat: satellites.get(ps.id)!, placedSat: ps, arrangement: a })
      }
    }
  }

  const routes: WireRoute[] = []
  const paths = new Map<string, ElkPoint[]>()
  if (routeWires) {
    // Wire ends from the shared port geometry (sides swapped on a flipped block)
    const sourceEnd = (id: string, port: number): WireEnd => {
      const m = metrics.get(id)!, p = position.get(id)!
      return wireEndAt(conversion.blocks.get(id)!, p, 'output', port, m.outputs, m.width, m.height)
    }
    const targetEnd = (id: string, port: number): WireEnd => {
      const m = metrics.get(id)!, p = position.get(id)!
      return wireEndAt(conversion.blocks.get(id)!, p, 'input', port, m.inputs, m.width, m.height)
    }
    const rectOf = (id: string) => {
      const m = metrics.get(id)!, p = position.get(id)!
      return { x: p.x, y: p.y, w: m.width, h: m.height }
    }
    /** The path inside a node, from the wire end at the host to the node border, in sheet coordinates. */
    const lanePath = (hostId: string, side: SatelliteSide, port: number): ElkPoint[] | null => {
      const n = nodes.get(hostId)!
      const lane = (side === 'east' ? n.east : n.west)?.lanes.get(port)
      if (!lane) return null
      const hp = position.get(hostId)!, hm = metrics.get(hostId)!
      return lane.path.map(q => ({ x: ux(hp.x, hm.width, side, q.u, n.flipped), y: hp.y + q.y }))
    }
    /** Write the route of a wire, and keep its polyline. */
    const emit = (wireId: string, route: OrthogonalRoute, source: WireEnd, target: WireEnd, sourceId: string, targetId: string) => {
      const points = routePoints(route, source, target)
      paths.set(wireId, points)
      const usual = source.dir === 1 && target.dir === -1
      routes.push(usual
        ? toWireRoute(wireId, route, source, target)
        : routeForEnds(wireId, points, source, target, { source: rectOf(sourceId), target: rectOf(targetId) }))
    }

    const sections = new Map((result.edges ?? []).map(e => [e.id, e.sections?.[0]]))
    for (const g of conversion.wires) {
      const w = g.wire
      if (g.control) {
        // The editor draws control wires itself: clear a stale route
        routes.push({ id: w.id, midpointOffset: undefined })
        continue
      }
      const source = sourceEnd(w.sourceBlockId, g.sourcePort)
      const target = targetEnd(w.targetBlockId, g.targetPort)
      const section = sections.get(edgeId(w.id))
      const sh = shift.get(w.sourceBlockId) ?? { x: 0, y: 0 }
      const elkPoints = section
        ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(p => ({ x: p.x + dx + sh.x, y: p.y + dy + sh.y }))
        : [source, target]
      // With satellites, the wire goes through the reservation to the node border first
      const head = lanePath(w.sourceBlockId, 'east', g.sourcePort) ?? []
      const tail = (lanePath(w.targetBlockId, 'west', g.targetPort) ?? []).slice().reverse()
      emit(w.id, orthogonalRoute([...head, ...elkPoints, ...tail], source, target), source, target, w.sourceBlockId, w.targetBlockId)
    }

    // Satellite wires: straight, or one turn in the fan-out channel
    for (const { sat, placedSat } of satPlace.values()) {
      const hostPos = position.get(sat.hostId)!, hm = metrics.get(sat.hostId)!
      const source = sat.side === 'east' ? sourceEnd(sat.hostId, sat.hostPort) : sourceEnd(sat.id, sat.satPort)
      const target = sat.side === 'east' ? targetEnd(sat.id, sat.satPort) : targetEnd(sat.hostId, sat.hostPort)
      const [sid, tid] = sat.side === 'east' ? [sat.hostId, sat.id] : [sat.id, sat.hostId]
      if (placedSat.turnU === undefined || Math.abs(source.y - target.y) < 1) {
        emit(sat.wireId, { kind: 'straight' }, source, target, sid, tid)
      } else {
        const turnX = ux(hostPos.x, hm.width, sat.side, placedSat.turnU, nodes.get(sat.hostId)!.flipped)
        emit(sat.wireId, { kind: 'step', turnX }, source, target, sid, tid)
      }
    }
  }

  // Return-path blocks, in model order (for a later phase: mirrored blocks on a return row)
  const returnPath = [...conversion.returnPath].sort((a, b) => (conversion.blockOrder.get(a) ?? 0) - (conversion.blockOrder.get(b) ?? 0))
  return { moves, resizes: [], routes, returnPath, paths, positions: position }
}

/**
 * The y of each block in the graph. ELK aligns the ports of a straight wire
 * exactly, but port positions are fractions of a block height, so the two
 * blocks are often at fractional y. Rounding each block on its own would put
 * a step of less than 1 px into each such wire. ELK also leaves a few wires
 * with ports less than MICRO_JOG apart, which the editor draws with a small
 * step. Thus:
 *
 * 1. Blocks joined by a wire whose ports ELK aligned form a group.
 * 2. Then, for each wire whose ports are less than MICRO_JOG apart (nearest
 *    first), the smaller of the two groups moves by that distance and the
 *    groups join. Two blocks of one group do not move against each other.
 * 3. All blocks of a group move by the same amount: the one that puts the
 *    first block of the group at a whole px.
 *
 * The ports in a group stay exactly aligned. A block without such a wire is
 * at a whole px. The result does not depend on the stored positions.
 */
function alignedRows(conversion: ElkConversion, exact: Map<string, ElkPoint>): Map<string, number> {
  const groupOf = new Map<string, string[]>()
  const delta = new Map<string, number>()
  for (const id of exact.keys()) { groupOf.set(id, [id]); delta.set(id, 0) }
  const portY = (id: string, kind: 'input' | 'output', port: number) => {
    const m = conversion.metrics.get(id)!
    const p = exact.get(id)!
    return wireEndAt(conversion.blocks.get(id)!, p, kind, port, kind === 'output' ? m.outputs : m.inputs, m.width, m.height).y + delta.get(id)!
  }
  const pairs: Array<{ s: string; t: string; sp: number; tp: number; order: number }> = []
  conversion.wires.forEach((g, order) => {
    if (g.control || !exact.has(g.wire.sourceBlockId) || !exact.has(g.wire.targetBlockId)) return
    pairs.push({ s: g.wire.sourceBlockId, t: g.wire.targetBlockId, sp: g.sourcePort, tp: g.targetPort, order })
  })
  const gap = (q: typeof pairs[number]) => portY(q.t, 'input', q.tp) - portY(q.s, 'output', q.sp)
  const join = (q: typeof pairs[number]) => {
    const a = groupOf.get(q.s)!, b = groupOf.get(q.t)!
    if (a === b) return
    const d = gap(q)
    // The smaller group moves (the target's on a tie)
    const [keep, move, by] = b.length <= a.length ? [a, b, -d] : [b, a, d]
    for (const id of move) { delta.set(id, delta.get(id)! + by); groupOf.set(id, keep) }
    keep.push(...move)
  }
  // 1. Aligned by ELK
  for (const q of pairs) if (Math.abs(gap(q)) <= ALIGNED_PORTS) join(q)
  // 2. Nearly aligned, nearest first
  const near = pairs
    .map(q => ({ q, d: Math.abs(gap(q)) }))
    .filter(({ d }) => d > ALIGNED_PORTS && d < MICRO_JOG)
    .sort((x, y) => x.d - y.d || x.q.order - y.q.order)
  for (const { q } of near) if (Math.abs(gap(q)) < MICRO_JOG) join(q)
  // 3. Whole px for the first block of each group, in graph order
  const shift = new Map<string[], number>()
  const out = new Map<string, number>()
  for (const id of exact.keys()) {
    const g = groupOf.get(id)!
    const y = exact.get(id)!.y + delta.get(id)!
    if (!shift.has(g)) shift.set(g, Math.round(y) - y)
    out.set(id, y + shift.get(g)!)
  }
  return out
}

/** Port rows nearer than this (px) are aligned by ELK (floating-point noise only). */
const ALIGNED_PORTS = 1e-3

/**
 * The wire route (routing) that draws `points` between two wire ends of any
 * port sides: no routing when the editor's default path (defaultWirePath())
 * is the same polyline, a turn offset when the default step path with that
 * offset is the same, else waypoints. Used for wires with a flipped end; the
 * usual sides keep toWireRoute(), so that their routes do not change.
 */
export function routeForEnds(
  id: string,
  points: ElkPoint[],
  source: WireEnd,
  target: WireEnd,
  rects: { source?: { x: number; y: number; w: number; h: number }; target?: { x: number; y: number; w: number; h: number } } = {},
): WireRoute {
  const clean = simplifyPolyline(snapEndRuns(points, source, target))
  const same = (a: ElkPoint[], b: ElkPoint[]) => {
    const p = simplifyPolyline(a), q = simplifyPolyline(b)
    return p.length === q.length && p.every((pt, i) => Math.abs(pt.x - q[i].x) < 0.01 && Math.abs(pt.y - q[i].y) < 0.01)
  }
  const plain = defaultWireRoute(source, target, 0, rects)
  if (same(plain.points, clean)) return { id, midpointOffset: undefined }
  const bends = clean.slice(1, -1)
  if (plain.shape === 'step' && bends.length === 2 && bends[0].x === bends[1].x) {
    const offset = half(bends[0].x - plain.points[1].x)
    if (Math.abs(offset) >= 0.25 && offset !== 0) {
      const withOffset = defaultWireRoute(source, target, offset, rects)
      if (withOffset.shape === 'step' && same(withOffset.points, clean)) return { id, midpointOffset: offset }
    }
  }
  return { id, midpointOffset: undefined, waypoints: bends.length ? bends : undefined }
}

/**
 * The end segments of a wire are horizontal at the exact port y. A joined
 * path can be less than 1 px off at its ends (a straight ELK route between a
 * port at a fractional y and a connector at a whole y): move the first and
 * the last horizontal runs to the port y.
 */
function snapEndRuns(points: ElkPoint[], source: ElkPoint, target: ElkPoint): ElkPoint[] {
  const pts = points.map(p => ({ x: p.x, y: p.y }))
  if (pts.length === 0) return pts
  pts[0] = { x: source.x, y: source.y }
  pts[pts.length - 1] = { x: target.x, y: target.y }
  for (let i = 1; i < pts.length - 1 && Math.abs(pts[i].y - source.y) < 1; i++) pts[i].y = source.y
  for (let i = pts.length - 2; i > 0 && Math.abs(pts[i].y - target.y) < 1; i--) pts[i].y = target.y
  return pts
}

/** Remove repeated points and points in the middle of a straight run. */
export function simplifyPolyline(points: ElkPoint[]): ElkPoint[] {
  const out: ElkPoint[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < 1e-6 && Math.abs(last.y - p.y) < 1e-6) continue
    out.push({ x: p.x, y: p.y })
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3)
      const collinear = (Math.abs(a.x - b.x) < 1e-6 && Math.abs(b.x - c.x) < 1e-6) || (Math.abs(a.y - b.y) < 1e-6 && Math.abs(b.y - c.y) < 1e-6)
      if (!collinear) break
      out.splice(out.length - 2, 1)
    }
  }
  return out
}

function toWireRoute(id: string, route: OrthogonalRoute, source: ElkPoint, target: ElkPoint): WireRoute {
  if (route.kind === 'straight') return { id, midpointOffset: undefined }
  if (route.kind === 'step') {
    const offset = half(route.turnX - (source.x + target.x) / 2)
    return { id, midpointOffset: Math.abs(offset) < 0.25 ? undefined : offset }
  }
  return { id, midpointOffset: undefined, waypoints: route.waypoints }
}

// --- Packing of disconnected parts ----------------------------------------

/** Gaps of the grid of a pass-through sheet (px). Rows: room for the name labels. */
const GRID_COLUMN_GAP = 40
const GRID_ROW_GAP = 24
/** A part with at most this many ELK nodes is small. */
const SMALL_PART_NODES = 3

/**
 * The connected parts of the ELK graph, in model order (the order of the
 * first block of each part in the sheet's block list).
 */
function connectedParts(conversion: ElkConversion): string[][] {
  const ids = conversion.graph.children.map(c => c.id.slice(2))
  const parent = new Map(ids.map(id => [id, id]))
  const find = (id: string): string => {
    let r = id
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(id, r)
    return r
  }
  for (const g of conversion.wires) {
    const a = find(g.wire.sourceBlockId), b = find(g.wire.targetBlockId)
    if (a !== b) parent.set(a, b)
  }
  const parts = new Map<string, string[]>()
  for (const id of ids) {
    const r = find(id)
    if (!parts.has(r)) parts.set(r, [])
    parts.get(r)!.push(id)
  }
  return [...parts.values()]
}

/**
 * When every connected part of the sheet is small (a pass-through sheet,
 * such as a sheet of Sheet Label Source to Output Port pairs), put the parts
 * in a grid: in model order, top to bottom, then the next column. The number
 * of columns gives the width over height nearest to `aspectRatio`. In each
 * column, the left edges of the first blocks after the satellites align, and
 * all rows have the same height.
 *
 * Moves the nodes in `placed` and returns the shift of each block (for the
 * ELK edge routes of its part).
 */
function packParts(
  conversion: ElkConversion,
  result: ElkGraphOut,
  placed: Map<string, ElkPoint>,
  options: PackOptions,
): Map<string, ElkPoint> {
  const shift = new Map<string, ElkPoint>()
  if (options.pack === 'elk') return shift
  const parts = connectedParts(conversion)
  if (parts.length < 2) return shift
  if (options.pack === 'auto' && parts.some(p => p.length > SMALL_PART_NODES)) return shift

  const listIndex = new Map(conversion.graph.children.map((c, i) => [c.id.slice(2), i]))
  const blockOrder = conversion.blockOrder
  const firstIndex = (part: string[]) => Math.min(...part.map(id => blockOrder.get(id) ?? listIndex.get(id)!))
  parts.sort((a, b) => firstIndex(a) - firstIndex(b))

  const edgesOf = new Map<string, Array<{ x: number; y: number }>>()
  const sections = new Map((result.edges ?? []).map(e => [e.id, e.sections?.[0]]))
  for (const g of conversion.wires) {
    const s = sections.get(edgeId(g.wire.id))
    if (!s) continue
    const pts = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint]
    const key = g.wire.sourceBlockId
    if (!edgesOf.has(key)) edgesOf.set(key, [])
    edgesOf.get(key)!.push(...pts)
  }

  // Bounding box of each part, and the x of its anchor (the left edge of its first host block)
  const boxes = parts.map(part => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, anchor = Infinity
    for (const id of part) {
      const p = placed.get(id)!, n = conversion.nodes.get(id)!
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y)
      x1 = Math.max(x1, p.x + n.width); y1 = Math.max(y1, p.y + n.height)
      anchor = Math.min(anchor, p.x + n.hostX)
      for (const q of edgesOf.get(id) ?? []) {
        x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y)
        x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y)
      }
    }
    return { x0, y0, w: x1 - x0, h: y1 - y0, lead: anchor - x0 }
  })

  const rowPitch = Math.max(...boxes.map(b => b.h)) + GRID_ROW_GAP
  const n = parts.length
  const layoutFor = (cols: number) => {
    const rows = Math.ceil(n / cols)
    const colX: number[] = []
    const colLead: number[] = []
    let x = 0, width = 0
    for (let c = 0; c < cols; c++) {
      const members = boxes.slice(c * rows, (c + 1) * rows)
      if (members.length === 0) break
      const lead = Math.max(...members.map(b => b.lead))
      const w = Math.max(...members.map(b => lead - b.lead + b.w))
      colX.push(x)
      colLead.push(lead)
      width = x + w
      x += w + GRID_COLUMN_GAP
    }
    return { rows, colX, colLead, width, height: rows * rowPitch - GRID_ROW_GAP }
  }
  let best = layoutFor(1)
  let bestErr = Infinity
  for (let cols = 1; cols <= n; cols++) {
    const l = layoutFor(cols)
    if (l.colX.length < cols) break
    const err = Math.abs(Math.log((l.width / Math.max(1, l.height)) / options.aspectRatio))
    if (err < bestErr - 1e-9) { best = l; bestErr = err }
  }

  parts.forEach((part, i) => {
    const c = Math.floor(i / best.rows), r = i % best.rows
    const b = boxes[i]
    const tx = best.colX[c] + best.colLead[c] - b.lead - b.x0
    const ty = r * rowPitch + (rowPitch - GRID_ROW_GAP - b.h) / 2 - b.y0
    for (const id of part) {
      const p = placed.get(id)!
      placed.set(id, { x: p.x + tx, y: p.y + ty })
      shift.set(id, { x: tx, y: ty })
    }
  })
  return shift
}

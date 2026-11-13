// Satellite blocks for the ELK layout (Phase 2 of
// docs/layout-improvement-plan-pass-2.md).
//
// A satellite is a leaf block with exactly one wire: a Sheet Label Sink or
// Source, a constant, a data store read or write, a No Connection block, or a
// display or logger. The ELK adapter (elkLayout.ts) removes the satellites
// from the ELK graph. It makes each host block's ELK node larger by the space
// that its satellites need (a "reservation"), and puts each satellite in that
// space after ELK runs.
//
// A sink-type satellite goes beside the host's output port (the "east"
// side). A source-type satellite goes beside the host's input port (the
// "west" side). These names are logical sides: on a flipped host (inputs on
// the right, outputs on the left, blockGeometry.dataPortGeometry()) the east
// side is on the left. A satellite must be flipped when its host is flipped,
// so that its own port faces the host; else it stays in the ELK graph.
//
// Geometry of one side of a host. `u` is the distance outward from the host
// edge (to the right on the east side, to the left on the west side). `y` is
// measured from the host's top edge. The satellites go into sub-columns:
// sub-column 0 is nearest to the host. Each item of the side has a row:
//   - a satellite: the row of its port. A satellite wire is straight when this
//     row is the host port's row.
//   - a through lane: the wire of a host port that has ELK edges. It crosses
//     the whole reservation to a port on the node border.
//   - a shared lane: the branch of a net that feeds a satellite and other
//     blocks. It leaves the satellite wire at a junction in front of the
//     satellite's sub-column, goes past the satellite, and ends at the border.
// The rows are as near to the host port rows as the separations permit
// (least squares, ordered, `arrangeSide()`). When a host's ports are too close
// together for the satellites, the rows spread out and the wires turn once in
// a channel next to the host ("fan-out"). The fan-out has no crossings: a wire
// that goes up turns nearer to the host than the wires below it, a wire that
// goes down turns nearer than the wires above it.
//
// A wire that goes past a nearer satellite clears that satellite's box and its
// name label above it by `clearance`. Two satellites in one sub-column have
// `satelliteGap` between them, name labels included.
//
// The arrangement depends only on the wiring and the block sizes, never on
// block positions, so the layout stays idempotent.

import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'
import { HANDLE_OUTSET, portOffsetY, subsystemNameTextWidth, hasSubsystemName, isFlipped } from './blockGeometry'
import type { Metrics } from './autoLayout'

/** Block types that can be satellites (when they have exactly one wire). */
export const SATELLITE_TYPES = new Set<string>([
  'sheet_label_sink',
  'sheet_label_source',
  'source',
  'clock',
  'data_store_read',
  'data_store_write',
  'no_connection',
  'signal_display',
  'signal_logger',
])

/** Gap between the block edge and a port name outside the block (px): BlockNode `.port-name-label`. */
export const PORT_LABEL_MARGIN = 12
/** ELK's least distance between a node border and a wire bend in the next layer (`elk.spacing.edgeNodeBetweenLayers`, default 10 px). */
const ELK_EDGE_NODE_GAP = 10
/** Height of the block name that the editor draws above a block (px): 0.75rem. */
export const BLOCK_NAME_HEIGHT = 12
/** The block name font is 0.5rem. Width estimate from the bold subsystem font (20 px), scaled. */
const NAME_FONT_SCALE = 8 / 20

export type SatelliteSide = 'east' | 'west'

export interface Satellite {
  id: string
  wireId: string
  hostId: string
  /** east: a sink right of a host output port. west: a source left of a host input port. */
  side: SatelliteSide
  /** The host port that the satellite wire connects to. */
  hostPort: number
  /** The satellite's own port. */
  satPort: number
  /** The host port also feeds blocks that are in the ELK graph (east side only). */
  shared: boolean
}

/** Why a block that looks like a satellite stays in the ELK graph. */
export type KeptReason = 'pair' | 'second-on-port' | 'control' | 'flip'

export interface SatelliteDetection {
  satellites: Map<string, Satellite>
  /** Candidates (a satellite type with one wire) that stay in the ELK graph. */
  kept: Array<{ id: string; reason: KeptReason }>
}

/**
 * Find the satellites of one sheet. A candidate is a block of a satellite type
 * with exactly one wire, on a data port. It is not a satellite when:
 *   - the block at the other end is a candidate too (a pair stays in the graph);
 *   - the wire is an enable or reset wire;
 *   - another satellite already uses the same host output port;
 *   - the block is flipped and its host is not, or the opposite.
 * `isLaidOut` tells which blocks are in the layout (not comments).
 */
export function findSatellites(
  blocks: BlockData[],
  wires: WireData[],
  isLaidOut: (b: BlockData) => boolean = () => true,
  types: ReadonlySet<string> = SATELLITE_TYPES,
): SatelliteDetection {
  const byId = new Map(blocks.filter(isLaidOut).map(b => [b.id, b]))
  const wiresOf = new Map<string, WireData[]>()
  const seen = new Set<string>()
  for (const w of wires) {
    if (seen.has(w.id)) continue
    seen.add(w.id)
    if (!byId.has(w.sourceBlockId) || !byId.has(w.targetBlockId)) continue
    for (const id of new Set([w.sourceBlockId, w.targetBlockId])) {
      if (!wiresOf.has(id)) wiresOf.set(id, [])
      wiresOf.get(id)!.push(w)
    }
  }
  const candidate = (b: BlockData) => types.has(b.type) && (wiresOf.get(b.id)?.length ?? 0) === 1
    && wiresOf.get(b.id)![0].sourceBlockId !== wiresOf.get(b.id)![0].targetBlockId

  const satellites = new Map<string, Satellite>()
  const kept: SatelliteDetection['kept'] = []
  const usedHostPorts = new Set<string>()
  for (const b of byId.values()) {
    if (!candidate(b)) continue
    const w = wiresOf.get(b.id)![0]
    const sink = w.targetBlockId === b.id
    const host = byId.get(sink ? w.sourceBlockId : w.targetBlockId)!
    if (w.targetPortIndex < 0) { kept.push({ id: b.id, reason: 'control' }); continue }
    if (candidate(host)) { kept.push({ id: b.id, reason: 'pair' }); continue }
    if (isFlipped(b) !== isFlipped(host)) { kept.push({ id: b.id, reason: 'flip' }); continue }
    const hostPort = sink ? Math.max(0, w.sourcePortIndex) : w.targetPortIndex
    const key = `${host.id}:${sink ? 'out' : 'in'}:${hostPort}`
    if (usedHostPorts.has(key)) { kept.push({ id: b.id, reason: 'second-on-port' }); continue }
    usedHostPorts.add(key)
    satellites.set(b.id, {
      id: b.id,
      wireId: w.id,
      hostId: host.id,
      side: sink ? 'east' : 'west',
      hostPort,
      satPort: sink ? w.targetPortIndex : Math.max(0, w.sourcePortIndex),
      shared: false,
    })
  }
  // A sink satellite's net is shared when its host port drives other wires
  for (const s of satellites.values()) {
    if (s.side !== 'east') continue
    s.shared = wires.some(w => w.id !== s.wireId && w.sourceBlockId === s.hostId
      && Math.max(0, w.sourcePortIndex) === s.hostPort && byId.has(w.targetBlockId) && !satellites.has(w.targetBlockId))
  }
  return { satellites, kept }
}

// --- Arrangement of one side ----------------------------------------------

/** The size of one satellite, as the arrangement needs it. */
export interface SatelliteGeometry {
  id: string
  width: number
  height: number
  /** Offset of the satellite's port from its top edge. */
  portY: number
  /** Height of the name label above the block (0 when hidden). */
  nameHeight: number
  /** How far the name label extends past each side of the block (px, >= 0). */
  nameOverhang: number
}

/** One port on the side of a host. */
export interface SidePort {
  port: number
  /** The port's row, from the host top. */
  y: number
  /** The satellite on this port, if any. */
  satellite?: SatelliteGeometry
  /** The port also has wires in the ELK graph. */
  through: boolean
  /**
   * Width of the port name that the editor draws outside the block, next to
   * this port (0 or absent: no name). The fan-out and the sub-columns start
   * after the widest name of the side.
   */
  labelWidth?: number
}

export interface ArrangeParams {
  /** Vertical gap between two satellites in one sub-column, name labels included. */
  satelliteGap: number
  /** Clearance between a wire and a satellite box or name label that it goes past. */
  clearance: number
  /** Least distance between two lanes (when the host ports are farther apart). */
  laneGap: number
  /** Horizontal gap between sub-columns. */
  columnGap: number
  /** Length of a straight satellite wire, handles excluded. */
  leadGap: number
  /** Distance between the turns of the fan-out wires. */
  turnSpacing: number
  /** Space between the last sub-column and the node border. */
  trailGap: number
  maxColumns: number
  /** Pattern cost of one satellite wire that is not straight (px). */
  satelliteJogCost: number
  /** Pattern cost of one through wire that is not straight (px). */
  laneJogCost: number
}

export const DEFAULT_ARRANGE_PARAMS: ArrangeParams = {
  satelliteGap: 8,
  clearance: 6,
  laneGap: 10,
  columnGap: 16,
  leadGap: 20,
  turnSpacing: 8,
  trailGap: 10,
  maxColumns: 6,
  satelliteJogCost: 80,
  laneJogCost: 400,
}

interface Pt { u: number; y: number }

export interface PlacedSatellite {
  id: string
  /** Sub-column, 0 nearest to the host. */
  column: number
  /** Distance from the host edge to the satellite's near edge. */
  u: number
  /** Top of the satellite block, from the host top. */
  top: number
  /** The row of the satellite's wire, from the host top. */
  row: number
  /** The u of the wire's turn, when the wire is not straight. */
  turnU?: number
}

export interface SideArrangement {
  /** Width of the reservation, from the host edge to the node border. 0 when there is no satellite. */
  width: number
  /** Extent of the arrangement, from the host top. `top` <= 0 and `bottom` >= host height. */
  top: number
  bottom: number
  satellites: PlacedSatellite[]
  /**
   * For each host port with ELK edges: the row of its port on the node border,
   * and the path from the wire end at the host (u = HANDLE_OUTSET, port row) to
   * the node border (u = width). The path has its bend points only, plus the two ends.
   */
  lanes: Map<number, { row: number; path: Pt[] }>
  /** Pattern that was selected (for tests and reports). */
  pattern: { columns: number; direction: 'down' | 'up'; sharedLane: 'below' | 'above' }
  /** Satellite wires and through wires that turn. */
  jogs: { satellites: number; lanes: number }
}

type Item =
  | { kind: 'sat'; port: number; y: number; g: SatelliteGeometry; up: number; down: number; col: number; shared: boolean }
  | { kind: 'lane'; port: number; y: number; start: number; shared: boolean }

/** Least distance from item a to a later item b. */
function separation(a: Item, b: Item, p: ArrangeParams): number {
  const natural = Math.max(0, b.y - a.y)
  if (a.kind === 'sat' && b.kind === 'sat') {
    if (a.col === b.col) return a.down + p.satelliteGap + b.up
    // The wire of the farther satellite goes past the nearer one: below it, or above its name
    return a.col < b.col ? a.down + p.clearance : b.up + p.clearance
  }
  if (a.kind === 'sat' && b.kind === 'lane') {
    return a.col >= b.start ? a.down + p.clearance : Math.min(p.laneGap, natural)
  }
  if (a.kind === 'lane' && b.kind === 'sat') {
    return b.col >= a.start ? b.up + p.clearance : Math.min(p.laneGap, natural)
  }
  return Math.min(p.laneGap, natural)
}

/** Weighted isotonic regression (pool adjacent violators): z non-decreasing, nearest to `target`. */
function isotonic(target: number[], weight: number[]): number[] {
  const pools: Array<{ w: number; wt: number; n: number }> = []
  for (let i = 0; i < target.length; i++) {
    pools.push({ w: weight[i], wt: weight[i] * target[i], n: 1 })
    while (pools.length >= 2) {
      const top = pools[pools.length - 1], prev = pools[pools.length - 2]
      if (top.wt / top.w >= prev.wt / prev.w) break
      prev.w += top.w; prev.wt += top.wt; prev.n += top.n
      pools.pop()
    }
  }
  const z: number[] = []
  for (const q of pools) for (let k = 0; k < q.n; k++) z.push(q.wt / q.w)
  return z
}

/**
 * A row this near its port row (px) snaps to the port row, so the wire is
 * straight. A turn of less than this would be a visible small step (the
 * `microJogs` score in layoutMetrics.ts). The separations keep at least 6 px
 * between rows, so the snap leaves at least 4 px.
 */
const EPS_STRAIGHT = 2

/** Rows for a sequence of items: ordered, separated, as near to the port rows as possible. */
function solveRows(items: Item[], p: ArrangeParams): number[] {
  const n = items.length
  if (n === 0) return []
  // Consecutive gaps that satisfy every pairwise separation
  const gap: number[] = []
  for (let k = 0; k + 1 < n; k++) {
    let need = 0
    let sum = 0
    for (let i = k; i >= 0; i--) {
      need = Math.max(need, separation(items[i], items[k + 1], p) - sum)
      if (i > 0) sum += gap[i - 1]
      if (sum > 400) break
    }
    gap.push(Math.max(0, need))
  }
  const offset = [0]
  for (let k = 0; k + 1 < n; k++) offset.push(offset[k] + gap[k])
  // Through lanes keep their rows when they can. Satellites move next. A
  // shared branch has no row of its own to keep: it moves, not its satellite.
  const weight = items.map(it => (it.kind === 'lane' && !it.shared ? 50 : it.kind === 'lane' ? 1e-4 : 1))
  const z = isotonic(items.map((it, i) => it.y - offset[i]), weight)
  return z.map((v, i) => v + offset[i])
}

/** Arrange one side of a host for one pattern. */
function arrangeWith(
  ports: SidePort[],
  hostHeight: number,
  columns: number,
  direction: 'down' | 'up',
  sharedLane: 'below' | 'above',
  p: ArrangeParams,
  sideLabelWidth: number,
): SideArrangement & { cost: number } {
  const items: Item[] = []
  let m = 0
  for (const sp of [...ports].sort((a, b) => a.port - b.port)) {
    if (sp.satellite) {
      const g = sp.satellite
      const col = direction === 'down' ? m % columns : columns - 1 - (m % columns)
      m++
      const sat: Item = { kind: 'sat', port: sp.port, y: sp.y, g, up: g.portY + g.nameHeight, down: g.height - g.portY, col, shared: sp.through }
      const lane: Item | null = sp.through ? { kind: 'lane', port: sp.port, y: sp.y, start: col, shared: true } : null
      if (lane && sharedLane === 'above') items.push(lane, sat)
      else items.push(sat, ...(lane ? [lane] : []))
    } else if (sp.through) {
      items.push({ kind: 'lane', port: sp.port, y: sp.y, start: 0, shared: false })
    }
  }
  const rows = solveRows(items, p)
  // Snap: a straight item keeps the exact port row; a satellite that moves gets a whole-px top
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (Math.abs(rows[i] - it.y) < EPS_STRAIGHT) rows[i] = it.y
    else if (it.kind === 'sat') rows[i] = Math.round(rows[i] - it.g.portY) + it.g.portY
    else rows[i] = Math.round(rows[i] * 2) / 2
  }

  // Turns of the fan-out: wires that go up turn nearer to the host the higher they are,
  // wires that go down turn nearer the lower they are. Shared branches follow their satellite.
  const fan = items.map((it, i) => ({ it, i })).filter(({ it, i }) => !(it.kind === 'lane' && it.shared) && rows[i] !== it.y)
  const ups = fan.filter(({ it, i }) => rows[i] < it.y).map(f => f.i)
  const downs = fan.filter(({ it, i }) => rows[i] > it.y).map(f => f.i).reverse()
  const slotOf = new Map<number, number>()
  ups.forEach((i, s) => slotOf.set(i, s))
  downs.forEach((i, s) => slotOf.set(i, s))
  const slots = Math.max(ups.length, downs.length)
  // Port names outside the block: 12 px from the block edge (BlockNode, pdfRenderer.ts)
  const widestLabel = Math.max(sideLabelWidth, ...ports.map(sp => sp.labelWidth ?? 0))
  const leadIn = widestLabel > 0 ? PORT_LABEL_MARGIN + widestLabel + 4 : 0
  const slotU = (s: number) => leadIn + HANDLE_OUTSET + 10 + s * p.turnSpacing

  // Sub-column x positions
  const used = new Set(items.filter(it => it.kind === 'sat').map(it => (it as any).col as number))
  const colCount = used.size === 0 ? 0 : Math.max(...used) + 1
  const pad = new Array(colCount).fill(0)
  const colW = new Array(colCount).fill(0)
  for (const it of items) if (it.kind === 'sat') pad[it.col] = Math.max(pad[it.col], it.g.nameOverhang)
  for (const it of items) if (it.kind === 'sat') colW[it.col] = Math.max(colW[it.col], pad[it.col] + it.g.width + it.g.nameOverhang)
  const colU: number[] = []
  let u = slots > 0 ? slotU(slots - 1) + 10 + HANDLE_OUTSET : leadIn + HANDLE_OUTSET + p.leadGap + HANDLE_OUTSET
  for (let c = 0; c < colCount; c++) {
    colU.push(u)
    u += colW[c] + (colW[c] > 0 ? p.columnGap : 0)
  }
  // Without satellites, the reservation is the space of the port names only
  // (port-name clearance). ELK keeps the first bend of a wire at least
  // ELK_EDGE_NODE_GAP from the node border, outside the port, so the border
  // can be that much nearer than the end of the widest name.
  const width = colCount > 0
    ? colU[colCount - 1] + colW[colCount - 1] + p.trailGap
    : widestLabel > 0 ? (slots > 0 ? slotU(slots - 1) + 10 : leadIn - ELK_EDGE_NODE_GAP) : 0

  const satellites: PlacedSatellite[] = []
  const lanes = new Map<number, { row: number; path: Pt[] }>()
  let top = 0, bottom = hostHeight
  let satJogs = 0, laneJogs = 0
  const fanPath = (i: number, y: number): Pt[] => {
    const start: Pt = { u: HANDLE_OUTSET, y }
    if (rows[i] === y) return [start]
    const su = slotU(slotOf.get(i)!)
    return [start, { u: su, y }, { u: su, y: rows[i] }]
  }
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (it.kind === 'sat') {
      const turn = rows[i] !== it.y ? slotU(slotOf.get(i)!) : undefined
      if (turn !== undefined) satJogs++
      const satTop = rows[i] - it.g.portY
      satellites.push({ id: it.g.id, column: it.col, u: colU[it.col] + pad[it.col], top: satTop, row: rows[i], turnU: turn })
      top = Math.min(top, satTop - it.g.nameHeight)
      bottom = Math.max(bottom, satTop + it.g.height)
    } else if (!it.shared) {
      if (rows[i] !== it.y) laneJogs++
      lanes.set(it.port, { row: rows[i], path: [...fanPath(i, it.y), { u: width, y: rows[i] }] })
      top = Math.min(top, rows[i] - 2)
      bottom = Math.max(bottom, rows[i] + 2)
    }
  }
  // Shared branches: from the satellite's wire, at a junction in front of its sub-column
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (it.kind !== 'lane' || !it.shared) continue
    const satIndex = items.findIndex(x => x.kind === 'sat' && x.port === it.port)
    const sat = items[satIndex] as Extract<Item, { kind: 'sat' }>
    const junctionU = colU[sat.col] - 10
    const path = [...fanPath(satIndex, sat.y), { u: junctionU, y: rows[satIndex] }, { u: junctionU, y: rows[i] }, { u: width, y: rows[i] }]
    lanes.set(it.port, { row: rows[i], path })
    top = Math.min(top, rows[i] - 2)
    bottom = Math.max(bottom, rows[i] + 2)
  }
  const span = bottom - top
  const cost = width + span + p.satelliteJogCost * satJogs + p.laneJogCost * laneJogs
  return {
    width, top, bottom, satellites, lanes,
    pattern: { columns, direction, sharedLane },
    jogs: { satellites: satJogs, lanes: laneJogs },
    cost,
  }
}

/**
 * Arrange the satellites on one side of a host. Tries 1 to `maxColumns`
 * sub-columns, in each direction, with the shared branches below or above
 * their satellite, and keeps the pattern of least cost: reservation width
 * plus height, plus a cost for each wire that is not straight. Ties keep the
 * first pattern in that order, so the result is deterministic.
 *
 * `sideLabelWidth` is the widest port name that the host draws outside this
 * side (all its ports, connected or not). The fan-out and the sub-columns
 * start after it. A side with no satellite and a port name gets a
 * reservation of the name width only, with straight lanes, so that the first
 * bend of an ELK wire comes after the names (port-name clearance).
 */
export function arrangeSide(
  ports: SidePort[],
  hostHeight: number,
  params: Partial<ArrangeParams> = {},
  sideLabelWidth = 0,
): SideArrangement {
  const p = { ...DEFAULT_ARRANGE_PARAMS, ...params }
  const satCount = ports.filter(sp => sp.satellite).length
  const anyShared = ports.some(sp => sp.satellite && sp.through)
  let best: (SideArrangement & { cost: number }) | null = null
  for (let k = 1; k <= Math.max(1, Math.min(p.maxColumns, satCount)); k++) {
    for (const direction of (k === 1 ? ['down'] : ['down', 'up']) as Array<'down' | 'up'>) {
      for (const sharedLane of (anyShared ? ['below', 'above'] : ['below']) as Array<'below' | 'above'>) {
        const a = arrangeWith(ports, hostHeight, k, direction, sharedLane, p, sideLabelWidth)
        if (!best || a.cost < best.cost - 1e-6) best = a
      }
    }
  }
  const { cost: _cost, ...result } = best!
  return result
}

/**
 * Estimated width of the port name that the editor draws outside a block,
 * next to a port (0 when the block shows no port names). Subsystems name
 * their ports in `inputPorts` / `outputPorts`. Other blocks that show port
 * names get the 60 px that pdfRenderer.ts reserves.
 */
export function portLabelWidth(block: BlockData, side: SatelliteSide, port: number): number {
  const shows = block.type !== 'multiply' && (block.parameters?.showPortNames || block.type === 'body2quaternion_rates')
  if (!shows) return 0
  if (block.type === 'subsystem') {
    const names = (side === 'east' ? block.parameters?.outputPorts : block.parameters?.inputPorts) ?? []
    const name = names[port]
    return name ? Math.ceil(subsystemNameTextWidth(String(name)) * NAME_FONT_SCALE) : 0
  }
  return 60
}

/** Satellite size for the arrangement: block size, port offset, name label. */
export function satelliteGeometry(block: BlockData, m: Metrics, satPort: number, side: SatelliteSide): SatelliteGeometry {
  const count = side === 'east' ? m.inputs : m.outputs
  const showsName = block.type !== 'no_connection' && block.parameters?.showName !== false && !hasSubsystemName(block)
  const nameWidth = showsName ? subsystemNameTextWidth(block.name ?? '') * NAME_FONT_SCALE : 0
  return {
    id: block.id,
    width: m.width,
    height: m.height,
    portY: portOffsetY(satPort, count, m.height),
    nameHeight: showsName ? BLOCK_NAME_HEIGHT : 0,
    nameOverhang: Math.max(0, Math.ceil((nameWidth - m.width) / 2)),
  }
}

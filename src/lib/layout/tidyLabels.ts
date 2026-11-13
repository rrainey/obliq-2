// Tidy signal labels (Phase 5 of docs/layout-improvement-plan-pass-2.md,
// Goal 2 of docs/layout-improvement-goals-pass-2.md).
//
// This adjustment edits the model structure. It does not change the
// behaviour of the model: each edit replaces a drawn wire with a Sheet Label
// pair of the same signal, or the opposite, and code generation and
// simulation resolve a label pair to the same connection as the wire
// (ModelFlattener.resolveSheetLabels()). The normal layout then runs on the
// result.
//
// Label scope (what a Sheet Label Source can see), from the code that
// resolves the labels:
//   - ModelFlattener.resolveSheetLabels(): the scope key of a label is the
//     subsystem path of its block (`subsystemPath.join('/')`, or `root`). All
//     sheets of one subsystem (or all top-level sheets) share one scope. A
//     source looks for a sink with the same `signalName` in its own scope,
//     then in each parent scope, then in any scope of the model (a global
//     fallback). Two sinks with one name in one scope give a warning, and the
//     last one wins.
//   - crossingTagPorts.ts: for a segregated subsystem (and each model
//     reference), a source outside and a sink inside with the same name
//     become an output port, and the opposite an input port. This test uses
//     the names only, not the scopes.
//   - sheetLabelUtils.validateSheetLabels(): a source with no sink of its
//     name on its sheet or in the subsystems below it is "unmatched". A sink
//     with no source is permitted.
// Thus, a new signal name must be unique in the whole model, not only in its
// scope: else the global fallback or the crossing-tag test could connect it to
// a label elsewhere. A host model that embeds this model can also read a sink
// by its name (crossingTagPorts.ts). The tidy cannot see the hosts, so it
// never renames an existing label, and it removes a sink only when no source
// of its name remains in the model.
//
// The edits (each one has its own option):
//   A. pairToWire: a Sheet Label Sink and a Sheet Label Source of the same
//      signal on the same sheet, where a direct wire is short, become a wire
//      from the sink's driver to the source's consumers.
//   B. wireToPair: a wire that is long and crosses many other nets (or a
//      backward wire that goes around much of the sheet) becomes a Sheet
//      Label Sink at its driver and a Sheet Label Source at its consumer.
//   C. splitSources: a Sheet Label Source whose consumers are far apart
//      becomes one source for each group of near consumers.
// The layout score decides each edit: the tidy lays out the sheet, proposes
// candidates from the drawn geometry, applies them, lays out the sheet again
// and keeps the edits only when the score is better (see `accepts()`). It
// repeats this until a round keeps no edit, so a second run makes no edit.
//
// D (the endpoint rule of Goal 2) is a check, labelEndpointFaults(): after
// the layout, a sink must be the right-hand end of its wire and a source the
// left-hand end of each of its wires (mirrored on a flipped block).

import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'
import type { Sheet } from '@/lib/modelStore'
import { buildExportPlan, type PrintScope } from '@/lib/export/sheetTree'
import { scoreSheetLayout, wireDetails, blockWireGeometry, type SheetLayoutMetrics } from './layoutMetrics'
import { effectiveSheetRoles, isSubsystemBlock, type DefinitionLookup, type SubsystemFunction } from './subsystemRole'
import { isFlipped } from './blockGeometry'

export type TidyEditKind = 'pair-to-wire' | 'wire-to-pair' | 'split-source'

export interface TidyEdit {
  kind: TidyEditKind
  sheetId: string
  /** Breadcrumb of the sheet, joined with "/". */
  sheetPath: string
  signalName: string
  /** What the edit did and why, for the report. */
  reason: string
  blocksAdded: string[]
  blocksRemoved: string[]
}

export interface TidyLabelOptions {
  /** Edit A: replace a label pair on one sheet with a wire. */
  pairToWire: boolean
  /** Edit B: replace a long wire that crosses many nets with a label pair. */
  wireToPair: boolean
  /** Edit C: one Sheet Label Source for each group of near consumers. */
  splitSources: boolean
  /** A: the most Manhattan distance (px) from the driver port to each consumer port. */
  pairMaxLength: number
  /** B: the least drawn length (px) of a candidate wire. Must be more than pairMaxLength. */
  wireMinLength: number
  /** B: the least crossings of a candidate wire with other nets. */
  wireMinCrossings: number
  /**
   * B: a backward wire is a candidate when its drawn length is at least this
   * fraction of the sheet's width plus height (it goes around much of the sheet).
   */
  feedbackMinFraction: number
  /**
   * B: permit a wire between the return row and the forward rows (one end
   * flipped, the other not). Off: these wires keep their drawn line.
   */
  allowChannelWires: boolean
  /** C: consumers nearer than this (px) to another consumer of the group join that group. */
  consumerGroupDistance: number
  /** A, B, C: keep an edit only when the sheet's crossings drop by at least this many... */
  minCrossingDrop: number
  /** ...and by at least this percentage of the crossings before the edit (B). */
  minCrossingDropPct: number
  /** C: keep a split only when the drawn wire length drops by at least this (px). */
  minLengthDrop: number
  /** B: keep an edit only when the sheet area grows by this percentage or less. */
  maxAreaGrowthPct: number
  /** B: the weight of one crossing of a candidate wire, for the order of the candidates. */
  crossingWeight: number
  /** B: the weight of one px of drawn length of a candidate wire, for the order of the candidates. */
  lengthWeight: number
  /** B: the most candidates of one round on one sheet. */
  maxCandidatesPerSheet: number
  /** The most rounds on one sheet. */
  maxRounds: number
  /** The most trial layouts on one sheet. This bounds the run time. */
  maxEvaluationsPerSheet: number
}

/**
 * The defaults. A and C are off: on the three reference models they find no
 * candidate (no sheet has a label pair on one sheet, and the consumers of each
 * fanned-out source are near each other), so they have not shown that they
 * make a diagram easier to read. See docs/layout-engine-comparison.md,
 * "Phase 5 results".
 */
export const DEFAULT_TIDY_OPTIONS: TidyLabelOptions = {
  pairToWire: false,
  wireToPair: true,
  splitSources: false,
  pairMaxLength: 400,
  wireMinLength: 800,
  wireMinCrossings: 6,
  feedbackMinFraction: 0.5,
  allowChannelWires: false,
  consumerGroupDistance: 400,
  minCrossingDrop: 2,
  minCrossingDropPct: 3,
  minLengthDrop: 200,
  maxAreaGrowthPct: 10,
  crossingWeight: 1,
  lengthWeight: 0.002,
  maxCandidatesPerSheet: 8,
  maxRounds: 3,
  maxEvaluationsPerSheet: 30,
}

/** A sheet's blocks and wires. */
export interface SheetContents {
  blocks: BlockData[]
  connections: WireData[]
}

/**
 * Lays out one sheet and gives its blocks and wires with the layout applied.
 * The tidy calls it for each trial. It must be deterministic and must not
 * depend on the stored block positions.
 */
export type SheetLayouter = (sheet: SheetContents) => Promise<SheetContents>

/** A label that breaks the endpoint rule (Goal 2) after the layout. */
export interface EndpointFault {
  sheetId: string
  sheetPath: string
  blockId: string
  signalName: string
  wireId: string
  /** sink: the wire goes past the sink's port. source: the wire goes back past the source's port. */
  kind: 'sink' | 'source'
}

export interface TidyResult {
  sheets: Sheet[]
  edits: TidyEdit[]
  /** Trial layouts, all sheets. */
  evaluations: number
  elapsedMsec: number
  /**
   * Sheets where the tidy stopped at maxRounds or maxEvaluationsPerSheet with
   * an edit kept in the last round. A second run can make more edits there.
   */
  notSettled: string[]
  /** Candidates that a guard refused, by guard. */
  refused: Record<string, number>
}

// --- Names ----------------------------------------------------------------

/** The unit suffixes of CLAUDE.md ("Engineering models: units in names"). */
export const UNIT_SUFFIXES = [
  'm', 'cm', 'km', 'rad', 'deg', 'degK', 'degC', 's', 'msec', 'kg', 'us', 'mps', 'mps2', 'radps', 'dps',
  'N', 'Nm', 'Pa', 'V', 'A', 'W', 'mAh', 'Hz', 'pct',
]

/** The unit suffix of a name (with its underscore), or ''. */
export function unitSuffix(name: string): string {
  let best = ''
  for (const u of UNIT_SUFFIXES) {
    const s = `_${u}`
    if (name.endsWith(s) && name.length > s.length && s.length > best.length) best = s
  }
  return best
}

/** A name that is not in `taken`: `stem_2_unit`, `stem_3_unit`, ... The unit suffix stays at the end. */
export function uniqueSignalName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  const unit = unitSuffix(base)
  const stem = base.slice(0, base.length - unit.length)
  for (let k = 2; ; k++) {
    const name = `${stem}_${k}${unit}`
    if (!taken.has(name)) return name
  }
}

/** Letters, digits and underscores, with a letter first. */
function sanitize(text: string): string {
  const s = text.replace(/[^A-Za-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (!s) return 'signal'
  return /^[A-Za-z]/.test(s) ? s : `sig_${s}`
}

/**
 * The signal name for a new label pair on the net of `block`, output `port`:
 * the output port name of a subsystem, the port name of an Input Port, else
 * the block name (with the port number when the block has more than one
 * output). The name keeps its unit suffix, and the tidy never adds one.
 */
export function baseSignalName(block: BlockData, port: number): string {
  const p = block.parameters ?? {}
  if (isSubsystemBlock(block) && Array.isArray(p.outputPorts) && typeof p.outputPorts[port] === 'string') {
    return sanitize(p.outputPorts[port])
  }
  if (block.type === 'input_port') return sanitize(String(p.portName ?? block.name))
  if (block.type === 'sheet_label_source' && typeof p.signalName === 'string') return sanitize(p.signalName)
  const outputs = Array.isArray(block.outputs) ? block.outputs.length : 0
  return sanitize(outputs > 1 || port > 0 ? `${block.name}_${port + 1}` : block.name)
}

// --- Model-wide registry ----------------------------------------------------

/** The names and ids in use in the whole model. Trials work on a copy. */
class Registry {
  constructor(
    readonly names: Set<string>,
    readonly blockIds: Set<string>,
    readonly wireIds: Set<string>,
    /** Sheet Label Sources by signal name, whole model. */
    readonly sources: Map<string, number>,
    /** Sheet Label Sinks by signal name, whole model. */
    readonly sinks: Map<string, number>,
  ) {}

  static of(sheets: Sheet[]): Registry {
    const r = new Registry(new Set(), new Set(), new Set(), new Map(), new Map())
    const visit = (list: Array<{ blocks?: BlockData[]; connections?: WireData[] }>) => {
      for (const s of list) {
        for (const w of s.connections ?? []) r.wireIds.add(w.id)
        for (const b of s.blocks ?? []) {
          r.blockIds.add(b.id)
          const name = b.parameters?.signalName
          if ((b.type === 'sheet_label_sink' || b.type === 'sheet_label_source') && typeof name === 'string' && name) {
            r.names.add(name)
            const map = b.type === 'sheet_label_sink' ? r.sinks : r.sources
            map.set(name, (map.get(name) ?? 0) + 1)
          }
          if (Array.isArray(b.parameters?.sheets)) visit(b.parameters!.sheets)
        }
      }
    }
    visit(sheets)
    return r
  }

  copy(): Registry {
    return new Registry(new Set(this.names), new Set(this.blockIds), new Set(this.wireIds), new Map(this.sources), new Map(this.sinks))
  }

  id(base: string, set: Set<string>): string {
    let id = base
    for (let k = 2; set.has(id); k++) id = `${base}_${k}`
    set.add(id)
    return id
  }

  add(map: Map<string, number>, name: string, n: number) {
    map.set(name, (map.get(name) ?? 0) + n)
  }
}

/** A block name that no other block on the sheet has. */
function uniqueBlockName(base: string, blocks: BlockData[]): string {
  const taken = new Set(blocks.map(b => b.name))
  let name = base
  for (let k = 2; taken.has(name); k++) name = `${base}_${k}`
  return name
}

// --- Guards ------------------------------------------------------------------

const ROLE_STAGES = new Set<SubsystemFunction>(['controller', 'actuator', 'plant', 'sensor', 'compensator'])
const isLabel = (b: BlockData | undefined) => b?.type === 'sheet_label_sink' || b?.type === 'sheet_label_source'

/**
 * The blocks on the forward path of a loop: on a path of data wires from a
 * controller to a plant (both included). Empty when the sheet has no
 * controller or no plant.
 */
export function forwardPathBlocks(wires: WireData[], roles: ReadonlyMap<string, SubsystemFunction>): Set<string> {
  const controllers = [...roles].filter(([, r]) => r === 'controller').map(([id]) => id)
  const plants = [...roles].filter(([, r]) => r === 'plant').map(([id]) => id)
  if (!controllers.length || !plants.length) return new Set()
  const data = wires.filter(w => w.targetPortIndex >= 0)
  const reach = (start: string[], next: (w: WireData) => [string, string]) => {
    const seen = new Set(start)
    const queue = [...start]
    while (queue.length) {
      const u = queue.shift()!
      for (const w of data) {
        const [from, to] = next(w)
        if (from === u && !seen.has(to)) { seen.add(to); queue.push(to) }
      }
    }
    return seen
  }
  const down = reach(controllers, w => [w.sourceBlockId, w.targetBlockId])
  const up = reach(plants, w => [w.targetBlockId, w.sourceBlockId])
  return new Set([...down].filter(id => up.has(id)))
}

/** Sheet Label Sources that feed an Output Port directly (the Telemetry structure, deferred). */
function feedsOutputPort(id: string, sheet: SheetContents, byId: Map<string, BlockData>): boolean {
  return sheet.connections.some(w => w.sourceBlockId === id && byId.get(w.targetBlockId)?.type === 'output_port')
}

// --- Candidates ------------------------------------------------------------------

interface Candidate {
  kind: TidyEditKind
  /** B: the wire. A, C: the Sheet Label Source. */
  ref: string
  /** C: the consumer wire ids of each group, the first group stays on the source. */
  groups?: string[][]
  rank: number
  note: string
}

const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

function pairCandidates(laid: SheetContents, reg: Registry, opt: TidyLabelOptions): Candidate[] {
  const byId = new Map(laid.blocks.map(b => [b.id, b]))
  const sinks = new Map<string, BlockData[]>()
  for (const b of laid.blocks) {
    if (b.type === 'sheet_label_sink' && b.parameters?.signalName) {
      const n = b.parameters.signalName
      sinks.set(n, [...(sinks.get(n) ?? []), b])
    }
  }
  const out: Candidate[] = []
  for (const src of laid.blocks) {
    if (src.type !== 'sheet_label_source') continue
    const name = src.parameters?.signalName
    const local = name ? sinks.get(name) : undefined
    // One sink of the name in the whole model: else the resolution is not certain
    if (!local || local.length !== 1 || reg.sinks.get(name) !== 1) continue
    const drive = laid.connections.find(w => w.targetBlockId === local[0].id && w.targetPortIndex === 0)
    const driver = drive && byId.get(drive.sourceBlockId)
    if (!drive || !driver || isLabel(driver)) continue
    const consumers = laid.connections.filter(w => w.sourceBlockId === src.id)
    if (!consumers.length || consumers.some(w => w.targetPortIndex < 0 || !byId.has(w.targetBlockId))) continue
    if (feedsOutputPort(src.id, laid, byId)) continue
    if (consumers.some(w => isLabel(byId.get(w.targetBlockId)))) continue
    const from = blockWireGeometry(driver).sourceEnd(drive.sourcePortIndex)
    let worst = 0
    let ok = true
    for (const w of consumers) {
      const to = blockWireGeometry(byId.get(w.targetBlockId)!).targetEnd(w.targetPortIndex)
      // The consumer is ahead of the driver port, in the direction it faces
      if ((to.x - from.x) * from.dir <= 0) { ok = false; break }
      worst = Math.max(worst, manhattan(from, to))
    }
    if (!ok || worst > opt.pairMaxLength) continue
    out.push({ kind: 'pair-to-wire', ref: src.id, rank: -worst, note: `direct wire about ${Math.round(worst)} px` })
  }
  return out.sort((a, b) => b.rank - a.rank || a.ref.localeCompare(b.ref))
}

function splitCandidates(laid: SheetContents, opt: TidyLabelOptions): Candidate[] {
  const byId = new Map(laid.blocks.map(b => [b.id, b]))
  const out: Candidate[] = []
  for (const src of laid.blocks) {
    if (src.type !== 'sheet_label_source') continue
    const consumers = laid.connections
      .filter(w => w.sourceBlockId === src.id && w.targetPortIndex >= 0 && byId.has(w.targetBlockId))
    if (consumers.length < 2 || feedsOutputPort(src.id, laid, byId)) continue
    const ends = consumers.map(w => ({ w, p: blockWireGeometry(byId.get(w.targetBlockId)!).targetEnd(w.targetPortIndex) }))
    // Single-linkage groups of the consumer ports
    const group = ends.map((_, i) => i)
    const find = (i: number): number => (group[i] === i ? i : (group[i] = find(group[i])))
    for (let i = 0; i < ends.length; i++) {
      for (let j = i + 1; j < ends.length; j++) {
        if (Math.hypot(ends[i].p.x - ends[j].p.x, ends[i].p.y - ends[j].p.y) <= opt.consumerGroupDistance) {
          group[find(j)] = find(i)
        }
      }
    }
    const byRoot = new Map<number, typeof ends>()
    ends.forEach((e, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), e]))
    if (byRoot.size < 2) continue
    // Groups from left to right, then top to bottom; the stable wire ids decide a tie
    const groups = [...byRoot.values()].map(g => {
      const x = Math.min(...g.map(e => e.p.x)), y = Math.min(...g.map(e => e.p.y))
      return { x, y, ids: g.map(e => e.w.id).sort() }
    }).sort((a, b) => a.x - b.x || a.y - b.y || a.ids[0].localeCompare(b.ids[0]))
    const xs = ends.map(e => e.p.x), ys = ends.map(e => e.p.y)
    const span = Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)
    out.push({ kind: 'split-source', ref: src.id, groups: groups.map(g => g.ids), rank: span, note: `${groups.length} groups of consumers, span ${Math.round(span)} px` })
  }
  return out.sort((a, b) => b.rank - a.rank || a.ref.localeCompare(b.ref))
}

interface GuardContext {
  roles: ReadonlyMap<string, SubsystemFunction>
  forward: ReadonlySet<string>
  refused: Record<string, number>
}

function wireCandidates(laid: SheetContents, metrics: SheetLayoutMetrics, opt: TidyLabelOptions, guard: GuardContext): Candidate[] {
  const byId = new Map(laid.blocks.map(b => [b.id, b]))
  const wireById = new Map(laid.connections.map(w => [w.id, w]))
  const refuse = (why: string) => { guard.refused[why] = (guard.refused[why] ?? 0) + 1 }
  const out: Candidate[] = []
  for (const d of wireDetails(laid.blocks, laid.connections).wires) {
    const long = d.length >= opt.wireMinLength && d.crossings >= opt.wireMinCrossings
    const around = d.backward && d.length >= opt.feedbackMinFraction * (metrics.width + metrics.height)
      && d.length >= opt.wireMinLength
    if (!long && !around) continue
    const w = wireById.get(d.id)!
    const s = byId.get(w.sourceBlockId)!, t = byId.get(w.targetBlockId)!
    if (isLabel(s) || isLabel(t)) { refuse('label'); continue }
    if (t.type === 'output_port') { refuse('output-port'); continue }
    if (w.sourceBlockId === w.targetBlockId) { refuse('self'); continue }
    if (guard.forward.has(s.id) && guard.forward.has(t.id)) { refuse('forward-path'); continue }
    const rs = guard.roles.get(s.id), rt = guard.roles.get(t.id)
    if (rs && rt && ROLE_STAGES.has(rs) && ROLE_STAGES.has(rt)) { refuse('role-stage'); continue }
    if (!opt.allowChannelWires && isFlipped(s) !== isFlipped(t)) { refuse('channel'); continue }
    // jc_0171: two connected subsystems keep at least one drawn wire in each direction
    if (isSubsystemBlock(s) && isSubsystemBlock(t)
      && laid.connections.filter(c => c.sourceBlockId === s.id && c.targetBlockId === t.id).length <= 1) {
      refuse('jc_0171'); continue
    }
    out.push({
      kind: 'wire-to-pair', ref: d.id,
      rank: opt.crossingWeight * d.crossings + opt.lengthWeight * d.length,
      note: `${s.name} -> ${t.name}, ${d.length} px, ${d.crossings} crossings${d.backward ? ', backward' : ''}`,
    })
  }
  return out.sort((a, b) => b.rank - a.rank || a.ref.localeCompare(b.ref)).slice(0, opt.maxCandidatesPerSheet)
}

// --- Edits ------------------------------------------------------------------

interface Applied {
  sheet: SheetContents
  edit: Omit<TidyEdit, 'sheetId' | 'sheetPath'>
}

const OFFSET = 60

/** Edit A on `sheet`, or null when it no longer applies. */
function applyPairToWire(sheet: SheetContents, srcId: string, reg: Registry): Applied | null {
  const byId = new Map(sheet.blocks.map(b => [b.id, b]))
  const src = byId.get(srcId)
  const name: string | undefined = src?.parameters?.signalName
  if (!src || !name) return null
  const sink = sheet.blocks.find(b => b.type === 'sheet_label_sink' && b.parameters?.signalName === name)
  const drive = sink && sheet.connections.find(w => w.targetBlockId === sink.id && w.targetPortIndex === 0)
  if (!sink || !drive) return null
  let connections = sheet.connections.map(w => w.sourceBlockId === srcId
    ? { ...w, sourceBlockId: drive.sourceBlockId, sourcePortIndex: drive.sourcePortIndex, routing: undefined }
    : w)
  let blocks = sheet.blocks.filter(b => b.id !== srcId)
  const removed = [srcId]
  reg.add(reg.sources, name, -1)
  // Remove the sink only when no source of its name remains in the model
  const keepSink = (reg.sources.get(name) ?? 0) > 0
  if (!keepSink) {
    blocks = blocks.filter(b => b.id !== sink.id)
    connections = connections.filter(w => w.id !== drive.id)
    removed.push(sink.id)
    reg.add(reg.sinks, name, -1)
  }
  return {
    sheet: { blocks, connections },
    edit: {
      kind: 'pair-to-wire', signalName: name, blocksAdded: [], blocksRemoved: removed,
      reason: keepSink ? 'local source replaced with a wire; the sink stays for other sources' : 'label pair replaced with a wire',
    },
  }
}

/** Edit B on `sheet`, or null when it no longer applies. */
function applyWireToPair(sheet: SheetContents, wireId: string, reg: Registry): Applied | null {
  const byId = new Map(sheet.blocks.map(b => [b.id, b]))
  const w = sheet.connections.find(c => c.id === wireId)
  if (!w) return null
  const s = byId.get(w.sourceBlockId), t = byId.get(w.targetBlockId)
  if (!s || !t) return null
  // jc_0171: two subsystems keep at least one drawn wire in each direction
  if (isSubsystemBlock(s) && isSubsystemBlock(t)) {
    const drawn = sheet.connections.filter(c => c.sourceBlockId === s.id && c.targetBlockId === t.id).length
    if (drawn <= 1) return null
  }
  const added: string[] = []
  let blocks = sheet.blocks
  let connections = sheet.connections.filter(c => c.id !== wireId)
  // Reuse a sink that the net already drives on this sheet
  const existing = sheet.connections
    .filter(c => c.sourceBlockId === s.id && c.sourcePortIndex === w.sourcePortIndex)
    .map(c => byId.get(c.targetBlockId))
    .find(b => b?.type === 'sheet_label_sink' && typeof b.parameters?.signalName === 'string'
      && reg.sinks.get(b.parameters.signalName) === 1)
  let name: string
  if (existing) {
    name = existing.parameters!.signalName
  } else {
    name = uniqueSignalName(baseSignalName(s, w.sourcePortIndex), reg.names)
    reg.names.add(name)
    reg.add(reg.sinks, name, 1)
    const sinkId = reg.id(`tidy_tag_${name}`, reg.blockIds)
    const sink: BlockData = {
      id: sinkId, type: 'sheet_label_sink', name: uniqueBlockName(`Tag_${name}`, blocks),
      position: { x: (s.position?.x ?? 0) + OFFSET * 3, y: s.position?.y ?? 0 },
      parameters: { showName: true, signalName: name },
    }
    blocks = [...blocks, sink]
    connections = [...connections, {
      id: reg.id(`tidy_w_${sinkId}`, reg.wireIds),
      sourceBlockId: s.id, sourcePortIndex: w.sourcePortIndex, targetBlockId: sinkId, targetPortIndex: 0,
    }]
    added.push(sinkId)
  }
  reg.add(reg.sources, name, 1)
  const srcId = reg.id(`tidy_from_${name}_${t.id}_${w.targetPortIndex}`, reg.blockIds)
  const source: BlockData = {
    id: srcId, type: 'sheet_label_source', name: uniqueBlockName(`From_${name}`, blocks),
    position: { x: (t.position?.x ?? 0) - OFFSET * 2, y: t.position?.y ?? 0 },
    parameters: { showName: true, signalName: name },
  }
  blocks = [...blocks, source]
  // The consumer wire keeps the id of the replaced wire
  connections = [...connections, { id: w.id, sourceBlockId: srcId, sourcePortIndex: 0, targetBlockId: t.id, targetPortIndex: w.targetPortIndex }]
  added.push(srcId)
  return {
    sheet: { blocks, connections },
    edit: {
      kind: 'wire-to-pair', signalName: name, blocksAdded: added, blocksRemoved: [],
      reason: existing ? 'wire replaced with a source of the existing sink' : 'wire replaced with a label pair',
    },
  }
}

/** Edit C on `sheet`, or null when it no longer applies. */
function applySplitSource(sheet: SheetContents, srcId: string, groups: string[][], reg: Registry): Applied | null {
  const src = sheet.blocks.find(b => b.id === srcId)
  const name: string | undefined = src?.parameters?.signalName
  if (!src || !name) return null
  const wires = new Map(sheet.connections.map(w => [w.id, w]))
  if (groups.flat().some(id => wires.get(id)?.sourceBlockId !== srcId)) return null
  let blocks = sheet.blocks
  const retarget = new Map<string, string>()
  const added: string[] = []
  for (let k = 1; k < groups.length; k++) {
    const id = reg.id(`${srcId}__g${k + 1}`, reg.blockIds)
    const first = sheet.blocks.find(b => b.id === wires.get(groups[k][0])!.targetBlockId)
    blocks = [...blocks, {
      ...src, id, name: uniqueBlockName(src.name, blocks),
      position: { x: (first?.position?.x ?? 0) - OFFSET * 2, y: first?.position?.y ?? 0 },
      parameters: { ...(src.parameters ?? {}) },
    }]
    for (const wid of groups[k]) retarget.set(wid, id)
    added.push(id)
    reg.add(reg.sources, name, 1)
  }
  const connections = sheet.connections.map(w => retarget.has(w.id)
    ? { ...w, sourceBlockId: retarget.get(w.id)!, sourcePortIndex: 0, routing: undefined }
    : w)
  return {
    sheet: { blocks, connections },
    edit: { kind: 'split-source', signalName: name, blocksAdded: added, blocksRemoved: [], reason: `one source for each of ${groups.length} groups of consumers` },
  }
}

function apply(sheet: SheetContents, c: Candidate, reg: Registry): Applied | null {
  if (c.kind === 'pair-to-wire') return applyPairToWire(sheet, c.ref, reg)
  if (c.kind === 'split-source') return applySplitSource(sheet, c.ref, c.groups!, reg)
  return applyWireToPair(sheet, c.ref, reg)
}

// --- Decision ------------------------------------------------------------------

/** The hard metrics other than crossings. They are 0 for every ELK layout. */
const FAULT_METRICS = ['throughBlock', 'overlaps', 'blockOverlaps', 'diagonalSegments', 'portDirection'] as const

/** True when the trial layout `after` is better than `before` for edits of `kind`. */
function accepts(kind: TidyEditKind, before: SheetLayoutMetrics, after: SheetLayoutMetrics, opt: TidyLabelOptions): boolean {
  for (const k of FAULT_METRICS) {
    if (after[k] > before[k]) return false
  }
  if (kind === 'wire-to-pair') {
    const need = Math.max(opt.minCrossingDrop, Math.ceil(before.crossings * opt.minCrossingDropPct / 100))
    const area = (m: SheetLayoutMetrics) => m.width * m.height
    return before.crossings - after.crossings >= need
      && area(after) <= area(before) * (1 + opt.maxAreaGrowthPct / 100)
  }
  if (kind === 'split-source') {
    return after.crossings <= before.crossings && after.wireLength <= before.wireLength - opt.minLengthDrop
  }
  return after.crossings <= before.crossings
}

/** A: each wire that the edit made is shorter than a B candidate and crosses no other net. */
function pairWiresClean(laid: SheetContents, before: SheetContents, opt: TidyLabelOptions): boolean {
  const old = new Map(before.connections.map(w => [w.id, w]))
  const changed = new Set(laid.connections
    .filter(w => { const o = old.get(w.id); return !o || o.sourceBlockId !== w.sourceBlockId }).map(w => w.id))
  return wireDetails(laid.blocks, laid.connections).wires
    .filter(d => changed.has(d.id))
    .every(d => d.length < opt.wireMinLength && d.crossings === 0)
}

// --- Driver ------------------------------------------------------------------

interface SheetRun {
  sheet: SheetContents
  edits: Array<Omit<TidyEdit, 'sheetId' | 'sheetPath'>>
  evaluations: number
  settled: boolean
}

async function tidySheet(
  original: SheetContents,
  reg: Registry,
  opt: TidyLabelOptions,
  layout: SheetLayouter,
  lookup: DefinitionLookup | undefined,
  refused: Record<string, number>,
): Promise<SheetRun> {
  let state = original
  let laid = await layout(state)
  let score = scoreSheetLayout(laid.blocks, laid.connections)
  let evaluations = 0
  const edits: SheetRun['edits'] = []

  /** Try a list of candidates as one trial. Keep it when the score accepts it. */
  const trial = async (kind: TidyEditKind, list: Candidate[]): Promise<boolean> => {
    if (evaluations >= opt.maxEvaluationsPerSheet) return false
    const r = reg.copy()
    let next = state
    const done: Applied['edit'][] = []
    for (const c of list) {
      const a = apply(next, c, r)
      if (!a) continue
      next = a.sheet
      done.push({ ...a.edit, reason: `${a.edit.reason} (${c.note})` })
    }
    if (!done.length) return false
    evaluations++
    const laidNext = await layout(next)
    const after = scoreSheetLayout(laidNext.blocks, laidNext.connections)
    if (!accepts(kind, score, after, opt)) return false
    if (kind === 'pair-to-wire' && !pairWiresClean(laidNext, laid, opt)) return false
    const note = `sheet crossings ${score.crossings} -> ${after.crossings}`
    for (const e of done) edits.push({ ...e, reason: `${e.reason}; ${note}` })
    // Commit the names and counts of the trial
    for (const n of r.names) reg.names.add(n)
    for (const n of r.blockIds) reg.blockIds.add(n)
    for (const n of r.wireIds) reg.wireIds.add(n)
    reg.sources.clear(); for (const [k, v] of r.sources) reg.sources.set(k, v)
    reg.sinks.clear(); for (const [k, v] of r.sinks) reg.sinks.set(k, v)
    state = next
    laid = laidNext
    score = after
    return true
  }

  let settled = false
  for (let round = 0; round < opt.maxRounds; round++) {
    let kept = false
    for (const kind of ['pair-to-wire', 'split-source', 'wire-to-pair'] as TidyEditKind[]) {
      if (kind === 'pair-to-wire' && !opt.pairToWire) continue
      if (kind === 'split-source' && !opt.splitSources) continue
      if (kind === 'wire-to-pair' && !opt.wireToPair) continue
      let list: Candidate[]
      if (kind === 'pair-to-wire') list = pairCandidates(laid, reg, opt)
      else if (kind === 'split-source') list = splitCandidates(laid, opt)
      else {
        const roles = effectiveSheetRoles(state.blocks, state.connections, { lookup })
        list = wireCandidates(laid, score, opt, { roles, forward: forwardPathBlocks(state.connections, roles), refused })
      }
      if (!list.length) continue
      // The whole batch first, then each candidate alone
      if (list.length > 1 && await trial(kind, list)) { kept = true; continue }
      for (const c of list) if (await trial(kind, [c])) kept = true
    }
    if (!kept) { settled = true; break }
    if (evaluations >= opt.maxEvaluationsPerSheet) break
  }
  return { sheet: state, edits, evaluations, settled }
}

/**
 * Tidy the signal labels of the sheets in `scope`. `layout` lays out one
 * sheet with the options of the tune (tuneModelLayout.laidOutSheetElk()).
 * Sheets that the tidy does not edit are returned by identity.
 */
export async function tidySignalLabels(
  sheets: Sheet[],
  activeSheetId: string | null,
  scope: PrintScope,
  options: Partial<TidyLabelOptions>,
  layout: SheetLayouter,
  lookup?: DefinitionLookup,
): Promise<TidyResult> {
  const started = Date.now()
  const opt: TidyLabelOptions = { ...DEFAULT_TIDY_OPTIONS, ...options }
  const reg = Registry.of(sheets)
  const plan = buildExportPlan(sheets, scope, activeSheetId).sheets
  const edited = new Map<string, SheetContents>()
  const edits: TidyEdit[] = []
  const notSettled: string[] = []
  const refused: Record<string, number> = {}
  let evaluations = 0
  for (const s of plan) {
    const original = { blocks: s.blocks, connections: s.connections }
    // A sheet with no label and no long wire has no candidate: the first layout decides
    const run = await tidySheet(original, reg, opt, layout, lookup, refused)
    evaluations += run.evaluations
    if (!run.settled) notSettled.push(s.path.join('/'))
    if (!run.edits.length) continue
    edited.set(s.id, run.sheet)
    for (const e of run.edits) edits.push({ ...e, sheetId: s.id, sheetPath: s.path.join('/') })
  }
  return {
    sheets: edited.size ? replaceSheets(sheets, edited) : sheets,
    edits,
    evaluations,
    elapsedMsec: Date.now() - started,
    notSettled,
    refused,
  }
}

/** The tree with the contents of some sheets replaced. Other sheets keep their identity. */
function replaceSheets(sheets: Sheet[], edited: ReadonlyMap<string, SheetContents>): Sheet[] {
  const visit = (sheet: Sheet): Sheet => {
    let changed = false
    let blocks = (sheet.blocks || []).map(b => {
      if (!Array.isArray(b.parameters?.sheets)) return b
      const nested: Sheet[] = b.parameters!.sheets.map(visit)
      if (nested.every((n, i) => n === b.parameters!.sheets[i])) return b
      changed = true
      return { ...b, parameters: { ...b.parameters, sheets: nested } }
    })
    let connections = sheet.connections
    const e = edited.get(sheet.id)
    if (e) {
      // Keep the nested sheets that were just rewritten
      const nestedById = new Map(blocks.map(b => [b.id, b]))
      blocks = e.blocks.map(b => nestedById.get(b.id) ?? b)
      connections = e.connections
      changed = true
    }
    return changed ? { ...sheet, blocks, connections } : sheet
  }
  return sheets.map(visit)
}

// --- D: the endpoint rule ------------------------------------------------------

const EPS = 0.5

/**
 * The Sheet Labels of one laid-out sheet that break the endpoint rule of Goal
 * 2: a sink must be the right-hand end of its wire (no point of the wire is
 * to the right of the sink's port), and a source the left-hand end of each of
 * its wires (no point is to the left of its port). On a flipped label, left
 * and right change places.
 */
export function labelEndpointFaults(
  blocks: BlockData[],
  connections: WireData[],
  where: { sheetId: string; sheetPath: string } = { sheetId: '', sheetPath: '' },
): EndpointFault[] {
  const byId = new Map(blocks.map(b => [b.id, b]))
  const out: EndpointFault[] = []
  for (const d of wireDetails(blocks, connections).wires) {
    const t = byId.get(d.targetBlockId), s = byId.get(d.sourceBlockId)
    if (t?.type === 'sheet_label_sink') {
      const end = d.points[d.points.length - 1]
      // The input of an unflipped sink faces left: every point is at its left
      const side = isFlipped(t) ? 1 : -1
      if (d.points.some(p => (p.x - end.x) * side < -EPS)) {
        out.push({ ...where, blockId: t.id, signalName: t.parameters?.signalName ?? '', wireId: d.id, kind: 'sink' })
      }
    }
    if (s?.type === 'sheet_label_source') {
      const start = d.points[0]
      const side = isFlipped(s) ? -1 : 1
      if (d.points.some(p => (p.x - start.x) * side < -EPS)) {
        out.push({ ...where, blockId: s.id, signalName: s.parameters?.signalName ?? '', wireId: d.id, kind: 'source' })
      }
    }
  }
  return out
}

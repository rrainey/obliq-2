// Applies layout tuning across a scope of the model's sheet tree.
//
// The canvas' older "Reorganize Block Arrangement" actions only ever touched
// the sheet on screen. Tuning generalises that: each adjustment is independent,
// and the scope may reach sheets nested inside subsystems that are not
// currently mounted. That makes this a pure transform over the sheet tree
// rather than a series of store mutations.

import type { Sheet } from '@/lib/modelStore'
import type { BlockData } from '@/components/BlockNode'
import { computeAutoLayout, measure, type AutoLayoutResult, type LayoutResize, type WireRoute } from './autoLayout'
import type { ElkOptionSet } from './elkLayout'
import { effectiveSheetRoles, modelBlockLookup, isSubsystemBlock } from './subsystemRole'
import { buildExportPlan, type PrintScope } from '@/lib/export/sheetTree'
import type { TidyEdit, TidyEditKind, TidyLabelOptions, TidyResult, EndpointFault } from './tidyLabels'

export type TuneScope = PrintScope

/** What to do with the port-name labels on subsystem blocks. */
export type PortLabelChoice = 'show' | 'hide' | 'asis'

/**
 * The layout engine. `elk` (the default) is ELK Layered (elkLayout.ts), with
 * satellite blocks placed beside their hosts (satellites.ts). `classic` is
 * autoLayout.ts. docs/layout-engine-comparison.md compares them.
 */
export type LayoutEngine = 'classic' | 'elk'

export interface TuneLayoutOptions {
  /** Re-arrange blocks so data flows left to right. */
  cleanUpLayout: boolean
  /** Grow subsystems so their ports can line up with what they connect to. */
  resizeSubsystems: boolean
  /** When resizing, the most a subsystem's adjacent ports may be spread apart (px). */
  maxPortSpacing: number
  /** Show or hide the port-name labels on subsystem blocks. */
  subsystemPortLabels: PortLabelChoice
  /** Hide block names everywhere except on subsystems. */
  hideBlockNames: boolean
  scope: TuneScope
  /** The layout engine. Absent means `elk`. */
  engine?: LayoutEngine
  /** ELK options that replace the adapter defaults (ELK engine only). */
  elkOptions?: ElkOptionSet
  /** The model order that ELK receives (ELK engine only). See ElkLayoutOptions.order. */
  elkOrder?: 'flow' | 'list'
  /**
   * Use the subsystem functions (`subsystemFunction`, or a confident
   * suggestion of subsystemRole.ts) for the signal-flow order: controller,
   * actuator, plant from left to right, with sensors and compensators on the
   * return path. ELK engine only. Absent means on.
   */
  useSubsystemFunctions?: boolean
  /**
   * Reserve the space of the port names outside blocks (ELK engine only).
   * Absent means on. For comparisons: the dialog does not show it.
   */
  portNameClearance?: boolean
  /**
   * Where the Output Ports go (ELK engine only): ElkLayoutOptions.outputPorts.
   * Absent means `auto`. For comparisons: the dialog does not show it.
   */
  outputPorts?: 'column' | 'beside' | 'auto'
  /**
   * Mirror feedback-path blocks (ELK engine with subsystem functions only).
   * Absent means on. When on, the layout owns the `flipped` flag of the
   * blocks it lays out: the return-path blocks go on a row below the forward
   * path, flipped (inputs on the right, outputs on the left), and all other
   * blocks are unflipped. When off, the stored flags do not change.
   */
  mirrorReturnPath?: boolean
  /**
   * Tidy signal labels (tidyLabels.ts, ELK engine only). Absent means off.
   * This changes the model structure, not its behaviour: it replaces Sheet
   * Label pairs with wires, long wires with Sheet Label pairs, and splits a
   * Sheet Label Source whose consumers are far apart. The layout then runs on
   * the result.
   */
  tidySignalLabels?: boolean
  /** Options of the tidy that replace DEFAULT_TIDY_OPTIONS. */
  tidyLabelOptions?: Partial<TidyLabelOptions>
}

export const DEFAULT_TUNE_OPTIONS: TuneLayoutOptions = {
  cleanUpLayout: true,
  resizeSubsystems: false,
  maxPortSpacing: 40,
  subsystemPortLabels: 'asis',
  hideBlockNames: false,
  scope: 'sheet',
  engine: 'elk',
  useSubsystemFunctions: true,
  mirrorReturnPath: true,
}

export interface TuneLayoutSummary {
  sheetsAffected: number
  blocksMoved: number
  /** Wires whose turn position (routing) was set or cleared. */
  wiresRouted: number
  blocksResized: number
  /** Blocks whose `flipped` flag the layout set or removed (mirrorReturnPath). */
  blocksFlipped: number
  namesHidden: number
  portLabelsChanged: number
  /** Edits of the tidy of signal labels (tidySignalLabels), all kinds. */
  labelEdits: number
}

/** What the tidy of signal labels did (TuneLayoutResult.labelTidy). */
export interface LabelTidyReport {
  edits: TidyEdit[]
  /** Edits by kind. */
  counts: Record<TidyEditKind, number>
  /** Labels that break the endpoint rule after the layout (labelEndpointFaults()). */
  endpointFaults: EndpointFault[]
  /** Trial layouts. */
  evaluations: number
  /** Run time of the tidy, without the final layout. */
  elapsedMsec: number
  notSettled: string[]
  refused: Record<string, number>
}

export interface TuneLayoutResult {
  sheets: Sheet[]
  summary: TuneLayoutSummary
  /**
   * ELK engine only: the return-path blocks of each laid-out sheet that has
   * any, by sheet id (AutoLayoutResult.returnPath).
   */
  returnPath?: Record<string, string[]>
  /** With tidySignalLabels only. */
  labelTidy?: LabelTidyReport
}

/** Nothing was asked for, so nothing should be touched. */
export function isNoOp(options: TuneLayoutOptions): boolean {
  return !options.cleanUpLayout
    && !options.resizeSubsystems
    && !options.hideBlockNames
    && options.subsystemPortLabels === 'asis'
}

/**
 * How many sheets a scope covers, so the dialog can warn before a wide change.
 * Uses the same resolver as the tuning itself, so the number cannot disagree
 * with what actually happens.
 */
export function countSheetsInScope(
  sheets: Sheet[],
  activeSheetId: string | null,
  scope: TuneScope,
): number {
  return buildExportPlan(sheets, scope, activeSheetId).sheets.length
}

/** The layout of one in-scope sheet (computed now, or before by an asynchronous engine). */
type LayoutBySheet = (sheet: Sheet, blocks: BlockData[]) => AutoLayoutResult

/** Same route as the wire has now: nothing to write. */
function sameRouting(wire: Sheet['connections'][number], route: WireRoute): boolean {
  const r = wire.routing
  if (route.waypoints) {
    const w = r?.waypoints
    return !!w && r?.midpointOffset === undefined && w.length === route.waypoints.length
      && w.every((p, i) => p.x === route.waypoints![i].x && p.y === route.waypoints![i].y)
  }
  return r?.midpointOffset === route.midpointOffset && !r?.waypoints
}

/**
 * Tune the layout with the engine that `options.engine` selects. The ELK
 * engine is asynchronous, so this function is too. elkjs loads on first use.
 */
export async function tuneModelLayout(
  inputSheets: Sheet[],
  activeSheetId: string | null,
  options: TuneLayoutOptions,
): Promise<TuneLayoutResult> {
  let sheets = inputSheets
  const engine = options.engine ?? 'elk'
  // Without clean-up, no engine moves blocks or routes wires: the resize, name
  // and port-label adjustments are the same for both engines.
  if (engine === 'classic' || isNoOp(options) || !options.cleanUpLayout) {
    return tuneModelLayoutSync(sheets, activeSheetId, { ...options, engine: 'classic' })
  }
  // The names and port labels first, so that the layout sees the shown ones
  // (see tuneWith()). This step moves no block.
  const displayed = new Set<string>()
  const display = tuneWith(sheets, activeSheetId, { ...options, cleanUpLayout: false, resizeSubsystems: false },
    () => ({ moves: [], resizes: [], routes: [] }), new Set(), displayed)
  sheets = display.sheets
  let tidy: TidyResult | undefined
  if (options.tidySignalLabels) {
    const { tidySignalLabels } = await import('./tidyLabels')
    const before = modelBlockLookup(sheets)
    tidy = await tidySignalLabels(
      sheets, activeSheetId, options.scope, options.tidyLabelOptions ?? {},
      s => laidOutSheetElk(s, options, before), before,
    )
    sheets = tidy.sheets
  }
  const plan = buildExportPlan(sheets, options.scope, activeSheetId).sheets
  const layouts = new Map<string, AutoLayoutResult>()
  const lookup = modelBlockLookup(sheets)
  const returnPath: Record<string, string[]> = {}
  for (const s of plan) {
    const layout = await layoutSheetElk(s, options, lookup)
    layouts.set(s.id, layout)
    if (layout.returnPath?.length) returnPath[s.id] = layout.returnPath
  }
  const changedBefore = new Set([...displayed, ...(tidy?.edits.map(e => e.sheetId) ?? [])])
  const result = tuneWith(sheets, activeSheetId, options, sheet => layouts.get(sheet.id) ?? { moves: [], resizes: [], routes: [] }, changedBefore)
  result.summary.namesHidden += display.summary.namesHidden
  result.summary.portLabelsChanged += display.summary.portLabelsChanged
  if (!tidy) return { ...result, returnPath }
  const { labelEndpointFaults } = await import('./tidyLabels')
  const endpointFaults = buildExportPlan(result.sheets, options.scope, activeSheetId).sheets
    .flatMap(s => labelEndpointFaults(s.blocks, s.connections, { sheetId: s.id, sheetPath: s.path.join('/') }))
  const counts: Record<TidyEditKind, number> = { 'pair-to-wire': 0, 'wire-to-pair': 0, 'split-source': 0 }
  for (const e of tidy.edits) counts[e.kind]++
  result.summary.labelEdits = tidy.edits.length
  return {
    ...result,
    returnPath,
    labelTidy: {
      edits: tidy.edits, counts, endpointFaults, evaluations: tidy.evaluations,
      elapsedMsec: tidy.elapsedMsec, notSettled: tidy.notSettled, refused: tidy.refused,
    },
  }
}

/**
 * The ELK layout of one sheet with the options of the tune: the minimum
 * subsystem height, Resize Subsystems, the subsystem functions and the mirror
 * of the return path. The result includes the resizes. `lookup` resolves
 * subsystem references for the subsystem functions (modelBlockLookup()).
 */
export async function layoutSheetElk(
  s: { blocks: BlockData[]; connections: Sheet['connections'] },
  options: TuneLayoutOptions,
  lookup: ReturnType<typeof modelBlockLookup>,
): Promise<AutoLayoutResult> {
  const { computeElkLayout } = await import('./elkLayout')
  // Grow subsystems whose ports are closer together than PORT_SPACING
  const grown = minimumHeightResizes(s.blocks)
  let blocks = withSizes(s.blocks, grown)
  let resizes: LayoutResize[] = grown
  if (options.resizeSubsystems) {
    // The classic fit selects the subsystem sizes (from the port positions
    // of its neighbours, capped by maxPortSpacing). ELK then lays out the
    // sheet with these sizes. The fit never goes below the natural height,
    // so it replaces the growth above where it resizes a block.
    // The classic engine starts its column order from the stored y
    // positions. The ELK layout must not depend on the stored positions
    // (else a second tune gives other sizes), so the fit gets the order of
    // the block list instead.
    const listOrder = blocks.map((b, i) => ({ ...b, position: { x: 0, y: i } }))
    const fitted = computeAutoLayout(listOrder, s.connections, {
      resizeBlocks: true,
      maxPortSpacing: options.maxPortSpacing,
      routeWires: false,
    }).resizes
    const byId = new Map<string, LayoutResize>(grown.map(r => [r.id, r]))
    for (const r of fitted) byId.set(r.id, r)
    resizes = [...byId.values()]
    blocks = withSizes(s.blocks, resizes)
  }
  const useRoles = options.useSubsystemFunctions !== false && options.elkOrder !== 'list'
  const roles = useRoles ? effectiveSheetRoles(blocks, s.connections, { lookup }) : undefined
  const layout = await computeElkLayout(blocks, s.connections, {
    routeWires: options.cleanUpLayout,
    elkOptions: options.elkOptions,
    order: options.elkOrder,
    roles,
    portNameClearance: options.portNameClearance,
    outputPorts: options.outputPorts,
    // The mirror needs the subsystem functions: without them there is no return path
    mirrorReturnPath: useRoles && options.mirrorReturnPath !== false,
  })
  return { ...layout, resizes }
}

/**
 * The blocks and wires of one sheet with its ELK layout applied (moves,
 * resizes, routes and flips), as the tune writes them. For the tidy of signal
 * labels, which scores a sheet after each trial edit.
 */
export async function laidOutSheetElk(
  s: { blocks: BlockData[]; connections: Sheet['connections'] },
  options: TuneLayoutOptions,
  lookup: ReturnType<typeof modelBlockLookup>,
): Promise<{ blocks: BlockData[]; connections: Sheet['connections'] }> {
  const { applyToSheet } = await import('./elkLayout')
  const layout = await layoutSheetElk(s, options, lookup)
  const [blocks, connections] = applyToSheet(withSizes(s.blocks, layout.resizes), s.connections, layout)
  return { blocks, connections }
}

/**
 * Minimum subsystem height (ELK clean-up): a subsystem whose stored height is
 * less than its natural height (`getIntrinsicBlockHeight`, a port pitch of at
 * least PORT_SPACING) grows to the natural height. Its width does not change.
 * This never makes a block smaller.
 */
export function minimumHeightResizes(blocks: BlockData[]): LayoutResize[] {
  const out: LayoutResize[] = []
  for (const b of blocks) {
    if (!isSubsystemBlock(b) || typeof b.parameters?.height !== 'number') continue
    const m = measure(b)
    if (m.height < m.minHeight) out.push({ id: b.id, width: m.width, height: m.minHeight })
  }
  return out
}

/** The blocks with the sizes of `resizes` written to their parameters. */
function withSizes(blocks: BlockData[], resizes: AutoLayoutResult['resizes']): BlockData[] {
  if (resizes.length === 0) return blocks
  const byId = new Map(resizes.map(r => [r.id, r]))
  return blocks.map(b => {
    const r = byId.get(b.id)
    return r ? { ...b, parameters: { ...(b.parameters || {}), width: r.width, height: r.height } } : b
  })
}

/**
 * The classic engine only, synchronous. For callers that cannot wait, such as
 * the reference model builder (scripts/build-fpv-reference-model.ts). This
 * function ignores `options.engine`: it always uses the classic engine, so a
 * caller can give it DEFAULT_TUNE_OPTIONS (whose engine is `elk`).
 */
export function tuneModelLayoutSync(
  sheets: Sheet[],
  activeSheetId: string | null,
  options: TuneLayoutOptions,
): TuneLayoutResult {
  return tuneWith(sheets, activeSheetId, options, (sheet, blocks) => {
    // Layout is computed even when only resizing: the fitted sizes come from
    // where the blocks would sit once arranged.
    const needsLayout = options.cleanUpLayout || options.resizeSubsystems
    return needsLayout
      ? computeAutoLayout(blocks, sheet.connections || [], {
          resizeBlocks: options.resizeSubsystems,
          maxPortSpacing: options.maxPortSpacing,
          routeWires: options.cleanUpLayout,
        })
      : { moves: [], resizes: [], routes: [] }
  })
}

/**
 * One block with the display options of the tune: the port labels of a
 * subsystem (`subsystemPortLabels`) and the block name (`hideBlockNames`).
 * Returns the block itself when nothing changes. Counts the changes in
 * `summary`.
 */
function withDisplayOptions(block: BlockData, options: TuneLayoutOptions, summary: TuneLayoutSummary): BlockData {
  let next = block
  if (options.subsystemPortLabels !== 'asis' && block.type === 'subsystem') {
    // Unlike showName, showPortNames is opt-in on the canvas: absent means
    // hidden. Writing it explicitly makes the result independent of that.
    const wanted = options.subsystemPortLabels === 'show'
    if ((next.parameters?.showPortNames ?? false) !== wanted) {
      next = { ...next, parameters: { ...(next.parameters || {}), showPortNames: wanted } }
      summary.portLabelsChanged++
    }
  }
  if (options.hideBlockNames) {
    // "All but Subsystem blocks": subsystems keep their names, everything
    // else is hidden. Written explicitly so the result does not depend on
    // whether the block predates the showName setting.
    const wanted = block.type === 'subsystem'
    if (next.parameters?.showName !== wanted) {
      next = { ...next, parameters: { ...(next.parameters || {}), showName: wanted } }
      if (!wanted) summary.namesHidden++
    }
  }
  return next
}

function tuneWith(
  sheets: Sheet[],
  activeSheetId: string | null,
  options: TuneLayoutOptions,
  layoutOf: LayoutBySheet,
  /** Sheets that an earlier step changed (the tidy of signal labels): they count as affected. */
  changedBefore: ReadonlySet<string> = new Set(),
  /** When given, receives the ids of the affected sheets. */
  affected?: Set<string>,
): TuneLayoutResult {
  const summary: TuneLayoutSummary = {
    sheetsAffected: 0, blocksMoved: 0, wiresRouted: 0, blocksResized: 0, blocksFlipped: 0, namesHidden: 0,
    portLabelsChanged: 0, labelEdits: 0,
  }
  if (isNoOp(options)) return { sheets, summary }

  // Scope resolution is shared with PDF export, so "current subsystem" means
  // the same thing in both places -- including its fall back to the whole
  // model when the active sheet is top level.
  const inScope = new Set(
    buildExportPlan(sheets, options.scope, activeSheetId).sheets.map(s => s.id)
  )

  /** Apply the requested adjustments to one sheet's blocks and wires. */
  const tuneSheetContents = (sheet: Sheet, input: BlockData[]): { blocks: BlockData[]; connections: Sheet['connections'] } => {
    // The names and port labels first: the layout reserves space for the
    // names and port labels that the blocks show, so it must see the shown
    // ones. Else a second tune with the same options gives another layout.
    const blocks = input.map(block => withDisplayOptions(block, options, summary))
    const layout = layoutOf(sheet, blocks)

    // Wire routes only make sense for the arrangement they were computed for,
    // so they are written (or cleared) together with the block moves. A
    // route with waypoints replaces the routing; a route without a turn
    // offset or waypoints clears it, which also removes stale waypoints.
    const routeById = new Map(options.cleanUpLayout ? layout.routes.map(r => [r.id, r]) : [])
    const connections = (sheet.connections || []).map(wire => {
      const route = routeById.get(wire.id)
      if (!route) return wire
      if (route.waypoints && route.waypoints.length > 0) {
        if (sameRouting(wire, route)) return wire
        summary.wiresRouted++
        return { ...wire, routing: { waypoints: route.waypoints.map(p => ({ x: p.x, y: p.y })) } }
      }
      const offset = route.midpointOffset
      if (offset === undefined) {
        if (!wire.routing) return wire
        summary.wiresRouted++
        return { ...wire, routing: undefined }
      }
      if (sameRouting(wire, route)) return wire
      summary.wiresRouted++
      return { ...wire, routing: { midpointOffset: offset } }
    })

    const moveById = new Map(
      options.cleanUpLayout ? layout.moves.map(m => [m.id, m.position]) : []
    )
    // Resizes come from Resize Subsystems, and from the minimum height of
    // the ELK clean-up. The classic engine gives resizes only for the first.
    const resizeById = new Map(
      options.resizeSubsystems || options.cleanUpLayout ? layout.resizes.map(r => [r.id, r]) : []
    )
    // Flips come from the ELK clean-up with mirrorReturnPath only
    const flipById = new Map(options.cleanUpLayout ? (layout.flips ?? []).map(f => [f.id, f.flipped]) : [])

    const tunedBlocks = blocks.map(block => {
      let next = block

      const position = moveById.get(block.id)
      if (position && (position.x !== block.position?.x || position.y !== block.position?.y)) {
        next = { ...next, position }
        summary.blocksMoved++
      }

      const size = resizeById.get(block.id)
      if (size) {
        // Merge: replacing parameters here would drop a subsystem's sheets.
        next = { ...next, parameters: { ...(next.parameters || {}), width: size.width, height: size.height } }
        summary.blocksResized++
      }

      const flip = flipById.get(block.id)
      if (flip !== undefined && (next.parameters?.flipped === true) !== flip) {
        // Merge; an unflipped block has no `flipped` key
        const { flipped: _old, ...rest } = next.parameters || {}
        next = { ...next, parameters: flip ? { ...rest, flipped: true } : rest }
        summary.blocksFlipped++
      }

      return next
    })
    return { blocks: tunedBlocks, connections }
  }

  /**
   * Rewrite the tree, descending into every subsystem so in-scope sheets can
   * be reached even when they are nested. Untouched sheets are returned by
   * identity, which keeps downstream memoisation (notably signal-type
   * propagation, keyed on array identity) from being invalidated wholesale.
   */
  const transformSheet = (sheet: Sheet): Sheet => {
    let blocks = sheet.blocks || []
    let changed = false

    const recursed = blocks.map(block => {
      if (block.type !== 'subsystem' || !Array.isArray(block.parameters?.sheets)) return block
      const original: Sheet[] = block.parameters!.sheets
      const nested = original.map(transformSheet)
      if (nested.every((n, i) => n === original[i])) return block
      changed = true
      return { ...block, parameters: { ...block.parameters, sheets: nested } }
    })
    if (changed) blocks = recursed

    let connections = sheet.connections
    if (inScope.has(sheet.id)) {
      const tuned = tuneSheetContents(sheet, blocks)
      const blocksChanged = tuned.blocks.some((b, i) => b !== blocks[i])
      const wiresChanged = tuned.connections.some((w, i) => w !== (sheet.connections || [])[i])
      if (blocksChanged || wiresChanged) {
        blocks = tuned.blocks
        if (wiresChanged) connections = tuned.connections
        changed = true
      }
      if (blocksChanged || wiresChanged || changedBefore.has(sheet.id)) {
        summary.sheetsAffected++
        affected?.add(sheet.id)
      }
    }

    return changed ? { ...sheet, blocks, connections } : sheet
  }

  return { sheets: sheets.map(transformSheet), summary }
}

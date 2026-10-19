// Applies layout tuning across a scope of the model's sheet tree.
//
// The canvas' older "Reorganize Block Arrangement" actions only ever touched
// the sheet on screen. Tuning generalises that: each adjustment is independent,
// and the scope may reach sheets nested inside subsystems that are not
// currently mounted. That makes this a pure transform over the sheet tree
// rather than a series of store mutations.

import type { Sheet } from '@/lib/modelStore'
import type { BlockData } from '@/components/BlockNode'
import { computeAutoLayout } from './autoLayout'
import { buildExportPlan, type PrintScope } from '@/lib/export/sheetTree'

export type TuneScope = PrintScope

/** What to do with the port-name labels on subsystem blocks. */
export type PortLabelChoice = 'show' | 'hide' | 'asis'

export interface TuneLayoutOptions {
  /** Re-arrange blocks so data flows left to right. */
  cleanUpLayout: boolean
  /** Grow subsystems so their ports can line up with what they connect to. */
  resizeSubsystems: boolean
  /** Show or hide the port-name labels on subsystem blocks. */
  subsystemPortLabels: PortLabelChoice
  /** Hide block names everywhere except on subsystems. */
  hideBlockNames: boolean
  scope: TuneScope
}

export const DEFAULT_TUNE_OPTIONS: TuneLayoutOptions = {
  cleanUpLayout: true,
  resizeSubsystems: false,
  subsystemPortLabels: 'asis',
  hideBlockNames: false,
  scope: 'sheet',
}

export interface TuneLayoutSummary {
  sheetsAffected: number
  blocksMoved: number
  /** Wires whose turn position (routing) was set or cleared. */
  wiresRouted: number
  blocksResized: number
  namesHidden: number
  portLabelsChanged: number
}

export interface TuneLayoutResult {
  sheets: Sheet[]
  summary: TuneLayoutSummary
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

export function tuneModelLayout(
  sheets: Sheet[],
  activeSheetId: string | null,
  options: TuneLayoutOptions,
): TuneLayoutResult {
  const summary: TuneLayoutSummary = {
    sheetsAffected: 0, blocksMoved: 0, wiresRouted: 0, blocksResized: 0, namesHidden: 0,
    portLabelsChanged: 0,
  }
  if (isNoOp(options)) return { sheets, summary }

  // Scope resolution is shared with PDF export, so "current subsystem" means
  // the same thing in both places -- including its fall back to the whole
  // model when the active sheet is top level.
  const inScope = new Set(
    buildExportPlan(sheets, options.scope, activeSheetId).sheets.map(s => s.id)
  )

  /** Apply the requested adjustments to one sheet's blocks and wires. */
  const tuneSheetContents = (sheet: Sheet, blocks: BlockData[]): { blocks: BlockData[]; connections: Sheet['connections'] } => {
    // Layout is computed even when only resizing: the fitted sizes come from
    // where the blocks would sit once arranged.
    const needsLayout = options.cleanUpLayout || options.resizeSubsystems
    const layout = needsLayout
      ? computeAutoLayout(blocks, sheet.connections || [], {
          resizeBlocks: options.resizeSubsystems,
          routeWires: options.cleanUpLayout,
        })
      : { moves: [], resizes: [], routes: [] }

    // Wire turns only make sense for the arrangement they were computed for,
    // so they are written (or cleared) together with the block moves.
    const routeById = new Map(options.cleanUpLayout ? layout.routes.map(r => [r.id, r.midpointOffset]) : [])
    const connections = (sheet.connections || []).map(wire => {
      if (!routeById.has(wire.id)) return wire
      const offset = routeById.get(wire.id)
      const current = wire.routing?.midpointOffset
      if (offset === undefined) {
        if (!wire.routing) return wire
        summary.wiresRouted++
        return { ...wire, routing: undefined }
      }
      if (current === offset && !wire.routing?.waypoints) return wire
      summary.wiresRouted++
      return { ...wire, routing: { midpointOffset: offset } }
    })

    const moveById = new Map(
      options.cleanUpLayout ? layout.moves.map(m => [m.id, m.position]) : []
    )
    const resizeById = new Map(
      options.resizeSubsystems ? layout.resizes.map(r => [r.id, r]) : []
    )

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
        const current = next.parameters?.showName
        if (current !== wanted) {
          next = { ...next, parameters: { ...(next.parameters || {}), showName: wanted } }
          if (!wanted) summary.namesHidden++
        }
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
        summary.sheetsAffected++
      }
    }

    return changed ? { ...sheet, blocks, connections } : sheet
  }

  return { sheets: sheets.map(transformSheet), summary }
}

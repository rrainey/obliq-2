// Walks a model's sheet tree to build the page list for a PDF export.
//
// Sheets nested inside subsystem blocks are reached recursively, and each one
// carries the breadcrumb path the page footer prints. Subsystem metadata is
// collected alongside so the optional summary pages have something to show.

import type { BlockData } from '@/components/BlockNode'
import type { WireData } from '@/components/Wire'

export type PrintScope = 'model' | 'subsystem' | 'sheet'

export interface ExportSheet {
  id: string
  name: string
  /** Breadcrumb from the model root, e.g. ['Controller', 'Inner Loop', 'Main']. */
  path: string[]
  blocks: BlockData[]
  connections: WireData[]
  /** Subsystem block owning this sheet; absent for top-level sheets. */
  ownerSubsystemId?: string
}

export interface ExportSubsystem {
  id: string
  name: string
  path: string[]
  inputPorts: string[]
  outputPorts: string[]
  parameters: Array<{ name: string; dataType?: string; value?: string }>
  /** Names of the sheets this subsystem owns, in order. */
  sheetNames: string[]
  codeGenStrategy?: string
}

export interface ExportPlan {
  sheets: ExportSheet[]
  subsystems: ExportSubsystem[]
}

interface RawSheet {
  id?: string
  name?: string
  blocks?: BlockData[]
  connections?: WireData[]
}

/** Format a parameter value for display without exploding on nested arrays. */
function formatParamValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const inner = value.map(v => (Array.isArray(v) ? `[${v.join(', ')}]` : String(v)))
    return `[${inner.join(', ')}]`
  }
  return String(value)
}

/**
 * Flatten the whole sheet tree, recording each sheet's breadcrumb and every
 * subsystem encountered along the way.
 */
export function buildFullPlan(sheets: RawSheet[]): ExportPlan {
  const outSheets: ExportSheet[] = []
  const outSubsystems: ExportSubsystem[] = []

  const visitSheet = (sheet: RawSheet, prefix: string[], ownerSubsystemId?: string) => {
    const blocks = sheet.blocks || []
    const name = sheet.name || sheet.id || 'Sheet'
    const path = [...prefix, name]

    outSheets.push({
      id: sheet.id || name,
      name,
      path,
      blocks,
      connections: sheet.connections || [],
      ownerSubsystemId,
    })

    for (const block of blocks) {
      if (block.type !== 'subsystem') continue
      const nested: RawSheet[] = Array.isArray(block.parameters?.sheets)
        ? block.parameters!.sheets
        : []

      outSubsystems.push({
        id: block.id,
        name: block.name,
        // A subsystem is described by where its block sits, not by its sheets.
        path: [...path, block.name],
        inputPorts: block.parameters?.inputPorts || [],
        outputPorts: block.parameters?.outputPorts || [],
        parameters: (block.parameters?.parameters || []).map((p: any) => ({
          name: p?.name ?? '',
          dataType: p?.dataType ?? p?.signalType,
          value: formatParamValue(p?.defaultValue ?? p?.value),
        })),
        sheetNames: nested.map(s => s.name || s.id || 'Sheet'),
        codeGenStrategy: block.parameters?.codeGenStrategy,
      })

      for (const nestedSheet of nested) {
        visitSheet(nestedSheet, [...path, block.name], block.id)
      }
    }
  }

  for (const sheet of sheets) visitSheet(sheet, [])
  return { sheets: outSheets, subsystems: outSubsystems }
}

/**
 * Narrow a full plan to the requested scope.
 *
 * - `model`: everything.
 * - `sheet`: only the active sheet.
 * - `subsystem`: the sheets belonging to the subsystem that immediately owns
 *   the active sheet. When the active sheet is top level (not inside any
 *   subsystem) this falls back to the whole model.
 */
export function applyScope(
  plan: ExportPlan,
  scope: PrintScope,
  activeSheetId: string | null,
): ExportPlan {
  if (scope === 'model' || !activeSheetId) return plan

  const active = plan.sheets.find(s => s.id === activeSheetId)
  if (!active) return plan

  if (scope === 'sheet') {
    return {
      sheets: [active],
      subsystems: plan.subsystems.filter(s => s.id === active.ownerSubsystemId),
    }
  }

  // scope === 'subsystem'
  const ownerId = active.ownerSubsystemId
  if (!ownerId) return plan // top-level sheet: whole model

  return {
    sheets: plan.sheets.filter(s => s.ownerSubsystemId === ownerId),
    subsystems: plan.subsystems.filter(s => s.id === ownerId),
  }
}

export function buildExportPlan(
  sheets: RawSheet[],
  scope: PrintScope,
  activeSheetId: string | null,
): ExportPlan {
  return applyScope(buildFullPlan(sheets), scope, activeSheetId)
}

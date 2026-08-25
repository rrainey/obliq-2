/**
 * Deep ID/name remapping for clipboard paste.
 *
 * Top-level paste already minted new root block IDs, but nested subsystem
 * sheets kept original ids — pasting the same subsystem twice (or into a
 * model that already has those nested ids) produced React key collisions and
 * ambiguous flatten/codegen names. This module remaps every nested block,
 * wire, and sheet id, and uniquifies display names.
 */

import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import type { Sheet } from '@/lib/modelStore'

export interface RemapContext {
  /** All ids already used in the target model (and reserved by this paste). */
  usedIds: Set<string>
  /** Display names already used on the *current* sheet scope. */
  usedNames: Set<string>
  /** Monotonic counter so ids stay unique even within the same ms. */
  seq: { n: number }
}

/** Collect every block/wire/sheet id under a sheet tree. */
export function collectIdsFromSheets(sheets: Sheet[]): Set<string> {
  const ids = new Set<string>()
  const walkBlocks = (blocks: BlockData[]) => {
    for (const b of blocks) {
      ids.add(b.id)
      if (b.type === 'subsystem' && Array.isArray(b.parameters?.sheets)) {
        for (const sh of b.parameters.sheets as Sheet[]) {
          ids.add(sh.id)
          walkBlocks(sh.blocks || [])
          for (const w of sh.connections || []) ids.add(w.id)
        }
      }
    }
  }
  for (const sh of sheets) {
    ids.add(sh.id)
    walkBlocks(sh.blocks || [])
    for (const w of sh.connections || []) ids.add(w.id)
  }
  return ids
}

/** Collect block display names on a single sheet (not nested). */
export function collectNamesFromBlocks(blocks: BlockData[]): Set<string> {
  return new Set(blocks.map(b => b.name).filter(Boolean))
}

function mintId(prefix: string, ctx: RemapContext): string {
  let id: string
  do {
    ctx.seq.n += 1
    id = `${prefix}_${Date.now()}_${ctx.seq.n}_${Math.random().toString(36).slice(2, 9)}`
  } while (ctx.usedIds.has(id))
  ctx.usedIds.add(id)
  return id
}

/**
 * Unique display name: keep original if free, else `name_2`, `name_3`, …
 */
export function uniquifyName(originalName: string, usedNames: Set<string>): string {
  if (!usedNames.has(originalName)) {
    usedNames.add(originalName)
    return originalName
  }
  let i = 2
  let candidate = `${originalName}_${i}`
  while (usedNames.has(candidate)) {
    i += 1
    candidate = `${originalName}_${i}`
  }
  usedNames.add(candidate)
  return candidate
}

function remapWire(wire: WireData, idMap: Map<string, string>, ctx: RemapContext): WireData {
  const newId = mintId('wire', ctx)
  idMap.set(wire.id, newId)
  return {
    ...wire,
    id: newId,
    sourceBlockId: idMap.get(wire.sourceBlockId) || wire.sourceBlockId,
    targetBlockId: idMap.get(wire.targetBlockId) || wire.targetBlockId,
  }
}

function remapSheet(sheet: Sheet, parentIdMap: Map<string, string>, ctx: RemapContext): Sheet {
  const sheetIdMap = new Map<string, string>()
  // Nested sheets get their own name scope
  const nestedNameScope = new Set<string>()
  const newSheetId = mintId('sheet', ctx)
  sheetIdMap.set(sheet.id, newSheetId)

  // First pass: assign new block ids (needed before wires)
  const blockIdMap = new Map<string, string>(parentIdMap)
  for (const b of sheet.blocks || []) {
    const newId = mintId(b.type || 'block', ctx)
    blockIdMap.set(b.id, newId)
  }

  const newBlocks = (sheet.blocks || []).map(b =>
    remapBlockDeep(b, blockIdMap, ctx, nestedNameScope)
  )
  const newWires = (sheet.connections || []).map(w => remapWire(w, blockIdMap, ctx))

  return {
    ...sheet,
    id: newSheetId,
    blocks: newBlocks,
    connections: newWires,
  }
}

/**
 * Deep-clone a block, assigning a new id (from idMap if pre-seeded), uniquifying
 * its display name in `nameScope`, and recursively remapping nested subsystem sheets.
 */
export function remapBlockDeep(
  block: BlockData,
  idMap: Map<string, string>,
  ctx: RemapContext,
  nameScope: Set<string>
): BlockData {
  const newId = idMap.get(block.id) || mintId(block.type || 'block', ctx)
  idMap.set(block.id, newId)

  const cloned: BlockData = JSON.parse(JSON.stringify(block))
  cloned.id = newId
  cloned.name = uniquifyName(block.name, nameScope)

  if (cloned.type === 'subsystem' && Array.isArray(cloned.parameters?.sheets)) {
    cloned.parameters = {
      ...cloned.parameters,
      sheets: (cloned.parameters.sheets as Sheet[]).map(sh =>
        remapSheet(sh, new Map(), ctx)
      ),
    }
  }

  return cloned
}

export interface PasteRemapInput {
  blocks: BlockData[]
  wires: WireData[]
  /** Ids already present in the destination model (entire tree). */
  existingIds: Set<string>
  /** Display names on the destination sheet. */
  existingNames: Set<string>
  positionOffset: { x: number; y: number }
}

export interface PasteRemapResult {
  blocks: BlockData[]
  wires: WireData[]
  blockIdMap: Map<string, string>
}

/**
 * Remap a clipboard selection for paste into a target sheet/model.
 */
export function remapClipboardSelection(input: PasteRemapInput): PasteRemapResult {
  const ctx: RemapContext = {
    usedIds: new Set(input.existingIds),
    usedNames: new Set(input.existingNames),
    seq: { n: 0 },
  }

  const blockIdMap = new Map<string, string>()

  // Pre-mint top-level ids so wires can remap in one pass
  for (const b of input.blocks) {
    blockIdMap.set(b.id, mintId(b.type || 'block', ctx))
  }

  const newBlocks = input.blocks.map(b => {
    const remapped = remapBlockDeep(b, blockIdMap, ctx, ctx.usedNames)
    remapped.position = {
      x: b.position.x + input.positionOffset.x,
      y: b.position.y + input.positionOffset.y,
    }
    return remapped
  })

  const newWires = input.wires.map(w => remapWire(w, blockIdMap, ctx))

  return { blocks: newBlocks, wires: newWires, blockIdMap }
}

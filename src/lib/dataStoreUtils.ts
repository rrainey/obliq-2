// lib/dataStoreUtils.ts
// Helpers for model-scoped data stores used by flattener and codegen.

import { BlockData } from '@/components/BlockNode'
import { FlattenedBlock } from '@/lib/codegen/ModelFlattener'
import { BlockModuleUtils } from '@/lib/blocks/BlockModule'

export interface DataStoreDeclaration {
  /** Valid C identifier name */
  name: string
  /** C type string e.g. double, double[3] */
  dataType: string
  /** C99 initializer string e.g. "0", "{0,0,0}" */
  initialValue: string
}

/**
 * Collect data store declarations from explicit model list + read/write blocks.
 */
export function collectDataStores(
  blocks: FlattenedBlock[] | { block: BlockData }[],
  explicit: DataStoreDeclaration[] = []
): DataStoreDeclaration[] {
  const map = new Map<string, DataStoreDeclaration>()

  for (const d of explicit) {
    if (d.name && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(d.name)) {
      map.set(d.name, {
        name: d.name,
        dataType: d.dataType || 'double',
        initialValue: d.initialValue ?? '0'
      })
    }
  }

  for (const item of blocks) {
    const block = 'block' in item ? item.block : (item as any)
    if (block.type !== 'data_store_write' && block.type !== 'data_store_read') {
      continue
    }
    const storeName = block.parameters?.storeName
    if (!storeName || typeof storeName !== 'string') continue
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(storeName)) continue

    const existing = map.get(storeName)
    const dataType = block.parameters?.dataType || existing?.dataType || 'double'
    const initialValue =
      block.parameters?.initialValue !== undefined
        ? String(block.parameters.initialValue)
        : existing?.initialValue ?? '0'

    if (!existing) {
      map.set(storeName, { name: storeName, dataType, initialValue })
    } else {
      // Prefer non-default dataType from blocks if existing is still double
      if (block.parameters?.dataType && existing.dataType === 'double') {
        map.set(storeName, { ...existing, dataType: block.parameters.dataType })
      }
      if (block.parameters?.initialValue !== undefined && existing.initialValue === '0') {
        map.set(storeName, {
          ...map.get(storeName)!,
          initialValue: String(block.parameters.initialValue)
        })
      }
    }
  }

  return Array.from(map.values())
}

/**
 * Refine store data types from write-block input types after type propagation.
 */
export function refineDataStoreTypes(
  stores: DataStoreDeclaration[],
  blocks: FlattenedBlock[],
  connections: { targetBlockId: string; targetPortIndex: number; sourceBlockId: string }[],
  typeMap: Map<string, string>
): DataStoreDeclaration[] {
  return stores.map(store => {
    // Find a write block for this store with a typed input
    for (const fb of blocks) {
      if (fb.block.type !== 'data_store_write') continue
      if (fb.block.parameters?.storeName !== store.name) continue

      const conn = connections.find(
        c => c.targetBlockId === fb.originalId && c.targetPortIndex === 0
      )
      if (!conn) continue
      const srcType = typeMap.get(conn.sourceBlockId)
      if (srcType && srcType !== 'void') {
        return { ...store, dataType: srcType }
      }
    }
    return store
  })
}

export function isValidStoreName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)
}

/** Generate C member declaration for a store */
export function dataStoreMemberDecl(store: DataStoreDeclaration): string {
  const safe = BlockModuleUtils.sanitizeIdentifier(store.name)
  const parsed = BlockModuleUtils.parseType(store.dataType || 'double')
  if (parsed.isMatrix && parsed.rows && parsed.cols) {
    return `    ${parsed.baseType} ${safe}[${parsed.rows}][${parsed.cols}];`
  }
  if (parsed.isArray && parsed.arraySize) {
    return `    ${parsed.baseType} ${safe}[${parsed.arraySize}];`
  }
  return `    ${parsed.baseType} ${safe};`
}

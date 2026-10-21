// lib/referencedModels.ts
//
// The editor's copies of the models that model references point at. The
// model store loads them (loadReferencedModels) and publishes them here, so
// type propagation and validation can look inside a model reference the same
// way code generation does: through expandModelReferences, with a loader
// backed by these copies instead of the server's model store.

import {
  ModelLoader,
  ModelRef,
  ModelReferenceError,
  expandModelReferences,
  isModelReference,
  modelRefOf,
} from '@/lib/modelReferences'

export type ReferencedModelStatus = 'loading' | 'ok' | 'missing' | 'error'

export interface ReferencedModelEntry {
  key: string
  modelId: string
  /** null: the model's current saved file */
  version: number | null
  status: ReferencedModelStatus
  name?: string
  data?: { sheets: any[]; parameters?: any[]; dataStores?: any[] }
  hash?: string
  /** The model's latest saved version (for "newer version available") */
  latestVersion?: number
  error?: string
}

export const modelRefKey = (r: ModelRef) => `${r.modelId}@${r.version ?? 'latest'}`

let entries = new Map<string, ReferencedModelEntry>()
let revision = 0

/** Publishes the loaded models (called by the model store). */
export function publishReferencedModels(next: Record<string, ReferencedModelEntry>): void {
  entries = new Map(Object.entries(next))
  revision++
  expandedCache.clear()
  innerBlocks.clear()
}

export function referencedModel(ref: ModelRef): ReferencedModelEntry | undefined {
  return entries.get(modelRefKey(ref))
}

/** A loader over the published copies; throws for models not (yet) loaded. */
export function publishedModelLoader(): ModelLoader {
  return ref => {
    const e = entries.get(modelRefKey(ref))
    if (!e || e.status !== 'ok' || !e.data) {
      throw new ModelReferenceError(
        e?.status === 'missing' ? 'the referenced model does not exist' : e?.error || 'the referenced model is not loaded'
      )
    }
    return { id: e.modelId, name: e.name || e.modelId, version: e.version, hash: e.hash || '', data: e.data }
  }
}

/** Every model reference in these sheets (any depth; not inside referenced models). */
export function collectModelRefs(sheets: any[]): ModelRef[] {
  const out = new Map<string, ModelRef>()
  const walk = (list: any[]) => {
    for (const sheet of list || []) {
      for (const b of sheet.blocks || []) {
        const ref = modelRefOf(b)
        if (ref) out.set(modelRefKey(ref), ref)
        if (Array.isArray(b.parameters?.sheets)) walk(b.parameters.sheets)
      }
    }
  }
  walk(sheets)
  return [...out.values()]
}

// ---------------------------------------------------------------------------
// Expanded sheets for type propagation

const expandedCache = new Map<string, any[]>()
/** Blocks inside expanded references (ids prefixed), for subsystem references within them */
const innerBlocks = new Map<string, any>()

/**
 * The sheets a model reference stands for, as code generation expands them
 * (ids prefixed with the block id). Empty when the model is not loaded or
 * cannot be expanded.
 */
export function expandedReferenceSheets(block: any): any[] {
  const ref = isModelReference(block) ? modelRefOf(block) : null
  if (!ref) return []
  const key = `${block.id}|${modelRefKey(ref)}|${revision}`
  const hit = expandedCache.get(key)
  if (hit) return hit
  let sheets: any[] = []
  try {
    const { data } = expandModelReferences(
      { sheets: [{ id: '_', blocks: [block], connections: [] }] },
      publishedModelLoader()
    )
    sheets = data.sheets![0].blocks[0].parameters.sheets || []
  } catch {
    sheets = []
  }
  expandedCache.set(key, sheets)
  const collect = (list: any[]) => {
    for (const s of list) {
      for (const b of s.blocks || []) {
        innerBlocks.set(b.id, b)
        if (Array.isArray(b.parameters?.sheets)) collect(b.parameters.sheets)
      }
    }
  }
  collect(sheets)
  return sheets
}

/** Blocks inside the model references expanded so far. */
export function expandedInnerBlocks(): any[] {
  return [...innerBlocks.values()]
}

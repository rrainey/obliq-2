// lib/testing/resolveTestTargets.ts
//
// Turns `obliq:test` arguments into models to run: a path to a model JSON
// file, a stored model's id, or a stored model's name. `--all` selects every
// stored model that contains an Assert block. Server-side only (reads the
// local model store).

import * as fs from 'fs'
import * as path from 'path'
import { openStorage, type Storage } from '@/lib/server/storage'
import { createStoragePaths, resolveObliqHome } from '@/lib/server/storage/paths'
import { parseModelDocument } from '@/lib/server/storage/ModelRepository'
import { storageModelLoader } from '@/lib/server/modelReferenceLoader'
import { ModelLoader, ModelReferenceError, expandModelReferences, hasModelReferences } from '@/lib/modelReferences'
import { ModelTestTarget, modelHasAsserts } from './modelTestRunner'

export interface ResolveResult {
  targets: ModelTestTarget[]
  /** Arguments that could not be resolved, with the reason */
  errors: { arg: string; message: string }[]
}

export interface ResolveOptions {
  all?: boolean
  /** Model store folder (default: OBLIQ_HOME or ~/.config/obliq-2) */
  home?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function resolveTestTargets(args: string[], opts: ResolveOptions = {}): ResolveResult {
  const result: ResolveResult = { targets: [], errors: [] }
  const home = opts.home ?? resolveObliqHome()
  let storage: Storage | null = null
  // Opened only when needed, and never created: a missing store is an error
  const store = (): Storage => {
    if (storage) return storage
    if (!fs.existsSync(createStoragePaths(home).db)) {
      throw new Error(`No model store at ${home} (set OBLIQ_HOME, or pass a model file path)`)
    }
    storage = openStorage(home, { referenceModelsDir: null })
    return storage
  }

  // Model references are expanded before the model is built: from the model
  // files beside a model file (by name), then from the store
  const storeExists = fs.existsSync(createStoragePaths(home).db)
  const expand = (t: ModelTestTarget): ModelTestTarget => {
    if (!hasModelReferences(t.data.sheets)) return t
    const loaders: ModelLoader[] = []
    if (t.file) loaders.push(siblingFileLoader(path.dirname(t.file)))
    if (storeExists || !t.file) loaders.push(storageModelLoader(store()))
    const load: ModelLoader = ref => {
      let last: Error | null = null
      for (const l of loaders) {
        try {
          return l(ref)
        } catch (e) {
          last = e as Error
        }
      }
      throw last ?? new ModelReferenceError(`the referenced model (${ref.modelId}) does not exist`)
    }
    return { ...t, data: expandModelReferences(t.data as any, load, { rootName: t.name }).data }
  }

  try {
    for (const arg of args) {
      try {
        if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
          const doc = parseModelDocument(fs.readFileSync(arg, 'utf8'), arg)
          result.targets.push(expand({
            name: doc.name || path.basename(arg).replace(/\.json$/i, '').replace(/\.obliq$/i, ''),
            file: arg,
            data: doc.data as any,
          }))
          continue
        }
        const s = store()
        const all = s.models.list()
        let matches = UUID.test(arg) ? all.filter(m => m.id === arg) : []
        if (matches.length === 0) matches = all.filter(m => m.name === arg)
        if (matches.length === 0) matches = all.filter(m => m.name.toLowerCase() === arg.toLowerCase())
        if (matches.length === 0) {
          result.errors.push({ arg, message: 'no model file, model id or model name matches' })
          continue
        }
        if (matches.length > 1) {
          result.errors.push({
            arg,
            message: `${matches.length} models have this name; use an id: ${matches.map(m => m.id).join(', ')}`,
          })
          continue
        }
        const current = s.models.readCurrent(matches[0]!.id)
        result.targets.push(expand({ name: current.record.name, id: current.record.id, data: current.data as any }))
      } catch (e) {
        result.errors.push({ arg, message: (e as Error).message })
      }
    }

    if (opts.all) {
      try {
        const s = store()
        const chosen = new Set(result.targets.map(t => t.id).filter(Boolean))
        for (const m of s.models.list()) {
          if (chosen.has(m.id)) continue
          try {
            const current = s.models.readCurrent(m.id)
            if (modelHasAsserts((current.data as any).sheets)) {
              result.targets.push(expand({ name: current.record.name, id: current.record.id, data: current.data as any }))
            }
          } catch (e) {
            result.errors.push({ arg: `${m.name} (${m.id})`, message: (e as Error).message })
          }
        }
      } catch (e) {
        result.errors.push({ arg: '--all', message: (e as Error).message })
      }
    }
  } finally {
    ;(storage as Storage | null)?.db.close()
  }
  return result
}

/**
 * Resolves references against the model files in a folder, by the
 * reference's recorded model name (files carry no store id). Pinned versions
 * are not available from files.
 */
function siblingFileLoader(dir: string): ModelLoader {
  let byName: Map<string, { name: string; data: any; file: string }> | null = null
  return ref => {
    if (!byName) {
      byName = new Map()
      for (const f of fs.readdirSync(dir).filter(n => n.toLowerCase().endsWith('.json'))) {
        try {
          const file = path.join(dir, f)
          const doc = parseModelDocument(fs.readFileSync(file, 'utf8'), file)
          if (doc.name && !byName.has(doc.name)) byName.set(doc.name, { name: doc.name, data: doc.data, file })
        } catch {
          // not a model file
        }
      }
    }
    const m = ref.name ? byName.get(ref.name) : undefined
    if (!m) throw new ModelReferenceError(`no model file named "${ref.name ?? ref.modelId}" in ${dir}`)
    if (ref.version !== null) {
      throw new ModelReferenceError(`model file "${m.name}" has no saved versions (the reference pins v${ref.version})`)
    }
    return { id: ref.modelId, name: m.name, version: null, hash: m.file, data: m.data }
  }
}

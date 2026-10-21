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

  try {
    for (const arg of args) {
      try {
        if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
          const doc = parseModelDocument(fs.readFileSync(arg, 'utf8'), arg)
          result.targets.push({
            name: doc.name || path.basename(arg).replace(/\.json$/i, '').replace(/\.obliq$/i, ''),
            file: arg,
            data: doc.data as any,
          })
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
        result.targets.push({ name: current.record.name, id: current.record.id, data: current.data as any })
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
              result.targets.push({ name: current.record.name, id: current.record.id, data: current.data as any })
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

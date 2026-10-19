/**
 * Reference models shipped in the repo's `reference-models/` folder are
 * imported once into a newly created store, so a new user starts with
 * working examples. Existing stores are never modified; their users can
 * import the same files with My Models → Import.
 *
 * The meta key `reference_models` records the outcome: 'pending' from store
 * creation until seeding finishes (so an interrupted first open retries),
 * then a JSON record of what was imported. Deleting a seeded model never
 * brings it back.
 *
 * OBLIQ_REFERENCE_MODELS_DIR overrides the folder; an empty value disables
 * seeding (the Jest setup does this).
 */

import * as fs from 'fs'
import * as path from 'path'
import { getMeta, setMeta, type Db } from './db'
import type { ModelRepository } from './ModelRepository'
import { parseModelImport } from '@/lib/modelImport'

export const REFERENCE_MODELS_META_KEY = 'reference_models'

export interface SeededReferenceModel {
  file: string
  id: string
  name: string
}

export interface ReferenceModelsRecord {
  seededAt: string
  dir: string | null
  models: SeededReferenceModel[]
  errors: string[]
}

/** The folder to seed from, or null when seeding is disabled. */
export function resolveReferenceModelsDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const override = env.OBLIQ_REFERENCE_MODELS_DIR
  if (override !== undefined) return override.trim() === '' ? null : path.resolve(override)
  return path.join(process.cwd(), 'reference-models')
}

/** Mark a just-created store as due for seeding. */
export function markReferenceModelsPending(db: Db): void {
  setMeta(db, REFERENCE_MODELS_META_KEY, 'pending')
}

export function readReferenceModelsRecord(db: Db): ReferenceModelsRecord | 'pending' | null {
  const value = getMeta(db, REFERENCE_MODELS_META_KEY)
  if (value === null || value === 'pending') return value
  try {
    return JSON.parse(value) as ReferenceModelsRecord
  } catch {
    return null
  }
}

/**
 * Import every `*.json` model in `dir` (sorted by file name) if this store is
 * pending seeding. Returns the record written, or null if nothing was due.
 * A file that fails to parse is skipped and noted; it does not stop the rest.
 */
export function seedReferenceModelsIfPending(
  db: Db,
  models: ModelRepository,
  dir: string | null = resolveReferenceModelsDir()
): ReferenceModelsRecord | null {
  if (getMeta(db, REFERENCE_MODELS_META_KEY) !== 'pending') return null

  const record: ReferenceModelsRecord = { seededAt: new Date().toISOString(), dir, models: [], errors: [] }
  const files = dir && fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.json')).sort()
    : []

  for (const file of files) {
    try {
      const payload = parseModelImport(fs.readFileSync(path.join(dir!, file), 'utf8'), { fileName: file })
      const created = models.create({ name: payload.name, data: payload.data, note: 'reference model' })
      record.models.push({ file, id: created.id, name: created.name })
    } catch (err) {
      const message = `${file}: ${err instanceof Error ? err.message : String(err)}`
      record.errors.push(message)
      console.warn(`[obliq] Skipped reference model ${message}`)
    }
  }

  setMeta(db, REFERENCE_MODELS_META_KEY, JSON.stringify(record))
  return record
}

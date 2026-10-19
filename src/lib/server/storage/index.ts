/**
 * Server-side storage entry point. Never import from client components:
 * this module touches the filesystem and a native SQLite binding.
 */

import * as fs from 'fs'
import { openDatabase, type Db } from './db'
import { createStoragePaths, resolveObliqHome, type StoragePaths } from './paths'
import { ModelRepository } from './ModelRepository'
import { TokenRepository } from './TokenRepository'
import { markReferenceModelsPending, seedReferenceModelsIfPending } from './referenceModels'

export interface Storage {
  paths: StoragePaths
  db: Db
  models: ModelRepository
  tokens: TokenRepository
}

export interface OpenStorageOptions {
  /** Folder of reference models to import into a new store; null disables. Default: resolveReferenceModelsDir(). */
  referenceModelsDir?: string | null
}

export function openStorage(home: string = resolveObliqHome(), opts: OpenStorageOptions = {}): Storage {
  const paths = createStoragePaths(home)
  const isNewStore = !fs.existsSync(paths.db)
  const db = openDatabase(paths.db)
  const models = new ModelRepository(db, paths)
  if (isNewStore) markReferenceModelsPending(db)
  seedReferenceModelsIfPending(db, models, opts.referenceModelsDir)
  return { paths, db, models, tokens: new TokenRepository(db) }
}

// Cache on globalThis so Next.js dev hot-reloads reuse one connection.
const globalForStorage = globalThis as unknown as { __obliqStorage?: Storage }

export function getStorage(): Storage {
  if (!globalForStorage.__obliqStorage) {
    globalForStorage.__obliqStorage = openStorage()
  }
  return globalForStorage.__obliqStorage
}

/** Test helper: close and forget the process-wide storage instance. */
export function resetStorage(): void {
  globalForStorage.__obliqStorage?.db.close()
  globalForStorage.__obliqStorage = undefined
}

export * from './ModelRepository'
export * from './TokenRepository'
export { resolveObliqHome, createStoragePaths } from './paths'
export { resolveReferenceModelsDir, readReferenceModelsRecord } from './referenceModels'
export type { ReferenceModelsRecord, SeededReferenceModel } from './referenceModels'
export type { StoragePaths } from './paths'

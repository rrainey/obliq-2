/**
 * Server-side storage entry point. Never import from client components:
 * this module touches the filesystem and a native SQLite binding.
 */

import { openDatabase, type Db } from './db'
import { createStoragePaths, resolveObliqHome, type StoragePaths } from './paths'
import { ModelRepository } from './ModelRepository'
import { TokenRepository } from './TokenRepository'

export interface Storage {
  paths: StoragePaths
  db: Db
  models: ModelRepository
  tokens: TokenRepository
}

export function openStorage(home: string = resolveObliqHome()): Storage {
  const paths = createStoragePaths(home)
  const db = openDatabase(paths.db)
  return { paths, db, models: new ModelRepository(db, paths), tokens: new TokenRepository(db) }
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
export type { StoragePaths } from './paths'

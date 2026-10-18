/**
 * Watches model files on disk and notifies subscribers when a file's content
 * diverges from what the app last read or wrote (or the file disappears).
 *
 * The parent directory is watched rather than the file itself: atomic writes
 * (temp file + rename) replace the inode, which would silently end a
 * file-level watch. Our own writes also produce events, but they update the
 * recorded hash first, so checkFileStatus() reports 'ok' and nothing is sent.
 */

import * as fs from 'fs'
import * as path from 'path'
import { getStorage } from './storage'
import type { FileStatus } from './storage'

export type ModelFileEvent = FileStatus & { modelId: string }
type Listener = (event: ModelFileEvent) => void

const DEBOUNCE_MS = 250

interface DirWatch {
  watcher: fs.FSWatcher
  /** basename → model ids watching that file */
  files: Map<string, Set<string>>
}

class ModelWatcher {
  private listeners = new Map<string, Set<Listener>>()
  private dirs = new Map<string, DirWatch>()
  private watchedPath = new Map<string, string>()
  private timers = new Map<string, NodeJS.Timeout>()
  private lastSent = new Map<string, string>()

  subscribe(modelId: string, listener: Listener): () => void {
    let set = this.listeners.get(modelId)
    if (!set) {
      set = new Set()
      this.listeners.set(modelId, set)
      this.watchModel(modelId)
    }
    set.add(listener)
    return () => {
      set!.delete(listener)
      if (set!.size === 0) {
        this.listeners.delete(modelId)
        this.unwatchModel(modelId)
      }
    }
  }

  /** Re-evaluate a model now (e.g. after the file path changed). */
  check(modelId: string): void {
    this.schedule(modelId, 0)
  }

  private watchModel(modelId: string) {
    const storage = getStorage()
    const record = storage.models.get(modelId)
    if (!record) return
    const filePath = storage.models.modelFilePath(record)
    const dir = path.dirname(filePath)
    const base = path.basename(filePath)

    let entry = this.dirs.get(dir)
    if (!entry) {
      let watcher: fs.FSWatcher
      try {
        watcher = fs.watch(dir, { persistent: false }, (_event, filename) => this.onDirEvent(dir, filename?.toString()))
      } catch (err) {
        console.warn(`[modelWatcher] cannot watch ${dir}:`, (err as Error).message)
        return
      }
      watcher.on('error', err => console.warn(`[modelWatcher] watch error on ${dir}:`, err.message))
      entry = { watcher, files: new Map() }
      this.dirs.set(dir, entry)
    }
    let ids = entry.files.get(base)
    if (!ids) {
      ids = new Set()
      entry.files.set(base, ids)
    }
    ids.add(modelId)
    this.watchedPath.set(modelId, filePath)
  }

  private unwatchModel(modelId: string) {
    const filePath = this.watchedPath.get(modelId)
    this.watchedPath.delete(modelId)
    this.lastSent.delete(modelId)
    clearTimeout(this.timers.get(modelId))
    this.timers.delete(modelId)
    if (!filePath) return
    const dir = path.dirname(filePath)
    const entry = this.dirs.get(dir)
    if (!entry) return
    const ids = entry.files.get(path.basename(filePath))
    ids?.delete(modelId)
    if (ids && ids.size === 0) entry.files.delete(path.basename(filePath))
    if (entry.files.size === 0) {
      entry.watcher.close()
      this.dirs.delete(dir)
    }
  }

  private onDirEvent(dir: string, filename: string | undefined) {
    const entry = this.dirs.get(dir)
    if (!entry) return
    // Some platforms omit the filename; then every file in the directory is a candidate.
    const candidates = filename ? [entry.files.get(filename)] : [...entry.files.values()]
    for (const ids of candidates) ids?.forEach(id => this.schedule(id, DEBOUNCE_MS))
  }

  private schedule(modelId: string, delay: number) {
    clearTimeout(this.timers.get(modelId))
    this.timers.set(modelId, setTimeout(() => this.evaluate(modelId), delay))
  }

  private evaluate(modelId: string) {
    this.timers.delete(modelId)
    let status: FileStatus
    try {
      status = getStorage().models.checkFileStatus(modelId)
    } catch {
      return // model deleted
    }
    const key = status.status === 'missing' ? 'missing' : `${status.status}:${status.hash}`
    if (this.lastSent.get(modelId) === key) return
    this.lastSent.set(modelId, key)
    this.listeners.get(modelId)?.forEach(listener => listener({ ...status, modelId }))
  }
}

const globalForWatcher = globalThis as unknown as { __obliqModelWatcher?: ModelWatcher }

export function getModelWatcher(): ModelWatcher {
  if (!globalForWatcher.__obliqModelWatcher) globalForWatcher.__obliqModelWatcher = new ModelWatcher()
  return globalForWatcher.__obliqModelWatcher
}

/**
 * Model persistence: SQLite holds the index (name, location, hashes, version
 * list); the model JSON itself lives in flat files.
 *
 * - Managed models:  <home>/models/<id>/model.json
 * - Linked models:   an arbitrary external path recorded in models.file_path
 * - Both:            <home>/models/<id>/versions/vNNNN.json, autosave.json
 *
 * model.json is always the current state. Snapshots are only taken on an
 * explicit save (or checkpoint). When the file on disk no longer matches the
 * hash we last wrote/read, the external content is first recorded as a
 * version with note 'external' so nothing is silently lost.
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import type { Db } from './db'
import type { StoragePaths } from './paths'
import { readFileSnapshot, serializeJson, sha256, writeFileAtomic } from './fileIO'

export type StorageKind = 'managed' | 'linked'
export type FileFormat = 'wrapper' | 'bare'

export interface ModelRecord {
  id: string
  name: string
  storage_kind: StorageKind
  file_path: string | null
  file_format: FileFormat
  file_hash: string | null
  file_mtime_ms: number | null
  latest_version: number
  autosave_at: string | null
  created_at: string
  updated_at: string
}

export interface VersionRecord {
  model_id: string
  version: number
  content_hash: string
  size_bytes: number
  note: string | null
  created_at: string
}

/** ModelData (sheets, parameters, globalSettings, ...). Kept loose on purpose. */
export type ModelData = Record<string, any>

export interface CurrentModel {
  record: ModelRecord
  data: ModelData
  hash: string
  /** True if this read detected (and recorded) a change made outside the app. */
  externalChange: boolean
}

export type FileStatus =
  | { status: 'ok'; hash: string; mtimeMs: number }
  | { status: 'changed'; hash: string; mtimeMs: number }
  | { status: 'missing' }

export interface WriteOptions {
  /** Hash of the file the caller based its edits on; mismatch → ModelConflictError. */
  baseHash?: string
}

export interface SaveResult {
  record: ModelRecord
  version: number | null
  hash: string
}

/**
 * Storage errors are matched by name rather than prototype identity. In Next.js
 * dev each route is a separate bundle with its own copy of these classes, while
 * the storage singleton (cached on globalThis) may come from another bundle, so
 * a plain prototype-based `instanceof` would miss errors thrown by it.
 */
export function matchesErrorName(value: unknown, name: string): boolean {
  return value instanceof Error && value.name === name
}

export class ModelNotFoundError extends Error {
  static [Symbol.hasInstance](value: unknown) {
    return matchesErrorName(value, 'ModelNotFoundError')
  }

  constructor(public readonly modelId: string) {
    super(`Model not found: ${modelId}`)
    this.name = 'ModelNotFoundError'
  }
}

export class ModelFileMissingError extends Error {
  static [Symbol.hasInstance](value: unknown) {
    return matchesErrorName(value, 'ModelFileMissingError')
  }

  constructor(public readonly modelId: string, public readonly filePath: string) {
    super(`Model file is missing: ${filePath}`)
    this.name = 'ModelFileMissingError'
  }
}

export class ModelConflictError extends Error {
  static [Symbol.hasInstance](value: unknown) {
    return matchesErrorName(value, 'ModelConflictError')
  }

  constructor(public readonly modelId: string, public readonly currentHash: string) {
    super(`Model ${modelId} was modified on disk since it was loaded`)
    this.name = 'ModelConflictError'
  }
}

export class InvalidModelFileError extends Error {
  static [Symbol.hasInstance](value: unknown) {
    return matchesErrorName(value, 'InvalidModelFileError')
  }

  constructor(message: string) {
    super(message)
    this.name = 'InvalidModelFileError'
  }
}

export interface ParsedModelDocument {
  name: string | null
  data: ModelData
  format: FileFormat
}

/**
 * Accepts either { name, data: ModelData } (wrapper) or a bare ModelData
 * object (has a `sheets` array), mirroring scripts/obliq-cgen.ts.
 */
export function parseModelDocument(content: string, source = 'model file'): ParsedModelDocument {
  let doc: any
  try {
    doc = JSON.parse(content)
  } catch (err) {
    throw new InvalidModelFileError(`${source} is not valid JSON: ${(err as Error).message}`)
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new InvalidModelFileError(`${source} must contain a JSON object`)
  }
  if (doc.data && typeof doc.data === 'object' && !Array.isArray(doc.sheets)) {
    return { name: typeof doc.name === 'string' ? doc.name : null, data: doc.data, format: 'wrapper' }
  }
  if (Array.isArray(doc.sheets)) {
    return { name: null, data: doc, format: 'bare' }
  }
  throw new InvalidModelFileError(`${source} is neither {name, data} nor ModelData with a sheets array`)
}

export function serializeModelDocument(format: FileFormat, name: string, data: ModelData): string {
  return serializeJson(format === 'wrapper' ? { name, data } : data)
}

const now = () => new Date().toISOString()

export class ModelRepository {
  constructor(private readonly db: Db, private readonly paths: StoragePaths) {}

  // ---------------------------------------------------------------------------
  // Index queries

  list(): ModelRecord[] {
    return this.db
      .prepare('SELECT * FROM models ORDER BY updated_at DESC')
      .all() as ModelRecord[]
  }

  get(id: string): ModelRecord | null {
    return (this.db.prepare('SELECT * FROM models WHERE id = ?').get(id) as ModelRecord) ?? null
  }

  require(id: string): ModelRecord {
    const record = this.get(id)
    if (!record) throw new ModelNotFoundError(id)
    return record
  }

  findByFilePath(filePath: string): ModelRecord | null {
    return (
      (this.db
        .prepare('SELECT * FROM models WHERE file_path = ?')
        .get(path.resolve(filePath)) as ModelRecord) ?? null
    )
  }

  modelFilePath(record: ModelRecord): string {
    return record.storage_kind === 'linked' && record.file_path
      ? record.file_path
      : this.paths.managedModelFile(record.id)
  }

  listVersions(id: string): VersionRecord[] {
    this.require(id)
    return this.db
      .prepare('SELECT * FROM model_versions WHERE model_id = ? ORDER BY version ASC')
      .all(id) as VersionRecord[]
  }

  // ---------------------------------------------------------------------------
  // Creation

  create(opts: { name: string; data: ModelData; id?: string; note?: string }): ModelRecord {
    const id = opts.id ?? crypto.randomUUID()
    const timestamp = now()
    const content = serializeModelDocument('wrapper', opts.name, opts.data)
    writeFileAtomic(this.paths.managedModelFile(id), content)
    const snap = readFileSnapshot(this.paths.managedModelFile(id))!

    this.db
      .prepare(
        `INSERT INTO models (id, name, storage_kind, file_path, file_format, file_hash, file_mtime_ms,
                             latest_version, created_at, updated_at)
         VALUES (?, ?, 'managed', NULL, 'wrapper', ?, ?, 0, ?, ?)`
      )
      .run(id, opts.name, snap.hash, snap.mtimeMs, timestamp, timestamp)

    this.recordVersion(id, opts.name, opts.data, opts.note ?? null)
    return this.require(id)
  }

  /** Register an existing external file as a linked model. */
  link(filePath: string, opts: { name?: string; id?: string } = {}): ModelRecord {
    const abs = path.resolve(filePath)
    const existing = this.findByFilePath(abs)
    if (existing) return existing

    const snap = readFileSnapshot(abs)
    if (!snap) throw new InvalidModelFileError(`File not found: ${abs}`)
    const parsed = parseModelDocument(snap.content, abs)
    const name = opts.name ?? parsed.name ?? path.basename(abs, path.extname(abs))
    const id = opts.id ?? crypto.randomUUID()
    const timestamp = now()

    fs.mkdirSync(this.paths.modelDir(id), { recursive: true })
    this.db
      .prepare(
        `INSERT INTO models (id, name, storage_kind, file_path, file_format, file_hash, file_mtime_ms,
                             latest_version, created_at, updated_at)
         VALUES (?, ?, 'linked', ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(id, name, abs, parsed.format, snap.hash, snap.mtimeMs, timestamp, timestamp)

    this.recordVersion(id, name, parsed.data, 'linked')
    return this.require(id)
  }

  /** Copy a linked model's current content into the managed tree and detach it. */
  unlink(id: string): ModelRecord {
    const current = this.readCurrent(id)
    if (current.record.storage_kind === 'managed') return current.record
    const content = serializeModelDocument('wrapper', current.record.name, current.data)
    writeFileAtomic(this.paths.managedModelFile(id), content)
    const snap = readFileSnapshot(this.paths.managedModelFile(id))!
    this.db
      .prepare(
        `UPDATE models SET storage_kind = 'managed', file_path = NULL, file_format = 'wrapper',
                           file_hash = ?, file_mtime_ms = ?, updated_at = ? WHERE id = ?`
      )
      .run(snap.hash, snap.mtimeMs, now(), id)
    return this.require(id)
  }

  duplicate(id: string, newName: string, opts: { version?: number } = {}): ModelRecord {
    const data = opts.version != null ? this.getVersion(id, opts.version) : this.readCurrent(id).data
    return this.create({ name: newName, data })
  }

  // ---------------------------------------------------------------------------
  // Reading

  /** Compare the model file on disk with the hash recorded in the DB. No side effects. */
  checkFileStatus(id: string): FileStatus {
    const record = this.require(id)
    const snap = readFileSnapshot(this.modelFilePath(record))
    if (!snap) return { status: 'missing' }
    return {
      status: snap.hash === record.file_hash ? 'ok' : 'changed',
      hash: snap.hash,
      mtimeMs: snap.mtimeMs,
    }
  }

  /**
   * Read the current model file. If it changed outside the app since we last
   * saw it, the new content is recorded as an 'external' version first.
   */
  readCurrent(id: string): CurrentModel {
    const record = this.require(id)
    const filePath = this.modelFilePath(record)
    const snap = readFileSnapshot(filePath)
    if (!snap) throw new ModelFileMissingError(id, filePath)
    const parsed = parseModelDocument(snap.content, filePath)

    if (snap.hash === record.file_hash) {
      return { record, data: parsed.data, hash: snap.hash, externalChange: false }
    }

    this.db
      .prepare('UPDATE models SET file_hash = ?, file_mtime_ms = ?, file_format = ?, updated_at = ? WHERE id = ?')
      .run(snap.hash, snap.mtimeMs, parsed.format, now(), id)
    // A NULL hash means we have never observed this file; nothing to record.
    if (record.file_hash !== null) {
      this.recordVersion(id, record.name, parsed.data, 'external')
    }
    return { record: this.require(id), data: parsed.data, hash: snap.hash, externalChange: record.file_hash !== null }
  }

  getVersion(id: string, version: number): ModelData {
    this.require(id)
    const row = this.db
      .prepare('SELECT 1 FROM model_versions WHERE model_id = ? AND version = ?')
      .get(id, version)
    if (!row) throw new ModelNotFoundError(`${id}@v${version}`)
    const file = this.paths.versionFile(id, version)
    const snap = readFileSnapshot(file)
    if (!snap) throw new ModelFileMissingError(id, file)
    return parseModelDocument(snap.content, file).data
  }

  // ---------------------------------------------------------------------------
  // Writing

  /** Explicit save: write model.json and record a new version snapshot. */
  saveSnapshot(id: string, data: ModelData, opts: WriteOptions & { note?: string } = {}): SaveResult {
    const record = this.writeCurrentFile(id, data, opts)
    const version = this.recordVersion(id, record.name, data, opts.note ?? null)
    this.deleteAutosave(id)
    return { record: this.require(id), version, hash: record.file_hash! }
  }

  /**
   * Mutation write (Model Builder API / MCP): update model.json in place,
   * without a version, unless `checkpoint` is set.
   */
  writeInPlace(id: string, data: ModelData, opts: WriteOptions & { checkpoint?: boolean; note?: string } = {}): SaveResult {
    if (opts.checkpoint) return this.saveSnapshot(id, data, opts)
    const record = this.writeCurrentFile(id, data, opts)
    return { record, version: null, hash: record.file_hash! }
  }

  rename(id: string, newName: string): ModelRecord {
    const record = this.require(id)
    this.db.prepare('UPDATE models SET name = ?, updated_at = ? WHERE id = ?').run(newName, now(), id)
    // Keep the managed wrapper's name in sync; never rewrite a linked file just for a rename.
    if (record.storage_kind === 'managed') {
      const current = this.readCurrent(id)
      this.writeCurrentFile(id, current.data, { baseHash: current.hash })
    }
    return this.require(id)
  }

  delete(id: string): void {
    this.require(id)
    this.db.prepare('DELETE FROM models WHERE id = ?').run(id)
    // Removes managed model.json, versions and autosave. A linked external file is left alone.
    fs.rmSync(this.paths.modelDir(id), { recursive: true, force: true })
  }

  // ---------------------------------------------------------------------------
  // Autosave

  getAutosave(id: string): { data: ModelData; savedAt: string } | null {
    this.require(id)
    const snap = readFileSnapshot(this.paths.autosaveFile(id))
    if (!snap) return null
    const doc = JSON.parse(snap.content)
    return { data: doc.data, savedAt: doc.savedAt }
  }

  putAutosave(id: string, data: ModelData): string {
    const record = this.require(id)
    const savedAt = now()
    writeFileAtomic(this.paths.autosaveFile(id), serializeJson({ name: record.name, savedAt, data }))
    this.db.prepare('UPDATE models SET autosave_at = ? WHERE id = ?').run(savedAt, id)
    return savedAt
  }

  deleteAutosave(id: string): void {
    this.require(id)
    fs.rmSync(this.paths.autosaveFile(id), { force: true })
    this.db.prepare('UPDATE models SET autosave_at = NULL WHERE id = ?').run(id)
  }

  // ---------------------------------------------------------------------------
  // Migration support (scripts/migrate-from-supabase.ts)

  /**
   * Import a model with explicit ids, timestamps and version numbers.
   * The highest version becomes model.json. Idempotent: an existing id is skipped.
   */
  importModel(opts: {
    id: string
    name: string
    createdAt: string
    updatedAt: string
    versions: Array<{ version: number; data: ModelData; createdAt: string }>
    autosave?: { data: ModelData; savedAt: string } | null
  }): ModelRecord | null {
    if (this.get(opts.id)) return null
    const versions = [...opts.versions].filter(v => v.version > 0).sort((a, b) => a.version - b.version)
    if (versions.length === 0) throw new Error(`Model ${opts.id} has no versions to import`)
    const latest = versions[versions.length - 1]

    writeFileAtomic(this.paths.managedModelFile(opts.id), serializeModelDocument('wrapper', opts.name, latest.data))
    const snap = readFileSnapshot(this.paths.managedModelFile(opts.id))!
    const versionRows = versions.map(v => {
      const content = serializeModelDocument('wrapper', opts.name, v.data)
      writeFileAtomic(this.paths.versionFile(opts.id, v.version), content)
      return { ...v, hash: sha256(content), size: Buffer.byteLength(content) }
    })
    if (opts.autosave) {
      writeFileAtomic(
        this.paths.autosaveFile(opts.id),
        serializeJson({ name: opts.name, savedAt: opts.autosave.savedAt, data: opts.autosave.data })
      )
    }

    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO models (id, name, storage_kind, file_path, file_format, file_hash, file_mtime_ms,
                               latest_version, autosave_at, created_at, updated_at)
           VALUES (?, ?, 'managed', NULL, 'wrapper', ?, ?, ?, ?, ?, ?)`
        )
        .run(opts.id, opts.name, snap.hash, snap.mtimeMs, latest.version,
             opts.autosave?.savedAt ?? null, opts.createdAt, opts.updatedAt)
      const insert = this.db.prepare(
        `INSERT INTO model_versions (model_id, version, content_hash, size_bytes, note, created_at)
         VALUES (?, ?, ?, ?, 'imported', ?)`
      )
      for (const v of versionRows) insert.run(opts.id, v.version, v.hash, v.size, v.createdAt)
    })()
    return this.require(opts.id)
  }

  // ---------------------------------------------------------------------------
  // Internals

  /**
   * Write the current model file after reconciling with disk: any unobserved
   * external change is recorded as a version first, then baseHash is checked.
   */
  private writeCurrentFile(id: string, data: ModelData, opts: WriteOptions): ModelRecord {
    let record = this.require(id)
    const filePath = this.modelFilePath(record)
    if (fs.existsSync(filePath)) {
      const current = this.readCurrent(id)
      record = current.record
      if (opts.baseHash && opts.baseHash !== current.hash) {
        throw new ModelConflictError(id, current.hash)
      }
    } else if (record.storage_kind === 'linked') {
      throw new ModelFileMissingError(id, filePath)
    }

    writeFileAtomic(filePath, serializeModelDocument(record.file_format, record.name, data))
    const snap = readFileSnapshot(filePath)!
    this.db
      .prepare('UPDATE models SET file_hash = ?, file_mtime_ms = ?, updated_at = ? WHERE id = ?')
      .run(snap.hash, snap.mtimeMs, now(), id)
    return this.require(id)
  }

  private recordVersion(id: string, name: string, data: ModelData, note: string | null): number {
    const content = serializeModelDocument('wrapper', name, data)
    return this.db.transaction(() => {
      const { next } = this.db
        .prepare('SELECT COALESCE(MAX(version), 0) + 1 AS next FROM model_versions WHERE model_id = ?')
        .get(id) as { next: number }
      writeFileAtomic(this.paths.versionFile(id, next), content)
      const timestamp = now()
      this.db
        .prepare(
          `INSERT INTO model_versions (model_id, version, content_hash, size_bytes, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(id, next, sha256(content), Buffer.byteLength(content), note, timestamp)
      this.db
        .prepare('UPDATE models SET latest_version = ?, updated_at = ? WHERE id = ?')
        .run(next, timestamp, id)
      return next
    })()
  }
}

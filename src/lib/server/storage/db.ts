/**
 * SQLite database (better-sqlite3) with forward-only migrations tracked via
 * PRAGMA user_version.
 */

import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'

export type Db = Database.Database

const MIGRATIONS: string[] = [
  // 1: initial schema
  `
  CREATE TABLE models (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    storage_kind    TEXT NOT NULL CHECK (storage_kind IN ('managed', 'linked')),
    file_path       TEXT,                      -- absolute path; NULL for managed models
    file_format     TEXT NOT NULL DEFAULT 'wrapper' CHECK (file_format IN ('wrapper', 'bare')),
    file_hash       TEXT,                      -- sha256 of model file as last read/written by the app
    file_mtime_ms   INTEGER,
    latest_version  INTEGER NOT NULL DEFAULT 0,
    autosave_at     TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_models_file_path ON models(file_path) WHERE file_path IS NOT NULL;

  CREATE TABLE model_versions (
    model_id      TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    version       INTEGER NOT NULL CHECK (version > 0),
    content_hash  TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    note          TEXT,
    created_at    TEXT NOT NULL,
    PRIMARY KEY (model_id, version)
  );

  CREATE TABLE api_tokens (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    token_hash    TEXT NOT NULL UNIQUE,
    created_at    TEXT NOT NULL,
    expires_at    TEXT,
    last_used_at  TEXT
  );

  CREATE TABLE wasm_cache (
    cache_key           TEXT PRIMARY KEY,
    model_id            TEXT NOT NULL,
    model_hash          TEXT NOT NULL,
    optimization_level  TEXT NOT NULL,
    compilation_time_ms INTEGER NOT NULL,
    wasm_size_bytes     INTEGER NOT NULL,
    js_size_bytes       INTEGER NOT NULL,
    block_count         INTEGER NOT NULL,
    created_at          TEXT NOT NULL,
    last_accessed_at    TEXT NOT NULL,
    access_count        INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_wasm_cache_lru ON wasm_cache(last_accessed_at);

  CREATE TABLE wasm_compilation_metrics (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id            TEXT NOT NULL,
    cache_hit           INTEGER NOT NULL,
    compilation_time_ms INTEGER,
    block_count         INTEGER NOT NULL,
    optimization_level  TEXT NOT NULL,
    error_message       TEXT,
    error_details       TEXT,
    created_at          TEXT NOT NULL
  );
  CREATE INDEX idx_wasm_compilation_metrics_created ON wasm_compilation_metrics(created_at);

  CREATE TABLE wasm_simulation_metrics (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id          TEXT NOT NULL,
    cache_key         TEXT NOT NULL,
    steps_executed    INTEGER NOT NULL,
    total_time_ms     REAL NOT NULL,
    avg_step_time_us  REAL NOT NULL,
    peak_memory_mb    REAL,
    browser_info      TEXT,
    created_at        TEXT NOT NULL
  );
  `,
  // 2: store-level key/value settings (e.g. reference-model seeding record)
  `
  CREATE TABLE meta (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
  );
  `,
]

export function openDatabase(dbPath: string): Db {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  migrate(db)
  return db
}

export function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number
  if (current > MIGRATIONS.length) {
    throw new Error(
      `Database schema version ${current} is newer than this build supports (${MIGRATIONS.length}).`
    )
  }
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v])
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}

export function getMeta(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setMeta(db: Db, key: string, value: string): void {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

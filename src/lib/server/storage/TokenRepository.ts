/**
 * API tokens for MCP / automation clients. Only SHA-256 hashes are stored;
 * generation and hashing live in src/lib/apiTokenService.ts.
 */

import * as crypto from 'crypto'
import type { Db } from './db'
import { matchesErrorName } from './ModelRepository'

export interface ApiTokenRecord {
  id: string
  name: string
  token_hash: string
  created_at: string
  expires_at: string | null
  last_used_at: string | null
}

export type ApiTokenSummary = Omit<ApiTokenRecord, 'token_hash'>

export class TokenNameConflictError extends Error {
  // Name-based so it matches across Next.js route bundles (see matchesErrorName).
  static [Symbol.hasInstance](value: unknown) {
    return matchesErrorName(value, 'TokenNameConflictError')
  }

  constructor(name: string) {
    super(`A token named "${name}" already exists`)
    this.name = 'TokenNameConflictError'
  }
}

export class TokenRepository {
  constructor(private readonly db: Db) {}

  list(): ApiTokenSummary[] {
    return this.db
      .prepare('SELECT id, name, created_at, expires_at, last_used_at FROM api_tokens ORDER BY created_at DESC')
      .all() as ApiTokenSummary[]
  }

  get(id: string): ApiTokenSummary | null {
    return (
      (this.db
        .prepare('SELECT id, name, created_at, expires_at, last_used_at FROM api_tokens WHERE id = ?')
        .get(id) as ApiTokenSummary) ?? null
    )
  }

  create(opts: { name: string; tokenHash: string; expiresAt: string | null }): ApiTokenSummary {
    const id = crypto.randomUUID()
    try {
      this.db
        .prepare('INSERT INTO api_tokens (id, name, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, opts.name, opts.tokenHash, new Date().toISOString(), opts.expiresAt)
    } catch (err) {
      if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE' && String(err).includes('api_tokens.name')) {
        throw new TokenNameConflictError(opts.name)
      }
      throw err
    }
    return this.get(id)!
  }

  findByHash(tokenHash: string): ApiTokenRecord | null {
    return (this.db.prepare('SELECT * FROM api_tokens WHERE token_hash = ?').get(tokenHash) as ApiTokenRecord) ?? null
  }

  touch(id: string): void {
    this.db.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), id)
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM api_tokens WHERE id = ?').run(id).changes > 0
  }

  deleteExpired(): number {
    return this.db
      .prepare('DELETE FROM api_tokens WHERE expires_at IS NOT NULL AND expires_at < ?')
      .run(new Date().toISOString()).changes
  }
}

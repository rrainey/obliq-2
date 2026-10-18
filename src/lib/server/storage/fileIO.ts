/**
 * Small filesystem helpers: atomic writes, hashing, and the canonical JSON
 * serialization used for model files (2-space indent + trailing newline, the
 * same shape scripts/build-saturnib-obliq-plant-json.ts emits).
 */

import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

export function sha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex')
}

export function serializeJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n'
}

/**
 * Write via a temp file in the same directory followed by rename, so readers
 * (and file watchers) never observe a partially written file.
 */
export function writeFileAtomic(filePath: string, content: string | Buffer): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`)
  try {
    fs.writeFileSync(tmp, content)
    fs.renameSync(tmp, filePath)
  } catch (err) {
    fs.rmSync(tmp, { force: true })
    throw err
  }
}

export interface FileSnapshot {
  content: string
  hash: string
  mtimeMs: number
  size: number
}

/** Read a text file with its hash and mtime, or null if it does not exist. */
export function readFileSnapshot(filePath: string): FileSnapshot | null {
  let content: string
  let stat: fs.Stats
  try {
    content = fs.readFileSync(filePath, 'utf8')
    stat = fs.statSync(filePath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  return { content, hash: sha256(content), mtimeMs: Math.floor(stat.mtimeMs), size: stat.size }
}

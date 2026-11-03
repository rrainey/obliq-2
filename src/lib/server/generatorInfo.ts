// lib/server/generatorInfo.ts

import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

/**
 * obliq-2's version, and the git commit it was built from when available.
 * `dirty` is true when anything that shapes the generated C (the generator
 * under src/ and scripts/, or the model when it is in the repo) differs from
 * that commit.
 */
export function generatorInfo(root: string, modelPath?: string): { name: string; version: string; commit: string | null; dirty: boolean | null } {
  let version = 'unknown'
  try {
    version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
  } catch {}
  try {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
    const commit = git('rev-parse', 'HEAD').trim()
    const model = modelPath ? path.relative(root, path.resolve(modelPath)) : '..'
    const paths = ['src', 'scripts', ...(model.startsWith('..') || path.isAbsolute(model) ? [] : [model])]
    const dirty = git('status', '--porcelain', '--untracked-files=no', '--', ...paths).trim().length > 0
    return { name: 'obliq-2', version, commit, dirty }
  } catch {
    return { name: 'obliq-2', version, commit: null, dirty: null }
  }
}

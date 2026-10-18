/**
 * Filesystem layout for per-user Obliq storage.
 *
 *   $OBLIQ_HOME (default: ${XDG_CONFIG_HOME:-~/.config}/obliq-2)
 *     obliq.db
 *     local-secret
 *     models/<id>/{model.json, autosave.json, versions/vNNNN.json}
 *     cache/wasm/<cacheKey>/{module.wasm, module.js}
 */

import * as os from 'os'
import * as path from 'path'

export interface StoragePaths {
  home: string
  db: string
  localSecret: string
  modelsDir: string
  wasmCacheDir: string
  modelDir(modelId: string): string
  managedModelFile(modelId: string): string
  autosaveFile(modelId: string): string
  versionsDir(modelId: string): string
  versionFile(modelId: string, version: number): string
  wasmCacheEntryDir(cacheKey: string): string
}

export function resolveObliqHome(env: NodeJS.ProcessEnv = process.env): string {
  if (env.OBLIQ_HOME) return path.resolve(env.OBLIQ_HOME)
  const configBase = env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(configBase, 'obliq-2')
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/

/** Guard against ids/keys that would escape their directory. */
function segment(value: string, what: string): string {
  if (!SAFE_SEGMENT.test(value) || value === '.' || value === '..') {
    throw new Error(`Invalid ${what}: ${JSON.stringify(value)}`)
  }
  return value
}

export function createStoragePaths(home: string = resolveObliqHome()): StoragePaths {
  const modelsDir = path.join(home, 'models')
  const wasmCacheDir = path.join(home, 'cache', 'wasm')
  const modelDir = (id: string) => path.join(modelsDir, segment(id, 'model id'))
  const versionsDir = (id: string) => path.join(modelDir(id), 'versions')

  return {
    home,
    db: path.join(home, 'obliq.db'),
    localSecret: path.join(home, 'local-secret'),
    modelsDir,
    wasmCacheDir,
    modelDir,
    managedModelFile: id => path.join(modelDir(id), 'model.json'),
    autosaveFile: id => path.join(modelDir(id), 'autosave.json'),
    versionsDir,
    versionFile: (id, version) =>
      path.join(versionsDir(id), `v${String(version).padStart(4, '0')}.json`),
    wasmCacheEntryDir: key => path.join(wasmCacheDir, segment(key, 'cache key')),
  }
}

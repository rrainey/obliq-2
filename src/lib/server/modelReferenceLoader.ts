/**
 * Resolves model references against the local model store, for code
 * generation, simulation and the test runner. Server-side only.
 */
import * as crypto from 'crypto'
import * as fs from 'fs'
import type { Storage } from './storage'
import { ModelFileMissingError, ModelNotFoundError, parseModelDocument } from './storage/ModelRepository'
import {
  ExpandResult,
  ModelDataLike,
  ModelLoader,
  ModelReferenceError,
  expandModelReferences,
} from '@/lib/modelReferences'
import { collectModelRefs } from '@/lib/referencedModels'

export { ModelReferenceError } from '@/lib/modelReferences'

/** Loads referenced models from the store: the current file, or a saved version. */
export function storageModelLoader(storage: Storage): ModelLoader {
  return ({ modelId: requestedId, version, name }) => {
    let record = storage.models.get(requestedId)
    // Imported or seeded models get new ids: fall back to the one model with the recorded name
    if (!record && name) {
      const byName = storage.models.list().filter(m => m.name === name)
      if (byName.length === 1) record = byName[0]!
    }
    if (!record) {
      throw new ModelReferenceError(
        `the referenced model ${name ? `"${name}" ` : ''}(${requestedId}) does not exist`
      )
    }
    const modelId = record.id
    try {
      if (version === null) {
        const current = storage.models.readCurrent(modelId)
        return { id: modelId, name: current.record.name, version: null, hash: current.hash, data: current.data as any }
      }
      const data = storage.models.getVersion(modelId, version)
      const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex')
      return { id: modelId, name: record.name, version, hash, data: data as any }
    } catch (e) {
      if (e instanceof ModelNotFoundError) {
        throw new ModelReferenceError(`model "${record.name}" has no version ${version}`)
      }
      if (e instanceof ModelFileMissingError) {
        throw new ModelReferenceError(`the file of model "${record.name}" is missing`)
      }
      throw e
    }
  }
}

/**
 * The model as code generation needs it: model references expanded from the
 * store. Throws ModelReferenceError when a reference cannot be resolved.
 */
export function expandForBuild<T extends ModelDataLike>(storage: Storage, data: T, modelName?: string): ExpandResult<T> {
  return expandModelReferences(data, storageModelLoader(storage), { rootName: modelName })
}

/**
 * Stored models whose current file references `modelId`, with the versions
 * they use (null = latest). Reads the files directly, without recording
 * outside changes.
 */
export function findModelDependents(
  storage: Storage,
  modelId: string
): Array<{ id: string; name: string; versions: Array<number | null> }> {
  const out: Array<{ id: string; name: string; versions: Array<number | null> }> = []
  for (const record of storage.models.list()) {
    if (record.id === modelId) continue
    let content: string
    try {
      content = fs.readFileSync(storage.models.modelFilePath(record), 'utf8')
    } catch {
      continue
    }
    if (!content.includes(modelId)) continue
    try {
      const { data } = parseModelDocument(content, record.name)
      const versions = collectModelRefs((data as any).sheets || [])
        .filter(r => r.modelId === modelId)
        .map(r => r.version)
      if (versions.length > 0) out.push({ id: record.id, name: record.name, versions })
    } catch {
      // unreadable model: not a dependent we can report
    }
  }
  return out
}

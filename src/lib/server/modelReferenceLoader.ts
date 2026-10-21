/**
 * Resolves model references against the local model store, for code
 * generation, simulation and the test runner. Server-side only.
 */
import * as crypto from 'crypto'
import type { Storage } from './storage'
import { ModelFileMissingError, ModelNotFoundError } from './storage/ModelRepository'
import {
  ExpandResult,
  ModelDataLike,
  ModelLoader,
  ModelReferenceError,
  expandModelReferences,
} from '@/lib/modelReferences'

export { ModelReferenceError } from '@/lib/modelReferences'

/** Loads referenced models from the store: the current file, or a saved version. */
export function storageModelLoader(storage: Storage): ModelLoader {
  return ({ modelId, version }) => {
    const record = storage.models.get(modelId)
    if (!record) throw new ModelReferenceError(`the referenced model (${modelId}) does not exist`)
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

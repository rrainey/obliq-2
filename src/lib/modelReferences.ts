// lib/modelReferences.ts
//
// Model references: a subsystem block whose contents are another saved model
// (`parameters.modelRef = { modelId, version }`, version null = latest).
//
// Before code generation, expandModelReferences() replaces each reference
// with an ordinary (flattened) subsystem holding a copy of the referenced
// model's sheets, so the rest of the pipeline treats it like any subsystem:
//
// - The block's ports are the referenced model's top-level Input and Output
//   Port blocks, in sheet then block order (modelInterface). Wires to the
//   block are re-indexed by port name, so a reordered interface stays wired;
//   a removed port is an error.
// - Block, sheet and connection ids are prefixed per instance, and sheet
//   label names are prefixed per instance, so nothing binds across the model
//   boundary. Segregated subsystems and subsystem references inside the
//   referenced model keep working (their ids are prefixed consistently).
// - The referenced model's parameters join the host's: model parameters are
//   global in generated C. The same name with a different definition is an
//   error naming both models; identical definitions merge.
// - References nest (a referenced model may reference others) up to
//   MAX_DEPTH; a cycle is an error naming the chain.
//
// Data stores do not cross a model boundary; a referenced model that declares
// any is not supported yet.

export interface ModelRef {
  modelId: string
  /** null: the model's current saved file */
  version: number | null
}

export interface ReferencedModel {
  id: string
  name: string
  /** The version loaded; null for the current file */
  version: number | null
  /** Content hash of what was loaded */
  hash: string
  data: ModelDataLike
}

export interface ModelDataLike {
  sheets?: any[]
  parameters?: any[]
  dataStores?: any[]
}

/** Loads a referenced model; throws ModelReferenceError when it cannot. */
export type ModelLoader = (ref: ModelRef) => ReferencedModel

export class ModelReferenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelReferenceError'
  }
}

export const MAX_MODEL_REFERENCE_DEPTH = 8

export interface ModelInterface {
  inputs: string[]
  outputs: string[]
}

/** Whether a block is a model reference. */
export function isModelReference(block: any): boolean {
  return block?.type === 'subsystem' && typeof block?.parameters?.modelRef?.modelId === 'string'
}

export function modelRefOf(block: any): ModelRef | null {
  if (!isModelReference(block)) return null
  const v = block.parameters.modelRef.version
  return { modelId: block.parameters.modelRef.modelId, version: typeof v === 'number' && v > 0 ? v : null }
}

const portName = (b: any): string => String(b.parameters?.portName || b.name)

/** A model's interface: its top-level Input and Output Port names, in sheet then block order. */
export function modelInterface(data: { sheets?: any[] }): ModelInterface {
  const inputs: string[] = []
  const outputs: string[] = []
  for (const sheet of data.sheets || []) {
    for (const b of sheet.blocks || []) {
      if (b.type === 'input_port') inputs.push(portName(b))
      else if (b.type === 'output_port') outputs.push(portName(b))
    }
  }
  return { inputs, outputs }
}

/** Whether a model's sheets (at any depth) contain a model reference. */
export function hasModelReferences(sheets: any[]): boolean {
  for (const sheet of sheets || []) {
    for (const b of sheet.blocks || []) {
      if (isModelReference(b)) return true
      if (Array.isArray(b.parameters?.sheets) && hasModelReferences(b.parameters.sheets)) return true
    }
  }
  return false
}

const refKey = (r: ModelRef) => `${r.modelId}@${r.version ?? 'latest'}`
const describe = (m: { name: string; version: number | null }) => (m.version ? `${m.name} v${m.version}` : m.name)

export interface ExpandResult<T extends ModelDataLike> {
  data: T
  /** Every model loaded, directly or nested (for cache keys and reports) */
  dependencies: Array<{ modelId: string; name: string; version: number | null; hash: string }>
}

/**
 * Returns a copy of `data` with every model reference expanded. The input is
 * not modified. Throws ModelReferenceError for a missing model or version, a
 * cycle, excessive depth, a removed port, a parameter clash, or unsupported
 * content.
 */
export function expandModelReferences<T extends ModelDataLike>(
  data: T,
  load: ModelLoader,
  opts: { rootName?: string } = {}
): ExpandResult<T> {
  if (!hasModelReferences(data.sheets || [])) return { data, dependencies: [] }
  const rootName = opts.rootName || 'this model'
  const deps = new Map<string, ExpandResult<T>['dependencies'][number]>()
  const cache = new Map<string, ReferencedModel>()
  // Parameters by name, with the model that defined them first
  const params = new Map<string, { param: any; from: string }>()
  for (const p of data.parameters || []) params.set(String(p.name), { param: p, from: rootName })

  const loadOnce = (ref: ModelRef): ReferencedModel => {
    const key = refKey(ref)
    let m = cache.get(key)
    if (!m) {
      m = load(ref)
      cache.set(key, m)
      deps.set(key, { modelId: m.id, name: m.name, version: m.version, hash: m.hash })
    }
    return m
  }

  const mergeParameters = (model: ReferencedModel, where: string) => {
    for (const p of model.data.parameters || []) {
      const name = String(p.name)
      const seen = params.get(name)
      if (!seen) {
        params.set(name, { param: p, from: describe(model) })
      } else if (!sameParameter(seen.param, p)) {
        throw new ModelReferenceError(
          `${where}: parameter "${name}" in model "${describe(model)}" differs from "${name}" in "${seen.from}". ` +
            'Model parameters are shared by all models in a build; rename one or make them equal.'
        )
      }
    }
  }

  /** Expand one model's sheets; `chain` holds the models above it (for cycles). */
  const expandSheets = (sheets: any[], chain: Array<{ key: string; name: string }>): any[] =>
    sheets.map(sheet => {
      let connections = sheet.connections || []
      const blocks = (sheet.blocks || []).map((block: any) => {
        if (isModelReference(block)) {
          const ref = modelRefOf(block)!
          const key = refKey(ref)
          const where = `Model reference "${block.name}"`
          const loopAt = chain.findIndex(c => c.key === key)
          if (loopAt >= 0) {
            const names = [...chain.slice(loopAt).map(c => c.name), chain[loopAt]!.name]
            throw new ModelReferenceError(`${where} makes a cycle: ${names.join(' → ')}`)
          }
          if (chain.length > MAX_MODEL_REFERENCE_DEPTH) {
            throw new ModelReferenceError(`${where}: models are nested more than ${MAX_MODEL_REFERENCE_DEPTH} deep`)
          }
          let target: ReferencedModel
          try {
            target = loadOnce(ref)
          } catch (e) {
            throw new ModelReferenceError(`${where}: ${(e as Error).message}`)
          }
          if ((target.data.dataStores || []).length > 0) {
            throw new ModelReferenceError(
              `${where}: model "${describe(target)}" declares data stores, which model references do not support yet`
            )
          }
          mergeParameters(target, where)
          const iface = modelInterface(target.data)
          connections = remapPorts(connections, block, iface, where, describe(target))
          const inner = expandSheets(target.data.sheets || [], [...chain, { key, name: describe(target) }])
          return {
            ...block,
            parameters: {
              ...block.parameters,
              inputPorts: iface.inputs,
              outputPorts: iface.outputs,
              codeGenStrategy: 'flatten',
              isReference: false,
              referencedSubsystemId: undefined,
              // Expanded: no longer a reference, but say where it came from
              modelRef: undefined,
              expandedModelRef: { ...ref, name: target.name },
              sheets: namespaceSheets(inner, `${block.id}~`),
            },
          }
        }
        if (Array.isArray(block.parameters?.sheets) && block.parameters.sheets.length > 0) {
          return { ...block, parameters: { ...block.parameters, sheets: expandSheets(block.parameters.sheets, chain) } }
        }
        return block
      })
      return { ...sheet, blocks, connections }
    })

  const sheets = expandSheets(data.sheets || [], [{ key: '<root>', name: rootName }])
  const expanded = { ...data, sheets, parameters: [...params.values()].map(v => v.param) } as T
  return { data: expanded, dependencies: [...deps.values()] }
}

function sameParameter(a: any, b: any): boolean {
  const norm = (p: any) =>
    JSON.stringify({
      type: p.dataType ?? p.signalType ?? 'double',
      value: p.defaultValue !== undefined ? p.defaultValue : p.value,
    })
  return norm(a) === norm(b)
}

/**
 * Re-index the wires on a reference block from its cached port lists to the
 * referenced model's current interface, by port name.
 */
function remapPorts(connections: any[], block: any, iface: ModelInterface, where: string, model: string): any[] {
  const cachedIn: string[] = block.parameters?.inputPorts || []
  const cachedOut: string[] = block.parameters?.outputPorts || []
  const map = (index: number, cached: string[], current: string[], kind: 'input' | 'output') => {
    // Without a cached list (a new block), indices already follow the interface
    const name = cached.length > 0 ? cached[index] : current[index]
    const at = name === undefined ? -1 : current.indexOf(name)
    if (at < 0) {
      throw new ModelReferenceError(
        `${where}: a wire uses ${kind} port ${name === undefined ? `#${index + 1}` : `"${name}"`}, which model "${model}" no longer has`
      )
    }
    return at
  }
  return connections.map(c => {
    let next = c
    if (c.targetBlockId === block.id && c.targetPortIndex >= 0) {
      next = { ...next, targetPortIndex: map(c.targetPortIndex, cachedIn, iface.inputs, 'input') }
    }
    if (c.sourceBlockId === block.id && c.sourcePortIndex >= 0) {
      next = { ...next, sourcePortIndex: map(c.sourcePortIndex, cachedOut, iface.outputs, 'output') }
    }
    return next
  })
}

/** Prefix ids (blocks, sheets, connections, subsystem references) and sheet label names. */
function namespaceSheets(sheets: any[], prefix: string): any[] {
  const sheet = (s: any): any => ({
    ...s,
    id: prefix + s.id,
    blocks: (s.blocks || []).map(block),
    connections: (s.connections || []).map((c: any) => ({
      ...c,
      id: prefix + c.id,
      sourceBlockId: prefix + c.sourceBlockId,
      targetBlockId: prefix + c.targetBlockId,
    })),
  })
  const block = (b: any): any => {
    const p = { ...(b.parameters || {}) }
    if (b.type === 'sheet_label_sink' || b.type === 'sheet_label_source') {
      p.signalName = prefix + String(p.signalName || b.name)
    }
    if (typeof p.referencedSubsystemId === 'string' && p.referencedSubsystemId) {
      p.referencedSubsystemId = prefix + p.referencedSubsystemId
    }
    if (Array.isArray(p.sheets)) p.sheets = p.sheets.map(sheet)
    return { ...b, id: prefix + b.id, parameters: p }
  }
  return sheets.map(sheet)
}

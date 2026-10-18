/**
 * Subsystem references — shared body, per-instance parameter values.
 *
 * Definition: ordinary subsystem with sheets + parameter schema.
 * Reference: isReference + referencedSubsystemId; no embedded sheets;
 *   parameters[] hold instance values matching the definition schema.
 */

import { BlockData } from '@/components/BlockNode'
import { ModelParameter, Sheet } from '@/lib/modelSchema'
import { getDefaultValue } from '@/lib/typeValidator'
import { parseC99Initializer, toC99Initializer } from '@/lib/c99InitializerValidator'

export type SubsystemLikeBlock = BlockData & {
  type: 'subsystem' | 'for_iterator_subsystem'
}

export function isSubsystemLike(
  block: BlockData | undefined | null
): block is SubsystemLikeBlock {
  return !!block && (block.type === 'subsystem' || block.type === 'for_iterator_subsystem')
}

export function isSubsystemReference(block: BlockData | undefined | null): boolean {
  return (
    isSubsystemLike(block) &&
    !!(block!.parameters?.isReference) &&
    typeof block!.parameters?.referencedSubsystemId === 'string' &&
    block!.parameters.referencedSubsystemId.length > 0
  )
}

/** Definition blocks that may be targets of references (not themselves refs). */
export function isSubsystemDefinition(block: BlockData | undefined | null): boolean {
  return isSubsystemLike(block) && !isSubsystemReference(block)
}

/**
 * Resolve the definition block for a subsystem (identity if already a definition).
 * Returns undefined if the reference is dangling or points at another reference.
 */
export function resolveSubsystemDefinition(
  block: BlockData,
  allBlocks: BlockData[]
): SubsystemLikeBlock | undefined {
  if (!isSubsystemLike(block)) return undefined
  if (!isSubsystemReference(block)) return block as SubsystemLikeBlock

  const defId = String(block.parameters?.referencedSubsystemId || '')
  const def = allBlocks.find(b => b.id === defId)
  if (!def || !isSubsystemDefinition(def)) return undefined
  // v1: no reference chains
  if (isSubsystemReference(def)) return undefined
  return def as SubsystemLikeBlock
}

/** Sheets to flatten / edit — always from the definition. */
export function resolveSubsystemSheets(
  block: BlockData,
  allBlocks: BlockData[]
): Sheet[] {
  const def = resolveSubsystemDefinition(block, allBlocks)
  if (!def) return []
  const sheets = def.parameters?.sheets
  return Array.isArray(sheets) ? (sheets as Sheet[]) : []
}

export function findReferencesToDefinition(
  definitionId: string,
  allBlocks: BlockData[]
): SubsystemLikeBlock[] {
  return allBlocks.filter(
    b =>
      isSubsystemReference(b) &&
      b.parameters?.referencedSubsystemId === definitionId
  ) as SubsystemLikeBlock[]
}

export function definitionHasReferences(
  definitionId: string,
  allBlocks: BlockData[]
): boolean {
  return findReferencesToDefinition(definitionId, allBlocks).length > 0
}

/** Walk top-level sheets and nested subsystem sheets; collect every block. */
export function collectAllBlocksFromSheets(
  sheets: Array<{ blocks?: BlockData[] }>
): BlockData[] {
  const out: BlockData[] = []
  const visit = (list: BlockData[]) => {
    for (const b of list) {
      out.push(b)
      if (isSubsystemLike(b) && Array.isArray(b.parameters?.sheets)) {
        for (const sh of b.parameters.sheets as Array<{ blocks?: BlockData[] }>) {
          visit(sh.blocks || [])
        }
      }
    }
  }
  for (const sh of sheets) visit(sh.blocks || [])
  return out
}

/**
 * Why a definition block must not be deleted (or undefined if deletion is OK).
 */
export function getSubsystemDeleteBlockReason(
  blockId: string,
  allBlocks: BlockData[]
): string | undefined {
  const block = allBlocks.find(b => b.id === blockId)
  if (!block || !isSubsystemDefinition(block)) return undefined
  const refs = findReferencesToDefinition(blockId, allBlocks)
  if (refs.length === 0) return undefined
  const names = refs.map(r => r.name).join(', ')
  return (
    `Cannot delete subsystem "${block.name}": it is referenced by ${refs.length} ` +
    `block${refs.length === 1 ? '' : 's'} (${names}). Delete or retarget those references first.`
  )
}

/** Force segregated_atomic (used when creating a reference or upgrading a flatten source). */
export function upgradeToAtomicSegregated(block: BlockData): BlockData {
  return {
    ...block,
    parameters: {
      ...(block.parameters || {}),
      codeGenStrategy: 'segregated_atomic'
    }
  }
}

function paramTypeString(p: ModelParameter): string {
  return String(p.dataType || p.signalType || 'double')
}

function cloneParamValue(p: ModelParameter): {
  value?: ModelParameter['value']
  defaultValue?: string
} {
  const typeStr = paramTypeString(p)
  if (p.value !== undefined) {
    const value = JSON.parse(JSON.stringify(p.value)) as ModelParameter['value']
    return {
      value,
      defaultValue: p.defaultValue ?? toC99Initializer(value, typeStr)
    }
  }
  if (p.defaultValue !== undefined && p.defaultValue !== '') {
    const parsed = parseC99Initializer(p.defaultValue, typeStr)
    if (parsed.valid && parsed.value !== undefined) {
      return {
        value: parsed.value as ModelParameter['value'],
        defaultValue: p.defaultValue
      }
    }
    return { defaultValue: p.defaultValue }
  }
  const fallback = getDefaultValue(typeStr)
  return {
    value: fallback as ModelParameter['value'],
    defaultValue: toC99Initializer(fallback, typeStr)
  }
}

/**
 * Build instance parameter list from a definition schema, preserving values
 * from an existing reference when names still exist.
 */
export function syncReferenceParameterSchema(
  definition: BlockData,
  reference: BlockData
): ModelParameter[] {
  const schema = (definition.parameters?.parameters || []) as ModelParameter[]
  const existing = (reference.parameters?.parameters || []) as ModelParameter[]
  const byName = new Map(existing.map(p => [p.name, p]))

  return schema.map(defParam => {
    const prev = byName.get(defParam.name)
    const typeStr = paramTypeString(defParam)
    if (prev) {
      // Keep instance value; refresh type/default metadata from definition
      const kept = cloneParamValue(prev)
      // If types changed incompatibly, fall back to definition default
      const prevType = paramTypeString(prev)
      if (prevType !== typeStr && kept.value !== undefined) {
        // Attempt to keep value only when types match; else use definition default
        const fromDef = cloneParamValue(defParam)
        return {
          name: defParam.name,
          signalType: defParam.signalType || typeStr,
          dataType: defParam.dataType || typeStr,
          value: fromDef.value,
          defaultValue: fromDef.defaultValue
        }
      }
      return {
        name: defParam.name,
        signalType: defParam.signalType || typeStr,
        dataType: defParam.dataType || typeStr,
        value: kept.value,
        defaultValue: kept.defaultValue
      }
    }
    const fromDef = cloneParamValue(defParam)
    return {
      name: defParam.name,
      signalType: defParam.signalType || typeStr,
      dataType: defParam.dataType || typeStr,
      value: fromDef.value,
      defaultValue: fromDef.defaultValue
    }
  })
}

/**
 * Update every reference to `definitionId` so parameter lists match the
 * definition schema (values preserved by name where possible). Also mirrors
 * inputPorts / outputPorts / showEnableInput from the definition.
 */
export function syncAllReferencesToDefinition(
  definitionId: string,
  allBlocks: BlockData[]
): BlockData[] {
  const def = allBlocks.find(b => b.id === definitionId)
  if (!def || !isSubsystemDefinition(def)) return allBlocks

  return allBlocks.map(b => {
    if (
      !isSubsystemReference(b) ||
      b.parameters?.referencedSubsystemId !== definitionId
    ) {
      return b
    }
    return {
      ...b,
      parameters: {
        ...(b.parameters || {}),
        isReference: true,
        referencedSubsystemId: definitionId,
        codeGenStrategy: 'segregated_atomic',
        sheets: [],
        inputPorts: [...(def.parameters?.inputPorts || [])],
        outputPorts: [...(def.parameters?.outputPorts || [])],
        showEnableInput: !!def.parameters?.showEnableInput,
        parameters: syncReferenceParameterSchema(def, b)
      }
    }
  })
}

/**
 * Create a reference block payload from a definition (caller assigns id/position/name).
 */
export function createReferenceParametersFromDefinition(
  definition: BlockData
): Record<string, unknown> {
  if (!isSubsystemDefinition(definition)) {
    throw new Error('createReferenceParametersFromDefinition requires a definition subsystem')
  }
  const syntheticRef: BlockData = {
    id: '__new_ref__',
    type: 'subsystem',
    name: 'ref',
    position: { x: 0, y: 0 },
    parameters: { parameters: [] }
  }
  return {
    isReference: true,
    referencedSubsystemId: definition.id,
    codeGenStrategy: 'segregated_atomic',
    sheets: [],
    inputPorts: [...(definition.parameters?.inputPorts || ['Input1'])],
    outputPorts: [...(definition.parameters?.outputPorts || ['Output1'])],
    showEnableInput: !!definition.parameters?.showEnableInput,
    parameters: syncReferenceParameterSchema(definition, syntheticRef),
    width: definition.parameters?.width,
    height: definition.parameters?.height
  }
}

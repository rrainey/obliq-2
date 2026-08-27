/**
 * Crossing Goto/From (sheet label) detection for segregated subsystems.
 *
 * Rules:
 *   Outside From  ↔ Inside Goto  → EXPORT → output port
 *   Inside From   ↔ Outside Goto → IMPORT → input port
 *
 * Internal tags (both ends inside) are left alone.
 */

import { Sheet } from '@/lib/simulationTypes'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'

export type SheetLabelKind = 'goto' | 'from'

export interface SheetLabelRef {
  kind: SheetLabelKind
  signalName: string
  /** Subsystem path segments from root (empty = root sheet). */
  path: string[]
  dataType?: string
  tagVisibility?: string
  blockId?: string
  blockName?: string
}

export interface CrossingTags {
  /** Tag names that must become output ports on the segregated boundary. */
  exports: string[]
  /** Tag names that must become input ports on the segregated boundary. */
  imports: string[]
}

/** True if labelPath is under subsystemPath (equal or nested deeper). */
export function isUnderSubsystemPath(labelPath: string[], subsystemPath: string[]): boolean {
  if (subsystemPath.length === 0) return true
  if (labelPath.length < subsystemPath.length) return false
  return subsystemPath.every((seg, i) => labelPath[i] === seg)
}

/**
 * Walk sheets recursively and collect Goto (sink) / From (source) refs.
 */
export function collectSheetLabels(sheets: Sheet[], path: string[] = []): SheetLabelRef[] {
  const out: SheetLabelRef[] = []

  for (const sheet of sheets || []) {
    for (const block of sheet.blocks || []) {
      const params = block.parameters || {}
      if (block.type === 'sheet_label_sink') {
        const signalName = (params.signalName as string) || block.name
        if (signalName) {
          out.push({
            kind: 'goto',
            signalName,
            path: [...path],
            dataType: (params.dataType || params.signalType) as string | undefined,
            tagVisibility: (params.tagVisibility || params.visibility) as string | undefined,
            blockId: block.id,
            blockName: block.name
          })
        }
      } else if (block.type === 'sheet_label_source') {
        const signalName = (params.signalName as string) || block.name
        if (signalName) {
          out.push({
            kind: 'from',
            signalName,
            path: [...path],
            dataType: (params.dataType || params.signalType) as string | undefined,
            tagVisibility: (params.tagVisibility || params.visibility) as string | undefined,
            blockId: block.id,
            blockName: block.name
          })
        }
      } else if (block.type === 'subsystem' && params.sheets) {
        out.push(
          ...collectSheetLabels(params.sheets as Sheet[], [...path, block.name])
        )
      }
    }
  }

  return out
}

/**
 * Compute crossing import/export tag names for a subsystem at `subsystemPath`.
 */
export function computeCrossingTags(
  allLabels: SheetLabelRef[],
  subsystemPath: string[]
): CrossingTags {
  const inside = allLabels.filter(l => isUnderSubsystemPath(l.path, subsystemPath))
  const outside = allLabels.filter(l => !isUnderSubsystemPath(l.path, subsystemPath))

  const inGotos = new Set(inside.filter(l => l.kind === 'goto').map(l => l.signalName))
  const inFroms = new Set(inside.filter(l => l.kind === 'from').map(l => l.signalName))
  const outGotos = new Set(outside.filter(l => l.kind === 'goto').map(l => l.signalName))
  const outFroms = new Set(outside.filter(l => l.kind === 'from').map(l => l.signalName))

  const exports = [...outFroms].filter(s => inGotos.has(s)).sort()
  const imports = [...inFroms].filter(s => outGotos.has(s)).sort()

  return { exports, imports }
}

export interface PromotedPortsResult {
  inputPorts: string[]
  outputPorts: string[]
  /** Import tags newly added (not already declared). */
  addedInputs: string[]
  /** Export tags newly added (not already declared). */
  addedOutputs: string[]
  /** Deep-cloned sheets with bridging Gotos / output wires for promoted ports. */
  sheets: Sheet[]
}

let synthIdCounter = 0
function synthId(prefix: string): string {
  synthIdCounter += 1
  return `${prefix}_xprom_${synthIdCounter}`
}

/** Reset synth ids (tests). */
export function resetCrossingTagSynthIds(): void {
  synthIdCounter = 0
}

/**
 * Best-effort dataType for a tag from the block that feeds its Goto, or from
 * an explicit dataType on the label itself.
 */
export function inferTagDataTypes(sheets: Sheet[]): Map<string, string> {
  const types = new Map<string, string>()

  const visit = (sheetList: Sheet[]) => {
    for (const sheet of sheetList || []) {
      const byId = new Map((sheet.blocks || []).map(b => [b.id, b]))
      for (const b of sheet.blocks || []) {
        const params = b.parameters || {}
        if (b.type === 'sheet_label_sink' || b.type === 'sheet_label_source') {
          const signalName = (params.signalName as string) || b.name
          const dt = (params.dataType || params.signalType) as string | undefined
          if (signalName && dt && !types.has(signalName)) {
            types.set(signalName, dt)
          }
        }
        if (b.type === 'subsystem' && params.sheets) {
          visit(params.sheets as Sheet[])
        }
      }
      // Goto feed → inherit source port/block type when available
      for (const w of sheet.connections || []) {
        const tgt = byId.get(w.targetBlockId)
        if (!tgt || tgt.type !== 'sheet_label_sink') continue
        const signalName =
          (tgt.parameters?.signalName as string) || tgt.name
        if (!signalName || types.has(signalName)) continue
        const src = byId.get(w.sourceBlockId)
        if (!src) continue
        const srcDt =
          (src.parameters?.dataType as string) ||
          (src.parameters?.signalType as string) ||
          (src.type === 'input_port'
            ? (src.parameters?.dataType as string)
            : undefined)
        if (srcDt) {
          types.set(signalName, srcDt)
        }
      }
    }
  }

  visit(sheets)
  return types
}

/**
 * Merge crossing tags into port lists and rewrite subsystem sheets so:
 * - IMPORT: input_port → local Goto(tag) so internal Froms resolve to the port
 * - EXPORT: driver of Goto(tag) → output_port (passthrough / fan-out)
 */
export function promoteCrossingPortsOnSubsystem(
  inputPorts: string[],
  outputPorts: string[],
  sheets: Sheet[],
  crossing: CrossingTags,
  /** Optional type hints: signalName → dataType */
  typeHints: Map<string, string> = new Map()
): PromotedPortsResult {
  const inputs = [...inputPorts]
  const outputs = [...outputPorts]
  const addedInputs: string[] = []
  const addedOutputs: string[] = []

  for (const name of crossing.exports) {
    if (!outputs.includes(name)) {
      outputs.push(name)
      addedOutputs.push(name)
    }
  }

  // Deep-clone sheets so we don't mutate the caller's model JSON in-place unexpectedly
  const cloned: Sheet[] = JSON.parse(JSON.stringify(sheets))

  // Ensure each import has an input_port on the root subsystem sheet + local Goto bridge
  if (cloned.length > 0 && (crossing.imports.length > 0 || crossing.exports.length > 0)) {
    const root = cloned[0]
    root.blocks = root.blocks || []
    root.connections = root.connections || []

    for (const name of crossing.imports) {
      // Bridge From(tag) → Goto(tag) ← input_port. If an input_port with this
      // name already exists (wired differently, e.g. bLiftoff←Memory5 while
      // Goto(bLiftoff)←T_L_prime), use a distinct __tag port so Froms see the
      // live Goto driver — same as flatten — without aliasing the explicit port.
      const bridgePortName = ensureImportBridge(root, name, typeHints.get(name))
      if (!inputs.includes(bridgePortName)) {
        inputs.push(bridgePortName)
        addedInputs.push(bridgePortName)
      }
    }
    for (const name of crossing.exports) {
      ensureExportBridge(root, cloned, name, typeHints.get(name))
    }
  } else {
    for (const name of crossing.imports) {
      if (!inputs.includes(name)) {
        inputs.push(name)
        addedInputs.push(name)
      }
    }
  }

  return {
    inputPorts: inputs,
    outputPorts: outputs,
    addedInputs,
    addedOutputs,
    sheets: cloned
  }
}

function findInputPort(sheet: Sheet, portName: string): BlockData | undefined {
  return (sheet.blocks || []).find(
    b =>
      b.type === 'input_port' &&
      ((b.parameters?.portName as string) === portName || b.name === portName)
  )
}

function findOutputPort(sheet: Sheet, portName: string): BlockData | undefined {
  return (sheet.blocks || []).find(
    b =>
      b.type === 'output_port' &&
      ((b.parameters?.portName as string) === portName || b.name === portName)
  )
}

function findGoto(sheets: Sheet[], signalName: string): { sheet: Sheet; block: BlockData } | null {
  for (const sheet of sheets) {
    for (const b of sheet.blocks || []) {
      if (
        b.type === 'sheet_label_sink' &&
        ((b.parameters?.signalName as string) === signalName || b.name === signalName)
      ) {
        return { sheet, block: b }
      }
      if (b.type === 'subsystem' && b.parameters?.sheets) {
        const nested = findGoto(b.parameters.sheets as Sheet[], signalName)
        if (nested) return nested
      }
    }
  }
  return null
}

/**
 * Create input_port → local Goto(tag) so internal From(tag) resolve here.
 * Returns the portName used for the bridge (may be `${name}__tag` when an
 * explicit input_port `name` already exists with a different parent wire).
 */
function ensureImportBridge(
  root: Sheet,
  name: string,
  dataType?: string
): string {
  const existing = findInputPort(root, name)
  // Distinct port when explicit input already present — avoids aliasing
  // Memory5-style delayed wires with live Goto drivers (T_L_prime).
  const bridgePortName = existing ? `${name}__tag` : name

  let inPort = findInputPort(root, bridgePortName)
  if (!inPort) {
    inPort = {
      id: synthId('input_port'),
      type: 'input_port',
      name: bridgePortName,
      position: { x: 0, y: 0 },
      parameters: {
        portName: bridgePortName,
        ...(dataType ? { dataType } : {})
      }
    }
    root.blocks.push(inPort)
  }

  // Local Goto so existing From(name) inside resolve to this input
  const gotoId = synthId('sheet_label_sink')
  const gotoBlock: BlockData = {
    id: gotoId,
    type: 'sheet_label_sink',
    name: `Goto_promoted_${name}`,
    position: { x: 0, y: 0 },
    parameters: {
      signalName: name,
      tagVisibility: 'local',
      ...(dataType ? { dataType } : {})
    }
  }
  root.blocks.push(gotoBlock)

  const wire: WireData = {
    id: synthId('wire'),
    sourceBlockId: inPort.id,
    sourcePortIndex: 0,
    targetBlockId: gotoId,
    targetPortIndex: 0
  }
  root.connections.push(wire)
  return bridgePortName
}

function ensureExportBridge(
  root: Sheet,
  allSheets: Sheet[],
  name: string,
  dataType?: string
): void {
  let outPort = findOutputPort(root, name)
  if (!outPort) {
    outPort = {
      id: synthId('output_port'),
      type: 'output_port',
      name,
      position: { x: 0, y: 0 },
      parameters: {
        portName: name,
        ...(dataType ? { dataType } : {})
      }
    }
    root.blocks.push(outPort)
  }

  const goto = findGoto(allSheets, name)
  if (!goto) {
    return
  }

  // Driver of the Goto fans out to the output port
  const feed = (goto.sheet.connections || []).find(
    c => c.targetBlockId === goto.block.id && c.targetPortIndex === 0
  )
  if (!feed) return

  // If Goto is on a nested sheet, we cannot directly wire nested source → root outport
  // without hierarchy. Prefer: when Goto is on root sheet, wire directly.
  if (goto.sheet === root || goto.sheet.id === root.id) {
    const already = (root.connections || []).some(
      c =>
        c.sourceBlockId === feed.sourceBlockId &&
        c.sourcePortIndex === feed.sourcePortIndex &&
        c.targetBlockId === outPort!.id
    )
    if (!already) {
      root.connections.push({
        id: synthId('wire'),
        sourceBlockId: feed.sourceBlockId,
        sourcePortIndex: feed.sourcePortIndex,
        targetBlockId: outPort.id,
        targetPortIndex: 0
      })
    }
    return
  }

  // Nested Goto: add a From on the root sheet that reads the tag and feeds outport.
  // (Tag must be visible — crossing exports use global Gotos in Saturn.)
  const fromId = synthId('sheet_label_source')
  root.blocks.push({
    id: fromId,
    type: 'sheet_label_source',
    name: `From_promoted_${name}`,
    position: { x: 0, y: 0 },
    parameters: {
      signalName: name,
      ...(dataType ? { dataType } : {})
    }
  })
  root.connections.push({
    id: synthId('wire'),
    sourceBlockId: fromId,
    sourcePortIndex: 0,
    targetBlockId: outPort.id,
    targetPortIndex: 0
  })
}

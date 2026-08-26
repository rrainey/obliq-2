// lib/sheetLabelUtils.ts
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'

// WireData used by collectSheetsRecursive

/**
 * Collects all signal names currently in use within a sheet/subsystem
 * This includes both explicitly named signals (from wires/connections) and 
 * signal names from sheet label sinks
 */
export function collectAvailableSignalNames(
  blocks: BlockData[],
  wires: WireData[]
): string[] {
  const signalNames = new Set<string>()
  
  // Collect signal names from Sheet Label Sink blocks
  for (const block of blocks) {
    if (block.type === 'sheet_label_sink' && block.parameters?.signalName) {
      signalNames.add(block.parameters.signalName)
    }
  }
  
  // In the future, we might also collect names from:
  // - Named wires (if we add that feature)
  // - Output port names
  // - Other named signals
  
  return Array.from(signalNames).sort()
}

/**
 * Finds all Sheet Label Sink blocks in the current scope
 */
export function findSheetLabelSinks(blocks: BlockData[]): BlockData[] {
  return blocks.filter(block => 
    block.type === 'sheet_label_sink' && 
    block.parameters?.signalName
  )
}

/**
 * Finds all Sheet Label Source blocks in the current scope
 */
export function findSheetLabelSources(blocks: BlockData[]): BlockData[] {
  return blocks.filter(block => 
    block.type === 'sheet_label_source'
  )
}

/**
 * Gets all sink signal names with their block information
 */
export interface SheetLabelSinkInfo {
  blockId: string
  blockName: string
  signalName: string
}

export function getSheetLabelSinkInfo(blocks: BlockData[]): SheetLabelSinkInfo[] {
  return blocks
    .filter(block => block.type === 'sheet_label_sink' && block.parameters?.signalName)
    .map(block => ({
      blockId: block.id,
      blockName: block.name,
      signalName: block.parameters!.signalName
    }))
}

/**
 * Resolves sheet label connections by matching sources to sinks by signal name
 */
export interface SheetLabelConnection {
  sourceBlock: BlockData
  sinkBlock: BlockData
  signalName: string
}

export function resolveSheetLabelConnections(blocks: BlockData[]): SheetLabelConnection[] {
  const connections: SheetLabelConnection[] = []
  const sinks = findSheetLabelSinks(blocks)
  const sources = findSheetLabelSources(blocks)
  
  // Create a map of signal names to sink blocks for efficient lookup
  const sinkMap = new Map<string, BlockData>()
  for (const sink of sinks) {
    if (sink.parameters?.signalName) {
      sinkMap.set(sink.parameters.signalName, sink)
    }
  }
  
  // Match sources to sinks
  for (const source of sources) {
    if (source.parameters?.signalName) {
      const sink = sinkMap.get(source.parameters.signalName)
      if (sink) {
        connections.push({
          sourceBlock: source,
          sinkBlock: sink,
          signalName: source.parameters.signalName
        })
      }
    }
  }
  
  return connections
}

/**
 * Compute the set of source ports (`"blockId:portIndex"`) that logically belong
 * to the same net as `startWire`, traversing sheet-label sink/source pairs
 * transitively. Used by "Highlight Connections" so a wire that terminates at
 * a Sheet Label Sink also highlights the outputs of every matching Sheet
 * Label Source on the same sheet, and vice versa.
 *
 * Scope is limited to the given `blocks`/`wires` (typically the current
 * sheet). Sheet labels reference each other by `signalName`.
 */
export function expandNetViaSheetLabels(
  startWire: WireData,
  blocks: BlockData[],
  wires: WireData[]
): Set<string> {
  const key = (blockId: string, portIndex: number) => `${blockId}:${portIndex}`
  const blockById = new Map(blocks.map(b => [b.id, b] as const))

  // signalName -> sinks / sources on this sheet
  const sinksByName = new Map<string, BlockData[]>()
  const sourcesByName = new Map<string, BlockData[]>()
  for (const b of blocks) {
    const name = b.parameters?.signalName
    if (!name) continue
    if (b.type === 'sheet_label_sink') {
      const arr = sinksByName.get(name) ?? []
      arr.push(b); sinksByName.set(name, arr)
    } else if (b.type === 'sheet_label_source') {
      const arr = sourcesByName.get(name) ?? []
      arr.push(b); sourcesByName.set(name, arr)
    }
  }

  const net = new Set<string>()
  const queue: Array<{ blockId: string; portIndex: number }> = []
  const enqueue = (blockId: string, portIndex: number) => {
    const k = key(blockId, portIndex)
    if (net.has(k)) return
    net.add(k)
    queue.push({ blockId, portIndex })
  }

  enqueue(startWire.sourceBlockId, startWire.sourcePortIndex)

  while (queue.length) {
    const src = queue.shift()!
    const srcBlock = blockById.get(src.blockId)

    // 1. If the source is a sheet_label_source, hop upstream: find the sinks
    //    with the same signalName, then the wires feeding those sinks, and
    //    add their source ports to the net.
    if (srcBlock?.type === 'sheet_label_source') {
      const name = srcBlock.parameters?.signalName
      if (name) {
        for (const sink of sinksByName.get(name) ?? []) {
          for (const w of wires) {
            if (w.targetBlockId === sink.id) {
              enqueue(w.sourceBlockId, w.sourcePortIndex)
            }
          }
        }
      }
    }

    // 2. Walk wires driven by this source; if any lands on a sheet_label_sink,
    //    hop downstream to every matching sheet_label_source on this sheet.
    for (const w of wires) {
      if (w.sourceBlockId !== src.blockId || w.sourcePortIndex !== src.portIndex) continue
      const tgt = blockById.get(w.targetBlockId)
      if (tgt?.type === 'sheet_label_sink') {
        const name = tgt.parameters?.signalName
        if (name) {
          for (const source of sourcesByName.get(name) ?? []) {
            // sheet_label_source has a single output port at index 0.
            enqueue(source.id, 0)
          }
        }
      }
    }
  }

  return net
}

/**
 * Validates sheet label usage and returns any issues found
 */
export interface SheetLabelValidationIssue {
  type: 'duplicate_sink' | 'unmatched_source' | 'empty_signal_name'
  blockId: string
  blockName: string
  signalName?: string
  message: string
}

/**
 * Walk blocks including nested subsystem sheets (parameters.sheets).
 * Matches ModelFlattener’s ability to see global Goto sinks under IU, etc.
 */
export function collectBlocksRecursive(blocks: BlockData[]): BlockData[] {
  const out: BlockData[] = []
  const visit = (list: BlockData[]) => {
    for (const b of list) {
      out.push(b)
      if (b.type === 'subsystem' && Array.isArray(b.parameters?.sheets)) {
        for (const sh of b.parameters.sheets) {
          if (Array.isArray(sh?.blocks)) visit(sh.blocks)
        }
      }
    }
  }
  visit(blocks)
  return out
}

/** Collect {blocks, connections} for every nested sheet under the given roots. */
export function collectSheetsRecursive(
  sheets: Array<{ blocks: BlockData[]; connections: WireData[] }>
): Array<{ blocks: BlockData[]; connections: WireData[] }> {
  const out: Array<{ blocks: BlockData[]; connections: WireData[] }> = []
  const visit = (sh: { blocks?: BlockData[]; connections?: WireData[] }) => {
    const blocks = sh.blocks || []
    const connections = sh.connections || []
    out.push({ blocks, connections })
    for (const b of blocks) {
      if (b.type === 'subsystem' && Array.isArray(b.parameters?.sheets)) {
        for (const nested of b.parameters.sheets) {
          visit(nested)
        }
      }
    }
  }
  for (const s of sheets) visit(s)
  return out
}

/**
 * Validate sheet labels.
 * - Duplicate sinks: only within the same local `blocks` list (per sheet/scope).
 * - Unmatched sources: resolve against sinks in this list **and** nested
 *   subsystem sheets (Simulink global Goto / ModelFlattener fallback).
 */
export function validateSheetLabels(blocks: BlockData[]): SheetLabelValidationIssue[] {
  const issues: SheetLabelValidationIssue[] = []
  const localSinks = new Map<string, BlockData[]>()
  
  // Check for duplicate sink signal names and empty names (local scope only)
  for (const block of blocks) {
    if (block.type === 'sheet_label_sink') {
      const signalName = block.parameters?.signalName
      
      if (!signalName || !signalName.trim()) {
        issues.push({
          type: 'empty_signal_name',
          blockId: block.id,
          blockName: block.name,
          message: `Sheet Label Sink "${block.name}" has no signal name configured`
        })
        continue
      }
      
      if (!localSinks.has(signalName)) {
        localSinks.set(signalName, [])
      }
      localSinks.get(signalName)!.push(block)
    }
  }
  
  // Report duplicate sink names within this scope only
  for (const [signalName, sinkBlocks] of localSinks) {
    if (sinkBlocks.length > 1) {
      for (const block of sinkBlocks) {
        issues.push({
          type: 'duplicate_sink',
          blockId: block.id,
          blockName: block.name,
          signalName,
          message: `Multiple Sheet Label Sinks use signal name "${signalName}"`
        })
      }
    }
  }

  // Nested sinks (for unmatched-source resolution only)
  const allBlocks = collectBlocksRecursive(blocks)
  const reachableSinkNames = new Set<string>()
  for (const block of allBlocks) {
    if (block.type === 'sheet_label_sink') {
      const signalName = block.parameters?.signalName
      if (signalName && signalName.trim()) reachableSinkNames.add(signalName)
    }
  }
  
  // Check for unmatched sources against local + nested sinks
  for (const block of blocks) {
    if (block.type === 'sheet_label_source') {
      const signalName = block.parameters?.signalName
      
      if (!signalName || !signalName.trim()) {
        issues.push({
          type: 'empty_signal_name',
          blockId: block.id,
          blockName: block.name,
          message: `Sheet Label Source "${block.name}" has no signal name configured`
        })
        continue
      }
      
      if (!reachableSinkNames.has(signalName)) {
        issues.push({
          type: 'unmatched_source',
          blockId: block.id,
          blockName: block.name,
          signalName,
          message: `Sheet Label Source "${block.name}" references non-existent signal "${signalName}"`
        })
      }
    }
  }
  
  return issues
}
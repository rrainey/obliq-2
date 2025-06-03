// lib/sheetLabelUtils.ts
'use client'

import { BlockData } from '@/components/Block'
import { WireData } from '@/components/Wire'

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
 * Validates sheet label usage and returns any issues found
 */
export interface SheetLabelValidationIssue {
  type: 'duplicate_sink' | 'unmatched_source' | 'empty_signal_name'
  blockId: string
  blockName: string
  signalName?: string
  message: string
}

export function validateSheetLabels(blocks: BlockData[]): SheetLabelValidationIssue[] {
  const issues: SheetLabelValidationIssue[] = []
  const sinkSignalNames = new Map<string, BlockData[]>()
  
  // Check for duplicate sink signal names and empty names
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
      
      if (!sinkSignalNames.has(signalName)) {
        sinkSignalNames.set(signalName, [])
      }
      sinkSignalNames.get(signalName)!.push(block)
    }
  }
  
  // Report duplicate sink names
  for (const [signalName, sinkBlocks] of sinkSignalNames) {
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
  
  // Check for unmatched sources
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
      
      if (!sinkSignalNames.has(signalName)) {
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
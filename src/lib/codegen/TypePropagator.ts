// lib/codegen/TypePropagator.ts

import { FlattenedModel, FlattenedBlock } from './ModelFlattener'
import { BlockModuleFactory } from '../blocks/BlockModuleFactory'
import { parseType, isValidType, normalizeType } from '@/lib/typeValidator'

/**
 * Propagates types through the model to determine the output type of each block
 */
export class TypePropagator {
  private model: FlattenedModel
  private blockOutputTypes: Map<string, string> = new Map()
  
  constructor(model: FlattenedModel) {
    this.model = model
  }
  
  /**
   * Propagate types through the model and return the type map
   */
  propagate(): Map<string, string> {
    // First pass: Set types for input ports and sources
    for (const block of this.model.blocks) {
      if (block.block.type === 'input_port') {
        const dataType = block.block.parameters?.dataType || 'double'
        // Validate and normalize the type
        if (isValidType(dataType)) {
          this.blockOutputTypes.set(block.originalId, normalizeType(dataType))
        } else {
          console.warn(`Invalid type for input port ${block.block.name}: ${dataType}`)
          this.blockOutputTypes.set(block.originalId, 'double')
        }
      } else if (block.block.type === 'source') {
        const dataType = block.block.parameters?.dataType || 'double'
        // Validate and normalize the type
        if (isValidType(dataType)) {
          this.blockOutputTypes.set(block.originalId, normalizeType(dataType))
        } else {
          console.warn(`Invalid type for source ${block.block.name}: ${dataType}`)
          this.blockOutputTypes.set(block.originalId, 'double')
        }
      }
    }
    
    // Calculate execution order for type propagation
    const executionOrder = this.calculateExecutionOrder()

    // Multiple passes: integrators break loops and may only know x(0) on the first
    // pass; once q is typed, body2quaternion_rates etc. refine on later passes.
    const maxPasses = Math.max(3, this.model.blocks.length)
    for (let pass = 0; pass < maxPasses; pass++) {
      let changed = false

      for (const block of executionOrder) {
        if (block.block.type === 'input_port' || block.block.type === 'source') {
          continue // Already handled
        }

        // Special handling for segregated subsystems
        // Their output types are determined by internal type propagation, not by the block module
        if (block.isSegregated && block.block.type === 'subsystem') {
          const subInfo = this.model.segregatedSubsystems?.find(
            sub => sub.subsystemId === block.originalId
          )
          if (subInfo && subInfo.outputPorts.length > 0) {
            // For subsystems with single output, use that type
            // For multiple outputs, store first type (connections use port index)
            const outputType = subInfo.outputPorts[0].dataType
            if (isValidType(outputType)) {
              const next = normalizeType(outputType)
              if (this.blockOutputTypes.get(block.originalId) !== next) {
                this.blockOutputTypes.set(block.originalId, next)
                changed = true
              }
            } else if (!this.blockOutputTypes.has(block.originalId)) {
              this.blockOutputTypes.set(block.originalId, 'double')
              changed = true
            }
          } else if (!this.blockOutputTypes.has(block.originalId)) {
            this.blockOutputTypes.set(block.originalId, 'double')
            changed = true
          }
          continue
        }

        // Get input types for this block
        const inputTypes = this.getBlockInputTypes(block)

        // Skip if block type is not supported
        if (!BlockModuleFactory.isSupported(block.block.type)) {
          continue
        }

        try {
          const module1 = BlockModuleFactory.getBlockModule(block.block.type)
          const outputType = module1.getOutputType(block.block, inputTypes)

          // Sink blocks (signal_logger, signal_display) have void output type - this is valid
          let next: string | null = null
          if (outputType === 'void') {
            next = 'void'
          } else if (isValidType(outputType)) {
            next = normalizeType(outputType)
          } else {
            console.warn(`Invalid output type for block ${block.block.name}: ${outputType}`)
            next = 'double'
          }

          if (next) {
            const prev = this.blockOutputTypes.get(block.originalId)
            if (!prev) {
              this.blockOutputTypes.set(block.originalId, next)
              changed = true
            } else if (prev !== next) {
              // Prefer dimensional types over a poisoned scalar default; never
              // downgrade matrix/vector → plain double.
              const prevDim = prev.includes('[')
              const nextDim = next.includes('[')
              // Guard: mux-concat feedback must not explode array sizes across passes
              const prevSize = prev.match(/\[(\d+)\]/)
              const nextSize = next.match(/\[(\d+)\]/)
              if (
                prevSize &&
                nextSize &&
                Number(nextSize[1]) > Number(prevSize[1]) &&
                Number(nextSize[1]) > 64
              ) {
                // keep smaller stable size
              } else if (prevDim && !nextDim) {
                // keep dimensional
              } else {
                this.blockOutputTypes.set(block.originalId, next)
                changed = true
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to determine output type for block ${block.block.name}:`, error)
          if (!this.blockOutputTypes.has(block.originalId)) {
            this.blockOutputTypes.set(block.originalId, 'double') // Default
            changed = true
          }
        }
      }

      if (!changed) break
    }
    
    return this.blockOutputTypes
  }
  
  /**
   * Get the output type for a specific block
   */
  getBlockOutputType(blockId: string): string {
    return this.blockOutputTypes.get(blockId) || 'double'
  }
  
  /**
   * Get input types for a block based on its connections.
   * Indexed by target port index (sparse holes are empty string if unconnected/untyped).
   * Does NOT invent 'double' for unknown sources — that poisons matrix integrators in loops.
   */
  private getBlockInputTypes(block: FlattenedBlock): string[] {
    // Data ports only (index >= 0). Control ports (-1 enable, -2 reset) are excluded.
    const connections = this.model.connections
      .filter(c => c.targetBlockId === block.originalId && c.targetPortIndex >= 0)
      .sort((a, b) => a.targetPortIndex - b.targetPortIndex)

    let maxPort = -1
    for (const c of connections) {
      if (c.targetPortIndex > maxPort) maxPort = c.targetPortIndex
    }

    const types: string[] = Array.from({ length: maxPort + 1 }, () => '')

    for (const connection of connections) {
      const sourceType = this.blockOutputTypes.get(connection.sourceBlockId)
      if (!sourceType) continue
      const port = connection.targetPortIndex
      const prev = types[port]
      // Multiple wires on one port (MDL branches / bad merges): prefer dimensional
      if (!prev || (!prev.includes('[') && sourceType.includes('['))) {
        types[port] = sourceType
      }
    }

    return types
  }
  
  /**
   * Calculate execution order using topological sort
   */
  private calculateExecutionOrder(): FlattenedBlock[] {
    const sorted: FlattenedBlock[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()
    
    // Build adjacency list considering direct feedthrough
    const dependencies = new Map<string, string[]>()
    
    for (const block of this.model.blocks) {
      dependencies.set(block.originalId, [])
    }
    
    for (const connection of this.model.connections) {
      const targetBlock = this.model.blocks.find(b => b.originalId === connection.targetBlockId)
      const sourceBlock = this.model.blocks.find(b => b.originalId === connection.sourceBlockId)

      if (!targetBlock || !sourceBlock) continue

      // Check if the target block has direct feedthrough
      if (this.hasDirectFeedthrough(targetBlock)) {

        const deps = dependencies.get(connection.targetBlockId)
        if (deps && !deps.includes(connection.sourceBlockId)) {
          deps.push(connection.sourceBlockId)
        }

      }
    }
    
    // Topological sort with cycle detection
    const visit = (blockId: string, path: string[] = []) => {
      if (visited.has(blockId)) return
      
      if (visiting.has(blockId)) {
        // This is an algebraic loop
        const block = this.model.blocks.find(b => b.originalId === blockId)
        console.warn(`Algebraic loop detected involving block ${block?.block.name || blockId}`)
        console.warn(`Loop path: ${[...path, blockId].join(' -> ')}`)
        return
      }
      
      visiting.add(blockId)
      
      const deps = dependencies.get(blockId) || []
      for (const dep of deps) {
        visit(dep, [...path, blockId])
      }
      
      visiting.delete(blockId)
      visited.add(blockId)
      
      const block = this.model.blocks.find(b => b.originalId === blockId)
      if (block) {
        sorted.push(block)
      }
    }
    
    // Visit all blocks
    for (const block of this.model.blocks) {
      visit(block.originalId)
    }
    
    return sorted
  }

  /**
   * Check if a block has direct feedthrough
   */
  private hasDirectFeedthrough(block: FlattenedBlock): boolean {
    // Special handling for known block types
    if (block.block.type === 'transfer_function') {
      // Transfer functions without direct feedthrough can break algebraic loops
      try {
        const module1 = BlockModuleFactory.getBlockModule(block.block.type)
        if (module1.isDirectFeedthrough) {
          return module1.isDirectFeedthrough(block.block) ?? true
        }
      } catch {
        // If module not found, assume direct feedthrough
      }
    }
    
    // Check if block module implements isDirectFeedthrough
    if (BlockModuleFactory.isSupported(block.block.type)) {
      try {
        const module1 = BlockModuleFactory.getBlockModule(block.block.type)
        if (module1.isDirectFeedthrough) {
          return module1.isDirectFeedthrough(block.block) ?? true
        }
      } catch {
        // If error, assume direct feedthrough for safety
      }
    }
    
    // Default: assume direct feedthrough (conservative approach)
    return true
  }
}
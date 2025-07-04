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
    
    // Second pass: Propagate types through the execution order
    for (const block of executionOrder) {
      if (block.block.type === 'input_port' || block.block.type === 'source') {
        continue // Already handled
      }
      
      // Get input types for this block
      const inputTypes = this.getBlockInputTypes(block)
      
      // Skip if block type is not supported
      if (!BlockModuleFactory.isSupported(block.block.type)) {
        continue
      }
      
      try {
        const module = BlockModuleFactory.getBlockModule(block.block.type)
        const outputType = module.getOutputType(block.block, inputTypes)
        
        // Validate the output type
        if (isValidType(outputType)) {
          this.blockOutputTypes.set(block.originalId, normalizeType(outputType))
        } else {
          console.warn(`Invalid output type for block ${block.block.name}: ${outputType}`)
          this.blockOutputTypes.set(block.originalId, 'double')
        }
      } catch (error) {
        console.warn(`Failed to determine output type for block ${block.block.name}:`, error)
        this.blockOutputTypes.set(block.originalId, 'double') // Default
      }
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
   * Get input types for a block based on its connections
   */
  private getBlockInputTypes(block: FlattenedBlock): string[] {
    const types: string[] = []
    
    // Find all connections to this block, sorted by target port index
    const connections = this.model.connections
      .filter(c => c.targetBlockId === block.originalId)
      .sort((a, b) => a.targetPortIndex - b.targetPortIndex)
    
    for (const connection of connections) {
      const sourceType = this.blockOutputTypes.get(connection.sourceBlockId) || 'double'
      types.push(sourceType)
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
    
    // Build adjacency list
    const dependencies = new Map<string, string[]>()
    
    for (const block of this.model.blocks) {
      dependencies.set(block.originalId, [])
    }
    
    for (const connection of this.model.connections) {
      const deps = dependencies.get(connection.targetBlockId)
      if (deps && !deps.includes(connection.sourceBlockId)) {
        deps.push(connection.sourceBlockId)
      }
    }
    
    // Topological sort with cycle detection
    const visit = (blockId: string) => {
      if (visited.has(blockId)) return
      
      if (visiting.has(blockId)) {
        console.warn(`Cycle detected involving block ${blockId}`)
        return
      }
      
      visiting.add(blockId)
      
      const deps = dependencies.get(blockId) || []
      for (const dep of deps) {
        visit(dep)
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
}
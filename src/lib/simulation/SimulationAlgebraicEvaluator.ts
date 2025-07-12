// lib/simulation/SimulationAlgebraicEvaluator.ts

import { BlockState, SimulationState, Sheet } from '../simulationEngine'
import { BlockModuleFactory } from '../blocks/BlockModuleFactory'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { StateContainer } from './SimulationStateIntegrator'

/**
 * Algebraic evaluation inputs
 */
export interface AlgebraicInputs {
  /** Current block states */
  blockStates: Map<string, BlockState>
  
  /** Current simulation state */
  simulationState: SimulationState
  
  /** Sheet being evaluated */
  sheet: Sheet
}

/**
 * Algebraic evaluation outputs
 */
export interface AlgebraicOutputs {
  /** Updated block outputs (signals) */
  blockOutputs: Map<string, any[]>
  
  /** Execution order used */
  executionOrder: string[]
}

/**
 * Evaluates algebraic relationships in the simulation.
 * This class implements the algebraic layer of the two-layer architecture.
 */
export class SimulationAlgebraicEvaluator {
  private executionOrder: string[] = []
  private executionOrderCache = new Map<string, string[]>()
  
  /**
   * Evaluate all algebraic relationships for a sheet
   */
  evaluate(inputs: AlgebraicInputs): AlgebraicOutputs {
    const { blockStates, simulationState, sheet } = inputs
    const blockOutputs = new Map<string, any[]>()
    
    // Get or calculate execution order
    this.executionOrder = this.getExecutionOrder(sheet)
    
    // Process blocks in execution order
    for (const blockId of this.executionOrder) {
      const blockState = blockStates.get(blockId)
      if (!blockState) continue
      
      const block = this.findBlock(sheet, blockId)
      if (!block) continue
      
      // Skip sheet label blocks
      if (block.type === 'sheet_label_sink' || block.type === 'sheet_label_source') {
        continue
      }
      
      // Get inputs for this block
      const blockInputs = this.getBlockInputs(block, sheet, blockStates, simulationState)
      
      // Execute block using its module
      try {
        if (BlockModuleFactory.isSupported(block.type)) {
          const module = BlockModuleFactory.getBlockModule(block.type)
          
          // Update block state inputs
          //blockState.inputs = blockInputs
          
          // Execute the block's algebraic computation
          module.executeSimulation(blockState, blockInputs, simulationState)
          
          // Store outputs
          blockOutputs.set(blockId, [...blockState.outputs])
        } else if (block.type === 'subsystem') {
          // Handle subsystem blocks specially
          this.executeSubsystem(block, blockState, blockInputs, simulationState)
          blockOutputs.set(blockId, [...blockState.outputs])
        }
      } catch (error) {
        console.error(`Error executing block ${block.name}:`, error)
        blockState.outputs = [0] // Default output
        blockOutputs.set(blockId, [0])
      }
    }
    
    return {
      blockOutputs,
      executionOrder: this.executionOrder
    }
  }
  
  /**
   * Get execution order for a sheet (with caching)
   */
  private getExecutionOrder(sheet: Sheet): string[] {
    const cacheKey = this.getSheetCacheKey(sheet)
    
    if (this.executionOrderCache.has(cacheKey)) {
      return this.executionOrderCache.get(cacheKey)!
    }
    
    const order = this.calculateExecutionOrder(sheet)
    this.executionOrderCache.set(cacheKey, order)
    return order
  }
  
  /**
   * Calculate execution order using topological sort
   */
  private calculateExecutionOrder(sheet: Sheet): string[] {
    const visited = new Set<string>()
    const visiting = new Set<string>()
    const sorted: string[] = []
    
    // Build adjacency list
    const dependencies = new Map<string, Set<string>>()
    
    // Initialize with all blocks
    for (const block of sheet.blocks) {
      dependencies.set(block.id, new Set())
    }
    
    // Add dependencies based on connections
    for (const wire of sheet.connections) {
      const deps = dependencies.get(wire.targetBlockId)
      if (deps) {
        deps.add(wire.sourceBlockId)
      }
    }
    
    // Topological sort with cycle detection
    const visit = (blockId: string) => {
      if (visited.has(blockId)) return
      
      if (visiting.has(blockId)) {
        console.warn(`Algebraic loop detected involving block ${blockId}`)
        return
      }
      
      visiting.add(blockId)
      
      const deps = dependencies.get(blockId)
      if (deps) {
        for (const dep of deps) {
          visit(dep)
        }
      }
      
      visiting.delete(blockId)
      visited.add(blockId)
      sorted.push(blockId)
    }
    
    // Visit all blocks
    for (const block of sheet.blocks) {
      visit(block.id)
    }
    
    return sorted
  }
  
  /**
   * Get inputs for a block based on connections
   */
  private getBlockInputs(
    block: BlockData,
    sheet: Sheet,
    blockStates: Map<string, BlockState>,
    simulationState: SimulationState
  ): any[] {
    const inputs: any[] = []
    
    // Find connections to this block
    const inputConnections = sheet.connections
      .filter(wire => wire.targetBlockId === block.id)
      .sort((a, b) => a.targetPortIndex - b.targetPortIndex)
    
    for (const connection of inputConnections) {
      const sourceBlock = this.findBlock(sheet, connection.sourceBlockId)
      const sourceState = blockStates.get(connection.sourceBlockId)
      
      if (sourceBlock && sourceState) {
        const outputValue = sourceState.outputs[connection.sourcePortIndex] ?? 0
        inputs.push(outputValue)
      } else {
        inputs.push(0) // Default value
      }
    }
    
    return inputs
  }
  
  /**
   * Execute a subsystem block
   */
  private executeSubsystem(
    block: BlockData,
    blockState: BlockState,
    inputs: any[],
    simulationState: SimulationState
  ): void {
    // For subsystems, outputs are passed through from internal output port blocks
    // This is handled by the multi-sheet simulation engine
    // Here we just ensure the outputs array is properly sized
    
    const outputPortCount = block.parameters?.outputPorts?.length || 0
    if (blockState.outputs.length !== outputPortCount) {
      blockState.outputs = new Array(outputPortCount).fill(0)
    }
    
    // If subsystem has frozen outputs (from being disabled), use those
    if (blockState.frozenOutputs && blockState.frozenOutputs.length === outputPortCount) {
      blockState.outputs = [...blockState.frozenOutputs]
    }
  }
  
  /**
   * Find a block by ID in a sheet
   */
  private findBlock(sheet: Sheet, blockId: string): BlockData | undefined {
    return sheet.blocks.find(b => b.id === blockId)
  }
  
  /**
   * Generate cache key for a sheet
   */
  private getSheetCacheKey(sheet: Sheet): string {
    // Simple cache key based on block and connection count
    // In a real implementation, might want to include block IDs or a hash
    return `${sheet.id}_${sheet.blocks.length}_${sheet.connections.length}`
  }
  
  /**
   * Clear execution order cache (call when model structure changes)
   */
  clearCache(): void {
    this.executionOrderCache.clear()
  }

  /**
   * Evaluate algebraic relationships with temporary states
   * Used during integration for intermediate RK4 stages
   */
  evaluateWithStates(
    inputs: AlgebraicInputs,
    temporaryStates: StateContainer
  ): AlgebraicOutputs {
    const { blockStates, simulationState, sheet } = inputs
    const blockOutputs = new Map<string, any[]>()
    
    // Create temporary block states with updated internal states
    const tempBlockStates = new Map<string, BlockState>()
    
    // Clone existing block states
    for (const [blockId, state] of blockStates) {
      tempBlockStates.set(blockId, {
        ...state,
        internalState: state.internalState ? { ...state.internalState } : undefined
      })
    }
    
    // Apply temporary states
    for (const [blockId, tempState] of tempBlockStates) {
      const states = temporaryStates.getBlockStates(blockId)
      if (states && tempState.internalState) {
        // Update internal state with temporary values
        if (tempState.blockType === 'transfer_function') {
          tempState.internalState.states = [...states]
        }
      }
    }
    
    // Use existing evaluation logic with temporary states
    const modifiedInputs: AlgebraicInputs = {
      blockStates: tempBlockStates,
      simulationState,
      sheet
    }
    
    return this.evaluate(modifiedInputs)
  }
}
// lib/simulation/SimulationStateIntegrator.ts

import { BlockState, SimulationState, Sheet } from '../simulationEngine'
import { BlockModuleFactory } from '../blocks/BlockModuleFactory'
import { BlockData } from '@/components/BlockNode'
import { SimulationAlgebraicEvaluator } from './SimulationAlgebraicEvaluator'

/**
 * Container for managing block states during integration
 */
export interface StateContainer {
  /** Get states for a specific block */
  getBlockStates(blockId: string): number[] | undefined
  
  /** Set states for a specific block */
  setBlockStates(blockId: string, states: number[]): void
  
  /** Get all block states */
  getAllStates(): Map<string, number[]>
  
  /** Clone the container for intermediate calculations */
  clone(): StateContainer
}

/**
 * Implementation of StateContainer
 */
export class SimpleStateContainer implements StateContainer {
  private states: Map<string, number[]> = new Map()
  
  getBlockStates(blockId: string): number[] | undefined {
    return this.states.get(blockId)
  }
  
  setBlockStates(blockId: string, states: number[]): void {
    this.states.set(blockId, [...states]) // Clone array
  }
  
  getAllStates(): Map<string, number[]> {
    return new Map(this.states)
  }
  
  clone(): StateContainer {
    const clone = new SimpleStateContainer()
    for (const [blockId, blockStates] of this.states) {
      clone.setBlockStates(blockId, blockStates)
    }
    return clone
  }
}

/**
 * State integration inputs
 */
export interface IntegrationInputs {
  /** Current block states */
  blockStates: Map<string, BlockState>
  
  /** Current simulation state */
  simulationState: SimulationState
  
  /** Sheet being simulated */
  sheet: Sheet
  
  /** Time step for integration */
  timeStep: number
}

/**
 * Integration methods available
 */
export type IntegrationMethod = 'euler' | 'rk4'

/**
 * Handles state integration for the simulation.
 * This class implements the integration layer of the two-layer architecture.
 */
/**
 * Handles state integration for the simulation.
 * This class implements the integration layer of the two-layer architecture.
 */
export class SimulationStateIntegrator {
  private integrationMethod: IntegrationMethod
  private algebraicEvaluator?: SimulationAlgebraicEvaluator
  
  constructor(method: IntegrationMethod = 'rk4', algebraicEvaluator?: SimulationAlgebraicEvaluator) {
    this.integrationMethod = method
    this.algebraicEvaluator = algebraicEvaluator
  }
  
  /**
   * Integrate states for all stateful blocks
   */
  integrate(inputs: IntegrationInputs): void {
    const { blockStates, simulationState, sheet, timeStep } = inputs
    
    // Get all stateful blocks
    const statefulBlocks = this.getStatefulBlocks(sheet)
    
    if (statefulBlocks.length === 0) {
      return // No integration needed
    }
    
    // Create state container
    const stateContainer = this.createStateContainer(statefulBlocks, blockStates)
    
    // Perform integration based on method
    if (this.integrationMethod === 'euler') {
      this.integrateEuler(inputs, statefulBlocks, stateContainer)
    } else if (this.integrationMethod === 'rk4') {
      this.integrateRK4(inputs, statefulBlocks, stateContainer)
    }
    
    // Update block states with integrated values
    this.updateBlockStates(statefulBlocks, blockStates, stateContainer)
  }

  /**
   * Integrate with error handling and rollback
   */
  integrateWithRollback(inputs: IntegrationInputs): boolean {
    const { blockStates } = inputs
    
    // Save current states
    const savedStates = this.saveCurrentStates(blockStates)
    
    try {
      // Attempt integration
      this.integrate(inputs)
      
      // Validate results
      if (this.validateStates(blockStates)) {
        return true
      } else {
        // Rollback on validation failure
        this.restoreStates(blockStates, savedStates)
        return false
      }
    } catch (error) {
      // Rollback on error
      console.error('Integration failed:', error)
      this.restoreStates(blockStates, savedStates)
      return false
    }
  }
  
  /**
   * Save current states for rollback
   */
  private saveCurrentStates(blockStates: Map<string, BlockState>): Map<string, any> {
    const saved = new Map<string, any>()
    
    for (const [blockId, state] of blockStates) {
      if (state.internalState) {
        saved.set(blockId, JSON.parse(JSON.stringify(state.internalState)))
      }
    }
    
    return saved
  }
  
  /**
   * Restore states from saved
   */
  private restoreStates(
    blockStates: Map<string, BlockState>,
    savedStates: Map<string, any>
  ): void {
    for (const [blockId, savedState] of savedStates) {
      const blockState = blockStates.get(blockId)
      if (blockState) {
        blockState.internalState = savedState
      }
    }
  }
  
  /**
   * Validate states for NaN/Inf
   */
  private validateStates(blockStates: Map<string, BlockState>): boolean {
    for (const [blockId, state] of blockStates) {
      if (state.internalState?.states) {
        for (const value of state.internalState.states) {
          if (!isFinite(value)) {
            console.error(`Invalid state detected in block ${blockId}: ${value}`)
            return false
          }
        }
      }
    }
    return true
  }
  
  /**
   * Create state container from current block states
   */
  private createStateContainer(
    statefulBlocks: BlockData[],
    blockStates: Map<string, BlockState>
  ): StateContainer {
    const container = new SimpleStateContainer()
    
    for (const block of statefulBlocks) {
      const blockState = blockStates.get(block.id)
      if (blockState?.internalState) {
        // Extract states based on block type
        if (block.type === 'transfer_function') {
          const states = blockState.internalState.states || []
          if (states.length > 0) {
            container.setBlockStates(block.id, states)
          }
          
          // Handle vector states
          if (blockState.internalState.vectorStates) {
            for (let i = 0; i < blockState.internalState.vectorStates.length; i++) {
              container.setBlockStates(`${block.id}_vec_${i}`, blockState.internalState.vectorStates[i])
            }
          }
          
          // Handle matrix states
          if (blockState.internalState.matrixStates) {
            const matrix = blockState.internalState.matrixStates
            for (let i = 0; i < matrix.length; i++) {
              for (let j = 0; j < matrix[i].length; j++) {
                container.setBlockStates(`${block.id}_mat_${i}_${j}`, matrix[i][j])
              }
            }
          }
        }
      }
    }
    
    return container
  }
  
  /**
   * Euler integration implementation
   */
  private integrateEuler(
    inputs: IntegrationInputs,
    statefulBlocks: BlockData[],
    stateContainer: StateContainer
  ): void {
    const { blockStates, simulationState, sheet, timeStep } = inputs
    
    // Compute derivatives for all blocks
    const derivatives = new Map<string, number[]>()
    
    for (const block of statefulBlocks) {
      const blockState = blockStates.get(block.id)
      if (!blockState) continue
      
      // Get block inputs
      const blockInputs = this.getBlockInputs(block, sheet, blockStates)
      
      // Get block module
      const module = BlockModuleFactory.getBlockModule(block.type)
      if (module.computeDerivatives) {
        const blockDerivatives = module.computeDerivatives(
          blockState,
          blockInputs,
          simulationState.time
        )
        
        if (blockDerivatives) {
          derivatives.set(block.id, blockDerivatives)
        }
      }
    }
    
    // Update states using Euler method: x[n+1] = x[n] + dt * dx/dt
    for (const [blockId, derivs] of derivatives) {
      const currentStates = stateContainer.getBlockStates(blockId)
      if (currentStates) {
        const newStates = currentStates.map((state, i) => 
          state + timeStep * (derivs[i] || 0)
        )
        stateContainer.setBlockStates(blockId, newStates)
      }
    }
  }
  
  /**
   * Get inputs for a block based on connections
   */
  private getBlockInputs(
    block: BlockData,
    sheet: Sheet,
    blockStates: Map<string, BlockState>
  ): any[] {
    const inputs: any[] = []
    
    // Find connections to this block
    const inputConnections = sheet.connections
      .filter(wire => wire.targetBlockId === block.id)
      .sort((a, b) => a.targetPortIndex - b.targetPortIndex)
    
    for (const connection of inputConnections) {
      const sourceState = blockStates.get(connection.sourceBlockId)
      if (sourceState) {
        const outputValue = sourceState.outputs[connection.sourcePortIndex] ?? 0
        inputs.push(outputValue)
      } else {
        inputs.push(0)
      }
    }
    
    return inputs
  }
  
  /**
   * Update block states from state container
   */
  private updateBlockStates(
    statefulBlocks: BlockData[],
    blockStates: Map<string, BlockState>,
    stateContainer: StateContainer
  ): void {
    for (const block of statefulBlocks) {
      const blockState = blockStates.get(block.id)
      if (!blockState?.internalState) continue
      
      if (block.type === 'transfer_function') {
        // Update scalar states
        const states = stateContainer.getBlockStates(block.id)
        if (states) {
          blockState.internalState.states = [...states]
        }
        
        // Update vector states
        if (blockState.internalState.vectorStates) {
          for (let i = 0; i < blockState.internalState.vectorStates.length; i++) {
            const vecStates = stateContainer.getBlockStates(`${block.id}_vec_${i}`)
            if (vecStates) {
              blockState.internalState.vectorStates[i] = [...vecStates]
            }
          }
        }
        
        // Update matrix states
        if (blockState.internalState.matrixStates) {
          const matrix = blockState.internalState.matrixStates
          for (let i = 0; i < matrix.length; i++) {
            for (let j = 0; j < matrix[i].length; j++) {
              const matStates = stateContainer.getBlockStates(`${block.id}_mat_${i}_${j}`)
              if (matStates) {
                matrix[i][j] = [...matStates]
              }
            }
          }
        }
      }
    }
  }
  
  /**
   * Check if a block has state
   */
  private hasState(block: BlockData): boolean {
    if (BlockModuleFactory.isSupported(block.type)) {
      const module = BlockModuleFactory.getBlockModule(block.type)
      return module.requiresState ? module.requiresState(block) : false
    }
    return false
  }
  
  /**
   * Get all stateful blocks in a sheet
   */
  private getStatefulBlocks(sheet: Sheet): BlockData[] {
    return sheet.blocks.filter(block => this.hasState(block))
  }
  
  /**
   * Compute derivatives for all stateful blocks
   */
  private computeAllDerivatives(
    statefulBlocks: BlockData[],
    blockStates: Map<string, BlockState>,
    sheet: Sheet,
    time: number
  ): Map<string, number[]> {
    const derivatives = new Map<string, number[]>()
    
    for (const block of statefulBlocks) {
      const blockState = blockStates.get(block.id)
      if (!blockState) continue
      
      const blockInputs = this.getBlockInputs(block, sheet, blockStates)
      const module = BlockModuleFactory.getBlockModule(block.type)
      
      if (module.computeDerivatives) {
        const blockDerivatives = module.computeDerivatives(
          blockState,
          blockInputs,
          time
        )
        
        if (blockDerivatives) {
          derivatives.set(block.id, blockDerivatives)
        }
      }
    }
    
    return derivatives
  }
  
  /**
   * Apply state update for RK4 intermediate steps
   */
  private applyStateUpdate(
    container: StateContainer,
    derivatives: Map<string, number[]>,
    stepSize: number,
    originalStates: StateContainer
  ): void {
    for (const [blockId, derivs] of derivatives) {
      const original = originalStates.getBlockStates(blockId)
      if (original) {
        const updated = original.map((state, i) => 
          state + stepSize * (derivs[i] || 0)
        )
        container.setBlockStates(blockId, updated)
      }
    }
  }
  
  /**
   * Apply final RK4 update
   */
  private applyRK4Update(
    container: StateContainer,
    originalStates: StateContainer,
    k1: Map<string, number[]>,
    k2: Map<string, number[]>,
    k3: Map<string, number[]>,
    k4: Map<string, number[]>,
    h: number
  ): void {
    const allBlockIds = new Set([...k1.keys()])
    
    for (const blockId of allBlockIds) {
      const original = originalStates.getBlockStates(blockId)
      const d1 = k1.get(blockId) || []
      const d2 = k2.get(blockId) || []
      const d3 = k3.get(blockId) || []
      const d4 = k4.get(blockId) || []
      
      if (original) {
        const updated = original.map((state, i) => {
          const k1_i = d1[i] || 0
          const k2_i = d2[i] || 0
          const k3_i = d3[i] || 0
          const k4_i = d4[i] || 0
          
          return state + (h / 6) * (k1_i + 2 * k2_i + 2 * k3_i + k4_i)
        })
        container.setBlockStates(blockId, updated)
      }
    }
  }
  
  /**
   * Update block states from container (for intermediate RK4 steps)
   */
  private updateBlockStatesFromContainer(
    statefulBlocks: BlockData[],
    blockStates: Map<string, BlockState>,
    stateContainer: StateContainer
  ): void {
    // This is similar to updateBlockStates but used during RK4 intermediate steps
    this.updateBlockStates(statefulBlocks, blockStates, stateContainer)
  }

  // lib/simulation/SimulationStateIntegrator.ts - Add derivative validation

  /**
   * Validate derivatives for numerical issues
   */
  private validateDerivatives(derivatives: Map<string, number[]>): {
    valid: boolean,
    errors: string[]
  } {
    const errors: string[] = []
    
    for (const [blockId, derivs] of derivatives) {
      for (let i = 0; i < derivs.length; i++) {
        const value = derivs[i]
        
        if (!isFinite(value)) {
          if (isNaN(value)) {
            errors.push(`NaN derivative in block ${blockId}[${i}]`)
          } else if (value === Infinity) {
            errors.push(`Infinite derivative in block ${blockId}[${i}]`)
          } else if (value === -Infinity) {
            errors.push(`Negative infinite derivative in block ${blockId}[${i}]`)
          }
        }
        
        // Check for extremely large derivatives that might cause instability
        if (Math.abs(value) > 1e10) {
          errors.push(`Very large derivative (${value}) in block ${blockId}[${i}] - possible instability`)
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    }
  }
  
  /**
   * Compute all derivatives with validation
   */
  private computeAllDerivativesWithValidation(
    statefulBlocks: BlockData[],
    blockStates: Map<string, BlockState>,
    sheet: Sheet,
    time: number
  ): Map<string, number[]> | null {
    const derivatives = this.computeAllDerivatives(statefulBlocks, blockStates, sheet, time)
    
    const validation = this.validateDerivatives(derivatives)
    if (!validation.valid) {
      console.error('Derivative validation failed:', validation.errors)
      return null
    }
    
    return derivatives
  }
  
  /**
   * Updated integrateRK4 with validation
   */
  private integrateRK4(
      inputs: IntegrationInputs,
      statefulBlocks: BlockData[],
      stateContainer: StateContainer
    ): void {
      const { blockStates, simulationState, sheet, timeStep } = inputs
      const h = timeStep
      
      // Store original states
      const originalStates = stateContainer.clone()
      
      // k1: derivatives at current state
      const k1 = this.computeAllDerivativesWithValidation(
        statefulBlocks,
        blockStates,
        sheet,
        simulationState.time
      )
      
      if (!k1) {
        console.error('RK4 failed at k1 computation')
        return
      }
      
      // k2: derivatives at state + h/2 * k1
      this.applyStateUpdate(stateContainer, k1, h / 2, originalStates)
      this.updateBlockStatesFromContainer(statefulBlocks, blockStates, stateContainer)
      
      // Re-evaluate algebraic relationships with updated states
      if (this.algebraicEvaluator) {
        const algebraicResult = this.algebraicEvaluator.evaluateWithStates(
          {
            blockStates,
            simulationState,
            sheet
          },
          stateContainer
        )
        
        // Update signal values from algebraic outputs
        for (const [blockId, outputs] of algebraicResult.blockOutputs) {
          const blockState = blockStates.get(blockId)
          if (blockState) {
            blockState.outputs = outputs
          }
        }
      }
      
      const k2 = this.computeAllDerivativesWithValidation(
        statefulBlocks,
        blockStates,
        sheet,
        simulationState.time + h / 2
      )
      
      if (!k2) {
        console.error('RK4 failed at k2 computation')
        this.updateBlockStatesFromContainer(statefulBlocks, blockStates, originalStates)
        return
      }
      
      // k3: derivatives at state + h/2 * k2
      this.applyStateUpdate(stateContainer, k2, h / 2, originalStates)
      this.updateBlockStatesFromContainer(statefulBlocks, blockStates, stateContainer)
      
      // Re-evaluate algebraic relationships
      if (this.algebraicEvaluator) {
        const algebraicResult = this.algebraicEvaluator.evaluateWithStates(
          {
            blockStates,
            simulationState,
            sheet
          },
          stateContainer
        )
        
        // Update outputs
        for (const [blockId, outputs] of algebraicResult.blockOutputs) {
          const blockState = blockStates.get(blockId)
          if (blockState) {
            blockState.outputs = outputs
          }
        }
      }
      
      const k3 = this.computeAllDerivativesWithValidation(
        statefulBlocks,
        blockStates,
        sheet,
        simulationState.time + h / 2
      )
      
      if (!k3) {
        console.error('RK4 failed at k3 computation')
        this.updateBlockStatesFromContainer(statefulBlocks, blockStates, originalStates)
        return
      }
      
      // k4: derivatives at state + h * k3
      this.applyStateUpdate(stateContainer, k3, h, originalStates)
      this.updateBlockStatesFromContainer(statefulBlocks, blockStates, stateContainer)
      
      // Re-evaluate algebraic relationships
      if (this.algebraicEvaluator) {
        const algebraicResult = this.algebraicEvaluator.evaluateWithStates(
          {
            blockStates,
            simulationState,
            sheet
          },
          stateContainer
        )
        
        // Update outputs
        for (const [blockId, outputs] of algebraicResult.blockOutputs) {
          const blockState = blockStates.get(blockId)
          if (blockState) {
            blockState.outputs = outputs
          }
        }
      }
      
      const k4 = this.computeAllDerivativesWithValidation(
        statefulBlocks,
        blockStates,
        sheet,
        simulationState.time + h
      )
      
      if (!k4) {
        console.error('RK4 failed at k4 computation')
        this.updateBlockStatesFromContainer(statefulBlocks, blockStates, originalStates)
        return
      }
      
      // Final update: x[n+1] = x[n] + h/6 * (k1 + 2*k2 + 2*k3 + k4)
      this.applyRK4Update(stateContainer, originalStates, k1, k2, k3, k4, h)
      
      // Validate final states
      const finalValidation = this.validateStateContainer(stateContainer)
      if (!finalValidation.valid) {
        console.error('RK4 produced invalid states:', finalValidation.errors)
        this.updateBlockStatesFromContainer(statefulBlocks, blockStates, originalStates)
      }
    }
    
    /**
     * Validate state container
     */
    private validateStateContainer(container: StateContainer): {
      valid: boolean,
      errors: string[]
    } {
      const errors: string[] = []
      
      for (const [blockId, states] of container.getAllStates()) {
        for (let i = 0; i < states.length; i++) {
          const value = states[i]
          
          if (!isFinite(value)) {
            if (isNaN(value)) {
              errors.push(`NaN state in block ${blockId}[${i}]`)
            } else if (value === Infinity) {
              errors.push(`Infinite state in block ${blockId}[${i}]`)
            } else if (value === -Infinity) {
              errors.push(`Negative infinite state in block ${blockId}[${i}]`)
            }
          }
        }
      }
      
      return {
        valid: errors.length === 0,
        errors
      }
    }
    
  }

/**
 * Context for multi-stage integration methods
 * Holds intermediate states and derivatives for methods like RK4
 */
export interface IntegrationContext {
  /** Original states at start of integration step */
  originalStates: StateContainer
  
  /** Intermediate derivatives (k1, k2, k3, k4 for RK4) */
  derivatives: Map<string, number[]>[]
  
  /** Current stage (0-based) */
  stage: number
  
  /** Time step size */
  stepSize: number
  
  /** Base time for this integration step */
  baseTime: number
}

/**
 * Create a new integration context
 */
export function createIntegrationContext(
  originalStates: StateContainer,
  stepSize: number,
  baseTime: number,
  numStages: number
): IntegrationContext {
  return {
    originalStates: originalStates.clone(),
    derivatives: new Array(numStages).fill(null).map(() => new Map()),
    stage: 0,
    stepSize,
    baseTime
  }
}
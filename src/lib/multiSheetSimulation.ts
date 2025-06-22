// lib/multiSheetSimulation.ts - Updated with enable state support

import { SimulationEngine, SimulationConfig, SimulationResults, Sheet } from './simulationEngine'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'


export class MultiSheetSimulationEngine {
  private sheets: Sheet[]
  private config: SimulationConfig
  private blockEngines: Map<string, SimulationEngine> = new Map() 
  private executionOrder: { sheetId: string, blockId: string }[] = []
  private blockToSheet: Map<string, string> = new Map()
  // New: Track subsystem hierarchy globally
  private subsystemHierarchy: Map<string, string | null> = new Map() // subsystemId -> parent subsystemId
  private blockToSubsystem: Map<string, string | null> = new Map() // blockId -> containing subsystemId
  
/**
   * Compute initial outputs for all subsystem blocks
   */
  private computeInitialSubsystemOutputs() {
    const allSheets = this.getAllSheets(this.sheets)
    
    // Process subsystems in reverse order (children before parents)
    const subsystemBlocks: { block: BlockData, sheetId: string }[] = []
    for (const sheet of allSheets) {
      for (const block of sheet.blocks) {
        if (block.type === 'subsystem') {
          subsystemBlocks.push({ block, sheetId: sheet.id })
        }
      }
    }
    
    // Sort by depth (deeper subsystems first)
    subsystemBlocks.sort((a, b) => {
      const depthA = this.getSubsystemDepth(a.block.id)
      const depthB = this.getSubsystemDepth(b.block.id)
      return depthB - depthA
    })
    
    // Compute initial outputs for each subsystem
    for (const { block, sheetId } of subsystemBlocks) {
      const engine = this.blockEngines.get(sheetId)
      if (!engine) continue
      
      const state = engine.getState()
      let subsystemBlockState = state.blockStates.get(block.id)
      
      if (!subsystemBlockState) {
        // Initialize subsystem block state
        const outputCount = block.parameters?.outputPorts?.length || 1
        subsystemBlockState = {
          blockId: block.id,
          blockType: 'subsystem',
          outputs: new Array(outputCount).fill(0),
          frozenOutputs: new Array(outputCount).fill(0)
        }
        state.blockStates.set(block.id, subsystemBlockState)
      }
      
      // Find output values from the subsystem's internal output ports
      if (block.parameters?.sheets) {
        for (let portIndex = 0; portIndex < (block.parameters.outputPorts?.length || 0); portIndex++) {
          const outputPortName = block.parameters.outputPorts[portIndex]
          
          // Search for the output port block in subsystem sheets
          for (const subSheet of block.parameters.sheets) {
            const outputPortBlock = subSheet.blocks.find((b:any) => 
              b.type === 'output_port' && 
              b.parameters?.portName === outputPortName
            )
            
            if (outputPortBlock) {
              // Get the engine for this sheet
              const subSheetEngine = this.blockEngines.get(subSheet.id)
              if (subSheetEngine) {
                const outputState = subSheetEngine.getState().blockStates.get(outputPortBlock.id)
                if (outputState && outputState.internalState?.currentValue !== undefined) {
                  // Set this as the subsystem's initial output
                  subsystemBlockState.outputs[portIndex] = outputState.internalState.currentValue
                  subsystemBlockState.frozenOutputs![portIndex] = outputState.internalState.currentValue
                }
              }
              break
            }
          }
        }
      }
      
      // Store initial outputs in signal values
      for (let i = 0; i < subsystemBlockState.outputs.length; i++) {
        state.signalValues.set(
          `${block.id}_output_${i}`, 
          subsystemBlockState.outputs[i]
        )
      }
    }
  }
  
  /**
   * Get the depth of a subsystem in the hierarchy
   */
  private getSubsystemDepth(subsystemId: string): number {
    let depth = 0
    let currentId: string | null = subsystemId
    
    while (currentId) {
      const parentId = this.subsystemHierarchy.get(currentId)
      if (parentId) {
        depth++
        currentId = parentId
      } else {
        break
      }
    }
    
    return depth
  }

  // Update constructor to compute initial outputs
  constructor(sheets: Sheet[], config: SimulationConfig) {
    this.sheets = sheets
    this.config = config
    
    // Build subsystem hierarchy first
    this.buildSubsystemHierarchy()
    
    // Create engines for all sheets (including nested)
    const allSheets = this.getAllSheets(sheets)
    for (const sheet of allSheets) {
      const engine = new SimulationEngine(
        sheet.blocks,
        sheet.connections,
        config,
        undefined,
        allSheets
      )
      this.blockEngines.set(sheet.id, engine)
      
      // Track block locations
      for (const block of sheet.blocks) {
        this.blockToSheet.set(block.id, sheet.id)
        
        // Set parent subsystem for each block in the engine
        const parentSubsystem = this.blockToSubsystem.get(block.id) ?? null
        engine.setParentSubsystem(block.id, parentSubsystem)
      }
    }
    
    // Build global execution order
    this.buildGlobalExecutionOrder()
    
    // Compute initial outputs for all subsystems
    this.computeInitialSubsystemOutputs()
  }
  
  /**
   * Build the subsystem hierarchy and block-to-subsystem mapping
   */
  private buildSubsystemHierarchy() {
    const allSheets = this.getAllSheets(this.sheets)
    
    // First, map all subsystems to their parents
    for (const sheet of allSheets) {
      for (const block of sheet.blocks) {
        if (block.type === 'subsystem') {
          // Find if this subsystem is inside another subsystem
          const parentSubsystem = this.findContainingSubsystem(block.id, allSheets)
          this.subsystemHierarchy.set(
            block.id, 
            parentSubsystem ? parentSubsystem.block.id : null
          )
        }
      }
    }
    
    // Then, map all blocks to their containing subsystems
    for (const sheet of allSheets) {
      for (const block of sheet.blocks) {
        const containingSubsystem = this.findContainingSubsystem(block.id, allSheets)
        this.blockToSubsystem.set(
          block.id,
          containingSubsystem ? containingSubsystem.block.id : null
        )
      }
    }
  }
  
  /**
   * Check if a subsystem is enabled, considering parent hierarchy
   */
  private updateAllSubsystemEnableStates() {
    const allSheets = this.getAllSheets(this.sheets)
    
    // Step 1: Evaluate all enable signals first
    const enableSignals = new Map<string, boolean>()
    
    for (const sheet of allSheets) {
      for (const block of sheet.blocks) {
        if (block.type === 'subsystem') {
          // Default to enabled if no enable input
          if (!block.parameters?.showEnableInput) {
            enableSignals.set(block.id, true)
            continue
          }
          
          // Find enable wire
          const enableWire = sheet.connections.find(w => 
            w.targetBlockId === block.id && w.targetPortIndex === -1
          )
          
          if (enableWire) {
            const engine = this.blockEngines.get(sheet.id)
            if (engine) {
              const state = engine.getState()
              const signalKey = `${enableWire.sourceBlockId}_output_${enableWire.sourcePortIndex}`
              const signalValue = state.signalValues.get(signalKey)
              
              // Convert to boolean
              let enableSignal = true
              if (typeof signalValue === 'boolean') {
                enableSignal = signalValue
              } else if (typeof signalValue === 'number') {
                enableSignal = signalValue !== 0
              } else if (Array.isArray(signalValue)) {
                // For arrays, check if first element is truthy
                enableSignal = signalValue.length > 0 && 
                  signalValue[0] !== 0 && 
                  signalValue[0] !== false
              }
              
              enableSignals.set(block.id, enableSignal)
            }
          } else {
            // No connection to enable port, default to enabled
            enableSignals.set(block.id, true)
          }
        }
      }
    }
    
    // Step 2: Build parent-child relationships and compute effective enable states
    // Process in order from root to leaves to ensure parent states are computed first
    const processedSubsystems = new Set<string>()
    const effectiveEnableStates = new Map<string, boolean>()
    
    // Helper function to compute effective enable state
    const computeEffectiveEnableState = (subsystemId: string): boolean => {
      // Check if already computed
      if (effectiveEnableStates.has(subsystemId)) {
        return effectiveEnableStates.get(subsystemId)!
      }
      
      // Get signal state
      const signalEnabled = enableSignals.get(subsystemId) ?? true
      
      // Get parent state
      const parentId = this.subsystemHierarchy.get(subsystemId)
      let parentEnabled = true
      
      if (parentId) {
        // Recursively compute parent state
        parentEnabled = computeEffectiveEnableState(parentId)
      }
      
      // Effective state is AND of signal and parent states
      const effectiveEnabled = signalEnabled && parentEnabled
      effectiveEnableStates.set(subsystemId, effectiveEnabled)
      
      return effectiveEnabled
    }
    
    // Step 3: Update all subsystem states
    for (const sheet of allSheets) {
      for (const block of sheet.blocks) {
        if (block.type === 'subsystem') {
          const engine = this.blockEngines.get(sheet.id)
          if (!engine) continue
          
          const state = engine.getState()
          const previousState = state.subsystemEnableStates.get(block.id) ?? true
          
          // Compute effective enable state
          const newState = computeEffectiveEnableState(block.id)
          
          // Update engine state
          state.subsystemEnableStates.set(block.id, newState)
          state.subsystemEnableSignals.set(block.id, enableSignals.get(block.id) ?? true)
          
          // Handle state transitions
          if (previousState && !newState) {
            // Transitioning to disabled
            console.log(`Subsystem ${block.name} (${block.id}) transitioning to disabled`)
            this.handleSubsystemDisabled(block.id)
          } else if (!previousState && newState) {
            // Transitioning to enabled
            console.log(`Subsystem ${block.name} (${block.id}) transitioning to enabled`)
            this.handleSubsystemEnabled(block.id)
          }
        }
      }
    }
    
    // Step 4: Update enable states in all engines for cross-sheet access
    this.propagateEnableStatesToEngines(effectiveEnableStates)
  }
  
  /**
   * Handle subsystem transitioning to disabled state
   */
  private handleSubsystemDisabled(subsystemId: string) {
    // Freeze outputs for the subsystem block itself
    const sheetId = this.blockToSheet.get(subsystemId)
    if (sheetId) {
      const engine = this.blockEngines.get(sheetId)
      if (engine) {
        const state = engine.getState()
        const blockState = state.blockStates.get(subsystemId)
        if (blockState) {
          blockState.frozenOutputs = [...blockState.outputs]
        }
      }
    }
    
    // Freeze all blocks within this subsystem and its children
    this.freezeSubsystemAndChildren(subsystemId)
  }
  
  /**
   * Handle subsystem transitioning to enabled state
   */
  private handleSubsystemEnabled(subsystemId: string) {
    // Record enable time
    const sheetId = this.blockToSheet.get(subsystemId)
    if (sheetId) {
      const engine = this.blockEngines.get(sheetId)
      if (engine) {
        const state = engine.getState()
        const blockState = state.blockStates.get(subsystemId)
        if (blockState) {
          blockState.lastEnabledTime = state.time
        }
      }
    }
    
    // Note: We don't need to unfreeze blocks - they'll compute new values on next execution
  }
  
  /**
   * Freeze all blocks within a subsystem and its child subsystems
   */
  private freezeSubsystemAndChildren(subsystemId: string) {
    const blocksToFreeze = new Set<string>()
    
    // Find all blocks in this subsystem
    for (const [blockId, containingSubsystem] of this.blockToSubsystem) {
      if (containingSubsystem === subsystemId) {
        blocksToFreeze.add(blockId)
      }
    }
    
    // Find all child subsystems
    const childSubsystems = new Set<string>()
    for (const [childId, parentId] of this.subsystemHierarchy) {
      if (parentId === subsystemId) {
        childSubsystems.add(childId)
      }
    }
    
    // Recursively freeze child subsystems
    for (const childId of childSubsystems) {
      this.freezeSubsystemAndChildren(childId)
    }
    
    // Freeze all identified blocks
    for (const blockId of blocksToFreeze) {
      const sheetId = this.blockToSheet.get(blockId)
      if (sheetId) {
        const engine = this.blockEngines.get(sheetId)
        if (engine) {
          const state = engine.getState()
          const blockState = state.blockStates.get(blockId)
          if (blockState) {
            blockState.frozenOutputs = [...blockState.outputs]
          }
        }
      }
    }
  }
  
  /**
   * Propagate enable states to all engines for consistent access
   */
  private propagateEnableStatesToEngines(effectiveStates: Map<string, boolean>) {
    // Update each engine with the global enable states
    for (const [sheetId, engine] of this.blockEngines) {
      const state = engine.getState()
      
      // Update subsystem enable states in this engine
      for (const [subsystemId, enabled] of effectiveStates) {
        // Check if this subsystem's state is relevant to this engine
        const subsystemSheetId = this.blockToSheet.get(subsystemId)
        if (subsystemSheetId === sheetId) {
          state.subsystemEnableStates.set(subsystemId, enabled)
        }
      }
    }
  }
  
  /**
   * Enhanced isSubsystemEnabled to use computed effective states during simulation
   */
  private isSubsystemEnabled(subsystemId: string): boolean {
    // During simulation, check the computed enable state
    const sheetId = this.blockToSheet.get(subsystemId)
    if (!sheetId) return true
    
    const engine = this.blockEngines.get(sheetId)
    if (!engine) return true
    
    const state = engine.getState()
    return state.subsystemEnableStates.get(subsystemId) ?? true
  }
  
  /**
   * Check if a block should execute based on its containing subsystem's enable state
   */
  private shouldExecuteBlock(blockId: string): boolean {
    const containingSubsystem = this.blockToSubsystem.get(blockId)
    if (!containingSubsystem) {
      return true // Root level blocks always execute
    }
    
    return this.isSubsystemEnabled(containingSubsystem)
  }
  
  
  /**
   * Freeze outputs for all blocks within a subsystem
   */
  private freezeSubsystemBlocks(subsystemId: string) {
    const allSheets = this.getAllSheets(this.sheets)
    
    // Find all blocks that belong to this subsystem
    for (const [blockId, containingSubsystem] of this.blockToSubsystem) {
      if (containingSubsystem === subsystemId) {
        const sheetId = this.blockToSheet.get(blockId)
        if (sheetId) {
          const engine = this.blockEngines.get(sheetId)
          if (engine) {
            const state = engine.getState()
            const blockState = state.blockStates.get(blockId)
            if (blockState) {
              // Freeze current outputs
              blockState.frozenOutputs = [...blockState.outputs]
            }
          }
        }
      }
    }
  }
  
  private buildGlobalExecutionOrder() {
    // Build a global dependency graph across all sheets
    const dependencies = new Map<string, Set<string>>()
    const allSheets = this.getAllSheets(this.sheets)
    
    // First pass: collect all dependencies from wires
    for (const sheet of allSheets) {
      for (const wire of sheet.connections) {
        // Skip enable connections in dependency graph
        if (wire.targetPortIndex === -1) continue
        
        if (!dependencies.has(wire.targetBlockId)) {
          dependencies.set(wire.targetBlockId, new Set())
        }
        dependencies.get(wire.targetBlockId)!.add(wire.sourceBlockId)
      }
      
      // Handle subsystem connections
      for (const block of sheet.blocks) {
        if (block.type === 'subsystem' && block.parameters?.sheets) {
          this.mapSubsystemConnections(block, sheet, dependencies)
        }
      }
    }
    
    // Second pass: add sheet label dependencies
    // Sheet label sources depend on their corresponding sinks
    const sheetLabelSinks = new Map<string, { blockId: string, scope: string }>()
    const sheetLabelSources = new Map<string, { blockId: string, scope: string }>()
    
    // Collect all sheet labels with their scopes
    for (const sheet of allSheets) {
      // Determine the scope (which subsystem this sheet belongs to)
      const subsystemBlock = this.findContainingSubsystem(sheet.blocks[0]?.id || '', allSheets)
      const scope = subsystemBlock ? subsystemBlock.block.id : 'root'
      
      for (const block of sheet.blocks) {
        if (block.type === 'sheet_label_sink' && block.parameters?.signalName) {
          const key = `${scope}:${block.parameters.signalName}`
          sheetLabelSinks.set(key, { blockId: block.id, scope })
        } else if (block.type === 'sheet_label_source' && block.parameters?.signalName) {
          const key = `${scope}:${block.parameters.signalName}`
          sheetLabelSources.set(key, { blockId: block.id, scope })
        }
      }
    }
    
    // Add dependencies from sources to sinks
    for (const [key, source] of sheetLabelSources) {
      const sink = sheetLabelSinks.get(key)
      if (sink) {
        if (!dependencies.has(source.blockId)) {
          dependencies.set(source.blockId, new Set())
        }
        dependencies.get(source.blockId)!.add(sink.blockId)
      }
    }
    
    // Topological sort
    const visited = new Set<string>()
    const tempMark = new Set<string>()
    const order: { sheetId: string, blockId: string }[] = []
    
    const visit = (blockId: string) => {
      if (tempMark.has(blockId)) {
        console.warn('Cycle detected at block:', blockId)
        return
      }
      if (visited.has(blockId)) {
        return
      }
      
      tempMark.add(blockId)
      
      const deps = dependencies.get(blockId) || new Set()
      for (const dep of deps) {
        visit(dep)
      }
      
      tempMark.delete(blockId)
      visited.add(blockId)
      
      const sheetId = this.blockToSheet.get(blockId)
      if (sheetId) {
        order.push({ sheetId, blockId })
      }
    }
    
    // Visit all blocks
    for (const sheet of allSheets) {
      for (const block of sheet.blocks) {
        if (!visited.has(block.id)) {
          visit(block.id)
        }
      }
    }
    
    this.executionOrder = order
  }

  /**
   * Get the simulation engine for a specific sheet
   */
  getSheetEngine(sheetId: string): SimulationEngine | undefined {
    return this.blockEngines.get(sheetId)
  }

  /**
   * Get output port values from a specific sheet or all sheets
   * @param sheetId - Optional sheet ID. If not provided, returns values from all sheets
   * Returns a map of port names to their current values
   */
  getOutputPortValues(sheetId?: string): Map<string, number | number[] | number[][] | boolean | boolean[]> {
    const outputValues = new Map<string, number | number[] | number[][] | boolean | boolean[]>()
    
    if (sheetId) {
      // Get values from specific sheet only
      const engine = this.blockEngines.get(sheetId)
      if (engine) {
        return engine.getOutputPortValues()
      }
      return outputValues
    }
    
    // Get values from all sheets
    for (const [engineSheetId, engine] of this.blockEngines) {
      const engineOutputs = engine.getOutputPortValues()
      
      // Merge into the main map
      for (const [portName, value] of engineOutputs) {
        outputValues.set(portName, value)
      }
    }
    
    return outputValues
  }
  
  run(): Map<string, SimulationResults> {
    const results = new Map<string, SimulationResults>()
    const timePoints: number[] = []
    const sheetSignalData = new Map<string, Map<string, any[]>>()
    
    // Initialize signal data collection
    const allSheets = this.getAllSheets(this.sheets)
    for (const sheet of allSheets) {
      const signalData = new Map<string, any[]>()
      for (const block of sheet.blocks) {
        if (block.type === 'signal_display' || block.type === 'signal_logger') {
          signalData.set(block.id, [])
        }
      }
      sheetSignalData.set(sheet.id, signalData)
    }
    
    // Main simulation loop
    let time = 0
    while (time < this.config.duration) {
      timePoints.push(time)
      
      // Execute blocks in global order
      for (const { sheetId, blockId } of this.executionOrder) {
        const engine = this.blockEngines.get(sheetId)
        if (engine) {
          const sheet = allSheets.find((s: Sheet) => s.id === sheetId)
          const block = sheet?.blocks.find((b: BlockData) => b.id === blockId)

          if (block?.type === 'subsystem') {
            continue // Subsystems are just containers
          }
          
          // Check if block should execute based on enable state
          if (!this.shouldExecuteBlock(blockId)) {
            // Skip execution for disabled blocks
            // But still need to output frozen values for output ports
            if (block?.type === 'output_port') {
              const engineState = engine.getState()
              const blockState = engineState.blockStates.get(blockId)
              if (blockState && blockState.frozenOutputs) {
                // Use frozen output value
                blockState.internalState.currentValue = blockState.frozenOutputs[0] ?? 0
              }
            }
            continue
          }
          
          if (block?.type === 'input_port') {
            // Find if this input port is inside a subsystem
            const subsystemBlock = this.findContainingSubsystem(blockId, allSheets)
            if (subsystemBlock) {
              // Check if the subsystem is enabled
              if (!this.isSubsystemEnabled(subsystemBlock.block.id)) {
                // Skip input processing for disabled subsystem
                continue
              }
              
              // Find the wire going into the subsystem at the corresponding port
              const portName = block.parameters?.portName
              const portIndex = subsystemBlock.block.parameters?.inputPorts?.indexOf(portName) ?? -1
              
              if (portIndex >= 0) {
                // Find wire to this subsystem port
                const parentSheet = allSheets.find((s: Sheet) => s.id === subsystemBlock.sheetId)
                const inputWire = parentSheet?.connections.find((w: WireData) => 
                  w.targetBlockId === subsystemBlock.block.id && 
                  w.targetPortIndex === portIndex
                )
                
                if (inputWire) {
                  // Get the value from the source
                  const sourceEngine = this.blockEngines.get(subsystemBlock.sheetId)
                  if (sourceEngine) {
                    const sourceState = sourceEngine.getState()
                    const signalKey = `${inputWire.sourceBlockId}_output_${inputWire.sourcePortIndex}`
                    const value = sourceState.signalValues.get(signalKey)
                    
                    if (value !== undefined) {
                      // Set this as the input port's output
                      const blockState = engine.getState().blockStates.get(blockId)
                      if (blockState) {
                        blockState.outputs[0] = value
                        engine.getState().signalValues.set(`${blockId}_output_0`, value)
                        continue // Skip normal execution
                      }
                    }
                  }
                }
              }
            }
          }
          
          // Execute the block normally
          engine.executeBlockById(blockId)

          // Handle sheet label value sharing within subsystem scope
          if (block?.type === 'sheet_label_sink') {
            const subsystemBlock = this.findContainingSubsystem(blockId, allSheets)
            const scope = subsystemBlock ? subsystemBlock.block.id : 'root'
            
            // Share this value with all engines in the same scope
            const signalName = block.parameters?.signalName
            if (signalName) {
              const blockState = engine.getState().blockStates.get(blockId)
              const value = blockState?.internalState?.currentValue
              
              if (value !== undefined) {
                // Find all sheet label sources with the same signal name in the same scope
                for (const sheet of allSheets) {
                  const sheetSubsystem = this.findContainingSubsystem(sheet.blocks[0]?.id || '', allSheets)
                  const sheetScope = sheetSubsystem ? sheetSubsystem.block.id : 'root'
                  
                  if (sheetScope === scope) {
                    const sheetEngine = this.blockEngines.get(sheet.id)
                    if (sheetEngine) {
                      // Set the value in this engine's sheet label values
                      sheetEngine.getState().sheetLabelValues.set(signalName, value)
                    }
                  }
                }
              }
            }
          }
          
          // After executing, check if this is an output port
          if (block?.type === 'output_port') {
            // Find if this output port is inside a subsystem
            const subsystemBlock = this.findContainingSubsystem(blockId, allSheets)
            if (subsystemBlock) {
              // Get the output port's value
              const engineState = engine.getState()
              const blockState = engineState.blockStates.get(blockId)
              const value = blockState?.internalState?.currentValue
              
              if (value !== undefined) {
                // Find which output port this is
                const portName = block.parameters?.portName
                const portIndex = subsystemBlock.block.parameters?.outputPorts?.indexOf(portName) ?? -1
                
                if (portIndex >= 0) {
                  // Set this value as the subsystem block's output
                  const parentEngine = this.blockEngines.get(subsystemBlock.sheetId)
                  if (parentEngine) {
                    // Make sure the subsystem block state exists
                    let subsystemBlockState = parentEngine.getState().blockStates.get(subsystemBlock.block.id)
                    if (!subsystemBlockState) {
                      // Initialize subsystem block state if it doesn't exist
                      const outputCount = subsystemBlock.block.parameters?.outputPorts?.length || 1
                      subsystemBlockState = {
                        blockId: subsystemBlock.block.id,
                        blockType: 'subsystem',
                        outputs: new Array(outputCount).fill(0),
                        frozenOutputs: new Array(outputCount).fill(0)
                      }
                      parentEngine.getState().blockStates.set(subsystemBlock.block.id, subsystemBlockState)
                    }
                    
                    // Use frozen output if subsystem is disabled
                    if (this.isSubsystemEnabled(subsystemBlock.block.id)) {
                      subsystemBlockState.outputs[portIndex] = value
                      parentEngine.getState().signalValues.set(
                        `${subsystemBlock.block.id}_output_${portIndex}`, 
                        value
                      )
                    } else {
                      // Use frozen value
                      const frozenValue = subsystemBlockState.frozenOutputs?.[portIndex] ?? 0
                      parentEngine.getState().signalValues.set(
                        `${subsystemBlock.block.id}_output_${portIndex}`, 
                        frozenValue
                      )
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      // Collect signal data
      for (const [sheetId, engine] of this.blockEngines) {
        const engineState = engine.getState()
        const signalData = sheetSignalData.get(sheetId)!
        
        const sheet = allSheets.find((s: Sheet) => s.id === sheetId)!
        for (const block of sheet.blocks) {
          if (block.type === 'signal_display' || block.type === 'signal_logger') {
            const inputWire = sheet.connections.find((w: WireData) => 
              w.targetBlockId === block.id && w.targetPortIndex === 0
            )
            
            if (inputWire) {
              const signalKey = `${inputWire.sourceBlockId}_output_${inputWire.sourcePortIndex}`
              const signalValue = engineState.signalValues.get(signalKey)
              
              if (signalValue !== undefined) {
                const dataArray = signalData.get(block.id)
                if (dataArray) {
                  dataArray.push(signalValue)
                }
              }
            }
          }
        }
      }
      
      // Update enable states at end of time step
      this.updateAllSubsystemEnableStates()
      
      // Advance time for all engines
      for (const [_, engine] of this.blockEngines) {
        engine.advanceTime(this.config.timeStep)
      }
      
      time += this.config.timeStep
    }
    
    // Package results by sheet
    for (const [sheetId, signalData] of sheetSignalData) {
      results.set(sheetId, {
        timePoints: [...timePoints],
        signalData,
        finalTime: time
      })
    }
    
    return results
  }

  /**
   * Recursively collect all sheets including those nested in subsystems
   */
  private getAllSheets(sheets: Sheet[]): Sheet[] {
    const allSheets: Sheet[] = []
    
    function collectSheets(currentSheets: Sheet[]) {
      for (const sheet of currentSheets) {
        allSheets.push(sheet)
        
        // Look for subsystem blocks and collect their sheets
        for (const block of sheet.blocks) {
          if (block.type === 'subsystem' && block.parameters?.sheets) {
            collectSheets(block.parameters.sheets)
          }
        }
      }
    }
    
    collectSheets(sheets)
    return allSheets
  }

  private findContainingSubsystem(blockId: string, allSheets: Sheet[]): 
    { block: BlockData, sheetId: string } | null {
    for (const sheet of allSheets) {
      for (const block of sheet.blocks) {
        if (block.type === 'subsystem' && block.parameters?.sheets) {
          // Check if blockId is in any of this subsystem's sheets
          for (const subSheet of block.parameters.sheets) {
            if (subSheet.blocks.some((b: BlockData) => b.id === blockId)) {
              return { block, sheetId: sheet.id }
            }
          }
        }
      }
    }
    return null
  }

  /**
   * Map subsystem connections to internal ports
   */
  private mapSubsystemConnections(
    subsystemBlock: BlockData,
    parentSheet: Sheet,
    dependencies: Map<string, Set<string>>
  ): void {
    if (!subsystemBlock.parameters?.sheets || subsystemBlock.parameters.sheets.length === 0) {
      return
    }

    const subsystemSheets = subsystemBlock.parameters.sheets as Sheet[]
    
    // Find wires connected to this subsystem block
    const inputWiresToSubsystem = parentSheet.connections.filter(w => w.targetBlockId === subsystemBlock.id)
    const outputWiresFromSubsystem = parentSheet.connections.filter(w => w.sourceBlockId === subsystemBlock.id)
    
    // Map external inputs to internal input ports
    for (const inputWire of inputWiresToSubsystem) {
      const portIndex = inputWire.targetPortIndex
      const inputPortName = subsystemBlock.parameters.inputPorts?.[portIndex]
      
      if (inputPortName) {
        // Find the corresponding input port block inside the subsystem
        for (const sheet of subsystemSheets) {
          for (const block of sheet.blocks) {
            if (block.type === 'input_port' && block.parameters?.portName === inputPortName) {
              // Add dependency: input port depends on external source
              if (!dependencies.has(block.id)) {
                dependencies.set(block.id, new Set())
              }
              dependencies.get(block.id)!.add(inputWire.sourceBlockId)
            }
          }
        }
      }
    }
    
    // Map internal output ports to external outputs
    for (const outputWire of outputWiresFromSubsystem) {
      const portIndex = outputWire.sourcePortIndex
      const outputPortName = subsystemBlock.parameters.outputPorts?.[portIndex]
      
      if (outputPortName) {
        // Find the corresponding output port block inside the subsystem
        for (const sheet of subsystemSheets) {
          for (const block of sheet.blocks) {
            if (block.type === 'output_port' && block.parameters?.portName === outputPortName) {
              // IMPORTANT: The external target depends on the output port block
              // NOT on what feeds the output port
              if (!dependencies.has(outputWire.targetBlockId)) {
                dependencies.set(outputWire.targetBlockId, new Set())
              }
              dependencies.get(outputWire.targetBlockId)!.add(block.id)
            }
          }
        }
      }
    }
    
    // Remove the subsystem block itself from execution order
    // It's just a container, not an executable block
    dependencies.delete(subsystemBlock.id)
  }

  // In multiSheetSimulation.ts - Add comprehensive testing and debugging support

  /**
   * Get complete enable state report for debugging
   */
  public getEnableStateReport(): {
    hierarchy: Map<string, string | null>,
    signals: Map<string, boolean>,
    effectiveStates: Map<string, boolean>,
    blockStates: Map<string, { subsystem: string | null, enabled: boolean }>
  } {
    const signals = new Map<string, boolean>()
    const effectiveStates = new Map<string, boolean>()
    const blockStates = new Map<string, { subsystem: string | null, enabled: boolean }>()
    
    // Collect all subsystem states
    for (const [sheetId, engine] of this.blockEngines) {
      const state = engine.getState()
      
      // Collect subsystem signals and states
      for (const [subsystemId, signal] of state.subsystemEnableSignals) {
        signals.set(subsystemId, signal)
      }
      
      for (const [subsystemId, enabled] of state.subsystemEnableStates) {
        effectiveStates.set(subsystemId, enabled)
      }
    }
    
    // Collect block states
    for (const [blockId, subsystemId] of this.blockToSubsystem) {
      const enabled = subsystemId ? this.isSubsystemEnabled(subsystemId) : true
      blockStates.set(blockId, { subsystem: subsystemId, enabled })
    }
    
    return {
      hierarchy: new Map(this.subsystemHierarchy),
      signals,
      effectiveStates,
      blockStates
    }
  }
  
  /**
   * Run a single time step with detailed logging
   */
  public runSingleStepWithLogging(): {
    time: number,
    executedBlocks: string[],
    skippedBlocks: string[],
    signalValues: Map<string, any>,
    enableChanges: string[]
  } {
    const executedBlocks: string[] = []
    const skippedBlocks: string[] = []
    const enableChanges: string[] = []
    const allSheets = this.getAllSheets(this.sheets)
    
    // Store previous enable states
    const previousEnableStates = new Map<string, boolean>()
    for (const [sheetId, engine] of this.blockEngines) {
      const state = engine.getState()
      for (const [subsystemId, enabled] of state.subsystemEnableStates) {
        previousEnableStates.set(subsystemId, enabled)
      }
    }
    
    // Execute blocks
    for (const { sheetId, blockId } of this.executionOrder) {
      const engine = this.blockEngines.get(sheetId)
      if (!engine) continue
      
      const sheet = allSheets.find(s => s.id === sheetId)
      const block = sheet?.blocks.find(b => b.id === blockId)
      
      if (!block || block.type === 'subsystem') continue
      
      if (this.shouldExecuteBlock(blockId)) {
        engine.executeBlockById(blockId)
        executedBlocks.push(`${block.name} (${block.type})`)
      } else {
        skippedBlocks.push(`${block.name} (${block.type})`)
      }
    }
    
    // Update enable states
    this.updateAllSubsystemEnableStates()
    
    // Check for enable state changes
    for (const [sheetId, engine] of this.blockEngines) {
      const state = engine.getState()
      for (const [subsystemId, enabled] of state.subsystemEnableStates) {
        const previous = previousEnableStates.get(subsystemId) ?? true
        if (previous !== enabled) {
          const sheet = allSheets.find(s => 
            s.blocks.some(b => b.id === subsystemId)
          )
          const subsystem = sheet?.blocks.find(b => b.id === subsystemId)
          enableChanges.push(
            `${subsystem?.name || subsystemId}: ${previous ? 'enabled' : 'disabled'} → ${enabled ? 'enabled' : 'disabled'}`
          )
        }
      }
    }
    
    // Collect all signal values
    const signalValues = new Map<string, any>()
    for (const [sheetId, engine] of this.blockEngines) {
      const state = engine.getState()
      for (const [key, value] of state.signalValues) {
        signalValues.set(key, value)
      }
    }
    
    // Advance time
    for (const [_, engine] of this.blockEngines) {
      engine.advanceTime(this.config.timeStep)
    }
    
    return {
      time: this.config.timeStep,
      executedBlocks,
      skippedBlocks,
      signalValues,
      enableChanges
    }
  }
  
  /**
   * Validate the complete enable setup
   */
  public validateEnableSetup(): {
    valid: boolean,
    errors: string[],
    warnings: string[]
  } {
    const errors: string[] = []
    const warnings: string[] = []
    
    // Validate all enable connections
    for (const [sheetId, engine] of this.blockEngines) {
      const engineErrors = engine.validateEnableConnections()
      errors.push(...engineErrors)
    }
    
    // Check for orphaned enable signals
    const allSheets = this.getAllSheets(this.sheets)
    for (const sheet of allSheets) {
      for (const block of sheet.blocks) {
        if (block.type === 'subsystem' && block.parameters?.showEnableInput) {
          const hasEnableConnection = sheet.connections.some(w => 
            w.targetBlockId === block.id && w.targetPortIndex === -1
          )
          
          if (!hasEnableConnection) {
            warnings.push(`Subsystem ${block.name} has enable input but no connection`)
          }
        }
      }
    }
    
    // Validate hierarchy consistency
    for (const [childId, parentId] of this.subsystemHierarchy) {
      if (parentId && !this.blockToSheet.has(parentId)) {
        errors.push(`Subsystem ${childId} has invalid parent ${parentId}`)
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }
  
}
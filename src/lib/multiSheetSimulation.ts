// lib/multiSheetSimulation.ts - Improved version with global execution order

import { SimulationEngine, SimulationConfig, SimulationResults, Sheet } from './simulationEngine'
import { BlockData } from '@/components/Block'
import { WireData } from '@/components/Wire'


export class MultiSheetSimulationEngine {
  private sheets: Sheet[]
  private config: SimulationConfig
  private blockEngines: Map<string, SimulationEngine> = new Map() 
  private executionOrder: { sheetId: string, blockId: string }[] = []
  private blockToSheet: Map<string, string> = new Map() 
  
  constructor(sheets: Sheet[], config: SimulationConfig) {
    this.sheets = sheets
    this.config = config
    
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
      }
    }
    
    // Build global execution order
    this.buildGlobalExecutionOrder()
  }
  
  private buildGlobalExecutionOrder() {
    // Build a global dependency graph across all sheets
    const dependencies = new Map<string, Set<string>>()
    const allSheets = this.getAllSheets(this.sheets)
    
    // First pass: collect all dependencies from wires
    for (const sheet of allSheets) {
      for (const wire of sheet.connections) {
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

  // In lib/multiSheetSimulation.ts, add these methods to the MultiSheetSimulationEngine class:

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
  getOutputPortValues(sheetId?: string): Map<string, number | number[] | boolean | boolean[]> {
    const outputValues = new Map<string, number | number[] | boolean | boolean[]>()
    
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
            continue
          }
          
          if (block?.type === 'input_port') {
            // Find if this input port is inside a subsystem
            const subsystemBlock = this.findContainingSubsystem(blockId, allSheets)
            if (subsystemBlock) {
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
                        outputs: new Array(outputCount).fill(0)
                      }
                      parentEngine.getState().blockStates.set(subsystemBlock.block.id, subsystemBlockState)
                    }
                    
                    subsystemBlockState.outputs[portIndex] = value
                    parentEngine.getState().signalValues.set(
                      `${subsystemBlock.block.id}_output_${portIndex}`, 
                      value
                    )
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
  
}
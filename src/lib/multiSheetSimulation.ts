// lib/multiSheetSimulation.ts - Fixed execution order

import { SimulationEngine, SimulationConfig, SimulationResults, Sheet } from './simulationEngine'

export class MultiSheetSimulationEngine {
  private sheets: Sheet[]
  private config: SimulationConfig
  private engines: Map<string, SimulationEngine> = new Map()
  private globalSheetLabelValues: Map<string, any> = new Map()
  
  constructor(sheets: Sheet[], config: SimulationConfig) {
    this.sheets = sheets
    this.config = config
    
    // Initialize engines for each sheet
    for (const sheet of sheets) {
      const engine = new SimulationEngine(
        sheet.blocks,
        sheet.connections,
        config,
        undefined,
        sheets
      )
      this.engines.set(sheet.id, engine)
    }
    
    // Important: Do an initial pass to establish sheet label connections
    this.initializeSheetLabels()
  }
  
  /**
   * Initialize sheet label values before simulation starts
   */
  private initializeSheetLabels() {
    // First, reset all engines to time 0
    for (const [_, engine] of this.engines) {
      engine.reset()
    }
    
    // Run a single step on all sheets to establish initial values
    for (const [sheetId, engine] of this.engines) {
      // Execute just the source blocks and sheet label sinks
      const sheet = this.sheets.find(s => s.id === sheetId)
      if (!sheet) continue
      
      const engineState = engine.getState()
      
      // Execute source blocks first
      for (const block of sheet.blocks) {
        if (block.type === 'source' || block.type === 'input_port') {
          const blockState = engineState.blockStates.get(block.id)
          if (blockState) {
            // Execute the block to get its initial output
            if (block.type === 'source') {
              // Get the initial value
              const value = block.parameters?.value
              if (value !== undefined) {
                blockState.outputs[0] = Array.isArray(value) ? [...value] : value
                // Store in signal values
                engineState.signalValues.set(`${block.id}_output_0`, blockState.outputs[0])
              }
            }
          }
        }
      }
    }
    
    // Now collect initial sheet label sink values
    for (const [sheetId, engine] of this.engines) {
      const sheet = this.sheets.find(s => s.id === sheetId)
      if (!sheet) continue
      
      const engineState = engine.getState()
      
      for (const block of sheet.blocks) {
        if (block.type === 'sheet_label_sink' && block.parameters?.signalName) {
          // Find connected source
          const inputWire = sheet.connections.find(w => w.targetBlockId === block.id)
          if (inputWire) {
            const signalKey = `${inputWire.sourceBlockId}_output_${inputWire.sourcePortIndex}`
            const signalValue = engineState.signalValues.get(signalKey)
            if (signalValue !== undefined) {
              this.globalSheetLabelValues.set(block.parameters.signalName, signalValue)
            }
          }
        }
      }
    }
    
    // Share initial values with all engines
    for (const [_, engine] of this.engines) {
      const engineState = engine.getState()
      for (const [name, value] of this.globalSheetLabelValues) {
        engineState.sheetLabelValues.set(name, value)
      }
    }
    
    // Reset all engines again to start fresh with proper initial conditions
    for (const [_, engine] of this.engines) {
      engine.reset()
      // But preserve the sheet label values
      const engineState = engine.getState()
      for (const [name, value] of this.globalSheetLabelValues) {
        engineState.sheetLabelValues.set(name, value)
      }
    }
  }
  
  /**
   * Run the simulation across all sheets
   */
  run(): Map<string, SimulationResults> {
    const results = new Map<string, SimulationResults>()
    
    // Re-initialize to ensure clean state
    this.initializeSheetLabels()
    
    // Initialize time tracking
    let time = 0
    const timePoints: number[] = []
    const sheetSignalData = new Map<string, Map<string, any[]>>()
    
    // Initialize signal data collection for each sheet
    for (const sheet of this.sheets) {
      const signalData = new Map<string, any[]>()
      for (const block of sheet.blocks) {
        if (block.type === 'signal_display' || block.type === 'signal_logger') {
          signalData.set(block.id, [])
        }
      }
      sheetSignalData.set(sheet.id, signalData)
    }
    
    // Main simulation loop
    while (time < this.config.duration) {
      timePoints.push(time)
      
      // Step 1: Run one step for all engines
      for (const [sheetId, engine] of this.engines) {
        engine.step()
      }
      
      // Step 2: Collect sheet label values from all sheets
      const newSheetLabelValues = new Map<string, any>()
      for (const [sheetId, engine] of this.engines) {
        const sheet = this.sheets.find(s => s.id === sheetId)
        if (!sheet) continue
        
        const engineState = engine.getState()
        for (const block of sheet.blocks) {
          if (block.type === 'sheet_label_sink' && block.parameters?.signalName) {
            const blockState = engineState.blockStates.get(block.id)
            if (blockState?.internalState?.currentValue !== undefined) {
              newSheetLabelValues.set(
                block.parameters.signalName,
                blockState.internalState.currentValue
              )
            }
          }
        }
      }
      
      // Update global values
      this.globalSheetLabelValues = newSheetLabelValues
      
      // Step 3: Update all engines with global sheet label values
      for (const [_, engine] of this.engines) {
        const engineState = engine.getState()
        engineState.sheetLabelValues.clear()
        for (const [name, value] of this.globalSheetLabelValues) {
          engineState.sheetLabelValues.set(name, value)
        }
      }
      
      // Step 4: Collect signal display/logger data
      for (const [sheetId, engine] of this.engines) {
        const sheet = this.sheets.find(s => s.id === sheetId)
        if (!sheet) continue
        
        const signalData = sheetSignalData.get(sheetId)!
        const engineState = engine.getState()
        
        for (const block of sheet.blocks) {
          if (block.type === 'signal_display' || block.type === 'signal_logger') {
            // Find the input wire to this block
            const inputWire = sheet.connections.find(w => 
              w.targetBlockId === block.id && w.targetPortIndex === 0
            )
            
            if (inputWire) {
              // Get the signal value from the wire's source
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
      
      time += this.config.timeStep
    }
    
    // Package results for each sheet
    for (const [sheetId, signalData] of sheetSignalData) {
      results.set(sheetId, {
        timePoints: [...timePoints],
        signalData,
        finalTime: time
      })
    }
    
    return results
  }
  
  getSheetEngine(sheetId: string): SimulationEngine | undefined {
    return this.engines.get(sheetId)
  }
  
  getOutputPortValues(sheetId: string): Map<string, any> | undefined {
    const engine = this.engines.get(sheetId)
    return engine?.getOutputPortValues()
  }
}
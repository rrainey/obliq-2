// lib/simulationEngine.ts - Updated with enable state tracking
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { parseType, ParsedType } from '@/lib/typeValidator'
import { BlockSimulationAdapter } from '@/lib/simulation/BlockSimulationAdapter'
import { SignalValue } from '@/lib/modelSchema'

export interface Sheet {
  id: string
  name: string
  blocks: BlockData[]
  connections: WireData[]
  extents: {
    width: number
    height: number
  }
}


export interface SimulationState {
  time: number
  timeStep: number
  duration: number
  blockStates: Map<string, BlockState>
  signalValues: Map<string, SignalValue>
  sheetLabelValues: Map<string, SignalValue>
  isRunning: boolean
  subsystemEnableStates: Map<string, boolean> // subsystemId -> enabled state
  subsystemEnableSignals: Map<string, boolean> // subsystemId -> enable signal value
  parentSubsystemMap: Map<string, string | null> // blockId -> parent subsystem ID (null for root)
}

export interface BlockState {
  blockId: string
  blockType: string
  outputs: (SignalValue)[]
  internalState?: any
  outputTypes?: ParsedType[]
  frozenOutputs?: (SignalValue)[]
  lastEnabledTime?: number
  blockData?: BlockData 
}

export interface SimulationConfig {
  timeStep: number
  duration: number
}

export interface SimulationResults {
  timePoints: number[]
  signalData: Map<string, (number | number[] | boolean | boolean[] | number[][])[]>
  finalTime: number
}

export class SimulationEngine {
  private blocks: BlockData[]
  private wires: WireData[]
  private state: SimulationState
  private executionOrder: string[] = []
  private getExternalInput?: (portName: string) => number | number[] | boolean | boolean[] | number[][] | undefined
  private allSheets: Sheet[] = [] // Store all sheets for subsystem simulation
  private subsystemEngines: Map<string, SimulationEngine> = new Map() // Cache for subsystem engines

  constructor(blocks: BlockData[], wires: WireData[], config: SimulationConfig, externalInputs?: (portName: string) => number | number[] | boolean | boolean[] | number[][] | undefined, allSheets?: Sheet[]) {
    this.blocks = blocks
    this.wires = wires
    this.getExternalInput = externalInputs
    this.allSheets = allSheets || []
    this.state = {
      time: 0,
      timeStep: config.timeStep,
      duration: config.duration,
      blockStates: new Map(),
      signalValues: new Map(),
      sheetLabelValues: new Map(),
      isRunning: false,
      // Initialize new enable state maps
      subsystemEnableStates: new Map(),
      subsystemEnableSignals: new Map(),
      parentSubsystemMap: new Map()
    }
    this.initializeBlocks()
    this.initializeEnableStates()
    this.calculateExecutionOrder()
    this.computeInitialOutputs() // Add this line
  }

  private initializeBlocks() {
    for (const block of this.blocks) {
      const outputTypes = this.getBlockOutputTypes(block)
      const initialOutputs = this.getInitialOutputs(block.type, block.parameters)
      const blockState: BlockState = {
        blockId: block.id,
        blockType: block.type,
        outputs: initialOutputs,
        internalState: this.getInitialInternalState(block.type, block.parameters),
        outputTypes,
        // Initialize frozen outputs with initial values
        frozenOutputs: [...initialOutputs],
        lastEnabledTime: 0
      }
      this.state.blockStates.set(block.id, blockState)
    }
  }

  private initializeEnableStates() {
    // Initialize all subsystems as enabled by default
    for (const block of this.blocks) {
      if (block.type === 'subsystem') {
        this.state.subsystemEnableStates.set(block.id, true)
        // Check if this subsystem has showEnableInput
        if (block.parameters?.showEnableInput) {
          // Initialize enable signal as true
          this.state.subsystemEnableSignals.set(block.id, true)
        }
      }
    }
    
    // Build parent subsystem map (this would be populated by MultiSheetSimulationEngine)
    // For now, all blocks in this engine are at the same level
    for (const block of this.blocks) {
      this.state.parentSubsystemMap.set(block.id, null)
    }
  }

  /**
   * Set the parent subsystem for a block
   * Used by MultiSheetSimulationEngine to build the hierarchy
   */
  public setParentSubsystem(blockId: string, parentSubsystemId: string | null) {
    this.state.parentSubsystemMap.set(blockId, parentSubsystemId)
  }

/**
   * Check if a subsystem is enabled, considering parent state
   * This is used during block execution
   */
  private isSubsystemEnabled(subsystemId: string): boolean {
    // Check the pre-computed enable state
    const enabled = this.state.subsystemEnableStates.get(subsystemId)
    
    // If not found, default to true (shouldn't happen in normal operation)
    return enabled ?? true
  }
  
  /**
   * Check if the current block is in an enabled context
   * This checks all parent subsystems up the hierarchy
   */
  private isBlockEnabled(blockId: string): boolean {
    const containingSubsystem = this.getContainingSubsystem(blockId)
    
    if (!containingSubsystem) {
      // Root level blocks are always enabled
      return true
    }
    
    // Check if the containing subsystem is enabled
    // The subsystem's enable state already considers parent hierarchy
    return this.isSubsystemEnabled(containingSubsystem)
  }
  
  /**
   * Update the shouldExecuteBlock method to use isBlockEnabled
   */
  private shouldExecuteBlock(blockId: string): boolean {
    return this.isBlockEnabled(blockId)
  }
  /**
   * Evaluate the enable signal for a subsystem
   */
  private evaluateEnableSignal(subsystemId: string): boolean {
    // Find the subsystem block
    const subsystemBlock = this.blocks.find(b => b.id === subsystemId && b.type === 'subsystem')
    if (!subsystemBlock || !subsystemBlock.parameters?.showEnableInput) {
      return true // No enable input, always enabled
    }
    
    // Find wire connected to enable port (targetPortIndex = -1)
    const enableWire = this.wires.find(w => 
      w.targetBlockId === subsystemId && w.targetPortIndex === -1
    )
    
    if (!enableWire) {
      return true // No connection to enable port, default to enabled
    }
    
    // Get the signal value
    const signalKey = `${enableWire.sourceBlockId}_output_${enableWire.sourcePortIndex}`
    const signalValue = this.state.signalValues.get(signalKey)
    
    // Convert to boolean (handle truthy/falsy values)
    if (typeof signalValue === 'boolean') {
      return signalValue
    } else if (typeof signalValue === 'number') {
      return signalValue !== 0
    } else if (Array.isArray(signalValue)) {
      // For arrays, check if first element is truthy
      return signalValue.length > 0 && signalValue[0] !== 0 && signalValue[0] !== false
    }
    
    return true // Default to enabled if signal is undefined
  }

  /**
   * Update all subsystem enable states based on signals and parent states
   * Should be called at the end of each time step
   */
  private updateSubsystemEnableStates() {
    for (const block of this.blocks) {
      if (block.type === 'subsystem') {
        const previousState = this.state.subsystemEnableStates.get(block.id) ?? true
        
        // Evaluate enable signal
        const signalEnabled = this.evaluateEnableSignal(block.id)
        this.state.subsystemEnableSignals.set(block.id, signalEnabled)
        
        // Check parent state
        const parentId = this.state.parentSubsystemMap.get(block.id)
        const parentEnabled = parentId ? this.isSubsystemEnabled(parentId) : true
        
        // Subsystem is enabled only if both signal and parent are enabled
        const newState = signalEnabled && parentEnabled
        this.state.subsystemEnableStates.set(block.id, newState)
        
        // Handle state transition
        if (previousState && !newState) {
          // Transitioning from enabled to disabled - freeze outputs
          this.freezeSubsystemOutputs(block.id)
        } else if (!previousState && newState) {
          // Transitioning from disabled to enabled - record time
          const blockState = this.state.blockStates.get(block.id)
          if (blockState) {
            blockState.lastEnabledTime = this.state.time
          }
        }
      }
    }
  }

  /**
   * Freeze outputs for all blocks in a subsystem
   */
  private freezeSubsystemOutputs(subsystemId: string) {
    // In a single-sheet engine, we only freeze the subsystem block itself
    // The MultiSheetSimulationEngine will handle freezing blocks within the subsystem
    const blockState = this.state.blockStates.get(subsystemId)
    if (blockState) {
      blockState.frozenOutputs = [...blockState.outputs]
    }
  }

  /**
   * Get the containing subsystem for a block
   */
  public getContainingSubsystem(blockId: string): string | null {
    return this.state.parentSubsystemMap.get(blockId) ?? null
  }

  public advanceTime(timeStep: number): void {
    // Advance the simulation time without executing any blocks
    this.state.time += timeStep
  }

  public step(): boolean {
    if (this.state.time >= this.state.duration) {
      this.state.isRunning = false
      return false
    }

    // Clear signal values for this step
    this.state.signalValues.clear()

    // Execute blocks in order
    for (const blockId of this.executionOrder) {
      this.executeBlock(blockId)
    }

    // Update subsystem enable states at end of time step
    this.updateSubsystemEnableStates()

    this.state.time += this.state.timeStep
    return true
  }

  private getBlockOutputTypes(block: BlockData): ParsedType[] {
    // For blocks with explicit data types
    if (block.type === 'source' || block.type === 'input_port') {
      const dataType = block.parameters?.dataType || 'double'
      try {
        return [parseType(dataType)]
      } catch {
        return [{ baseType: 'double', isArray: false }] // Default fallback
      }
    }
    
    // For other blocks, types will be determined during execution
    // based on their inputs
    return []
  }

  private getInitialOutputs(blockType: string, parameters?: Record<string, any>): (number | number[] | boolean | boolean[] | number[][])[] {
    // For source blocks, check if they output vectors
    if (blockType === 'source' || blockType === 'input_port') {
      const dataType = parameters?.dataType || 'double'
      try {
        const parsed = parseType(dataType)
        if (parsed.isArray && parsed.arraySize) {
          // Initialize array with zeros or false for boolean arrays
          if (parsed.baseType === 'bool') {
            return [new Array(parsed.arraySize).fill(false)]
          } else {
            return [new Array(parsed.arraySize).fill(0)]
          }
        }
      } catch {
        // Fall back to scalar
      }
    }
    
    switch (blockType) {
      case 'sum':
      case 'multiply':
      case 'scale':
      case 'transfer_function':
      case 'lookup_1d':
      case 'lookup_2d':
      case 'matrix_multiply':
      case 'mux':
        return [0] // Single output, actual type determined by inputs
      case 'demux':
        // Demux has dynamic outputs based on input
        const outputCount = parameters?.outputCount || 1
        return new Array(outputCount).fill(0)
      case 'input_port':
      case 'source':
        return [0] // Single output
      case 'output_port':
      case 'signal_display':
      case 'signal_logger':
        return [] // No outputs
      case 'subsystem':
        const outputPorts = parameters?.outputPorts || ['output']
        return new Array(outputPorts.length).fill(0)
      case 'sheet_label_sink':
      return [] // No outputs
    case 'sheet_label_source':
      return [0] // Single output, type will be determined by sink
      default:
        return []
    }
  }

  private getInitialInternalState(blockType: string, parameters?: Record<string, any>): any {
    switch (blockType) {
      case 'source':
        // Get the actual value from parameters
        const sourceBlock = this.blocks.find(b => b.id === blockType)
        const actualValue = parameters?.value || 0
        
        return {
          constantValue: Array.isArray(actualValue) ? actualValue[0] : actualValue, // Store first element for compatibility
          value: actualValue, // Store the full value (scalar or array)
          signalType: parameters?.signalType || 'constant',
          dataType: parameters?.dataType || 'double',
          // Signal generation parameters
          stepTime: parameters?.stepTime || 1.0,
          stepValue: parameters?.stepValue || 1.0,
          slope: parameters?.slope || 1.0,
          startTime: parameters?.startTime || 0,
          frequency: parameters?.frequency || 1.0,
          amplitude: parameters?.amplitude || 1.0,
          phase: parameters?.phase || 0,
          offset: parameters?.offset || 0,
          f0: parameters?.f0 || 0.1,
          f1: parameters?.f1 || 10,
          duration: parameters?.duration || 10,
          mean: parameters?.mean || 0
        }
      case 'input_port':
        return {
          portName: parameters?.portName || 'Input',
          dataType: parameters?.dataType || 'double',
          defaultValue: parameters?.defaultValue || 0,
          isConnectedToParent: false
        }
      case 'output_port':
        return {
          portName: parameters?.portName || 'Output',
          currentValue: 0
        }
      case 'scale':
        return {
          gain: parameters?.gain || 1
        }
      case 'evaluate':
        return {
          numInputs: parameters?.numInputs || 2,
          expression: parameters?.expression || 'in(0) + in(1)'
        }
      case 'transfer_function':
        const numerator = parameters?.numerator || [1]
        const denominator = parameters?.denominator || [1, 1]
        const stateOrder = Math.max(0, denominator.length - 1)
        return {
          numerator,
          denominator,
          // State vector for the transfer function (order = denominator.length - 1)
          states: new Array(stateOrder).fill(0),
          // For vector inputs, we'll need arrays of states
          vectorStates: null, // Will be initialized when we know input is a vector
          // Previous input and output for derivative calculation
          prevInput: 0,
          prevOutput: 0
        }
      case 'lookup_1d':
        return {
          inputValues: parameters?.inputValues || [0, 1],
          outputValues: parameters?.outputValues || [0, 1],
          extrapolation: parameters?.extrapolation || 'clamp'
        }
      case 'lookup_2d':
        return {
          input1Values: parameters?.input1Values || [0, 1],
          input2Values: parameters?.input2Values || [0, 1],
          outputTable: parameters?.outputTable || [[0, 0], [0, 1]],
          extrapolation: parameters?.extrapolation || 'clamp'
        }
      case 'signal_display':
        return {
          samples: [],
          maxSamples: parameters?.maxSamples || 1000
        }
      case 'signal_logger':
        return {
          loggedData: [],
          timeStamps: []
        }
      case 'subsystem':
        return {
          sheetId: parameters?.sheetId || '',
          sheetName: parameters?.sheetName || 'Subsystem',
          inputPorts: parameters?.inputPorts || ['Input1'],
          outputPorts: parameters?.outputPorts || ['Output1'],
          // For now, subsystem outputs pass through from inputs as placeholders
          currentOutputs: new Array(parameters?.outputPorts?.length || 1).fill(0)
        }
      case 'sheet_label_sink':
        return {
          signalName: parameters?.signalName || '',
          currentValue: 0
        }
      case 'sheet_label_source':
        return {
          signalName: parameters?.signalName || ''
        }
      case 'mux':
        return {
          rows: parameters?.rows || 2,
          cols: parameters?.cols || 2,
          outputType: parameters?.outputType || 'double'
        }
      case 'demux':
        return {
          outputCount: parameters?.outputCount || 1,
          inputDimensions: parameters?.inputDimensions || [1]
        }
      case 'condition':
        return {
          condition: parameters?.condition || '> 0'
        }
      default:
        return {}
    }
  }

  private calculateExecutionOrder() {
    // Simple topological sort to determine block execution order
    const visited = new Set<string>()
    const visiting = new Set<string>()
    const order: string[] = []

    const visit = (blockId: string) => {
      if (visiting.has(blockId)) {
        // Potential cycle - for now, just continue
        return
      }
      if (visited.has(blockId)) {
        return
      }

      visiting.add(blockId)

      // Find all blocks that depend on this block's output
      const dependentWires = this.wires.filter(wire => wire.sourceBlockId === blockId)
      for (const wire of dependentWires) {
        visit(wire.targetBlockId)
      }

      visiting.delete(blockId)
      visited.add(blockId)
      order.unshift(blockId) // Add to beginning for reverse topological order
    }

    // Start with source blocks (no inputs)
    for (const block of this.blocks) {
      if (this.isSourceBlock(block.type)) {
        visit(block.id)
      }
    }

    // Visit any remaining blocks
    for (const block of this.blocks) {
      if (!visited.has(block.id)) {
        visit(block.id)
      }
    }

    this.executionOrder = order

    // Debug: log execution order with Sheet Label blocks highlighted
    /*
    console.log('DEBUG: Execution order:', this.executionOrder.map(id => {
      const block = this.blocks.find(b => b.id === id)
      if (block?.type === 'sheet_label_sink' || block?.type === 'sheet_label_source') {
        return `${block.type}(${block.name})`
      }
      return block?.type || id
    }))
    */
  }


  private isSourceBlock(blockType: string): boolean {
    return ['input_port', 'source'].includes(blockType)
  }

  public executeBlock(blockId: string) {
    const block = this.blocks.find(b => b.id === blockId)
    const blockState = this.state.blockStates.get(blockId)
    
    if (!block || !blockState) return

    // Check if block should execute
    const containingSubsystem = this.getContainingSubsystem(blockId)
    const isEnabled = containingSubsystem ? this.isSubsystemEnabled(containingSubsystem) : true

    // Get inputs for this block
    const inputs = this.getBlockInputs(blockId)

    // For disabled blocks, we need special handling
    if (!isEnabled) {
      // Most blocks just output their frozen values
      if (blockState.frozenOutputs && blockState.frozenOutputs.length > 0) {
        blockState.outputs = [...blockState.frozenOutputs]
      }
      
      // Special handling for specific block types
      switch (block.type) {
        case 'source':
          // Sources continue to generate signals even when disabled
          // This allows enable signals to work properly
          BlockSimulationAdapter.executeBlock(blockId, block, blockState, inputs, this.state)
          break;
          
        case 'output_port':
          // Output ports need to update their internal state even when disabled
          // so parent can read the frozen value
          BlockSimulationAdapter.executeBlock(blockId, block, blockState, inputs, this.state)
          break;
          
        case 'signal_display':
        case 'signal_logger':
          // These blocks should not record new data when disabled
          // Just maintain their current state
          break;
          
        default:
          // All other blocks use frozen outputs
          break;
      }
    } else {
      // Execute block using the adapter
      BlockSimulationAdapter.executeBlock(blockId, block, blockState, inputs, this.state)
      
      // Update frozen outputs when enabled
      blockState.frozenOutputs = [...blockState.outputs]
    }

    // Store signal values (whether enabled or disabled)
    for (let i = 0; i < blockState.outputs.length; i++) {
      const signalKey = `${blockId}_output_${i}`
      this.state.signalValues.set(signalKey, blockState.outputs[i])
    }
    
  }

  public executeBlockById(blockId: string): void {
    // Find the block by ID
    const block = this.blocks.find(b => b.id === blockId)
    if (!block) {
      console.warn(`Block with ID ${blockId} not found`)
      return
    }
    
    // Execute the block using the existing private method
    this.executeBlock(blockId)
  }

  private getBlockInputs(blockId: string): (number | number[] | boolean | boolean[] | number[][])[] {
    const inputWires = this.wires.filter(wire => wire.targetBlockId === blockId)
    const inputs: (number | number[] | boolean | boolean[] | number[][])[] = []

    // Sort by port index to ensure correct order
    inputWires.sort((a, b) => a.targetPortIndex - b.targetPortIndex)

    for (const wire of inputWires) {
      const sourceSignalKey = `${wire.sourceBlockId}_output_${wire.sourcePortIndex}`
      const value = this.state.signalValues.get(sourceSignalKey) || 0

      inputs[wire.targetPortIndex] = value
    }

    return inputs
  }

  
  /**
   * Get transfer function output without updating states (for disabled subsystems)
   */
  private getTransferFunctionOutputWithoutUpdate(
    input: number,
    numerator: number[],
    denominator: number[],
    states: number[]
  ): number {
    // Pure gain case
    if (denominator.length === 1) {
      return input * (numerator[0] || 0) / denominator[0]
    }
    
    // For dynamic systems, output the current state value
    // This maintains the last computed output when the subsystem was enabled
    if (states.length > 0) {
      return states[0] // First state is typically the output
    }
    
    return 0
  }
  
  private processTransferFunctionElement(
    input: number,
    numerator: number[],
    denominator: number[],
    states: number[],
    timeStep: number
  ): number {
    // Pure gain case: H(s) = K (only constant term)
    if (denominator.length === 1) {
      return input * (numerator[0] || 0) / denominator[0]
    }
    
    // First order system: H(s) = b0 / (a1*s + a0)
    if (denominator.length === 2) {
      const a1 = denominator[0] // s term coefficient
      const a0 = denominator[1] // constant term
      const b0 = numerator[numerator.length - 1] || 0
      
      if (a1 === 0) {
        // Degenerate case - pure gain
        if (a0 !== 0) {
          return input * b0 / a0
        } else {
          return 0
        }
      }
      
      const currentState = states[0] || 0
      const h = timeStep
      
      // Define the derivative function
      const dydt = (y: number, u: number) => (b0 * u - a0 * y) / a1
      
      // Runge-Kutta 4th order integration
      const k1 = dydt(currentState, input)
      const k2 = dydt(currentState + 0.5 * h * k1, input)
      const k3 = dydt(currentState + 0.5 * h * k2, input)
      const k4 = dydt(currentState + h * k3, input)
      
      // Update state using RK4
      states[0] = currentState + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
      
      // Output equals the state for first-order systems
      return states[0]
    }
    else if (denominator.length === 3) {
      // Second order system
      const a2 = denominator[0] // s^2 coefficient
      const a1 = denominator[1] // s coefficient
      const a0 = denominator[2] // constant term
      const b0 = numerator[numerator.length - 1] || 0
      
      if (a2 === 0) {
        return 0
      }
      
      const x1 = states[0] || 0
      const x2 = states[1] || 0
      const h = timeStep
      
      // System equations
      const f1 = (x1: number, x2: number, u: number) => x2
      const f2 = (x1: number, x2: number, u: number) => (b0 * u - a0 * x1 - a1 * x2) / a2
      
      // RK4 integration
      const k1_1 = f1(x1, x2, input)
      const k1_2 = f2(x1, x2, input)
      
      const k2_1 = f1(x1 + 0.5 * h * k1_1, x2 + 0.5 * h * k1_2, input)
      const k2_2 = f2(x1 + 0.5 * h * k1_1, x2 + 0.5 * h * k1_2, input)
      
      const k3_1 = f1(x1 + 0.5 * h * k2_1, x2 + 0.5 * h * k2_2, input)
      const k3_2 = f2(x1 + 0.5 * h * k2_1, x2 + 0.5 * h * k2_2, input)
      
      const k4_1 = f1(x1 + h * k3_1, x2 + h * k3_2, input)
      const k4_2 = f2(x1 + h * k3_1, x2 + h * k3_2, input)
      
      // Update states
      states[0] = x1 + (h / 6) * (k1_1 + 2 * k2_1 + 2 * k3_1 + k4_1)
      states[1] = x2 + (h / 6) * (k1_2 + 2 * k2_2 + 2 * k3_2 + k4_2)
      
      return states[0]
    }
    else {
      // Higher order systems - simplified implementation
      const highestOrderCoeff = denominator[0]
      const lowestOrderCoeff = denominator[denominator.length - 1]
      const timeConstant = Math.abs(highestOrderCoeff / lowestOrderCoeff)
      const gain = (numerator[numerator.length - 1] || 0) / (lowestOrderCoeff || 1)
      
      const currentState = states[0] || 0
      const derivative = (gain * input - currentState) / timeConstant
      states[0] = currentState + derivative * timeStep
      
      return states[0]
    }
  }

  // Helper method to update external inputs (for subsystem simulation)
  public updateExternalInputs(inputProvider: (portName: string) => number | number[] | boolean | boolean[] | number[][] | undefined) {
    this.getExternalInput = inputProvider
  }
  
  // Helper method to synchronize time with parent simulation
  public syncTime(parentTime: number) {
    this.state.time = parentTime
  }

  private interpolate1D(x: number, xValues: number[], yValues: number[]): number {
    if (xValues.length !== yValues.length || xValues.length === 0) {
      return 0
    }

    if (x <= xValues[0]) return yValues[0]
    if (x >= xValues[xValues.length - 1]) return yValues[yValues.length - 1]

    for (let i = 0; i < xValues.length - 1; i++) {
      if (x >= xValues[i] && x <= xValues[i + 1]) {
        const t = (x - xValues[i]) / (xValues[i + 1] - xValues[i])
        return yValues[i] + t * (yValues[i + 1] - yValues[i])
      }
    }

    return 0
  }

  private interpolate2D(x: number, y: number, xValues: number[], yValues: number[], table: number[][]): number {
    // Simplified 2D interpolation
    // This is a basic implementation - a full implementation would do bilinear interpolation
    const xi = Math.min(Math.max(0, Math.floor(x)), xValues.length - 1)
    const yi = Math.min(Math.max(0, Math.floor(y)), yValues.length - 1)
    
    if (table[xi] && table[xi][yi] !== undefined) {
      return table[xi][yi]
    }
    
    return 0
  }

  public run(): SimulationResults {
    this.state.isRunning = true
    const timePoints: number[] = []
    const signalData = new Map<string, (number | number[] | boolean | boolean[] | number[][])[]>()

    // Initialize signal data arrays for display and logger blocks
    for (const block of this.blocks) {
      if (block.type === 'signal_display' || block.type === 'signal_logger') {
        signalData.set(block.id, [])
      }
    }

    while (this.step()) {
      timePoints.push(this.state.time)
      
      // Collect data from display and logger blocks
      for (const block of this.blocks) {
        if (block.type === 'signal_display' || block.type === 'signal_logger') {
          const blockState = this.state.blockStates.get(block.id)
          if (blockState) {
            const inputs = this.getBlockInputs(block.id)
            const value = inputs[0]
            const dataArray = signalData.get(block.id)
            if (dataArray) {
              // Store the complete value (scalar or vector)
              dataArray.push(value)
            }
          }
        }
      }
    }

    return {
      timePoints,
      signalData,
      finalTime: this.state.time
    }
  }

  public getState(): SimulationState {
    return { ...this.state }
  }

  public getLoggedData(blockId: string): { timeStamps: number[], values: (number | number[] | boolean | boolean[] | number[][])[] } | null {
    const blockState = this.state.blockStates.get(blockId)
    if (!blockState || blockState.blockType !== 'signal_logger') {
      return null
    }
    
    return {
      timeStamps: [...blockState.internalState.timeStamps],
      values: [...blockState.internalState.loggedData]
    }
  }

  public exportLoggedDataAsCSV(blockId: string): string {
    const data = this.getLoggedData(blockId)
    if (!data) {
      return ''
    }
    
    // Check if we're dealing with vector data
    const firstValue = data.values[0]
    const isVector = Array.isArray(firstValue)
    
    if (isVector && firstValue) {
      // For vector data, create columns for each element
      const vectorSize = firstValue.length
      let csv = 'Time'
      for (let i = 0; i < vectorSize; i++) {
        csv += `,Element_${i}`
      }
      csv += '\n'
      
      for (let i = 0; i < data.timeStamps.length; i++) {
        csv += data.timeStamps[i]
        const value = data.values[i]
        if (Array.isArray(value)) {
          for (let j = 0; j < vectorSize; j++) {
            csv += `,${value[j] || 0}`
          }
        } else {
          // Fallback for inconsistent data
          for (let j = 0; j < vectorSize; j++) {
            csv += ',0'
          }
        }
        csv += '\n'
      }
      return csv
    } else {
      // Scalar data
      let csv = 'Time,Value\n'
      for (let i = 0; i < data.timeStamps.length; i++) {
        const value = data.values[i]
        const scalarValue = typeof value === 'number' ? value : 0
        csv += `${data.timeStamps[i]},${scalarValue}\n`
      }
      return csv
    }
  }

  public exportAllLoggedDataAsCSV(): string {
    const loggerBlocks = this.blocks.filter(block => block.type === 'signal_logger')
    if (loggerBlocks.length === 0) {
      return ''
    }
    
    // Find the maximum number of samples across all loggers
    let maxSamples = 0
    const blockData = new Map<string, { timeStamps: number[], values: (number | number[] | boolean | boolean[] | number[][])[] }>()
    
    for (const block of loggerBlocks) {
      const data = this.getLoggedData(block.id)
      if (data) {
        blockData.set(block.id, data)
        maxSamples = Math.max(maxSamples, data.timeStamps.length)
      }
    }
    
    // Create CSV header
    let csv = 'Time'
    for (const block of loggerBlocks) {
      const data = blockData.get(block.id)
      if (data && data.values.length > 0) {
        const firstValue = data.values[0]
        if (Array.isArray(firstValue)) {
          // Vector signal - add column for each element
          for (let i = 0; i < firstValue.length; i++) {
            csv += `,${block.name}_${i}`
          }
        } else {
          // Scalar signal
          csv += `,${block.name}`
        }
      } else {
        csv += `,${block.name}`
      }
    }
    csv += '\n'
    
    // Create CSV rows
    for (let i = 0; i < maxSamples; i++) {
      let row = ''
      let timeValue = ''
      
      // Get time from first available logger
      for (const [blockId, data] of blockData) {
        if (i < data.timeStamps.length) {
          timeValue = data.timeStamps[i].toString()
          break
        }
      }
      
      row += timeValue
      
      // Add values from each logger
      for (const block of loggerBlocks) {
        const data = blockData.get(block.id)
        if (data && i < data.values.length) {
          const value = data.values[i]
          if (Array.isArray(value)) {
            // Vector value
            for (let j = 0; j < value.length; j++) {
              row += `,${value[j]}`
            }
          } else {
            // Scalar value
            row += `,${value}`
          }
        } else {
          // No data for this timestamp
          const firstData = blockData.get(block.id)
          if (firstData && firstData.values.length > 0 && Array.isArray(firstData.values[0])) {
            // Fill with empty values for vector
            const vectorSize = (firstData.values[0] as any[]).length
            for (let j = 0; j < vectorSize; j++) {
              row += ','
            }
          } else {
            row += ','
          }
        }
      }
      
      csv += row + '\n'
    }
    
    return csv
  }

  public getOutputPortValues(): Map<string, number | number[] | boolean | boolean[] | number[][]> {
    const outputValues = new Map<string, number | number[] | boolean | boolean[] | number[][]>()
    
    for (const block of this.blocks) {
      if (block.type === 'output_port') {
        const blockState = this.state.blockStates.get(block.id)
        if (blockState && blockState.internalState) {
          const portName = blockState.internalState.portName
          const value = blockState.internalState.currentValue || 0
          outputValues.set(portName, value)
        }
      }
    }
    
    return outputValues
  }

  public getOutputPortValue(portName: string): number | number[] | boolean | boolean[] | number[][] | undefined {
    for (const block of this.blocks) {
      if (block.type === 'output_port') {
        const blockState = this.state.blockStates.get(block.id)
        if (blockState && 
            blockState.internalState && 
            blockState.internalState.portName === portName) {
          return blockState.internalState.currentValue || 0
        }
      }
    }
    return undefined
  }

  public reset() {
    this.state.time = 0
    this.state.isRunning = false
    this.initializeBlocks()
  }

  // In simulationEngine.ts - Add initial output computation method

  /**
   * Compute initial outputs for all blocks
   * This ensures disabled subsystems have valid initial outputs
   */
  private computeInitialOutputs() {
    // First pass: compute outputs for source blocks and blocks with explicit initial values
    for (const blockId of this.executionOrder) {
      const block = this.blocks.find(b => b.id === blockId)
      const blockState = this.state.blockStates.get(blockId)
      
      if (!block || !blockState) continue
      
      switch (block.type) {
        case 'source':
          // Sources generate their initial value
          BlockSimulationAdapter.executeBlock(blockId, block, blockState, [], this.state)
          break
          
        case 'input_port':
          // Input ports use their default value
          const defaultValue = block.parameters?.defaultValue || 0
          const dataType = block.parameters?.dataType || 'double'
          
          // Parse the data type to check if it's a vector or matrix
          let parsedType: ParsedType | null = null
          try {
            parsedType = parseType(dataType)
          } catch {
            parsedType = { baseType: 'double', isArray: false }
          }
          
          // Set initial output based on type
          if (parsedType.isMatrix && parsedType.rows && parsedType.cols) {
            // Initialize matrix with default value
            const matrix: number[][] = []
            for (let i = 0; i < parsedType.rows; i++) {
              matrix[i] = new Array(parsedType.cols).fill(defaultValue)
            }
            blockState.outputs[0] = matrix
          } else if (parsedType.isArray && parsedType.arraySize) {
            // Initialize array with default value
            blockState.outputs[0] = new Array(parsedType.arraySize).fill(defaultValue)
          } else {
            blockState.outputs[0] = defaultValue
          }
          
          // Store in signal values
          this.state.signalValues.set(`${blockId}_output_0`, blockState.outputs[0])
          break
          
        case 'transfer_function':
          // For transfer functions, compute steady-state output for zero input
          // This gives a reasonable initial output
          const { numerator, denominator } = blockState.internalState
          if (denominator && denominator.length > 0) {
            // For zero input, steady state is 0
            blockState.outputs[0] = 0
          }
          break
      }
      
      // Update frozen outputs with initial values
      blockState.frozenOutputs = [...blockState.outputs]
    }
    
    // Second pass: propagate initial values through the network
    // Run one execution cycle with time = 0 to establish initial outputs
    const savedTime = this.state.time
    this.state.time = 0
    
    // Execute all blocks once to propagate initial values
    for (const blockId of this.executionOrder) {
      const block = this.blocks.find(b => b.id === blockId)
      const blockState = this.state.blockStates.get(blockId)
      
      if (!block || !blockState) continue
      
      // Skip source and input blocks (already initialized)
      if (block.type === 'source' || block.type === 'input_port') {
        continue
      }
      
      // Get inputs
      const inputs = this.getBlockInputs(blockId)
      
      // Execute block to compute initial output
      switch (block.type) {
        case 'sum':
        case 'multiply':
        case 'scale':
          BlockSimulationAdapter.executeBlock(blockId, block, blockState, inputs, this.state)
          break
        case 'transfer_function':
          // For initial computation, just pass through scaled input
          const input = inputs[0] || 0
          const gain = blockState.internalState.numerator[0] / blockState.internalState.denominator[0]
          if (Array.isArray(input)) {
            if (Array.isArray(input[0])) {
              // Matrix
              blockState.outputs[0] = (input as unknown as number[][]).map(row => 
                row.map(val => val * gain)
              )
            } else {
              // Vector
              blockState.outputs[0] = (input as number[]).map(val => val * gain)
            }
          } else {
            blockState.outputs[0] = (input as number) * gain
          }
          break
        case 'lookup_1d':
        case 'lookup_2d':
        case 'output_port':
        case 'sheet_label_sink':
        case 'sheet_label_source':
        case 'matrix_multiply':
        case 'mux':
        case 'demux':
          BlockSimulationAdapter.executeBlock(blockId, block, blockState, inputs, this.state)
          break
      }
      
      // Store computed initial values
      for (let i = 0; i < blockState.outputs.length; i++) {
        const signalKey = `${blockId}_output_${i}`
        this.state.signalValues.set(signalKey, blockState.outputs[i])
      }
      
      // Update frozen outputs
      blockState.frozenOutputs = [...blockState.outputs]
    }
    
    // Restore time
    this.state.time = savedTime
  }

    /**
   * Get current enable state information for debugging
   */
  public getEnableStateInfo(): {
    subsystemStates: Map<string, boolean>,
    subsystemSignals: Map<string, boolean>,
    blockParents: Map<string, string | null>
  } {
    return {
      subsystemStates: new Map(this.state.subsystemEnableStates),
      subsystemSignals: new Map(this.state.subsystemEnableSignals),
      blockParents: new Map(this.state.parentSubsystemMap)
    }
  }
  
  /**
   * Validate enable connections
   */
  public validateEnableConnections(): string[] {
    const errors: string[] = []
    
    // Check all enable connections
    for (const wire of this.wires) {
      if (wire.targetPortIndex === -1) {
        // This is an enable connection
        const targetBlock = this.blocks.find(b => b.id === wire.targetBlockId)
        const sourceBlock = this.blocks.find(b => b.id === wire.sourceBlockId)
        
        if (!targetBlock) {
          errors.push(`Enable wire ${wire.id} has invalid target block ${wire.targetBlockId}`)
          continue
        }
        
        if (!sourceBlock) {
          errors.push(`Enable wire ${wire.id} has invalid source block ${wire.sourceBlockId}`)
          continue
        }
        
        if (targetBlock.type !== 'subsystem') {
          errors.push(`Enable wire ${wire.id} targets non-subsystem block ${targetBlock.name}`)
          continue
        }
        
        if (!targetBlock.parameters?.showEnableInput) {
          errors.push(`Enable wire ${wire.id} targets subsystem ${targetBlock.name} without showEnableInput`)
          continue
        }
        
        // Check source type
        const sourceType = this.getBlockOutputType(sourceBlock, wire.sourcePortIndex)
        if (sourceType && !sourceType.includes('bool')) {
          errors.push(`Enable wire ${wire.id} from ${sourceBlock.name} has non-boolean type: ${sourceType}`)
        }
      }
    }
    
    return errors
  }
  
  /**
   * Get block output type for validation
   */
  private getBlockOutputType(block: BlockData, portIndex: number): string | null {
    if (block.type === 'source' || block.type === 'input_port') {
      return block.parameters?.dataType || 'double'
    }
    
    // For other blocks, we'd need full type propagation
    // For now, just check known boolean sources
    if (block.type === 'source' && block.parameters?.dataType === 'bool') {
      return 'bool'
    }
    
    return null
  }
}
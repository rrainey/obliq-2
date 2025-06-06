// lib/simulationEngine.ts
import { BlockData } from '@/components/Block'
import { WireData } from '@/components/Wire'
import { parseType, ParsedType } from '@/lib/typeValidator'

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
  signalValues: Map<string, number | number[] | boolean | boolean[]>
  sheetLabelValues: Map<string, number | number[] | boolean | boolean[]>
  isRunning: boolean
}

export interface BlockState {
  blockId: string
  blockType: string
  outputs: (number | number[] | boolean | boolean[])[]
  internalState?: any
  outputTypes?: ParsedType[] // Track output types for each port
}

export interface SimulationConfig {
  timeStep: number
  duration: number
}

export interface SimulationResults {
  timePoints: number[]
  signalData: Map<string, (number | number[] | boolean | boolean[])[]>
  finalTime: number
}

export class SimulationEngine {
  private blocks: BlockData[]
  private wires: WireData[]
  private state: SimulationState
  private executionOrder: string[] = []
  private getExternalInput?: (portName: string) => number | number[] | boolean | boolean[] | undefined
  private allSheets: Sheet[] = [] // Store all sheets for subsystem simulation
  private subsystemEngines: Map<string, SimulationEngine> = new Map() // Cache for subsystem engines

  constructor(blocks: BlockData[], wires: WireData[], config: SimulationConfig, externalInputs?: (portName: string) => number | number[] | boolean | boolean[] | undefined, allSheets?: Sheet[]) {
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
      isRunning: false
    }
    this.initializeBlocks()
    this.calculateExecutionOrder()
  }

  private initializeBlocks() {
    for (const block of this.blocks) {
      const outputTypes = this.getBlockOutputTypes(block)
      const blockState: BlockState = {
        blockId: block.id,
        blockType: block.type,
        outputs: this.getInitialOutputs(block.type, block.parameters),
        internalState: this.getInitialInternalState(block.type, block.parameters),
        outputTypes
      }
      this.state.blockStates.set(block.id, blockState)
    }
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

  private getInitialOutputs(blockType: string, parameters?: Record<string, any>): (number | number[] | boolean | boolean[])[] {
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
        return [0] // Single output, actual type determined by inputs
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

  private executeSheetLabelSinkBlock(blockState: BlockState, inputs: (number | number[] | boolean | boolean[])[]) {
    const signalName = blockState.internalState?.signalName
    if (!signalName) return
    
    // Store the input value indexed by signal name
    const input = inputs[0] !== undefined ? inputs[0] : 0
    
    console.log(`DEBUG: Sheet Label Sink '${signalName}' storing value:`, {
      signalName,
      input,
      isArray: Array.isArray(input),
      value: input
    })
    
    this.state.sheetLabelValues.set(signalName, input)
    
    // Also store in internal state for debugging
    blockState.internalState.currentValue = input
  }

  private executeSheetLabelSourceBlock(blockState: BlockState) {
    const signalName = blockState.internalState?.signalName
    if (!signalName) {
      blockState.outputs[0] = 0
      return
    }
    
    // Retrieve the value from sheet label storage
    const value = this.state.sheetLabelValues.get(signalName)
    
    /*
    console.log(`DEBUG: Sheet Label Source '${signalName}' retrieving:`, {
      signalName,
      hasValue: value !== undefined,
      value,
      isArray: Array.isArray(value),
      sheetLabelValues: Array.from(this.state.sheetLabelValues.entries())
    })
    */
    
    if (value !== undefined) {
      blockState.outputs[0] = value
    } else {
      // No sink found or not yet executed
      //console.log(`DEBUG: Sheet Label Source '${signalName}' - no value found, defaulting to 0`)
      blockState.outputs[0] = 0
    }
  }

  private isSourceBlock(blockType: string): boolean {
    return ['input_port', 'source'].includes(blockType)
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

    this.state.time += this.state.timeStep
    return true
  }

  private executeBlock(blockId: string) {
    const block = this.blocks.find(b => b.id === blockId)
    const blockState = this.state.blockStates.get(blockId)
    
    if (!block || !blockState) return

    // Get inputs for this block
    const inputs = this.getBlockInputs(blockId)

    // Execute block logic based on type
    switch (block.type) {
      case 'sum':
        this.executeSumBlock(blockState, inputs)
        break
      case 'multiply':
        this.executeMultiplyBlock(blockState, inputs)
        break
      case 'scale':
        this.executeScaleBlock(blockState, inputs)
        break
      case 'source':
        this.executeSourceBlock(blockState)
        break
      case 'input_port':
        this.executeInputPortBlock(blockState, block.parameters)
        break
      case 'transfer_function':
        this.executeTransferFunctionBlock(blockState, inputs)
        break
      case 'lookup_1d':
        this.executeLookup1DBlock(blockState, inputs)
        break
      case 'lookup_2d':
        this.executeLookup2DBlock(blockState, inputs)
        break
      case 'signal_display':
        this.executeSignalDisplayBlock(blockState, inputs)
        break
      case 'signal_logger':
        this.executeSignalLoggerBlock(blockState, inputs)
        break
      case 'output_port':
        this.executeOutputPortBlock(blockState, inputs)
        break
      case 'subsystem':
        this.executeSubsystemBlock(blockState, inputs)
        break
      case 'sheet_label_sink':
        this.executeSheetLabelSinkBlock(blockState, inputs)
        break
      case 'sheet_label_source':
        this.executeSheetLabelSourceBlock(blockState)
        break
    }

    // Store signal values
    for (let i = 0; i < blockState.outputs.length; i++) {
      const signalKey = `${blockId}_output_${i}`
      this.state.signalValues.set(signalKey, blockState.outputs[i])
    }
  }

  private getBlockInputs(blockId: string): (number | number[] | boolean | boolean[])[] {
    const inputWires = this.wires.filter(wire => wire.targetBlockId === blockId)
    const inputs: (number | number[] | boolean | boolean[])[] = []

    // Sort by port index to ensure correct order
    inputWires.sort((a, b) => a.targetPortIndex - b.targetPortIndex)

    for (const wire of inputWires) {
      const sourceSignalKey = `${wire.sourceBlockId}_output_${wire.sourcePortIndex}`
      const value = this.state.signalValues.get(sourceSignalKey) || 0
      inputs[wire.targetPortIndex] = value
    }

    return inputs
  }

  private executeSumBlock(blockState: BlockState, inputs: (number | number[] | boolean | boolean[])[]) {
    if (inputs.length === 0) {
      blockState.outputs[0] = 0
      return
    }

    // Check if we're dealing with vectors
    const firstInput = inputs[0]
    if (Array.isArray(firstInput)) {
      // Vector addition
      const result = [...firstInput] as number[]
      
      for (let i = 1; i < inputs.length; i++) {
        const input = inputs[i]
        if (Array.isArray(input) && input.length === result.length) {
          // Element-wise addition
          for (let j = 0; j < result.length; j++) {
            result[j] += (input[j] as number) || 0
          }
        } else {
          // Type mismatch - this should have been caught by validation
          console.warn(`Type mismatch in sum block ${blockState.blockId}`)
        }
      }
      
      blockState.outputs[0] = result
    } else {
      // Scalar addition
      let sum = 0
      for (const val of inputs) {
        if (typeof val === 'number') {
          sum += val
        }
      }
      blockState.outputs[0] = sum
    }
  }

  private executeMultiplyBlock(blockState: BlockState, inputs: (number | number[] | boolean | boolean[])[]) {
    if (inputs.length === 0) {
      blockState.outputs[0] = 0
      return
    }
    
    // Check if we're dealing with vectors
    const firstInput = inputs[0]
    if (Array.isArray(firstInput)) {
      // Vector multiplication (element-wise)
      const result = [...firstInput] as number[]
      
      for (let i = 1; i < inputs.length; i++) {
        const input = inputs[i]
        if (Array.isArray(input) && input.length === result.length) {
          // Element-wise multiplication
          for (let j = 0; j < result.length; j++) {
            result[j] *= (input[j] as number) || 0
          }
        } else {
          // Type mismatch
          console.warn(`Type mismatch in multiply block ${blockState.blockId}`)
        }
      }
      
      blockState.outputs[0] = result
    } else {
      // Scalar multiplication
      let product = 1
      for (const val of inputs) {
        if (typeof val === 'number') {
          product *= val
        }
      }
      blockState.outputs[0] = product
    }
  }

  private executeScaleBlock(blockState: BlockState, inputs: (number | number[] | boolean | boolean[])[]) {
    const input = inputs[0]
    const gain = blockState.internalState?.gain || 1
    
    if (Array.isArray(input)) {
      // Scale each element of the vector
      blockState.outputs[0] = input.map(val => 
        typeof val === 'number' ? val * gain : 0
      )
    } else if (typeof input === 'number') {
      blockState.outputs[0] = input * gain
    } else {
      blockState.outputs[0] = 0
    }
  }

  private executeSourceBlock(blockState: BlockState) {
    // Source blocks are the actual signal generators
    const { signalType, dataType } = blockState.internalState
    
    // Parse the data type to check if it's a vector
    let parsedType: ParsedType | null = null
    try {
      parsedType = parseType(dataType || 'double')
    } catch {
      parsedType = { baseType: 'double', isArray: false }
    }
    
    // For constant signal type with vectors, use the value directly
    if (signalType === 'constant' && parsedType.isArray) {
      // Get the block to access its parameters
      const block = this.blocks.find(b => b.id === blockState.blockId)
      if (block && Array.isArray(block.parameters?.value)) {
        blockState.outputs[0] = [...block.parameters.value]
        return
      }
    }
    
    // Generate the signal value (for scalars or non-constant vectors)
    let scalarValue = 0
    const constantValue = blockState.internalState.constantValue
    
    switch (signalType) {
      case 'constant':
        scalarValue = constantValue
        break
        
      case 'step':
        const stepTime = blockState.internalState.stepTime || 1.0
        const stepValue = blockState.internalState.stepValue || constantValue
        scalarValue = this.state.time >= stepTime ? stepValue : 0
        break
        
      case 'ramp':
        const rampSlope = blockState.internalState.slope || 1.0
        const rampStart = blockState.internalState.startTime || 0
        scalarValue = this.state.time >= rampStart ? 
          rampSlope * (this.state.time - rampStart) : 0
        break
        
      case 'sine':
        const frequency = blockState.internalState.frequency || 1.0
        const amplitude = blockState.internalState.amplitude || 1.0
        const phase = blockState.internalState.phase || 0
        const offset = blockState.internalState.offset || 0
        scalarValue = offset + amplitude * Math.sin(2 * Math.PI * frequency * this.state.time + phase)
        break
        
      case 'square':
        const squareFreq = blockState.internalState.frequency || 1.0
        const squareAmplitude = blockState.internalState.amplitude || 1.0
        const period = 1.0 / squareFreq
        const squarePhase = (this.state.time % period) / period
        scalarValue = squarePhase < 0.5 ? squareAmplitude : -squareAmplitude
        break
        
      case 'triangle':
        const triFreq = blockState.internalState.frequency || 1.0
        const triAmplitude = blockState.internalState.amplitude || 1.0
        const triPeriod = 1.0 / triFreq
        const triPhase = (this.state.time % triPeriod) / triPeriod
        if (triPhase < 0.5) {
          scalarValue = triAmplitude * (4 * triPhase - 1)
        } else {
          scalarValue = triAmplitude * (3 - 4 * triPhase)
        }
        break
        
      case 'noise':
        const noiseAmplitude = blockState.internalState.amplitude || 0.1
        const noiseMean = blockState.internalState.mean || 0
        // Simple uniform noise
        scalarValue = noiseMean + noiseAmplitude * (Math.random() - 0.5) * 2
        break
        
      case 'chirp':
        const f0 = blockState.internalState.f0 || 0.1 // Start frequency
        const f1 = blockState.internalState.f1 || 10  // End frequency
        const duration = blockState.internalState.duration || 10
        const chirpAmplitude = blockState.internalState.amplitude || 1.0
        const t = Math.min(this.state.time, duration)
        const freq = f0 + (f1 - f0) * t / duration
        scalarValue = chirpAmplitude * Math.sin(2 * Math.PI * freq * t)
        break
        
      default:
        scalarValue = constantValue
    }
    
    // Apply to vector if needed (for non-constant signal types)
    if (parsedType.isArray && parsedType.arraySize) {
      // For vector output, apply the same signal to all elements
      blockState.outputs[0] = new Array(parsedType.arraySize).fill(scalarValue)
    } else {
      blockState.outputs[0] = scalarValue
    }
  }

  private executeInputPortBlock(blockState: BlockState, parameters?: Record<string, any>) {
    // Input ports represent external inputs from parent subsystem/model
    const defaultValue = parameters?.defaultValue || 0
    const portName = parameters?.portName || `Input_${blockState.blockId}`
    const dataType = parameters?.dataType || 'double'
    
    // Parse the data type to check if it's a vector
    let parsedType: ParsedType | null = null
    try {
      parsedType = parseType(dataType)
    } catch {
      parsedType = { baseType: 'double', isArray: false }
    }
    
    // Check if there's an external input value provided
    const externalValue = this.getExternalInput?.(portName) ?? defaultValue
    
    // For vector types, ensure we have an array
    if (parsedType.isArray && parsedType.arraySize) {
      if (Array.isArray(externalValue)) {
        blockState.outputs[0] = externalValue
      } else {
        // Create array filled with the scalar value
        blockState.outputs[0] = new Array(parsedType.arraySize).fill(externalValue)
      }
    } else {
      blockState.outputs[0] = externalValue
    }
    
    // Store port information for external interface
    blockState.internalState = {
      portName,
      dataType,
      defaultValue,
      isConnectedToParent: false // Would be true in subsystem context
    }
  }

  private executeTransferFunctionBlock(blockState: BlockState, inputs: (number | number[] | boolean | boolean[])[]) {
    const input = inputs[0]
    const { numerator, denominator } = blockState.internalState
    
    // Validate coefficients
    if (!denominator || denominator.length === 0) {
      blockState.outputs[0] = Array.isArray(input) ? new Array(input.length).fill(0) : 0
      return
    }
    
    // Check if input is a vector
    if (Array.isArray(input)) {
      // Initialize vector states if needed
      const vectorSize = input.length
      const stateOrder = Math.max(0, denominator.length - 1)
      
      if (!blockState.internalState.vectorStates || 
          blockState.internalState.vectorStates.length !== vectorSize) {
        // Initialize states for each element
        blockState.internalState.vectorStates = []
        for (let i = 0; i < vectorSize; i++) {
          blockState.internalState.vectorStates.push(new Array(stateOrder).fill(0))
        }
      }
      
      // Process each element independently
      const output = new Array(vectorSize)
      
      for (let idx = 0; idx < vectorSize; idx++) {
        const elementInput = typeof input[idx] === 'number' ? input[idx] as number : 0
        const elementStates = blockState.internalState.vectorStates[idx]
        
        // Apply transfer function to this element
        output[idx] = this.processTransferFunctionElement(
          elementInput,
          numerator,
          denominator,
          elementStates,
          this.state.timeStep
        )
      }
      
      blockState.outputs[0] = output
      
    } else if (typeof input === 'number') {
      // Scalar processing
      const states = blockState.internalState.states
      blockState.outputs[0] = this.processTransferFunctionElement(
        input,
        numerator,
        denominator,
        states,
        this.state.timeStep
      )
    } else {
      blockState.outputs[0] = 0
    }
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

  private executeLookup1DBlock(blockState: BlockState, inputs: (number | number[] | boolean | boolean[])[]) {
    const input = inputs[0]
    
    // Lookup blocks only accept scalar inputs
    if (Array.isArray(input)) {
      console.error(`Lookup1D block ${blockState.blockId} received vector input but expects scalar`)
      blockState.outputs[0] = 0
      return
    }
    
    const scalarInput = typeof input === 'number' ? input : 0
    const { inputValues, outputValues, extrapolation } = blockState.internalState
    
    // Validate that we have data
    if (!inputValues || !outputValues || inputValues.length === 0 || outputValues.length === 0) {
      blockState.outputs[0] = 0
      return
    }
    
    // Ensure arrays are the same length
    const minLength = Math.min(inputValues.length, outputValues.length)
    if (minLength === 0) {
      blockState.outputs[0] = 0
      return
    }
    
    // Single point case
    if (minLength === 1) {
      blockState.outputs[0] = outputValues[0]
      return
    }
    
    // Handle extrapolation cases
    if (scalarInput <= inputValues[0]) {
      if (extrapolation === 'clamp') {
        blockState.outputs[0] = outputValues[0]
      } else { // extrapolate
        if (minLength >= 2) {
          const slope = (outputValues[1] - outputValues[0]) / (inputValues[1] - inputValues[0])
          blockState.outputs[0] = outputValues[0] + slope * (scalarInput - inputValues[0])
        } else {
          blockState.outputs[0] = outputValues[0]
        }
      }
      return
    }
    
    if (scalarInput >= inputValues[minLength - 1]) {
      if (extrapolation === 'clamp') {
        blockState.outputs[0] = outputValues[minLength - 1]
      } else { // extrapolate
        if (minLength >= 2) {
          const slope = (outputValues[minLength - 1] - outputValues[minLength - 2]) / 
                       (inputValues[minLength - 1] - inputValues[minLength - 2])
          blockState.outputs[0] = outputValues[minLength - 1] + slope * (scalarInput - inputValues[minLength - 1])
        } else {
          blockState.outputs[0] = outputValues[minLength - 1]
        }
      }
      return
    }
    
    // Find the interpolation interval
    for (let i = 0; i < minLength - 1; i++) {
      if (scalarInput >= inputValues[i] && scalarInput <= inputValues[i + 1]) {
        // Linear interpolation
        const x0 = inputValues[i]
        const x1 = inputValues[i + 1]
        const y0 = outputValues[i]
        const y1 = outputValues[i + 1]
        
        // Avoid division by zero
        if (x1 === x0) {
          blockState.outputs[0] = y0
        } else {
          const t = (scalarInput - x0) / (x1 - x0)
          blockState.outputs[0] = y0 + t * (y1 - y0)
        }
        return
      }
    }
    
    // Fallback (shouldn't reach here)
    blockState.outputs[0] = outputValues[0]
  }

  private executeLookup2DBlock(blockState: BlockState, inputs: (number | number[] | boolean | boolean[])[]) {
    const input1 = inputs[0]
    const input2 = inputs[1]
    
    // Lookup blocks only accept scalar inputs
    if (Array.isArray(input1) || Array.isArray(input2)) {
      console.error(`Lookup2D block ${blockState.blockId} received vector input but expects scalar inputs`)
      blockState.outputs[0] = 0
      return
    }
    
    const scalarInput1 = typeof input1 === 'number' ? input1 : 0
    const scalarInput2 = typeof input2 === 'number' ? input2 : 0
    const { input1Values, input2Values, outputTable, extrapolation } = blockState.internalState
    
    // Validate that we have data
    if (!input1Values || !input2Values || !outputTable || 
        input1Values.length === 0 || input2Values.length === 0 || outputTable.length === 0) {
      blockState.outputs[0] = 0
      return
    }
    
    // Ensure table dimensions match input arrays
    const rows = input1Values.length
    const cols = input2Values.length
    
    if (outputTable.length !== rows) {
      blockState.outputs[0] = 0
      return
    }
    
    // Single point case
    if (rows === 1 && cols === 1) {
      blockState.outputs[0] = outputTable[0][0] || 0
      return
    }
    
    // Find input1 (row) indices
    let i0 = 0, i1 = 0, t1 = 0
    if (scalarInput1 <= input1Values[0]) {
      i0 = i1 = 0
      t1 = 0
    } else if (scalarInput1 >= input1Values[rows - 1]) {
      i0 = i1 = rows - 1
      t1 = 0
    } else {
      for (let i = 0; i < rows - 1; i++) {
        if (scalarInput1 >= input1Values[i] && scalarInput1 <= input1Values[i + 1]) {
          i0 = i
          i1 = i + 1
          t1 = (input1Values[i + 1] - input1Values[i]) !== 0 ? 
               (scalarInput1 - input1Values[i]) / (input1Values[i + 1] - input1Values[i]) : 0
          break
        }
      }
    }
    
    // Find input2 (column) indices
    let j0 = 0, j1 = 0, t2 = 0
    if (scalarInput2 <= input2Values[0]) {
      j0 = j1 = 0
      t2 = 0
    } else if (scalarInput2 >= input2Values[cols - 1]) {
      j0 = j1 = cols - 1
      t2 = 0
    } else {
      for (let j = 0; j < cols - 1; j++) {
        if (scalarInput2 >= input2Values[j] && scalarInput2 <= input2Values[j + 1]) {
          j0 = j
          j1 = j + 1
          t2 = (input2Values[j + 1] - input2Values[j]) !== 0 ? 
               (scalarInput2 - input2Values[j]) / (input2Values[j + 1] - input2Values[j]) : 0
          break
        }
      }
    }
    
    // Get the four corner values for bilinear interpolation
    const v00 = (outputTable[i0] && outputTable[i0][j0] !== undefined) ? outputTable[i0][j0] : 0
    const v01 = (outputTable[i0] && outputTable[i0][j1] !== undefined) ? outputTable[i0][j1] : 0
    const v10 = (outputTable[i1] && outputTable[i1][j0] !== undefined) ? outputTable[i1][j0] : 0
    const v11 = (outputTable[i1] && outputTable[i1][j1] !== undefined) ? outputTable[i1][j1] : 0
    
    // Bilinear interpolation
    const v0 = v00 + t2 * (v01 - v00)  // Interpolate along input2 axis at i0
    const v1 = v10 + t2 * (v11 - v10)  // Interpolate along input2 axis at i1
    const result = v0 + t1 * (v1 - v0) // Interpolate along input1 axis
    
    // Handle extrapolation if needed
    if (extrapolation === 'clamp') {
      // Clamping is already handled by the index finding logic above
      blockState.outputs[0] = result
    } else {
      // For extrapolation, we could extend the gradients, but for now use the result
      blockState.outputs[0] = result
    }
  }

  private executeSignalDisplayBlock(blockState: BlockState, inputs: (number | number[] | boolean | boolean[])[]) {
    const input = inputs[0]
    const { samples, maxSamples } = blockState.internalState
    
    // Store the current input value
    // For vectors, we'll store the entire vector
    samples.push(input)
    
    // Maintain maximum sample count
    if (samples.length > maxSamples) {
      samples.shift()
    }
    
    // Signal display blocks don't produce outputs to other blocks
    // but we store the current value for external access
    blockState.internalState.currentValue = input
  }

  private executeSignalLoggerBlock(blockState: BlockState, inputs: (number | number[] | boolean | boolean[])[]) {
    const input = inputs[0]
    const { loggedData, timeStamps } = blockState.internalState
    
    // Store both the value and timestamp
    // For vectors, we'll store the entire vector
    loggedData.push(input)
    timeStamps.push(this.state.time)
    
    // Signal logger blocks don't produce outputs to other blocks
    // but we store the current value for external access
    blockState.internalState.currentValue = input
  }

  private executeOutputPortBlock(blockState: BlockState, inputs: (number | number[] | boolean | boolean[])[]) {
    // Output ports represent external outputs to parent subsystem/model
    const input = inputs[0]
    const portName = blockState.internalState?.portName || `Output_${blockState.blockId}`
    
    // Store the current input value for external access
    // Handles both scalar and vector values
    blockState.internalState = {
      portName,
      currentValue: input,
      isConnectedToParent: false // Would be true in subsystem context
    }
    
    // Output ports don't produce outputs to other blocks within the same level
  }

  private executeSubsystemBlock(blockState: BlockState, inputs: (number | number[] | boolean | boolean[])[]) {
    const { sheetId, inputPorts, outputPorts } = blockState.internalState
    
    // If no sheet is referenced, fall back to pass-through behavior
    if (!sheetId || !this.allSheets.length) {
      // Simple pass-through: map inputs to outputs
      for (let i = 0; i < outputPorts.length; i++) {
        blockState.outputs[i] = inputs[i] || 0
      }
      blockState.internalState.currentOutputs = [...blockState.outputs]
      return
    }
    
    // Find the referenced sheet
    const referencedSheet = this.allSheets.find(sheet => sheet.id === sheetId)
    if (!referencedSheet) {
      console.warn(`Subsystem references non-existent sheet: ${sheetId}`)
      // Fall back to pass-through
      for (let i = 0; i < outputPorts.length; i++) {
        blockState.outputs[i] = inputs[i] || 0
      }
      blockState.internalState.currentOutputs = [...blockState.outputs]
      return
    }
    
    // Get or create subsystem simulation engine
    let subsystemEngine = this.subsystemEngines.get(blockState.blockId)
    if (!subsystemEngine) {
      // Create external input provider for subsystem
      const subsystemInputProvider = (portName: string) => {
        // Map subsystem input port names to actual input values
        const portIndex = inputPorts.findIndex((port: string) => port === portName)
        return portIndex >= 0 ? inputs[portIndex] : 0
      }
      
      // Create simulation config matching parent
      const subsystemConfig = {
        timeStep: this.state.timeStep,
        duration: this.state.duration
      }
      
      // Create subsystem engine with the referenced sheet's blocks and connections
      subsystemEngine = new SimulationEngine(
        referencedSheet.blocks,
        referencedSheet.connections,
        subsystemConfig,
        subsystemInputProvider,
        this.allSheets // Pass sheets for nested subsystems
      )
      
      // Cache the engine
      this.subsystemEngines.set(blockState.blockId, subsystemEngine)
    }
    
    // Update subsystem's external inputs (input ports in the subsystem)
    const subsystemInputProvider = (portName: string) => {
      const portIndex = inputPorts.findIndex((port: string) => port === portName)
      return portIndex >= 0 ? inputs[portIndex] : 0
    }
    
    // Update the subsystem engine's external input provider
    subsystemEngine.updateExternalInputs(subsystemInputProvider)
    
    // Synchronize subsystem time with parent
    subsystemEngine.syncTime(this.state.time)
    
    // Execute one step of the subsystem
    subsystemEngine.step()
    
    // Get output port values from the subsystem
    const subsystemOutputs = subsystemEngine.getOutputPortValues()
    
    // Map subsystem outputs to this block's outputs
    for (let i = 0; i < outputPorts.length; i++) {
      const outputPortName = outputPorts[i]
      const outputValue = subsystemOutputs.get(outputPortName) || 0
      blockState.outputs[i] = outputValue
    }
    
    // Store current outputs for debugging/inspection
    blockState.internalState.currentOutputs = [...blockState.outputs]
  }

  // Helper method to update external inputs (for subsystem simulation)
  public updateExternalInputs(inputProvider: (portName: string) => number | number[] | boolean | boolean[] | undefined) {
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
    const signalData = new Map<string, (number | number[] | boolean | boolean[])[]>()

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

  public getLoggedData(blockId: string): { timeStamps: number[], values: (number | number[] | boolean | boolean[])[] } | null {
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
    const blockData = new Map<string, { timeStamps: number[], values: (number | number[] | boolean | boolean[])[] }>()
    
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

  public getOutputPortValues(): Map<string, number | number[] | boolean | boolean[]> {
    const outputValues = new Map<string, number | number[] | boolean | boolean[]>()
    
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

  public getOutputPortValue(portName: string): number | number[] | boolean | boolean[] | undefined {
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
}
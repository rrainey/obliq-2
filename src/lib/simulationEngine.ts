import { BlockData } from '@/components/Block'
import { WireData } from '@/components/Wire'

export interface SimulationState {
  time: number
  timeStep: number
  duration: number
  blockStates: Map<string, BlockState>
  signalValues: Map<string, number>
  isRunning: boolean
}

export interface BlockState {
  blockId: string
  blockType: string
  outputs: number[]
  internalState?: any
}

export interface SimulationConfig {
  timeStep: number
  duration: number
}

export interface SimulationResults {
  timePoints: number[]
  signalData: Map<string, number[]>
  finalTime: number
}

export class SimulationEngine {
  private blocks: BlockData[]
  private wires: WireData[]
  private state: SimulationState
  private executionOrder: string[] = []
  private getExternalInput?: (portName: string) => number | undefined

  constructor(blocks: BlockData[], wires: WireData[], config: SimulationConfig, externalInputs?: (portName: string) => number | undefined) {
    this.blocks = blocks
    this.wires = wires
    this.getExternalInput = externalInputs
    this.state = {
      time: 0,
      timeStep: config.timeStep,
      duration: config.duration,
      blockStates: new Map(),
      signalValues: new Map(),
      isRunning: false
    }
    this.initializeBlocks()
    this.calculateExecutionOrder()
  }

  private initializeBlocks() {
    for (const block of this.blocks) {
      const blockState: BlockState = {
        blockId: block.id,
        blockType: block.type,
        outputs: this.getInitialOutputs(block.type),
        internalState: this.getInitialInternalState(block.type, block.parameters)
      }
      this.state.blockStates.set(block.id, blockState)
    }
  }

  private getInitialOutputs(blockType: string): number[] {
    switch (blockType) {
      case 'sum':
      case 'multiply':
      case 'scale':
      case 'transfer_function':
      case 'lookup_1d':
      case 'lookup_2d':
        return [0] // Single output
      case 'input_port':
      case 'source':
        return [0] // Single output
      case 'output_port':
      case 'signal_display':
      case 'signal_logger':
        return [] // No outputs
      case 'subsystem':
        return [0] // Can be configured
      default:
        return []
    }
  }

  private getInitialInternalState(blockType: string, parameters?: Record<string, any>): any {
    switch (blockType) {
      case 'source':
        return {
          constantValue: parameters?.value || 0,
          signalType: parameters?.signalType || 'constant',
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
        return {
          numerator,
          denominator,
          // State vector for the transfer function (order = denominator.length - 1)
          states: new Array(Math.max(0, denominator.length - 1)).fill(0),
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
    }

    // Store signal values
    for (let i = 0; i < blockState.outputs.length; i++) {
      const signalKey = `${blockId}_output_${i}`
      this.state.signalValues.set(signalKey, blockState.outputs[i])
    }
  }

  private getBlockInputs(blockId: string): number[] {
    const inputWires = this.wires.filter(wire => wire.targetBlockId === blockId)
    const inputs: number[] = []

    // Sort by port index to ensure correct order
    inputWires.sort((a, b) => a.targetPortIndex - b.targetPortIndex)

    for (const wire of inputWires) {
      const sourceSignalKey = `${wire.sourceBlockId}_output_${wire.sourcePortIndex}`
      const value = this.state.signalValues.get(sourceSignalKey) || 0
      inputs[wire.targetPortIndex] = value
    }

    return inputs
  }

  private executeSumBlock(blockState: BlockState, inputs: number[]) {
    const sum = inputs.reduce((acc, val) => acc + (val || 0), 0)
    blockState.outputs[0] = sum
  }

  private executeMultiplyBlock(blockState: BlockState, inputs: number[]) {
    // Handle empty inputs case
    if (inputs.length === 0) {
      blockState.outputs[0] = 0
      return
    }
    
    // Multiply all inputs together
    const product = inputs.reduce((acc, val) => acc * (val || 0), 1)
    blockState.outputs[0] = product
  }

  private executeScaleBlock(blockState: BlockState, inputs: number[]) {
    const input = inputs[0] || 0
    const gain = blockState.internalState?.gain || 1
    blockState.outputs[0] = input * gain
  }

  private executeSourceBlock(blockState: BlockState) {
    // Source blocks are the actual signal generators
    const { constantValue, signalType } = blockState.internalState
    
    switch (signalType) {
      case 'constant':
        blockState.outputs[0] = constantValue
        break
        
      case 'step':
        const stepTime = blockState.internalState.stepTime || 1.0
        const stepValue = blockState.internalState.stepValue || constantValue
        blockState.outputs[0] = this.state.time >= stepTime ? stepValue : 0
        break
        
      case 'ramp':
        const rampSlope = blockState.internalState.slope || 1.0
        const rampStart = blockState.internalState.startTime || 0
        blockState.outputs[0] = this.state.time >= rampStart ? 
          rampSlope * (this.state.time - rampStart) : 0
        break
        
      case 'sine':
        const frequency = blockState.internalState.frequency || 1.0
        const amplitude = blockState.internalState.amplitude || 1.0
        const phase = blockState.internalState.phase || 0
        const offset = blockState.internalState.offset || 0
        blockState.outputs[0] = offset + amplitude * Math.sin(2 * Math.PI * frequency * this.state.time + phase)
        break
        
      case 'square':
        const squareFreq = blockState.internalState.frequency || 1.0
        const squareAmplitude = blockState.internalState.amplitude || 1.0
        const period = 1.0 / squareFreq
        const squarePhase = (this.state.time % period) / period
        blockState.outputs[0] = squarePhase < 0.5 ? squareAmplitude : -squareAmplitude
        break
        
      case 'triangle':
        const triFreq = blockState.internalState.frequency || 1.0
        const triAmplitude = blockState.internalState.amplitude || 1.0
        const triPeriod = 1.0 / triFreq
        const triPhase = (this.state.time % triPeriod) / triPeriod
        if (triPhase < 0.5) {
          blockState.outputs[0] = triAmplitude * (4 * triPhase - 1)
        } else {
          blockState.outputs[0] = triAmplitude * (3 - 4 * triPhase)
        }
        break
        
      case 'noise':
        const noiseAmplitude = blockState.internalState.amplitude || 0.1
        const noiseMean = blockState.internalState.mean || 0
        // Simple uniform noise
        blockState.outputs[0] = noiseMean + noiseAmplitude * (Math.random() - 0.5) * 2
        break
        
      case 'chirp':
        const f0 = blockState.internalState.f0 || 0.1 // Start frequency
        const f1 = blockState.internalState.f1 || 10  // End frequency
        const duration = blockState.internalState.duration || 10
        const chirpAmplitude = blockState.internalState.amplitude || 1.0
        const t = Math.min(this.state.time, duration)
        const freq = f0 + (f1 - f0) * t / duration
        blockState.outputs[0] = chirpAmplitude * Math.sin(2 * Math.PI * freq * t)
        break
        
      default:
        blockState.outputs[0] = constantValue
    }
  }

  private executeInputPortBlock(blockState: BlockState, parameters?: Record<string, any>) {
    // Input ports represent external inputs from parent subsystem/model
    // In simulation, they act as interface points where external signals enter
    // For top-level models, they can have default values or be driven externally
    // For subsystems, they receive values from the parent model connections
    
    // For now, during simulation of top-level models, use a default value
    // In a real hierarchical system, this would be driven by parent model
    const defaultValue = parameters?.defaultValue || 0
    const portName = parameters?.portName || `Input_${blockState.blockId}`
    
    // Check if there's an external input value provided
    // This would come from parent subsystem in hierarchical models
    const externalValue = this.getExternalInput?.(portName) ?? defaultValue
    
    blockState.outputs[0] = externalValue
    
    // Store port information for external interface
    blockState.internalState = {
      portName,
      defaultValue,
      isConnectedToParent: false // Would be true in subsystem context
    }
  }

  private executeTransferFunctionBlock(blockState: BlockState, inputs: number[]) {
    const input = inputs[0] || 0
    const { numerator, denominator, states, prevInput, prevOutput } = blockState.internalState
    
    // Implement transfer function using state-space representation
    // For a transfer function H(s) = N(s)/D(s), we convert to state-space form
    
    if (denominator.length === 1) {
      // Pure gain case: H(s) = K
      blockState.outputs[0] = input * (numerator[0] / denominator[0])
      return
    }
    
    if (denominator.length === 2) {
      // First order system: H(s) = b0 / (a1*s + a0)
      // Differential equation: a1*dy/dt + a0*y = b0*u
      // Rearranged: dy/dt = (-a0/a1)*y + (b0/a1)*u
      
      const a0 = denominator[0] // constant term
      const a1 = denominator[1] // s term coefficient
      const b0 = numerator[0] || 0 // numerator constant
      
      if (a1 === 0) {
        // Avoid division by zero
        blockState.outputs[0] = 0
        return
      }
      
      // Current state is the output (for first-order system)
      const currentState = states[0]
      
      // Calculate derivative using Runge-Kutta 4th order method
      const h = this.state.timeStep
      
      const f = (y: number, u: number) => (-a0 / a1) * y + (b0 / a1) * u
      
      const k1 = f(currentState, input)
      const k2 = f(currentState + 0.5 * h * k1, input)
      const k3 = f(currentState + 0.5 * h * k2, input)
      const k4 = f(currentState + h * k3, input)
      
      // Update state using RK4
      states[0] = currentState + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4)
      
      // For a first-order system, output equals the state
      blockState.outputs[0] = states[0]
    }
    else if (denominator.length === 3) {
      // Second order system: H(s) = (b1*s + b0) / (a2*s^2 + a1*s + a0)
      // State space: x1 = y, x2 = dy/dt
      // dx1/dt = x2
      // dx2/dt = (-a0/a2)*x1 + (-a1/a2)*x2 + (b0/a2)*u
      
      const a0 = denominator[0]
      const a1 = denominator[1]
      const a2 = denominator[2]
      const b0 = numerator[0] || 0
      const b1 = numerator[1] || 0
      
      if (a2 === 0) {
        // Degenerate to first-order case
        blockState.outputs[0] = 0
        return
      }
      
      const x1 = states[0] // position (output)
      const x2 = states[1] || 0 // velocity (derivative)
      
      const h = this.state.timeStep
      
      // System equations
      const f1 = (x1: number, x2: number, u: number) => x2
      const f2 = (x1: number, x2: number, u: number) => (-a0 / a2) * x1 + (-a1 / a2) * x2 + (b0 / a2) * u
      
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
      
      // Output calculation: y = b1*x2 + b0*x1 (if numerator has derivative term)
      if (numerator.length > 1) {
        blockState.outputs[0] = b1 * states[1] + b0 * states[0]
      } else {
        blockState.outputs[0] = states[0]
      }
    }
    else {
      // Higher order systems - simplified implementation
      // For now, treat as first-order with the dominant pole
      const timeConstant = denominator[1] / denominator[denominator.length - 1]
      const gain = numerator[0] / denominator[0]
      
      const currentState = states[0]
      const derivative = (gain * input - currentState) / timeConstant
      states[0] = currentState + derivative * this.state.timeStep
      
      blockState.outputs[0] = states[0]
    }
    
    // Update previous values for next iteration
    blockState.internalState.prevInput = input
    blockState.internalState.prevOutput = blockState.outputs[0]
  }

  private executeLookup1DBlock(blockState: BlockState, inputs: number[]) {
    const input = inputs[0] || 0
    const { inputValues, outputValues } = blockState.internalState
    
    // Linear interpolation
    const result = this.interpolate1D(input, inputValues, outputValues)
    blockState.outputs[0] = result
  }

  private executeLookup2DBlock(blockState: BlockState, inputs: number[]) {
    const input1 = inputs[0] || 0
    const input2 = inputs[1] || 0
    const { input1Values, input2Values, outputTable } = blockState.internalState
    
    // Bilinear interpolation
    const result = this.interpolate2D(input1, input2, input1Values, input2Values, outputTable)
    blockState.outputs[0] = result
  }

  private executeSignalDisplayBlock(blockState: BlockState, inputs: number[]) {
    const input = inputs[0] || 0
    const { samples, maxSamples } = blockState.internalState
    
    // Store the current input value
    samples.push(input)
    
    // Maintain maximum sample count
    if (samples.length > maxSamples) {
      samples.shift()
    }
    
    // Signal display blocks don't produce outputs to other blocks
    // but we store the current value for external access
    blockState.internalState.currentValue = input
  }

  private executeSignalLoggerBlock(blockState: BlockState, inputs: number[]) {
    const input = inputs[0] || 0
    const { loggedData, timeStamps } = blockState.internalState
    
    // Store both the value and timestamp
    loggedData.push(input)
    timeStamps.push(this.state.time)
    
    // Signal logger blocks don't produce outputs to other blocks
    // but we store the current value for external access
    blockState.internalState.currentValue = input
  }

  private executeOutputPortBlock(blockState: BlockState, inputs: number[]) {
    // Output ports just pass the input through (for monitoring)
    // They don't produce outputs to other blocks
    const input = inputs[0] || 0
    // Store the value for external access if needed
    blockState.internalState = { value: input }
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
    const signalData = new Map<string, number[]>()

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
            const value = inputs[0] || 0
            const dataArray = signalData.get(block.id)
            if (dataArray) {
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

  public getLoggedData(blockId: string): { timeStamps: number[], values: number[] } | null {
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
    
    let csv = 'Time,Value\n'
    for (let i = 0; i < data.timeStamps.length; i++) {
      csv += `${data.timeStamps[i]},${data.values[i]}\n`
    }
    
    return csv
  }

  public exportAllLoggedDataAsCSV(): string {
    const loggerBlocks = this.blocks.filter(block => block.type === 'signal_logger')
    if (loggerBlocks.length === 0) {
      return ''
    }
    
    // Find the maximum number of samples across all loggers
    let maxSamples = 0
    const blockData = new Map<string, { timeStamps: number[], values: number[] }>()
    
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
      csv += `,${block.name}`
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
          row += `,${data.values[i]}`
        } else {
          row += ','
        }
      }
      
      csv += row + '\n'
    }
    
    return csv
  }

  public reset() {
    this.state.time = 0
    this.state.isRunning = false
    this.initializeBlocks()
  }
}
// __tests__/utils/TestModelBuilder.ts

import { Sheet } from '@/lib/simulationEngine'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'

export interface TestModelMetadata {
  testInputs?: { [portName: string]: number | number[] | boolean }
  expectedOutputs?: { [portName: string]: number | number[] }
  expectedOutput?: number // For single output models
  description?: string
  tolerance?: number // Default 0.001 (0.1%)
}

export interface TestModel {
  sheets: Sheet[]
  metadata: TestModelMetadata
  globalSettings: {
    simulationDuration: number
    simulationTimeStep: number
  }
}

/**
 * Fluent API for building test models
 */
export class TestModelBuilder {
  private sheets: Map<string, Sheet> = new Map()
  private currentSheet: Sheet | null = null
  private blockCounter: Map<string, number> = new Map()
  private metadata: TestModelMetadata = {}
  private simulationDuration: number = 10.0
  private simulationTimeStep: number = 0.01
  private nextPosition = { x: 100, y: 100 }
  private positionIncrement = { x: 150, y: 100 }

  constructor(private modelName: string = 'TestModel') {
    // Start with a main sheet
    this.addSheet('main', 'Main')
  }

  /**
   * Add a new sheet to the model
   */
  addSheet(id: string, name: string): this {
    const sheet: Sheet = {
      id,
      name,
      blocks: [],
      connections: [],
      extents: { width: 1000, height: 800 }
    }
    this.sheets.set(id, sheet)
    this.currentSheet = sheet
    this.nextPosition = { x: 100, y: 100 }
    return this
  }

  /**
   * Switch to a different sheet
   */
  switchToSheet(id: string): this {
    const sheet = this.sheets.get(id)
    if (!sheet) {
      throw new Error(`Sheet ${id} not found`)
    }
    this.currentSheet = sheet
    return this
  }

  /**
   * Set simulation parameters
   */
  withSimulationParams(duration: number, timeStep: number): this {
    this.simulationDuration = duration
    this.simulationTimeStep = timeStep
    return this
  }

  /**
   * Set test inputs
   */
  withTestInputs(inputs: { [portName: string]: number | number[] | boolean }): this {
    this.metadata.testInputs = inputs
    return this
  }

  /**
   * Set expected outputs
   */
  withExpectedOutputs(outputs: { [portName: string]: number | number[] }): this {
    this.metadata.expectedOutputs = outputs
    return this
  }

  /**
   * Set single expected output (convenience method)
   */
  withExpectedOutput(value: number): this {
    this.metadata.expectedOutput = value
    return this
  }

  /**
   * Set tolerance for comparisons
   */
  withTolerance(tolerance: number): this {
    this.metadata.tolerance = tolerance
    return this
  }

  /**
   * Set description
   */
  withDescription(description: string): this {
    this.metadata.description = description
    return this
  }

  /**
   * Add an input port block
   */
  addInput(portName: string, dataType: string = 'double'): this {
    const block = this.createBlock('input_port', portName, {
      portName,
      dataType,
      defaultValue: 0
    })
    this.addBlockToCurrentSheet(block)
    return this
  }

  /**
   * Add an output port block
   */
  addOutput(portName: string, result?: BlockData[]): this {
    const block = this.createBlock('output_port', portName, {
      portName
    })
    this.addBlockToCurrentSheet(block)
    if (result) {
      result.push(block)
    }
    return this
  }

    /**
     * Add a source block
     */
    addSource(value: number | number[] | boolean, dataType?: string, result?: BlockData[]): this {
        const blockType = 'source'
        const name = this.generateBlockName(blockType)

        const parameters: any = {
            signalType: 'constant',
            value
        }

        // Infer data type if not provided
        if (!dataType) {
            if (typeof value === 'boolean') {
                dataType = 'bool'
            } else if (Array.isArray(value)) {
                dataType = `double[${value.length}]`
            } else {
                dataType = 'double'
            }
        }
        parameters.dataType = dataType

        const block = this.createBlock(blockType, name, parameters)
        this.addBlockToCurrentSheet(block)

        if (result) {
            result.push(block)
        }
        return this
    }

    /**
     * Add a sum block
     */
    addSum(signs: string = '++', result?: BlockData[]): this {
        const block = this.createBlock('sum', this.generateBlockName('sum'), {
            signs,
            numInputs: signs.length
        })
        this.addBlockToCurrentSheet(block)
        if (result) {
            result.push(block)
        }
        return this
    }

  /**
   * Add a multiply block
   */
  addMultiply(numInputs: number = 2, result?: BlockData[]): this {
    const block = this.createBlock('multiply', this.generateBlockName('multiply'), { 
      inputs: numInputs 
    })
    this.addBlockToCurrentSheet(block)
    if (result) {
      result.push(block)
    }   
    return this
  }

  /**
   * Add a scale block
   */
  addScale(gain: number, result?: BlockData[]): this {
    const block = this.createBlock('scale', this.generateBlockName('scale'), { gain })
    this.addBlockToCurrentSheet(block)
    if (result) {
      result.push(block)
    }
    return this
  }

  /**
   * Add a transfer function block
   */
  addTransferFunction(numerator: number[], denominator: number[], result?: BlockData[]): this {
    const block = this.createBlock('transfer_function', this.generateBlockName('transfer_function'), {
      numerator,
      denominator
    })
    this.addBlockToCurrentSheet(block)
    if (result) {
      result.push(block)
    }
    return this
  }

  /**
   * Add a 1D lookup table
   */
  addLookup1D(inputValues: number[], outputValues: number[], extrapolation: string = 'clamp', result?: BlockData[]): this {
    const block = this.createBlock('lookup_1d', this.generateBlockName('lookup_1d'), {
      inputValues,
      outputValues,
      extrapolation
    })
    if (result) {
      result.push(block)
    }
    this.addBlockToCurrentSheet(block)
    return this
  }

 /**
   * Add a 2D lookup table
   */
    addLookup2D(
        input1Values: number[],
        input2Values: number[],
        outputTable: number[][],
        extrapolation: string = 'clamp',
        result?: BlockData[]
    ): this {
        const block = this.createBlock('lookup_2d', this.generateBlockName('lookup_2d'), {
            input1Values,
            input2Values,
            outputTable,
            extrapolation
        })

        this.addBlockToCurrentSheet(block)

        if (result) {
            result.push(block)
        }

        return this
    }

    /**
     * Add a matrix multiply block
     */
    addMatrixMultiply(result?: BlockData[]): this {
        const block = this.createBlock('matrix_multiply', this.generateBlockName('matrix_multiply'), {})
        this.addBlockToCurrentSheet(block)
        if (result) {
            result.push(block)
        }
        return this
    }

  /**
   * Add a mux block
   */
  addMux(rows: number, cols: number, result?: BlockData[]): this {
    const block = this.createBlock('mux', this.generateBlockName('mux'), {
      rows,
      cols
    })
    if (result) {
      result.push(block)
    }
    this.addBlockToCurrentSheet(block)
    return this
  }

  /**
   * Add a demux block
   */
  addDemux(result?: BlockData[]): this {
    const block = this.createBlock('demux', this.generateBlockName('demux'), {})
    this.addBlockToCurrentSheet(block)
    if (result) {
      result.push(block)
    }
    return this
  }

  /**
   * Add a sheet label sink
   */
  addSheetLabelSink(signalName: string, result?: BlockData[]): this {
    const block = this.createBlock('sheet_label_sink', this.generateBlockName('sheet_label_sink'), {
      signalName
    })
    this.addBlockToCurrentSheet(block)
    if (result) {
      result.push(block)
    }
    return this
  }

  /**
   * Add a sheet label source
   */
  addSheetLabelSource(signalName: string, result?: BlockData[]): this {
    const block = this.createBlock('sheet_label_source', this.generateBlockName('sheet_label_source'), {
      signalName
    })
    this.addBlockToCurrentSheet(block)
    if (result) {
      result.push(block)
    }
    return this
  }

  /**
   * Add a subsystem block
   */
  addSubsystem(
    name: string,
    inputPorts: string[],
    outputPorts: string[],
    sheets: Sheet[],
    showEnableInput: boolean = false, 
    result?: BlockData[]
  ): this {
    const block = this.createBlock('subsystem', name, {
      inputPorts,
      outputPorts,
      sheets,
      showEnableInput
    })
    this.addBlockToCurrentSheet(block)
    if (result) {
      result.push(block)
    }
    return this
  }

  /**
   * Create a subsystem builder for nested construction
   */
  createSubsystem(name: string): SubsystemBuilder {
    return new SubsystemBuilder(name, this)
  }

  /**
   * Connect two blocks
   */
  connect(
    sourceBlockId: string,
    targetBlockId: string,
    sourcePortIndex: number = 0,
    targetPortIndex: number = 0
  ): this {
    if (!this.currentSheet) {
      throw new Error('No current sheet selected')
    }

    const connection: WireData = {
      id: `wire_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sourceBlockId,
      sourcePortIndex,
      targetBlockId,
      targetPortIndex
    }

    this.currentSheet.connections.push(connection)
    return this
  }

  /**
   * Connect blocks by name (convenience method)
   */
  connectByName(
    sourceBlockName: string,
    targetBlockName: string,
    sourcePortIndex: number = 0,
    targetPortIndex: number = 0
  ): this {
    if (!this.currentSheet) {
      throw new Error('No current sheet selected')
    }

    const sourceBlock = this.currentSheet.blocks.find(b => b.name === sourceBlockName)
    const targetBlock = this.currentSheet.blocks.find(b => b.name === targetBlockName)

    if (!sourceBlock || !targetBlock) {
      throw new Error(`Could not find blocks: ${sourceBlockName} -> ${targetBlockName}`)
    }

    return this.connect(sourceBlock.id, targetBlock.id, sourcePortIndex, targetPortIndex)
  }

  /**
   * Build the final model
   */
  build(): TestModel {
    return {
      sheets: Array.from(this.sheets.values()),
      metadata: {
        ...this.metadata,
        description: this.metadata.description || this.modelName
      },
      globalSettings: {
        simulationDuration: this.simulationDuration,
        simulationTimeStep: this.simulationTimeStep
      }
    }
  }

  /**
   * Create a simple feedback control system
   */
  static createPIDController(setpoint: number = 1.0, kp: number = 1.0, ki: number = 0.1, kd: number = 0.01): TestModel {
    const builder = new TestModelBuilder('PID Controller Test')
      .withSimulationParams(10.0, 0.01)
      .withTestInputs({ Setpoint: setpoint })
      .withExpectedOutputs({ Output: setpoint }) // Should converge to setpoint
      .withTolerance(0.05) // 5% tolerance for PID convergence

    // Add blocks
    builder.addInput('Setpoint')
    let blockInfo = new Array<BlockData>()
    builder.addTransferFunction([1], [1, 2, 1], blockInfo) // Second order system
    const plant = blockInfo[0].id
    blockInfo = []

    builder.addOutput('Output', blockInfo)
    const output = blockInfo[0].id
    blockInfo = []
    
    // Create PID components
    builder.addSum('+-', blockInfo)
    const error = blockInfo[0].id
    blockInfo = []
    builder.addScale(kp, blockInfo)
    const pGain = blockInfo[0].id
    blockInfo = []
    builder.addScale(ki, blockInfo)
    const iGain = blockInfo[0].id
    blockInfo = []
    builder.addScale(kd, blockInfo)
    const dGain = blockInfo[0].id
    blockInfo = []
    builder.addTransferFunction([1], [1, 0], blockInfo)
    const integrator = blockInfo[0].id // Integrator block
    blockInfo = []
    builder.addTransferFunction([1, 0], [0.01, 1], blockInfo) // With filter
    const differentiator = blockInfo[0].id // Differentiator block 
    blockInfo = []
    builder.addSum('+++', blockInfo)
    const pidSum = blockInfo[0].id // PID sum block 
    blockInfo = []

    // Connect PID
    builder
      .connectByName('Setpoint', 'Sum1', 0, 0)
      .connect(plant, error, 0, 1)
      .connect(error, pGain)
      .connect(error, integrator)
      .connect(integrator, iGain)
      .connect(error, differentiator)
      .connect(differentiator, dGain)
      .connect(pGain, pidSum, 0, 0)
      .connect(iGain, pidSum, 0, 1)
      .connect(dGain, pidSum, 0, 2)
      .connect(pidSum, plant)
      .connect(plant, output)

    return builder.build()
  }

  // Private helper methods
  private createBlock(type: string, name: string, parameters: any): BlockData {
    const id = `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const position = { ...this.nextPosition }
    
    // Update position for next block
    this.nextPosition.x += this.positionIncrement.x
    if (this.nextPosition.x > 800) {
      this.nextPosition.x = 100
      this.nextPosition.y += this.positionIncrement.y
    }

    return {
      id,
      type,
      name,
      position,
      parameters
    }
  }

  private addBlockToCurrentSheet(block: BlockData): void {
    if (!this.currentSheet) {
      throw new Error('No current sheet selected')
    }
    this.currentSheet.blocks.push(block)
  }

  private generateBlockName(blockType: string): string {
    // Clean up block type for name
    const cleanType = blockType
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
    
    const count = (this.blockCounter.get(cleanType) || 0) + 1
    this.blockCounter.set(cleanType, count)
    
    return `${cleanType}${count}`
  }
}

/**
 * Helper class for building subsystems
 */
export class SubsystemBuilder {
  private sheets: Sheet[] = []
  private inputPorts: string[] = []
  private outputPorts: string[] = []
  private showEnableInput: boolean = false
  private currentBuilder: TestModelBuilder
  private subsystemBlock?: BlockData // Store reference to the created subsystem block

  constructor(private name: string, private parentBuilder: TestModelBuilder) {
    this.currentBuilder = new TestModelBuilder(`${name}_internal`)
  }

  addInputPort(portName: string): this {
    this.inputPorts.push(portName)
    return this
  }

  addOutputPort(portName: string): this {
    this.outputPorts.push(portName)
    return this
  }

  withEnableInput(): this {
    this.showEnableInput = true
    return this
  }

  configureInternals(configureFn: (builder: TestModelBuilder) => void): this {
    configureFn(this.currentBuilder)
    return this
  }

  build(): TestModelBuilder {  // Change return type to TestModelBuilder
    const internalModel = this.currentBuilder.build()
    
    // Create array to capture the subsystem block
    const result: BlockData[] = []
    
    // Add subsystem to parent and capture the block
    this.parentBuilder.addSubsystem(
      this.name,
      this.inputPorts,
      this.outputPorts,
      internalModel.sheets,
      this.showEnableInput,
      result  // Pass array to capture the block
    )
    
    // Store reference to the subsystem block
    if (result.length > 0) {
      this.subsystemBlock = result[0]
    }
    
    return this.parentBuilder  // Return the parent builder for chaining
  }

  // Add a method to get the subsystem block ID after building
  getBlockId(): string | undefined {
    return this.subsystemBlock?.id
  }
}

// Example usage functions
export class TestModelExamples {
  static createSimpleGainModel(): TestModel {
    return new TestModelBuilder('Simple Gain')
      .withTestInputs({ Input1: 5.0 })
      .withExpectedOutputs({ Output1: 15.0 })
      .addInput('Input1')
      .addScale(3.0)
      .addOutput('Output1')
      .connectByName('Input1', 'Scale1')
      .connectByName('Scale1', 'Output1')
      .build()
  }

  static createMatrixMultiplicationModel(): TestModel {
    return new TestModelBuilder('Matrix Multiplication')
      .withTestInputs({ 
        MatrixA: [1, 2, 3, 4], // 2x2
        MatrixB: [5, 6, 7, 8]  // 2x2
      })
      .withExpectedOutputs({ 
        Result: [19, 22, 43, 50] // 2x2 result
      })
      .addInput('MatrixA', 'double[2][2]')
      .addInput('MatrixB', 'double[2][2]')
      .addMatrixMultiply()
      .addOutput('Result')
      .connectByName('MatrixA', 'MatrixMultiply1', 0, 0)
      .connectByName('MatrixB', 'MatrixMultiply1', 0, 1)
      .connectByName('MatrixMultiply1', 'Result')
      .build()
  }

    static createSubsystemWithEnableModel(): TestModel {
        const builder = new TestModelBuilder('Subsystem with Enable')
            .withTestInputs({
                Enable: true,
                Data: 10.0
            })
            .withExpectedOutputs({ Output: 20.0 })

        builder.addInput('Enable', 'bool')
        builder.addInput('Data')

        const subsystemBuilder = builder.createSubsystem('ProcessingSubsystem')
            .addInputPort('In')
            .addOutputPort('Out')
            .configureInternals(sub => {
                const scale = sub.addScale(2.0)
                sub.connectByName('Input', 'Scale1')
                    .connectByName('Scale1', 'Output')
            })

        const model = subsystemBuilder.build()  // Returns TestModelBuilder
            .addOutput('Output')
            .connectByName('Input', 'ProcessingSubsystem')  
            .connectByName('ProcessingSubsystem', 'Output')
            .build()

        return builder.build()
  }
}
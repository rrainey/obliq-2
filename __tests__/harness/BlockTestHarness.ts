/**
 * BlockTestHarness - Test framework for validating C code generation
 *
 * Provides utilities for:
 * - Creating test models with blocks and connections
 * - Generating and compiling C code to WASM
 * - Running simulations and collecting results
 * - Asserting output values at specific times
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'
import { WasmCodeGenerator, WasmCodeGenerationResult } from '@/lib/wasm/codegen/WasmCodeGenerator'
import type { Sheet } from '@/types/canvas'

const execAsync = promisify(exec)

/**
 * Block definition for test models
 */
export interface TestBlock {
  type: string
  name: string
  parameters?: Record<string, any>
}

/**
 * Connection definition for test models
 */
export interface TestConnection {
  from: string | { block: string; port: number }
  to: string | { block: string; port: number }
}

/**
 * Model definition for creating test models
 */
export interface TestModelDef {
  /** Blocks to include in the model */
  blocks: TestBlock[]
  /** Connections between blocks */
  connections?: TestConnection[]
  /** Block names to automatically wire to output ports */
  outputs?: string[]
  /** Block names that are inputs (auto-creates input ports) */
  inputs?: string[]
}

/**
 * Compiled model ready for execution
 */
export interface CompiledModel {
  /** The compiled WASM module */
  module: any
  /** Input port index mapping */
  inputMap: Map<string, number>
  /** Output port index mapping */
  outputMap: Map<string, number>
  /** Path to compiled files (for debugging) */
  outputDir: string
}

/**
 * Time series result from simulation
 */
export interface SimulationResult {
  /** Time values for each step */
  times: number[]
  /** Output values at each step, keyed by output name */
  outputs: Map<string, number[]>
  /** Final simulation time */
  finalTime: number
  /** Number of steps executed */
  stepCount: number
}

/**
 * Configuration for running a simulation
 */
export interface SimulationConfig {
  /** Total duration to simulate */
  duration: number
  /** Time step (default: 0.01) */
  dt?: number
  /** Input values to set (constant for entire run) */
  inputs?: Record<string, number>
  /** Time-varying inputs: array of { time, inputs } */
  inputSchedule?: Array<{ time: number; inputs: Record<string, number> }>
  /** Record outputs every N steps (default: 1) */
  recordEvery?: number
}

/**
 * BlockTestHarness - Main test harness class
 */
export class BlockTestHarness {
  private static instanceCounter = 0
  private projectRoot: string
  private fixturesDir: string
  private dockerImage: string
  private outputDir: string
  private instanceId: number

  constructor() {
    this.instanceId = BlockTestHarness.instanceCounter++
    this.projectRoot = path.join(__dirname, '../..')
    this.fixturesDir = path.join(this.projectRoot, '__tests__/wasm/fixtures')
    this.dockerImage = 'obliq-emscripten:test'
    this.outputDir = path.join(this.fixturesDir, `harness-output-${this.instanceId}-${Date.now()}`)
  }

  /**
   * Create a test model from a simplified definition
   *
   * Automatically handles:
   * - Creating input ports for blocks marked as inputs
   * - Creating output ports for blocks marked as outputs
   * - Wiring connections between blocks
   */
  createTestModel(def: TestModelDef): Sheet[] {
    const blocks: any[] = []
    const connections: any[] = []
    let blockIdCounter = 0
    let wireIdCounter = 0

    // Map block names to IDs
    const blockNameToId = new Map<string, string>()

    // Position tracking
    let currentY = 100
    const xPositions = {
      input: 50,
      block: 250,
      output: 450
    }

    // Create input ports if specified
    if (def.inputs) {
      for (const inputName of def.inputs) {
        const id = `input_${blockIdCounter++}`
        blockNameToId.set(`input:${inputName}`, id)
        blocks.push({
          id,
          name: inputName,
          type: 'input_port',
          position: { x: xPositions.input, y: currentY },
          parameters: {
            portName: inputName,
            dataType: 'double'
          }
        })
        currentY += 80
      }
    }

    // Reset Y for main blocks
    currentY = 100

    // Create main blocks
    for (const testBlock of def.blocks) {
      const id = `block_${blockIdCounter++}`
      blockNameToId.set(testBlock.name, id)
      blocks.push({
        id,
        name: testBlock.name,
        type: testBlock.type,
        position: { x: xPositions.block, y: currentY },
        parameters: testBlock.parameters || {}
      })
      currentY += 80
    }

    // Reset Y for output ports
    currentY = 100

    // Create output ports if specified
    if (def.outputs) {
      for (let i = 0; i < def.outputs.length; i++) {
        const sourceName = def.outputs[i]
        const outputPortName = `out_${i}`
        const id = `output_${blockIdCounter++}`
        blockNameToId.set(`output:${outputPortName}`, id)
        blocks.push({
          id,
          name: outputPortName,
          type: 'output_port',
          position: { x: xPositions.output, y: currentY },
          parameters: {
            portName: outputPortName
          }
        })

        // Auto-wire source block to output port
        const sourceId = blockNameToId.get(sourceName)
        if (sourceId) {
          connections.push({
            id: `wire_${wireIdCounter++}`,
            sourceBlockId: sourceId,
            sourcePortIndex: 0,
            targetBlockId: id,
            targetPortIndex: 0
          })
        }

        currentY += 80
      }
    }

    // Create explicit connections
    if (def.connections) {
      for (const conn of def.connections) {
        const fromSpec = typeof conn.from === 'string'
          ? { block: conn.from, port: 0 }
          : conn.from
        const toSpec = typeof conn.to === 'string'
          ? { block: conn.to, port: 0 }
          : conn.to

        // Resolve block names to IDs
        let sourceId = blockNameToId.get(fromSpec.block)
        if (!sourceId && fromSpec.block.startsWith('input:')) {
          sourceId = blockNameToId.get(fromSpec.block)
        } else if (!sourceId) {
          // Try to find as input port
          sourceId = blockNameToId.get(`input:${fromSpec.block}`)
        }

        let targetId = blockNameToId.get(toSpec.block)
        if (!targetId && toSpec.block.startsWith('output:')) {
          targetId = blockNameToId.get(toSpec.block)
        }

        if (sourceId && targetId) {
          connections.push({
            id: `wire_${wireIdCounter++}`,
            sourceBlockId: sourceId,
            sourcePortIndex: fromSpec.port,
            targetBlockId: targetId,
            targetPortIndex: toSpec.port
          })
        }
      }
    }

    return [{
      id: 'main',
      name: 'Main',
      blocks,
      connections,
      extents: { width: 800, height: Math.max(400, currentY + 100) }
    }]
  }

  /**
   * Generate C code and compile to WASM
   */
  async generateAndCompile(sheets: Sheet[], modelName: string = 'test_model'): Promise<CompiledModel> {
    // Ensure output directory exists
    await fs.mkdir(this.outputDir, { recursive: true })

    // Generate C code
    const generator = new WasmCodeGenerator({ modelName })
    const result = generator.generateWasm(sheets)

    // Write files
    const headerPath = path.join(this.outputDir, `${modelName}.h`)
    const sourcePath = path.join(this.outputDir, `${modelName}.c`)
    const wrapperPath = path.join(this.outputDir, `${modelName}_wasm.c`)

    await fs.writeFile(headerPath, result.header)
    await fs.writeFile(sourcePath, result.source)
    await fs.writeFile(wrapperPath, result.wasmWrapper)

    // Build export list based on what the generator produced
    const exportedFunctions = [
      '_wasm_init',
      '_wasm_set_input',
      '_wasm_get_output',
      '_wasm_step',
      '_wasm_get_time',
      '_malloc',
      '_free'
    ]

    // Compile with Emscripten
    const isWindows = process.platform === 'win32'
    const exportList = exportedFunctions.map(f => `\\"${f}\\"`).join(',')

    const compileCmd = isWindows
      ? `docker run --rm -v "${this.outputDir}:/workspace" ${this.dockerImage} ` +
        `emcc /workspace/${modelName}.c /workspace/${modelName}_wasm.c ` +
        `-I/workspace -o /workspace/${modelName}.js ` +
        `-s WASM=1 ` +
        `-s "EXPORTED_FUNCTIONS=[${exportList}]" ` +
        `-s "EXPORTED_RUNTIME_METHODS=[\\"ccall\\",\\"cwrap\\"]" ` +
        `-s MODULARIZE=1 ` +
        `-s "EXPORT_NAME=createTestModule" ` +
        `-s ALLOW_MEMORY_GROWTH=1 ` +
        `-s INITIAL_MEMORY=16MB ` +
        `-O2 -lm`
      : `docker run --rm -v "${this.outputDir}:/workspace" ${this.dockerImage} ` +
        `emcc /workspace/${modelName}.c /workspace/${modelName}_wasm.c ` +
        `-I/workspace -o /workspace/${modelName}.js ` +
        `-s WASM=1 ` +
        `-s 'EXPORTED_FUNCTIONS=[${exportedFunctions.map(f => `"${f}"`).join(',')}]' ` +
        `-s 'EXPORTED_RUNTIME_METHODS=["ccall","cwrap"]' ` +
        `-s MODULARIZE=1 ` +
        `-s 'EXPORT_NAME=createTestModule' ` +
        `-s ALLOW_MEMORY_GROWTH=1 ` +
        `-s INITIAL_MEMORY=16MB ` +
        `-O2 -lm`

    try {
      const { stdout, stderr } = await execAsync(compileCmd)
      if (stderr && !stderr.includes('warning')) {
        console.warn('Compilation warnings:', stderr)
      }
    } catch (error: any) {
      // Log generated code for debugging
      console.error('=== Generated Header ===')
      console.error(result.header)
      console.error('=== Generated Source ===')
      console.error(result.source)
      console.error('=== Generated WASM Wrapper ===')
      console.error(result.wasmWrapper)
      throw new Error(`Compilation failed: ${error.message}\nstderr: ${error.stderr}`)
    }

    // Load compiled module
    const modelJsPath = path.join(this.outputDir, `${modelName}.js`)
    const createModule = require(modelJsPath)
    const module = await createModule()

    return {
      module,
      inputMap: result.inputMap,
      outputMap: result.outputMap,
      outputDir: this.outputDir
    }
  }

  /**
   * Run a simulation and collect results
   */
  async runSimulation(compiled: CompiledModel, config: SimulationConfig): Promise<SimulationResult> {
    const { module, inputMap, outputMap } = compiled
    const dt = config.dt ?? 0.01
    const recordEvery = config.recordEvery ?? 1

    // Initialize model
    module._wasm_init(dt)

    // Set initial inputs
    if (config.inputs) {
      for (const [name, value] of Object.entries(config.inputs)) {
        const index = inputMap.get(name)
        if (index !== undefined) {
          module._wasm_set_input(index, value)
        }
      }
    }

    // Prepare result storage
    const times: number[] = []
    const outputs = new Map<string, number[]>()
    for (const outputName of outputMap.keys()) {
      outputs.set(outputName, [])
    }

    // Sort input schedule by time if provided
    const schedule = config.inputSchedule
      ? [...config.inputSchedule].sort((a, b) => a.time - b.time)
      : []
    let scheduleIndex = 0

    // Run simulation
    const steps = Math.ceil(config.duration / dt)
    let currentTime = 0

    for (let step = 0; step < steps; step++) {
      // Apply scheduled inputs
      while (scheduleIndex < schedule.length && schedule[scheduleIndex].time <= currentTime) {
        for (const [name, value] of Object.entries(schedule[scheduleIndex].inputs)) {
          const index = inputMap.get(name)
          if (index !== undefined) {
            module._wasm_set_input(index, value)
          }
        }
        scheduleIndex++
      }

      // Execute step - outputs are computed based on CURRENT time, then time advances
      module._wasm_step(dt)

      // Get the time AFTER the step (which is when outputs are valid)
      // Note: Source blocks compute output = f(time) where time is the time at the START of step
      // But time is incremented at the END of step, so get_time() returns time AFTER the step
      const timeAfterStep = module._wasm_get_time()

      // Record outputs - associate with time AFTER step since that's when we read them
      // The outputs were computed at (timeAfterStep - dt), but we record at timeAfterStep
      // to match the convention that outputs are "current" after a step
      if (step % recordEvery === 0) {
        times.push(timeAfterStep)
        for (const [name, index] of outputMap.entries()) {
          const value = module._wasm_get_output(index)
          outputs.get(name)!.push(value)
        }
      }

      currentTime = timeAfterStep
    }

    return {
      times,
      outputs,
      finalTime: currentTime,
      stepCount: steps
    }
  }

  /**
   * Assert output value at a specific time
   */
  assertOutputAt(
    results: SimulationResult,
    time: number,
    outputName: string,
    expected: number,
    tolerance: number = 1e-6
  ): void {
    const outputData = results.outputs.get(outputName)
    if (!outputData) {
      throw new Error(`Output "${outputName}" not found in results`)
    }

    // Find closest time index
    let closestIndex = 0
    let closestDiff = Math.abs(results.times[0] - time)
    for (let i = 1; i < results.times.length; i++) {
      const diff = Math.abs(results.times[i] - time)
      if (diff < closestDiff) {
        closestDiff = diff
        closestIndex = i
      }
    }

    const actual = outputData[closestIndex]
    const actualTime = results.times[closestIndex]

    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(
        `Output "${outputName}" at t=${actualTime.toFixed(4)} (requested t=${time}): ` +
        `expected ${expected}, got ${actual} (diff: ${Math.abs(actual - expected)})`
      )
    }
  }

  /**
   * Assert final output value
   */
  assertFinalOutput(
    results: SimulationResult,
    outputName: string,
    expected: number,
    tolerance: number = 1e-6
  ): void {
    const outputData = results.outputs.get(outputName)
    if (!outputData) {
      throw new Error(`Output "${outputName}" not found in results`)
    }

    const actual = outputData[outputData.length - 1]
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(
        `Final output "${outputName}" at t=${results.finalTime.toFixed(4)}: ` +
        `expected ${expected}, got ${actual} (diff: ${Math.abs(actual - expected)})`
      )
    }
  }

  /**
   * Assert output matches a sequence of expected values
   */
  assertOutputSequence(
    results: SimulationResult,
    outputName: string,
    expectedSequence: Array<{ time: number; value: number }>,
    tolerance: number = 1e-6
  ): void {
    for (const { time, value } of expectedSequence) {
      this.assertOutputAt(results, time, outputName, value, tolerance)
    }
  }

  /**
   * Get output value at a specific time
   */
  getOutputAt(results: SimulationResult, time: number, outputName: string): number {
    const outputData = results.outputs.get(outputName)
    if (!outputData) {
      throw new Error(`Output "${outputName}" not found in results`)
    }

    // Find closest time index
    let closestIndex = 0
    let closestDiff = Math.abs(results.times[0] - time)
    for (let i = 1; i < results.times.length; i++) {
      const diff = Math.abs(results.times[i] - time)
      if (diff < closestDiff) {
        closestDiff = diff
        closestIndex = i
      }
    }

    return outputData[closestIndex]
  }

  /**
   * Clean up generated files
   */
  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.outputDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Get the output directory (for debugging)
   */
  getOutputDir(): string {
    return this.outputDir
  }
}

/**
 * Factory function for creating a BlockTestHarness
 */
export function createHarness(): BlockTestHarness {
  return new BlockTestHarness()
}

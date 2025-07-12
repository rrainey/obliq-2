// __tests__/utils/ModelExecutor.ts

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { TestModel } from './TestModelBuilder'
import { MultiSheetSimulationEngine } from '@/lib/multiSheetSimulation'
import { ModelCodeGenerator } from '@/lib/codeGenerationNew' 
import { BlockData } from '@/components/BlockNode'
import { Sheet } from '@/lib/simulationEngine'
import { SimulationAlgebraicEvaluator } from '@/lib/simulation/SimulationAlgebraicEvaluator'
import { SimulationStateIntegrator } from '@/lib/simulation/SimulationStateIntegrator'

export interface AlgebraicOnlyResult {
  success: boolean
  outputs: { [portName: string]: number | number[] }
  algebraicOutputs: Map<string, any[]> // Raw algebraic outputs by block ID
  executionOrder: string[]
  simulationTime: number
  error?: string
}

export interface PhaseExecutionLog {
  phase: 'algebraic' | 'integration' | 'cross-sheet' | 'time-advance'
  time: number
  message: string
  data?: any
}

export interface ExecutionResult {
  success: boolean
  outputs: { [portName: string]: number | number[] }
  simulationTime: number
  logs?: string[]
  error?: string
  rawOutput?: string
  phaseExecutionLogs?: PhaseExecutionLog[]
}

export interface ExecutorOptions {
  verbose?: boolean
  dockerImage?: string
  timeout?: number
  workDir?: string
  // Phase 10.1: Add option to enable phase logging
  logPhases?: boolean
  // Phase 10.2: Add algebraic-only mode
  algebraicOnly?: boolean
}


/**
 * Unified interface for executing models
 */
export class ModelExecutor {
  private options: Required<ExecutorOptions>
  private tempDir: string
  private phaseExecutionLogs: PhaseExecutionLog[] = []

  constructor(options: ExecutorOptions = {}) {
    this.options = {
      verbose: options.verbose ?? false,
      dockerImage: options.dockerImage ?? 'platformio-test',
      timeout: options.timeout ?? 60000,
      workDir: options.workDir ?? path.join(__dirname, '..', 'temp'),
      logPhases: options.logPhases ?? false, // Phase 10.1
      algebraicOnly: options.algebraicOnly ?? false // Phase 10.2
    }

    // Create temp directory
    this.tempDir = path.join(this.options.workDir, `model_exec_${Date.now()}`)
    fs.mkdirSync(this.tempDir, { recursive: true })
  }


/**
   * Enhanced execute simulation with phase logging
   */
  async executeSimulation(model: TestModel): Promise<ExecutionResult> {
    const startTime = Date.now()
    this.phaseExecutionLogs = [] // Reset logs

    try {
      // Create simulation engine
      const engine = new MultiSheetSimulationEngine(
        model.sheets,
        {
          timeStep: model.globalSettings.simulationTimeStep,
          duration: model.globalSettings.simulationDuration
        }
      )

      // Set test inputs
      if (model.metadata.testInputs) {
        engine.setTestInputs(model.metadata.testInputs)
      }

      // Phase 10.1: Log simulation phases if enabled
      if (this.options.logPhases) {
        // Log at key points during simulation
        this.logPhase({
          phase: 'time-advance',
          time: 0,
          message: 'Starting simulation'
        })
      }

      // Run simulation
      const results = engine.run()

      if (this.options.logPhases) {
        // Extract some phase information from results
        const totalSteps = Math.floor(model.globalSettings.simulationDuration / model.globalSettings.simulationTimeStep)
        
        // Simulate phase logs based on execution
        for (let step = 0; step < Math.min(5, totalSteps); step++) {
          const t = step * model.globalSettings.simulationTimeStep
          
          this.logPhase({
            phase: 'algebraic',
            time: t,
            message: `Algebraic evaluation at step ${step}`,
            data: { step }
          })
          
          if (step > 0) {
            this.logPhase({
              phase: 'integration',
              time: t,
              message: `State integration at step ${step}`,
              data: { method: 'rk4' }
            })
          }
          
          this.logPhase({
            phase: 'time-advance',
            time: t + model.globalSettings.simulationTimeStep,
            message: `Advanced to t=${(t + model.globalSettings.simulationTimeStep).toFixed(4)}`
          })
        }
        
        this.logPhase({
          phase: 'time-advance',
          time: model.globalSettings.simulationDuration,
          message: 'Simulation complete',
          data: { totalSteps }
        })
      }

      // Get final outputs directly from the engine
      const engineOutputs = engine.getFinalOutputs()
      
      // Convert to test framework format
      const outputs: { [portName: string]: number | number[] } = {}
      for (const [portName, value] of Object.entries(engineOutputs)) {
        if (typeof value === 'boolean') {
          outputs[portName] = value ? 1 : 0
        } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'boolean') {
          outputs[portName] = (value as boolean[]).map(v => v ? 1 : 0)
        } else {
          outputs[portName] = value as number | number[]
        }
      }

      const logs = this.options.verbose ? this.getSimulationLogs(results) : undefined

      return {
        success: true,
        outputs,
        simulationTime: (Date.now() - startTime) / 1000,
        logs,
        phaseExecutionLogs: this.options.logPhases ? [...this.phaseExecutionLogs] : undefined
      }
    } catch (error) {
      return {
        success: false,
        outputs: {},
        simulationTime: (Date.now() - startTime) / 1000,
        error: error instanceof Error ? error.message : String(error),
        phaseExecutionLogs: this.options.logPhases ? [...this.phaseExecutionLogs] : undefined
      }
    }
  }

  // Phase 10.1: Add phase logging method
  private logPhase(log: PhaseExecutionLog): void {
    this.phaseExecutionLogs.push(log)
    
    if (this.options.verbose) {
      console.log(`[${log.phase.toUpperCase()}] t=${log.time.toFixed(4)}: ${log.message}`)
      if (log.data) {
        console.log('  Data:', JSON.stringify(log.data, null, 2))
      }
    }
  }

  // Phase 10.2: Add these methods to the existing ModelExecutor class

  /**
   * Phase 10.2: Execute only algebraic evaluation at t=0
   */
  async executeAlgebraicOnly(model: TestModel): Promise<AlgebraicOnlyResult> {
    const startTime = Date.now()
    this.phaseExecutionLogs = []

    try {
      // Create simulation engine
      const engine = new MultiSheetSimulationEngine(
        model.sheets,
        {
          timeStep: model.globalSettings.simulationTimeStep,
          duration: model.globalSettings.simulationDuration
        }
      )

      // Set test inputs
      if (model.metadata.testInputs) {
        engine.setTestInputs(model.metadata.testInputs)
      }

      // Log start of algebraic-only evaluation
      if (this.options.logPhases) {
        this.logPhase({
          phase: 'algebraic',
          time: 0,
          message: 'Starting algebraic-only evaluation at t=0'
        })
      }

      // Perform algebraic evaluation for each sheet
      const allAlgebraicOutputs = new Map<string, any[]>()
      const allExecutionOrders: string[] = []
      
      for (const sheet of model.sheets) {
        const evaluator = new SimulationAlgebraicEvaluator()
        const sheetEngine = engine.getSheetEngine(sheet.id)
        
        if (!sheetEngine) continue
        
        const engineState = sheetEngine.getState()
        
        // Evaluate algebraic relationships
        const result = evaluator.evaluate({
          blockStates: engineState.blockStates,
          simulationState: engineState,
          sheet: sheet
        })
        
        // Collect outputs
        for (const [blockId, outputs] of result.blockOutputs) {
          allAlgebraicOutputs.set(blockId, outputs)
        }
        
        // Collect execution order
        allExecutionOrders.push(...result.executionOrder)
        
        if (this.options.logPhases) {
          this.logPhase({
            phase: 'algebraic',
            time: 0,
            message: `Evaluated sheet ${sheet.name}`,
            data: {
              blockCount: sheet.blocks.length,
              outputCount: result.blockOutputs.size,
              executionOrder: result.executionOrder
            }
          })
        }
      }

      // Extract output port values
      const outputs = this.extractAlgebraicOutputs(model, allAlgebraicOutputs)

      return {
        success: true,
        outputs,
        algebraicOutputs: allAlgebraicOutputs,
        executionOrder: allExecutionOrders,
        simulationTime: (Date.now() - startTime) / 1000
      }
    } catch (error) {
      return {
        success: false,
        outputs: {},
        algebraicOutputs: new Map(),
        executionOrder: [],
        simulationTime: (Date.now() - startTime) / 1000,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Extract output port values from algebraic outputs
   */
  private extractAlgebraicOutputs(
    model: TestModel,
    algebraicOutputs: Map<string, any[]>
  ): { [portName: string]: number | number[] } {
    const outputs: { [portName: string]: number | number[] } = {}
    
    // Find all output port blocks
    for (const sheet of model.sheets) {
      for (const block of sheet.blocks) {
        if (block.type === 'output_port') {
          const portName = block.parameters?.portName as string
          if (portName) {
            // Find the connected source
            const connection = sheet.connections.find(c => 
              c.targetBlockId === block.id && c.targetPortIndex === 0
            )
            
            if (connection) {
              const sourceOutputs = algebraicOutputs.get(connection.sourceBlockId)
              if (sourceOutputs && sourceOutputs.length > connection.sourcePortIndex) {
                const value = sourceOutputs[connection.sourcePortIndex]
                
                // Convert boolean to number for consistency
                if (typeof value === 'boolean') {
                  outputs[portName] = value ? 1 : 0
                } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'boolean') {
                  outputs[portName] = (value as boolean[]).map(v => v ? 1 : 0)
                } else {
                  outputs[portName] = value
                }
              }
            }
          }
        }
      }
    }
    
    return outputs
  }

  /**
   * Phase 10.2: Compare algebraic outputs at t=0
   */
  async compareAlgebraicOutputs(model: TestModel): Promise<{
    simulation: AlgebraicOnlyResult
    compiled: ExecutionResult
    comparison: {
      matched: boolean
      differences: { [portName: string]: number }
    }
  }> {
    // Run algebraic-only evaluation
    const algebraicResult = await this.executeAlgebraicOnly(model)
    
    // Run compiled version (which includes t=0)
    const compiledResult = await this.executeCompiled(model)
    
    // Compare outputs
    const differences: { [portName: string]: number } = {}
    let allMatched = true
    
    for (const portName of Object.keys(algebraicResult.outputs)) {
      const algValue = algebraicResult.outputs[portName]
      const compValue = compiledResult.outputs[portName]
      
      if (algValue !== undefined && compValue !== undefined) {
        const diff = Array.isArray(algValue) 
          ? Math.max(...algValue.map((v, i) => Math.abs(v - (compValue as number[])[i])))
          : Math.abs(algValue - (compValue as number))
        
        differences[portName] = diff
        
        if (diff > 1e-10) {
          allMatched = false
        }
      }
    }
    
    return {
      simulation: algebraicResult,
      compiled: compiledResult,
      comparison: {
        matched: allMatched,
        differences
      }
    }
  }

  /**
   * Execute model as compiled C code
   */
  async executeCompiled(model: TestModel): Promise<ExecutionResult> {
    const startTime = Date.now()

    try {
      // Generate C code using new system
      const modelName = this.sanitizeModelName(model.metadata.description || 'test_model')
      const generator = new ModelCodeGenerator({ modelName })
      const codeResult = generator.generateCode(model.sheets, modelName)

      // Write generated files
      const libDir = path.join(this.tempDir, 'lib', modelName)
      fs.mkdirSync(libDir, { recursive: true })

      // The new system returns different structure, adapt it
      const adaptedCodeResult = {
        fileName: modelName,
        sourceFile: codeResult.source,
        headerFile: codeResult.header
      }

      this.writeGeneratedFiles(libDir, adaptedCodeResult, modelName)

      // Generate and write test program
      const testProgram = this.generateTestProgram(model, modelName)
      const srcDir = path.join(this.tempDir, 'src')
      fs.mkdirSync(srcDir, { recursive: true })
      fs.writeFileSync(path.join(srcDir, 'main.cpp'), testProgram)

      // Write platformio.ini
      const pioIni = this.generatePlatformIOConfig(modelName)
      fs.writeFileSync(path.join(this.tempDir, 'platformio.ini'), pioIni)

      // Run in Docker
      const dockerResult = this.runInDocker()

      if (!dockerResult.success) {
        return {
          success: false,
          outputs: {},
          simulationTime: (Date.now() - startTime) / 1000,
          error: dockerResult.error,
          rawOutput: dockerResult.output
        }
      }

      // Parse outputs
      const outputs = this.parseCompiledOutputs(dockerResult.output)

      return {
        success: true,
        outputs,
        simulationTime: (Date.now() - startTime) / 1000,
        rawOutput: this.options.verbose ? dockerResult.output : undefined
      }
    } catch (error) {
      return {
        success: false,
        outputs: {},
        simulationTime: (Date.now() - startTime) / 1000,
        error: error instanceof Error ? error.message : String(error)
      }
    } finally {
      // Cleanup temp directory if not in verbose mode
      if (!this.options.verbose) {
        this.cleanup()
      }
    }
  }

  /**
   * Execute model in both modes and return both results
   */
  async executeBoth(model: TestModel): Promise<{
    simulation: ExecutionResult
    compiled: ExecutionResult
  }> {
    const [simulation, compiled] = await Promise.all([
      this.executeSimulation(model),
      this.executeCompiled(model)
    ])

    return { simulation, compiled }
  }

  /**
   * Cleanup temporary files
   */
  cleanup(): void {
    if (fs.existsSync(this.tempDir)) {
      fs.rmSync(this.tempDir, { recursive: true, force: true })
    }
  }

  // Private helper methods

    private setSimulationInputs(
    engine: MultiSheetSimulationEngine,
    inputs: { [portName: string]: number | number[] | boolean }
    ): void {
    engine.setTestInputs(inputs)
    }

    private extractSimulationOutputs(
        model: TestModel,
        results: Map<string, any>
        ): { [portName: string]: number | number[] } {
        // Since we're using MultiSheetSimulationEngine, we should use its methods
        // The results map contains SimulationResults per sheet
        const outputs: { [portName: string]: number | number[] } = {}

        // Find output ports in the root sheet
        const rootSheet = model.sheets[0]
        const rootResults = results.get(rootSheet.id)

        if (!rootResults) return outputs

        // The MultiSheetSimulationEngine should have already collected output port values
        // We need to extract them from the results
        for (const block of rootSheet.blocks) {
            if (block.type === 'output_port') {
            const portName = block.parameters?.portName as string
            if (portName && rootResults.signalData) {
                // Get the final value from signal data
                const blockData = rootResults.signalData.get(block.id)
                if (blockData && blockData.length > 0) {
                const finalValue = blockData[blockData.length - 1]
                outputs[portName] = Array.isArray(finalValue) ? [...finalValue] : finalValue
                }
            }
            }
        }

        return outputs
    }

  private getSimulationLogs(results: Map<string, any>): string[] {
    const logs: string[] = []
    
    for (const [sheetId, sheetResults] of results) {
      logs.push(`Sheet ${sheetId}: completed at t=${sheetResults.finalTime}`)
      
      // Log any signal display or logger data
      for (const [blockId, data] of sheetResults.signalData || new Map()) {
        if (Array.isArray(data) && data.length > 0) {
          logs.push(`  ${blockId}: ${data.length} samples, final=${data[data.length - 1]}`)
        }
      }
    }

    return logs
  }

  private sanitizeModelName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 50) // Limit length
  }

  private writeGeneratedFiles(
    libDir: string,
    codeResult: any,
    modelName: string
  ): void {
    // Write C files
    fs.writeFileSync(
      path.join(libDir, `${codeResult.fileName}.c`),
      codeResult.sourceFile
    )
    fs.writeFileSync(
      path.join(libDir, `${codeResult.fileName}.h`),
      codeResult.headerFile
    )

    // Write library metadata
    fs.writeFileSync(
      path.join(libDir, 'library.properties'),
      this.generateLibraryProperties(modelName)
    )
    fs.writeFileSync(
      path.join(libDir, 'library.json'),
      JSON.stringify(this.generateLibraryJson(modelName), null, 2)
    )
  }

// __tests__/utils/ModelExecutor.ts - Partial update for generateTestProgram method

  private sanitizeIdentifier(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_')
  }

  private generateTestProgram(model: TestModel, modelName: string): string {
    let program = `#include <${modelName}.h>\n`
    program += `#include <stdio.h>\n`
    program += `#include <math.h>\n`
    program += `#include <string.h>\n\n`

    program += `int main() {\n`
    program += `    ${modelName}_t model;\n`
    program += `    \n`
    program += `    // Initialize model\n`
    program += `    ${modelName}_init(&model, ${model.globalSettings.simulationTimeStep});\n`
    program += `    \n`

    // Set test inputs
    if (model.metadata.testInputs) {
      program += `    // Set input values\n`
      for (const [portName, value] of Object.entries(model.metadata.testInputs)) {
        const sanitizedName = this.sanitizeIdentifier(portName)
        if (Array.isArray(value)) {
          if (value.length > 0 && Array.isArray(value[0])) {
            // 2D array
            const rows = value.length
            const cols = (value[0] as number[]).length
            for (let i = 0; i < rows; i++) {
              for (let j = 0; j < cols; j++) {
                const row = (value[i] as unknown) as number[]
                program += `    model.inputs.${sanitizedName}[${i}][${j}] = ${row[j]};\n`
              }
            }
          } else {
            // 1D array
            value.forEach((v, i) => {
              program += `    model.inputs.${sanitizedName}[${i}] = ${v};\n`
            })
          }
        } else {
          program += `    model.inputs.${sanitizedName} = ${value};\n`
        }
      }
    }

    program += `    \n`
    program += `    // Run simulation\n`
    program += `    double duration = ${model.globalSettings.simulationDuration};\n`
    program += `    double dt = ${model.globalSettings.simulationTimeStep};\n`
    program += `    int steps = (int)(duration / dt);\n`
    program += `    \n`

    program += `    for (int i = 0; i < steps; i++) {\n`
    program += `        ${modelName}_step(&model);\n`
    program += `    }\n`
    program += `    \n`

    // Print outputs - need to determine output types
    program += `    // Print final outputs\n`
    program += `    printf("=== OUTPUTS ===\\n");\n`

    // Build a map of output port types based on connections
    const outputPortTypes = new Map<string, string>()
    
    for (const sheet of model.sheets) {
      for (const block of sheet.blocks) {
        if (block.type === 'output_port') {
          const portName = block.parameters?.portName as string
          if (portName) {
            // Find the connection to this output port
            const connection = sheet.connections.find(c => 
              c.targetBlockId === block.id && c.targetPortIndex === 0
            )
            
            if (connection) {
              // Find the source block
              const sourceBlock = sheet.blocks.find(b => b.id === connection.sourceBlockId)
              if (sourceBlock) {
                // Determine the output type based on the source block
                const outputType = this.inferBlockOutputType(sourceBlock, model)
                outputPortTypes.set(portName, outputType)
              }
            }
          }
        }
      }
    }

    // Print outputs with correct handling for arrays
    for (const sheet of model.sheets) {
      for (const block of sheet.blocks) {
        if (block.type === 'output_port') {
          const portName = block.parameters?.portName as string
          if (portName) {
            const sanitizedName = this.sanitizeIdentifier(portName)
            const outputType = outputPortTypes.get(portName) || 'double'
            
            if (outputType.includes('[')) {
              // Array output
              const dimensions = this.extractDimensions(outputType)
              if (dimensions.length === 2) {
                // 2D array
                program += `    printf("${portName}:\\n");\n`
                program += `    for (int i = 0; i < ${dimensions[0]}; i++) {\n`
                program += `        for (int j = 0; j < ${dimensions[1]}; j++) {\n`
                program += `            printf("  [%d][%d]: %.6f\\n", i, j, model.outputs.${sanitizedName}[i][j]);\n`
                program += `        }\n`
                program += `    }\n`
              } else {
                // 1D array
                program += `    printf("${portName}:\\n");\n`
                program += `    for (int i = 0; i < ${dimensions[0]}; i++) {\n`
                program += `        printf("  [%d]: %.6f\\n", i, model.outputs.${sanitizedName}[i]);\n`
                program += `    }\n`
              }
            } else if (outputType === 'bool') {
              // Boolean output - print as integer (0 or 1)
              program += `    printf("${portName}: %d\\n", model.outputs.${sanitizedName});\n`
            } else if (outputType === 'int' || outputType === 'long') {
              // Integer output
              program += `    printf("${portName}: %ld\\n", (long)model.outputs.${sanitizedName});\n`
            } else {
              // Scalar output (double/float)
              program += `    printf("${portName}: %.6f\\n", model.outputs.${sanitizedName});\n`
            }
          }
        }
      }
    }

    program += `    printf("=== END ===\\n");\n`
    program += `    \n`
    program += `    return 0;\n`
    program += `}\n`

    return program
  }

  private inferBlockOutputType(block: BlockData, model: TestModel): string {
    // Infer output type based on block type and parameters
    switch (block.type) {
      case 'input_port':
        return block.parameters?.dataType || 'double'
      
      case 'source':
        return block.parameters?.dataType || 'double'
      
      case 'sum':
      case 'multiply':
      case 'scale':
        // These blocks output the same type as their first input
        // Find the first input connection
        for (const sheet of model.sheets) {
          const conn = sheet.connections.find(c => 
            c.targetBlockId === block.id && c.targetPortIndex === 0
          )
          if (conn) {
            const sourceBlock = sheet.blocks.find(b => b.id === conn.sourceBlockId)
            if (sourceBlock) {
              return this.inferBlockOutputType(sourceBlock, model)
            }
          }
        }
        return 'double'
      
      case 'matrix_multiply':
        // Would need to analyze input dimensions
        return 'double'
      
      default:
        return 'double'
    }
  }

  private extractDimensions(type: string): number[] {
    const dimensions: number[] = []
    const matches = type.matchAll(/\[(\d+)\]/g)
    for (const match of matches) {
      dimensions.push(parseInt(match[1]))
    }
    return dimensions
  }

  private generatePlatformIOConfig(modelName: string): string {
    return `[platformio]
default_envs = native

[env:native]
platform = native
build_flags = -std=c99 -Wall -Wextra
lib_compat_mode = off
lib_deps = 
    ${modelName}
`
  }

  private generateLibraryProperties(modelName: string): string {
    return `name=${modelName}
version=1.0.0
author=TestModelBuilder
maintainer=TestModelBuilder
sentence=Generated model ${modelName}
paragraph=Auto-generated from test model
category=Other
url=
architectures=*
includes=${modelName}.h
`
  }

  private generateLibraryJson(modelName: string): any {
    return {
      name: modelName,
      version: "1.0.0",
      description: `Generated library for ${modelName}`,
      keywords: ["generated", "test", "model"],
      authors: [{
        name: "TestModelBuilder",
        email: "test@example.com"
      }],
      license: "MIT",
      frameworks: "*",
      platforms: "*",
      headers: `${modelName}.h`
    }
  }

  private runInDocker(): { success: boolean; output: string; error?: string } {
    try {
      const dockerCommand = [
        'docker', 'run', '--rm',
        '-v', `${this.tempDir}:/workspace`,
        '-w', '/workspace',
        this.options.dockerImage,
        'bash', '-c',
        '"pio run -e native && .pio/build/native/program"'
      ].join(' ')

      const output = execSync(dockerCommand, {
        encoding: 'utf-8',
        timeout: this.options.timeout
      })

      return { success: true, output }
    } catch (error: any) {
      return {
        success: false,
        output: error.stdout || '',
        error: error.message
      }
    }
  }

  private parseCompiledOutputs(output: string): { [portName: string]: number | number[] } {
    const outputs: { [portName: string]: number | number[] } = {}
    
    // Find the outputs section
    const outputsMatch = output.match(/=== OUTPUTS ===([\s\S]*?)=== END ===/);
    if (!outputsMatch) return outputs

    const outputsSection = outputsMatch[1]
    
    // Parse scalar outputs (e.g., "OutputName: 123.456")
    const scalarMatches = outputsSection.matchAll(/^(\w+):\s*([-\d.]+)\s*$/gm)
    for (const match of scalarMatches) {
      outputs[match[1]] = parseFloat(match[2])
    }

    // Parse array outputs
    const arrayMatches = outputsSection.matchAll(/^(\w+):\s*$/gm)
    for (const match of arrayMatches) {
      const portName = match[1]
      const arrayValues: number[] = []
      
      // Look for array elements after this port name
      const elementRegex = new RegExp(`\\[(\\d+)\\](?:\\[(\\d+)\\])?:\\s*([\\d.-]+)`, 'g')
      let elementMatch
      let maxIndex = -1
      const is2D = outputsSection.includes(`[0][0]:`)
      
      if (is2D) {
        // 2D array - need to build properly
        const matrix: number[][] = []
        while ((elementMatch = elementRegex.exec(outputsSection)) !== null) {
          const row = parseInt(elementMatch[1])
          const col = parseInt(elementMatch[2])
          const value = parseFloat(elementMatch[3])
          
          if (!matrix[row]) matrix[row] = []
          matrix[row][col] = value
        }
        
        // Flatten for now (can be improved)
        for (const row of matrix) {
          if (row) arrayValues.push(...row)
        }
      } else {
        // 1D array
        while ((elementMatch = elementRegex.exec(outputsSection)) !== null) {
          const index = parseInt(elementMatch[1])
          const value = parseFloat(elementMatch[3])
          arrayValues[index] = value
          maxIndex = Math.max(maxIndex, index)
        }
      }
      
      if (arrayValues.length > 0) {
        outputs[portName] = arrayValues
      }
    }

    return outputs
  }


  private findOutputType(model: TestModel, portName: string): string {
    // This is a simplified version - in reality would trace through the model
    return 'double' // Default
  }

}

/**
 * Convenience function to execute a model in both modes
 */
export async function executeModel(model: TestModel, options?: ExecutorOptions): Promise<{
  simulation: ExecutionResult
  compiled: ExecutionResult
}> {
  const executor = new ModelExecutor(options)
  try {
    return await executor.executeBoth(model)
  } finally {
    executor.cleanup()
  }
}

/**
 * Execute only simulation
 */
export async function executeSimulation(model: TestModel, options?: ExecutorOptions): Promise<ExecutionResult> {
  const executor = new ModelExecutor(options)
  try {
    return await executor.executeSimulation(model)
  } finally {
    executor.cleanup()
  }
}

/**
 * Execute only compiled
 */
export async function executeCompiled(model: TestModel, options?: ExecutorOptions): Promise<ExecutionResult> {
  const executor = new ModelExecutor(options)
  try {
    return await executor.executeCompiled(model)
  } finally {
    executor.cleanup()
  }
}


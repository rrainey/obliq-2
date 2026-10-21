/**
 * Server-Side WASM Executor
 *
 * Executes compiled WASM simulation modules on the server (Node.js environment).
 * This is used by the automations API and MCP server to run simulations without
 * requiring a browser.
 *
 * Key differences from browser WasmSimulationEngine:
 * - Uses Node.js Buffer for base64 decoding
 * - Uses vm module for JS code evaluation (sandboxed)
 * - Designed for single-use execution (compile, run, return results)
 */

import { generateCacheKey } from './cache/cacheKey'
import { getStorage, type ModelData, type ModelRecord } from '../server/storage'
import {
  AssertResult,
  TestRunResults,
  findStoppingAssert,
  readWasmAssertResults,
  simulationStepCount,
  wasmStopRequested
} from '@/lib/simulation/assertResults'

/**
 * Result of a server-side simulation
 */
export interface SimulationResult {
  success: boolean
  error?: string

  // Timing
  compilationTimeMs?: number
  executionTimeMs?: number
  totalTimeMs: number
  cacheHit?: boolean

  // Simulation results
  finalTime?: number
  timeSteps?: number

  // Output values (final values of output ports)
  outputs?: Record<string, number>

  // Signal data (from loggers/displays)
  signals?: Record<string, {
    samples: number
    finalValue: number
    min: number
    max: number
    average: number
    data?: number[]  // Full time series if requested
  }>

  // Assert block results, and whether one stopped the run
  asserts?: AssertResult[]
  stoppedByAssert?: TestRunResults['stoppedBy']

  // Model info
  modelName?: string
  blockCount?: number
  inputMap?: Record<string, number>
  outputMap?: Record<string, number>
}

/**
 * Configuration for simulation execution
 */
export interface SimulationConfig {
  /** Time step in seconds (default: 0.01) */
  timeStep?: number

  /** Simulation duration in seconds (default: 10.0) */
  duration?: number

  /** Input values to set before simulation */
  inputs?: Record<string, number>

  /** Optimization level for compilation (default: 'O2') */
  optimizationLevel?: 'O0' | 'O1' | 'O2' | 'O3'

  /** Whether to include full time series data (default: false) */
  includeTimeSeries?: boolean

  /** Sample rate for time series (every N steps, default: 1) */
  timeSeriesSampleRate?: number

  /**
   * Headers (Authorization and/or Cookie) forwarded to the internal
   * /api/compile-wasm call, which requires authentication.
   */
  authHeaders?: Record<string, string>
}

/**
 * WASM module interface (exported functions from compiled C code)
 */
interface WasmModule {
  _wasm_init(dt: number): void
  _wasm_set_input(index: number, value: number): void
  _wasm_get_output(index: number): number
  _wasm_step(dt: number): void
  _wasm_get_time(): number
  _wasm_get_input_count?(): number
  _wasm_get_output_count?(): number
  _wasm_get_output_port_count?(): number
  _wasm_get_output_port_name?(index: number): number
  _wasm_get_collector_count?(): number
  _wasm_get_collector_name?(index: number): number
  _wasm_get_sample_count?(index: number): number
  _wasm_get_sample_write_index?(index: number): number
  _wasm_get_max_samples?(index: number): number
  _wasm_get_samples?(index: number): number
  _wasm_get_element_size?(index: number): number
  _wasm_cleanup?(): void
  _malloc(size: number): number
  _free(ptr: number): void
  UTF8ToString(ptr: number): string
  HEAPF64: Float64Array
}

/**
 * Execute a WASM simulation on the server
 *
 * This function handles the complete flow:
 * 1. Load the current model file from local storage
 * 2. Check cache or compile to WASM
 * 3. Load and instantiate WASM module
 * 4. Run simulation
 * 5. Collect and return results
 */
export async function executeServerSimulation(
  modelId: string,
  config: SimulationConfig = {}
): Promise<SimulationResult> {
  const startTime = Date.now()

  // Default configuration
  const timeStep = config.timeStep ?? 0.01
  const duration = config.duration ?? 10.0
  const optimizationLevel = config.optimizationLevel ?? 'O2'
  const includeTimeSeries = config.includeTimeSeries ?? false
  const sampleRate = config.timeSeriesSampleRate ?? 1

  try {
    // Load the current model file (authoritative)
    const loaded = loadCurrentModel(modelId)
    if ('error' in loaded) {
      return {
        success: false,
        error: loaded.error,
        totalTimeMs: Date.now() - startTime
      }
    }
    const { model, data: modelData } = loaded

    const sheets = modelData?.sheets || []
    if (sheets.length === 0) {
      return {
        success: false,
        error: 'Model contains no sheets',
        totalTimeMs: Date.now() - startTime
      }
    }

    // Check for blocks
    const mainSheet = sheets.find((s: any) => s.id === 'main') || sheets[0]
    const blocks = mainSheet?.blocks || []

    if (blocks.length === 0) {
      return {
        success: false,
        error: 'Model contains no blocks',
        totalTimeMs: Date.now() - startTime
      }
    }

    // Compile or retrieve from cache
    const compileStart = Date.now()
    const compileResult = await compileModel(modelId, optimizationLevel, config.authHeaders)
    const compileTime = Date.now() - compileStart

    if (!compileResult.success) {
      return {
        success: false,
        error: compileResult.error || 'Compilation failed',
        compilationTimeMs: compileTime,
        totalTimeMs: Date.now() - startTime,
        cacheHit: compileResult.cacheHit
      }
    }

    // Load WASM module
    const module1 = await loadWasmModule(
      compileResult.wasmData!,
      compileResult.jsData!
    )

    if (!module1) {
      return {
        success: false,
        error: 'Failed to load WASM module',
        compilationTimeMs: compileTime,
        totalTimeMs: Date.now() - startTime,
        cacheHit: compileResult.cacheHit
      }
    }

    // Initialize simulation
    module1._wasm_init(timeStep)

    // Set input values
    const inputMap = new Map<string, number>(compileResult.inputMap || [])
    const outputMap = new Map<string, number>(compileResult.outputMap || [])

    if (config.inputs) {
      for (const [name, value] of Object.entries(config.inputs)) {
        const index = inputMap.get(name)
        if (index !== undefined) {
          module1._wasm_set_input(index, value)
        }
      }
    }

    // Run simulation
    const execStart = Date.now()
    const numSteps = simulationStepCount(duration, timeStep)
    let stepsRun = 0

    // Time series collection (if requested)
    const timeSeries: Record<string, number[]> = {}
    if (includeTimeSeries) {
      outputMap.forEach((_, name) => {
        timeSeries[name] = []
      })
    }

    // Execute simulation steps
    for (let step = 0; step < numSteps; step++) {
      module1._wasm_step(timeStep)
      stepsRun++

      // Collect time series data
      if (includeTimeSeries && step % sampleRate === 0) {
        outputMap.forEach((index, name) => {
          timeSeries[name].push(module1._wasm_get_output(index))
        })
      }

      // An Assert set to stop on failure ends the run after the failing step
      if (wasmStopRequested(module1)) break
    }
    const asserts = readWasmAssertResults(module1)

    const execTime = Date.now() - execStart
    const finalTime = module1._wasm_get_time()

    // Collect final output values
    const outputs: Record<string, number> = {}
    outputMap.forEach((index, name) => {
      outputs[name] = module1._wasm_get_output(index)
    })

    // Collect signal statistics from loggers/displays
    const signals: Record<string, any> = {}

    if (module1._wasm_get_collector_count) {
      const collectorCount = module1._wasm_get_collector_count()

      for (let i = 0; i < collectorCount; i++) {
        const namePtr = module1._wasm_get_collector_name!(i)
        const name = module1.UTF8ToString(namePtr)
        const shortName = name.replace(/^(logger_|display_)/, '')

        const numSamples = module1._wasm_get_sample_count!(i)
        const samplesPtr = module1._wasm_get_samples!(i)
        const elementSize = module1._wasm_get_element_size?.(i) ?? 1

        if (elementSize === 1 && numSamples > 0) {
          // Collect scalar samples
          const samples: number[] = []
          for (let j = 0; j < numSamples; j++) {
            samples.push(module1.HEAPF64[samplesPtr / 8 + j])
          }

          const min = Math.min(...samples)
          const max = Math.max(...samples)
          const avg = samples.reduce((a, b) => a + b, 0) / samples.length

          signals[shortName] = {
            samples: numSamples,
            finalValue: samples[samples.length - 1],
            min,
            max,
            average: avg,
            ...(includeTimeSeries ? { data: samples } : {})
          }
        }
      }
    }

    // Cleanup WASM resources
    if (module1._wasm_cleanup) {
      module1._wasm_cleanup()
    }

    return {
      success: true,
      compilationTimeMs: compileTime,
      executionTimeMs: execTime,
      totalTimeMs: Date.now() - startTime,
      cacheHit: compileResult.cacheHit,
      finalTime,
      timeSteps: stepsRun,
      outputs,
      ...(asserts.length > 0 ? { asserts, stoppedByAssert: findStoppingAssert(asserts) } : {}),
      signals: Object.keys(signals).length > 0 ? signals : undefined,
      modelName: model.name,
      blockCount: blocks.length,
      inputMap: Object.fromEntries(inputMap),
      outputMap: Object.fromEntries(outputMap)
    }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      totalTimeMs: Date.now() - startTime
    }
  }
}

/**
 * Compile model to WASM (or retrieve from cache)
 */
async function compileModel(
  modelId: string,
  optimizationLevel: string,
  authHeaders: Record<string, string> = {}
): Promise<{
  success: boolean
  error?: string
  wasmData?: string
  jsData?: string
  cacheHit?: boolean
  inputMap?: [string, number][]
  outputMap?: [string, number][]
}> {
  // Use internal API call to compile-wasm endpoint
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  try {
    const response = await fetch(`${baseUrl}/api/compile-wasm`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        modelId,
        optimizationLevel
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: errorData.error || `Compilation failed with status ${response.status}`
      }
    }

    const data = await response.json()

    return {
      success: true,
      wasmData: data.wasmData,
      jsData: data.jsData,
      cacheHit: data.metadata?.cacheHit ?? false,
      inputMap: data.metadata?.inputMap,
      outputMap: data.metadata?.outputMap
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Compilation request failed'
    }
  }
}

/**
 * Load WASM module from base64-encoded data
 *
 * Uses Node.js-compatible approach for module instantiation
 */
async function loadWasmModule(
  wasmDataBase64: string,
  jsDataBase64: string
): Promise<WasmModule | null> {
  try {
    // Decode base64 using Node.js Buffer
    const wasmBinary = Buffer.from(wasmDataBase64, 'base64')
    const jsCode = Buffer.from(jsDataBase64, 'base64').toString('utf-8')

    // Create module factory using Function constructor
    // This is similar to eval but with better scoping
    const moduleFactoryCode = `${jsCode}\nreturn createModule;`
    const createModule = new Function(moduleFactoryCode)()

    if (typeof createModule !== 'function') {
      console.error('[ServerWasmExecutor] createModule is not a function')
      return null
    }

    // Instantiate WASM module
    const module1 = await createModule({
      wasmBinary: wasmBinary.buffer.slice(
        wasmBinary.byteOffset,
        wasmBinary.byteOffset + wasmBinary.byteLength
      ),
      print: () => {},
      printErr: () => {}
    }) as WasmModule

    return module1

  } catch (error) {
    console.error('[ServerWasmExecutor] Failed to load WASM module:', error)
    return null
  }
}

/**
 * Quick validation that a model can be simulated
 *
 * Checks:
 * - Model exists
 * - Has sheets with blocks
 * - Has at least one output port
 */
export async function validateForSimulation(
  modelId: string
): Promise<{ valid: boolean; error?: string }> {
  const loaded = loadCurrentModel(modelId)
  if ('error' in loaded) {
    return { valid: false, error: loaded.error }
  }

  const sheets = loaded.data?.sheets || []
  if (sheets.length === 0) {
    return { valid: false, error: 'Model has no sheets' }
  }

  const mainSheet = sheets.find((s: any) => s.id === 'main') || sheets[0]
  const blocks = mainSheet?.blocks || []

  if (blocks.length === 0) {
    return { valid: false, error: 'Model has no blocks' }
  }

  const hasOutput = blocks.some((b: any) =>
    b.type === 'output_port' || b.type === 'signal_logger' || b.type === 'signal_display'
  )

  if (!hasOutput) {
    return { valid: false, error: 'Model has no outputs (add output_port, signal_logger, or signal_display)' }
  }

  return { valid: true }
}

/**
 * Load a model's record and current file content from local storage.
 */
function loadCurrentModel(modelId: string): { model: ModelRecord; data: ModelData } | { error: string } {
  try {
    const current = getStorage().models.readCurrent(modelId)
    return { model: current.record, data: current.data }
  } catch (error) {
    // Storage errors (ModelNotFoundError etc.) carry user-facing messages
    return { error: error instanceof Error ? error.message : `Failed to load model: ${modelId}` }
  }
}

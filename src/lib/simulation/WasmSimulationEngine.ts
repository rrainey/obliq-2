/**
 * WASM Simulation Engine
 *
 * Provides a JavaScript wrapper for running simulations using compiled WebAssembly modules.
 * Compatible interface with the existing SimulationEngine for easy swapping.
 *
 * Usage:
 * ```typescript
 * const engine = new WasmSimulationEngine(modelId)
 * await engine.initialize(0.01) // 10ms timestep
 * engine.setInputs({ a: 2.0, b: 3.0 })
 * engine.step()
 * const outputs = engine.getOutputs()
 * engine.destroy()
 * ```
 */

import type { SignalValue } from '@/lib/modelSchema'

/**
 * Configuration for WASM simulation
 */
export interface WasmSimulationConfig {
  /** Time step for simulation (seconds) */
  timeStep: number

  /** Total duration for simulation (seconds) */
  duration?: number

  /** Optimization level used for compilation */
  optimizationLevel?: 'O0' | 'O1' | 'O2' | 'O3'

  /** API endpoint for compilation (defaults to /api/compile-wasm) */
  apiEndpoint?: string
}

/**
 * Metadata about the compiled WASM module
 */
export interface WasmModuleMetadata {
  /** Name of the model */
  modelName: string

  /** Model version */
  version: number

  /** Cache key used */
  cacheKey: string

  /** Whether result was from cache */
  cacheHit: boolean

  /** Time taken (compilation or retrieval) */
  time: number

  /** Size of WASM binary (bytes) */
  wasmSize: number

  /** Size of JS glue code (bytes) */
  jsSize: number

  /** Optimization level */
  optimizationLevel: string

  /** Number of blocks in model */
  blockCount: number

  /** Input port name-to-index mapping */
  inputMap: Map<string, number>

  /** Output port name-to-index mapping */
  outputMap: Map<string, number>
}

/**
 * State of the WASM simulation engine
 */
export interface WasmSimulationState {
  /** Current simulation time */
  time: number

  /** Time step */
  timeStep: number

  /** Whether simulation is initialized */
  isInitialized: boolean

  /** Whether simulation is running */
  isRunning: boolean

  /** Current input values */
  inputs: Record<string, SignalValue>

  /** Current output values */
  outputs: Record<string, SignalValue>
}

/**
 * WASM module interface (exported functions from compiled C code)
 */
interface WasmModule {
  /** Initialize the model with given timestep */
  _wasm_init(dt: number): void

  /** Set an input value by index */
  _wasm_set_input(index: number, value: number): void

  /** Get an output value by index */
  _wasm_get_output(index: number): number

  /** Execute one simulation step */
  _wasm_step(dt: number): void

  /** Get current simulation time */
  _wasm_get_time(): number

  /** Optional: Get number of inputs (if debug functions enabled) */
  _wasm_get_input_count?(): number

  /** Optional: Get number of outputs (if debug functions enabled) */
  _wasm_get_output_count?(): number

  /** Optional: Get input name by index (if debug functions enabled) */
  _wasm_get_input_name?(index: number): string

  /** Optional: Get output name by index (if debug functions enabled) */
  _wasm_get_output_name?(index: number): string

  /** Memory allocation (from Emscripten) */
  _malloc(size: number): number

  /** Memory deallocation (from Emscripten) */
  _free(ptr: number): void
}

/**
 * WASM Simulation Engine
 *
 * Runs simulations using compiled WebAssembly modules for high performance.
 */
export class WasmSimulationEngine {
  private modelId: string
  private module: WasmModule | null = null
  private metadata: WasmModuleMetadata | null = null
  private state: WasmSimulationState
  private moduleUrl: string | null = null

  constructor(modelId: string) {
    this.modelId = modelId

    this.state = {
      time: 0,
      timeStep: 0.01,
      isInitialized: false,
      isRunning: false,
      inputs: {},
      outputs: {}
    }
  }

  /**
   * Initialize the WASM simulation engine
   *
   * @param timeStep - Time step for simulation (seconds)
   * @param config - Additional configuration options
   */
  async initialize(timeStep: number, config: Partial<WasmSimulationConfig> = {}): Promise<void> {
    if (this.state.isInitialized) {
      throw new Error('WasmSimulationEngine already initialized')
    }

    this.state.timeStep = timeStep

    const apiEndpoint = config.apiEndpoint || '/api/compile-wasm'
    const optimizationLevel = config.optimizationLevel || 'O2'

    console.log(`[WasmSimulationEngine] Compiling model ${this.modelId}...`)
    const compileStart = Date.now()

    // Fetch compiled WASM from API
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        modelId: this.modelId,
        optimizationLevel
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Failed to compile WASM: ${error.error || 'Unknown error'}`)
    }

    const data = await response.json()
    const compileTime = Date.now() - compileStart

    console.log(
      `[WasmSimulationEngine] Compilation ${data.metadata.cacheHit ? 'cache hit' : 'completed'} (${compileTime}ms)`
    )

    // Decode base64 to binary
    const wasmBinary = Uint8Array.from(atob(data.wasmData), c => c.charCodeAt(0)).buffer
    const jsCode = atob(data.jsData)

    // Store metadata
    this.metadata = {
      modelName: data.metadata.modelName,
      version: data.metadata.version,
      cacheKey: data.metadata.cacheKey,
      cacheHit: data.metadata.cacheHit,
      time: data.metadata.compilationTime || data.metadata.retrievalTime,
      wasmSize: data.metadata.wasmSize,
      jsSize: data.metadata.jsSize,
      optimizationLevel: data.metadata.optimizationLevel,
      blockCount: data.metadata.blockCount,
      inputMap: new Map(data.metadata.inputMap),
      outputMap: new Map(data.metadata.outputMap)
    }

    // Load WASM module
    console.log(`[WasmSimulationEngine] Loading WASM module...`)
    const loadStart = Date.now()

    // Create Blob URL for JS glue code
    const jsBlob = new Blob([jsCode], { type: 'application/javascript' })
    this.moduleUrl = URL.createObjectURL(jsBlob)

    try {
      // Dynamically import the module
      const moduleFactory = await import(/* webpackIgnore: true */ this.moduleUrl)
      const createModule = moduleFactory.default || moduleFactory

      // Instantiate with WASM binary
      this.module = await createModule({
        wasmBinary,
        // Suppress Emscripten output
        print: () => {},
        printErr: () => {}
      })

      const loadTime = Date.now() - loadStart
      console.log(`[WasmSimulationEngine] Module loaded (${loadTime}ms)`)

      // Initialize model
      this.module._wasm_init(timeStep)

      this.state.isInitialized = true
      this.state.time = 0

      // Initialize input/output state from metadata
      this.metadata.inputMap.forEach((index, name) => {
        this.state.inputs[name] = 0
      })

      this.metadata.outputMap.forEach((index, name) => {
        this.state.outputs[name] = 0
      })

      console.log(
        `[WasmSimulationEngine] Initialized: ${this.metadata.inputMap.size} inputs, ${this.metadata.outputMap.size} outputs`
      )
    } catch (error) {
      // Clean up on error
      if (this.moduleUrl) {
        URL.revokeObjectURL(this.moduleUrl)
        this.moduleUrl = null
      }
      throw new Error(
        `Failed to load WASM module: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Set input values for the simulation
   *
   * @param inputs - Object mapping input names to values
   */
  setInputs(inputs: Record<string, SignalValue>): void {
    if (!this.state.isInitialized || !this.module || !this.metadata) {
      throw new Error('WasmSimulationEngine not initialized')
    }

    // Set each input value
    for (const [name, value] of Object.entries(inputs)) {
      const index = this.metadata.inputMap.get(name)

      if (index === undefined) {
        console.warn(`[WasmSimulationEngine] Unknown input: ${name}`)
        continue
      }

      // Currently only supports scalar numbers
      // TODO: Add support for arrays, booleans, matrices
      if (typeof value === 'number') {
        this.module._wasm_set_input(index, value)
        this.state.inputs[name] = value
      } else {
        console.warn(`[WasmSimulationEngine] Unsupported input type for ${name}:`, typeof value)
      }
    }
  }

  /**
   * Set a single input value
   *
   * @param name - Input port name
   * @param value - Input value
   */
  setInput(name: string, value: SignalValue): void {
    this.setInputs({ [name]: value })
  }

  /**
   * Execute one simulation step
   *
   * @param dt - Optional time step (defaults to configured timestep)
   */
  step(dt?: number): void {
    if (!this.state.isInitialized || !this.module) {
      throw new Error('WasmSimulationEngine not initialized')
    }

    const timestep = dt ?? this.state.timeStep

    // Execute simulation step
    this.module._wasm_step(timestep)

    // Update time
    this.state.time = this.module._wasm_get_time()

    // Update output values in state
    this.updateOutputs()
  }

  /**
   * Get all output values
   *
   * @returns Object mapping output names to values
   */
  getOutputs(): Record<string, SignalValue> {
    if (!this.state.isInitialized || !this.module || !this.metadata) {
      throw new Error('WasmSimulationEngine not initialized')
    }

    this.updateOutputs()
    return { ...this.state.outputs }
  }

  /**
   * Get a single output value
   *
   * @param name - Output port name
   * @returns Output value
   */
  getOutput(name: string): SignalValue {
    const outputs = this.getOutputs()
    if (!(name in outputs)) {
      throw new Error(`Unknown output: ${name}`)
    }
    return outputs[name]
  }

  /**
   * Get current simulation time
   *
   * @returns Current time (seconds)
   */
  getTime(): number {
    if (!this.state.isInitialized || !this.module) {
      return this.state.time
    }

    return this.module._wasm_get_time()
  }

  /**
   * Get current simulation state
   *
   * @returns Simulation state
   */
  getState(): Readonly<WasmSimulationState> {
    return {
      ...this.state,
      time: this.getTime(),
      inputs: { ...this.state.inputs },
      outputs: { ...this.state.outputs }
    }
  }

  /**
   * Get metadata about the compiled module
   *
   * @returns Module metadata
   */
  getMetadata(): Readonly<WasmModuleMetadata> | null {
    return this.metadata
      ? {
          ...this.metadata,
          inputMap: new Map(this.metadata.inputMap),
          outputMap: new Map(this.metadata.outputMap)
        }
      : null
  }

  /**
   * Run simulation for specified duration
   *
   * @param duration - Duration to simulate (seconds)
   * @param onStep - Optional callback called after each step
   * @returns Final time
   */
  async run(duration: number, onStep?: (state: Readonly<WasmSimulationState>) => void): Promise<number> {
    if (!this.state.isInitialized) {
      throw new Error('WasmSimulationEngine not initialized')
    }

    this.state.isRunning = true
    const startTime = this.state.time
    const endTime = startTime + duration

    try {
      while (this.state.time < endTime && this.state.isRunning) {
        this.step()

        if (onStep) {
          onStep(this.getState())
        }

        // Yield to event loop periodically to prevent blocking
        if (Math.floor(this.state.time / this.state.timeStep) % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }

      return this.state.time
    } finally {
      this.state.isRunning = false
    }
  }

  /**
   * Stop a running simulation
   */
  stop(): void {
    this.state.isRunning = false
  }

  /**
   * Reset simulation to time 0
   *
   * Re-initializes the model with the same timestep.
   */
  async reset(): Promise<void> {
    if (!this.state.isInitialized || !this.module) {
      throw new Error('WasmSimulationEngine not initialized')
    }

    const timeStep = this.state.timeStep

    // Re-initialize model
    this.module._wasm_init(timeStep)

    this.state.time = 0
    this.state.isRunning = false

    // Reset inputs to zero
    if (this.metadata) {
      this.metadata.inputMap.forEach((index, name) => {
        this.state.inputs[name] = 0
        this.module!._wasm_set_input(index, 0)
      })
    }

    // Update outputs
    this.updateOutputs()
  }

  /**
   * Clean up resources
   *
   * IMPORTANT: Always call this when done with the engine to prevent memory leaks.
   */
  destroy(): void {
    // Revoke Blob URL to free memory
    if (this.moduleUrl) {
      URL.revokeObjectURL(this.moduleUrl)
      this.moduleUrl = null
    }

    // Clear module reference
    this.module = null
    this.metadata = null

    this.state.isInitialized = false
    this.state.isRunning = false

    console.log(`[WasmSimulationEngine] Destroyed`)
  }

  /**
   * Update output values from WASM module
   */
  private updateOutputs(): void {
    if (!this.module || !this.metadata) return

    this.metadata.outputMap.forEach((index, name) => {
      const value = this.module!._wasm_get_output(index)
      this.state.outputs[name] = value
    })
  }
}

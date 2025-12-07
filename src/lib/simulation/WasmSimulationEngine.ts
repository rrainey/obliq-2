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

  /** Data collection functions */
  _wasm_get_collector_count?(): number
  _wasm_get_collector_name?(index: number): number
  _wasm_get_sample_count?(index: number): number
  _wasm_get_sample_write_index?(index: number): number
  _wasm_get_max_samples?(index: number): number
  _wasm_get_last_sample_time?(index: number): number
  _wasm_get_samples?(index: number): number
  _wasm_get_element_size?(index: number): number

  /** Cleanup function */
  _wasm_cleanup?(): void

  /** Memory allocation (from Emscripten) */
  _malloc(size: number): number

  /** Memory deallocation (from Emscripten) */
  _free(ptr: number): void

  /** UTF8 string conversion (from Emscripten) */
  UTF8ToString(ptr: number): string

  /** Access to HEAP memory views */
  HEAP8: Int8Array
  HEAPU8: Uint8Array
  HEAP16: Int16Array
  HEAPU16: Uint16Array
  HEAP32: Int32Array
  HEAPU32: Uint32Array
  HEAPF32: Float32Array
  HEAPF64: Float64Array
}

/**
 * Memory allocation tracking entry
 */
interface MemoryAllocation {
  /** Pointer address */
  ptr: number
  /** Size in bytes */
  size: number
  /** Allocation timestamp */
  timestamp: number
  /** Stack trace (dev mode only) */
  stack?: string
}

/**
 * Memory usage statistics
 */
export interface MemoryStats {
  /** Number of active allocations */
  activeAllocations: number
  /** Total bytes allocated */
  totalAllocated: number
  /** Peak memory usage */
  peakMemory: number
  /** Total allocations made */
  totalAllocationsCount: number
  /** Total deallocations made */
  totalDeallocationsCount: number
  /** Potential memory leaks (allocations without corresponding frees) */
  potentialLeaks: number
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

  // Memory management
  private allocations: Map<number, MemoryAllocation> = new Map()
  private memoryStats: MemoryStats = {
    activeAllocations: 0,
    totalAllocated: 0,
    peakMemory: 0,
    totalAllocationsCount: 0,
    totalDeallocationsCount: 0,
    potentialLeaks: 0
  }
  private enableLeakDetection: boolean = false
  private memoryLimit: number = 100 * 1024 * 1024 // 100 MB default

  constructor(modelId: string, options?: { enableLeakDetection?: boolean; memoryLimit?: number }) {
    this.modelId = modelId

    this.state = {
      time: 0,
      timeStep: 0.01,
      isInitialized: false,
      isRunning: false,
      inputs: {},
      outputs: {}
    }

    // Development mode options
    if (options?.enableLeakDetection !== undefined) {
      this.enableLeakDetection = options.enableLeakDetection
    }
    if (options?.memoryLimit !== undefined) {
      this.memoryLimit = options.memoryLimit
    }
  }

  /**
   * Load a pre-compiled WASM module
   *
   * @param wasmDataBase64 - Base64-encoded WASM binary
   * @param jsDataBase64 - Base64-encoded JS glue code
   * @param metadata - Module metadata
   */
  async loadCompiledModule(wasmDataBase64: string, jsDataBase64: string, metadata: any): Promise<void> {
    if (this.state.isInitialized) {
      throw new Error('WasmSimulationEngine already initialized')
    }

    console.log(`[WasmSimulationEngine] Loading pre-compiled module...`)

    // Decode base64 to binary
    const wasmBinary = Uint8Array.from(atob(wasmDataBase64), c => c.charCodeAt(0)).buffer
    const jsCode = atob(jsDataBase64)

    // Store metadata
    this.metadata = {
      modelName: metadata.modelName,
      version: metadata.version,
      cacheKey: metadata.cacheKey,
      cacheHit: metadata.cacheHit,
      time: metadata.compilationTime || metadata.retrievalTime,
      wasmSize: metadata.wasmSize,
      jsSize: metadata.jsSize,
      optimizationLevel: metadata.optimizationLevel,
      blockCount: metadata.blockCount,
      inputMap: new Map(metadata.inputMap),
      outputMap: new Map(metadata.outputMap)
    }

    // Load WASM module
    const loadStart = Date.now()

    try {
      // Evaluate JS code in a way that returns the module factory
      // We use Function constructor instead of eval for better scoping
      // and to avoid issues with strict mode
      const moduleFactoryCode = `${jsCode}\nreturn createModule;`
      const createModule = new Function(moduleFactoryCode)()

      if (typeof createModule !== 'function') {
        throw new Error('createModule is not a function')
      }

      // Instantiate with WASM binary
      this.module = await createModule({
        wasmBinary,
        // Suppress Emscripten output
        print: () => {},
        printErr: () => {}
      })

      const loadTime = Date.now() - loadStart
      console.log(`[WasmSimulationEngine] Module loaded (${loadTime}ms)`)

      // Mark as ready for initialization
      // Note: initialize() must still be called to set timestep
    } catch (error) {
      throw new Error(
        `Failed to load WASM module: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
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

    // If module was already loaded via loadCompiledModule, skip fetch/load
    if (!this.module || !this.metadata) {
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

      try {
        // Evaluate JS code in a way that returns the module factory
        // We use Function constructor instead of eval for better scoping
        // and to avoid issues with strict mode
        const moduleFactoryCode = `${jsCode}\nreturn createModule;`
        const createModule = new Function(moduleFactoryCode)()

        if (typeof createModule !== 'function') {
          throw new Error('createModule is not a function')
        }

        // Instantiate with WASM binary
        this.module = await createModule({
          wasmBinary,
          // Suppress Emscripten output
          print: () => {},
          printErr: () => {}
        })

        const loadTime = Date.now() - loadStart
        console.log(`[WasmSimulationEngine] Module loaded (${loadTime}ms)`)
      } catch (error) {
        throw new Error(
          `Failed to load WASM module: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }

    // Initialize model with timestep
    if (!this.module || !this.metadata) {
      throw new Error('WASM module not loaded')
    }

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
   * Get all signal logger and display (scope) data names
   *
   * @returns Array of logger/display names (with 'logger_' or 'display_' prefix)
   */
  getLoggerNames(): string[] {
    if (!this.metadata) {
      return []
    }

    const loggerNames: string[] = []
    for (const [name] of this.metadata.outputMap) {
      if (name.startsWith('logger_') || name.startsWith('display_')) {
        loggerNames.push(name)
      }
    }

    return loggerNames
  }

  /**
   * Get current value from a signal logger or display
   *
   * @param loggerName - Logger/display name (with or without 'logger_'/'display_' prefix)
   * @returns Current signal value at this logger/display
   */
  getLoggerValue(loggerName: string): SignalValue {
    // Add prefix if not already present
    const fullName = (loggerName.startsWith('logger_') || loggerName.startsWith('display_'))
      ? loggerName
      : `logger_${loggerName}`

    return this.getOutput(fullName)
  }

  /**
   * Get all signal logger and display values
   *
   * @returns Object mapping logger/display names (without prefix) to current values
   */
  getLoggerValues(): Record<string, SignalValue> {
    const loggerValues: Record<string, SignalValue> = {}
    const loggerNames = this.getLoggerNames()

    for (const fullName of loggerNames) {
      // Remove 'logger_' or 'display_' prefix for cleaner keys
      const shortName = fullName.replace(/^(logger_|display_)/, '')
      loggerValues[shortName] = this.state.outputs[fullName]
    }

    return loggerValues
  }

  /**
   * Get all sample data from loggers and displays (internal buffer retrieval)
   *
   * This retrieves the complete historical data collected during simulation,
   * stored internally by the WASM module in malloc'd circular buffers.
   * Samples are returned in chronological order.
   *
   * @returns Map of collector name (without prefix) to sample array
   */
  getSampleData(): Map<string, SignalValue[]> {
    if (!this.module || !this.metadata) {
      return new Map()
    }

    const sampleData = new Map<string, SignalValue[]>()

    // Check if collector functions are available
    if (!this.module._wasm_get_collector_count) {
      console.warn('WASM module does not support data collection functions')
      return sampleData
    }

    const collectorCount = this.module._wasm_get_collector_count()

    for (let i = 0; i < collectorCount; i++) {
      const namePtr = this.module._wasm_get_collector_name!(i)
      const name = this.module.UTF8ToString(namePtr)
      const numSamples = this.module._wasm_get_sample_count!(i)
      const samplesPtr = this.module._wasm_get_samples!(i)

      // Get element size (1 for scalar, N for vector, M*N for matrix)
      const elementSize = this.module._wasm_get_element_size
        ? this.module._wasm_get_element_size(i)
        : 1

      // For circular buffer: get write index and max samples
      const writeIndex = this.module._wasm_get_sample_write_index
        ? this.module._wasm_get_sample_write_index(i)
        : numSamples
      const maxSamples = this.module._wasm_get_max_samples
        ? this.module._wasm_get_max_samples(i)
        : numSamples

      // Copy samples from WASM memory to JavaScript array in chronological order
      const samples: SignalValue[] = []

      // Determine if buffer has wrapped
      const hasWrapped = numSamples >= maxSamples

      if (elementSize === 1) {
        // Scalar signal - return flat array of numbers
        if (!hasWrapped) {
          // Buffer hasn't wrapped - read from 0 to numSamples
          for (let j = 0; j < numSamples; j++) {
            samples.push(this.module.HEAPF64[samplesPtr / 8 + j])
          }
        } else {
          // Buffer has wrapped - read in chronological order starting from writeIndex
          // The oldest sample is at writeIndex, the newest is at writeIndex - 1 (mod maxSamples)
          for (let j = 0; j < numSamples; j++) {
            const bufferIdx = (writeIndex + j) % maxSamples
            samples.push(this.module.HEAPF64[samplesPtr / 8 + bufferIdx])
          }
        }
      } else {
        // Vector or matrix signal - return array of arrays
        // Each sample is an array of elementSize elements
        if (!hasWrapped) {
          for (let j = 0; j < numSamples; j++) {
            const sample: number[] = []
            for (let k = 0; k < elementSize; k++) {
              sample.push(this.module.HEAPF64[samplesPtr / 8 + j * elementSize + k])
            }
            samples.push(sample)
          }
        } else {
          // Buffer has wrapped - read in chronological order
          for (let j = 0; j < numSamples; j++) {
            const bufferIdx = (writeIndex + j) % maxSamples
            const sample: number[] = []
            for (let k = 0; k < elementSize; k++) {
              sample.push(this.module.HEAPF64[samplesPtr / 8 + bufferIdx * elementSize + k])
            }
            samples.push(sample)
          }
        }
      }

      // Remove prefix for cleaner keys
      const shortName = name.replace(/^(logger_|display_)/, '')
      sampleData.set(shortName, samples)
    }

    return sampleData
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
   * Check if the engine is initialized
   *
   * @returns True if initialized, false otherwise
   */
  isInitialized(): boolean {
    return this.state.isInitialized
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
   * Cleanup WASM resources
   *
   * Frees all allocated memory for data collection buffers.
   * Should be called when the simulation engine is no longer needed.
   */
  cleanup(): void {
    if (!this.module) {
      return
    }

    // Call cleanup function if available
    if (this.module._wasm_cleanup) {
      this.module._wasm_cleanup()
    }
  }

  /**
   * Allocate WASM memory
   *
   * @param size - Number of bytes to allocate
   * @returns Pointer to allocated memory
   */
  malloc(size: number): number {
    if (!this.state.isInitialized || !this.module) {
      throw new Error('WasmSimulationEngine not initialized')
    }

    // Check memory limit
    if (this.memoryStats.totalAllocated + size > this.memoryLimit) {
      throw new Error(
        `Memory limit exceeded: ${this.memoryStats.totalAllocated + size} bytes > ${this.memoryLimit} bytes`
      )
    }

    const ptr = this.module._malloc(size)

    if (ptr === 0) {
      throw new Error(`Failed to allocate ${size} bytes of WASM memory`)
    }

    // Track allocation
    const allocation: MemoryAllocation = {
      ptr,
      size,
      timestamp: Date.now()
    }

    if (this.enableLeakDetection) {
      allocation.stack = new Error().stack
    }

    this.allocations.set(ptr, allocation)

    // Update stats
    this.memoryStats.activeAllocations++
    this.memoryStats.totalAllocated += size
    this.memoryStats.totalAllocationsCount++

    if (this.memoryStats.totalAllocated > this.memoryStats.peakMemory) {
      this.memoryStats.peakMemory = this.memoryStats.totalAllocated
    }

    return ptr
  }

  /**
   * Free WASM memory
   *
   * @param ptr - Pointer to free
   */
  free(ptr: number): void {
    if (!this.state.isInitialized || !this.module) {
      throw new Error('WasmSimulationEngine not initialized')
    }

    if (ptr === 0) {
      console.warn('[WasmSimulationEngine] Attempting to free null pointer')
      return
    }

    const allocation = this.allocations.get(ptr)

    if (!allocation) {
      console.warn(`[WasmSimulationEngine] Attempting to free untracked pointer: ${ptr}`)
      // Still try to free it
      this.module._free(ptr)
      return
    }

    // Free memory
    this.module._free(ptr)

    // Update tracking
    this.allocations.delete(ptr)

    // Update stats
    this.memoryStats.activeAllocations--
    this.memoryStats.totalAllocated -= allocation.size
    this.memoryStats.totalDeallocationsCount++
  }

  /**
   * Write Float32Array to WASM memory
   *
   * @param data - Data to write
   * @returns Pointer to allocated memory
   */
  writeFloat32Array(data: Float32Array): number {
    const byteLength = data.byteLength
    const ptr = this.malloc(byteLength)

    if (!this.module) {
      throw new Error('WasmSimulationEngine not initialized')
    }

    // Copy data to WASM heap
    this.module.HEAPF32.set(data, ptr / 4) // Divide by 4 because HEAPF32 is 32-bit indexed

    return ptr
  }

  /**
   * Read Float32Array from WASM memory
   *
   * @param ptr - Pointer to read from
   * @param length - Number of float32 elements
   * @returns Float32Array with copied data
   */
  readFloat32Array(ptr: number, length: number): Float32Array {
    if (!this.module) {
      throw new Error('WasmSimulationEngine not initialized')
    }

    const offset = ptr / 4 // Divide by 4 for 32-bit indexing
    const slice = this.module.HEAPF32.slice(offset, offset + length)
    return new Float32Array(slice)
  }

  /**
   * Write Float64Array to WASM memory
   *
   * @param data - Data to write
   * @returns Pointer to allocated memory
   */
  writeFloat64Array(data: Float64Array): number {
    const byteLength = data.byteLength
    const ptr = this.malloc(byteLength)

    if (!this.module) {
      throw new Error('WasmSimulationEngine not initialized')
    }

    // Copy data to WASM heap
    this.module.HEAPF64.set(data, ptr / 8) // Divide by 8 because HEAPF64 is 64-bit indexed

    return ptr
  }

  /**
   * Read Float64Array from WASM memory
   *
   * @param ptr - Pointer to read from
   * @param length - Number of float64 elements
   * @returns Float64Array with copied data
   */
  readFloat64Array(ptr: number, length: number): Float64Array {
    if (!this.module) {
      throw new Error('WasmSimulationEngine not initialized')
    }

    const offset = ptr / 8 // Divide by 8 for 64-bit indexing
    const slice = this.module.HEAPF64.slice(offset, offset + length)
    return new Float64Array(slice)
  }

  /**
   * Write Uint8Array to WASM memory
   *
   * @param data - Data to write
   * @returns Pointer to allocated memory
   */
  writeUint8Array(data: Uint8Array): number {
    const byteLength = data.byteLength
    const ptr = this.malloc(byteLength)

    if (!this.module) {
      throw new Error('WasmSimulationEngine not initialized')
    }

    // Copy data to WASM heap
    this.module.HEAPU8.set(data, ptr)

    return ptr
  }

  /**
   * Read Uint8Array from WASM memory
   *
   * @param ptr - Pointer to read from
   * @param length - Number of bytes
   * @returns Uint8Array with copied data
   */
  readUint8Array(ptr: number, length: number): Uint8Array {
    if (!this.module) {
      throw new Error('WasmSimulationEngine not initialized')
    }

    const slice = this.module.HEAPU8.slice(ptr, ptr + length)
    return new Uint8Array(slice)
  }

  /**
   * Get memory usage statistics
   *
   * @returns Current memory statistics
   */
  getMemoryStats(): Readonly<MemoryStats> {
    // Update potential leaks count
    this.memoryStats.potentialLeaks = this.allocations.size

    return { ...this.memoryStats }
  }

  /**
   * Check for memory leaks (development mode)
   *
   * @param logLeaks - Whether to log leak details to console
   * @returns Number of potential leaks found
   */
  checkForLeaks(logLeaks: boolean = true): number {
    if (!this.enableLeakDetection) {
      console.warn(
        '[WasmSimulationEngine] Leak detection disabled. Enable with enableLeakDetection option.'
      )
      return 0
    }

    const leaks = Array.from(this.allocations.values())

    if (leaks.length > 0 && logLeaks) {
      console.warn(`[WasmSimulationEngine] Detected ${leaks.length} potential memory leak(s):`)

      leaks.forEach((leak, index) => {
        console.warn(`  Leak ${index + 1}:`)
        console.warn(`    Pointer: 0x${leak.ptr.toString(16)}`)
        console.warn(`    Size: ${leak.size} bytes`)
        console.warn(`    Age: ${Date.now() - leak.timestamp}ms`)
        if (leak.stack) {
          console.warn(`    Stack trace:\n${leak.stack}`)
        }
      })
    }

    return leaks.length
  }

  /**
   * Free all tracked allocations (emergency cleanup)
   */
  freeAll(): void {
    if (!this.module) {
      console.warn('[WasmSimulationEngine] Cannot free allocations: module not initialized')
      return
    }

    const count = this.allocations.size

    if (count > 0) {
      console.warn(`[WasmSimulationEngine] Freeing ${count} tracked allocation(s)`)

      this.allocations.forEach((allocation, ptr) => {
        this.module!._free(ptr)
      })

      this.allocations.clear()
      this.memoryStats.activeAllocations = 0
      this.memoryStats.totalAllocated = 0
    }
  }

  /**
   * Clean up resources
   *
   * IMPORTANT: Always call this when done with the engine to prevent memory leaks.
   */
  destroy(): void {
    // Check for memory leaks before cleanup
    if (this.enableLeakDetection && this.allocations.size > 0) {
      this.checkForLeaks(true)
    }

    // Free any remaining allocations
    if (this.allocations.size > 0) {
      this.freeAll()
    }

    // Clear module reference
    this.module = null
    this.metadata = null

    this.state.isInitialized = false
    this.state.isRunning = false

    // Reset memory stats
    this.allocations.clear()
    this.memoryStats = {
      activeAllocations: 0,
      totalAllocated: 0,
      peakMemory: 0,
      totalAllocationsCount: 0,
      totalDeallocationsCount: 0,
      potentialLeaks: 0
    }

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

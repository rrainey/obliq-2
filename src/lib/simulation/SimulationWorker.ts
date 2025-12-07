/**
 * SimulationWorker.ts
 *
 * Web Worker for running WASM simulations off the main thread.
 * This keeps the UI responsive during long-running simulations.
 *
 * Communication Protocol:
 * - Main thread sends messages with { type, payload }
 * - Worker responds with { type, payload } or { type: 'error', error }
 *
 * Message Types:
 * - 'init': Initialize worker with WASM module data
 * - 'run': Run simulation with given config
 * - 'step': Execute a single simulation step
 * - 'stop': Stop running simulation
 * - 'getResults': Retrieve sample data
 * - 'cleanup': Clean up resources
 */

// Worker state
let wasmModule: any = null
let isInitialized = false
let isRunning = false
let shouldStop = false

// Types for message protocol
interface WorkerMessage {
  type: 'init' | 'run' | 'step' | 'stop' | 'getResults' | 'cleanup'
  payload?: any
  requestId?: string
}

interface WorkerResponse {
  type: 'ready' | 'initialized' | 'progress' | 'complete' | 'stepped' | 'results' | 'stopped' | 'cleaned' | 'error'
  payload?: any
  requestId?: string
  error?: string
}

/**
 * Post a response message to the main thread
 */
function postResponse(response: WorkerResponse) {
  self.postMessage(response)
}

/**
 * Load and instantiate the WASM module from base64-encoded data
 */
async function initializeModule(
  wasmDataBase64: string,
  jsDataBase64: string,
  metadata: any
): Promise<void> {
  if (isInitialized) {
    throw new Error('Worker already initialized')
  }

  // Decode base64 to binary
  const wasmBinary = Uint8Array.from(atob(wasmDataBase64), c => c.charCodeAt(0)).buffer
  const jsCode = atob(jsDataBase64)

  // Evaluate JS code to get the module factory
  const moduleFactoryCode = `${jsCode}\nreturn createModule;`
  const createModule = new Function(moduleFactoryCode)()

  if (typeof createModule !== 'function') {
    throw new Error('createModule is not a function')
  }

  // Instantiate WASM module
  wasmModule = await createModule({
    wasmBinary,
    print: () => {},
    printErr: () => {}
  })

  // Store metadata for later use
  wasmModule._metadata = {
    inputMap: new Map(metadata.inputMap || []),
    outputMap: new Map(metadata.outputMap || [])
  }

  isInitialized = true
}

/**
 * Initialize the simulation with timestep
 */
function initSimulation(timeStep: number): void {
  if (!wasmModule) {
    throw new Error('WASM module not loaded')
  }
  wasmModule._wasm_init(timeStep)
}

/**
 * Execute a single simulation step
 */
function stepSimulation(dt: number): void {
  if (!wasmModule) {
    throw new Error('WASM module not loaded')
  }
  // Step with the provided timestep
  wasmModule._wasm_step(dt)
}

/**
 * Get current simulation time
 */
function getTime(): number {
  if (!wasmModule) return 0
  return wasmModule._wasm_get_time()
}

/**
 * Run full simulation with progress updates
 */
async function runSimulation(config: {
  timeStep: number
  duration: number
  progressInterval?: number
}): Promise<void> {
  if (!wasmModule) {
    throw new Error('WASM module not loaded')
  }

  isRunning = true
  shouldStop = false

  const { timeStep, duration, progressInterval = 100 } = config
  const numSteps = Math.floor(duration / timeStep)

  // Initialize simulation
  wasmModule._wasm_init(timeStep)

  let lastProgressUpdate = Date.now()
  const progressUpdateMs = 50 // Send progress updates every 50ms

  for (let i = 0; i < numSteps && !shouldStop; i++) {
    wasmModule._wasm_step(timeStep)

    // Send progress updates periodically (but not every step)
    const now = Date.now()
    if (now - lastProgressUpdate >= progressUpdateMs) {
      const progress = ((i + 1) / numSteps) * 100
      postResponse({
        type: 'progress',
        payload: {
          step: i + 1,
          totalSteps: numSteps,
          progress,
          time: wasmModule._wasm_get_time()
        }
      })
      lastProgressUpdate = now

      // Yield to allow stop messages to be processed
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  isRunning = false

  if (shouldStop) {
    postResponse({ type: 'stopped' })
  } else {
    postResponse({
      type: 'complete',
      payload: {
        finalTime: wasmModule._wasm_get_time(),
        totalSteps: numSteps
      }
    })
  }
}

/**
 * Retrieve all sample data from loggers and displays
 * Handles circular buffer unwrapping for wrapped buffers
 */
function getSampleData(): Map<string, any[]> {
  if (!wasmModule) {
    return new Map()
  }

  const sampleData = new Map<string, any[]>()

  // Check if collector functions are available
  if (!wasmModule._wasm_get_collector_count) {
    return sampleData
  }

  const collectorCount = wasmModule._wasm_get_collector_count()

  for (let i = 0; i < collectorCount; i++) {
    const namePtr = wasmModule._wasm_get_collector_name(i)
    const name = wasmModule.UTF8ToString(namePtr)
    const numSamples = wasmModule._wasm_get_sample_count(i)
    const samplesPtr = wasmModule._wasm_get_samples(i)

    // Get element size (1 for scalar, N for vector, M*N for matrix)
    const elementSize = wasmModule._wasm_get_element_size
      ? wasmModule._wasm_get_element_size(i)
      : 1

    // For circular buffer: get write index and max samples
    const maxSamples = wasmModule._wasm_get_max_samples
      ? wasmModule._wasm_get_max_samples(i)
      : numSamples

    // writeIndex is where the NEXT write would go, which is also where the OLDEST data is
    const writeIndex = wasmModule._wasm_get_sample_write_index
      ? wasmModule._wasm_get_sample_write_index(i)
      : 0

    // Determine if buffer has wrapped
    const hasWrapped = numSamples >= maxSamples

    // Copy samples from WASM memory to JavaScript array in chronological order
    const samples: any[] = []

    if (elementSize === 1) {
      // Scalar signal - return flat array of numbers
      if (!hasWrapped) {
        // Buffer hasn't wrapped - read from 0 to numSamples
        for (let j = 0; j < numSamples; j++) {
          samples.push(wasmModule.HEAPF64[samplesPtr / 8 + j])
        }
      } else {
        // Buffer has wrapped - read in chronological order starting from writeIndex
        for (let j = 0; j < numSamples; j++) {
          const bufferIdx = (writeIndex + j) % maxSamples
          samples.push(wasmModule.HEAPF64[samplesPtr / 8 + bufferIdx])
        }
      }
    } else {
      // Vector or matrix signal - return array of arrays
      if (!hasWrapped) {
        for (let j = 0; j < numSamples; j++) {
          const sample: number[] = []
          for (let k = 0; k < elementSize; k++) {
            sample.push(wasmModule.HEAPF64[samplesPtr / 8 + j * elementSize + k])
          }
          samples.push(sample)
        }
      } else {
        // Buffer has wrapped - read in chronological order
        for (let j = 0; j < numSamples; j++) {
          const bufferIdx = (writeIndex + j) % maxSamples
          const sample: number[] = []
          for (let k = 0; k < elementSize; k++) {
            sample.push(wasmModule.HEAPF64[samplesPtr / 8 + bufferIdx * elementSize + k])
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
 * Clean up WASM resources
 */
function cleanup(): void {
  if (wasmModule && wasmModule._wasm_cleanup) {
    wasmModule._wasm_cleanup()
  }
}

/**
 * Handle incoming messages from main thread
 */
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload, requestId } = event.data

  try {
    switch (type) {
      case 'init': {
        await initializeModule(
          payload.wasmData,
          payload.jsData,
          payload.metadata
        )
        postResponse({ type: 'initialized', requestId })
        break
      }

      case 'run': {
        await runSimulation({
          timeStep: payload.timeStep,
          duration: payload.duration,
          progressInterval: payload.progressInterval
        })
        break
      }

      case 'step': {
        // If timestep provided, initialize first
        const dt = payload?.timeStep
        if (dt !== undefined) {
          initSimulation(dt)
        }

        // Step with the provided timestep (or fail if not provided)
        if (dt === undefined) {
          throw new Error('timeStep is required for step operation')
        }

        stepSimulation(dt)
        postResponse({
          type: 'stepped',
          payload: { time: getTime() },
          requestId
        })
        break
      }

      case 'stop': {
        shouldStop = true
        postResponse({ type: 'stopped', requestId })
        break
      }

      case 'getResults': {
        const data = getSampleData()
        // Convert Map to array for postMessage serialization
        const dataArray = Array.from(data.entries())
        postResponse({
          type: 'results',
          payload: { sampleData: dataArray },
          requestId
        })
        break
      }

      case 'cleanup': {
        cleanup()
        wasmModule = null
        isInitialized = false
        isRunning = false
        shouldStop = false
        postResponse({ type: 'cleaned', requestId })
        break
      }

      default:
        throw new Error(`Unknown message type: ${type}`)
    }
  } catch (error) {
    postResponse({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId
    })
  }
}

// Notify main thread that worker is ready
postResponse({ type: 'ready' })

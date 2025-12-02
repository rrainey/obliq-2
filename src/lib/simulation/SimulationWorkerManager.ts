/**
 * SimulationWorkerManager.ts
 *
 * Manager class for the simulation Web Worker.
 * Provides a clean Promise-based API for running WASM simulations
 * off the main thread.
 *
 * Usage:
 * ```typescript
 * const manager = new SimulationWorkerManager()
 * await manager.initialize(wasmData, jsData, metadata)
 * await manager.run(
 *   { timeStep: 0.01, duration: 10 },
 *   (progress) => console.log(`${progress.progress}%`)
 * )
 * const results = await manager.getResults()
 * manager.terminate()
 * ```
 */

import type { SignalValue } from '@/lib/modelSchema'

/**
 * Simulation progress information
 */
export interface SimulationProgress {
  /** Current simulation step */
  step: number
  /** Total number of steps */
  totalSteps: number
  /** Progress percentage (0-100) */
  progress: number
  /** Current simulation time */
  time: number
}

/**
 * Configuration for running simulation
 */
export interface SimulationRunConfig {
  /** Time step in seconds */
  timeStep: number
  /** Total duration in seconds */
  duration: number
  /** Interval for progress updates in ms (default: 50) */
  progressInterval?: number
}

/**
 * Simulation completion result
 */
export interface SimulationResult {
  /** Final simulation time */
  finalTime: number
  /** Total steps executed */
  totalSteps: number
  /** Whether simulation was stopped early */
  wasStopped: boolean
}

/**
 * Message types for worker communication
 */
type WorkerMessageType = 'init' | 'run' | 'step' | 'stop' | 'getResults' | 'cleanup'
type WorkerResponseType = 'ready' | 'initialized' | 'progress' | 'complete' | 'stepped' | 'results' | 'stopped' | 'cleaned' | 'error'

interface PendingRequest {
  resolve: (value: any) => void
  reject: (error: Error) => void
  onProgress?: (progress: SimulationProgress) => void
}

/**
 * Manages a Web Worker for running WASM simulations
 */
export class SimulationWorkerManager {
  private worker: Worker | null = null
  private isReady = false
  private isInitialized = false
  private pendingRequests = new Map<string, PendingRequest>()
  private currentRunRequest: PendingRequest | null = null
  private requestIdCounter = 0
  private metadata: any = null

  /**
   * Create a new SimulationWorkerManager
   *
   * @param workerPath - Path to the worker script (default: auto-detected)
   */
  constructor() {
    this.createWorker()
  }

  /**
   * Create and initialize the Web Worker
   */
  private createWorker(): void {
    // Create worker from module URL
    // In Next.js, we need to use a different approach
    try {
      // Use dynamic import with worker type
      this.worker = new Worker(
        new URL('./SimulationWorker.ts', import.meta.url),
        { type: 'module' }
      )

      this.worker.onmessage = this.handleMessage.bind(this)
      this.worker.onerror = this.handleError.bind(this)
    } catch (error) {
      console.error('[SimulationWorkerManager] Failed to create worker:', error)
      throw new Error('Web Worker creation failed. Worker-based simulation not available.')
    }
  }

  /**
   * Handle messages from the worker
   */
  private handleMessage(event: MessageEvent): void {
    const { type, payload, requestId, error } = event.data

    switch (type) {
      case 'ready':
        this.isReady = true
        break

      case 'initialized':
        this.isInitialized = true
        this.resolveRequest(requestId, undefined)
        break

      case 'progress':
        // Progress updates during simulation run
        if (this.currentRunRequest?.onProgress) {
          this.currentRunRequest.onProgress(payload)
        }
        break

      case 'complete':
        if (this.currentRunRequest) {
          this.currentRunRequest.resolve({
            ...payload,
            wasStopped: false
          })
          this.currentRunRequest = null
        }
        break

      case 'stopped':
        if (this.currentRunRequest) {
          this.currentRunRequest.resolve({
            finalTime: 0,
            totalSteps: 0,
            wasStopped: true
          })
          this.currentRunRequest = null
        } else {
          this.resolveRequest(requestId, undefined)
        }
        break

      case 'stepped':
        this.resolveRequest(requestId, payload)
        break

      case 'results':
        // Convert array back to Map
        const sampleData = new Map<string, SignalValue[]>(payload.sampleData)
        this.resolveRequest(requestId, sampleData)
        break

      case 'cleaned':
        this.isInitialized = false
        this.resolveRequest(requestId, undefined)
        break

      case 'error':
        this.rejectRequest(requestId, new Error(error))
        break
    }
  }

  /**
   * Handle worker errors
   */
  private handleError(event: ErrorEvent): void {
    console.error('[SimulationWorkerManager] Worker error:', event.message)

    // Reject all pending requests
    for (const [requestId, request] of this.pendingRequests) {
      request.reject(new Error(`Worker error: ${event.message}`))
    }
    this.pendingRequests.clear()

    if (this.currentRunRequest) {
      this.currentRunRequest.reject(new Error(`Worker error: ${event.message}`))
      this.currentRunRequest = null
    }
  }

  /**
   * Resolve a pending request
   */
  private resolveRequest(requestId: string | undefined, value: any): void {
    if (!requestId) return
    const request = this.pendingRequests.get(requestId)
    if (request) {
      this.pendingRequests.delete(requestId)
      request.resolve(value)
    }
  }

  /**
   * Reject a pending request
   */
  private rejectRequest(requestId: string | undefined, error: Error): void {
    if (!requestId) {
      // If no requestId, reject current run request if exists
      if (this.currentRunRequest) {
        this.currentRunRequest.reject(error)
        this.currentRunRequest = null
      }
      return
    }
    const request = this.pendingRequests.get(requestId)
    if (request) {
      this.pendingRequests.delete(requestId)
      request.reject(error)
    }
  }

  /**
   * Send a message to the worker and wait for response
   */
  private sendMessage<T>(
    type: WorkerMessageType,
    payload?: any,
    onProgress?: (progress: SimulationProgress) => void
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not available'))
        return
      }

      const requestId = `req_${++this.requestIdCounter}`

      if (type === 'run') {
        // Run requests are handled differently (progress updates)
        this.currentRunRequest = { resolve, reject, onProgress }
      } else {
        this.pendingRequests.set(requestId, { resolve, reject })
      }

      this.worker.postMessage({ type, payload, requestId })
    })
  }

  /**
   * Wait for worker to be ready
   */
  async waitForReady(timeout = 5000): Promise<void> {
    if (this.isReady) return

    const startTime = Date.now()
    while (!this.isReady && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    if (!this.isReady) {
      throw new Error('Worker failed to become ready within timeout')
    }
  }

  /**
   * Initialize the worker with WASM module data
   *
   * @param wasmData - Base64-encoded WASM binary
   * @param jsData - Base64-encoded JS glue code
   * @param metadata - Module metadata including input/output maps
   */
  async initialize(wasmData: string, jsData: string, metadata: any): Promise<void> {
    await this.waitForReady()

    if (this.isInitialized) {
      // Clean up existing module first
      await this.cleanup()
    }

    this.metadata = metadata
    await this.sendMessage('init', { wasmData, jsData, metadata })
  }

  /**
   * Run a full simulation with progress updates
   *
   * @param config - Simulation configuration
   * @param onProgress - Optional callback for progress updates
   * @returns Simulation result
   */
  async run(
    config: SimulationRunConfig,
    onProgress?: (progress: SimulationProgress) => void
  ): Promise<SimulationResult> {
    if (!this.isInitialized) {
      throw new Error('Worker not initialized. Call initialize() first.')
    }

    return this.sendMessage('run', config, onProgress)
  }

  /**
   * Execute a single simulation step
   *
   * @param timeStep - Optional timestep for initialization
   * @returns Current simulation time
   */
  async step(timeStep?: number): Promise<{ time: number }> {
    if (!this.isInitialized) {
      throw new Error('Worker not initialized. Call initialize() first.')
    }

    return this.sendMessage('step', { timeStep })
  }

  /**
   * Stop a running simulation
   */
  async stop(): Promise<void> {
    await this.sendMessage('stop')
  }

  /**
   * Get all sample data from loggers and displays
   *
   * @returns Map of collector name to sample values
   */
  async getResults(): Promise<Map<string, SignalValue[]>> {
    if (!this.isInitialized) {
      throw new Error('Worker not initialized. Call initialize() first.')
    }

    return this.sendMessage('getResults')
  }

  /**
   * Clean up WASM resources
   */
  async cleanup(): Promise<void> {
    if (this.worker && this.isInitialized) {
      await this.sendMessage('cleanup')
    }
  }

  /**
   * Terminate the worker completely
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
      this.isReady = false
      this.isInitialized = false
      this.pendingRequests.clear()
      this.currentRunRequest = null
    }
  }

  /**
   * Check if the worker is initialized and ready
   */
  isWorkerReady(): boolean {
    return this.isReady && this.isInitialized
  }

  /**
   * Get metadata about the loaded module
   */
  getMetadata(): any {
    return this.metadata
  }
}

/**
 * Check if Web Workers are available in the current environment
 */
export function isWorkerAvailable(): boolean {
  return typeof Worker !== 'undefined'
}

/**
 * Create a simulation worker manager with fallback
 *
 * @returns Worker manager or null if workers not supported
 */
export function createWorkerManager(): SimulationWorkerManager | null {
  if (!isWorkerAvailable()) {
    console.warn('[SimulationWorkerManager] Web Workers not available')
    return null
  }

  try {
    return new SimulationWorkerManager()
  } catch (error) {
    console.error('[SimulationWorkerManager] Failed to create worker:', error)
    return null
  }
}

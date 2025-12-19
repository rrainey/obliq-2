/**
 * Simulation Engine Factory
 *
 * Provides a unified interface for creating WASM simulation engines.
 * As of Phase 6, WASM is the only supported simulation engine.
 * As of Phase 7, supports Web Worker-based simulation for non-blocking UI.
 *
 * Usage:
 * ```typescript
 * const engine = await createSimulationEngine({
 *   modelId: 'uuid',
 *   config: { timeStep: 0.01 }
 * })
 *
 * // Or with Web Worker (recommended for long simulations):
 * const workerManager = createWorkerSimulation()
 * await workerManager.initialize(wasmData, jsData, metadata)
 * await workerManager.run({ timeStep: 0.01, duration: 10 }, onProgress)
 * ```
 */

import { SimulationConfig } from '@/lib/simulationTypes'
import { WasmSimulationEngine } from '@/lib/simulation/WasmSimulationEngine'
import {
  SimulationWorkerManager,
  isWorkerAvailable,
  createWorkerManager,
  type SimulationProgress,
  type SimulationRunConfig,
  type SimulationResult
} from '@/lib/simulation/SimulationWorkerManager'

/**
 * Options for creating a simulation engine
 */
export interface CreateEngineOptions {
  /** Model ID for WASM engine */
  modelId: string

  /** Simulation configuration */
  config?: SimulationConfig

  /** WASM-specific options */
  wasmOptions?: {
    enableLeakDetection?: boolean
    memoryLimit?: number
    optimizationLevel?: 'O0' | 'O1' | 'O2' | 'O3'
  }
}

/**
 * Unified simulation engine interface
 *
 * WasmSimulationEngine implements these core methods
 */
export interface ISimulationEngine {
  step(dt?: number): void
  getTime(): number
  getState(): any
  destroy?(): void
}

/**
 * @deprecated WASM is now always enabled. This function always returns true.
 * Kept for backward compatibility during migration.
 */
export function getWasmPreference(): boolean {
  return true
}

/**
 * @deprecated WASM is now always enabled. This function is a no-op.
 * Kept for backward compatibility during migration.
 */
export function setWasmPreference(_enabled: boolean): void {
  // No-op: WASM is always enabled as of Phase 6
  console.log('[SimulationEngineFactory] WASM is now the only simulation engine')
}

/**
 * Create a WASM simulation engine
 *
 * As of Phase 6, this factory always creates a WASM engine.
 *
 * @param options - Engine creation options
 * @returns WASM simulation engine instance
 *
 * @example
 * const engine = await createSimulationEngine({
 *   modelId: 'uuid',
 *   config: { timeStep: 0.01 }
 * })
 */
export async function createSimulationEngine(
  options: CreateEngineOptions
): Promise<WasmSimulationEngine> {
  console.log(`[SimulationEngineFactory] Creating WASM engine for model: ${options.modelId}`)

  const engine = new WasmSimulationEngine(options.modelId, {
    enableLeakDetection: options.wasmOptions?.enableLeakDetection,
    memoryLimit: options.wasmOptions?.memoryLimit
  })

  // Initialize the engine
  const timeStep = options.config?.timeStep ?? 0.01
  await engine.initialize(timeStep, {
    optimizationLevel: options.wasmOptions?.optimizationLevel
  })

  return engine
}

/**
 * Check if WASM simulation is available
 *
 * @returns true if WASM engine can be used
 */
export function isWasmAvailable(): boolean {
  if (typeof window === 'undefined') {
    return false // Server-side
  }

  // Check for WebAssembly support
  if (typeof WebAssembly === 'undefined') {
    return false
  }

  // Could add additional checks here (e.g., API availability)
  return true
}

/**
 * Get engine type from an engine instance
 *
 * @param engine - Simulation engine instance
 * @returns 'wasm' (always, as of Phase 6)
 */
export function getEngineType(engine: WasmSimulationEngine): 'wasm' {
  return 'wasm'
}

/**
 * Telemetry: Track engine usage
 *
 * Call this when an engine is successfully created to track usage patterns.
 *
 * @param modelId - Model ID
 */
export function trackEngineUsage(modelId?: string): void {
  // This is a placeholder for telemetry integration
  // In production, this would send data to your analytics service

  const event = {
    type: 'simulation_engine_created',
    engineType: 'wasm',
    modelId,
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
  }

  console.log('[Telemetry]', event)

  // TODO: Send to analytics service
  // analytics.track(event)
}

// Re-export worker-related types and functions for convenience
export {
  SimulationWorkerManager,
  isWorkerAvailable,
  createWorkerManager,
  type SimulationProgress,
  type SimulationRunConfig,
  type SimulationResult
}

/**
 * Create a worker-based simulation manager
 *
 * Provides non-blocking simulation execution with progress updates.
 * Falls back to null if Web Workers are not available.
 *
 * @returns SimulationWorkerManager instance or null
 *
 * @example
 * const manager = createWorkerSimulation()
 * if (manager) {
 *   await manager.initialize(wasmData, jsData, metadata)
 *   await manager.run({ timeStep: 0.01, duration: 10 }, (progress) => {
 *     console.log(`Progress: ${progress.progress}%`)
 *   })
 *   const results = await manager.getResults()
 *   manager.terminate()
 * } else {
 *   // Fallback to main thread execution
 * }
 */
export function createWorkerSimulation(): SimulationWorkerManager | null {
  return createWorkerManager()
}

/**
 * Check if worker-based simulation is available
 *
 * @returns true if Web Workers are supported
 */
export function isWorkerSimulationAvailable(): boolean {
  return isWorkerAvailable()
}

/**
 * Simulation Engine Factory
 *
 * Provides a unified interface for creating simulation engines with support
 * for toggling between JavaScript and WASM implementations via feature flags.
 *
 * Usage:
 * ```typescript
 * const engine = await createSimulationEngine({
 *   modelId: 'uuid',
 *   useWasm: true,  // or false for JavaScript engine
 *   config: { timeStep: 0.01 }
 * })
 * ```
 */

import { SimulationEngine, Sheet, SimulationConfig } from '@/lib/simulationEngine'
import { WasmSimulationEngine } from '@/lib/simulation/WasmSimulationEngine'

/**
 * Options for creating a simulation engine
 */
export interface CreateEngineOptions {
  /** Model ID (for WASM engine) or sheets (for JS engine) */
  modelId?: string
  sheets?: Sheet[]
  connections?: any[]

  /** Feature flag: use WASM engine instead of JavaScript */
  useWasm?: boolean

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
 * Both SimulationEngine and WasmSimulationEngine implement these core methods
 */
export interface ISimulationEngine {
  step(dt?: number): void
  getTime(): number
  getState(): any
  destroy?(): void
}

/**
 * Feature flag storage key
 */
const FEATURE_FLAG_KEY = 'obliq_useWasmSimulation'

/**
 * Get the current WASM feature flag preference from localStorage
 *
 * @returns true if WASM is enabled, false otherwise
 */
export function getWasmPreference(): boolean {
  if (typeof window === 'undefined') {
    return false // Server-side: default to JavaScript
  }

  try {
    const stored = localStorage.getItem(FEATURE_FLAG_KEY)
    if (stored === null) {
      return false // Default to JavaScript engine
    }
    return stored === 'true'
  } catch (error) {
    console.warn('[SimulationEngineFactory] Failed to read WASM preference:', error)
    return false
  }
}

/**
 * Set the WASM feature flag preference in localStorage
 *
 * @param enabled - Whether to enable WASM simulation
 */
export function setWasmPreference(enabled: boolean): void {
  if (typeof window === 'undefined') {
    console.warn('[SimulationEngineFactory] Cannot set preference on server-side')
    return
  }

  try {
    localStorage.setItem(FEATURE_FLAG_KEY, enabled.toString())
    console.log(`[SimulationEngineFactory] WASM preference set to: ${enabled}`)
  } catch (error) {
    console.error('[SimulationEngineFactory] Failed to save WASM preference:', error)
  }
}

/**
 * Create a simulation engine based on feature flags
 *
 * This factory function provides a unified interface for creating either
 * a JavaScript SimulationEngine or a WASM WasmSimulationEngine.
 *
 * @param options - Engine creation options
 * @returns Simulation engine instance (may be async if WASM)
 *
 * @example
 * // Create with explicit flag
 * const wasmEngine = await createSimulationEngine({
 *   modelId: 'uuid',
 *   useWasm: true,
 *   config: { timeStep: 0.01 }
 * })
 *
 * @example
 * // Use stored preference
 * const engine = await createSimulationEngine({
 *   modelId: 'uuid',
 *   sheets: [...],
 *   config: { timeStep: 0.01 }
 * })
 */
export async function createSimulationEngine(
  options: CreateEngineOptions
): Promise<SimulationEngine | WasmSimulationEngine> {
  // Determine whether to use WASM
  const useWasm = options.useWasm ?? getWasmPreference()

  if (useWasm) {
    // Create WASM engine
    if (!options.modelId) {
      throw new Error('modelId is required for WASM simulation engine')
    }

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
  } else {
    // Create JavaScript engine
    if (!options.sheets || !options.connections) {
      throw new Error('sheets and connections are required for JavaScript simulation engine')
    }

    console.log('[SimulationEngineFactory] Creating JavaScript engine')

    const engine = new SimulationEngine(
      options.sheets,
      options.connections,
      options.config ?? {}
    )

    return engine
  }
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
 * @returns 'wasm' or 'javascript'
 */
export function getEngineType(engine: SimulationEngine | WasmSimulationEngine): 'wasm' | 'javascript' {
  return engine instanceof WasmSimulationEngine ? 'wasm' : 'javascript'
}

/**
 * Telemetry: Track engine usage
 *
 * Call this when an engine is successfully created to track usage patterns.
 *
 * @param engineType - Type of engine created
 * @param modelId - Model ID (if available)
 */
export function trackEngineUsage(engineType: 'wasm' | 'javascript', modelId?: string): void {
  // This is a placeholder for telemetry integration
  // In production, this would send data to your analytics service

  const event = {
    type: 'simulation_engine_created',
    engineType,
    modelId,
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
  }

  console.log('[Telemetry]', event)

  // TODO: Send to analytics service
  // analytics.track(event)
}

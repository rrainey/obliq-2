// lib/globalSettings.ts
//
// Model-level simulation settings (`data.globalSettings`) and their defaults.
// Kept free of React/store imports so server code and CLI scripts can use it.

/** Model-level simulation settings, persisted as `data.globalSettings`. */
export interface SimulationGlobalSettings {
  simulationTimeStep: number
  simulationDuration: number
  integrationAlgorithm: 'euler' | 'rk4'
  debugMath: boolean
}

export const DEFAULT_GLOBAL_SETTINGS: SimulationGlobalSettings = {
  simulationTimeStep: 0.01,
  simulationDuration: 10.0,
  integrationAlgorithm: 'rk4',
  debugMath: false
}

/** Fill in defaults for missing/invalid fields of a stored `globalSettings`. */
export function normalizeGlobalSettings(raw: any): SimulationGlobalSettings {
  const positive = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback
  return {
    simulationTimeStep: positive(raw?.simulationTimeStep, DEFAULT_GLOBAL_SETTINGS.simulationTimeStep),
    simulationDuration: positive(raw?.simulationDuration, DEFAULT_GLOBAL_SETTINGS.simulationDuration),
    integrationAlgorithm: raw?.integrationAlgorithm === 'euler' ? 'euler' : 'rk4',
    debugMath: !!raw?.debugMath
  }
}

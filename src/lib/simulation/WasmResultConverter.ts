/**
 * WASM Result Converter
 *
 * Converts WASM simulation results (logger outputs) to the UI format
 * expected by the existing visualization components.
 */

import { SimulationResults } from '@/lib/simulationEngine'
import type { SignalValue } from '@/lib/modelSchema'
import { Sheet } from '@/components/SheetTabs'

/**
 * Convert WASM logger/display outputs to UI SimulationResults format (new internal storage API)
 *
 * @param sampleData - Map of collector name (without prefix) to sample arrays
 * @param sheets - Model sheets to map loggers/displays back to blocks
 * @param timeStep - Simulation time step
 * @param duration - Simulation duration
 * @returns Map of sheet IDs to SimulationResults
 */
export function convertWasmToUIFormat(
  sampleData: Map<string, SignalValue[]>,
  sheets: Sheet[],
  timeStep: number,
  duration: number
): Map<string, SimulationResults>

/**
 * Convert WASM logger/display outputs to UI SimulationResults format (legacy external collection API)
 *
 * @param loggerNames - Array of logger/display names from WASM (with 'logger_' or 'display_' prefix)
 * @param loggerValues - Object of logger/display values (without prefix)
 * @param sheets - Model sheets to map loggers/displays back to blocks
 * @param timeStep - Simulation time step
 * @param duration - Simulation duration
 * @param timePoints - Array of time points from simulation
 * @param loggerHistory - Historical data collected during simulation (optional)
 * @returns Map of sheet IDs to SimulationResults
 */
export function convertWasmToUIFormat(
  loggerNames: string[],
  loggerValues: Record<string, SignalValue>,
  sheets: Sheet[],
  timeStep: number,
  duration: number,
  timePoints?: number[],
  loggerHistory?: Map<string, SignalValue[]>
): Map<string, SimulationResults>

/**
 * Implementation
 */
export function convertWasmToUIFormat(
  arg1: Map<string, SignalValue[]> | string[],
  arg2: Sheet[] | Record<string, SignalValue>,
  arg3: Sheet[] | number,
  arg4: number,
  arg5?: number,
  arg6?: number[],
  arg7?: Map<string, SignalValue[]>
): Map<string, SimulationResults> {
  // Detect which overload is being used
  if (arg1 instanceof Map) {
    // New internal storage API
    const sampleData = arg1
    const sheets = arg2 as Sheet[]
    const timeStep = arg3 as number
    const duration = arg4
    return convertWasmToUIFormatInternal(sampleData, sheets, timeStep, duration)
  } else {
    // Legacy external collection API
    const loggerNames = arg1
    const loggerValues = arg2 as Record<string, SignalValue>
    const sheets = arg3 as Sheet[]
    const timeStep = arg4
    const duration = arg5!
    const timePoints = arg6
    const loggerHistory = arg7
    return convertWasmToUIFormatLegacy(
      loggerNames,
      loggerValues,
      sheets,
      timeStep,
      duration,
      timePoints,
      loggerHistory
    )
  }
}

/**
 * Internal storage implementation (new)
 *
 * Handles circular buffer data by generating time points based on actual sample count.
 * When a buffer wraps, samples represent the last (numSamples * timeStep) seconds.
 */
function convertWasmToUIFormatInternal(
  sampleData: Map<string, SignalValue[]>,
  sheets: Sheet[],
  timeStep: number,
  duration: number
): Map<string, SimulationResults> {
  const results = new Map<string, SimulationResults>()

  // Build collector name to block mapping
  const collectorToBlockMap = buildLoggerToBlockMap(sheets)

  // Get collector names from sample data
  // Try both prefixes and use whichever one exists in the mapping
  const collectorNames = Array.from(sampleData.keys()).map(name => {
    // Try display_ prefix first, then logger_
    const displayName = `display_${name}`
    const loggerName = `logger_${name}`

    if (collectorToBlockMap.has(displayName)) {
      return displayName
    } else if (collectorToBlockMap.has(loggerName)) {
      return loggerName
    }
    // Fallback to display_ if neither found (will be handled by groupLoggersBySheet warning)
    return displayName
  })

  // Group collectors by sheet
  const collectorsBySheet = groupLoggersBySheet(collectorNames, collectorToBlockMap, sheets)

  // Create SimulationResults for each sheet
  for (const [sheetId, collectors] of collectorsBySheet) {
    const signalData = new Map<string, SignalValue[]>()

    // Determine the maximum sample count across all collectors in this sheet
    let maxSampleCount = 0
    for (const { loggerName } of collectors) {
      const shortName = loggerName.replace(/^(logger_|display_)/, '')
      const data = sampleData.get(shortName)
      if (data && data.length > maxSampleCount) {
        maxSampleCount = data.length
      }
    }

    // Generate time points based on actual sample count
    // The samples are in chronological order, with the last sample at 'duration'
    // So the first sample is at: duration - (numSamples - 1) * timeStep
    let timePoints: number[]
    if (maxSampleCount > 0) {
      const startTime = duration - (maxSampleCount - 1) * timeStep
      timePoints = []
      for (let i = 0; i < maxSampleCount; i++) {
        timePoints.push(startTime + i * timeStep)
      }
    } else {
      timePoints = generateTimePoints(timeStep, duration)
    }

    for (const { blockId, loggerName } of collectors) {
      // Remove prefix to get short name
      const shortName = loggerName.replace(/^(logger_|display_)/, '')

      // Get historical data from sample data
      const data = sampleData.get(shortName)
      if (data) {
        signalData.set(blockId, data)
      }
    }

    results.set(sheetId, {
      timePoints,
      finalTime: duration,
      signalData
    })
  }

  return results
}

/**
 * External collection implementation (legacy)
 */
function convertWasmToUIFormatLegacy(
  loggerNames: string[],
  loggerValues: Record<string, SignalValue>,
  sheets: Sheet[],
  timeStep: number,
  duration: number,
  timePoints?: number[],
  loggerHistory?: Map<string, SignalValue[]>
): Map<string, SimulationResults> {
  const results = new Map<string, SimulationResults>()

  // Generate time points if not provided
  const finalTimePoints = timePoints || generateTimePoints(timeStep, duration)

  // Build logger name to block mapping
  const loggerToBlockMap = buildLoggerToBlockMap(sheets)

  // Group loggers by sheet
  const loggersBySheet = groupLoggersBySheet(loggerNames, loggerToBlockMap, sheets)

  // Create SimulationResults for each sheet
  for (const [sheetId, sheetLoggers] of loggersBySheet) {
    const signalData = new Map<string, SignalValue[]>()

    for (const loggerInfo of sheetLoggers) {
      const { blockId, loggerName } = loggerInfo
      // Remove prefix (either 'logger_' or 'display_')
      const shortName = loggerName.replace(/^(logger_|display_)/, '')

      // Get historical data if available, otherwise create array of final values
      let data: SignalValue[]
      if (loggerHistory && loggerHistory.has(shortName)) {
        data = loggerHistory.get(shortName)!
      } else {
        // No history - use final value for all time points
        const finalValue = loggerValues[shortName]
        data = new Array(finalTimePoints.length).fill(finalValue)
      }

      signalData.set(blockId, data)
    }

    const sheetResult: SimulationResults = {
      timePoints: finalTimePoints,
      finalTime: duration,
      signalData
    }

    results.set(sheetId, sheetResult)
  }

  return results
}

/**
 * Generate time points array
 */
function generateTimePoints(timeStep: number, duration: number): number[] {
  const numSteps = Math.floor(duration / timeStep)
  const points: number[] = []

  for (let i = 0; i <= numSteps; i++) {
    points.push(i * timeStep)
  }

  return points
}

/**
 * Build mapping from logger/display names to block IDs
 *
 * Searches all sheets for signal_logger and signal_display blocks and maps their names
 * to their block IDs and containing sheet IDs.
 */
function buildLoggerToBlockMap(
  sheets: Sheet[]
): Map<string, { blockId: string; sheetId: string; blockName: string }> {
  const map = new Map<string, { blockId: string; sheetId: string; blockName: string }>()

  // Helper to recursively search sheets including embedded subsystem sheets
  function searchSheet(sheet: Sheet) {
    for (const block of sheet.blocks) {
      if (block.type === 'signal_logger') {
        // Logger name in WASM will be 'logger_<sanitizedBlockName>'
        // Block names are sanitized to replace spaces with underscores
        const sanitizedName = block.name.replace(/[^a-zA-Z0-9_]/g, '_')
        const loggerName = `logger_${sanitizedName}`
        map.set(loggerName, {
          blockId: block.id,
          sheetId: sheet.id,
          blockName: block.name
        })
      } else if (block.type === 'signal_display') {
        // Display name in WASM will be 'display_<sanitizedBlockName>'
        // Block names are sanitized to replace spaces with underscores
        const sanitizedName = block.name.replace(/[^a-zA-Z0-9_]/g, '_')
        const displayName = `display_${sanitizedName}`
        map.set(displayName, {
          blockId: block.id,
          sheetId: sheet.id,
          blockName: block.name
        })
      }

      // Check for subsystems with embedded sheets
      if (block.type === 'subsystem' && block.parameters?.sheets) {
        for (const subSheet of block.parameters.sheets) {
          searchSheet(subSheet)
        }
      }
    }
  }

  // Search all root sheets
  for (const sheet of sheets) {
    searchSheet(sheet)
  }

  return map
}

/**
 * Group loggers by their containing sheet
 */
function groupLoggersBySheet(
  loggerNames: string[],
  loggerToBlockMap: Map<string, { blockId: string; sheetId: string; blockName: string }>,
  sheets: Sheet[]
): Map<string, Array<{ blockId: string; loggerName: string; blockName: string }>> {
  const loggersBySheet = new Map<string, Array<{ blockId: string; loggerName: string; blockName: string }>>()

  for (const loggerName of loggerNames) {
    const loggerInfo = loggerToBlockMap.get(loggerName)

    if (loggerInfo) {
      const { blockId, sheetId, blockName } = loggerInfo

      if (!loggersBySheet.has(sheetId)) {
        loggersBySheet.set(sheetId, [])
      }

      loggersBySheet.get(sheetId)!.push({
        blockId,
        loggerName,
        blockName
      })
    } else {
      console.warn(`[WasmResultConverter] Logger "${loggerName}" not found in any sheet`)
    }
  }

  return loggersBySheet
}

/**
 * Collect logger data during WASM simulation
 *
 * Call this at each simulation step to build historical data.
 */
export class WasmDataCollector {
  private history: Map<string, SignalValue[]> = new Map()
  private timePoints: number[] = []

  /**
   * Collect data at current time step
   */
  collect(time: number, loggerValues: Record<string, SignalValue>) {
    this.timePoints.push(time)

    for (const [name, value] of Object.entries(loggerValues)) {
      if (!this.history.has(name)) {
        this.history.set(name, [])
      }
      this.history.get(name)!.push(value)
    }
  }

  /**
   * Get collected historical data
   */
  getHistory(): Map<string, SignalValue[]> {
    return this.history
  }

  /**
   * Get time points
   */
  getTimePoints(): number[] {
    return this.timePoints
  }

  /**
   * Clear collected data
   */
  clear() {
    this.history.clear()
    this.timePoints = []
  }
}

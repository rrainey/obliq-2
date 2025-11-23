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
 * Convert WASM logger outputs to UI SimulationResults format
 *
 * WASM provides:
 * - loggerNames: ['logger_Temperature', 'logger_Pressure', ...]
 * - loggerValues: { Temperature: 23.5, Pressure: 101.3, ... }
 *
 * UI expects:
 * - Map<sheetId, SimulationResults>
 * - SimulationResults contains signalData per block ID
 *
 * @param loggerNames - Array of logger names from WASM (with 'logger_' prefix)
 * @param loggerValues - Object of logger values (without prefix)
 * @param sheets - Model sheets to map loggers back to blocks
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
      const shortName = loggerName.replace('logger_', '')

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
 * Build mapping from logger names to block IDs
 *
 * Searches all sheets for signal_logger blocks and maps their names
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
        // Logger name in WASM will be 'logger_<blockName>'
        const loggerName = `logger_${block.name}`
        map.set(loggerName, {
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

// components/SimulationDisplayPanel.tsx

'use client'

import { useEffect, useState, useCallback } from 'react'
import SignalDisplay from './SignalDisplay'
import { BlockData } from './BlockNode'
import { SimulationResults } from '@/lib/simulationTypes'
import { WasmSimulationEngine } from '@/lib/simulation/WasmSimulationEngine'
import type { SignalValue } from '@/lib/modelSchema'

interface SimulationDisplayPanelProps {
  blocks: BlockData[]
  simulationResults: SimulationResults | null
  isSimulating: boolean
}

/**
 * Convert signal data to CSV format
 */
function generateCSV(timePoints: number[], values: SignalValue[]): string {
  const lines: string[] = []

  // Determine if values are scalar, vector, or matrix
  const firstValue = values[0]

  if (typeof firstValue === 'number' || typeof firstValue === 'boolean') {
    // Scalar signal
    lines.push('time,value')
    for (let i = 0; i < timePoints.length && i < values.length; i++) {
      lines.push(`${timePoints[i]},${values[i]}`)
    }
  } else if (Array.isArray(firstValue)) {
    if (Array.isArray(firstValue[0])) {
      // Matrix signal - flatten to columns
      const rows = firstValue.length
      const cols = (firstValue[0] as number[]).length
      const headers = ['time']
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          headers.push(`[${r}][${c}]`)
        }
      }
      lines.push(headers.join(','))

      for (let i = 0; i < timePoints.length && i < values.length; i++) {
        const row = [timePoints[i].toString()]
        const matrix = values[i] as number[][]
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            row.push(matrix[r][c].toString())
          }
        }
        lines.push(row.join(','))
      }
    } else {
      // Vector signal
      const size = firstValue.length
      const headers = ['time', ...Array.from({ length: size }, (_, i) => `[${i}]`)]
      lines.push(headers.join(','))

      for (let i = 0; i < timePoints.length && i < values.length; i++) {
        const vec = values[i] as number[]
        lines.push([timePoints[i], ...vec].join(','))
      }
    }
  }

  return lines.join('\n')
}

/**
 * Download data as a CSV file
 */
function downloadCSV(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function SimulationDisplayPanel({
  blocks,
  simulationResults,
  isSimulating
}: SimulationDisplayPanelProps) {
  const [displayData, setDisplayData] = useState<Map<string, any[]>>(new Map())

  // Get all signal display and signal logger blocks
  const signalDisplayBlocks = blocks.filter(block => block.type === 'signal_display')
  const signalLoggerBlocks = blocks.filter(block => block.type === 'signal_logger')
  
  useEffect(() => {
    if (!simulationResults) {
      setDisplayData(new Map())
      return
    }

    // Process simulation results into display format
    const newDisplayData = new Map<string, any[]>()

    // Process signal display blocks
    for (const displayBlock of signalDisplayBlocks) {
      const blockData = simulationResults.signalData.get(displayBlock.id)

      if (blockData) {
        const timePoints = simulationResults.timePoints
        const values = blockData

        // Combine time and values
        const displayPoints = timePoints.map((time, index) => ({
          time,
          value: values[index]
        }))

        newDisplayData.set(displayBlock.id, displayPoints)
      }
    }

    // Process signal logger blocks
    for (const loggerBlock of signalLoggerBlocks) {
      const blockData = simulationResults.signalData.get(loggerBlock.id)

      if (blockData) {
        const timePoints = simulationResults.timePoints
        const values = blockData

        // Combine time and values for logger display
        const displayPoints = timePoints.map((time, index) => ({
          time,
          value: values[index]
        }))

        newDisplayData.set(loggerBlock.id, displayPoints)
      }
    }

    setDisplayData(newDisplayData)
  }, [simulationResults, signalDisplayBlocks, signalLoggerBlocks])
  
  // Handler for downloading logger data as CSV
  const handleDownloadCSV = useCallback(
    (block: BlockData) => {
      if (!simulationResults) return

      const blockData = simulationResults.signalData.get(block.id)
      if (!blockData || blockData.length === 0) return

      const csv = generateCSV(simulationResults.timePoints, blockData)
      const sanitizedName = block.name.replace(/[^a-zA-Z0-9_-]/g, '_')
      downloadCSV(`${sanitizedName}_data.csv`, csv)
    },
    [simulationResults]
  )

  // Don't render if there are no display or logger blocks
  if (signalDisplayBlocks.length === 0 && signalLoggerBlocks.length === 0) {
    return null
  }

  const hasDisplayData = simulationResults && simulationResults.signalData.size > 0

  return (
    <div className="bg-gray-50 border-t border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-700">Signal Outputs</h3>
      </div>

      <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
        {/* Signal Display blocks - show charts */}
        {signalDisplayBlocks.map(block => (
          <SignalDisplay
            key={block.id}
            block={block}
            signalData={displayData.get(block.id) || []}
            isRunning={isSimulating}
          />
        ))}

        {/* Signal Logger blocks - show download buttons */}
        {signalLoggerBlocks.length > 0 && (
          <div className="space-y-2">
            {signalDisplayBlocks.length > 0 && (
              <div className="border-t border-gray-200 pt-4 mt-4">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Data Loggers
                </h4>
              </div>
            )}
            {signalLoggerBlocks.map(block => {
              const loggerData = displayData.get(block.id)
              const sampleCount = loggerData?.length || 0
              const hasData = sampleCount > 0

              return (
                <div
                  key={block.id}
                  className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200"
                >
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <svg
                        className="w-5 h-5 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{block.name}</p>
                      <p className="text-xs text-gray-500">
                        {isSimulating
                          ? 'Recording...'
                          : hasData
                            ? `${sampleCount} samples`
                            : 'No data'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownloadCSV(block)}
                    disabled={!hasData || isSimulating}
                    className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      hasData && !isSimulating
                        ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                    }`}
                  >
                    <svg
                      className="w-4 h-4 mr-1"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    CSV
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Show message when simulation hasn't run yet */}
        {!hasDisplayData && !isSimulating && (
          <p className="text-sm text-gray-500 text-center py-4">
            Run a simulation to see signal data
          </p>
        )}
      </div>
    </div>
  )
}

// Hook to get real-time signal data during simulation
export function useSimulationDisplay(
  blocks: BlockData[],
  simulationEngine: any // WasmSimulationEngine instance
) {
  const [displayData, setDisplayData] = useState<Map<string, any[]>>(new Map())
  const signalDisplayBlocks = blocks.filter(block => block.type === 'signal_display')
  
  useEffect(() => {
    if (!simulationEngine) return
    
    const updateInterval = setInterval(() => {
      const state = simulationEngine.getState()
      const newDisplayData = new Map<string, any[]>()
      
      for (const displayBlock of signalDisplayBlocks) {
        const blockState = state.blockStates.get(displayBlock.id)
        
        if (blockState?.internalState?.samples) {
          const samples = blockState.internalState.samples
          const currentTime = state.time
          
          // Create display points from samples
          const displayPoints = samples.map((value: any, index: number) => ({
            time: currentTime - (samples.length - index - 1) * state.timeStep,
            value
          }))
          
          newDisplayData.set(displayBlock.id, displayPoints)
        }
      }
      
      setDisplayData(newDisplayData)
    }, 100) // Update every 100ms for smooth display
    
    return () => clearInterval(updateInterval)
  }, [simulationEngine, signalDisplayBlocks])
  
  return displayData
}
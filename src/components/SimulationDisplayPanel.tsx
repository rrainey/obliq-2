// components/SimulationDisplayPanel.tsx

'use client'

import { useEffect, useState } from 'react'
import SignalDisplay from './SignalDisplay'
import { BlockData } from './Block'
import { SimulationResults } from '@/lib/simulationEngine'

interface SimulationDisplayPanelProps {
  blocks: BlockData[]
  simulationResults: SimulationResults | null
  isSimulating: boolean
}

export default function SimulationDisplayPanel({ 
  blocks, 
  simulationResults, 
  isSimulating 
}: SimulationDisplayPanelProps) {
  const [displayData, setDisplayData] = useState<Map<string, any[]>>(new Map())
  
  // Get all signal display blocks
  const signalDisplayBlocks = blocks.filter(block => block.type === 'signal_display')
  
  useEffect(() => {
    if (!simulationResults) {
      setDisplayData(new Map())
      return
    }
    
    // Process simulation results into display format
    const newDisplayData = new Map<string, any[]>()
    
    for (const displayBlock of signalDisplayBlocks) {
      const blockData = simulationResults.signalData.get(displayBlock.id)
      
      if (blockData) {
        // Get the block state from the simulation to access the actual samples
        // For now, we'll use the signalData from results
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
    
    setDisplayData(newDisplayData)
  }, [simulationResults, signalDisplayBlocks])
  
  if (signalDisplayBlocks.length === 0) {
    return null
  }
  
  return (
    <div className="bg-gray-50 border-t border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-700">Signal Displays</h3>
      </div>
      
      <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
        {signalDisplayBlocks.map(block => (
          <SignalDisplay
            key={block.id}
            block={block}
            signalData={displayData.get(block.id) || []}
            isRunning={isSimulating}
          />
        ))}
      </div>
    </div>
  )
}

// Hook to get real-time signal data during simulation
export function useSimulationDisplay(
  blocks: BlockData[],
  simulationEngine: any // SimulationEngine instance
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
'use client'

import { useUser } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { Model } from '@/lib/types'
import { BlockData, PortInfo } from '@/components/Block'
import { WireData } from '@/components/Wire'
import { SimulationEngine, SimulationResults } from '@/lib/simulationEngine'
import Canvas from '@/components/Canvas'
import BlockLibrarySidebar from '@/components/BlockLibrarySidebar'
import SignalDisplay from '@/components/SignalDisplay'
import InputPortConfig from '@/components/InputPortConfig'
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface ModelEditorPageProps {
  params: Promise<{
    id: string
  }>
}

export default function ModelEditorPage({ params }: ModelEditorPageProps) {
  const { user, loading } = useUser()
  const router = useRouter()
  const [model, setModel] = useState<Model | null>(null)
  const [modelLoading, setModelLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<BlockData[]>([])
  const [wires, setWires] = useState<WireData[]>([])
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null)
  const [simulationResults, setSimulationResults] = useState<SimulationResults | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [simulationEngine, setSimulationEngine] = useState<SimulationEngine | null>(null)
  const [configBlock, setConfigBlock] = useState<BlockData | null>(null)
  
  // Unwrap the params Promise
  const { id } = use(params)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (model?.data?.sheets?.[0]) {
      const sheet = model.data.sheets[0]
      setBlocks(sheet.blocks || [])
      setWires(sheet.connections || [])
    }
  }, [model])

  useEffect(() => {
    if (user && id) {
      fetchModel()
    }
  }, [user, id])

  const fetchModel = async () => {
    try {
      const { data, error } = await supabase
        .from('models')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          setError('Model not found')
        } else {
          throw error
        }
        return
      }

      setModel(data)
    } catch (error) {
      console.error('Error fetching model:', error)
      setError('Failed to load model')
    } finally {
      setModelLoading(false)
    }
  }

  const getDefaultParameters = (blockType: string) => {
    switch (blockType) {
      case 'source':
        return { 
          signalType: 'constant',
          value: 1,
          stepTime: 1.0,
          stepValue: 1.0,
          slope: 1.0,
          startTime: 0,
          frequency: 1.0,
          amplitude: 1.0,
          phase: 0,
          offset: 0,
          f0: 0.1,
          f1: 10,
          duration: 10,
          mean: 0
        }
      case 'input_port':
        return { 
          portName: 'Input',
          defaultValue: 0
        }
      case 'output_port':
        return {
          portName: 'Output'
        }
      case 'lookup_1d':
        return {
          inputValues: [0, 1, 2],
          outputValues: [0, 1, 4]
        }
      case 'lookup_2d':
        return {
          input1Values: [0, 1],
          input2Values: [0, 1],
          outputTable: [[0, 1], [2, 3]]
        }
      case 'signal_display':
      case 'signal_logger':
        return { maxSamples: 1000 }
      default:
        return {}
    }
  }

  const handleCanvasDrop = (x: number, y: number, blockType: string) => {
    const newBlock: BlockData = {
      id: `${blockType}_${Date.now()}`,
      type: blockType,
      name: `${blockType.charAt(0).toUpperCase() + blockType.slice(1).replace('_', ' ')}${blocks.length + 1}`,
      position: { x, y },
      parameters: getDefaultParameters(blockType)
    }
    
    setBlocks(prev => [...prev, newBlock])
    console.log('Block added:', newBlock)
  }

  const handleBlockMove = (blockId: string, position: { x: number; y: number }) => {
    setBlocks(prev => prev.map(block => 
      block.id === blockId ? { ...block, position } : block
    ))
  }

  const handleBlockSelect = (blockId: string | null) => {
    setSelectedBlockId(blockId)
    setSelectedWireId(null) // Deselect wire when selecting block
  }

  const handleWireCreate = (sourcePort: PortInfo, targetPort: PortInfo) => {
    const newWire: WireData = {
      id: `wire_${Date.now()}`,
      sourceBlockId: sourcePort.blockId,
      sourcePortIndex: sourcePort.portIndex,
      targetBlockId: targetPort.blockId,
      targetPortIndex: targetPort.portIndex
    }
    
    setWires(prev => [...prev, newWire])
    console.log('Wire created:', newWire)
  }

  const handleWireSelect = (wireId: string | null) => {
    setSelectedWireId(wireId)
    setSelectedBlockId(null) // Deselect block when selecting wire
  }

  const handleWireDelete = (wireId: string) => {
    setWires(prev => prev.filter(wire => wire.id !== wireId))
    setSelectedWireId(null)
    console.log('Wire deleted:', wireId)
  }

  const handleRunSimulation = async () => {
    if (blocks.length === 0) {
      alert('No blocks to simulate')
      return
    }

    setIsSimulating(true)
    try {
      // Create simulation engine
      const config = {
        timeStep: model?.data?.globalSettings?.simulationTimeStep || 0.01,
        duration: model?.data?.globalSettings?.simulationDuration || 10.0
      }
      
      const engine = new SimulationEngine(blocks, wires, config)
      const results = engine.run()
      
      setSimulationResults(results)
      setSimulationEngine(engine) // Store engine for CSV export
      console.log('Simulation completed:', results)
    } catch (error) {
      console.error('Simulation error:', error)
      alert('Simulation failed. Check console for details.')
    } finally {
      setIsSimulating(false)
    }
  }

  const handleExportCSV = () => {
    if (!simulationEngine) {
      alert('No simulation data to export')
      return
    }

    try {
      const csvContent = simulationEngine.exportAllLoggedDataAsCSV()
      if (!csvContent) {
        alert('No logger blocks found or no data to export')
        return
      }

      // Create and download CSV file
      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${model?.name || 'simulation'}_data.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Export error:', error)
      alert('Failed to export CSV. Check console for details.')
    }
  }

  const handleBlockDoubleClick = (blockId: string) => {
    const block = blocks.find(b => b.id === blockId)
    if (block && (block.type === 'input_port' || block.type === 'output_port' || block.type === 'source')) {
      setConfigBlock(block)
    } else {
      console.log('Block double-clicked:', blockId)
      // TODO: Open properties panel for other block types in later tasks
    }
  }

  const handleBlockConfigUpdate = (parameters: Record<string, any>) => {
    if (configBlock) {
      setBlocks(prev => prev.map(block =>
        block.id === configBlock.id
          ? { ...block, parameters }
          : block
      ))
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            href="/models"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Back to Models
          </Link>
        </div>
      </div>
    )
  }

  if (modelLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading model...</div>
      </div>
    )
  }

  if (!model) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Model Not Found</h1>
          <Link
            href="/models"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Back to Models
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <Link
                href="/models"
                className="text-blue-600 hover:text-blue-800"
              >
                ← Back to Models
              </Link>
              <h1 className="text-xl font-semibold text-gray-900">
                {model.name}
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <button 
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                onClick={() => console.log('Save functionality coming in later tasks')}
              >
                Save
              </button>
              <button 
                className={`px-4 py-2 rounded-md text-white ${
                  isSimulating 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
                onClick={handleRunSimulation}
                disabled={isSimulating}
              >
                {isSimulating ? 'Running...' : 'Run Simulation'}
              </button>
              <button 
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                onClick={() => console.log('Code generation coming in later tasks')}
              >
                Generate Code
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex h-screen">
        {/* Block Library Sidebar */}
        <BlockLibrarySidebar />

        {/* Canvas Area */}
        <div className="flex-1 relative">
          <Canvas 
            blocks={blocks}
            wires={wires}
            selectedBlockId={selectedBlockId}
            selectedWireId={selectedWireId}
            onDrop={handleCanvasDrop}
            onBlockMove={handleBlockMove}
            onBlockSelect={handleBlockSelect}
            onBlockDoubleClick={handleBlockDoubleClick}
            onWireCreate={handleWireCreate}
            onWireSelect={handleWireSelect}
            onWireDelete={handleWireDelete}
          />
        </div>

        {/* Properties Panel */}
        <div className="w-80 bg-white shadow-sm border-l flex flex-col">
          <div className="p-4 border-b">
            <h2 className="text-lg font-medium text-gray-900">Properties</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {simulationResults ? (
              <div className="p-4">
                <h3 className="font-medium mb-3">Simulation Results</h3>
                <div className="text-sm text-gray-600 space-y-1 mb-4">
                  <div>Duration: {simulationResults.finalTime.toFixed(2)}s</div>
                  <div>Time Points: {simulationResults.timePoints.length}</div>
                  <div>Display Blocks: {simulationResults.signalData.size}</div>
                </div>
                
                {/* Display Signal Charts */}
                {Array.from(simulationResults.signalData.entries()).map(([blockId, data]) => {
                  const block = blocks.find(b => b.id === blockId && b.type === 'signal_display')
                  if (!block) return null
                  
                  return (
                    <div key={blockId} className="mb-6">
                      <SignalDisplay
                        blockId={blockId}
                        timePoints={simulationResults.timePoints}
                        signalData={data}
                        title={block.name}
                        width={320}
                        height={180}
                      />
                    </div>
                  )
                })}
                
                {/* Logger Block Data Summary */}
                {Array.from(simulationResults.signalData.entries()).map(([blockId, data]) => {
                  const block = blocks.find(b => b.id === blockId && b.type === 'signal_logger')
                  if (!block) return null
                  
                  return (
                    <div key={blockId} className="mb-4">
                      <div className="bg-gray-50 p-3 rounded">
                        <h4 className="font-medium text-sm mb-2">{block.name} (Logger)</h4>
                        <div className="text-xs text-gray-600 space-y-1">
                          <div>Final value: {data[data.length - 1]?.toFixed(3) || 'N/A'}</div>
                          <div>Samples: {data.length}</div>
                          <div>Min: {data.length > 0 ? Math.min(...data).toFixed(3) : 'N/A'}</div>
                          <div>Max: {data.length > 0 ? Math.max(...data).toFixed(3) : 'N/A'}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* CSV Export Button */}
                {Array.from(simulationResults.signalData.entries()).some(([blockId]) => 
                  blocks.find(b => b.id === blockId && b.type === 'signal_logger')
                ) && (
                  <div className="mt-4">
                    <button
                      onClick={handleExportCSV}
                      className="w-full px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                    >
                      Export Logger Data as CSV
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4">
                <p className="text-sm text-gray-500">
                  Run simulation to see signal displays and results
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Input Port Configuration Modal */}
      {configBlock && (
        <InputPortConfig
          block={configBlock}
          onUpdate={handleBlockConfigUpdate}
          onClose={() => setConfigBlock(null)}
        />
      )}
    </div>
  )
}
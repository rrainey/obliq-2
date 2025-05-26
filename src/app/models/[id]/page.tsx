'use client'

import { useUser } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { BlockData, PortInfo } from '@/components/Block'
import { WireData } from '@/components/Wire'
import { SimulationEngine } from '@/lib/simulationEngine'
import Canvas from '@/components/Canvas'
import BlockLibrarySidebar from '@/components/BlockLibrarySidebar'
import SignalDisplay from '@/components/SignalDisplay'
import SheetTabs, { Sheet } from '@/components/SheetTabs'
import InputPortConfig from '@/components/InputPortConfig'
import SourceConfig from '@/components/SourceConfig'
import ScaleConfig from '@/components/ScaleConfig'
import SubsystemConfig from '@/components/SubsystemConfig'
import TransferFunctionConfig from '@/components/TransferFunctionConfig'
import Lookup1DConfig from '@/components/Lookup1DConfig'
import Lookup2DConfig from '@/components/Lookup2DConfig'
import { useModelStore } from '@/lib/modelStore'
import { useAutoSave } from '@/lib/useAutoSave'
import { use, useEffect } from 'react'
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
  
  // Zustand store
  const {
    // State
    model, sheets, activeSheetId, blocks, wires,
    selectedBlockId, selectedWireId, configBlock,
    simulationResults, isSimulating, simulationEngine, outputPortValues,
    modelLoading, saving, error,
    
    // Actions
    setModel, setError, setModelLoading, saveModel,
    switchToSheet, addSheet, renameSheet, deleteSheet,
    addBlock, updateBlock, addWire, deleteWire,
    setSelectedBlockId, setSelectedWireId, setConfigBlock,
    setSimulationResults, setIsSimulating, setSimulationEngine, setOutputPortValues,
    updateCurrentSheet, saveCurrentSheetData, initializeFromModel
  } = useModelStore()
  
  // Unwrap the params Promise
  const { id } = use(params)

  // Enable auto-save
  useAutoSave()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

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

      initializeFromModel(data)
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
      case 'scale':
        return { gain: 1 }
      case 'transfer_function':
        return { 
          numerator: [1], 
          denominator: [1, 1]
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
      case 'subsystem':
        return { 
          sheetId: '',
          sheetName: 'Subsystem',
          inputPorts: ['Input1'],
          outputPorts: ['Output1']
        }
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
    
    // Special handling for subsystem blocks - automatically create their main sheet
    if (blockType === 'subsystem') {
      const subsystemMainSheetId = `${newBlock.id}_main`
      const subsystemMainSheet: Sheet = {
        id: subsystemMainSheetId,
        name: `${newBlock.name} Main`,
        blocks: [],
        connections: [],
        extents: {
          width: 1000,
          height: 800
        }
      }
      
      // Update the subsystem parameters to reference its main sheet
      newBlock.parameters = {
        ...newBlock.parameters,
        sheetId: subsystemMainSheetId,
        sheetName: `${newBlock.name} Main`
      }
      
      // Add the subsystem's main sheet
      addSheet(subsystemMainSheet)
    }
    
    addBlock(newBlock)
    updateCurrentSheet({ blocks: [...blocks, newBlock] })
    console.log('Block added:', newBlock)
  }

  const handleBlockMove = (blockId: string, position: { x: number; y: number }) => {
    updateBlock(blockId, { position })
    saveCurrentSheetData()
  }

  const handleWireCreate = (sourcePort: PortInfo, targetPort: PortInfo) => {
    const newWire: WireData = {
      id: `wire_${Date.now()}`,
      sourceBlockId: sourcePort.blockId,
      sourcePortIndex: sourcePort.portIndex,
      targetBlockId: targetPort.blockId,
      targetPortIndex: targetPort.portIndex
    }
    
    addWire(newWire)
    updateCurrentSheet({ connections: [...wires, newWire] })
    console.log('Wire created:', newWire)
  }

  const handleWireDelete = (wireId: string) => {
    deleteWire(wireId)
    setSelectedWireId(null)
    saveCurrentSheetData()
    console.log('Wire deleted:', wireId)
  }

  const handleRunSimulation = async () => {
    if (blocks.length === 0) {
      alert('No blocks to simulate')
      return
    }

    setIsSimulating(true)
    try {
      saveCurrentSheetData()
      
      const config = {
        timeStep: model?.data?.globalSettings?.simulationTimeStep || 0.01,
        duration: model?.data?.globalSettings?.simulationDuration || 10.0
      }
      
      const engine = new SimulationEngine(blocks, wires, config, undefined, sheets)
      const results = engine.run()
      
      setSimulationResults(results)
      setSimulationEngine(engine)
      setOutputPortValues(engine.getOutputPortValues())
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

  const handleSave = async () => {
    const success = await saveModel()
    if (success) {
      console.log('Model saved successfully')
    }
    // Error messages are handled by the store
  }

  const handleBlockDoubleClick = (blockId: string) => {
    const block = blocks.find(b => b.id === blockId)
    if (!block) return
    
    if (block.type === 'subsystem') {
      const sheetId = block.parameters?.sheetId
      let hasInternalSheet = null
      
      if (sheetId) {
        hasInternalSheet = sheets.find(s => s.id === sheetId)
      }
      
      if (hasInternalSheet) {
        const choice = window.confirm(
          `Navigate to subsystem "${block.parameters?.sheetName || block.name}" internal sheet?\n\n` +
          'Click "OK" to navigate to the internal sheet, or "Cancel" to configure the subsystem block.'
        )
        if (choice) {
          switchToSheet(sheetId)
          return
        }
      } else {
        const choice = window.confirm(
          `Create internal sheet for subsystem "${block.name}"?\n\n` +
          'Click "OK" to create and navigate to a new internal sheet, or "Cancel" to configure the subsystem block.'
        )
        if (choice) {
          const newSheetId = `${block.id}_main`
          const newSheet: Sheet = {
            id: newSheetId,
            name: `${block.name} Main`,
            blocks: [],
            connections: [],
            extents: {
              width: 1000,
              height: 800
            }
          }
          
          addSheet(newSheet)
          updateBlock(blockId, { 
            parameters: { 
              ...block.parameters, 
              sheetId: newSheetId, 
              sheetName: newSheet.name 
            } 
          })
          saveCurrentSheetData()
          switchToSheet(newSheetId)
          return
        }
      }
    }
    
    if (block && (
      block.type === 'input_port' || 
      block.type === 'output_port' || 
      block.type === 'source' ||
      block.type === 'scale' ||
      block.type === 'transfer_function' ||
      block.type === 'subsystem' ||
      block.type === 'lookup_1d' ||
      block.type === 'lookup_2d'
    )) {
      setConfigBlock(block)
    }
  }

  const handleBlockConfigUpdate = (parameters: Record<string, any>) => {
    if (configBlock) {
      updateBlock(configBlock.id, { parameters })
      saveCurrentSheetData()
    }
  }

  const handleAddSheet = () => {
    saveCurrentSheetData()
    const newSheetId = `sheet_${Date.now()}`
    const newSheet: Sheet = {
      id: newSheetId,
      name: `Sheet ${sheets.length + 1}`,
      blocks: [],
      connections: [],
      extents: {
        width: 1000,
        height: 800
      }
    }
    
    addSheet(newSheet)
    switchToSheet(newSheetId)
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
                {error && (
                  <span className="ml-2 text-sm text-red-600 font-normal">
                    ({error})
                  </span>
                )}
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <button 
                className={`px-4 py-2 rounded-md font-medium border ${
                  saving
                    ? 'bg-gray-500 text-white cursor-not-allowed border-gray-400'
                    : 'bg-green-700 text-white hover:bg-green-800 border-green-600'
                }`}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button 
                className={`px-4 py-2 rounded-md text-white font-medium border ${
                  isSimulating 
                    ? 'bg-gray-500 cursor-not-allowed border-gray-400' 
                    : 'bg-blue-700 hover:bg-blue-800 border-blue-600'
                }`}
                onClick={handleRunSimulation}
                disabled={isSimulating}
              >
                {isSimulating ? 'Running...' : 'Run Simulation'}
              </button>
              <button 
                className="px-4 py-2 bg-purple-700 text-white rounded-md hover:bg-purple-800 border border-purple-600 font-medium"
                onClick={() => console.log('Code generation coming in later tasks')}
              >
                Generate Code
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex flex-col h-screen">
        {/* Sheet Tabs */}
        <SheetTabs
          sheets={sheets}
          activeSheetId={activeSheetId}
          onSheetChange={switchToSheet}
          onAddSheet={handleAddSheet}
          onRenameSheet={renameSheet}
          onDeleteSheet={deleteSheet}
        />

        {/* Canvas and Sidebar Container */}
        <div className="flex flex-1">
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
              onBlockSelect={setSelectedBlockId}
              onBlockDoubleClick={handleBlockDoubleClick}
              onWireCreate={handleWireCreate}
              onWireSelect={setSelectedWireId}
              onWireDelete={handleWireDelete}
            />
          </div>

          {/* Properties Panel */}
          <div className="w-80 bg-white shadow-sm border-l flex flex-col">
            <div className="p-4 border-b">
              <h2 className="text-lg font-medium text-gray-900">Properties</h2>
              <div className="text-sm text-gray-500 mt-1">
                Active Sheet: {sheets.find(s => s.id === activeSheetId)?.name || 'Unknown'}
              </div>
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

                  {/* Output Port Values */}
                  {outputPortValues && outputPortValues.size > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Output Port Values</h4>
                      {Array.from(outputPortValues.entries()).map(([portName, value]) => (
                        <div key={portName} className="bg-amber-50 p-3 rounded mb-2">
                          <div className="text-sm font-medium text-amber-800">{portName}</div>
                          <div className="text-lg font-mono text-amber-900">{value.toFixed(3)}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* CSV Export Button */}
                  {Array.from(simulationResults.signalData.entries()).some(([blockId]) => 
                    blocks.find(b => b.id === blockId && b.type === 'signal_logger')
                  ) && (
                    <div className="mt-4">
                      <button
                        onClick={handleExportCSV}
                        className="w-full px-4 py-2 bg-green-700 text-white text-sm rounded-md hover:bg-green-800 border border-green-600 font-medium"
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
      </div>

      {/* Configuration Modals */}
      {configBlock && (
        <>
          {(configBlock.type === 'input_port' || configBlock.type === 'output_port') && (
            <InputPortConfig
              block={configBlock}
              onUpdate={handleBlockConfigUpdate}
              onClose={() => setConfigBlock(null)}
            />
          )}
          {configBlock.type === 'source' && (
            <SourceConfig
              block={configBlock}
              onUpdate={handleBlockConfigUpdate}
              onClose={() => setConfigBlock(null)}
            />
          )}
          {configBlock.type === 'scale' && (
            <ScaleConfig
              block={configBlock}
              onUpdate={handleBlockConfigUpdate}
              onClose={() => setConfigBlock(null)}
            />
          )}
          {configBlock.type === 'transfer_function' && (
            <TransferFunctionConfig
              block={configBlock}
              onUpdate={handleBlockConfigUpdate}
              onClose={() => setConfigBlock(null)}
            />
          )}
          {configBlock.type === 'subsystem' && (
            <SubsystemConfig
              block={configBlock}
              availableSheets={sheets.filter(s => s.id !== activeSheetId)}
              onUpdate={handleBlockConfigUpdate}
              onClose={() => setConfigBlock(null)}
            />
          )}
          {configBlock.type === 'lookup_1d' && (
            <Lookup1DConfig
              block={configBlock}
              onUpdate={handleBlockConfigUpdate}
              onClose={() => setConfigBlock(null)}
            />
          )}
          {configBlock.type === 'lookup_2d' && (
            <Lookup2DConfig
              block={configBlock}
              onUpdate={handleBlockConfigUpdate}
              onClose={() => setConfigBlock(null)}
            />
          )}
        </>
      )}
    </div>
  )
}
// app/models/[id]/page.tsx
'use client'

import { useUser } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { BlockData, PortInfo } from '@/components/Block'
import { WireData } from '@/components/Wire'
import { MultiSheetSimulationEngine } from '@/lib/multiSheetSimulation'
import { validateMultiSheetTypeCompatibility } from '@/lib/multiSheetTypeValidator'
import CanvasReactFlow from '@/components/CanvasReactFlow'
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
import SheetLabelSinkConfig from '@/components/SheetLabelSinkConfig'
import SheetLabelSourceConfig from '@/components/SheetLabelSourceConfig'
import ModelValidationButton from '@/components/ModelValidationButton'
import { parseType } from '@/lib/typeValidator'
import { useModelStore } from '@/lib/modelStore'
import { useAutoSave } from '@/lib/useAutoSave'
import { use, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface ModelEditorPageProps {
  params: Promise<{
    id: string
  }>
}

export default function ModelEditorPage({ params }: ModelEditorPageProps) {
  const { user, loading } = useUser()
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Zustand store
  const {
 // State
  model, sheets, activeSheetId, blocks, wires,
  selectedBlockId, selectedWireId, configBlock,
  simulationResults, isSimulating, simulationEngine, outputPortValues,
  modelLoading, saving, error, currentVersion, isOlderVersion,
  globalSimulationResults, 
  
  // Actions
  setModel, setError, setModelLoading, saveModel,
  switchToSheet, addSheet, renameSheet, deleteSheet,
  addBlock, updateBlock, deleteBlock, addWire, deleteWire,
  setSelectedBlockId, setSelectedWireId, setConfigBlock,
  setSimulationResults, setIsSimulating, setSimulationEngine, setOutputPortValues,
  setGlobalSimulationResults, clearGlobalSimulationResults, 
  updateCurrentSheet, saveCurrentSheetData, initializeFromModel
  } = useModelStore()
  
  // Unwrap the params Promise
  const { id } = use(params)
  const requestedVersion = searchParams.get('version')

  // Enable auto-save only for latest version and when model is fully loaded
  useAutoSave(!isOlderVersion && !modelLoading && !!model)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (user && id) {
      fetchModel()
    }
  }, [user, id, requestedVersion])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input field
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || 
          target.tagName === 'TEXTAREA' || 
          target.isContentEditable) {
        return
      }

      // Handle delete/backspace for selected items
      if (e.key === 'Delete' || (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault()
        
        if (selectedBlockId) {
          handleBlockDelete(selectedBlockId)
        } else if (selectedWireId) {
          handleWireDelete(selectedWireId)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedBlockId, selectedWireId, blocks, wires])

  const fetchModel = async () => {
    try {
      // Fetch model metadata
      const { data: modelData, error: modelError } = await supabase
        .from('models')
        .select('*')
        .eq('id', id)
        .single()

      if (modelError) {
        if (modelError.code === 'PGRST116') {
          setError('Model not found')
        } else {
          throw modelError
        }
        return
      }

      // Determine which version to load
      const versionToLoad = requestedVersion 
        ? parseInt(requestedVersion) 
        : modelData.latest_version || 1

      // Fetch the specific version
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('*')
        .eq('model_id', id)
        .eq('version', versionToLoad)
        .single()

      if (versionError) {
        console.error('Error fetching version:', versionError)
        setError(`Version ${versionToLoad} not found`)
        return
      }

      initializeFromModel(modelData, versionData)
    } catch (error) {
      console.error('Error fetching model:', error)
      setError('Failed to load model')
    } finally {
      setModelLoading(false)
    }
  }

  const handleSave = async () => {
    const success = await saveModel()
    if (success && isOlderVersion) {
      // If we saved an older version as a new model, we should have navigated away
      // This is handled in the saveModel function
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
      case 'sheet_label_sink':
        return {
          signalName: ''  // Empty string, user must specify
        }
      case 'sheet_label_source':
        return {
          signalName: ''  // Will be populated from available sinks
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

  const handleBlockDelete = (blockId: string) => {
    // Find the block to get its name for confirmation
    const block = blocks.find(b => b.id === blockId)
    if (!block) return

    // Confirm deletion
    if (!window.confirm(`Delete block "${block.name}" and all its connections?`)) {
      return
    }

    // Use the store's deleteBlock action which handles both blocks and connected wires
    deleteBlock(blockId)
    
    // Clear selection if this block was selected
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null)
    }
    
    // Clear config if this block was being configured
    if (configBlock?.id === blockId) {
      setConfigBlock(null)
    }

    console.log('Block deleted:', block.name)
  }

  const handleWireCreate = (sourcePort: PortInfo, targetPort: PortInfo) => {
    // Get the source and target blocks
    const sourceBlock = blocks.find(b => b.id === sourcePort.blockId)
    const targetBlock = blocks.find(b => b.id === targetPort.blockId)
    
    if (!sourceBlock || !targetBlock) {
      console.error('Cannot create wire: source or target block not found')
      return
    }
    
    // Special validation for lookup blocks
    if (targetBlock.type === 'lookup_1d' || targetBlock.type === 'lookup_2d') {
      // Get the source block's output type
      const sourceType = sourceBlock.type === 'source' || sourceBlock.type === 'input_port' 
        ? sourceBlock.parameters?.dataType || 'double'
        : null // For other blocks, we'd need to run type propagation
      
      if (sourceType) {
        try {
          const parsed = parseType(sourceType)
          if (parsed.isArray) {
            // Show error message and prevent connection
            alert(`${targetBlock.name} requires scalar inputs but ${sourceBlock.name} outputs an array type: ${sourceType}`)
            return
          }
        } catch (error) {
          console.error('Error parsing source type:', error)
        }
      }
    }
    
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
    // Check if any sheet has blocks
    const totalBlocks = sheets.reduce((sum, sheet) => sum + sheet.blocks.length, 0)
    if (totalBlocks === 0) {
      alert('No blocks to simulate')
      return
    }

    // Save current sheet data first
    saveCurrentSheetData()

    // Validate ALL sheets together using multi-sheet validator
    const validationResult = validateMultiSheetTypeCompatibility(sheets.map(sheet => ({
      id: sheet.id,
      blocks: sheet.blocks,
      connections: sheet.connections
    })))

    const errors = validationResult.errors
    const warnings = validationResult.warnings

    // Block on errors
    if (errors.length > 0) {
      const errorMessages = errors.slice(0, 5).map(e => {
        const sheetName = sheets.find(s => s.id === e.sheetId)?.name || 'Unknown Sheet'
        return `• [${sheetName}] ${e.message}`
      }).join('\n')
      
      alert(
        `Cannot run simulation due to ${errors.length} type compatibility error${errors.length > 1 ? 's' : ''}:\n\n` +
        `${errorMessages}${errors.length > 5 ? `\n\n...and ${errors.length - 5} more errors` : ''}\n\n` +
        'Please fix these errors before running the simulation. Use the "Validate Model" button to see all issues.'
      )
      return
    }

    // Allow bypass for warnings
    if (warnings.length > 0) {
      const warningMessages = warnings.slice(0, 3).map(w => {
        const sheetName = sheets.find(s => s.id === w.sheetId)?.name || 'Unknown Sheet'
        return `• [${sheetName}] ${w.message}`
      }).join('\n')
      
      const proceed = window.confirm(
        `Found ${warnings.length} warning${warnings.length > 1 ? 's' : ''}:\n\n` +
        `${warningMessages}${warnings.length > 3 ? `\n\n...and ${warnings.length - 3} more warnings` : ''}\n\n` +
        'Continue with simulation anyway?'
      )
      if (!proceed) return
    }

    setIsSimulating(true)
    try {
      const config = {
        timeStep: 0.01,
        duration: 10.0
      }
      
      // Create multi-sheet simulation engine
      const multiEngine = new MultiSheetSimulationEngine(sheets, config)
      
      // Run simulation across ALL sheets - this returns results for all sheets
      const allResults = multiEngine.run()
      
      // Store ALL results globally
      setGlobalSimulationResults(allResults)
      
      // Also set the current sheet's engine for CSV export and other operations
      const currentSheetEngine = multiEngine.getSheetEngine(activeSheetId)
      if (currentSheetEngine) {
        setSimulationEngine(currentSheetEngine)
        setOutputPortValues(multiEngine.getOutputPortValues(activeSheetId) || new Map())
      }
      
      console.log('Simulation completed for all sheets:', {
        totalSheets: allResults.size,
        sheetsWithData: Array.from(allResults.keys())
      })
      
      // Log summary of results for debugging
      for (const [sheetId, results] of allResults) {
        const sheet = sheets.find(s => s.id === sheetId)
        console.log(`Sheet "${sheet?.name || sheetId}":`, {
          displays: results.signalData.size,
          timePoints: results.timePoints.length
        })
      }
      
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

  const handleGenerateCode = async () => {
    if (!model) {
      alert('No model loaded')
      return
    }

    try {
      // Save current work before generating code
      saveCurrentSheetData()

      const response = await fetch('/api/generate-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modelId: model.id,
          version: currentVersion
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Code generation failed')
      }

      // Download the generated ZIP file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${model.name}_v${currentVersion}_library.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      console.log('Code generation completed successfully')
    } catch (error) {
      console.error('Code generation error:', error)
      alert(`Code generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
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
      block.type === 'lookup_2d' ||
      block.type === 'sheet_label_sink' || 
      block.type === 'sheet_label_source'
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
                {isOlderVersion && (
                  <span className="ml-2 text-sm text-amber-600 font-normal">
                    (Version {currentVersion} of {model.latest_version})
                  </span>
                )}
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
                {saving ? 'Saving...' : (isOlderVersion ? 'Save as New Model' : 'Save')}
              </button>
              
              {/* Validation Button */}
              <ModelValidationButton
                blocks={blocks}
                wires={wires}
                onSelectBlock={setSelectedBlockId}
                onSelectWire={setSelectedWireId}
              />
              
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
                onClick={handleGenerateCode}
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
          <CanvasReactFlow
            blocks={blocks}
            wires={wires}
            selectedBlockId={selectedBlockId}
            selectedWireId={selectedWireId}
            onDrop={handleCanvasDrop}
            onBlockMove={handleBlockMove}
            onBlockSelect={setSelectedBlockId}
            onBlockDoubleClick={handleBlockDoubleClick}
            onBlockDelete={handleBlockDelete}
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
              {isOlderVersion && (
                <div className="text-sm text-amber-600 mt-1">
                  Viewing older version - changes will create new model
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {simulationResults ? (
                <div className="p-4">
                  <h3 className="font-medium mb-3">Simulation Results</h3>
                  <div className="text-sm text-gray-600 space-y-1 mb-4">
                    <div>Duration: {simulationResults.finalTime.toFixed(2)}s</div>
                    <div>Time Points: {simulationResults.timePoints.length}</div>
                    <div>Display Blocks: {simulationResults.signalData.size}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Sheet: {sheets.find(s => s.id === activeSheetId)?.name}
                    </div>
                  </div>
                  
                  {/* Display Signal Charts */}
                  {Array.from(simulationResults.signalData.entries()).map(([blockId, data]: [string, any[]]) => {
                    const block = blocks.find(b => b.id === blockId && b.type === 'signal_display')
                    if (!block) return null
                    
                    // Transform the data to match SignalDisplay's expected format
                    const signalData = simulationResults.timePoints.map((time: number, index: number) => ({
                      time,
                      value: data[index]
                    }))
                    
                    return (
                      <div key={blockId} className="mb-6">
                        <SignalDisplay
                          block={block}
                          signalData={signalData}
                          isRunning={false}
                        />
                      </div>
                    )
                  })}
                  
                  {/* Logger Block Data Summary */}
                  {Array.from(simulationResults.signalData.entries()).map(([blockId, data]: [string, any[]]) => {
                    const block = blocks.find(b => b.id === blockId && b.type === 'signal_logger')
                    if (!block) return null
                    
                    // Get the last value for display
                    const lastValue = data[data.length - 1]
                    const displayValue = (() => {
                      if (typeof lastValue === 'number') {
                        return lastValue.toFixed(3)
                      } else if (typeof lastValue === 'boolean') {
                        return lastValue.toString()
                      } else if (Array.isArray(lastValue)) {
                        return `[${lastValue.map((v: any) => 
                          typeof v === 'number' ? v.toFixed(3) : v
                        ).join(', ')}]`
                      }
                      return 'N/A'
                    })()
                    
                    // Calculate min/max only for numeric data
                    const numericData = data.filter((d: any) => typeof d === 'number') as number[]
                    const minValue = numericData.length > 0 ? Math.min(...numericData).toFixed(3) : 'N/A'
                    const maxValue = numericData.length > 0 ? Math.max(...numericData).toFixed(3) : 'N/A'
                    
                    return (
                      <div key={blockId} className="mb-4">
                        <div className="bg-gray-50 p-3 rounded">
                          <h4 className="font-medium text-sm mb-2">{block.name} (Logger)</h4>
                          <div className="text-xs text-gray-600 space-y-1">
                            <div>Final value: {displayValue}</div>
                            <div>Samples: {data.length}</div>
                            <div>Min: {minValue}</div>
                            <div>Max: {maxValue}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* Output Port Values */}
                  {outputPortValues && outputPortValues.size > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Output Port Values</h4>
                      {Array.from(outputPortValues.entries()).map(([portName, value]) => {
                        const displayValue = (() => {
                          if (typeof value === 'number') {
                            return value.toFixed(3)
                          } else if (typeof value === 'boolean') {
                            return value.toString()
                          } else if (Array.isArray(value)) {
                            return `[${value.map((v: any) => 
                              typeof v === 'number' ? v.toFixed(3) : v
                            ).join(', ')}]`
                          }
                          return 'N/A'
                        })()
                        
                        return (
                          <div key={portName} className="bg-amber-50 p-3 rounded mb-2">
                            <div className="text-sm font-medium text-amber-800">{portName}</div>
                            <div className="text-lg font-mono text-amber-900">{displayValue}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* CSV Export Button */}
                  {Array.from(simulationResults.signalData.entries()).some(([blockId]: [string, any]) => 
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
                  
                  {/* Show note if other sheets have results */}
                  {globalSimulationResults && globalSimulationResults.size > 1 && (
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-700">
                        Simulation data available for {globalSimulationResults.size} sheets. 
                        Switch sheets to view their results.
                      </p>
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
          {configBlock.type === 'sheet_label_sink' && (
            <SheetLabelSinkConfig
              block={configBlock}
              blocks={blocks}  // Current sheet blocks
              allSheetsBlocks={sheets.flatMap(sheet => sheet.blocks)}  // All top-level sheet blocks
              onUpdate={handleBlockConfigUpdate}
              onClose={() => setConfigBlock(null)}
            />
          )}

          {configBlock.type === 'sheet_label_source' && (
            <SheetLabelSourceConfig
              block={configBlock}
              blocks={blocks}  // Current sheet blocks  
              allSheetsBlocks={sheets.flatMap(sheet => sheet.blocks)}  // All top-level sheet blocks
              onUpdate={handleBlockConfigUpdate}
              onClose={() => setConfigBlock(null)}
            />
          )}
        </>
      )}
    </div>
  )
}
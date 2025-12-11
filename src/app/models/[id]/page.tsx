// app/models/[id]/page.tsx
'use client'

import { useUser } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { BlockData, PortInfo } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { MultiSheetSimulationEngine } from '@/lib/multiSheetSimulation'
import { validateMultiSheetTypeCompatibility } from '@/lib/multiSheetTypeValidator'
import { createSimulationEngine, getWasmPreference, createWorkerSimulation, isWorkerSimulationAvailable, type SimulationProgress } from '@/lib/simulation/SimulationEngineFactory'
import { WasmSimulationEngine } from '@/lib/simulation/WasmSimulationEngine'
import type { SimulationWorkerManager } from '@/lib/simulation/SimulationWorkerManager'
import { convertWasmToUIFormat, WasmDataCollector } from '@/lib/simulation/WasmResultConverter'
import SaveAsDialog from '@/components/SaveAsDialog'
import AutoSaveRecoveryDialog from '@/components/AutoSaveRecoveryDialog'
import AutoSaveStatusIndicator from '@/components/AutoSaveStatusIndicator'
import ModelParametersDialog from '@/components/ModelParametersDialog'
import CanvasReactFlow from '@/components/CanvasReactFlow'
import BlockLibrarySidebar from '@/components/BlockLibrarySidebar'
import SimulationSettingsPanel, { validateSimulationSettings } from '@/components/SimulationSettingsPanel'
import SignalDisplay from '@/components/SignalDisplay'
import SheetTabs, { Sheet } from '@/components/SheetTabs'
import CompilationProgress from '@/components/CompilationProgress'
import WasmErrorDisplay from '@/components/WasmErrorDisplay'
import InputPortConfig from '@/components/InputPortConfig'
import SourceConfig from '@/components/SourceConfig'
import ScaleConfig from '@/components/ScaleConfig'
import SubsystemConfig from '@/components/SubsystemConfig'
import TransferFunctionConfig from '@/components/TransferFunctionConfig'
import TrigConfig from '@/components/TrigConfig'
import Lookup1DConfig from '@/components/Lookup1DConfig'
import Lookup2DConfig from '@/components/Lookup2DConfig'
import MuxConfig from '@/components/MuxConfig'
import SheetLabelSinkConfig from '@/components/SheetLabelSinkConfig'
import SheetLabelSourceConfig from '@/components/SheetLabelSourceConfig'
import SumConfig from '@/components/SumConfig'
import ConditionConfig from '@/components/ConditionConfig'
import EvaluateConfig from '@/components/EvaluateConfig'
import LimitConfig from '@/components/LimitConfig'
import IntegratorConfig from '@/components/IntegratorConfig'
import OrientationConversionConfig from '@/components/OrientationConversionConfig'

import ModelValidationButton from '@/components/ModelValidationButton'
import SheetBreadcrumbs from '@/components/SheetBreadcrumbs'
import { getSheetPath } from '@/lib/navigationUtils'
import { parseType } from '@/lib/typeValidator'
import { propagateSignalTypes } from '@/lib/signalTypePropagation'
import { migrateToHierarchicalSheets } from '@/lib/modelStore'
import { useModelStore } from '@/lib/modelStore'

import { useAutoSave } from '@/lib/useAutoSave'
import { use, useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

import {
  AppShell,
  Container,
  Group,
  Button,
  Title,
  Text,
  Loader,
  Center,
  Stack,
  Box,
  Paper,
  ScrollArea,
  Divider,
  Badge,
  Alert,
  Flex,
  ActionIcon,
  Tooltip,
  Space,
  Card,
  Anchor
} from '@mantine/core'
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconPlayerPlay,
  IconPlayerStop,
  IconCode,
  IconFileExport,
  IconAlertCircle,
  IconCircleCheck,
  IconAlertTriangle,
  IconDownload,
  IconClock,
  IconCheck,
  IconSettings
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'

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
    model, sheets, activeSheetId, blocks, wires, parameters,
    selectedBlockId, selectedBlockIds, selectedWireId, selectedWireIds, configBlock,
    simulationResults, currentSheetSimulationResults, isSimulating, simulationEngine, outputPortValues,
    modelLoading, saving, error, currentVersion, isOlderVersion,
    globalSimulationResults,

    // Actions
    setModel, setError, setModelLoading, saveModel,
    switchToSheet, addSheet, renameSheet, deleteSheet,
    addBlock, updateBlock, updateBlocks, deleteBlock, addWire, deleteWire, renameBlock,
    setSelectedBlockId, setSelectedBlocks, setSelectedWireId, setConfigBlock, clearSelection,
    // Feature 5: Clipboard actions
    copySelection, cutSelection, pasteFromClipboard, checkClipboardDependencies,
    setSimulationResults, setIsSimulating, setSimulationEngine, setOutputPortValues,
    setGlobalSimulationResults, clearGlobalSimulationResults,
    updateCurrentSheet, saveCurrentSheetData, initializeFromModel, saveAsNewModel,

    // Auto-save specific
    isDirty, saveAutoSave, deleteAutoSave, enableAutoSave, setIsDirty, markAsClean,

    // New actions needed for auto-save recovery
    setSheets, setActiveSheetId, setBlocks, setWires,
    setCurrentVersion, setIsOlderVersion,

  } = useModelStore()

  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false)
  const [showParametersDialog, setShowParametersDialog] = useState(false)
  const [simulationSettings, setSimulationSettings] = useState<{
    duration: string
    timeStep: string
    integrationAlgorithm: 'euler' | 'rk4'
  }>({
    duration: '10.0',
    timeStep: '0.01',
    integrationAlgorithm: 'rk4'
  })

  // WASM compilation state
  const [isCompiling, setIsCompiling] = useState(false)
  const [compilationTime, setCompilationTime] = useState<number | null>(null)
  const [compilationError, setCompilationError] = useState<string | null>(null)
  const [compilationErrorDetails, setCompilationErrorDetails] = useState<string | null>(null)
  const [compiledWasmData, setCompiledWasmData] = useState<{
    wasmData: string
    jsData: string
    metadata: any
  } | null>(null)

  // Simulation progress state (for worker-based simulation)
  const [simulationProgress, setSimulationProgress] = useState<SimulationProgress | null>(null)
  const [workerManager, setWorkerManager] = useState<SimulationWorkerManager | null>(null)
  const [useWorker, setUseWorker] = useState<boolean>(false) // Temporarily disabled - worker needs Next.js config
  const [forceRecompile, setForceRecompile] = useState<boolean>(false)

  const [showAutoSaveDialog, setShowAutoSaveDialog] = useState(false)
  const [autoSaveInfo, setAutoSaveInfo] = useState<{
    autoSaveDate: string
    lastSavedVersion: number
    lastSavedDate: string
  } | null>(null)

  
  // Unwrap the params Promise
  const { id } = use(params)
  const requestedVersion = searchParams.get('version')

  // Enable auto-save only for latest version and when model is fully loaded
  useAutoSave(!isOlderVersion && !modelLoading && !!model)

  // Detect and enable Web Worker support if available
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const workersAvailable = isWorkerSimulationAvailable()
      console.log('[Worker Detection]', workersAvailable ? 'Web Workers available' : 'Web Workers not available')

      // Enable workers if available (opt-in for now due to Next.js config requirements)
      // Users can enable via browser settings or future UI toggle
      const userPreference = localStorage.getItem('obliq-use-workers')
      if (userPreference === 'true' && workersAvailable) {
        setUseWorker(true)
        console.log('[Worker Detection] Enabling worker-based simulation (user preference)')
      }
    }
  }, [])

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

  // Pre-warming: Compile WASM in background when model loads (for faster first simulation)
  // Don't pre-warm if model is dirty - the user will trigger compilation via "Run Simulation"
  // Note: With "always recompile" approach, pre-warming is less critical but still provides a warm cache
  useEffect(() => {
    if (model && getWasmPreference() && !compiledWasmData && !isCompiling && !isDirty) {
      // Start background compilation
      console.log('[Pre-warming] Starting background WASM compilation for model:', model.id, model.name)
      setIsCompiling(true)
    }
  }, [model, compiledWasmData, isDirty]) // Don't include isCompiling to avoid re-triggering when it changes

  // Invalidate compiled WASM when model becomes dirty (user made edits)
  // Don't trigger wasteful pre-warming - just clear the cached WASM
  useEffect(() => {
    if (isDirty && compiledWasmData) {
      console.log('[WASM] Model edited - invalidating compiled WASM (will recompile on Run Simulation)')
      setCompiledWasmData(null)
    }
  }, [isDirty]) // Only trigger on isDirty changes, not compiledWasmData

  const fetchModel = async () => {
    try {
      setModelLoading(true)
      
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
        setModelLoading(false)
        return
      }

      // Store the model data in state first
      setModel(modelData)

      // Determine which version to load
      const versionToLoad = requestedVersion 
        ? parseInt(requestedVersion) 
        : modelData.latest_version || 1

      // Check for auto-save (version 0) only if we're loading the latest version
      // and no specific version was requested
      if (!requestedVersion && versionToLoad === (modelData.latest_version || 1)) {
        const { data: autoSaveData, error: autoSaveError } = await supabase
          .from('model_versions')
          .select('*')
          .eq('model_id', id)
          .eq('version', 0)
          .maybeSingle()

        if (autoSaveData && !autoSaveError) {
          // Get the last saved version info for comparison
          const { data: lastSavedVersion, error: lastSavedError } = await supabase
            .from('model_versions')
            .select('*')
            .eq('model_id', id)
            .eq('version', versionToLoad)
            .single()

          if (!lastSavedError && lastSavedVersion) {
            // Show auto-save recovery dialog
            setAutoSaveInfo({
              autoSaveDate: autoSaveData.created_at,
              lastSavedVersion: versionToLoad,
              lastSavedDate: lastSavedVersion.created_at
            })
            setShowAutoSaveDialog(true)
            setModelLoading(false)
            return // Don't load any version yet - wait for user choice
          }
        }
      }

      // No auto-save dialog needed, proceed to load the requested version
      await loadModelVersion(modelData, versionToLoad)
      
    } catch (error) {
      console.error('Error fetching model:', error)
      setError('Failed to load model')
      setModelLoading(false)
    }
  }

  // Helper function to load a specific version
  const loadModelVersion = async (modelData: any, versionToLoad: number) => {
    try {
      // Fetch the specific version
      const { data: versionData, error: versionError } = await supabase
        .from('model_versions')
        .select('*')
        .eq('model_id', modelData.id)
        .eq('version', versionToLoad)
        .single()

      if (versionError) {
        console.error('Error fetching version:', versionError)
        setError(`Version ${versionToLoad} not found`)
        setModelLoading(false)
        return
      }

      // Initialize the model with the version data
      initializeFromModel(modelData, versionData)
      
      // Load simulation settings if present
      if (versionData.data?.globalSettings) {
        setSimulationSettings({
          duration: versionData.data.globalSettings.simulationDuration?.toString() || '10.0',
          timeStep: versionData.data.globalSettings.simulationTimeStep?.toString() || '0.01',
          integrationAlgorithm: versionData.data.globalSettings.integrationAlgorithm || 'rk4'
        })
      }
      
      // Enable auto-save for this session
      enableAutoSave()
      
    } catch (error) {
      console.error('Error loading model version:', error)
      setError('Failed to load model version')
    } finally {
      setModelLoading(false)
    }
  }

  const handleRecoverAutoSave = async () => {
    if (!model || !autoSaveInfo) return

    try {
      // Fetch the auto-save version
      const { data: autoSaveData, error } = await supabase
        .from('model_versions')
        .select('*')
        .eq('model_id', id)
        .eq('version', 0)
        .single()

      if (error) throw error

      // Key difference: We're recovering auto-save but treating it as the current version
      // This is fundamentally different from opening an older version
      
      // Manually set up the state instead of using initializeFromModel
      // which would set isOlderVersion based on version comparison
      if (autoSaveData?.data?.sheets) {
        const hierarchicalData = migrateToHierarchicalSheets(autoSaveData.data)
        const sheets = hierarchicalData.sheets
        
        if (sheets.length === 0) {
          throw new Error('Invalid auto-save: No sheets found')
        }
        
        // Load the auto-save data but maintain the latest version number
        setSheets(sheets)
        setActiveSheetId(sheets[0].id)
        setBlocks(sheets[0]?.blocks || [])
        setWires(sheets[0]?.connections || [])
        
        // Critical: Set version tracking to indicate we're on the latest version
        setCurrentVersion(model.latest_version || 1)
        setIsOlderVersion(false)
        
        // Reset selection state
        setSelectedBlockId(null)
        setSelectedWireId(null)
        
        // Load simulation settings if present
        if (autoSaveData.data?.globalSettings) {
          setSimulationSettings({
            duration: autoSaveData.data.globalSettings.simulationDuration?.toString() || '10.0',
            timeStep: autoSaveData.data.globalSettings.simulationTimeStep?.toString() || '0.01',
            integrationAlgorithm: autoSaveData.data.globalSettings.integrationAlgorithm || 'rk4'
          })
        }
      }

      setShowAutoSaveDialog(false)
      setAutoSaveInfo(null)
      setModelLoading(false)
      
      // Delete the auto-save from database since we've recovered it
      try {
        await deleteAutoSave()
        console.log('Auto-save removed from database after recovery')
      } catch (error) {
        console.error('Warning: Failed to delete auto-save after recovery:', error)
        // Continue anyway - the auto-save will be overwritten on next save
      }
      
      // Enable auto-save for this session
      enableAutoSave()
      
      // Mark the model as clean since we just loaded it
      markAsClean()
      
      // Show notification
      notifications.show({
        title: 'Auto-save recovered',
        message: 'Your unsaved work has been restored',
        color: 'green',
        icon: <IconCircleCheck size={20} />
      })
      
    } catch (error) {
      console.error('Error recovering auto-save:', error)
      notifications.show({
        title: 'Recovery failed',
        message: 'Failed to recover auto-save. Opening last saved version instead.',
        color: 'red',
        icon: <IconAlertCircle size={20} />
      })
      handleDiscardAutoSave()
    }
  }

  const handleDiscardAutoSave = async () => {
    if (!model || !autoSaveInfo) return

    try {
      // Delete the auto-save
      await deleteAutoSave()
      
      // Load the last saved version
      await loadModelVersion(model, autoSaveInfo.lastSavedVersion)
      
      setShowAutoSaveDialog(false)
      setAutoSaveInfo(null)
      
      // Enable auto-save for this session
      enableAutoSave()
    } catch (error) {
      console.error('Error discarding auto-save:', error)
      notifications.show({
        title: 'Error',
        message: 'Error occurred while loading the saved version.',
        color: 'red',
        icon: <IconAlertCircle size={20} />
      })
    }
  }

  const validateAndGetSimulationSettings = (): { 
    isValid: boolean; 
    duration: number; 
    timeStep: number; 
    errors: string[] 
  } => {
    const validation = validateSimulationSettings(simulationSettings.duration, simulationSettings.timeStep)
    
    if (!validation.isValid) {
      notifications.show({
        title: 'Invalid simulation settings',
        message: validation.errors.join('\n'),
        color: 'red',
        icon: <IconAlertCircle size={20} />
      })
      return { isValid: false, duration: 0, timeStep: 0, errors: validation.errors }
    }
    
    return {
      isValid: true,
      duration: parseFloat(simulationSettings.duration),
      timeStep: parseFloat(simulationSettings.timeStep),
      errors: []
    }
  }

  const handleSave = async () => {
    const settingsValidation = validateAndGetSimulationSettings()
    if (!settingsValidation.isValid) {
      return
    }
    
    const globalSettings = {
      simulationTimeStep: settingsValidation.timeStep,
      simulationDuration: settingsValidation.duration,
      integrationAlgorithm: simulationSettings.integrationAlgorithm
    }

    const success = await saveModel(globalSettings)
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
      case 'limit':
        return { lowerLimit: -1, upperLimit: 1 }
      case 'integrator':
        return {
          initialValue: 0,
          showEnableInput: false,
          showResetInput: false,
          useLimits: false,
          lowerLimit: -Infinity,
          upperLimit: Infinity
        }
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
      case 'mux':
        return {
          rows: 2,
          cols: 2,
          outputType: 'double[2][2]',
          baseType: 'double'
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
      case 'sum':
        return {
          signs: '++',
          numInputs: 2, // Default to 2 inputs
          inputs: ['Input1', 'Input2'] // Legacy support
        }
      case 'trig':
        return {
          function: 'sin', // Default to sine function
          inputPortName: 'Input1',
          outputPortName: 'Output1'
        }
      case 'if':
        return {
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
      
      // Create default input and output ports for the subsystem's main sheet
      const defaultInputPort: BlockData = {
        id: `${subsystemMainSheetId}_input1`,
        type: 'input_port',
        name: 'Input1',
        position: { x: 100, y: 200 },
        parameters: {
          portName: 'Input1',
          dataType: 'double',
          defaultValue: 0
        }
      }
      
      const defaultOutputPort: BlockData = {
        id: `${subsystemMainSheetId}_output1`,
        type: 'output_port',
        name: 'Output1',
        position: { x: 400, y: 200 },
        parameters: {
          portName: 'Output1'
        }
      }
      
      const subsystemMainSheet: Sheet = {
        id: subsystemMainSheetId,
        name: `${newBlock.name} Main`,
        blocks: [defaultInputPort, defaultOutputPort],
        connections: [],
        extents: {
          width: 1000,
          height: 800
        }
      }
      
      // Update the subsystem parameters to embed the sheet
      newBlock.parameters = {
        ...newBlock.parameters,
        sheets: [subsystemMainSheet], // Embed sheet in parameters
        inputPorts: ['Input1'],
        outputPorts: ['Output1']
        // Remove sheetId and sheetName - no longer needed
      }
      
      // Don't add sheet to root level - it's embedded in the subsystem
      // Remove: addSheet(subsystemMainSheet)
    }
    
    addBlock(newBlock)
    updateCurrentSheet({ blocks: [...blocks, newBlock] })
    console.log('Block added:', newBlock)
  }

  const handleBlockMove = (blockId: string, position: { x: number; y: number }) => {
    updateBlock(blockId, { position })
    saveCurrentSheetData()
    // Position changes should also mark as dirty
    setIsDirty(true)
  }

  // Feature 4: Handle multi-block move when dragging a selection
  const handleBlocksMove = (moves: Array<{ id: string; position: { x: number; y: number } }>) => {
    console.log('[handleBlocksMove] moves:', moves)
    console.log('[handleBlocksMove] blocks before:', blocks.map(b => ({ id: b.id, pos: b.position })))

    // Use batch update to update all positions in a single state update
    const updates = moves.map(({ id, position }) => ({ id, updates: { position } }))
    updateBlocks(updates)

    // Check what the store has after update
    const storeBlocks = useModelStore.getState().blocks
    console.log('[handleBlocksMove] store blocks after updateBlocks:', storeBlocks.map(b => ({ id: b.id, pos: b.position })))

    saveCurrentSheetData()

    // Check sheets after save
    const sheets = useModelStore.getState().sheets
    const activeSheet = sheets.find(s => s.id === useModelStore.getState().activeSheetId)
    console.log('[handleBlocksMove] active sheet blocks after save:', activeSheet?.blocks.map(b => ({ id: b.id, pos: b.position })))
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
            notifications.show({
              title: 'Invalid connection',
              message: `${targetBlock.name} requires scalar inputs but ${sourceBlock.name} outputs an array type: ${sourceType}`,
              color: 'red',
              icon: <IconAlertCircle size={20} />
            })
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
    const updatedWires = [...wires, newWire]
    updateCurrentSheet({ connections: updatedWires })
    console.log('Wire created:', newWire)

    // Update Demux block parameters when a wire connects to its input
    if (targetBlock.type === 'demux' && targetPort.portIndex === 0) {
      // Run type propagation to get the source type
      const propagationResult = propagateSignalTypes(blocks, updatedWires)
      const sourceKey = `${sourcePort.blockId}:${sourcePort.portIndex}`
      const sourceType = propagationResult.blockOutputTypes.get(sourceKey)

      if (sourceType) {
        try {
          const parsed = parseType(sourceType)
          let outputCount = 1
          let inputDimensions: number[] = [1]

          if (parsed.isMatrix && parsed.rows && parsed.cols) {
            // Matrix input: rows × cols outputs
            outputCount = parsed.rows * parsed.cols
            inputDimensions = [parsed.rows, parsed.cols]
          } else if (parsed.isArray && parsed.arraySize) {
            // Vector input: arraySize outputs
            outputCount = parsed.arraySize
            inputDimensions = [parsed.arraySize]
          }

          // Update the Demux block parameters
          if (outputCount > 1) {
            updateBlock(targetBlock.id, {
              parameters: {
                ...targetBlock.parameters,
                outputCount,
                inputDimensions
              }
            })
            console.log(`Updated Demux ${targetBlock.name}: outputCount=${outputCount}, inputDimensions=${JSON.stringify(inputDimensions)}`)
          }
        } catch (error) {
          console.error('Error parsing source type for Demux:', error)
        }
      }
    }
  }

  const handleWireDelete = (wireId: string) => {
    console.log('=== handleWireDelete called ===')
    console.log('Deleting wire:', wireId)
    console.log('Wires before delete:', wires.map(w => ({ id: w.id, source: w.sourceBlockId, target: w.targetBlockId })))

    // Check if the wire being deleted is connected to a Demux input
    const wireToDelete = wires.find(w => w.id === wireId)
    if (wireToDelete) {
      const targetBlock = blocks.find(b => b.id === wireToDelete.targetBlockId)
      if (targetBlock?.type === 'demux' && wireToDelete.targetPortIndex === 0) {
        // Reset Demux parameters to default
        updateBlock(targetBlock.id, {
          parameters: {
            ...targetBlock.parameters,
            outputCount: 1,
            inputDimensions: [1]
          }
        })
        console.log(`Reset Demux ${targetBlock.name} to single output`)
      }
    }

    deleteWire(wireId)
    setSelectedWireId(null)
    saveCurrentSheetData()
  }

  const handleSaveAs = async (newName: string) => {
    const settingsValidation = validateAndGetSimulationSettings()
    if (!settingsValidation.isValid) {
      return
    }
    
    const globalSettings = {
      simulationTimeStep: settingsValidation.timeStep,
      simulationDuration: settingsValidation.duration
    }

    const success = await saveAsNewModel(newName, globalSettings)
    if (success) {
      setShowSaveAsDialog(false)
      // Navigation is handled in the store
    }
  }

  const handleExportModel = () => {
    if (!model) {
      notifications.show({
        title: 'Export failed',
        message: 'No model to export',
        color: 'red',
        icon: <IconAlertCircle size={20} />
      })
      return
    }
    
    // Save current sheet data first
    saveCurrentSheetData()
    
    // Create the model data structure
    const exportData = {
      name: model.name,
      version: currentVersion,
      created: model.created_at,
      updated: model.updated_at,
      data: {
        version: '2.1', // Current schema version with parameter support
        metadata: {
          created: new Date().toISOString(),
          description: `Exported from obliq-2 on ${new Date().toLocaleDateString()}`
        },
        sheets,
        parameters, // Feature 3: Include model parameters
        globalSettings: {
          simulationTimeStep: 0.01,
          simulationDuration: 10
        }
      }
    }
    
    // Pretty print the JSON
    const jsonString = JSON.stringify(exportData, null, 2)
    
    // Create blob and download
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${model.name}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const handleRunSimulation = async () => {
    console.log('[handleRunSimulation] Starting. isDirty:', isDirty, 'compiledWasmData:', !!compiledWasmData, 'isCompiling:', isCompiling)

    const settingsValidation = validateAndGetSimulationSettings()
    if (!settingsValidation.isValid) {
      return
    }

    // Check if any sheet has blocks
    const totalBlocks = sheets.reduce((sum, sheet) => sum + sheet.blocks.length, 0)
    if (totalBlocks === 0) {
      notifications.show({
        title: 'Simulation failed',
        message: 'No blocks to simulate',
        color: 'red',
        icon: <IconAlertCircle size={20} />
      })
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

      notifications.show({
        title: `Cannot run simulation due to ${errors.length} type compatibility error${errors.length > 1 ? 's' : ''}`,
        message: (
          <div>
            {errorMessages}
            {errors.length > 5 && <div>...and {errors.length - 5} more errors</div>}
            <div style={{ marginTop: 8 }}>Please fix these errors before running the simulation. Use the "Validate Model" button to see all issues.</div>
          </div>
        ),
        color: 'red',
        icon: <IconAlertCircle size={20} />,
        autoClose: false
      })
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
    setCompilationError(null)

    const useWasm = getWasmPreference()

    try {
      const config = {
        timeStep: settingsValidation.timeStep,
        duration: settingsValidation.duration
      }

      let allResults: Map<string, any>
      let multiEngine: MultiSheetSimulationEngine | null = null

      if (useWasm && model) {
        // WASM execution path - always recompile before running

        // If model has unsaved changes, auto-save first
        if (isDirty) {
          console.log('[Run Simulation] Model is dirty, auto-saving before compilation')
          notifications.show({
            title: 'Saving changes...',
            message: 'Auto-saving model before compilation',
            color: 'blue',
            icon: <IconAlertCircle size={20} />,
            autoClose: 2000
          })

          const autoSaveSuccess = await saveAutoSave()
          if (!autoSaveSuccess) {
            notifications.show({
              title: 'Auto-save failed',
              message: 'Could not save changes before compilation',
              color: 'red',
              icon: <IconAlertCircle size={20} />,
              autoClose: 5000
            })
            setIsSimulating(false)
            return
          }
          console.log('[Run Simulation] Auto-save complete')
        }

        // Always compile before running - fetch fresh compilation
        console.log('[Run Simulation] Starting inline compilation')
        notifications.show({
          title: 'Compiling...',
          message: 'Compiling model to WebAssembly',
          color: 'blue',
          icon: <IconAlertCircle size={20} />,
          autoClose: 3000
        })

        try {
          // Use version 0 (auto-save) if we just saved, otherwise latest version
          const versionToCompile = isDirty ? 0 : undefined
          const response = await fetch('/api/compile-wasm-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              modelId: model.id,
              version: versionToCompile,
              optimizationLevel: 'O2',
              noCache: forceRecompile
            })
          })

          if (!response.ok) {
            throw new Error(`Compilation failed: ${response.status}`)
          }

          // Read the SSE stream to get the result
          const reader = response.body?.getReader()
          const decoder = new TextDecoder()
          let wasmResult: { wasmData: string; jsData: string; metadata: any } | null = null
          let compilationError: string | null = null

          if (reader) {
            let buffer = ''
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.substring(6))
                    if (data.wasmData && data.jsData) {
                      wasmResult = data
                    } else if (data.error) {
                      compilationError = data.error
                    }
                  } catch (e) {
                    // Ignore parse errors for progress events
                  }
                }
              }
            }
          }

          if (compilationError) {
            throw new Error(compilationError)
          }

          if (!wasmResult) {
            throw new Error('No compilation result received')
          }

          console.log('[Run Simulation] Compilation complete:', wasmResult.metadata)
          setCompiledWasmData(wasmResult)
          setCompilationTime(wasmResult.metadata.compilationTime || wasmResult.metadata.retrievalTime || 0)

          notifications.show({
            title: 'Compiled!',
            message: wasmResult.metadata.cacheHit
              ? `Loaded from cache (${wasmResult.metadata.retrievalTime || 0}ms)`
              : `Compiled in ${wasmResult.metadata.compilationTime || 0}ms`,
            color: 'green',
            icon: <IconCheck size={20} />,
            autoClose: 2000
          })

          // Use the fresh compilation result for simulation
          var compiledWasmToUse = wasmResult

        } catch (error) {
          console.error('[Run Simulation] Compilation failed:', error)
          notifications.show({
            title: 'Compilation Failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            color: 'red',
            icon: <IconAlertCircle size={20} />,
            autoClose: 5000
          })
          setIsSimulating(false)
          return
        }

        // Try worker-based simulation first (non-blocking)
        const useWorkerSim = useWorker && isWorkerSimulationAvailable()

        if (useWorkerSim) {
          // Worker-based simulation (recommended)
          let worker: SimulationWorkerManager | null = null

          try {
            worker = createWorkerSimulation()
            if (!worker) {
              throw new Error('Failed to create simulation worker')
            }

            setWorkerManager(worker)

            // Initialize worker with WASM module
            await worker.initialize(
              compiledWasmToUse.wasmData,
              compiledWasmToUse.jsData,
              compiledWasmToUse.metadata
            )

            // Run with progress updates
            setSimulationProgress({ step: 0, totalSteps: 0, progress: 0, time: 0 })

            const result = await worker.run(
              { timeStep: config.timeStep, duration: config.duration },
              (progress) => setSimulationProgress(progress)
            )

            if (result.wasStopped) {
              console.log('Simulation was stopped by user')
              notifications.show({
                title: 'Simulation stopped',
                message: 'Simulation was cancelled',
                color: 'yellow',
                icon: <IconAlertCircle size={20} />,
                autoClose: 3000
              })
              return
            }

            // Retrieve results
            const sampleData = await worker.getResults()

            // Convert to UI format
            allResults = convertWasmToUIFormat(
              sampleData,
              sheets,
              config.timeStep,
              config.duration
            )

            // Cleanup
            await worker.cleanup()
            worker.terminate()
            setWorkerManager(null)
            setSimulationProgress(null)

            console.log('Worker WASM simulation completed:', {
              totalSheets: allResults.size,
              sheetsWithData: Array.from(allResults.keys()),
              collectorCount: sampleData.size,
              samplesPerCollector: Array.from(sampleData.values()).map(arr => arr.length)
            })

          } catch (error) {
            console.error('Worker simulation error:', error)
            if (worker) {
              worker.terminate()
              setWorkerManager(null)
            }
            setSimulationProgress(null)

            // Fall back to main thread WASM execution
            notifications.show({
              title: 'Worker simulation failed',
              message: 'Falling back to main thread execution',
              color: 'orange',
              icon: <IconAlertCircle size={20} />,
              autoClose: 5000
            })

            // Execute on main thread
            const wasmEngine = new WasmSimulationEngine(model.id)
            try {
              await wasmEngine.loadCompiledModule(
                compiledWasmToUse.wasmData,
                compiledWasmToUse.jsData,
                compiledWasmToUse.metadata
              )
              await wasmEngine.initialize(config.timeStep)
              const numSteps = Math.floor(config.duration / config.timeStep)
              for (let i = 0; i < numSteps; i++) {
                wasmEngine.step()
              }
              const sampleData = wasmEngine.getSampleData()
              allResults = convertWasmToUIFormat(sampleData, sheets, config.timeStep, config.duration)
              wasmEngine.cleanup()
              wasmEngine.destroy()
            } catch (mainThreadError) {
              console.error('Main thread WASM error:', mainThreadError)
              wasmEngine.destroy()
              multiEngine = new MultiSheetSimulationEngine(sheets, config, parameters)
              allResults = multiEngine.run()
            }
          }

        } else {
          // Main thread WASM execution (fallback)
          const wasmEngine = new WasmSimulationEngine(model.id)

          try {
            // Load compiled WASM module
            await wasmEngine.loadCompiledModule(
              compiledWasmToUse.wasmData,
              compiledWasmToUse.jsData,
              compiledWasmToUse.metadata
            )

            await wasmEngine.initialize(config.timeStep)

            // Run simulation (no data collection during steps)
            const numSteps = Math.floor(config.duration / config.timeStep)
            for (let i = 0; i < numSteps; i++) {
              wasmEngine.step()
            }

            // Retrieve all sample data at once from internal buffers
            const sampleData = wasmEngine.getSampleData()

            // Convert to UI format
            allResults = convertWasmToUIFormat(
              sampleData,
              sheets,
              config.timeStep,
              config.duration
            )

            // Cleanup allocated memory
            wasmEngine.cleanup()
            wasmEngine.destroy()

            console.log('WASM simulation completed:', {
              totalSheets: allResults.size,
              sheetsWithData: Array.from(allResults.keys()),
              collectorCount: sampleData.size,
              samplesPerCollector: Array.from(sampleData.values()).map(arr => arr.length)
            })

          } catch (error) {
            console.error('WASM simulation error:', error)
            wasmEngine.destroy()

            // Fallback to JavaScript
            notifications.show({
              title: 'WASM execution failed',
              message: 'Falling back to JavaScript engine',
              color: 'orange',
              icon: <IconAlertCircle size={20} />,
              autoClose: 5000
            })

            multiEngine = new MultiSheetSimulationEngine(sheets, config, parameters)
            allResults = multiEngine.run()
          }
        }

      } else {
        // JavaScript path (current implementation)
        multiEngine = new MultiSheetSimulationEngine(sheets, config, parameters)

        // Run simulation across ALL sheets - this returns results for all sheets
        allResults = multiEngine.run()
      }

      // Store ALL results globally
      setGlobalSimulationResults(allResults)

      // Also set the current sheet's engine for CSV export and other operations
      // (only available when using JavaScript engine)
      if (multiEngine) {
        const currentSheetEngine = multiEngine.getSheetEngine(activeSheetId)
        if (currentSheetEngine) {
          setSimulationEngine(currentSheetEngine)
          setOutputPortValues(multiEngine.getOutputPortValues(activeSheetId) || new Map())
        }
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

      notifications.show({
        title: 'Simulation completed',
        message: `Simulation ran successfully across all sheets${useWasm && compiledWasmData ? ' (WASM)' : ''}`,
        color: 'green',
        icon: <IconCircleCheck size={20} />
      })

    } catch (error) {
      console.error('Simulation error:', error)
      setCompilationError(error instanceof Error ? error.message : 'Unknown error')
      notifications.show({
        title: 'Simulation failed',
        message: error instanceof Error ? error.message : 'Check console for details',
        color: 'red',
        icon: <IconAlertCircle size={20} />
      })
    } finally {
      setIsSimulating(false)
      setIsCompiling(false)
    }
  }

  /**
   * Stop a running worker-based simulation
   */
  const handleStopSimulation = async () => {
    if (workerManager) {
      try {
        await workerManager.stop()
      } catch (error) {
        console.error('Error stopping simulation:', error)
      }
    }
  }

  const handleExportCSV = () => {
    if (!simulationEngine) {
      notifications.show({
        title: 'Export failed',
        message: 'No simulation data to export',
        color: 'red',
        icon: <IconAlertCircle size={20} />
      })
      return
    }

    try {
      const csvContent = simulationEngine.exportAllLoggedDataAsCSV()
      if (!csvContent) {
        notifications.show({
          title: 'Export failed',
          message: 'No logger blocks found or no data to export',
          color: 'red',
          icon: <IconAlertCircle size={20} />
        })
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
      notifications.show({
        title: 'Export failed',
        message: 'Failed to export CSV. Check console for details.',
        color: 'red',
        icon: <IconAlertCircle size={20} />
      })
    }
  }

  const handleGenerateCode = async () => {
    if (!model) {
      notifications.show({
        title: 'Code generation failed',
        message: 'No model loaded',
        color: 'red',
        icon: <IconAlertCircle size={20} />
      })
      return
    }

    const settingsValidation = validateAndGetSimulationSettings()
    if (!settingsValidation.isValid) {
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

      notifications.show({
        title: 'Code generated',
        message: 'C code library downloaded successfully',
        color: 'green',
        icon: <IconCircleCheck size={20} />
      })
    } catch (error) {
      console.error('Code generation error:', error)
      notifications.show({
        title: 'Code generation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        color: 'red',
        icon: <IconAlertCircle size={20} />
      })
    }
  }

  const handleBlockDoubleClick = (blockId: string) => {
    console.log('handleBlockDoubleClick called with:', blockId)
    const block = blocks.find(b => b.id === blockId)
    console.log('Block found:', block)
    
    if (!block) return
    
    // Open properties dialog for all block types that have configuration
    if (block && (
      block.type === 'input_port' ||
      block.type === 'output_port' ||
      block.type === 'source' ||
      block.type === 'scale' ||
      block.type === 'limit' ||
      block.type === 'integrator' ||
      block.type === 'transfer_function' ||
      block.type === 'subsystem' ||
      block.type === 'lookup_1d' ||
      block.type === 'lookup_2d' ||
      block.type === 'sheet_label_sink' ||
      block.type === 'sheet_label_source' ||
      block.type === 'sum' ||
      block.type === 'mux' ||
      block.type === 'trig' ||
      block.type === 'condition' ||
      block.type === 'evaluate' ||
      block.type === 'orientation_conversion'
    )) {
      console.log('Setting config block:', block)
      setConfigBlock(block)
    }
  }

  const handleBlockConfigUpdate = (parameters: Record<string, any>) => {
    if (configBlock) {
      console.log('[handleBlockConfigUpdate] Updating block:', configBlock.id, 'with parameters:', parameters)
      console.log('[handleBlockConfigUpdate] isDirty before update:', isDirty)
      updateBlock(configBlock.id, { parameters })
      saveCurrentSheetData()
      // updateBlock already sets isDirty, but ensure it's set
      setIsDirty(true)
      console.log('[handleBlockConfigUpdate] isDirty should now be true')
    }
  }

  const handleSimulationSettingsChange = useCallback((settings: { duration: string; timeStep: string; integrationAlgorithm?: 'euler' | 'rk4' }) => {
    setSimulationSettings(prev => ({
      ...prev,
      duration: settings.duration,
      timeStep: settings.timeStep,
      integrationAlgorithm: settings.integrationAlgorithm || prev.integrationAlgorithm
    }))
  }, [])

  // Feature 5: Clipboard handlers
  const handleCopy = useCallback(() => {
    const clipboardData = copySelection()
    if (clipboardData) {
      notifications.show({
        title: 'Copied',
        message: `${clipboardData.blocks.length} block${clipboardData.blocks.length !== 1 ? 's' : ''} copied to clipboard`,
        color: 'blue',
        autoClose: 2000,
      })
    }
  }, [copySelection])

  const handleCut = useCallback(() => {
    const clipboardData = cutSelection()
    if (clipboardData) {
      notifications.show({
        title: 'Cut',
        message: `${clipboardData.blocks.length} block${clipboardData.blocks.length !== 1 ? 's' : ''} cut to clipboard`,
        color: 'blue',
        autoClose: 2000,
      })
    }
  }, [cutSelection])

  const handlePaste = useCallback(() => {
    // Check for dependency issues first
    const depCheck = checkClipboardDependencies()
    if (!depCheck.allSatisfied && depCheck.missingParameters.length > 0) {
      // For now, auto-import missing parameters with a notification
      // TODO: Show PasteDependencyDialog for user confirmation
      const result = pasteFromClipboard({ importMissingParameters: true })
      if (result.success) {
        notifications.show({
          title: 'Pasted with dependencies',
          message: `${result.pastedBlockIds.length} block${result.pastedBlockIds.length !== 1 ? 's' : ''} pasted. Missing parameters were imported.`,
          color: 'green',
          autoClose: 3000,
        })
      } else {
        notifications.show({
          title: 'Paste failed',
          message: result.error || 'Unknown error',
          color: 'red',
          icon: <IconAlertCircle size={20} />,
        })
      }
    } else {
      const result = pasteFromClipboard()
      if (result.success) {
        notifications.show({
          title: 'Pasted',
          message: `${result.pastedBlockIds.length} block${result.pastedBlockIds.length !== 1 ? 's' : ''} pasted`,
          color: 'green',
          autoClose: 2000,
        })
      } else if (result.error !== 'Clipboard is empty') {
        notifications.show({
          title: 'Paste failed',
          message: result.error || 'Unknown error',
          color: 'red',
          icon: <IconAlertCircle size={20} />,
        })
      }
    }
  }, [checkClipboardDependencies, pasteFromClipboard])

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

  const isCurrentSheetInSubsystem = () => {
    // Check if the active sheet is a root sheet
    const isRootSheet = sheets.some(sheet => sheet.id === activeSheetId)
    return !isRootSheet
  }

  const getParentSheetIdForCurrent = () => {
    if (isCurrentSheetInSubsystem()) {
      const { getParentSheetId } = useModelStore.getState()
      return getParentSheetId(activeSheetId)
    }
    return null
  }

  const handleNavigateToParent = () => {
    const parentId = getParentSheetIdForCurrent()
    if (parentId) {
      switchToSheet(parentId)
    }
  }

  if (loading || !user) {
    return (
      <Center h="100vh">
        <Loader size="lg" />
      </Center>
    )
  }

  if (error) {
    return (
      <Center h="100vh">
        <Stack align="center">
          <Title order={2}>Error</Title>
          <Text c="dimmed" mb="md">{error}</Text>
          <Button component={Link} href="/models" leftSection={<IconArrowLeft size={16} />}>
            Back to Models
          </Button>
        </Stack>
      </Center>
    )
  }

  if (modelLoading) {
    return (
      <Center h="100vh">
        <Stack align="center">
          <Loader size="lg" />
          <Text>Loading model...</Text>
        </Stack>
      </Center>
    )
  }

  if (!model) {
    return (
      <Center h="100vh">
        <Stack align="center">
          <Title order={2}>Model Not Found</Title>
          <Button component={Link} href="/models" leftSection={<IconArrowLeft size={16} />}>
            Back to Models
          </Button>
        </Stack>
      </Center>
    )
  }

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 340, breakpoint: 'sm' }}
      aside={{ width: 400, breakpoint: 'md' }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Anchor component={Link} href="/models" c="blue">
              <Group gap="xs">
                <IconArrowLeft size={16} />
                <Text size="sm">Back to Models</Text>
              </Group>
            </Anchor>
            <Title order={3}>{model.name}</Title>
            {isOlderVersion && (
              <Badge color="yellow" variant="filled">
                Version {currentVersion} of {model.latest_version}
              </Badge>
            )}
            {error && (
              <Badge color="red" variant="filled">
                {error}
              </Badge>
            )}
          </Group>
          
          <Group>
            <AutoSaveStatusIndicator />

            {/* WASM Status Indicator */}
            {getWasmPreference() && (
              <Tooltip label="WebAssembly acceleration enabled">
                <Badge
                  variant="light"
                  color="blue"
                  leftSection={
                    <Box component="span" style={{ display: 'flex', alignItems: 'center' }}>
                      ⚡
                    </Box>
                  }
                >
                  WASM
                </Badge>
              </Tooltip>
            )}

            {compilationTime !== null && (
              <Tooltip label={`Last compilation: ${compilationTime}ms`}>
                <Badge variant="light" color="gray" leftSection={<IconClock size={12} />}>
                  {compilationTime}ms
                </Badge>
              </Tooltip>
            )}

            <Button
              onClick={handleSave}
              loading={saving}
              leftSection={<IconDeviceFloppy size={16} />}
              color="green"
            >
              {isOlderVersion ? 'Save as New Model' : 'Save'}
            </Button>
            
            <Button
              onClick={() => setShowSaveAsDialog(true)}
              variant="outline"
              color="green"
            >
              Save as...
            </Button>
            
            <ModelValidationButton
              blocks={blocks}
              wires={wires}
              onSelectBlock={setSelectedBlockId}
              onSelectWire={setSelectedWireId}
            />

            <Button
              onClick={() => setShowParametersDialog(true)}
              leftSection={<IconSettings size={16} />}
              variant="outline"
              color="blue"
            >
              Parameters
            </Button>

            {/* Run/Stop Simulation buttons with progress indicator */}
            {isSimulating && simulationProgress && workerManager ? (
              <Group gap="xs">
                <Button
                  onClick={handleStopSimulation}
                  color="red"
                  leftSection={<IconPlayerStop size={16} />}
                >
                  Stop ({simulationProgress.progress.toFixed(0)}%)
                </Button>
              </Group>
            ) : (
              <Button
                onClick={handleRunSimulation}
                loading={isSimulating || isCompiling}
                leftSection={<IconPlayerPlay size={16} />}
              >
                {isCompiling ? 'Compiling...' : isSimulating ? 'Running...' : 'Run Simulation'}
              </Button>
            )}
            
            <Button
              onClick={handleGenerateCode}
              leftSection={<IconCode size={16} />}
              color="violet"
            >
              Generate Code
            </Button>
            
            <Button
              onClick={handleExportModel}
              leftSection={<IconFileExport size={16} />}
              color="indigo"
            >
              Export
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <BlockLibrarySidebar />
      </AppShell.Navbar>

      <AppShell.Main>
        <Box h="100vh" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Sheet Tabs */}
          <SheetTabs
            sheets={sheets}
            activeSheetId={activeSheetId}
            onSheetChange={switchToSheet}
            onAddSheet={handleAddSheet}
            onRenameSheet={renameSheet}
            onDeleteSheet={deleteSheet}
            isInSubsystem={isCurrentSheetInSubsystem()}
            parentSheetId={getParentSheetIdForCurrent()}
            onNavigateToParent={handleNavigateToParent}
          />

          {/* Breadcrumbs */}
          <SheetBreadcrumbs
            breadcrumbs={getSheetPath(sheets, activeSheetId)}
            onNavigate={switchToSheet}
          />

          {/* Canvas Area */}
          <Box className="canvas-container" style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            <CanvasReactFlow
              blocks={blocks}
              wires={wires}
              selectedBlockId={selectedBlockId}
              selectedBlockIds={selectedBlockIds}
              selectedWireId={selectedWireId}
              selectedWireIds={selectedWireIds}
              onDrop={handleCanvasDrop}
              onBlockMove={handleBlockMove}
              onBlocksMove={handleBlocksMove}
              onBlockSelect={setSelectedBlockId}
              onBlocksSelect={setSelectedBlocks}
              onBlockDoubleClick={handleBlockDoubleClick}
              onBlockDelete={handleBlockDelete}
              onWireCreate={handleWireCreate}
              onWireSelect={setSelectedWireId}
              onWireDelete={handleWireDelete}
              onSheetNavigate={switchToSheet}
              onClearSelection={clearSelection}
              onCopy={handleCopy}
              onCut={handleCut}
              onPaste={handlePaste}
              onBlockRename={(blockId, newName) => {
                const result = renameBlock(blockId, newName)
                if (result.success) {
                  saveCurrentSheetData()
                }
                return result
              }}
            />
          </Box>
        </Box>
      </AppShell.Main>

      <AppShell.Aside p="md">
        <Stack h="100%" gap="md">
          <Paper p="sm" withBorder>
            <Group justify="space-between" mb="xs">
              <Text fw={600}>Properties</Text>
              <Badge variant="light" color="gray">
                {sheets.find(s => s.id === activeSheetId)?.name || 'Unknown'}
              </Badge>
            </Group>
            {isOlderVersion && (
              <Alert color="yellow" variant="light" mt="xs">
                <Text size="sm">
                  Viewing older version - changes will create new model
                </Text>
              </Alert>
            )}
          </Paper>

          {/* Simulation Settings Panel */}
          <SimulationSettingsPanel
            initialDuration={parseFloat(simulationSettings.duration) || 10.0}
            initialTimeStep={parseFloat(simulationSettings.timeStep) || 0.01}
            initialIntegrationAlgorithm={simulationSettings.integrationAlgorithm}
            onChange={handleSimulationSettingsChange}
            useWorker={useWorker}
            onWorkerChange={setUseWorker}
            workerAvailable={isWorkerSimulationAvailable()}
            forceRecompile={forceRecompile}
            onForceRecompileChange={setForceRecompile}
          />

          {/* WASM Compilation Progress - for background pre-warming only */}
          {isCompiling && model && (
            <CompilationProgress
              modelId={model.id}
              optimizationLevel="O2"
              onComplete={(result) => {
                console.log('[Pre-warming] Compilation complete:', result)
                setCompilationTime(result.metadata.compilationTime || result.metadata.retrievalTime || 0)
                setCompiledWasmData(result)
                setIsCompiling(false)

                // Show subtle notification for background pre-warming
                notifications.show({
                  title: 'WASM Ready',
                  message: result.metadata.cacheHit
                    ? `Loaded from cache (${result.metadata.retrievalTime || 0}ms)`
                    : `Compiled in ${result.metadata.compilationTime || 0}ms`,
                  color: 'green',
                  icon: <IconCheck size={20} />,
                  autoClose: 3000
                })
              }}
              onError={(error, details) => {
                console.error('[Pre-warming] Compilation error:', error, details)
                setCompilationError(error)
                setCompilationErrorDetails(details || null)
                setIsCompiling(false)

                // Show error notification
                notifications.show({
                  title: 'WASM Compilation Failed',
                  message: 'Will use JavaScript engine instead',
                  color: 'orange',
                  icon: <IconAlertCircle size={20} />,
                  autoClose: 5000
                })
              }}
            />
          )}

          {/* WASM Compilation Error */}
          {compilationError && !isCompiling && (
            <WasmErrorDisplay
              error={compilationError}
              details={compilationErrorDetails || undefined}
              onDismiss={() => {
                setCompilationError(null)
                setCompilationErrorDetails(null)
              }}
            />
          )}

          <ScrollArea style={{ flex: 1 }} offsetScrollbars>
            {currentSheetSimulationResults ? (
              <Stack gap="md" p="md">
                <Text fw={600}>Simulation Results</Text>
                <Stack gap="xs">
                  <Text size="sm" c="dimmed">
                    Duration: {currentSheetSimulationResults.finalTime.toFixed(2)}s
                  </Text>
                  <Text size="sm" c="dimmed">
                    Time Points: {currentSheetSimulationResults.timePoints.length}
                  </Text>
                  <Text size="sm" c="dimmed">
                    Display Blocks: {currentSheetSimulationResults.signalData.size}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Sheet: {sheets.find(s => s.id === activeSheetId)?.name}
                  </Text>
                </Stack>
                
                <Divider />
                
                {/* Display Signal Charts */}
                {Array.from(currentSheetSimulationResults.signalData.entries()).map(([blockId, data]: [string, any[]]) => {
                  const block = blocks.find(b => b.id === blockId && b.type === 'signal_display')
                  if (!block) return null
                  
                  // Transform the data to match SignalDisplay's expected format
                  const signalData = currentSheetSimulationResults.timePoints.map((time: number, index: number) => ({
                    time,
                    value: data[index]
                  }))
                  
                  return (
                    <Box key={blockId}>
                      <SignalDisplay
                        block={block}
                        signalData={signalData}
                        isRunning={false}
                      />
                    </Box>
                  )
                })}
                
                {/* Logger Block Data Summary */}
                {Array.from(currentSheetSimulationResults.signalData.entries()).map(([blockId, data]: [string, any[]]) => {
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
                    <Paper key={blockId} p="sm" withBorder>
                      <Text fw={600} size="sm" mb="xs">{block.name} (Logger)</Text>
                      <Stack gap={4}>
                        <Text size="xs" c="dimmed">Final value: {displayValue}</Text>
                        <Text size="xs" c="dimmed">Samples: {data.length}</Text>
                        <Text size="xs" c="dimmed">Min: {minValue}</Text>
                        <Text size="xs" c="dimmed">Max: {maxValue}</Text>
                      </Stack>
                    </Paper>
                  )
                })}

                {/* Output Port Values */}
                {outputPortValues && outputPortValues.size > 0 && (
                  <>
                    <Text fw={600} mt="md">Output Port Values</Text>
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
                        <Paper key={portName} p="sm" withBorder bg="yellow.1">
                          <Text size="sm" fw={600} c="yellow.9">{portName}</Text>
                          <Text size="lg" fw="mono" c="yellow.9">{displayValue}</Text>
                        </Paper>
                      )
                    })}
                  </>
                )}

                {/* CSV Export Button */}
                {Array.from(currentSheetSimulationResults.signalData.entries()).some(([blockId]: [string, any]) => 
                  blocks.find(b => b.id === blockId && b.type === 'signal_logger')
                ) && (
                  <Button
                    onClick={handleExportCSV}
                    fullWidth
                    color="green"
                    leftSection={<IconDownload size={16} />}
                  >
                    Export Logger Data as CSV
                  </Button>
                )}
                
                {/* Show note if other sheets have results */}
                {globalSimulationResults && globalSimulationResults.size > 1 && (
                  <Alert color="blue" variant="light">
                    <Text size="sm">
                      Simulation data available for {globalSimulationResults.size} sheets. 
                      Switch sheets to view their results.
                    </Text>
                  </Alert>
                )}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                Run simulation to see signal displays and results
              </Text>
            )}
          </ScrollArea>
        </Stack>
      </AppShell.Aside>

      {showSaveAsDialog && (
        <SaveAsDialog
          currentName={model.name}
          onSave={handleSaveAs}
          onClose={() => setShowSaveAsDialog(false)}
        />
      )}

      <ModelParametersDialog
        opened={showParametersDialog}
        onClose={() => setShowParametersDialog(false)}
        disabled={isSimulating}
      />

      {/* Add Auto-save Recovery Dialog */}
      {showAutoSaveDialog && model && autoSaveInfo && (
        <AutoSaveRecoveryDialog
          modelName={model.name}
          autoSaveDate={autoSaveInfo.autoSaveDate}
          lastSavedVersion={autoSaveInfo.lastSavedVersion}
          lastSavedDate={autoSaveInfo.lastSavedDate}
          onRecover={handleRecoverAutoSave}
          onDiscard={handleDiscardAutoSave}
        />
      )}

      {/* Configuration Modals */}
      {configBlock && (
        <>
          {configBlock.type === 'condition' && (
            <ConditionConfig
              block={configBlock}
              onUpdate={handleBlockConfigUpdate}
              onClose={() => setConfigBlock(null)}
            />
          )}

          {configBlock.type === 'evaluate' && (
            <EvaluateConfig
              block={configBlock}
              onUpdate={handleBlockConfigUpdate}
              onClose={() => setConfigBlock(null)}
            />
          )}
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
          {configBlock.type === 'sum' && (
            <SumConfig
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
          {configBlock.type === 'limit' && (
            <LimitConfig
              block={configBlock}
              onUpdate={handleBlockConfigUpdate}
              onClose={() => setConfigBlock(null)}
            />
          )}
          {configBlock.type === 'integrator' && (
            <IntegratorConfig
              block={configBlock}
              onUpdate={handleBlockConfigUpdate}
              onClose={() => setConfigBlock(null)}
            />
          )}
          {configBlock.type === 'orientation_conversion' && (
            <OrientationConversionConfig
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
              onRename={(newName) => renameBlock(configBlock.id, newName)}
              onClose={() => setConfigBlock(null)}
              onSheetNavigate={(sheetId) => {
                switchToSheet(sheetId)
                setConfigBlock(null)
              }}
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
          {configBlock.type === 'mux' && (
            <MuxConfig
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

          {configBlock.type === 'trig' && (
            <TrigConfig
              block={configBlock}
              onUpdate={handleBlockConfigUpdate}
              onClose={() => setConfigBlock(null)}
            />
          )}
        </>
      )}
    </AppShell>
  )
}
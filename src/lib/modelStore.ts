import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { SimulationResults } from '@/lib/simulationTypes'
import { WasmSimulationEngine } from './simulation/WasmSimulationEngine'
import { Model, ModelVersion } from '@/lib/types'
import { supabase } from '@/lib/supabaseClient'
import { SignalValue, ModelParameter } from '@/lib/modelSchema'
import {
  ClipboardData,
  PasteOptions,
  PasteResult,
  DependencyCheckResult,
  CLIPBOARD_STORAGE_KEY,
  serializeClipboard,
  deserializeClipboard,
} from '@/types/clipboard'
import {
  collectIdsFromSheets,
  collectNamesFromBlocks,
  remapClipboardSelection,
} from '@/lib/clipboardRemap'

export interface Sheet {
  id: string
  name: string
  blocks: BlockData[]
  connections: WireData[]
  extents: {
    width: number
    height: number
  }
}

export interface ModelState {
  // Model data
  model: Model | null
  currentVersion: number
  isOlderVersion: boolean
  sheets: Sheet[]
  activeSheetId: string
  parameters: ModelParameter[]  // Feature 1: Model parameters

  // Current sheet content
  blocks: BlockData[]
  wires: WireData[]

  // UI state
  selectedBlockId: string | null  // Legacy: kept for backward compatibility
  selectedBlockIds: string[]      // Feature 4: Multiple block selection
  selectedWireId: string | null
  selectedWireIds: string[]       // Feature 4: Connections between selected blocks
  configBlock: BlockData | null
  resizingBlockId: string | null  // Block currently in interactive resize mode
  // Focus request: consumed by CanvasReactFlow to pan/center on a block or wire.
  // Bumping `nonce` re-fires the request even for the same target.
  focusRequest: {
    blockId?: string
    wireId?: string
    sheetId?: string
    nonce: number
  } | null

  // Feature 5: Clipboard state
  clipboardData: ClipboardData | null
  
  // Simulation state
  globalSimulationResults: Map<string, SimulationResults> | null
  currentSheetSimulationResults: SimulationResults | null 
  simulationResults: SimulationResults | null
  isSimulating: boolean
  simulationEngine: WasmSimulationEngine | null
  outputPortValues: Map<string, SignalValue> | null
  
  // Loading states
  modelLoading: boolean
  saving: boolean
  error: string | null
  
  // Auto-save state
  autoSaveEnabled: boolean
  lastAutoSave: string | null

  // Dirty state tracking
  isDirty: boolean
  lastSavedHash: string | null  // Store a hash of the last saved state for comparison
}

export interface ModelActions {
  // Model actions
  setModel: (model: Model | null) => void
  setCurrentVersion: (version: number) => void
  setIsOlderVersion: (isOlder: boolean) => void
  setError: (error: string | null) => void
  setModelLoading: (loading: boolean) => void
  saveModel: (globalSettings?: { simulationTimeStep: number; simulationDuration: number; integrationAlgorithm?: 'euler' | 'rk4'; debugMath?: boolean }) => Promise<boolean>
  saveAsNewModel: (newName: string, globalSettings?: { simulationTimeStep: number; simulationDuration: number; integrationAlgorithm?: 'euler' | 'rk4'; debugMath?: boolean }) => Promise<string | null>
  saveAutoSave: () => Promise<boolean>
  deleteAutoSave: () => Promise<void>
  enableAutoSave: () => void
  disableAutoSave: () => void
  
  // Sheet actions
  setSheets: (sheets: Sheet[]) => void
  setActiveSheetId: (sheetId: string) => void
  addSheet: (sheet: Sheet) => void
  updateSheet: (sheetId: string, updates: Partial<Sheet>) => void
  deleteSheet: (sheetId: string) => void
  renameSheet: (sheetId: string, newName: string) => void
  getParentSheetId: (sheetId: string) => string | null
  
  // Block and wire actions
  setBlocks: (blocks: BlockData[]) => void
  setWires: (wires: WireData[]) => void
  addBlock: (block: BlockData) => void
  updateBlock: (blockId: string, updates: Partial<BlockData>) => void
  updateBlocks: (updates: Array<{ id: string; updates: Partial<BlockData> }>) => void  // Feature 4: Batch update
  deleteBlock: (blockId: string) => void
  addWire: (wire: WireData) => void
  deleteWire: (wireId: string) => void
  updateWireRouting: (wireId: string, routing: WireData['routing']) => void
  // Feature 7: Block rename
  renameBlock: (blockId: string, newName: string) => { success: boolean; error?: string }
  validateBlockName: (name: string, excludeBlockId?: string) => { valid: boolean; error?: string }
  
  // Selection actions
  setSelectedBlockId: (blockId: string | null) => void
  setSelectedWireId: (wireId: string | null) => void
  setConfigBlock: (block: BlockData | null) => void
  setResizingBlockId: (blockId: string | null) => void
  requestFocus: (target: { blockId?: string; wireId?: string; sheetId?: string }) => void

  // Feature 4: Multi-selection actions
  setSelectedBlocks: (blockIds: string[]) => void
  addToSelection: (blockIds: string[]) => void
  removeFromSelection: (blockIds: string[]) => void
  clearSelection: () => void
  toggleBlockSelection: (blockId: string) => void
  getSelectedBlocks: () => BlockData[]
  getSelectedWires: () => WireData[]
  getConnectionsBetweenBlocks: (blockIds: string[]) => WireData[]

  // Feature 5: Clipboard actions
  copySelection: () => ClipboardData | null
  cutSelection: () => ClipboardData | null
  pasteFromClipboard: (options?: PasteOptions) => PasteResult
  checkClipboardDependencies: (clipboardData?: ClipboardData) => DependencyCheckResult
  getClipboardData: () => ClipboardData | null
  importMissingDependencies: (clipboardData: ClipboardData) => void

  // Parameter actions (Feature 1)
  addParameter: (param: ModelParameter) => void
  updateParameter: (name: string, updates: Partial<ModelParameter>) => void
  deleteParameter: (name: string) => void
  getParameter: (name: string) => ModelParameter | undefined
  validateParameterName: (name: string, excludeName?: string) => { valid: boolean; error?: string }

  // Simulation actions
  setSimulationResults: (results: SimulationResults | null) => void
  setIsSimulating: (simulating: boolean) => void
  setOutputPortValues: (values: Map<string, SignalValue > | null | undefined) => void
  setGlobalSimulationResults: (results: Map<string, SimulationResults>) => void
  clearGlobalSimulationResults: () => void
  
  // Composite actions
  switchToSheet: (sheetId: string) => void
  updateCurrentSheet: (updates: Partial<Sheet>) => void
  initializeFromModel: (model: Model, versionData: ModelVersion) => void
  saveCurrentSheetData: () => void
  updateSubsystemSheets: (subsystemId: string, sheets: Sheet[]) => void

  // Dirty state actions
  setIsDirty: (dirty: boolean) => void
  markAsClean: () => void
  checkIfDirty: () => boolean
  
}

export type ModelStore = ModelState & ModelActions

/**
 * Synchronize a subsystem block's inputPorts and outputPorts arrays
 * based on the input_port and output_port blocks within its sheets.
 */
function syncSubsystemPortsFromSheets(subsystemBlock: BlockData): void {
  if (subsystemBlock.type !== 'subsystem' || !subsystemBlock.parameters?.sheets) {
    return
  }

  const inputPorts: string[] = []
  const outputPorts: string[] = []

  // Scan all sheets within the subsystem for input_port and output_port blocks
  for (const sheet of subsystemBlock.parameters.sheets) {
    if (!sheet.blocks) continue

    for (const block of sheet.blocks) {
      if (block.type === 'input_port') {
        // Use portName from parameters if available, otherwise use block name
        const portName = block.parameters?.portName || block.name
        if (portName && !inputPorts.includes(portName)) {
          inputPorts.push(portName)
        }
      } else if (block.type === 'output_port') {
        // Use portName from parameters if available, otherwise use block name
        const portName = block.parameters?.portName || block.name
        if (portName && !outputPorts.includes(portName)) {
          outputPorts.push(portName)
        }
      }
    }
  }

  // Update the subsystem's port arrays in parameters
  subsystemBlock.parameters.inputPorts = inputPorts
  subsystemBlock.parameters.outputPorts = outputPorts

  // CRITICAL: Also update the block's inputs/outputs arrays
  // These are what the connection validation checks when wiring to/from a subsystem
  subsystemBlock.inputs = inputPorts
  subsystemBlock.outputs = outputPorts
}

/**
 * Find the parent subsystem block that contains a given sheet ID.
 * Returns the subsystem block if found, null if the sheet is a top-level sheet.
 */
function findParentSubsystemForSheet(
  sheets: Sheet[],
  sheetId: string
): BlockData | null {
  for (const sheet of sheets) {
    if (!sheet.blocks) continue

    for (const block of sheet.blocks) {
      if (block.type === 'subsystem' && block.parameters?.sheets) {
        // Check if the target sheet is directly in this subsystem
        const foundSheet = block.parameters.sheets.find((s: Sheet) => s.id === sheetId)
        if (foundSheet) {
          return block
        }

        // Recursively search in nested subsystems
        const nestedResult = findParentSubsystemForSheet(block.parameters.sheets, sheetId)
        if (nestedResult) {
          return nestedResult
        }
      }
    }
  }

  return null
}

export const useModelStore = create<ModelStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    model: null,
    currentVersion: 1,
    isOlderVersion: false,
    sheets: [],
    activeSheetId: 'main',
    parameters: [],  // Feature 1: Model parameters
    blocks: [],
    wires: [],
    selectedBlockId: null,
    selectedBlockIds: [],      // Feature 4: Multiple block selection
    selectedWireId: null,
    selectedWireIds: [],       // Feature 4: Connections between selected blocks
    configBlock: null,
    resizingBlockId: null,
    focusRequest: null,
    clipboardData: null,       // Feature 5: Clipboard state
    simulationResults: null,
    isSimulating: false,
    simulationEngine: null,
    outputPortValues: null,
    modelLoading: true,
    saving: false,
    error: null,
    autoSaveEnabled: true,
    lastAutoSave: null,
    globalSimulationResults: null,
    currentSheetSimulationResults: null,
    isDirty: false,
    lastSavedHash: null,

    // Model actions
    setModel: (model) => set({ model }),
    setCurrentVersion: (currentVersion) => set({ currentVersion }),
    setIsOlderVersion: (isOlderVersion) => set({ isOlderVersion }),
    setError: (error) => set({ error }),
    setModelLoading: (modelLoading) => set({ modelLoading }),
    
    saveModel: async (globalSettings?: { simulationTimeStep: number; simulationDuration: number; integrationAlgorithm?: 'euler' | 'rk4'; debugMath?: boolean }) => {
      const state = get()

      if (!state.model) {
        set({ error: 'No model to save' })
        return false
      }

      // If viewing an older version, prompt for save as new
      if (state.isOlderVersion) {
        const newName = window.prompt(
          `You are viewing version ${state.currentVersion} of "${state.model.name}".\n\n` +
          'To save changes, please enter a name for the new model:',
          `${state.model.name} (v${state.currentVersion} modified)`
        )
        
        if (!newName) {
          return false
        }
        
        const newModelId = await get().saveAsNewModel(newName)
        return newModelId !== null
      }

      set({ saving: true, error: null })
      
      try {
        // Ensure current sheet data is saved before persisting to database
        get().saveCurrentSheetData()
        
        const updatedState = get()
        
        if (!updatedState.model) {
          set({ error: 'Model was lost during save preparation', saving: false })
          return false
        }
        
        // Use provided globalSettings or defaults
        const modelData = {
          version: "2.1",  // Feature 1: Updated to v2.1 for parameter support
          metadata: {
            created: updatedState.model.created_at,
            description: `Model ${updatedState.model.name}`
          },
          sheets: updatedState.sheets,
          globalSettings: {
            simulationTimeStep: globalSettings?.simulationTimeStep ?? 0.01,
            simulationDuration: globalSettings?.simulationDuration ?? 10.0,
            integrationAlgorithm: globalSettings?.integrationAlgorithm ?? 'rk4',
            debugMath: globalSettings?.debugMath ?? false
          },
          parameters: updatedState.parameters,  // Feature 1: Include parameters
          dataStores: (updatedState as any).dataStores || []
        }

        // Get the next version number
        const { data: nextVersionData, error: versionError } = await supabase
          .rpc('get_next_version_number', { p_model_id: updatedState.model.id })

        if (versionError) {
          console.error('Error getting next version:', versionError)
          set({ error: 'Failed to get next version number', saving: false })
          return false
        }

        const nextVersion = nextVersionData || 1

        // Create new version
        const { error: insertError } = await supabase
          .from('model_versions')
          .insert({
            model_id: updatedState.model.id,
            version: nextVersion,
            data: modelData
          })

        if (insertError) {
          console.error('Save error:', insertError)
          set({ error: `Failed to save model: ${insertError.message}`, saving: false })
          return false
        }

        // Update model metadata
        const { error: updateError } = await supabase
          .from('models')
          .update({ 
            latest_version: nextVersion,
            updated_at: new Date().toISOString()
          })
          .eq('id', updatedState.model.id)

        if (updateError) {
          console.error('Update error:', updateError)
          set({ error: `Failed to update model: ${updateError.message}`, saving: false })
          return false
        }

        // Delete auto-save after successful save
        await get().deleteAutoSave()

        get().markAsClean()

        // Update the model with the new version
        set({ 
          model: {
            ...updatedState.model,
            latest_version: nextVersion,
            updated_at: new Date().toISOString()
          },
          currentVersion: nextVersion,
          isOlderVersion: false,
          saving: false,
          error: null
        })
        
        console.log(`Model saved as version ${nextVersion}`)
        return true

      } catch (error) {
        console.error('Save error:', error)
        set({ 
          error: `Failed to save model: ${error instanceof Error ? error.message : 'Unknown error'}`,
          saving: false 
        })
        return false
      }
    },

    saveAsNewModel: async (newName: string, globalSettings?: { simulationTimeStep: number; simulationDuration: number; integrationAlgorithm?: 'euler' | 'rk4'; debugMath?: boolean }) => {
      const state = get()

      if (!state.model) {
        set({ error: 'No model to save' })
        return null
      }

      set({ saving: true, error: null })

      try {
        // Ensure current sheet data is saved
        get().saveCurrentSheetData()

        const updatedState = get()
        if (!updatedState.model) {
          set({ error: 'Model was lost during save preparation', saving: false })
          return null
        }

        const modelData = {
          version: "2.1",  // Feature 1: Updated to v2.1 for parameter support
          metadata: {
            created: new Date().toISOString(),
            description: `Model ${newName}`
          },
          sheets: updatedState.sheets,
          globalSettings: {
            simulationTimeStep: globalSettings?.simulationTimeStep ?? 0.01,
            simulationDuration: globalSettings?.simulationDuration ?? 10.0,
            integrationAlgorithm: globalSettings?.integrationAlgorithm ?? 'rk4',
            debugMath: globalSettings?.debugMath ?? false
          },
          parameters: updatedState.parameters  // Feature 1: Include parameters
        }

        // Create new model metadata
        const { data: newModel, error: modelError } = await supabase
          .from('models')
          .insert({
            user_id: updatedState.model.user_id,
            name: newName,
            latest_version: 1
          })
          .select()
          .single()

        if (modelError) throw modelError

        // Create version 1 for the new model
        const { error: versionError } = await supabase
          .from('model_versions')
          .insert({
            model_id: newModel.id,
            version: 1,
            data: modelData
          })

        if (versionError) throw versionError

        set({ saving: false, error: null })
        
        // Return the new model ID so we can navigate to it
        return newModel.id

      } catch (error) {
        console.error('Save as new model error:', error)
        set({ 
          error: `Failed to save as new model: ${error instanceof Error ? error.message : 'Unknown error'}`,
          saving: false 
        })
        return null
      }
    },
    
    saveAutoSave: async () => {
      const state = get()
  
      if (!state.model || !state.autoSaveEnabled) {
        return false
      }

      // Check if the model is dirty before saving
      const isDirty = get().checkIfDirty()
      if (!isDirty) {
        console.log('Skipping auto-save: no changes detected')
        return true // Return true as there's nothing to save
      }

      // Don't auto-save if we're still loading or if model doesn't have an ID
      if (state.modelLoading || !state.model.id) {
        console.log('Skipping auto-save: model not ready')
        return false
      }

      // Don't auto-save if there are no sheets
      if (state.sheets.length === 0) {
        console.log('Skipping auto-save: no sheets')
        return false
      }

      try {
        // Ensure current sheet data is saved
        console.log('[saveAutoSave] Calling saveCurrentSheetData...')
        get().saveCurrentSheetData()

        const updatedState = get()
        if (!updatedState.model) {
          console.error('Model was lost during auto-save preparation')
          return false
        }

        // Debug: Log the blocks being saved
        console.log('[saveAutoSave] Sheets to save:', updatedState.sheets.length)
        updatedState.sheets.forEach((sheet, i) => {
          console.log(`[saveAutoSave] Sheet ${i} (${sheet.name}): ${sheet.blocks.length} blocks`)
          sheet.blocks.forEach(block => {
            if (block.type === 'source') {
              console.log(`[saveAutoSave]   Source block "${block.name}":`, JSON.stringify(block.parameters))
            }
          })
        })

        const modelData = {
          version: "1.0",
          metadata: {
            created: updatedState.model.created_at,
            description: `Model ${updatedState.model.name} (auto-save)`
          },
          sheets: updatedState.sheets,
          globalSettings: {
            simulationTimeStep: 0.01,
            simulationDuration: 10.0,
            integrationAlgorithm: 'rk4'
          }
        }

        // Check if auto-save (version 0) already exists
        const { data: existingAutoSave, error: checkError } = await supabase
          .from('model_versions')
          .select('id')
          .eq('model_id', updatedState.model.id)
          .eq('version', 0)
          .maybeSingle() // Use maybeSingle instead of single to handle no results gracefully

        if (checkError) {
          console.error('Error checking for existing auto-save:', checkError)
          return false
        }

        if (existingAutoSave) {
          // Update existing auto-save
          const { error } = await supabase
            .from('model_versions')
            .update({ 
              data: modelData,
              created_at: new Date().toISOString()
            })
            .eq('id', existingAutoSave.id)

          if (error) {
            console.error('Auto-save update error:', error)
            return false
          }
        } else {
          // Create new auto-save
          const { error } = await supabase
            .from('model_versions')
            .insert({
              model_id: updatedState.model.id,
              version: 0,
              data: modelData
            })

          if (error) {
            console.error('Auto-save create error:', error)
            return false
          }
        }

        set({ lastAutoSave: new Date().toISOString() })
        console.log('Auto-save completed')
        get().markAsClean() // Mark as clean after successful auto-save
        return true

      } catch (error) {
        console.error('Auto-save error:', error)
        return false
      }
    },

    // In lib/modelStore.ts, add this function to the store:

    saveAsModel: async (newName: string) => {
      const { model, sheets, currentVersion, initializeFromModel } = get()

      if (!model) return false

      set({ saving: true, error: null })

      try {
        // Create a new model with the new name
        const { data: newModel, error: modelError } = await supabase
          .from('models')
          .insert({
            user_id: model.user_id,
            name: newName,
            latest_version: 1
          })
          .select()
          .single()

        if (modelError) throw modelError

        // Create the model data for version 1
        const modelData = {
          version: '2.0',
          metadata: {
            created: new Date().toISOString(),
            description: `Copy of ${model.name}`
          },
          sheets,
          globalSettings: {
            simulationTimeStep: 0.01,
            simulationDuration: 10,
            integrationAlgorithm: 'rk4'
          }
        }

        // Save as version 1 of the new model
        const { data: versionData, error: versionError } = await supabase
          .from('model_versions')
          .insert({
            model_id: newModel.id,
            version: 1,
            data: modelData
          })
          .select()
          .single()

        if (versionError) throw versionError

        // Initialize the store with the new model
        initializeFromModel(newModel, versionData)

        // Navigate to the new model
        window.location.href = `/models/${newModel.id}`

        return true
      } catch (error) {
        console.error('Save as error:', error)
        set({ error: 'Failed to save model copy' })
        return false
      } finally {
        set({ saving: false })
      }
    },

    deleteAutoSave: async () => {
      const state = get()
      if (!state.model) return

      try {
        await supabase
          .from('model_versions')
          .delete()
          .eq('model_id', state.model.id)
          .eq('version', 0)
        
        console.log('Auto-save deleted')
      } catch (error) {
        console.error('Error deleting auto-save:', error)
      }
    },
    
    enableAutoSave: () => set({ autoSaveEnabled: true }),
    disableAutoSave: () => set({ autoSaveEnabled: false }),

    // Sheet actions
    setSheets: (sheets) => set({ sheets }),
    setActiveSheetId: (activeSheetId) => set({ activeSheetId }),
    
    addSheet: (sheet) => set((state) => ({ 
      sheets: [...state.sheets, sheet] 
    })),
    
    updateSheet: (sheetId, updates) => set((state) => ({
      sheets: state.sheets.map(sheet =>
        sheet.id === sheetId ? { ...sheet, ...updates } : sheet
      )
    })),
    
    deleteSheet: (sheetId) => set((state) => {
      // Prevent deletion of main sheets
      const isMainSheet = sheetId === 'main' || sheetId.endsWith('_main')
      if (state.sheets.length <= 1 || isMainSheet) {
        return state
      }
      
      const remainingSheets = state.sheets.filter(sheet => sheet.id !== sheetId)
      const newActiveSheetId = sheetId === state.activeSheetId 
        ? remainingSheets[0]?.id || 'main'
        : state.activeSheetId
      
      return {
        sheets: remainingSheets,
        activeSheetId: newActiveSheetId
      }
    }),
    
    renameSheet: (sheetId, newName) => set((state) => ({
      sheets: state.sheets.map(sheet =>
        sheet.id === sheetId ? { ...sheet, name: newName } : sheet
      ),
      isDirty: true
    })),

    getParentSheetId: (sheetId: string) => {
      const state = get()
      const parentSheet = getParentSheet(state.sheets, sheetId)
      return parentSheet?.id || null
    },

    // Block and wire actions
    setBlocks: (blocks) => set({ blocks }),
    setWires: (wires) => set({ wires }),
    
    addBlock: (block) => set((state) => ({ 
      blocks: [...state.blocks, block],
      isDirty: true 
    })),

    updateBlock: (blockId, updates) => set((state) => ({
      blocks: state.blocks.map(block =>
        block.id === blockId ? { ...block, ...updates } : block
      ),
      isDirty: true
    })),

    // Feature 4: Batch update multiple blocks at once (for multi-block move)
    updateBlocks: (updates) => set((state) => {
      const updateMap = new Map(updates.map(u => [u.id, u.updates]))
      return {
        blocks: state.blocks.map(block => {
          const blockUpdates = updateMap.get(block.id)
          return blockUpdates ? { ...block, ...blockUpdates } : block
        }),
        isDirty: true
      }
    }),

    deleteBlock: (blockId) => set((state) => ({
      blocks: state.blocks.filter(block => block.id !== blockId),
      wires: state.wires.filter(wire => 
        wire.sourceBlockId !== blockId && wire.targetBlockId !== blockId
      ),
      isDirty: true
    })),

    addWire: (wire) => set((state) => ({ 
      wires: [...state.wires, wire],
      isDirty: true 
    })),

    deleteWire: (wireId) => set((state) => ({
      wires: state.wires.filter(wire => wire.id !== wireId),
      isDirty: true
    })),

    updateWireRouting: (wireId, routing) => set((state) => ({
      wires: state.wires.map(wire =>
        wire.id === wireId
          ? { ...wire, routing }
          : wire
      ),
      isDirty: true
    })),

    // Feature 7: Block name validation
    validateBlockName: (name: string, excludeBlockId?: string) => {
      const state = get()

      // Check if name is empty
      if (!name || !name.trim()) {
        return { valid: false, error: 'Block name cannot be empty' }
      }

      // Check if name is valid identifier
      const identifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/
      if (!identifierRegex.test(name)) {
        return {
          valid: false,
          error: 'Block name must be a valid identifier (alphanumeric + underscore, start with letter or underscore)'
        }
      }

      // Check uniqueness among blocks on the current sheet (excluding the block being renamed)
      const nameExists = state.blocks.some(
        block => block.name === name && block.id !== excludeBlockId
      )
      if (nameExists) {
        return { valid: false, error: `Block name "${name}" already exists on this sheet` }
      }

      // Check against parameter names (only for top-level sheets)
      // Get current sheet to check if it's top-level
      const currentSheet = state.sheets.find(s => s.id === state.activeSheetId)
      const isTopLevel = currentSheet && !state.sheets.some(
        sheet => sheet.blocks?.some(
          b => b.type === 'subsystem' && b.parameters?.sheets?.some((ss: Sheet) => ss.id === state.activeSheetId)
        )
      )

      if (isTopLevel) {
        const paramConflict = state.parameters.some(param => param.name === name)
        if (paramConflict) {
          return { valid: false, error: `Block name "${name}" conflicts with a model parameter` }
        }
      }

      return { valid: true }
    },

    // Feature 7: Block rename with reference updates
    renameBlock: (blockId: string, newName: string) => {
      const state = get()
      const block = state.blocks.find(b => b.id === blockId)

      if (!block) {
        return { success: false, error: 'Block not found' }
      }

      // Validate the new name
      const validation = get().validateBlockName(newName, blockId)
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      // Update the block name
      set((state) => {
        const newBlocks = state.blocks.map(b =>
          b.id === blockId ? { ...b, name: newName } : b
        )
        return {
          blocks: newBlocks,
          isDirty: true
        }
      })

      return { success: true }
    },

    // Parameter actions (Feature 1)
    addParameter: (param) => set((state) => {
      // Validate before adding
      const validation = get().validateParameterName(param.name)
      if (!validation.valid) {
        console.error(`Cannot add parameter: ${validation.error}`)
        return state // Return unchanged state
      }
      return {
        parameters: [...state.parameters, param],
        isDirty: true
      }
    }),

    updateParameter: (name, updates) => set((state) => {
      // If name is being updated, validate the new name
      if (updates.name && updates.name !== name) {
        const validation = get().validateParameterName(updates.name, name)
        if (!validation.valid) {
          console.error(`Cannot update parameter: ${validation.error}`)
          return state // Return unchanged state
        }
      }

      return {
        parameters: state.parameters.map(param =>
          param.name === name ? { ...param, ...updates } : param
        ),
        isDirty: true
      }
    }),

    deleteParameter: (name) => set((state) => ({
      parameters: state.parameters.filter(param => param.name !== name),
      isDirty: true
    })),

    getParameter: (name) => {
      const state = get()
      return state.parameters.find(param => param.name === name)
    },

    validateParameterName: (name, excludeName) => {
      const state = get()

      // Check if name is empty
      if (!name || name.trim() === '') {
        return { valid: false, error: 'Parameter name cannot be empty' }
      }

      // Check if name is valid identifier
      const identifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/
      if (!identifierRegex.test(name)) {
        return {
          valid: false,
          error: 'Parameter name must be a valid identifier (alphanumeric + underscore, start with letter or underscore)'
        }
      }

      // Check uniqueness among parameters (excluding the parameter being updated)
      const exists = state.parameters.some(
        param => param.name === name && param.name !== excludeName
      )
      if (exists) {
        return { valid: false, error: `Parameter name "${name}" already exists` }
      }

      // Check against top-level block names (only check blocks on top-level sheets)
      for (const sheet of state.sheets) {
        for (const block of sheet.blocks) {
          if (block.name === name) {
            return {
              valid: false,
              error: `Parameter name "${name}" conflicts with a block name`
            }
          }
        }
      }

      return { valid: true }
    },

    // Selection actions
    setSelectedBlockId: (selectedBlockId) => set({
      selectedBlockId,
      // Keep selectedBlockIds in sync for backward compatibility
      selectedBlockIds: selectedBlockId ? [selectedBlockId] : []
    }),
    setSelectedWireId: (selectedWireId) => set({ selectedWireId }),
    setConfigBlock: (configBlock) => set({ configBlock }),
    setResizingBlockId: (resizingBlockId) => set({ resizingBlockId }),
    requestFocus: (target) => set((state) => ({
      focusRequest: {
        blockId: target.blockId,
        wireId: target.wireId,
        sheetId: target.sheetId,
        nonce: (state.focusRequest?.nonce ?? 0) + 1,
      },
    })),

    // Feature 4: Multi-selection actions
    setSelectedBlocks: (blockIds: string[]) => {
      const state = get()
      // Find connections between selected blocks
      const selectedWireIds = state.wires
        .filter(wire =>
          blockIds.includes(wire.sourceBlockId) &&
          blockIds.includes(wire.targetBlockId)
        )
        .map(wire => wire.id)

      set({
        selectedBlockIds: blockIds,
        selectedBlockId: blockIds.length === 1 ? blockIds[0] : null,
        selectedWireIds
      })
    },

    addToSelection: (blockIds: string[]) => {
      const state = get()
      const newSelection = [...new Set([...state.selectedBlockIds, ...blockIds])]

      // Find connections between selected blocks
      const selectedWireIds = state.wires
        .filter(wire =>
          newSelection.includes(wire.sourceBlockId) &&
          newSelection.includes(wire.targetBlockId)
        )
        .map(wire => wire.id)

      set({
        selectedBlockIds: newSelection,
        selectedBlockId: newSelection.length === 1 ? newSelection[0] : null,
        selectedWireIds
      })
    },

    removeFromSelection: (blockIds: string[]) => {
      const state = get()
      const newSelection = state.selectedBlockIds.filter(id => !blockIds.includes(id))

      // Find connections between selected blocks
      const selectedWireIds = state.wires
        .filter(wire =>
          newSelection.includes(wire.sourceBlockId) &&
          newSelection.includes(wire.targetBlockId)
        )
        .map(wire => wire.id)

      set({
        selectedBlockIds: newSelection,
        selectedBlockId: newSelection.length === 1 ? newSelection[0] : null,
        selectedWireIds
      })
    },

    clearSelection: () => set({
      selectedBlockIds: [],
      selectedBlockId: null,
      selectedWireIds: [],
      selectedWireId: null
    }),

    toggleBlockSelection: (blockId: string) => {
      const state = get()
      const isSelected = state.selectedBlockIds.includes(blockId)

      if (isSelected) {
        get().removeFromSelection([blockId])
      } else {
        get().addToSelection([blockId])
      }
    },

    getSelectedBlocks: () => {
      const state = get()
      return state.blocks.filter(block => state.selectedBlockIds.includes(block.id))
    },

    getSelectedWires: () => {
      const state = get()
      return state.wires.filter(wire => state.selectedWireIds.includes(wire.id))
    },

    getConnectionsBetweenBlocks: (blockIds: string[]) => {
      const state = get()
      return state.wires.filter(wire =>
        blockIds.includes(wire.sourceBlockId) &&
        blockIds.includes(wire.targetBlockId)
      )
    },

    // Feature 5: Clipboard actions
    copySelection: () => {
      const state = get()
      const selectedBlocks = state.blocks.filter(b => state.selectedBlockIds.includes(b.id))

      if (selectedBlocks.length === 0) {
        return null
      }

      // Get wires between selected blocks
      const selectedBlockIdSet = new Set(state.selectedBlockIds)
      const selectedWires = state.wires.filter(
        w => selectedBlockIdSet.has(w.sourceBlockId) && selectedBlockIdSet.has(w.targetBlockId)
      )

      // Find parameter dependencies
      const referencedParamNames = new Set<string>()

      for (const block of selectedBlocks) {
        // Check Source blocks with parameter references
        if (block.type === 'source' && block.parameters?.useParameter && block.parameters?.parameterName) {
          referencedParamNames.add(block.parameters.parameterName)
        }

        // Check Evaluate blocks for parameter names in expressions
        if (block.type === 'evaluate' && block.parameters?.expression) {
          // Simple regex to find identifiers that might be parameters
          const expression = block.parameters.expression as string
          const identifierRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g
          let match
          while ((match = identifierRegex.exec(expression)) !== null) {
            const name = match[1]
            // Exclude common keywords and functions
            const reserved = ['in', 'sin', 'cos', 'tan', 'sqrt', 'abs', 'pow', 'exp', 'log', 'floor', 'ceil', 'fabs', 'fmod']
            if (!reserved.includes(name) && !name.startsWith('in')) {
              // Check if it's an actual parameter
              if (state.parameters.some(p => p.name === name)) {
                referencedParamNames.add(name)
              }
            }
          }
        }
      }

      const referencedParameters = state.parameters.filter(p => referencedParamNames.has(p.name))

      // Find subsystem sheet dependencies
      const subsystemSheets: Sheet[] = []
      for (const block of selectedBlocks) {
        if (block.type === 'subsystem' && block.parameters?.sheets) {
          subsystemSheets.push(...(block.parameters.sheets as Sheet[]))
        }
      }

      // Create clipboard data
      const clipboardData: ClipboardData = {
        version: '1.0',
        sourceModelId: state.model?.id,
        sourceSheetId: state.activeSheetId,
        timestamp: Date.now(),
        blocks: JSON.parse(JSON.stringify(selectedBlocks)), // Deep clone
        wires: JSON.parse(JSON.stringify(selectedWires)),   // Deep clone
        dependencies: {
          parameters: referencedParameters,
          subsystemSheets: subsystemSheets.length > 0 ? subsystemSheets : undefined,
        },
      }

      // Store in state and localStorage for cross-tab support
      set({ clipboardData })
      try {
        localStorage.setItem(CLIPBOARD_STORAGE_KEY, serializeClipboard(clipboardData))
      } catch (e) {
        console.warn('Failed to save clipboard to localStorage:', e)
      }

      return clipboardData
    },

    cutSelection: () => {
      const state = get()
      const clipboardData = get().copySelection()

      if (!clipboardData) {
        return null
      }

      // Delete selected blocks (this will also delete connected wires via deleteBlock)
      const selectedIds = [...state.selectedBlockIds]
      for (const blockId of selectedIds) {
        get().deleteBlock(blockId)
      }

      // Clear selection
      get().clearSelection()

      return clipboardData
    },

    checkClipboardDependencies: (clipboardData?: ClipboardData): DependencyCheckResult => {
      const state = get()
      const data = clipboardData || state.clipboardData || get().getClipboardData()

      if (!data) {
        return {
          missingParameters: [],
          missingSubsystems: [],
          allSatisfied: true,
        }
      }

      // Check for missing parameters
      const currentParamNames = new Set(state.parameters.map(p => p.name))
      const missingParameters = data.dependencies.parameters.filter(
        p => !currentParamNames.has(p.name)
      )

      // Check for missing subsystem sheets (if pasting subsystems)
      const missingSubsystems: string[] = []
      // Subsystems are self-contained in clipboard, so they don't need to be checked
      // against existing sheets

      return {
        missingParameters,
        missingSubsystems,
        allSatisfied: missingParameters.length === 0 && missingSubsystems.length === 0,
      }
    },

    getClipboardData: (): ClipboardData | null => {
      const state = get()

      // First check local state
      if (state.clipboardData) {
        return state.clipboardData
      }

      // Then check localStorage for cross-tab clipboard
      try {
        const stored = localStorage.getItem(CLIPBOARD_STORAGE_KEY)
        if (stored) {
          const data = deserializeClipboard(stored)
          if (data) {
            // Update local state with loaded clipboard
            set({ clipboardData: data })
            return data
          }
        }
      } catch (e) {
        console.warn('Failed to load clipboard from localStorage:', e)
      }

      return null
    },

    importMissingDependencies: (clipboardData: ClipboardData) => {
      const state = get()

      // Import missing parameters
      const currentParamNames = new Set(state.parameters.map(p => p.name))
      for (const param of clipboardData.dependencies.parameters) {
        if (!currentParamNames.has(param.name)) {
          get().addParameter(param)
        }
      }
    },

    pasteFromClipboard: (options?: PasteOptions): PasteResult => {
      const state = get()
      const clipboardData = state.clipboardData || get().getClipboardData()

      if (!clipboardData || clipboardData.blocks.length === 0) {
        return {
          success: false,
          pastedBlockIds: [],
          pastedWireIds: [],
          error: 'Clipboard is empty',
        }
      }

      // Check dependencies
      const depCheck = get().checkClipboardDependencies(clipboardData)
      if (!depCheck.allSatisfied) {
        // If auto-import is enabled, import missing dependencies
        if (options?.importMissingParameters) {
          get().importMissingDependencies(clipboardData)
        } else {
          return {
            success: false,
            pastedBlockIds: [],
            pastedWireIds: [],
            error: 'Missing dependencies',
            dependencyIssues: depCheck,
          }
        }
      }

      // Calculate position offset
      const offset = options?.offset || { x: 20, y: 20 }

      // If pasting on same sheet, use offset; otherwise use position or default
      const isSameSheet = clipboardData.sourceSheetId === state.activeSheetId
      let baseOffset = offset

      if (options?.position) {
        // Calculate offset from clipboard block centroid to target position
        const blocks = clipboardData.blocks
        const centerX = blocks.reduce((sum, b) => sum + b.position.x, 0) / blocks.length
        const centerY = blocks.reduce((sum, b) => sum + b.position.y, 0) / blocks.length
        baseOffset = {
          x: options.position.x - centerX,
          y: options.position.y - centerY,
        }
      } else if (isSameSheet) {
        // Default offset for same-sheet paste
        baseOffset = { x: 20, y: 20 }
      }

      // Deep-remap ids (including nested subsystem sheets) and uniquify names
      // against the entire destination model so paste never collides with
      // existing React keys / flatten ids.
      const existingIds = collectIdsFromSheets(state.sheets)
      // Current canvas may be ahead of sheets[] until saveCurrentSheetData —
      // include live blocks/wires too.
      for (const b of state.blocks) existingIds.add(b.id)
      for (const w of state.wires) existingIds.add(w.id)
      const nestedFromLive = collectIdsFromSheets([
        {
          id: state.activeSheetId || 'active',
          name: 'active',
          blocks: state.blocks,
          connections: state.wires,
          extents: { width: 0, height: 0 },
        },
      ])
      for (const id of nestedFromLive) existingIds.add(id)

      const { blocks: newBlocks, wires: newWires } = remapClipboardSelection({
        blocks: clipboardData.blocks,
        wires: clipboardData.wires,
        existingIds,
        existingNames: collectNamesFromBlocks(state.blocks),
        positionOffset: baseOffset,
      })

      // Add blocks and wires to current sheet
      for (const block of newBlocks) {
        get().addBlock(block)
      }
      for (const wire of newWires) {
        get().addWire(wire)
      }

      // Select newly pasted blocks
      get().setSelectedBlocks(newBlocks.map(b => b.id))

      return {
        success: true,
        pastedBlockIds: newBlocks.map(b => b.id),
        pastedWireIds: newWires.map(w => w.id),
      }
    },

    // Simulation actions
    setSimulationResults: (simulationResults) => set({ simulationResults }),
    setIsSimulating: (isSimulating) => set({ isSimulating }),
    setSimulationEngine: (simulationEngine: any) => set({ simulationEngine }),
    setOutputPortValues: (outputPortValues) => set({ outputPortValues }),

    // Composite actions
    // In modelStore.ts, update the switchToSheet function:

  switchToSheet: (sheetId: string) => {
    const { saveCurrentSheetData, sheets, globalSimulationResults } = get()
    
    // Save current sheet data first
    saveCurrentSheetData()

    // Find sheet at any level (including in subsystems)
    const findSheetRecursively = (searchSheets: Sheet[]): Sheet | null => {
      for (const sheet of searchSheets) {
        if (sheet.id === sheetId) return sheet
        
        // Search in subsystem blocks
        for (const block of sheet.blocks) {
          if (block.type === 'subsystem' && block.parameters?.sheets) {
            const found = findSheetRecursively(block.parameters.sheets)
            if (found) return found
          }
        }
      }
      return null
    }
    
    const sheet = findSheetRecursively(sheets)
    
    if (sheet) {
      // Get simulation results if available
      const sheetResults = globalSimulationResults?.get(sheetId) || null
      
      set({
        activeSheetId: sheetId,
        blocks: sheet.blocks || [],
        wires: sheet.connections || [],
        selectedBlockId: null,
        selectedWireId: null,
        currentSheetSimulationResults: sheetResults
      })
    }
  },

    setGlobalSimulationResults: (results: Map<string, SimulationResults>) => {
      const { activeSheetId } = get()
      const currentSheetResults = results.get(activeSheetId) || null
      
      set({
        globalSimulationResults: results,
        currentSheetSimulationResults: currentSheetResults,
        simulationResults: currentSheetResults  // Keep for backward compatibility
      })
    },

    clearGlobalSimulationResults: () => {
      set({
        globalSimulationResults: null,
        currentSheetSimulationResults: null,
        simulationResults: null,
        simulationEngine: null
      })
    },
    
    clearSimulationResults: () => {
      set({
        globalSimulationResults: null,
        currentSheetSimulationResults: null,
        simulationResults: null,
        simulationEngine: null
      })
    },
    
    updateCurrentSheet: (updates) => {
      const state = get()
      const updatedSheets = state.sheets.map(sheet =>
        sheet.id === state.activeSheetId
          ? { ...sheet, ...updates }
          : sheet
      )
      
      set({ sheets: updatedSheets })
    },
    

    saveCurrentSheetData: () => {
      const state = get()

      // Helper to recursively update a specific sheet and sync subsystem ports
      const updateSheetRecursively = (sheets: Sheet[]): Sheet[] => {
        return sheets.map(sheet => {
          if (sheet.id === state.activeSheetId) {
            // This is the sheet we're updating
            return {
              ...sheet,
              blocks: state.blocks,
              connections: state.wires
            }
          }

          // Check subsystem blocks
          const updatedBlocks = sheet.blocks.map(block => {
            if (block.type === 'subsystem' && block.parameters?.sheets) {
              // Recursively update sheets in subsystem
              const updatedSubsheets = updateSheetRecursively(block.parameters.sheets)

              // Check if any sheet was actually updated
              const wasUpdated = updatedSubsheets !== block.parameters.sheets

              if (wasUpdated) {
                // Create an updated block with the new sheets
                const updatedBlock = {
                  ...block,
                  parameters: {
                    ...block.parameters,
                    sheets: updatedSubsheets
                  }
                }
                // Sync the subsystem's inputPorts/outputPorts based on the updated sheets
                syncSubsystemPortsFromSheets(updatedBlock)
                return updatedBlock
              }
            }
            return block
          })

          // Return sheet with potentially updated blocks
          const blocksChanged = updatedBlocks !== sheet.blocks
          return blocksChanged ? { ...sheet, blocks: updatedBlocks } : sheet
        })
      }

      const updatedSheets = updateSheetRecursively(state.sheets)
      set({ sheets: updatedSheets })
    },

    updateSubsystemSheets: (subsystemId: string, sheets: Sheet[]) => set((state) => {
      // Helper function to recursively update subsystem sheets
      function updateSheetsInHierarchy(currentSheets: Sheet[]): Sheet[] {
        return currentSheets.map(sheet => {
          const updatedBlocks = sheet.blocks.map(block => {
            // Found the target subsystem
            if (block.id === subsystemId && block.type === 'subsystem') {
              return {
                ...block,
                parameters: {
                  ...block.parameters,
                  sheets: sheets
                }
              }
            }
            
            // Recursively check nested subsystems
            if (block.type === 'subsystem' && block.parameters?.sheets) {
              return {
                ...block,
                parameters: {
                  ...block.parameters,
                  sheets: updateSheetsInHierarchy(block.parameters.sheets)
                }
              }
            }
            
            return block
          })
          
          return { ...sheet, blocks: updatedBlocks }
        })
      }
      
      return {
        sheets: updateSheetsInHierarchy(state.sheets)
      }
    }),

    setIsDirty: (isDirty) => set({ isDirty }),

    markAsClean: () => {
      const state = get()
      // Create a hash of the current model state
      const currentStateHash = createModelHash(state.sheets)
      set({ 
        isDirty: false,
        lastSavedHash: currentStateHash 
      })
    },

    checkIfDirty: () => {
      const state = get()
      if (!state.lastSavedHash) return state.isDirty
      
      const currentStateHash = createModelHash(state.sheets)
      const isDirty = currentStateHash !== state.lastSavedHash
      
      // Update the isDirty flag if it's different
      if (isDirty !== state.isDirty) {
        set({ isDirty })
      }
      
      return isDirty
    },
    
    initializeFromModel: (model, versionData) => {
      if (versionData?.data?.sheets) {
        // Convert flat sheet structure to hierarchical structure
        const hierarchicalData = migrateToHierarchicalSheets(versionData.data)
        const sheets = hierarchicalData.sheets

        // Data integrity check - model must have at least one sheet
        if (sheets.length === 0) {
          set({
            error: 'Invalid model: No sheets found. Models must contain at least one sheet.',
            modelLoading: false
          })
          return
        }

        const firstSheetId = sheets[0].id
        const firstSheet = sheets[0]

        // Feature 1: Load parameters from model data (defaults to empty array for backward compatibility)
        const parameters = versionData.data.parameters || []

        set({
          model,
          currentVersion: versionData.version,
          isOlderVersion: versionData.version < model.latest_version,
          sheets,
          activeSheetId: firstSheetId,
          parameters,  // Feature 1: Load parameters
          blocks: firstSheet?.blocks || [],
          wires: firstSheet?.connections || [],
          selectedBlockId: null,
          selectedWireId: null,
          simulationResults: null,
          error: null,
          modelLoading: false
        })

        get().markAsClean()
        
      } else {
        set({
          error: 'Invalid model: No sheet data found.',
          modelLoading: false
        })
      }
    }
  }))
)

function createModelHash(sheets: Sheet[]): string {
  // Create a deterministic string representation of the model
  const modelString = JSON.stringify({
    sheets: sheets.map(sheet => ({
      id: sheet.id,
      name: sheet.name,
      blocks: sheet.blocks.map(block => ({
        id: block.id,
        type: block.type,
        name: block.name,
        position: block.position,
        parameters: block.parameters
      })),
      connections: sheet.connections
    }))
  })
  
  // Simple hash function (TODO: use a proper hash library for better performance)
  let hash = 0
  for (let i = 0; i < modelString.length; i++) {
    const char = modelString.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash.toString(36)
}

function getParentSheet(sheets: Sheet[], targetSheetId: string): Sheet | null {
  for (const sheet of sheets) {
    // Check if any subsystem in this sheet contains the target sheet
    for (const block of sheet.blocks) {
      if (block.type === 'subsystem' && block.parameters?.sheets) {
        // Check if target sheet is directly in this subsystem
        const hasTargetSheet = block.parameters.sheets.some((s: Sheet) => s.id === targetSheetId)
        if (hasTargetSheet) {
          return sheet
        }
        
        // Recursively check nested subsystems
        const parentInNested = getParentSheet(block.parameters.sheets, targetSheetId)
        if (parentInNested) {
          return parentInNested
        }
      }
    }
  }
  return null
}

// Helper function to recursively update a sheet within subsystems
function updateSubsystemSheetData(
  sheets: Sheet[],
  targetSheetId: string,
  updates: { blocks: BlockData[], connections: WireData[] }
): Sheet[] | null {
  for (const sheet of sheets) {
    for (const block of sheet.blocks) {
      if (block.type === 'subsystem' && block.parameters?.sheets) {
        const subsystemSheets = block.parameters.sheets as Sheet[]
        
        // Check if the target sheet is directly in this subsystem
        const targetIndex = subsystemSheets.findIndex(s => s.id === targetSheetId)
        if (targetIndex !== -1) {
          // Found it! Update the sheet
          const updatedSubsystemSheets = [...subsystemSheets]
          updatedSubsystemSheets[targetIndex] = {
            ...updatedSubsystemSheets[targetIndex],
            blocks: updates.blocks,
            connections: updates.connections
          }
          
          // Update the subsystem block
          const updatedBlock = {
            ...block,
            parameters: {
              ...block.parameters,
              sheets: updatedSubsystemSheets
            }
          }
          
          // Update the parent sheet
          const updatedBlocks = sheet.blocks.map(b => 
            b.id === block.id ? updatedBlock : b
          )
          
          // Return updated sheets
          return sheets.map(s => 
            s.id === sheet.id 
              ? { ...s, blocks: updatedBlocks }
              : s
          )
        }
        
        // Try recursive search in nested subsystems
        const nestedResult = updateSubsystemSheetData(subsystemSheets, targetSheetId, updates)
        if (nestedResult) {
          // Update this subsystem with the nested changes
          const updatedBlock = {
            ...block,
            parameters: {
              ...block.parameters,
              sheets: nestedResult
            }
          }
          
          const updatedBlocks = sheet.blocks.map(b => 
            b.id === block.id ? updatedBlock : b
          )
          
          return sheets.map(s => 
            s.id === sheet.id 
              ? { ...s, blocks: updatedBlocks }
              : s
          )
        }
      }
    }
  }
  
  return null
}

function findSheetInSubsystems(sheets: Sheet[], sheetId: string): Sheet | null {
  for (const sheet of sheets) {
    for (const block of sheet.blocks) {
      if (block.type === 'subsystem' && block.parameters?.sheets) {
        const found = block.parameters.sheets.find((s: Sheet) => s.id === sheetId)  // Added type annotation
        if (found) return found
        
        // Recursive search in nested subsystems
        const nested = findSheetInSubsystems(block.parameters.sheets, sheetId)
        if (nested) return nested
      }
    }
  }
  return null
}

/**
 * Normalize connections to ensure they have port indices (sourcePortIndex/targetPortIndex).
 *
 * This handles the case where connections were created via the API with port names,
 * converting them to indices. Port names are stripped from the data model as they
 * can be derived from block metadata when needed.
 */
function normalizeConnections(sheet: Sheet): void {
  if (!sheet.connections || !sheet.blocks) return

  const blockMap = new Map(sheet.blocks.map(b => [b.id, b]))

  for (const conn of sheet.connections) {
    const sourceBlock = blockMap.get(conn.sourceBlockId)
    const targetBlock = blockMap.get(conn.targetBlockId)

    // Convert port names to indices if provided (API compatibility)
    const connAny = conn as any
    if (conn.sourcePortIndex === undefined && connAny.sourcePort && sourceBlock?.outputs) {
      conn.sourcePortIndex = sourceBlock.outputs.indexOf(connAny.sourcePort)
    }
    if (conn.targetPortIndex === undefined && connAny.targetPort && targetBlock?.inputs) {
      conn.targetPortIndex = targetBlock.inputs.indexOf(connAny.targetPort)
    }

    // Remove port name fields if present (clean up redundant data)
    delete connAny.sourcePort
    delete connAny.targetPort
  }
}

/**
 * Recursively normalize connections in all sheets, including subsystem embedded sheets.
 */
function normalizeAllConnections(sheets: Sheet[]): void {
  for (const sheet of sheets) {
    normalizeConnections(sheet)

    // Also normalize connections in subsystem embedded sheets
    for (const block of sheet.blocks) {
      if (block.type === 'subsystem' && block.parameters?.sheets) {
        normalizeAllConnections(block.parameters.sheets)
      }
    }
  }
}

// Migration function to convert old format to new
export function migrateToHierarchicalSheets(modelData: any) {
  // If already hierarchical (v2.0+), normalize connections and return
  // V2.x models already have subsystem sheets nested inside subsystem block parameters
  if (modelData.version && modelData.version.startsWith("2.")) {
    // Still need to normalize connections for models created via API
    if (modelData.sheets) {
      normalizeAllConnections(modelData.sheets)
    }
    return modelData
  }
  
  const rootSheets: Sheet[] = []
  const subsystemSheets = new Map<string, Sheet[]>()
  
  // First pass: collect all sheets
  for (const sheet of modelData.sheets) {
    // Check if this sheet belongs to a subsystem (by naming convention)
    const subsystemMatch = sheet.id.match(/^(.+)_main$/)
    if (subsystemMatch) {
      const subsystemId = subsystemMatch[1]
      if (!subsystemSheets.has(subsystemId)) {
        subsystemSheets.set(subsystemId, [])
      }
      subsystemSheets.get(subsystemId)!.push(sheet)
    } else if (!sheet.id.includes('subsystem_')) {
      // Root level sheet
      rootSheets.push(sheet)
    }
  }

  function attachSubsystemSheets(sheets: Sheet[]) {
    for (const sheet of sheets) {
      for (const block of sheet.blocks) {
        if (block.type === 'subsystem') {
          const subsystemId = block.id
          const subsystemOwnSheets = subsystemSheets.get(subsystemId) || []
          
          // Update subsystem block parameters
          block.parameters = {
            ...block.parameters,
            sheets: subsystemOwnSheets,
            // Remove old properties
            sheetId: undefined,
            sheetName: undefined
          }
          
          // Recursively process nested subsystems
          if (subsystemOwnSheets.length > 0) {
            attachSubsystemSheets(subsystemOwnSheets)
          }
        }
      }
    }
  }

  attachSubsystemSheets(rootSheets)

  // Normalize connections for v1 models as well
  normalizeAllConnections(rootSheets)

  return {
    ...modelData,
    version: "2.0",
    sheets: rootSheets
  }
}


// Selector hooks for commonly used derived state
export const useCurrentSheet = () => useModelStore((state: ModelStore) => {
  if (state.sheets.length === 0) return undefined
  return state.sheets.find((sheet: Sheet) => sheet.id === state.activeSheetId) || undefined
})

export const useHasUnsavedChanges = () => useModelStore((state: ModelStore) => {
  if (state.sheets.length === 0) return false
  
  const currentSheet = state.sheets.find((sheet: Sheet) => sheet.id === state.activeSheetId)
  if (!currentSheet) return false
  
  // Compare current blocks/wires with saved sheet data
  const hasBlockChanges = JSON.stringify(state.blocks) !== JSON.stringify(currentSheet.blocks)
  const hasWireChanges = JSON.stringify(state.wires) !== JSON.stringify(currentSheet.connections)
  
  return hasBlockChanges || hasWireChanges
})

export const useSimulationStatus = () => useModelStore((state: ModelStore) => ({
  isSimulating: state.isSimulating,
  hasResults: state.simulationResults !== null,
  outputPortValues: state.outputPortValues
}))
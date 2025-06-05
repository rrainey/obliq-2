import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { BlockData } from '@/components/Block'
import { WireData } from '@/components/Wire'
import { SimulationResults, SimulationEngine } from '@/lib/simulationEngine'
import { Model, ModelVersion } from '@/lib/types'
import { supabase } from '@/lib/supabaseClient'

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
  
  // Current sheet content
  blocks: BlockData[]
  wires: WireData[]
  
  // UI state
  selectedBlockId: string | null
  selectedWireId: string | null
  configBlock: BlockData | null
  
  // Simulation state
  globalSimulationResults: Map<string, SimulationResults> | null
  currentSheetSimulationResults: SimulationResults | null 
  simulationResults: SimulationResults | null
  isSimulating: boolean
  simulationEngine: SimulationEngine | null
  outputPortValues: Map<string, number | number[] | boolean | boolean[]> | null
  
  // Loading states
  modelLoading: boolean
  saving: boolean
  error: string | null
  
  // Auto-save state
  autoSaveEnabled: boolean
  lastAutoSave: string | null
}

export interface ModelActions {
  // Model actions
  setModel: (model: Model | null) => void
  setCurrentVersion: (version: number) => void
  setIsOlderVersion: (isOlder: boolean) => void
  setError: (error: string | null) => void
  setModelLoading: (loading: boolean) => void
  saveModel: () => Promise<boolean>
  saveAsNewModel: (newName: string) => Promise<string | null>
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
  
  // Block and wire actions
  setBlocks: (blocks: BlockData[]) => void
  setWires: (wires: WireData[]) => void
  addBlock: (block: BlockData) => void
  updateBlock: (blockId: string, updates: Partial<BlockData>) => void
  deleteBlock: (blockId: string) => void
  addWire: (wire: WireData) => void
  deleteWire: (wireId: string) => void
  
  // Selection actions
  setSelectedBlockId: (blockId: string | null) => void
  setSelectedWireId: (wireId: string | null) => void
  setConfigBlock: (block: BlockData | null) => void
  
  // Simulation actions
  setSimulationResults: (results: SimulationResults | null) => void
  setIsSimulating: (simulating: boolean) => void
  setSimulationEngine: (engine: SimulationEngine | null) => void
  setOutputPortValues: (values: Map<string, number> | null) => void
  setGlobalSimulationResults: (results: Map<string, SimulationResults>) => void
  clearGlobalSimulationResults: () => void
  
  // Composite actions
  switchToSheet: (sheetId: string) => void
  updateCurrentSheet: (updates: Partial<Sheet>) => void
  initializeFromModel: (model: Model, versionData: ModelVersion) => void
  saveCurrentSheetData: () => void
}

export type ModelStore = ModelState & ModelActions

export const useModelStore = create<ModelStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    model: null,
    currentVersion: 1,
    isOlderVersion: false,
    sheets: [],
    activeSheetId: 'main',
    blocks: [],
    wires: [],
    selectedBlockId: null,
    selectedWireId: null,
    configBlock: null,
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

    // Model actions
    setModel: (model) => set({ model }),
    setCurrentVersion: (currentVersion) => set({ currentVersion }),
    setIsOlderVersion: (isOlderVersion) => set({ isOlderVersion }),
    setError: (error) => set({ error }),
    setModelLoading: (modelLoading) => set({ modelLoading }),
    
    saveModel: async () => {
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
        
        // Get the updated model with current sheet data
        const updatedState = get()
        
        if (!updatedState.model) {
          set({ error: 'Model was lost during save preparation', saving: false })
          return false
        }
        
        const modelData = {
          version: "1.0",
          metadata: {
            created: updatedState.model.created_at,
            description: `Model ${updatedState.model.name}`
          },
          sheets: updatedState.sheets,
          globalSettings: {
            simulationTimeStep: 0.01,
            simulationDuration: 10.0
          }
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

    saveAsNewModel: async (newName: string) => {
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
          version: "1.0",
          metadata: {
            created: new Date().toISOString(),
            description: `Model ${newName}`
          },
          sheets: updatedState.sheets,
          globalSettings: {
            simulationTimeStep: 0.01,
            simulationDuration: 10.0
          }
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
        get().saveCurrentSheetData()
        
        const updatedState = get()
        if (!updatedState.model) {
          console.error('Model was lost during auto-save preparation')
          return false
        }
        
        const modelData = {
          version: "1.0",
          metadata: {
            created: updatedState.model.created_at,
            description: `Model ${updatedState.model.name} (auto-save)`
          },
          sheets: updatedState.sheets,
          globalSettings: {
            simulationTimeStep: 0.01,
            simulationDuration: 10.0
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
        return true

      } catch (error) {
        console.error('Auto-save error:', error)
        return false
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
      )
    })),

    // Block and wire actions
    setBlocks: (blocks) => set({ blocks }),
    setWires: (wires) => set({ wires }),
    
    addBlock: (block) => set((state) => ({ 
      blocks: [...state.blocks, block] 
    })),
    
    updateBlock: (blockId, updates) => set((state) => ({
      blocks: state.blocks.map(block =>
        block.id === blockId ? { ...block, ...updates } : block
      )
    })),
    
    deleteBlock: (blockId) => set((state) => ({
      blocks: state.blocks.filter(block => block.id !== blockId),
      // Also remove any wires connected to this block
      wires: state.wires.filter(wire => 
        wire.sourceBlockId !== blockId && wire.targetBlockId !== blockId
      )
    })),
    
    addWire: (wire) => set((state) => ({ 
      wires: [...state.wires, wire] 
    })),
    
    deleteWire: (wireId) => set((state) => ({
      wires: state.wires.filter(wire => wire.id !== wireId)
    })),

    // Selection actions
    setSelectedBlockId: (selectedBlockId) => set({ selectedBlockId }),
    setSelectedWireId: (selectedWireId) => set({ selectedWireId }),
    setConfigBlock: (configBlock) => set({ configBlock }),

    // Simulation actions
    setSimulationResults: (simulationResults) => set({ simulationResults }),
    setIsSimulating: (isSimulating) => set({ isSimulating }),
    setSimulationEngine: (simulationEngine) => set({ simulationEngine }),
    setOutputPortValues: (outputPortValues) => set({ outputPortValues }),

    // Composite actions
    switchToSheet: (sheetId: string) => {
      const { saveCurrentSheetData, sheets, globalSimulationResults } = get()
      
      // Save current sheet data first
      saveCurrentSheetData()
    
      const sheet = sheets.find(s => s.id === sheetId)
      if (sheet) {
        // Update current sheet simulation results if available
        const sheetResults = globalSimulationResults?.get(sheetId) || null
        
        set({
          activeSheetId: sheetId,
          blocks: sheet.blocks,
          wires: sheet.connections,
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
        simulationResults: null
      })
    },
    
    clearSimulationResults: () => {
      set({
        globalSimulationResults: null,
        currentSheetSimulationResults: null,
        simulationResults: null
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
      get().updateCurrentSheet({ 
        blocks: state.blocks, 
        connections: state.wires 
      })
    },
    
    initializeFromModel: (model, versionData) => {
      if (versionData?.data?.sheets) {
        const sheets = versionData.data.sheets
        
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
        
        set({
          model,
          currentVersion: versionData.version,
          isOlderVersion: versionData.version < model.latest_version,
          sheets,
          activeSheetId: firstSheetId,
          blocks: firstSheet?.blocks || [],
          wires: firstSheet?.connections || [],
          selectedBlockId: null,
          selectedWireId: null,
          simulationResults: null,
          error: null,
          modelLoading: false
        })
      } else {
        set({
          error: 'Invalid model: No sheet data found.',
          modelLoading: false
        })
      }
    }
  }))
)

// Selector hooks for commonly used derived state
export const useCurrentSheet = () => useModelStore((state: ModelStore) => {
  if (state.sheets.length === 0) return undefined
  return state.sheets.find((sheet: Sheet) => sheet.id === state.activeSheetId)
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
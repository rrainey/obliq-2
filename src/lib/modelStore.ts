import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { BlockData } from '@/components/Block'
import { WireData } from '@/components/Wire'
import { SimulationResults, SimulationEngine } from '@/lib/simulationEngine'
import { Model } from '@/lib/types'
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
  setError: (error: string | null) => void
  setModelLoading: (loading: boolean) => void
  saveModel: () => Promise<boolean>
  saveAutoSave: () => Promise<boolean>
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
  
  // Composite actions
  switchToSheet: (sheetId: string) => void
  updateCurrentSheet: (updates: Partial<Sheet>) => void
  initializeFromModel: (model: Model) => void
  saveCurrentSheetData: () => void
}

export type ModelStore = ModelState & ModelActions

export const useModelStore = create<ModelStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    model: null,
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

    // Model actions
    setModel: (model) => set({ model }),
    setError: (error) => set({ error }),
    setModelLoading: (modelLoading) => set({ modelLoading }),
    
    saveModel: async () => {
      const state = get()
      
      if (!state.model) {
        set({ error: 'No model to save' })
        return false
      }

      set({ saving: true, error: null })
      
      try {
        // Ensure current sheet data is saved before persisting to database
        get().saveCurrentSheetData()
        
        // Get the updated model with current sheet data
        const updatedState = get()
        
        // Double-check model still exists after state update
        if (!updatedState.model) {
          set({ error: 'Model was lost during save preparation', saving: false })
          return false
        }
        
        const modelData = {
          ...updatedState.model.data,
          sheets: updatedState.sheets
        }

        const { error } = await supabase
          .from('models')
          .update({ 
            data: modelData,
            updated_at: new Date().toISOString()
          })
          .eq('id', updatedState.model.id)

        if (error) {
          console.error('Save error:', error)
          set({ error: `Failed to save model: ${error.message}`, saving: false })
          return false
        }

        // Update the model with the new data
        set({ 
          model: {
            ...updatedState.model,
            data: modelData,
            updated_at: new Date().toISOString()
          },
          saving: false,
          error: null
        })
        
        console.log('Model saved successfully')
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
    
    saveAutoSave: async () => {
      const state = get()
      
      if (!state.model || !state.autoSaveEnabled) {
        return false
      }

      try {
        // Ensure current sheet data is saved
        get().saveCurrentSheetData()
        
        // Get the updated state and check model still exists
        const updatedState = get()
        if (!updatedState.model) {
          console.error('Model was lost during auto-save preparation')
          return false
        }
        
        const modelData = {
          ...updatedState.model.data,
          sheets: updatedState.sheets
        }

        // Create auto-save model name
        const autoSaveName = `${updatedState.model.name} (auto-save)`
        
        // Check if auto-save model already exists
        const { data: existingAutoSave } = await supabase
          .from('models')
          .select('id')
          .eq('user_id', updatedState.model.user_id)
          .eq('name', autoSaveName)
          .single()

        if (existingAutoSave) {
          // Update existing auto-save
          const { error } = await supabase
            .from('models')
            .update({ 
              data: modelData,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingAutoSave.id)

          if (error) {
            console.error('Auto-save update error:', error)
            return false
          }
        } else {
          // Create new auto-save
          const { error } = await supabase
            .from('models')
            .insert({
              user_id: updatedState.model.user_id,
              name: autoSaveName,
              data: modelData,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
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
    switchToSheet: (sheetId) => {
      const state = get()
      
      // Save current sheet data before switching
      if (state.activeSheetId && (state.blocks.length > 0 || state.wires.length > 0)) {
        get().updateCurrentSheet({ blocks: state.blocks, connections: state.wires })
      }
      
      // Find the target sheet and load its data
      const targetSheet = state.sheets.find(s => s.id === sheetId)
      if (targetSheet) {
        set({
          activeSheetId: sheetId,
          blocks: targetSheet.blocks || [],
          wires: targetSheet.connections || [],
          selectedBlockId: null,
          selectedWireId: null,
          simulationResults: null
        })
      }
    },
    
    updateCurrentSheet: (updates) => {
      const state = get()
      const updatedSheets = state.sheets.map(sheet =>
        sheet.id === state.activeSheetId
          ? { ...sheet, ...updates }
          : sheet
      )
      
      set({ sheets: updatedSheets })
      
      // Also update the model data
      if (state.model) {
        set({
          model: {
            ...state.model,
            data: {
              ...state.model.data,
              sheets: updatedSheets
            }
          }
        })
      }
    },
    
    saveCurrentSheetData: () => {
      const state = get()
      get().updateCurrentSheet({ 
        blocks: state.blocks, 
        connections: state.wires 
      })
    },
    
    initializeFromModel: (model) => {
      if (model?.data?.sheets) {
        const sheets = model.data.sheets
        
        // Data integrity check - model must have at least one sheet
        if (sheets.length === 0) {
          set({
            error: 'Invalid model: No sheets found. Models must contain at least one sheet.',
            modelLoading: false
          })
          return
        }
        
        const firstSheetId = sheets[0].id
        const firstSheet = sheets[0] // We know sheets[0] exists due to length check above
        
        set({
          model,
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
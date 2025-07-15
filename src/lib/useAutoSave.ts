// lib/useAutoSave.ts

import { useEffect, useRef } from 'react'
import { useModelStore } from './modelStore'

export const useAutoSave = (enabled: boolean = true, intervalMs: number = 5 * 60 * 1000) => { // Default: 5 minutes
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const { 
    autoSaveEnabled, 
    saveAutoSave, 
    saveCurrentSheetData, 
    model, 
    currentVersion, 
    sheets,
    isDirty,
    checkIfDirty 
  } = useModelStore()

  useEffect(() => {
    // Only run auto-save if:
    // 1. Auto-save is globally enabled
    // 2. Auto-save is enabled for this specific context (passed as parameter)
    // 3. Model exists and has an ID
    // 4. We have sheets data
    // 5. We're on a valid version (not 0, which is the auto-save version itself)
    const shouldAutoSave = autoSaveEnabled && 
                          enabled && 
                          model?.id && 
                          sheets.length > 0 &&
                          currentVersion > 0

    if (shouldAutoSave) {
      // Clear existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }

      // Define the auto-save function
      const performAutoSave = async () => {
        // Check if the model is actually dirty
        const currentlyDirty = checkIfDirty()
        
        if (!currentlyDirty) {
          console.log('Auto-save check: Model is clean, skipping save')
          return
        }
        
        console.log('Auto-save triggered at', new Date().toISOString(), '- Model is dirty')
        
        // CRITICAL: Save current sheet data to the store's sheets array first
        // This ensures any changes in the current editing session are included
        saveCurrentSheetData()
        
        try {
          const success = await saveAutoSave()
          if (success) {
            console.log('Auto-save completed successfully')
          } else {
            console.error('Auto-save failed')
          }
        } catch (error) {
          console.error('Auto-save error:', error)
        }
      }

      // Don't run initial auto-save immediately - wait for first interval
      // This gives time for the model to be marked as clean after loading

      // Set up auto-save interval
      intervalRef.current = setInterval(performAutoSave, intervalMs)

      // Cleanup on unmount or when disabled
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    } else {
      // Clear interval if auto-save should be disabled
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [autoSaveEnabled, enabled, model?.id, sheets.length, currentVersion, intervalMs, saveAutoSave, saveCurrentSheetData, checkIfDirty])

  // Handle auto-save when window is about to close
  useEffect(() => {
    const shouldAutoSave = autoSaveEnabled && 
                          enabled && 
                          model?.id && 
                          sheets.length > 0 &&
                          currentVersion > 0

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (shouldAutoSave) {
        // Check if dirty
        const currentlyDirty = checkIfDirty()
        
        if (currentlyDirty) {
          // Save current sheet data before the page unloads
          saveCurrentSheetData()
          // Note: We can't use async operations in beforeunload reliably
          // but saveCurrentSheetData is synchronous, so it should work
          
          // Attempt to trigger auto-save (may not complete)
          saveAutoSave()
          
          // Optionally, show a warning to the user
          e.preventDefault()
          e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
          return e.returnValue
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [autoSaveEnabled, enabled, model?.id, sheets.length, currentVersion, saveAutoSave, saveCurrentSheetData, checkIfDirty])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])
}
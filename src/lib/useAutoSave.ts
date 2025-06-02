import { useEffect, useRef } from 'react'
import { useModelStore } from './modelStore'

export const useAutoSave = (enabled: boolean = true, intervalMs: number = 5 * 60 * 1000) => { // Default: 5 minutes
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const { autoSaveEnabled, saveAutoSave, model, currentVersion, sheets } = useModelStore()

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

      // Run initial auto-save after a short delay to ensure model is fully loaded
      const initialSaveTimeout = setTimeout(async () => {
        console.log('Running initial auto-save...')
        try {
          await saveAutoSave()
        } catch (error) {
          console.error('Initial auto-save failed:', error)
        }
      }, 10000) // 10 seconds delay for initial save

      // Set up auto-save interval
      intervalRef.current = setInterval(async () => {
        console.log('Running periodic auto-save...')
        try {
          await saveAutoSave()
        } catch (error) {
          console.error('Periodic auto-save failed:', error)
        }
      }, intervalMs)

      // Cleanup on unmount or when disabled
      return () => {
        clearTimeout(initialSaveTimeout)
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
  }, [autoSaveEnabled, enabled, model?.id, sheets.length, currentVersion, intervalMs, saveAutoSave])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])
}
import { useEffect, useRef } from 'react'
import { useModelStore } from './modelStore'

export const useAutoSave = (intervalMs: number = 5 * 60 * 1000) => { // Default: 5 minutes
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const { autoSaveEnabled, saveAutoSave, model } = useModelStore()

  useEffect(() => {
    if (autoSaveEnabled && model) {
      // Clear existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }

      // Set up auto-save interval
      intervalRef.current = setInterval(async () => {
        console.log('Running auto-save...')
        await saveAutoSave()
      }, intervalMs)

      // Cleanup on unmount or when disabled
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    }
  }, [autoSaveEnabled, model, intervalMs, saveAutoSave])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])
}
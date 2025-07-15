// components/AutoSaveStatusIndicator.tsx
'use client'

import { useEffect, useState } from 'react'
import { useModelStore } from '@/lib/modelStore'

export default function AutoSaveStatusIndicator() {
  const { autoSaveEnabled, lastAutoSave } = useModelStore()
  const [showSaved, setShowSaved] = useState(false)

  useEffect(() => {
    if (lastAutoSave) {
      // Show "Saved" message briefly
      setShowSaved(true)
      const timer = setTimeout(() => setShowSaved(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [lastAutoSave])

  if (!autoSaveEnabled) {
    return null
  }

  const formatTime = (dateString: string | null) => {
    if (!dateString) return 'Never'
    
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} min ago`
    
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    
    return date.toLocaleDateString()
  }

  return (
    <div className="flex items-center text-xs text-gray-500">
      {showSaved ? (
        <div className="flex items-center text-green-600">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Auto-saved
        </div>
      ) : (
        <div className="flex items-center">
          <svg className="w-4 h-4 mr-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" 
            />
          </svg>
          <span>Auto-save: {formatTime(lastAutoSave)}</span>
        </div>
      )}
    </div>
  )
}

// components/AutoSaveRecoveryDialog.tsx
'use client'

import { useState } from 'react'

interface AutoSaveRecoveryDialogProps {
  modelName: string
  autoSaveDate: string
  lastSavedVersion: number
  lastSavedDate: string
  onRecover: () => void
  onDiscard: () => void
}

export default function AutoSaveRecoveryDialog({
  modelName,
  autoSaveDate,
  lastSavedVersion,
  lastSavedDate,
  onRecover,
  onDiscard
}: AutoSaveRecoveryDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false)

  const handleRecover = async () => {
    setIsProcessing(true)
    await onRecover()
  }

  const handleDiscard = async () => {
    setIsProcessing(true)
    await onDiscard()
  }

  // Format dates for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-[500px] max-w-[90vw]">
        <div className="flex items-start mb-4">
          <div className="flex-shrink-0">
            <svg className="w-6 h-6 text-amber-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
              />
            </svg>
          </div>
          
          <div className="ml-3 flex-1">
            <h3 className="text-lg font-medium text-gray-900">
              Auto-saved Version Found
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              An auto-saved version of <span className="font-medium">"{modelName}"</span> was found. 
              This may contain unsaved changes from a previous session.
            </p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-3">
          <div>
            <div className="text-sm font-medium text-gray-700">Auto-saved version:</div>
            <div className="text-sm text-gray-600">{formatDate(autoSaveDate)}</div>
          </div>
          
          <div className="border-t pt-3">
            <div className="text-sm font-medium text-gray-700">Last saved version:</div>
            <div className="text-sm text-gray-600">
              Version {lastSavedVersion} - {formatDate(lastSavedDate)}
            </div>
          </div>
        </div>

        <div className="text-sm text-gray-600 mb-6">
          <p className="mb-2">Choose which version to open:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li><strong>Recover auto-save:</strong> Open the auto-saved version with your unsaved changes</li>
            <li><strong>Open saved version:</strong> Discard the auto-save and open the last saved version</li>
          </ul>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            onClick={handleDiscard}
            disabled={isProcessing}
            className={`px-4 py-2 border border-gray-300 rounded-md text-sm font-medium 
              ${isProcessing 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
          >
            Open Saved Version
          </button>
          
          <button
            onClick={handleRecover}
            disabled={isProcessing}
            className={`px-4 py-2 rounded-md text-sm font-medium text-white
              ${isProcessing
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
              }`}
          >
            {isProcessing ? 'Loading...' : 'Recover Auto-save'}
          </button>
        </div>
      </div>
    </div>
  )
}
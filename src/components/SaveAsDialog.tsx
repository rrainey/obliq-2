// components/SaveAsDialog.tsx
'use client'

import { useState, useEffect } from 'react'

interface SaveAsDialogProps {
  currentName: string
  onSave: (newName: string) => void
  onClose: () => void
}

export default function SaveAsDialog({ currentName, onSave, onClose }: SaveAsDialogProps) {
  const [newName, setNewName] = useState(currentName + ' Copy')
  const [error, setError] = useState('')

  useEffect(() => {
    // Auto-focus the input when dialog opens
    const input = document.querySelector('.save-as-input') as HTMLInputElement
    if (input) {
      input.focus()
      input.select()
    }
  }, [])

  const handleSave = () => {
    const trimmedName = newName.trim()
    
    if (!trimmedName) {
      setError('Model name cannot be empty')
      return
    }
    
    if (trimmedName.length > 100) {
      setError('Model name must be less than 100 characters')
      return
    }
    
    onSave(trimmedName)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-[450px]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Save Model As...
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Model Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value)
                setError('')
              }}
              onKeyDown={handleKeyDown}
              className={`save-as-input w-full px-3 py-2 border-2 rounded-md text-sm bg-white text-gray-900 focus:outline-none ${
                error ? 'border-red-500 focus:border-red-600' : 'border-gray-400 focus:border-blue-600'
              }`}
              placeholder="Enter new model name"
            />
            {error && (
              <p className="text-xs text-red-600 mt-1">{error}</p>
            )}
          </div>

          <div className="bg-blue-50 p-3 rounded-md">
            <p className="text-sm text-blue-800">
              This will create a copy of the current model with the new name. 
              You will continue editing the new copy.
            </p>
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Save As
          </button>
        </div>
      </div>
    </div>
  )
}
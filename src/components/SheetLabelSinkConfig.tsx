// components/SheetLabelSinkConfig.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { BlockData } from './BlockNode'
import { collectAvailableSignalNames } from '@/lib/sheetLabelUtils'

interface SheetLabelSinkConfigProps {
  block: BlockData
  blocks: BlockData[]  // Current sheet blocks
  allSheetsBlocks?: BlockData[]  // All blocks across all sheets in the subsystem
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function SheetLabelSinkConfig({ 
  block, 
  blocks,
  allSheetsBlocks,
  onUpdate, 
  onClose 
}: SheetLabelSinkConfigProps) {
  const [signalName, setSignalName] = useState(block.parameters?.signalName || '')
  const [nameError, setNameError] = useState<string>('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Use all sheets blocks if provided, otherwise fall back to current sheet
  const blocksToSearch = allSheetsBlocks || blocks
  
  // Get existing signal names (excluding current block's signal)
  const existingSignalNames = collectAvailableSignalNames(
    blocksToSearch.filter((b: BlockData) => b.id !== block.id), 
    []
  )
  
  // Filter suggestions based on input
  const suggestions = existingSignalNames.filter(name =>
    name.toLowerCase().includes(signalName.toLowerCase()) && name !== signalName
  )

  // Validate signal name
  useEffect(() => {
    if (!signalName.trim()) {
      setNameError('Signal name is required')
    } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(signalName)) {
      setNameError('Signal name must be a valid C identifier (letters, numbers, underscore, cannot start with number)')
    } else {
      setNameError('')
    }
  }, [signalName])

  // Handle clicking outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node) &&
          inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInputChange = (value: string) => {
    setSignalName(value)
    setShowSuggestions(true)
    setSelectedSuggestionIndex(-1)
  }

  const handleSelectSuggestion = (suggestion: string) => {
    setSignalName(suggestion)
    setShowSuggestions(false)
    setSelectedSuggestionIndex(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedSuggestionIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1)
        break
      case 'Enter':
        e.preventDefault()
        if (selectedSuggestionIndex >= 0) {
          handleSelectSuggestion(suggestions[selectedSuggestionIndex])
        }
        break
      case 'Escape':
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
        break
    }
  }

  const handleSave = () => {
    if (nameError) return
    
    const parameters = {
      ...block.parameters,
      signalName: signalName.trim()
    }
    onUpdate(parameters)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-96">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Configure Sheet Label Sink: {block.name}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Signal Name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={signalName}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowSuggestions(true)}
              className={`w-full px-3 py-2 border-2 rounded-md text-sm bg-white text-gray-900 focus:outline-none ${
                nameError ? 'border-red-500 focus:border-red-600' : 'border-gray-400 focus:border-blue-600'
              }`}
              placeholder="Enter signal name (e.g., motor_speed)"
              autoFocus
              autoComplete="off"
            />
            
            {/* Autocomplete dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div 
                ref={suggestionsRef}
                className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-auto"
              >
                <div className="py-1">
                  <div className="px-3 py-1 text-xs text-gray-500 bg-gray-50">
                    Existing signals:
                  </div>
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion}
                      onClick={() => handleSelectSuggestion(suggestion)}
                      onMouseEnter={() => setSelectedSuggestionIndex(index)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${
                        index === selectedSuggestionIndex ? 'bg-blue-50' : ''
                      }`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {nameError ? (
              <p className="text-xs text-red-600 mt-1">{nameError}</p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                This name identifies the signal across sheets in the current subsystem
              </p>
            )}
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-md p-3">
            <p className="text-sm text-purple-800">
              <strong>Sheet Label Sink:</strong> Captures a signal and makes it available 
              to Sheet Label Source blocks with the same signal name within the current 
              subsystem scope.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> Signal names must be unique within each subsystem. 
              The same signal name can be used in different subsystems without conflict.
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
            disabled={!!nameError || !signalName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
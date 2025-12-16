'use client'

import { useState } from 'react'
import { BlockData } from './BlockNode'

interface ScaleConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

// Helper to check if a string is a valid identifier (parameter name)
const isValidIdentifier = (str: string): boolean => {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str)
}

// Helper to parse gain value - returns number or string (parameter name)
const parseGainValue = (input: string): number | string => {
  const trimmed = input.trim()
  // Check if it's a valid identifier (parameter name)
  if (isValidIdentifier(trimmed)) {
    return trimmed
  }
  // Otherwise try to parse as number
  const num = parseFloat(trimmed)
  return isNaN(num) ? trimmed : num
}

export default function ScaleConfig({ block, onUpdate, onClose }: ScaleConfigProps) {
  // Store gain as string to support both numbers and parameter names
  const [gainInput, setGainInput] = useState(String(block.parameters?.gain ?? 1))
  const [error, setError] = useState<string | null>(null)

  const validateGain = (value: string): string | null => {
    const trimmed = value.trim()
    if (!trimmed) {
      return 'Gain value cannot be empty'
    }
    // Valid if it's a number or a valid identifier
    const num = parseFloat(trimmed)
    if (!isNaN(num)) {
      return null // Valid number
    }
    if (isValidIdentifier(trimmed)) {
      return null // Valid parameter name
    }
    return 'Gain must be a number or a valid parameter name (e.g., MY_GAIN)'
  }

  const handleSave = () => {
    const validationError = validateGain(gainInput)
    if (validationError) {
      setError(validationError)
      return
    }

    const parameters = {
      gain: parseGainValue(gainInput)
    }
    onUpdate(parameters)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-96">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Configure Scale: {block.name}
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
              Gain
            </label>
            <input
              type="text"
              value={gainInput}
              onChange={(e) => {
                setGainInput(e.target.value)
                setError(null)
              }}
              className={`w-full px-3 py-2 border-2 rounded-md text-sm bg-white text-gray-900 focus:outline-none ${
                error ? 'border-red-400 focus:border-red-600' : 'border-gray-400 focus:border-blue-600'
              }`}
              placeholder="Enter gain value or parameter name"
            />
            {error && (
              <p className="text-xs text-red-600 mt-1">{error}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Enter a number (e.g., 2.5) or a Model/Subsystem parameter name (e.g., GAIN_K)
            </p>
          </div>

          <div className="bg-purple-50 p-3 rounded-md">
            <p className="text-sm text-purple-800">
              <strong>Scale Block:</strong> Multiplies the input signal by a constant gain value.
              Use positive values for amplification, negative for inversion, and fractional values for attenuation.
              Parameter names are resolved during code generation.
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
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
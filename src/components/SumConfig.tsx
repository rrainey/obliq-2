'use client'

import { useState, useEffect } from 'react'
import { BlockData } from './BlockNode'

interface SumConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function SumConfig({ block, onUpdate, onClose }: SumConfigProps) {
  const [signs, setSigns] = useState(block?.parameters?.signs || '++')
  const [signsError, setSignsError] = useState<string>('')

  // Validate signs string
  useEffect(() => {
    if (!signs) {
      setSignsError('Signs cannot be empty')
    } else if (!/^[+-]+$/.test(signs)) {
      setSignsError('Signs must contain only + and - characters')
    } else if (signs.length < 2) {
      setSignsError('Must have at least 2 inputs')
    } else if (signs.length > 10) {
      setSignsError('Maximum 10 inputs allowed')
    } else {
      setSignsError('')
    }
  }, [signs])

  // Auto-focus first input when dialog opens
  useEffect(() => {
    const firstInput = document.querySelector('.fixed input') as HTMLElement
    if (firstInput) {
      firstInput.focus()
    }
  }, [])

  const handleSave = () => {
    const parameters = {
      signs,
      numInputs: signs.length, // Update numInputs to match
      inputs: signs // Legacy support
    }
    onUpdate(parameters)
    onClose()
  }

  const handleSignToggle = (index: number) => {
    const signsArray = signs.split('')
    signsArray[index] = signsArray[index] === '+' ? '-' : '+'
    setSigns(signsArray.join(''))
  }

  const handleAddInput = () => {
    if (signs.length < 10) {
      setSigns(signs + '+')
    }
  }

  const handleRemoveInput = () => {
    if (signs.length > 2) {
      setSigns(signs.slice(0, -1))
    }
  }

  const renderInputPreview = () => {
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium text-gray-700 mb-2">Input Configuration</div>
        <div className="space-y-2">
          {signs.split('').map((sign: any, index: number) => (
            <div key={index} className="flex items-center space-x-3">
              <span className="text-sm text-gray-600 w-16">Input {index + 1}:</span>
              <button
                type="button"
                onClick={() => handleSignToggle(index)}
                className={`w-10 h-10 rounded-md font-bold text-lg transition-colors ${
                  sign === '+' 
                    ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                }`}
              >
                {sign}
              </button>
              <span className="text-sm text-gray-500">
                {sign === '+' ? 'Addition' : 'Subtraction'}
              </span>
            </div>
          ))}
        </div>
        
        <div className="flex items-center space-x-2 mt-4 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={handleAddInput}
            disabled={signs.length >= 10}
            className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 disabled:bg-gray-100 disabled:text-gray-400"
          >
            Add Input
          </button>
          <button
            type="button"
            onClick={handleRemoveInput}
            disabled={signs.length <= 2}
            className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 disabled:bg-gray-100 disabled:text-gray-400"
          >
            Remove Input
          </button>
          <span className="text-sm text-gray-500 ml-2">
            {signs.length} input{signs.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-[500px] max-h-[600px] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Configure Sum: {block?.name || 'Sum Block'}
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
              Input Signs Pattern
            </label>
            <input
              type="text"
              value={signs}
              onChange={(e) => setSigns(e.target.value)}
              className={`w-full px-3 py-2 border-2 rounded-md text-sm bg-white text-gray-900 focus:outline-none ${
                signsError ? 'border-red-500 focus:border-red-600' : 'border-gray-400 focus:border-blue-600'
              }`}
              placeholder="e.g., ++, +-, +-+"
            />
            {signsError ? (
              <p className="text-xs text-red-600 mt-1">{signsError}</p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                Use + for addition, - for subtraction. Length determines number of inputs.
              </p>
            )}
          </div>

          {renderInputPreview()}

          <div className="bg-blue-50 p-3 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>Sum Block:</strong> Adds and/or subtracts multiple input signals based on the signs pattern.
              Each character in the pattern creates an input port with the corresponding operation.
            </p>
          </div>

          <div className="bg-yellow-50 p-3 rounded-md">
            <p className="text-sm text-yellow-800">
              <strong>Example Patterns:</strong>
              <br />• "++" - Add two inputs (default)
              <br />• "+-" - Subtract second input from first
              <br />• "+++" - Add three inputs
              <br />• "+-+" - First + third - second
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
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            disabled={!!signsError}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
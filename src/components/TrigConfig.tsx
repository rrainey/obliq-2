// components/TrigConfig.tsx

'use client'

import { useState, useEffect } from 'react'
import { BlockData } from './BlockNode'

interface TrigConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

const TRIG_FUNCTIONS = [
  { value: 'sin', label: 'sin(x)', description: 'Sine function' },
  { value: 'cos', label: 'cos(x)', description: 'Cosine function' },
  { value: 'atan', label: 'atan(x)', description: 'Arctangent function' },
  { value: 'atan2', label: 'atan2(y, x)', description: 'Two-argument arctangent' },
  { value: 'sincos', label: 'sincos(x)', description: 'Simultaneous sine and cosine' },
]

export default function TrigConfig({ block, onUpdate, onClose }: TrigConfigProps) {
  const [selectedFunction, setSelectedFunction] = useState(
    block?.parameters?.function || 'sin'
  )

  // Auto-focus when dialog opens
  useEffect(() => {
    const firstInput = document.querySelector('.fixed select') as HTMLElement
    if (firstInput) {
      firstInput.focus()
    }
  }, [])

  const handleSave = () => {
    const parameters = {
      function: selectedFunction
    }
    onUpdate(parameters)
    onClose()
  }

  const selectedFuncInfo = TRIG_FUNCTIONS.find(f => f.value === selectedFunction)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-[450px]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Configure Trigonometry Block: {block?.name || 'Trig Block'}
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
              Trigonometric Function
            </label>
            <select
              value={selectedFunction}
              onChange={(e) => setSelectedFunction(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-sm bg-white text-gray-900 focus:outline-none focus:border-blue-600"
            >
              {TRIG_FUNCTIONS.map(func => (
                <option key={func.value} value={func.value}>
                  {func.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              All angles are in radians
            </p>
          </div>

          {selectedFuncInfo && (
            <div className="bg-blue-50 p-3 rounded-md">
              <p className="text-sm font-medium text-blue-900 mb-1">
                {selectedFuncInfo.label}
              </p>
              <p className="text-sm text-blue-800">
                {selectedFuncInfo.description}
              </p>
              
              {/* Function-specific information */}
              {selectedFunction === 'atan2' && (
                <div className="mt-2 text-sm text-blue-700">
                  <strong>Inputs:</strong> y (first input), x (second input)<br/>
                  <strong>Output:</strong> Angle in radians (-π to π)
                </div>
              )}
              
              {selectedFunction === 'sincos' && (
                <div className="mt-2 text-sm text-blue-700">
                  <strong>Input:</strong> Angle in radians<br/>
                  <strong>Outputs:</strong> sin(x) (first output), cos(x) (second output)
                </div>
              )}
              
              {(selectedFunction === 'sin' || selectedFunction === 'cos') && (
                <div className="mt-2 text-sm text-blue-700">
                  <strong>Input:</strong> Angle in radians<br/>
                  <strong>Output:</strong> Value between -1 and 1
                </div>
              )}
              
              {selectedFunction === 'atan' && (
                <div className="mt-2 text-sm text-blue-700">
                  <strong>Input:</strong> Any real number<br/>
                  <strong>Output:</strong> Angle in radians (-π/2 to π/2)
                </div>
              )}
            </div>
          )}

          <div className="bg-yellow-50 p-3 rounded-md">
            <p className="text-sm text-yellow-800">
              <strong>Port Configuration:</strong><br/>
              {selectedFunction === 'atan2' && '• 2 input ports: y and x'}
              {selectedFunction === 'sincos' && '• 1 input port, 2 output ports: sin and cos'}
              {selectedFunction !== 'atan2' && selectedFunction !== 'sincos' && '• 1 input port, 1 output port'}
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
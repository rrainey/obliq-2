'use client'

import { useState } from 'react'
import { BlockData } from './Block'

interface ScaleConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function ScaleConfig({ block, onUpdate, onClose }: ScaleConfigProps) {
  const [gain, setGain] = useState(block.parameters?.gain || 1)

  const handleSave = () => {
    const parameters = {
      gain
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
              type="number"
              step="any"
              value={gain}
              onChange={(e) => setGain(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
              placeholder="Enter gain value"
            />
            <p className="text-xs text-gray-500 mt-1">
              Multiplier applied to the input signal (Output = Input × Gain)
            </p>
          </div>

          <div className="bg-purple-50 p-3 rounded-md">
            <p className="text-sm text-purple-800">
              <strong>Scale Block:</strong> Multiplies the input signal by a constant gain value. 
              Use positive values for amplification, negative for inversion, and fractional values for attenuation.
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
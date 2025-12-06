'use client'

import { useState } from 'react'
import { BlockData } from './BlockNode'

interface LimitConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function LimitConfig({ block, onUpdate, onClose }: LimitConfigProps) {
  const [lowerLimit, setLowerLimit] = useState<number>(block.parameters?.lowerLimit ?? -1)
  const [upperLimit, setUpperLimit] = useState<number>(block.parameters?.upperLimit ?? 1)
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    // Validate that lower <= upper
    if (lowerLimit > upperLimit) {
      setError('Lower limit must be less than or equal to upper limit')
      return
    }

    const parameters = {
      lowerLimit,
      upperLimit
    }
    onUpdate(parameters)
    onClose()
  }

  const handleLowerChange = (value: string) => {
    const num = parseFloat(value)
    if (!isNaN(num)) {
      setLowerLimit(num)
      if (num <= upperLimit) {
        setError(null)
      }
    }
  }

  const handleUpperChange = (value: string) => {
    const num = parseFloat(value)
    if (!isNaN(num)) {
      setUpperLimit(num)
      if (lowerLimit <= num) {
        setError(null)
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-96">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Configure Limit: {block.name}
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
              Lower Limit
            </label>
            <input
              type="number"
              step="any"
              value={lowerLimit}
              onChange={(e) => handleLowerChange(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
              placeholder="Enter lower limit value"
            />
            <p className="text-xs text-gray-500 mt-1">
              Values below this will be clamped to this lower limit
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Upper Limit
            </label>
            <input
              type="number"
              step="any"
              value={upperLimit}
              onChange={(e) => handleUpperChange(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
              placeholder="Enter upper limit value"
            />
            <p className="text-xs text-gray-500 mt-1">
              Values above this will be clamped to this upper limit
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 p-3 rounded-md">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="bg-purple-50 p-3 rounded-md">
            <p className="text-sm text-purple-800">
              <strong>Limit Block:</strong> Clamps input signal values to the specified range.
              Values below the lower limit are set to the lower limit, values above the upper limit are set to the upper limit.
              Supports scalar, vector, and matrix signals (element-wise limiting).
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

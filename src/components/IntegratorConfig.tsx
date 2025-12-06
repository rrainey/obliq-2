'use client'

import { useState } from 'react'
import { BlockData } from './BlockNode'

interface IntegratorConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function IntegratorConfig({ block, onUpdate, onClose }: IntegratorConfigProps) {
  const [initialValue, setInitialValue] = useState<number>(block.parameters?.initialValue ?? 0)
  const [showEnableInput, setShowEnableInput] = useState<boolean>(block.parameters?.showEnableInput ?? false)
  const [showResetInput, setShowResetInput] = useState<boolean>(block.parameters?.showResetInput ?? false)
  const [useLimits, setUseLimits] = useState<boolean>(block.parameters?.useLimits ?? false)
  const [lowerLimit, setLowerLimit] = useState<number>(block.parameters?.lowerLimit ?? -Infinity)
  const [upperLimit, setUpperLimit] = useState<number>(block.parameters?.upperLimit ?? Infinity)
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    // Validate limits if enabled
    if (useLimits && lowerLimit > upperLimit) {
      setError('Lower limit must be less than or equal to upper limit')
      return
    }

    const parameters = {
      initialValue,
      showEnableInput,
      showResetInput,
      useLimits,
      lowerLimit: useLimits ? lowerLimit : -Infinity,
      upperLimit: useLimits ? upperLimit : Infinity
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
      <div className="bg-white rounded-lg shadow-xl p-6 w-96 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Configure Integrator: {block.name}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* Initial Value */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Initial Value
            </label>
            <input
              type="number"
              step="any"
              value={initialValue}
              onChange={(e) => {
                const num = parseFloat(e.target.value)
                if (!isNaN(num)) setInitialValue(num)
              }}
              className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
              placeholder="Enter initial value"
            />
            <p className="text-xs text-gray-500 mt-1">
              The starting value of the integrator at t=0
            </p>
          </div>

          {/* Optional Inputs Section */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Optional Inputs</h4>

            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showEnableInput}
                  onChange={(e) => setShowEnableInput(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Show Enable Input</span>
              </label>
              <p className="text-xs text-gray-500 ml-6">
                When enabled input is 0, integration is paused (output holds)
              </p>

              <label className="flex items-center mt-2">
                <input
                  type="checkbox"
                  checked={showResetInput}
                  onChange={(e) => setShowResetInput(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Show Reset Input</span>
              </label>
              <p className="text-xs text-gray-500 ml-6">
                On rising edge, resets output to initial value
              </p>
            </div>
          </div>

          {/* Limits Section */}
          <div className="border-t pt-4">
            <label className="flex items-center mb-2">
              <input
                type="checkbox"
                checked={useLimits}
                onChange={(e) => setUseLimits(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm font-medium text-gray-700">Use Output Limits</span>
            </label>

            {useLimits && (
              <div className="ml-6 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lower Limit
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={isFinite(lowerLimit) ? lowerLimit : ''}
                    onChange={(e) => handleLowerChange(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
                    placeholder="Enter lower limit"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Upper Limit
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={isFinite(upperLimit) ? upperLimit : ''}
                    onChange={(e) => handleUpperChange(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
                    placeholder="Enter upper limit"
                  />
                </div>

                <p className="text-xs text-gray-500">
                  With saturation: when at limit and derivative would push further, integration stops
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 p-3 rounded-md">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="bg-blue-50 p-3 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>Integrator Block:</strong> Integrates the input signal over time using Euler integration.
              Output = Initial Value + ∫ Input dt
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

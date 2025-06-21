'use client'

import { useState } from 'react'
import { BlockData } from './BlockNode'

interface TransferFunctionConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function TransferFunctionConfig({ block, onUpdate, onClose }: TransferFunctionConfigProps) {
  const [numerator, setNumerator] = useState<number[]>(block.parameters?.numerator || [1])
  const [denominator, setDenominator] = useState<number[]>(block.parameters?.denominator || [1, 1])

  const handleSave = () => {
    const parameters = {
      numerator: numerator.filter(val => !isNaN(val)),
      denominator: denominator.filter(val => !isNaN(val))
    }
    
    // Validate that we have at least one coefficient in each
    if (parameters.numerator.length === 0) {
      parameters.numerator = [1]
    }
    if (parameters.denominator.length === 0) {
      parameters.denominator = [1]
    }
    
    onUpdate(parameters)
    onClose()
  }

  const updateNumerator = (index: number, value: string) => {
    const newNumerator = [...numerator]
    newNumerator[index] = parseFloat(value) || 0
    setNumerator(newNumerator)
  }

  const updateDenominator = (index: number, value: string) => {
    const newDenominator = [...denominator]
    newDenominator[index] = parseFloat(value) || 0
    setDenominator(newDenominator)
  }

  const addNumeratorCoeff = () => {
    setNumerator([...numerator, 0])
  }

  const removeNumeratorCoeff = (index: number) => {
    if (numerator.length > 1) {
      setNumerator(numerator.filter((_, i) => i !== index))
    }
  }

  const addDenominatorCoeff = () => {
    setDenominator([...denominator, 0])
  }

  const removeDenominatorCoeff = (index: number) => {
    if (denominator.length > 1) {
      setDenominator(denominator.filter((_, i) => i !== index))
    }
  }

  // Helper to render transfer function display
  const renderTransferFunction = () => {
    const numStr = numerator.map((coeff, idx) => {
      const power = numerator.length - 1 - idx
      if (power === 0) return coeff.toString()
      if (power === 1) return `${coeff}s`
      return `${coeff}s^${power}`
    }).join(' + ').replace(/\+ -/g, '- ')

    const denStr = denominator.map((coeff, idx) => {
      const power = denominator.length - 1 - idx
      if (power === 0) return coeff.toString()
      if (power === 1) return `${coeff}s`
      return `${coeff}s^${power}`
    }).join(' + ').replace(/\+ -/g, '- ')

    return (
      <div className="text-center font-mono text-sm border p-2 rounded bg-gray-50">
        <div className="border-b border-gray-400 pb-1 mb-1">
          {numStr || '1'}
        </div>
        <div>
          {denStr || '1'}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-96 max-h-96 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Configure Transfer Function: {block.name}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* Transfer Function Display */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Transfer Function H(s)
            </label>
            {renderTransferFunction()}
          </div>

          {/* Numerator Coefficients */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Numerator Coefficients (highest to lowest power)
            </label>
            {numerator.map((coeff, index) => (
              <div key={index} className="flex items-center space-x-2 mb-2">
                <span className="text-sm text-gray-500 w-12">
                  s^{numerator.length - 1 - index}:
                </span>
                <input
                  type="number"
                  step="any"
                  value={coeff}
                  onChange={(e) => updateNumerator(index, e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <button
                  onClick={() => removeNumeratorCoeff(index)}
                  disabled={numerator.length <= 1}
                  className="px-2 py-2 text-red-600 hover:text-red-800 disabled:text-gray-400"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={addNumeratorCoeff}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              + Add Coefficient
            </button>
          </div>

          {/* Denominator Coefficients */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Denominator Coefficients (highest to lowest power)
            </label>
            {denominator.map((coeff, index) => (
              <div key={index} className="flex items-center space-x-2 mb-2">
                <span className="text-sm text-gray-500 w-12">
                  s^{denominator.length - 1 - index}:
                </span>
                <input
                  type="number"
                  step="any"
                  value={coeff}
                  onChange={(e) => updateDenominator(index, e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <button
                  onClick={() => removeDenominatorCoeff(index)}
                  disabled={denominator.length <= 1}
                  className="px-2 py-2 text-red-600 hover:text-red-800 disabled:text-gray-400"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={addDenominatorCoeff}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              + Add Coefficient
            </button>
          </div>

          <div className="bg-red-50 p-3 rounded-md">
            <p className="text-sm text-red-800">
              <strong>Transfer Function Block:</strong> Implements H(s) = N(s)/D(s) using RK4 integration. 
              Coefficients are ordered from highest to lowest power of s.
            </p>
            <p className="text-xs text-red-600 mt-1">
              Example: For H(s) = (2s + 1)/(s² + 3s + 2), enter Numerator: [2, 1], Denominator: [1, 3, 2]
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
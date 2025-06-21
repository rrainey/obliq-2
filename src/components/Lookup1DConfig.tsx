'use client'

import { useState } from 'react'
import { BlockData } from './BlockNode'

interface Lookup1DConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function Lookup1DConfig({ block, onUpdate, onClose }: Lookup1DConfigProps) {
  const [inputValues, setInputValues] = useState<number[]>(
    block?.parameters?.inputValues || [0, 1, 2]
  )
  const [outputValues, setOutputValues] = useState<number[]>(
    block?.parameters?.outputValues || [0, 1, 4]
  )
  const [extrapolation, setExtrapolation] = useState(
    block?.parameters?.extrapolation || 'clamp'
  )

  const handleInputValuesChange = (value: string) => {
    try {
      const values = value.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v))
      setInputValues(values)
    } catch (error) {
      // Invalid input, keep current values
    }
  }

  const handleOutputValuesChange = (value: string) => {
    try {
      const values = value.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v))
      setOutputValues(values)
    } catch (error) {
      // Invalid input, keep current values
    }
  }

  const addDataPoint = () => {
    const lastInput = inputValues.length > 0 ? inputValues[inputValues.length - 1] : 0
    const lastOutput = outputValues.length > 0 ? outputValues[outputValues.length - 1] : 0
    setInputValues([...inputValues, lastInput + 1])
    setOutputValues([...outputValues, lastOutput])
  }

  const removeDataPoint = (index: number) => {
    if (inputValues.length > 1 && outputValues.length > 1) {
      setInputValues(inputValues.filter((_, i) => i !== index))
      setOutputValues(outputValues.filter((_, i) => i !== index))
    }
  }

  const updateDataPoint = (index: number, inputVal: string, outputVal: string) => {
    const newInputs = [...inputValues]
    const newOutputs = [...outputValues]
    
    // Convert to numbers, but allow empty strings and negative signs during editing
    const numericInput = inputVal === '' || inputVal === '-' ? 0 : parseFloat(inputVal)
    const numericOutput = outputVal === '' || outputVal === '-' ? 0 : parseFloat(outputVal)
    
    newInputs[index] = isNaN(numericInput) ? 0 : numericInput
    newOutputs[index] = isNaN(numericOutput) ? 0 : numericOutput
    
    setInputValues(newInputs)
    setOutputValues(newOutputs)
  }

  const sortDataPoints = () => {
    const combined = inputValues.map((input, i) => ({
      input,
      output: outputValues[i] || 0
    }))
    combined.sort((a, b) => a.input - b.input)
    setInputValues(combined.map(p => p.input))
    setOutputValues(combined.map(p => p.output))
  }

  const handleSave = () => {
    // Ensure we have at least one data point
    const finalInputs = inputValues.length > 0 ? inputValues : [0]
    const finalOutputs = outputValues.length > 0 ? outputValues : [0]
    
    const parameters = {
      inputValues: finalInputs,
      outputValues: finalOutputs,
      extrapolation
    }
    onUpdate(parameters)
    onClose()
  }

  const maxPoints = Math.max(inputValues.length, outputValues.length)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-[500px] max-h-[900px] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Configure 1-D Lookup: {block?.name || '1-D Lookup'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* Data Points Table */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">
                Data Points ({maxPoints} points)
              </label>
              <div className="space-x-2">
                <button
                  onClick={sortDataPoints}
                  className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 border"
                >
                  Sort
                </button>
                <button
                  onClick={addDataPoint}
                  className="text-xs px-2 py-1 bg-blue-200 text-blue-700 rounded hover:bg-blue-300 border border-blue-300"
                >
                  Add
                </button>
              </div>
            </div>
            
            <div className="max-h-48 overflow-y-auto border-2 border-gray-300 rounded">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium text-gray-700">Input</th>
                    <th className="px-2 py-2 text-left font-medium text-gray-700">Output</th>
                    <th className="px-2 py-2 text-center font-medium text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxPoints }, (_, i) => (
                    <tr key={i} className="border-t border-gray-200">
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          step="any"
                          value={inputValues[i] ?? 0}
                          onChange={(e) => updateDataPoint(i, e.target.value, (outputValues[i] ?? 0).toString())}
                          className="w-full px-2 py-1 border-2 border-gray-400 rounded text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          step="any"
                          value={outputValues[i] ?? 0}
                          onChange={(e) => updateDataPoint(i, (inputValues[i] ?? 0).toString(), e.target.value)}
                          className="w-full px-2 py-1 border-2 border-gray-400 rounded text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        {maxPoints > 1 && (
                          <button
                            onClick={() => removeDataPoint(i)}
                            className="text-red-600 hover:text-red-800 text-sm font-bold w-6 h-6 rounded hover:bg-red-100"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick Input */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Input Values (comma-separated)
              </label>
              <input
                type="text"
                value={inputValues.join(', ')}
                onChange={(e) => handleInputValuesChange(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-400 rounded text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
                placeholder="0, 1, 2, 3"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Output Values (comma-separated)
              </label>
              <input
                type="text"
                value={outputValues.join(', ')}
                onChange={(e) => handleOutputValuesChange(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-400 rounded text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
                placeholder="0, 1, 4, 9"
              />
            </div>
          </div>

          {/* Extrapolation Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Extrapolation Method
            </label>
            <select
              value={extrapolation}
              onChange={(e) => setExtrapolation(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-400 rounded text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
            >
              <option value="clamp">Clamp to nearest value</option>
              <option value="extrapolate">Linear extrapolation</option>
            </select>
            <p className="text-xs text-gray-600 mt-1">
              How to handle inputs outside the table range
            </p>
          </div>

          <div className="bg-cyan-50 p-3 rounded-md border border-cyan-200">
            <p className="text-sm text-cyan-800">
              <strong>1-D Lookup:</strong> Interpolates between input/output pairs. 
              Input values should be in ascending order for best results.
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
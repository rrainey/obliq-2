'use client'

import { useState } from 'react'
import { BlockData } from './BlockNode'

interface Lookup2DConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function Lookup2DConfig({ block, onUpdate, onClose }: Lookup2DConfigProps) {
  const [input1Values, setInput1Values] = useState<number[]>(
    block?.parameters?.input1Values || [0, 1]
  )
  const [input2Values, setInput2Values] = useState<number[]>(
    block?.parameters?.input2Values || [0, 1]
  )
  const [outputTable, setOutputTable] = useState<number[][]>(
    block?.parameters?.outputTable || [[0, 1], [2, 3]]
  )
  const [extrapolation, setExtrapolation] = useState(
    block?.parameters?.extrapolation || 'clamp'
  )

  const handleInput1ValuesChange = (value: string) => {
    try {
      const values = value.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v))
      if (values.length > 0) {
        setInput1Values(values)
        // Resize output table to match
        const newTable = Array(values.length).fill(null).map((_, i) => 
          outputTable[i] ? [...outputTable[i]] : Array(input2Values.length).fill(0)
        )
        setOutputTable(newTable)
      }
    } catch (error) {
      // Invalid input, keep current values
    }
  }

  const handleInput2ValuesChange = (value: string) => {
    try {
      const values = value.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v))
      if (values.length > 0) {
        setInput2Values(values)
        // Resize output table to match
        const newTable = outputTable.map(row => {
          const newRow = Array(values.length).fill(0)
          for (let j = 0; j < Math.min(row.length, values.length); j++) {
            newRow[j] = row[j] || 0
          }
          return newRow
        })
        setOutputTable(newTable)
      }
    } catch (error) {
      // Invalid input, keep current values
    }
  }

  const updateTableValue = (row: number, col: number, value: string) => {
    const numValue = value === '' || value === '-' ? 0 : parseFloat(value)
    const newTable = [...outputTable]
    if (!newTable[row]) {
      newTable[row] = Array(input2Values.length).fill(0)
    }
    newTable[row][col] = isNaN(numValue) ? 0 : numValue
    setOutputTable(newTable)
  }

  const addInput1Point = () => {
    const lastValue = input1Values.length > 0 ? input1Values[input1Values.length - 1] : 0
    const newInput1Values = [...input1Values, lastValue + 1]
    setInput1Values(newInput1Values)
    
    // Add new row to output table
    const newRow = Array(input2Values.length).fill(0)
    setOutputTable([...outputTable, newRow])
  }

  const addInput2Point = () => {
    const lastValue = input2Values.length > 0 ? input2Values[input2Values.length - 1] : 0
    const newInput2Values = [...input2Values, lastValue + 1]
    setInput2Values(newInput2Values)
    
    // Add new column to output table
    const newTable = outputTable.map(row => [...row, 0])
    setOutputTable(newTable)
  }

  const removeInput1Point = (index: number) => {
    if (input1Values.length > 1) {
      const newInput1Values = input1Values.filter((_, i) => i !== index)
      setInput1Values(newInput1Values)
      
      // Remove row from output table
      const newTable = outputTable.filter((_, i) => i !== index)
      setOutputTable(newTable)
    }
  }

  const removeInput2Point = (index: number) => {
    if (input2Values.length > 1) {
      const newInput2Values = input2Values.filter((_, i) => i !== index)
      setInput2Values(newInput2Values)
      
      // Remove column from output table
      const newTable = outputTable.map(row => row.filter((_, j) => j !== index))
      setOutputTable(newTable)
    }
  }

  const updateInput1Value = (index: number, value: string) => {
    const numValue = value === '' || value === '-' ? 0 : parseFloat(value)
    const newValues = [...input1Values]
    newValues[index] = isNaN(numValue) ? 0 : numValue
    setInput1Values(newValues)
  }

  const updateInput2Value = (index: number, value: string) => {
    const numValue = value === '' || value === '-' ? 0 : parseFloat(value)
    const newValues = [...input2Values]
    newValues[index] = isNaN(numValue) ? 0 : numValue
    setInput2Values(newValues)
  }

  const handleSave = () => {
    const parameters = {
      input1Values: input1Values.length > 0 ? input1Values : [0],
      input2Values: input2Values.length > 0 ? input2Values : [0],
      outputTable: outputTable.length > 0 ? outputTable : [[0]],
      extrapolation
    }
    onUpdate(parameters)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-[600px] max-h-[500px] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Configure 2-D Lookup: {block?.name || '2-D Lookup'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* Input Arrays Configuration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Input 1 Values ({input1Values.length})
                </label>
                <button
                  onClick={addInput1Point}
                  className="text-xs px-2 py-1 bg-blue-200 text-blue-700 rounded hover:bg-blue-300 border border-blue-300"
                >
                  Add Row
                </button>
              </div>
              <input
                type="text"
                value={input1Values.join(', ')}
                onChange={(e) => handleInput1ValuesChange(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-400 rounded text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
                placeholder="0, 1, 2"
              />
              <div className="mt-2 max-h-24 overflow-y-auto">
                {input1Values.map((value, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1">
                    <input
                      type="number"
                      step="any"
                      value={value}
                      onChange={(e) => updateInput1Value(i, e.target.value)}
                      className="flex-1 px-2 py-1 border-2 border-gray-400 rounded text-xs bg-white text-gray-900 focus:border-blue-600 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {input1Values.length > 1 && (
                      <button
                        onClick={() => removeInput1Point(i)}
                        className="text-red-600 hover:text-red-800 text-sm font-bold w-6 h-6 rounded hover:bg-red-100"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">
                  Input 2 Values ({input2Values.length})
                </label>
                <button
                  onClick={addInput2Point}
                  className="text-xs px-2 py-1 bg-green-200 text-green-700 rounded hover:bg-green-300 border border-green-300"
                >
                  Add Col
                </button>
              </div>
              <input
                type="text"
                value={input2Values.join(', ')}
                onChange={(e) => handleInput2ValuesChange(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-400 rounded text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
                placeholder="0, 1, 2"
              />
              <div className="mt-2 max-h-24 overflow-y-auto">
                {input2Values.map((value, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1">
                    <input
                      type="number"
                      step="any"
                      value={value}
                      onChange={(e) => updateInput2Value(i, e.target.value)}
                      className="flex-1 px-2 py-1 border-2 border-gray-400 rounded text-xs bg-white text-gray-900 focus:border-blue-600 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {input2Values.length > 1 && (
                      <button
                        onClick={() => removeInput2Point(i)}
                        className="text-red-600 hover:text-red-800 text-sm font-bold w-6 h-6 rounded hover:bg-red-100"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Output Table */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Output Table ({input1Values.length} × {input2Values.length})
            </label>
            <div className="border-2 border-gray-300 rounded overflow-auto max-h-48">
              <table className="w-full text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-2 py-1 text-center font-medium text-gray-700">Input1\Input2</th>
                    {input2Values.map((val, j) => (
                      <th key={j} className="px-2 py-1 text-center font-medium text-gray-700 min-w-[60px]">
                        {val.toFixed(2)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {input1Values.map((val1, i) => (
                    <tr key={i} className="border-t border-gray-200">
                      <td className="px-2 py-1 bg-gray-50 font-medium text-gray-700 text-center">
                        {val1.toFixed(2)}
                      </td>
                      {input2Values.map((_, j) => (
                        <td key={j} className="px-1 py-1">
                          <input
                            type="number"
                            step="any"
                            value={outputTable[i]?.[j] ?? 0}
                            onChange={(e) => updateTableValue(i, j, e.target.value)}
                            className="w-full px-1 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900 focus:border-blue-600 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
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
              <option value="clamp">Clamp to nearest values</option>
              <option value="extrapolate">Bilinear extrapolation</option>
            </select>
            <p className="text-xs text-gray-600 mt-1">
              How to handle inputs outside the table range
            </p>
          </div>

          <div className="bg-lime-50 p-3 rounded-md border border-lime-200">
            <p className="text-sm text-lime-800">
              <strong>2-D Lookup:</strong> Performs bilinear interpolation using two inputs. 
              Input values should be in ascending order for best results.
            </p>
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border-2 border-gray-400 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-700 text-white rounded-md text-sm font-medium hover:bg-blue-800 border border-blue-600"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
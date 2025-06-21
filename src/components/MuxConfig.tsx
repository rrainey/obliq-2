'use client'

import { useState, useEffect } from 'react'
import { BlockData } from './BlockNode'

// Extract base type from outputType (e.g., "double" from "double[2][3]")
const extractBaseType = (outputType: string): string => {
  const match = outputType.match(/^(\w+)(\[|$)/)
  return match ? match[1] : 'double'
}

interface MuxConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function MuxConfig({ block, onUpdate, onClose }: MuxConfigProps) {
  const [rows, setRows] = useState(block.parameters?.rows || 2)
  const [cols, setCols] = useState(block.parameters?.cols || 2)
  const [outputType, setOutputType] = useState(
    block.parameters?.baseType || extractBaseType(block.parameters?.outputType || 'double')
  )
  
  // Calculate total ports needed
  const totalPorts = rows * cols

  const handleSave = () => {
    onUpdate({
      ...block.parameters,
      rows,
      cols,
      outputType: `${outputType}[${rows}][${cols}]`,
      // Store base type for easier access
      baseType: outputType
    })
    onClose()
  }

  const handleCancel = () => {
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-96">
        <h2 className="text-xl font-bold mb-4">Configure Mux Block</h2>
        
        <div className="space-y-4">
          {/* Matrix Dimensions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Output Matrix Dimensions
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Rows</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={rows}
                  onChange={(e) => setRows(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Columns</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={cols}
                  onChange={(e) => setCols(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Base Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Element Type
            </label>
            <select
              value={outputType}
              onChange={(e) => setOutputType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="double">double</option>
              <option value="float">float</option>
              <option value="int">int</option>
              <option value="long">long</option>
            </select>
          </div>

          {/* Preview */}
          <div className="bg-gray-50 p-4 rounded-md">
            <div className="text-sm font-medium text-gray-700 mb-2">Configuration Preview:</div>
            <div className="text-xs space-y-1 font-mono">
              <div>Output Type: <span className="text-blue-600">{outputType}[{rows}][{cols}]</span></div>
              <div>Input Ports: <span className="text-green-600">{totalPorts}</span> (numbered 0 to {totalPorts - 1})</div>
              <div>Port Arrangement: Row-major order</div>
            </div>
          </div>

          {/* Port Layout Visualization */}
          <div className="bg-gray-50 p-4 rounded-md">
            <div className="text-sm font-medium text-gray-700 mb-2">Port Layout:</div>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {Array.from({ length: totalPorts }, (_, i) => {
                const row = Math.floor(i / cols)
                const col = i % cols
                return (
                  <div
                    key={i}
                    className="bg-white border border-gray-300 rounded text-xs text-center py-1 px-2"
                    title={`Row ${row}, Column ${col}`}
                  >
                    {i}
                  </div>
                )
              })}
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Inputs are arranged in row-major order: [0,0], [0,1], ..., [{rows-1},{cols-1}]
            </div>
          </div>

          {/* Warning for large matrices */}
          {totalPorts > 20 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <div className="text-sm text-yellow-800">
                ⚠️ Large matrix: {totalPorts} input ports will be created
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
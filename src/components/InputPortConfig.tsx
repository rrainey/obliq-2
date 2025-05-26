'use client'

import { useState } from 'react'
import { BlockData } from './Block'

interface InputPortConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function InputPortConfig({ block, onUpdate, onClose }: InputPortConfigProps) {
  const [portName, setPortName] = useState(block.parameters?.portName || 'Input')
  const [defaultValue, setDefaultValue] = useState(block.parameters?.defaultValue || 0)

  const handleSave = () => {
    const parameters = {
      portName,
      defaultValue
    }
    onUpdate(parameters)
    onClose()
  }

  const isInputPort = block.type === 'input_port'
  const title = isInputPort ? 'Input Port' : 'Output Port'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-96">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Configure {title}: {block.name}
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
              Port Name
            </label>
            <input
              type="text"
              value={portName}
              onChange={(e) => setPortName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="Enter port name"
            />
            <p className="text-xs text-gray-500 mt-1">
              This name identifies the port for external connections
            </p>
          </div>

          {isInputPort && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Value
              </label>
              <input
                type="number"
                step="any"
                value={defaultValue}
                onChange={(e) => setDefaultValue(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Value used when no external input is connected
              </p>
            </div>
          )}

          <div className="bg-blue-50 p-3 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> {isInputPort ? 'Input' : 'Output'} ports are used to connect 
              signals between a parent model and its subsystems. They do not generate signals themselves.
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
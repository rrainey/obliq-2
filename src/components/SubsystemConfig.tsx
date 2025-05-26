'use client'

import { useState } from 'react'
import { BlockData } from './Block'

export interface Sheet {
  id: string
  name: string
  blocks: any[]
  connections: any[]
  extents: {
    width: number
    height: number
  }
}

interface SubsystemConfigProps {
  block: BlockData
  availableSheets?: Sheet[]
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function SubsystemConfig({ block, availableSheets = [], onUpdate, onClose }: SubsystemConfigProps) {
  const [sheetId, setSheetId] = useState(block.parameters?.sheetId || '')
  const [sheetName, setSheetName] = useState(block.parameters?.sheetName || 'Subsystem')
  const [inputPorts, setInputPorts] = useState(block.parameters?.inputPorts || ['Input1'])
  const [outputPorts, setOutputPorts] = useState(block.parameters?.outputPorts || ['Output1'])

  const handleSave = () => {
    const parameters = {
      sheetId,
      sheetName,
      inputPorts: inputPorts.filter((port: string) => port.trim() !== ''),
      outputPorts: outputPorts.filter((port: string) => port.trim() !== '')
    }
    onUpdate(parameters)
    onClose()
  }

  const addInputPort = () => {
    setInputPorts([...inputPorts, `Input${inputPorts.length + 1}`])
  }

  const removeInputPort = (index: number) => {
    if (inputPorts.length > 1) {
      setInputPorts(inputPorts.filter((_: string, i: number) => i !== index))
    }
  }

  const updateInputPort = (index: number, value: string) => {
    const updated = [...inputPorts]
    updated[index] = value
    setInputPorts(updated)
  }

  const addOutputPort = () => {
    setOutputPorts([...outputPorts, `Output${outputPorts.length + 1}`])
  }

  const removeOutputPort = (index: number) => {
    if (outputPorts.length > 1) {
      setOutputPorts(outputPorts.filter((_: string, i: number) => i !== index))
    }
  }

  const updateOutputPort = (index: number, value: string) => {
    const updated = [...outputPorts]
    updated[index] = value
    setOutputPorts(updated)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-96 max-h-96 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Configure Subsystem: {block.name}
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
              Subsystem Name
            </label>
            <input
              type="text"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
              placeholder="Enter subsystem name"
            />
          </div>

          {availableSheets.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reference Sheet
              </label>
              <select
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="">Create New Sheet</option>
                {availableSheets.map(sheet => (
                  <option key={sheet.id} value={sheet.id}>
                    {sheet.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Select existing sheet or leave empty to create new
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Input Ports
            </label>
            {inputPorts.map((port: string, index: number) => (
              <div key={index} className="flex items-center space-x-2 mb-2">
                <input
                  type="text"
                  value={port}
                  onChange={(e) => updateInputPort(index, e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder={`Input ${index + 1}`}
                />
                <button
                  onClick={() => removeInputPort(index)}
                  disabled={inputPorts.length <= 1}
                  className="px-2 py-2 text-red-600 hover:text-red-800 disabled:text-gray-400"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={addInputPort}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              + Add Input Port
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Output Ports
            </label>
            {outputPorts.map((port: string, index: number) => (
              <div key={index} className="flex items-center space-x-2 mb-2">
                <input
                  type="text"
                  value={port}
                  onChange={(e) => updateOutputPort(index, e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                  placeholder={`Output ${index + 1}`}
                />
                <button
                  onClick={() => removeOutputPort(index)}
                  disabled={outputPorts.length <= 1}
                  className="px-2 py-2 text-red-600 hover:text-red-800 disabled:text-gray-400"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={addOutputPort}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              + Add Output Port
            </button>
          </div>

          <div className="bg-gray-50 p-3 rounded-md">
            <p className="text-sm text-gray-800">
              <strong>Subsystem Block:</strong> Contains a nested diagram with its own blocks and connections. 
              Input/output ports define the interface between the subsystem and its parent model.
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
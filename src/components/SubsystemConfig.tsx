// components/SubsystemConfig.tsx
'use client'

import { useState } from 'react'
import { BlockData } from './Block'
import { Sheet } from '@/lib/modelStore'

interface SubsystemConfigProps {
  block: BlockData
  availableSheets?: Sheet[]
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
  onSheetNavigate?: (sheetId: string) => void
}

export default function SubsystemConfig({ block, availableSheets = [], onUpdate, onClose, onSheetNavigate }: SubsystemConfigProps) {
  // Initialize sheets from block parameters
  const [sheets, setSheets] = useState<Sheet[]>(block.parameters?.sheets || [])
  const [sheetName, setSheetName] = useState(block.parameters?.sheetName || 'Subsystem')
  const [inputPorts, setInputPorts] = useState(block.parameters?.inputPorts || ['Input1'])
  const [outputPorts, setOutputPorts] = useState(block.parameters?.outputPorts || ['Output1'])
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null)
  const [editingSheetName, setEditingSheetName] = useState('')

  const handleSave = () => {
    const parameters = {
      sheets, 
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

  // Add sheet to subsystem
  const addSubsystemSheet = () => {
    const newSheet: Sheet = {
      id: `${block.id}_sheet_${Date.now()}`,
      name: `${block.name} Sheet ${sheets.length + 1}`,
      blocks: [],
      connections: [],
      extents: {
        width: 1000,
        height: 800
      }
    }
    setSheets([...sheets, newSheet])
  }

  const startEditingSheet = (sheet: Sheet) => {
    setEditingSheetId(sheet.id)
    setEditingSheetName(sheet.name)
  }

  const saveSheetName = () => {
    if (editingSheetId && editingSheetName.trim()) {
      setSheets(sheets.map(sheet => 
        sheet.id === editingSheetId 
          ? { ...sheet, name: editingSheetName.trim() }
          : sheet
      ))
    }
    setEditingSheetId(null)
    setEditingSheetName('')
  }

  const cancelEditingSheet = () => {
    setEditingSheetId(null)
    setEditingSheetName('')
  }

  const deleteSheet = (sheetId: string) => {
    const sheet = sheets.find(s => s.id === sheetId)
    if (!sheet) return

    // Prevent deletion if it's the last sheet
    if (sheets.length <= 1) {
      alert('Cannot delete the last sheet. Subsystems must have at least one sheet.')
      return
    }

    // Confirmation dialog
    const hasContent = sheet.blocks.length > 0 || sheet.connections.length > 0
    const confirmMessage = hasContent
      ? `Are you sure you want to delete "${sheet.name}"? This sheet contains ${sheet.blocks.length} blocks and ${sheet.connections.length} connections. This action cannot be undone.`
      : `Are you sure you want to delete "${sheet.name}"?`

    if (window.confirm(confirmMessage)) {
      setSheets(sheets.filter(s => s.id !== sheetId))
    }
  }

  const navigateToSheet = (sheetId: string) => {
    // Save current changes before navigating
    handleSave()
    
    // Navigate to the sheet
    if (onSheetNavigate) {
      onSheetNavigate(sheetId)
    }
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

          {/* Sheet Management Section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sheets
            </label>
            <div className="space-y-2">
              {/* Sheet list table */}
              {sheets.length > 0 && (
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <tbody className="bg-white divide-y divide-gray-200">
                      {sheets.map((sheet, index) => (
                        <tr key={sheet.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-sm text-gray-900">
                            {editingSheetId === sheet.id ? (
                              <input
                                type="text"
                                value={editingSheetName}
                                onChange={(e) => setEditingSheetName(e.target.value)}
                                onBlur={saveSheetName}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveSheetName()
                                  if (e.key === 'Escape') cancelEditingSheet()
                                }}
                                className="w-full px-1 py-0 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                autoFocus
                              />
                            ) : (
                              sheet.name
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end space-x-1">
                              {/* Edit button */}
                              <button
                                type="button"
                                onClick={() => startEditingSheet(sheet)}
                                className="p-1 text-gray-400 hover:text-gray-600"
                                title="Rename sheet"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              {/* Delete button */}
                              <button
                                type="button"
                                onClick={() => deleteSheet(sheet.id)}
                                className="p-1 text-gray-400 hover:text-red-600 disabled:text-gray-300"
                                disabled={sheets.length <= 1}
                                title={sheets.length <= 1 ? "Cannot delete the last sheet" : "Delete sheet"}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                              {/* Navigate button */}
                              <button
                                type="button"
                                onClick={() => navigateToSheet(sheet.id)}
                                className="p-1 text-gray-400 hover:text-blue-600"
                                title="Navigate to sheet"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              {/* Add Sheet button */}
              <button
                type="button"
                onClick={addSubsystemSheet}
                className="w-full px-3 py-2 border-2 border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors"
              >
                + Add Sheet
              </button>
            </div>
          </div>
  
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
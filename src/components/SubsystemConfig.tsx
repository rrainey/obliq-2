// components/SubsystemConfig.tsx
'use client'

import { useState } from 'react'
import { BlockData } from './BlockNode'
import { Sheet } from '@/lib/modelStore'
import { ModelParameter } from '@/lib/modelSchema'

interface SubsystemConfigProps {
  block: BlockData
  availableSheets?: Sheet[]
  onUpdate: (parameters: Record<string, any>) => void
  onRename?: (newName: string) => void
  onClose: () => void
  onSheetNavigate?: (sheetId: string) => void
}

// Code generation strategy options
type CodeGenStrategy = 'flatten' | 'segregated' | 'segregated_atomic'

const CODE_GEN_STRATEGY_OPTIONS: { value: CodeGenStrategy; label: string; description: string }[] = [
  { value: 'flatten', label: 'Flatten', description: 'Pulls all blocks into the top-level model (default)' },
  { value: 'segregated', label: 'Segregated', description: 'Keeps subsystem blocks separate during code generation' },
  { value: 'segregated_atomic', label: 'Segregated, atomic', description: 'Keeps subsystem blocks separate and treats them as atomic units' },
]

// Signal type options for parameters
const SIGNAL_TYPES = [
  { value: 'double', label: 'double' },
  { value: 'float', label: 'float' },
  { value: 'long', label: 'long' },
  { value: 'bool', label: 'bool' },
]

interface ParameterFormData {
  name: string
  signalType: string
  value: string
}

export default function SubsystemConfig({ block, availableSheets = [], onUpdate, onRename, onClose, onSheetNavigate }: SubsystemConfigProps) {
  // Initialize from block properties and parameters
  const [blockName, setBlockName] = useState(block.name)
  const [sheets, setSheets] = useState<Sheet[]>(block.parameters?.sheets || [])
  const [inputPorts, setInputPorts] = useState(block.parameters?.inputPorts || ['Input1'])
  const [outputPorts, setOutputPorts] = useState(block.parameters?.outputPorts || ['Output1'])
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null)
  const [editingSheetName, setEditingSheetName] = useState('')
  const [showEnableInput, setShowEnableInput] = useState(block.parameters?.showEnableInput || false)
  const [showPortNames, setShowPortNames] = useState(block.parameters?.showPortNames || false)
  const [codeGenStrategy, setCodeGenStrategy] = useState<CodeGenStrategy>(block.parameters?.codeGenStrategy || 'flatten')

  // Subsystem parameters state
  const [parameters, setParameters] = useState<ModelParameter[]>(block.parameters?.parameters || [])
  const [editingParamIndex, setEditingParamIndex] = useState<number | null>(null)
  const [addingParam, setAddingParam] = useState(false)
  const [paramFormData, setParamFormData] = useState<ParameterFormData>({
    name: '',
    signalType: 'double',
    value: '0'
  })
  const [paramFormError, setParamFormError] = useState<string | null>(null)
  const [showParameters, setShowParameters] = useState(false)

  // Helper to escape special regex characters
  const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  const handleSave = () => {
    // Check if block name changed
    const nameChanged = blockName !== block.name

    // If name changed, update internal sheet names to use the new name
    let updatedSheets = sheets
    if (nameChanged) {
      updatedSheets = sheets.map(sheet => {
        // Replace old block name with new name in sheet names
        // e.g., "Subsystem5 Main" -> "Integrate Main"
        const oldNamePattern = new RegExp(`^${escapeRegExp(block.name)}\\s+`)
        if (oldNamePattern.test(sheet.name)) {
          return { ...sheet, name: sheet.name.replace(oldNamePattern, `${blockName} `) }
        }
        return sheet
      })
    }

    // Parameters no longer include sheetName - block.name is the subsystem's name
    const blockParams = {
      sheets: updatedSheets,
      inputPorts: inputPorts.filter((port: string) => port.trim() !== ''),
      outputPorts: outputPorts.filter((port: string) => port.trim() !== ''),
      showEnableInput,
      showPortNames,
      codeGenStrategy,
      // Only include subsystem parameters for segregated subsystems
      parameters: (codeGenStrategy === 'segregated' || codeGenStrategy === 'segregated_atomic') ? parameters : []
    }
    onUpdate(blockParams)

    // Rename the block if name changed
    if (nameChanged && onRename) {
      onRename(blockName)
    }

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
      name: `${blockName} Sheet ${sheets.length + 1}`,
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

  // ============================================
  // Parameter Management Functions
  // ============================================

  const resetParamForm = () => {
    setParamFormData({ name: '', signalType: 'double', value: '0' })
    setParamFormError(null)
    setAddingParam(false)
    setEditingParamIndex(null)
  }

  const startEditingParam = (index: number) => {
    const param = parameters[index]
    setEditingParamIndex(index)
    setParamFormData({
      name: param.name,
      signalType: param.signalType,
      value: String(param.value)
    })
    setParamFormError(null)
  }

  const validateParamForm = (data: ParameterFormData, excludeIndex?: number): string | null => {
    // Validate name format
    if (!data.name.trim()) {
      return 'Parameter name cannot be empty'
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(data.name)) {
      return 'Parameter name must be a valid identifier (alphanumeric + underscore, starting with letter or underscore)'
    }

    // Check for duplicate names
    const existingIndex = parameters.findIndex(p => p.name === data.name)
    if (existingIndex !== -1 && existingIndex !== excludeIndex) {
      return `Parameter name "${data.name}" already exists`
    }

    // Validate value (scalar only for now)
    const num = parseFloat(data.value)
    if (isNaN(num)) {
      return 'Value must be a valid number'
    }

    return null
  }

  const handleAddParam = () => {
    const error = validateParamForm(paramFormData)
    if (error) {
      setParamFormError(error)
      return
    }

    const newParam: ModelParameter = {
      name: paramFormData.name,
      signalType: paramFormData.signalType,
      value: parseFloat(paramFormData.value)
    }

    setParameters([...parameters, newParam])
    resetParamForm()
  }

  const handleUpdateParam = () => {
    if (editingParamIndex === null) return

    const error = validateParamForm(paramFormData, editingParamIndex)
    if (error) {
      setParamFormError(error)
      return
    }

    const updatedParams = [...parameters]
    updatedParams[editingParamIndex] = {
      name: paramFormData.name,
      signalType: paramFormData.signalType,
      value: parseFloat(paramFormData.value)
    }

    setParameters(updatedParams)
    resetParamForm()
  }

  const handleDeleteParam = (index: number) => {
    const param = parameters[index]
    if (window.confirm(`Delete parameter "${param.name}"?`)) {
      setParameters(parameters.filter((_, i) => i !== index))
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-[900px] max-h-[80vh] overflow-y-auto">
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
              value={blockName}
              onChange={(e) => setBlockName(e.target.value)}
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

          {/* Enable Input Checkbox */}
          <div className="border-t pt-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showEnableInput}
                onChange={(e) => setShowEnableInput(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
              />
              <span className="text-sm font-medium text-gray-700">
                Show Enable Input
              </span>
            </label>
            <p className="mt-1 ml-6 text-xs text-gray-500">
              When enabled, adds a special boolean input port that controls whether the subsystem is active.
              When false, the subsystem's state is frozen.
            </p>
          </div>

          {/* Show Port Names Checkbox */}
          <div className="border-t pt-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showPortNames}
                onChange={(e) => setShowPortNames(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
              />
              <span className="text-sm font-medium text-gray-700">
                Show Port Names
              </span>
            </label>
            <p className="mt-1 ml-6 text-xs text-gray-500">
              When enabled, displays the names of connected Input/Output Port blocks next to each port.
            </p>
          </div>

          {/* Code Generation Strategy */}
          <div className="border-t pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Code Generation Strategy
            </label>
            <select
              value={codeGenStrategy}
              onChange={(e) => setCodeGenStrategy(e.target.value as CodeGenStrategy)}
              className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
            >
              {CODE_GEN_STRATEGY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {CODE_GEN_STRATEGY_OPTIONS.find(o => o.value === codeGenStrategy)?.description}
            </p>
          </div>

          {/* Subsystem Parameters - Only shown for segregated subsystems */}
          {(codeGenStrategy === 'segregated' || codeGenStrategy === 'segregated_atomic') && (
            <div className="border-t pt-4">
              <button
                type="button"
                onClick={() => setShowParameters(!showParameters)}
                className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-2"
              >
                <span>Subsystem Parameters</span>
                <svg
                  className={`w-4 h-4 transition-transform ${showParameters ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <p className="text-xs text-gray-500 mb-2">
                Define parameters scoped to this subsystem. They will be generated as #define statements in the subsystem header file.
              </p>

              {showParameters && (
                <div className="space-y-2">
                  {/* Parameter table */}
                  {(parameters.length > 0 || addingParam) && (
                    <div className="border border-gray-200 rounded-md overflow-hidden">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-20">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {parameters.map((param, index) => (
                            editingParamIndex === index ? (
                              // Edit mode row
                              <tr key={index}>
                                <td className="px-3 py-2">
                                  <input
                                    type="text"
                                    value={paramFormData.name}
                                    onChange={(e) => setParamFormData({ ...paramFormData, name: e.target.value })}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="NAME"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <select
                                    value={paramFormData.signalType}
                                    onChange={(e) => setParamFormData({ ...paramFormData, signalType: e.target.value })}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  >
                                    {SIGNAL_TYPES.map((t) => (
                                      <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="text"
                                    value={paramFormData.value}
                                    onChange={(e) => setParamFormData({ ...paramFormData, value: e.target.value })}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="0"
                                  />
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <div className="flex justify-end space-x-1">
                                    <button
                                      type="button"
                                      onClick={handleUpdateParam}
                                      className="p-1 text-green-600 hover:text-green-800"
                                      title="Save"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={resetParamForm}
                                      className="p-1 text-gray-400 hover:text-gray-600"
                                      title="Cancel"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              // Display mode row
                              <tr key={index} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-sm font-mono text-gray-900">{param.name}</td>
                                <td className="px-3 py-2 text-sm text-gray-500">{param.signalType}</td>
                                <td className="px-3 py-2 text-sm font-mono text-gray-900">{param.value}</td>
                                <td className="px-3 py-2 text-right">
                                  <div className="flex justify-end space-x-1">
                                    <button
                                      type="button"
                                      onClick={() => startEditingParam(index)}
                                      className="p-1 text-gray-400 hover:text-blue-600"
                                      title="Edit"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteParam(index)}
                                      className="p-1 text-gray-400 hover:text-red-600"
                                      title="Delete"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          ))}

                          {/* Add new parameter row */}
                          {addingParam && (
                            <tr>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={paramFormData.name}
                                  onChange={(e) => setParamFormData({ ...paramFormData, name: e.target.value })}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="MY_PARAM"
                                  autoFocus
                                />
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  value={paramFormData.signalType}
                                  onChange={(e) => setParamFormData({ ...paramFormData, signalType: e.target.value })}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                  {SIGNAL_TYPES.map((t) => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={paramFormData.value}
                                  onChange={(e) => setParamFormData({ ...paramFormData, value: e.target.value })}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <div className="flex justify-end space-x-1">
                                  <button
                                    type="button"
                                    onClick={handleAddParam}
                                    className="p-1 text-green-600 hover:text-green-800"
                                    title="Add"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={resetParamForm}
                                    className="p-1 text-gray-400 hover:text-gray-600"
                                    title="Cancel"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Error message */}
                  {paramFormError && (
                    <p className="text-sm text-red-600">{paramFormError}</p>
                  )}

                  {/* Add Parameter button */}
                  {!addingParam && editingParamIndex === null && (
                    <button
                      type="button"
                      onClick={() => setAddingParam(true)}
                      className="w-full px-3 py-2 border-2 border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors"
                    >
                      + Add Parameter
                    </button>
                  )}

                  {parameters.length === 0 && !addingParam && (
                    <p className="text-sm text-gray-500 text-center py-2">
                      No parameters defined. Click "Add Parameter" to create one.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

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
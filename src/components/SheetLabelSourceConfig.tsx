// components/SheetLabelSourceConfig.tsx
'use client'

import { useState } from 'react'
import { BlockData } from './Block'
import { getSheetLabelSinkInfo } from '@/lib/sheetLabelUtils'

interface SheetLabelSourceConfigProps {
  block: BlockData
  blocks: BlockData[]  // Current sheet blocks
  allSheetsBlocks?: BlockData[]  // All blocks across all sheets in the subsystem
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function SheetLabelSourceConfig({ 
  block, 
  blocks,
  allSheetsBlocks,
  onUpdate, 
  onClose 
}: SheetLabelSourceConfigProps) {
  const [selectedSignalName, setSelectedSignalName] = useState(
    block.parameters?.signalName || ''
  )

  // Use all sheets blocks if provided, otherwise fall back to current sheet
  const blocksToSearch = allSheetsBlocks || blocks
  
  // Get all available sink signal names across all sheets
  const availableSinks = getSheetLabelSinkInfo(blocksToSearch)
  
  const handleSave = () => {
    const parameters = {
      ...block.parameters,
      signalName: selectedSignalName
    }
    onUpdate(parameters)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-96">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Configure Sheet Label Source: {block.name}
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
              Signal Source
            </label>
            
            {availableSinks.length === 0 ? (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-800">
                  No Sheet Label Sinks found in this subsystem. 
                  Create a Sheet Label Sink first to capture a signal.
                </p>
              </div>
            ) : (
              <>
                <select
                  value={selectedSignalName}
                  onChange={(e) => setSelectedSignalName(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value="">Select a signal...</option>
                  {availableSinks.map(sink => (
                    <option key={sink.signalName} value={sink.signalName}>
                      {sink.signalName} (from {sink.blockName})
                    </option>
                  ))}
                </select>
                
                <p className="text-xs text-gray-500 mt-1">
                  Select which signal this source should output
                </p>
              </>
            )}
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-md p-3">
            <p className="text-sm text-purple-800">
              <strong>Sheet Label Source:</strong> Outputs the signal value from a 
              Sheet Label Sink with the matching signal name. The signal type is 
              inherited from the sink's input.
            </p>
          </div>

          {selectedSignalName && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3">
              <p className="text-sm text-green-800">
                <strong>Connected:</strong> This source will output the signal from 
                "{availableSinks.find(s => s.signalName === selectedSignalName)?.blockName}"
              </p>
            </div>
          )}
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
            disabled={availableSinks.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
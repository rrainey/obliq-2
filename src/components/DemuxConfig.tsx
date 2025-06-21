'use client'

import { BlockData } from './Block'

interface DemuxConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function DemuxConfig({ block, onUpdate, onClose }: DemuxConfigProps) {
  const outputCount = block?.parameters?.outputCount || 1
  const inputDimensions = block?.parameters?.inputDimensions || [1]
  
  // Determine the input type description
  const getInputTypeDescription = () => {
    if (inputDimensions.length === 1) {
      if (inputDimensions[0] === 1) {
        return 'Scalar'
      }
      return `Vector [${inputDimensions[0]}]`
    } else if (inputDimensions.length === 2) {
      return `Matrix [${inputDimensions[0]}×${inputDimensions[1]}]`
    }
    return 'Unknown'
  }

  const handleClose = () => {
    // Demux doesn't have editable parameters, just close
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-96">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Demux Block Information: {block?.name || 'Demux'}
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-md">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Current Configuration</h4>
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                <strong>Input Type:</strong> {getInputTypeDescription()}
              </p>
              <p className="text-sm text-gray-600">
                <strong>Output Ports:</strong> {outputCount}
              </p>
            </div>
          </div>

          <div className="bg-blue-50 p-3 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>Demux Block:</strong> This block automatically splits vector or matrix inputs into scalar outputs.
            </p>
            <p className="text-xs text-blue-700 mt-2">
              • Scalar input → 1 output<br/>
              • Vector [n] → n outputs<br/>
              • Matrix [m×n] → m×n outputs (row-major order)
            </p>
            <p className="text-xs text-blue-700 mt-2">
              The number of output ports updates automatically based on the connected input signal type.
            </p>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
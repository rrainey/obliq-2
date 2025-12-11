// components/OrientationConversionConfig.tsx

'use client'

import { useState, useEffect } from 'react'
import { BlockData } from './BlockNode'

interface OrientationConversionConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

const CONVERSION_TYPES = [
  {
    value: 'euler_to_dcm',
    label: 'Euler to DCM',
    description: 'Convert Euler angles (Phi, Theta, Psi) to Direction Cosine Matrix',
    inputs: '3 inputs: Phi_rad, Theta_rad, Psi_rad (double)',
    outputs: '1 output: DCM (double[3][3])'
  },
  {
    value: 'dcm_to_euler',
    label: 'DCM to Euler',
    description: 'Extract Euler angles from Direction Cosine Matrix',
    inputs: '1 input: DCM (double[3][3])',
    outputs: '3 outputs: Phi_rad, Theta_rad, Psi_rad (double)'
  },
  {
    value: 'euler_to_quat',
    label: 'Euler to Quaternion',
    description: 'Convert Euler angles to Quaternion (scalar-first)',
    inputs: '3 inputs: Phi_rad, Theta_rad, Psi_rad (double)',
    outputs: '1 output: q (double[4][1])'
  },
  {
    value: 'dcm_to_quat',
    label: 'DCM to Quaternion',
    description: 'Convert Direction Cosine Matrix to Quaternion',
    inputs: '1 input: DCM (double[3][3])',
    outputs: '1 output: q (double[4][1])'
  },
  {
    value: 'quat_to_euler',
    label: 'Quaternion to Euler',
    description: 'Extract Euler angles from Quaternion',
    inputs: '1 input: q (double[4][1])',
    outputs: '3 outputs: Phi_rad, Theta_rad, Psi_rad (double)'
  },
  {
    value: 'quat_to_dcm',
    label: 'Quaternion to DCM',
    description: 'Convert Quaternion to Direction Cosine Matrix',
    inputs: '1 input: q (double[4][1])',
    outputs: '1 output: DCM (double[3][3])'
  }
]

export default function OrientationConversionConfig({
  block,
  onUpdate,
  onClose
}: OrientationConversionConfigProps) {
  const [conversionType, setConversionType] = useState(
    block?.parameters?.conversionType || 'euler_to_dcm'
  )

  useEffect(() => {
    const firstSelect = document.querySelector('.fixed select') as HTMLElement
    if (firstSelect) {
      firstSelect.focus()
    }
  }, [])

  const handleSave = () => {
    const parameters = {
      conversionType
    }
    onUpdate(parameters)
    onClose()
  }

  const selectedConversion = CONVERSION_TYPES.find(c => c.value === conversionType)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-[550px]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Configure Orientation Conversion: {block?.name || 'Block'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Conversion Type
            </label>
            <select
              value={conversionType}
              onChange={(e) => setConversionType(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-sm bg-white text-gray-900 focus:outline-none focus:border-blue-600"
            >
              {CONVERSION_TYPES.map(conv => (
                <option key={conv.value} value={conv.value}>
                  {conv.label}
                </option>
              ))}
            </select>
          </div>

          {selectedConversion && (
            <div className="bg-blue-50 p-4 rounded-md space-y-3">
              <p className="text-sm font-medium text-blue-900">
                {selectedConversion.label}
              </p>
              <p className="text-sm text-blue-800">
                {selectedConversion.description}
              </p>
              <div className="text-sm text-blue-700 space-y-1">
                <p><strong>Inputs:</strong> {selectedConversion.inputs}</p>
                <p><strong>Outputs:</strong> {selectedConversion.outputs}</p>
              </div>
            </div>
          )}

          <div className="bg-gray-50 p-4 rounded-md">
            <p className="text-sm font-medium text-gray-900 mb-2">
              Coordinate System Convention
            </p>
            <div className="text-sm text-gray-700 space-y-1">
              <p><strong>Body Frame:</strong> +X forward, +Y right wing, +Z down</p>
              <p><strong>Local Frame:</strong> North=+X, East=+Y, Down=+Z (NED)</p>
              <p><strong>Rotation Sequence:</strong> ZYX (Yaw-Pitch-Roll)</p>
              <p><strong>Euler Angles:</strong></p>
              <ul className="list-disc list-inside ml-2">
                <li>Phi (roll): rotation about X-axis</li>
                <li>Theta (pitch): rotation about Y-axis</li>
                <li>Psi (yaw): rotation about Z-axis</li>
              </ul>
            </div>
          </div>

          <div className="bg-yellow-50 p-3 rounded-md">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Quaternion format is scalar-first: q = [q0, q1, q2, q3]
              where q0 is the scalar component. All angles are in radians.
              Normalization of quaternions is assumed to be performed elsewhere.
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

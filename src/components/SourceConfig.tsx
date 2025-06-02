'use client'

import { useState, useEffect } from 'react'
import { BlockData } from './Block'
import { isValidType, getTypeValidationError, parseType } from '@/lib/typeValidator'

interface SourceConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function SourceConfig({ block, onUpdate, onClose }: SourceConfigProps) {
  const [signalType, setSignalType] = useState(block?.parameters?.signalType || 'constant')
  const [dataType, setDataType] = useState(block?.parameters?.dataType || 'double')
  const [value, setValue] = useState(block?.parameters?.value || 0)
  const [valueString, setValueString] = useState('')
  const [stepTime, setStepTime] = useState(block?.parameters?.stepTime || 1.0)
  const [stepValue, setStepValue] = useState(block?.parameters?.stepValue || 1.0)
  const [slope, setSlope] = useState(block?.parameters?.slope || 1.0)
  const [startTime, setStartTime] = useState(block?.parameters?.startTime || 0)
  const [frequency, setFrequency] = useState(block?.parameters?.frequency || 1.0)
  const [amplitude, setAmplitude] = useState(block?.parameters?.amplitude || 1.0)
  const [phase, setPhase] = useState(block?.parameters?.phase || 0)
  const [offset, setOffset] = useState(block?.parameters?.offset || 0)
  const [f0, setF0] = useState(block?.parameters?.f0 || 0.1)
  const [f1, setF1] = useState(block?.parameters?.f1 || 10)
  const [duration, setDuration] = useState(block?.parameters?.duration || 10)
  const [mean, setMean] = useState(block?.parameters?.mean || 0)
  const [typeError, setTypeError] = useState<string>('')
  const [valueError, setValueError] = useState<string>('')
  const [isVector, setIsVector] = useState(false)

  // Initialize value string based on existing value
  useEffect(() => {
    if (Array.isArray(block?.parameters?.value)) {
      setValueString(`[${block.parameters.value.join(', ')}]`)
    } else {
      setValueString(String(block?.parameters?.value || 0))
    }
  }, [])

  // Validate type and determine if it's a vector
  useEffect(() => {
    const error = getTypeValidationError(dataType)
    setTypeError(error)
    
    if (!error) {
      try {
        const parsedType = parseType(dataType)
        setIsVector(parsedType.isArray)
      } catch {
        setIsVector(false)
      }
    }
  }, [dataType])

  // Parse value string based on whether it's a vector or scalar
  const parseValue = (input: string): { value: number | number[], error: string } => {
    const trimmed = input.trim()
    
    if (isVector) {
      // Parse vector value: [1.0, 2.0, 3.0] or {1.0, 2.0, 3.0}
      const vectorMatch = trimmed.match(/^[\[\{]\s*(.+?)\s*[\]\}]$/)
      if (!vectorMatch) {
        return { value: 0, error: 'Vector values must be enclosed in brackets: [1.0, 2.0, 3.0]' }
      }
      
      const elementsStr = vectorMatch[1]
      const elements = elementsStr.split(',').map(s => s.trim())
      
      // Parse each element
      const values: number[] = []
      for (const element of elements) {
        const num = parseFloat(element)
        if (isNaN(num)) {
          return { value: 0, error: `Invalid number: ${element}` }
        }
        values.push(num)
      }
      
      // Check array size if specified
      try {
        const parsedType = parseType(dataType)
        if (parsedType.arraySize && values.length !== parsedType.arraySize) {
          return { 
            value: 0, 
            error: `Expected ${parsedType.arraySize} elements, got ${values.length}` 
          }
        }
      } catch {
        // Type parsing error already handled elsewhere
      }
      
      return { value: values, error: '' }
    } else {
      // Parse scalar value
      const num = parseFloat(trimmed)
      if (isNaN(num)) {
        return { value: 0, error: 'Invalid number' }
      }
      return { value: num, error: '' }
    }
  }

  // Validate value when it changes
  useEffect(() => {
    const result = parseValue(valueString)
    setValue(result.value)
    setValueError(result.error)
  }, [valueString, isVector, dataType])

  const handleSave = () => {
    const parameters = {
      signalType,
      dataType,
      value,
      stepTime,
      stepValue,
      slope,
      startTime,
      frequency,
      amplitude,
      phase,
      offset,
      f0,
      f1,
      duration,
      mean
    }
    onUpdate(parameters)
    onClose()
  }

  const renderSignalSpecificControls = () => {
    switch (signalType) {
      case 'constant':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Value
              </label>
              <input
                type="text"
                value={valueString}
                onChange={(e) => setValueString(e.target.value)}
                className={`w-full px-3 py-2 border-2 rounded-md text-sm bg-white text-gray-900 focus:outline-none ${
                  valueError ? 'border-red-500 focus:border-red-600' : 'border-gray-400 focus:border-blue-600'
                }`}
                placeholder={isVector ? "[1.0, 2.0, 3.0]" : "0.0"}
              />
              {valueError ? (
                <p className="text-xs text-red-600 mt-1">{valueError}</p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  {isVector 
                    ? "Vector constant (e.g., [1.0, 2.0, 3.0])" 
                    : "Constant output value"}
                </p>
              )}
            </div>
          </div>
        )

      case 'step':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Step Time (s)
              </label>
              <input
                type="number"
                step="any"
                value={stepTime}
                onChange={(e) => setStepTime(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-md text-sm bg-white text-gray-800 focus:border-blue-500 focus:outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">Time when step occurs</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Step Value
              </label>
              <input
                type="number"
                step="any"
                value={stepValue}
                onChange={(e) => setStepValue(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                {isVector 
                  ? "Value applied to all vector elements after step time" 
                  : "Value after step time"}
              </p>
            </div>
          </div>
        )

      case 'ramp':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slope
              </label>
              <input
                type="number"
                step="any"
                value={slope}
                onChange={(e) => setSlope(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                {isVector 
                  ? "Rate of change for all elements (units/second)" 
                  : "Rate of change (units/second)"}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time (s)
              </label>
              <input
                type="number"
                step="any"
                value={startTime}
                onChange={(e) => setStartTime(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Time when ramp begins</p>
            </div>
          </div>
        )

      case 'sine':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frequency (Hz)
              </label>
              <input
                type="number"
                step="any"
                value={frequency}
                onChange={(e) => setFrequency(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amplitude
              </label>
              <input
                type="number"
                step="any"
                value={amplitude}
                onChange={(e) => setAmplitude(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              {isVector && (
                <p className="text-xs text-gray-500 mt-1">Applied to all vector elements</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phase (rad)
              </label>
              <input
                type="number"
                step="any"
                value={phase}
                onChange={(e) => setPhase(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Phase shift in radians</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Offset
              </label>
              <input
                type="number"
                step="any"
                value={offset}
                onChange={(e) => setOffset(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">DC offset</p>
            </div>
          </div>
        )

      case 'square':
      case 'triangle':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frequency (Hz)
              </label>
              <input
                type="number"
                step="any"
                value={frequency}
                onChange={(e) => setFrequency(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amplitude
              </label>
              <input
                type="number"
                step="any"
                value={amplitude}
                onChange={(e) => setAmplitude(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              {isVector && (
                <p className="text-xs text-gray-500 mt-1">Applied to all vector elements</p>
              )}
            </div>
          </div>
        )

      case 'noise':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amplitude
              </label>
              <input
                type="number"
                step="any"
                value={amplitude}
                onChange={(e) => setAmplitude(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                {isVector 
                  ? "Noise amplitude (±) for each element" 
                  : "Noise amplitude (±)"}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mean
              </label>
              <input
                type="number"
                step="any"
                value={mean}
                onChange={(e) => setMean(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Average value</p>
            </div>
          </div>
        )

      case 'chirp':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Frequency (Hz)
              </label>
              <input
                type="number"
                step="any"
                value={f0}
                onChange={(e) => setF0(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Frequency (Hz)
              </label>
              <input
                type="number"
                step="any"
                value={f1}
                onChange={(e) => setF1(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duration (s)
              </label>
              <input
                type="number"
                step="any"
                value={duration}
                onChange={(e) => setDuration(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amplitude
              </label>
              <input
                type="number"
                step="any"
                value={amplitude}
                onChange={(e) => setAmplitude(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              {isVector && (
                <p className="text-xs text-gray-500 mt-1">Applied to all vector elements</p>
              )}
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-96 max-h-96 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Configure Source: {block?.name || 'Source Block'}
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
              Data Type
            </label>
            <input
              type="text"
              value={dataType}
              onChange={(e) => setDataType(e.target.value)}
              className={`w-full px-3 py-2 border-2 rounded-md text-sm bg-white text-gray-900 focus:outline-none ${
                typeError ? 'border-red-500 focus:border-red-600' : 'border-gray-400 focus:border-blue-600'
              }`}
              placeholder="e.g., double, float, double[3]"
            />
            {typeError ? (
              <p className="text-xs text-red-600 mt-1">{typeError}</p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                C-style data type (e.g., float, double, long, bool, double[3])
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Signal Type
            </label>
            <select
              value={signalType}
              onChange={(e) => setSignalType(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
            >
              <option value="constant">Constant</option>
              <option value="step">Step</option>
              <option value="ramp">Ramp</option>
              <option value="sine">Sine Wave</option>
              <option value="square">Square Wave</option>
              <option value="triangle">Triangle Wave</option>
              <option value="noise">Noise</option>
              <option value="chirp">Chirp</option>
            </select>
          </div>

          {renderSignalSpecificControls()}

          <div className="bg-green-50 p-3 rounded-md">
            <p className="text-sm text-green-800">
              <strong>Source Block:</strong> Generates time-varying signals for simulation testing and analysis.
              {isVector && " For vector types, constant values use C-style array notation: [1.0, 2.0, 3.0]"}
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
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            disabled={!!typeError || !!valueError}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
// components/ConditionConfig.tsx

'use client'

import { useState } from 'react'
import { BlockData } from './BlockNode'

interface ConditionConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function ConditionConfig({ block, onUpdate, onClose }: ConditionConfigProps) {
  const [condition, setCondition] = useState(block?.parameters?.condition || '> 0')
  const [isValid, setIsValid] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const validateCondition = (value: string): boolean => {
    // Check if the condition matches the expected format
    const operatorMatch = value.match(/^\s*(>|<|>=|<=|==|!=)\s*(.+)$/)
    
    if (!operatorMatch) {
      setErrorMessage('Invalid format. Use: operator value (e.g., "> 10.0")')
      setIsValid(false)
      return false
    }
    
    const operator = operatorMatch[1]
    const comparisonValue = operatorMatch[2].trim()
    
    // Validate the comparison value is a valid C-style constant
    // Allow integers, floats, and common suffixes (f, F, L, l)
    const valuePattern = /^-?\d+(\.\d+)?([eE][+-]?\d+)?[fFlL]?$/
    
    if (!valuePattern.test(comparisonValue)) {
      setErrorMessage('Invalid value. Use a numeric constant (e.g., 10, 3.14, 1.0f)')
      setIsValid(false)
      return false
    }
    
    setErrorMessage('')
    setIsValid(true)
    return true
  }

  const handleConditionChange = (value: string) => {
    setCondition(value)
    validateCondition(value)
  }

  const handleSave = () => {
    if (validateCondition(condition)) {
      onUpdate({ condition })
      onClose()
    }
  }

  // Predefined examples for quick selection
  const examples = [
    { label: 'Greater than zero', value: '> 0' },
    { label: 'Less than zero', value: '< 0' },
    { label: 'Greater than 10', value: '> 10.0' },
    { label: 'Less than -5', value: '< -5.0' },
    { label: 'Equal to 1', value: '== 1.0' },
    { label: 'Not equal to 0', value: '!= 0' },
    { label: 'Greater or equal 100', value: '>= 100.0' },
    { label: 'Less or equal 0.5', value: '<= 0.5' },
  ]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-[500px]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Configure Condition: {block?.name || 'Condition'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* Condition Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Condition (x1 {`<operator> <value>`})
            </label>
            <input
              type="text"
              value={condition}
              onChange={(e) => handleConditionChange(e.target.value)}
              className={`w-full px-3 py-2 border-2 rounded text-sm bg-white text-gray-900 focus:outline-none ${
                isValid 
                  ? 'border-gray-400 focus:border-blue-600' 
                  : 'border-red-500 focus:border-red-600'
              }`}
              placeholder="> 10.0"
            />
            {!isValid && (
              <p className="text-sm text-red-600 mt-1">{errorMessage}</p>
            )}
            <p className="text-xs text-gray-600 mt-1">
              Enter a comparison operator (&gt;, &lt;, &gt;=, &lt;=, ==, !=) followed by a numeric value
            </p>
          </div>

          {/* Quick Examples */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quick Examples
            </label>
            <div className="grid grid-cols-2 gap-2">
              {examples.map((example) => (
                <button
                  key={example.value}
                  onClick={() => handleConditionChange(example.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 text-left"
                >
                  <div className="font-medium text-gray-900">{example.label}</div>
                  <div className="text-xs text-gray-600 font-mono">{example.value}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Help Text */}
          <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong>Condition Block:</strong> Outputs true when the input signal (x1) satisfies 
              the specified condition. The output is a boolean signal that can be used with 
              control blocks like the If block.
            </p>
            <p className="text-sm text-blue-800 mt-2">
              <strong>Example:</strong> If condition is "&gt; 10.0", the block outputs true when 
              the input is greater than 10.0, and false otherwise.
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
            disabled={!isValid}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              isValid
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
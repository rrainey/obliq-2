// components/EvaluateConfig.tsx

'use client'

import { useState, useEffect } from 'react'
import { BlockData } from './BlockNode'
import { C99ExpressionParser } from '@/lib/c99ExpressionParser'
import { C99ExpressionValidator } from '@/lib/c99ExpressionValidator'

interface EvaluateConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function EvaluateConfig({ block, onUpdate, onClose }: EvaluateConfigProps) {
  const [numInputs, setNumInputs] = useState(block?.parameters?.numInputs || 2)
  const [expression, setExpression] = useState(block?.parameters?.expression || 'in(0) + in(1)')
  const [isValid, setIsValid] = useState(true)
  const [errors, setErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [usedInputs, setUsedInputs] = useState<number[]>([])

  // Validate expression on change
  useEffect(() => {
    validateExpression()
  }, [expression, numInputs])

  const validateExpression = () => {
    try {
      // Parse the expression
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()
      
      // Validate it
      const validator = new C99ExpressionValidator(numInputs)
      const result = validator.validate(ast)
      
      setIsValid(result.valid)
      setErrors(result.errors)
      setWarnings(result.warnings)
      setUsedInputs(Array.from(result.usedInputs).sort((a, b) => a - b))
      
    } catch (error) {
      setIsValid(false)
      setErrors([error instanceof Error ? error.message : 'Invalid expression'])
      setWarnings([])
      setUsedInputs([])
    }
  }

  const handleNumInputsChange = (value: string) => {
    const num = parseInt(value)
    if (!isNaN(num) && num >= 1 && num <= 10) {
      setNumInputs(num)
    }
  }

  const handleSave = () => {
    if (isValid) {
      onUpdate({ numInputs, expression })
      onClose()
    }
  }

  // Expression templates
  const templates = [
    { name: 'Sum', expr: 'in(0) + in(1)', inputs: 2 },
    { name: 'Difference', expr: 'in(0) - in(1)', inputs: 2 },
    { name: 'Product', expr: 'in(0) * in(1)', inputs: 2 },
    { name: 'Average', expr: '(in(0) + in(1)) / 2', inputs: 2 },
    { name: 'Max', expr: 'in(0) > in(1) ? in(0) : in(1)', inputs: 2 },
    { name: 'Min', expr: 'in(0) < in(1) ? in(0) : in(1)', inputs: 2 },
    { name: 'Clamp', expr: 'in(0) < in(1) ? in(1) : (in(0) > in(2) ? in(2) : in(0))', inputs: 3 },
    { name: 'Weighted Sum', expr: 'in(0) * 0.7 + in(1) * 0.3', inputs: 2 },
    { name: 'Logic AND', expr: 'in(0) && in(1)', inputs: 2 },
    { name: 'Logic OR', expr: 'in(0) || in(1)', inputs: 2 },
    { name: 'Threshold', expr: 'in(0) > 0.5 ? 1 : 0', inputs: 1 },
    { name: 'Deadband', expr: '(in(0) > -0.1 && in(0) < 0.1) ? 0 : in(0)', inputs: 1 },
    { name: 'Rate Limiter', expr: 'in(1) > 0 ? (in(0) > in(2) ? in(2) : in(0)) : (in(0) < -in(2) ? -in(2) : in(0))', inputs: 3 },
    { name: 'Schmitt Trigger', expr: 'in(2) ? (in(0) < in(1) ? 0 : in(2)) : (in(0) > in(1) + 0.1 ? 1 : in(2))', inputs: 3 },
    { name: 'Square Root', expr: 'sqrt(in(0))', inputs: 1 },
    { name: 'Power', expr: 'pow(in(0), in(1))', inputs: 2 },
    { name: 'Sine Wave', expr: 'sin(in(0))', inputs: 1 },
    { name: 'Cosine Wave', expr: 'cos(in(0))', inputs: 1 },
    { name: 'Magnitude', expr: 'sqrt(pow(in(0), 2) + pow(in(1), 2))', inputs: 2 },
    { name: 'Angle', expr: 'atan2(in(1), in(0))', inputs: 2 },
    { name: 'Logarithmic', expr: 'log10(in(0))', inputs: 1 },
    { name: 'Exponential', expr: 'pow(2.718281828, in(0))', inputs: 1 },
    { name: 'Saturate', expr: 'fmax(fmin(in(0), in(1)), in(2))', inputs: 3 },
    { name: 'Sign', expr: 'signbit(in(0)) ? -1 : 1', inputs: 1 },
    { name: 'Absolute Value', expr: 'fabs(in(0))', inputs: 1 },
    { name: 'Round to Integer', expr: 'round(in(0))', inputs: 1 },
    ]

  const applyTemplate = (template: typeof templates[0]) => {
    setNumInputs(template.inputs)
    setExpression(template.expr)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-[700px] max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Configure Evaluate: {block?.name || 'Evaluate'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* Number of Inputs */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Number of Inputs
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={numInputs}
              onChange={(e) => handleNumInputsChange(e.target.value)}
              className="w-24 px-3 py-2 border-2 border-gray-400 rounded text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
            />
            <p className="text-xs text-gray-600 mt-1">
              Number of scalar input ports (1-10)
            </p>
          </div>

          {/* Expression Editor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Expression
            </label>
            <textarea
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              className={`w-full px-3 py-2 border-2 rounded text-sm font-mono bg-white text-gray-900 focus:outline-none ${
                isValid 
                  ? 'border-gray-400 focus:border-blue-600' 
                  : 'border-red-500 focus:border-red-600'
              }`}
              rows={4}
              placeholder="e.g., in(0) + in(1) * 2"
            />
            
            {/* Validation Messages */}
            {errors.length > 0 && (
              <div className="mt-2 space-y-1">
                {errors.map((error, i) => (
                  <p key={i} className="text-sm text-red-600">❌ {error}</p>
                ))}
              </div>
            )}
            
            {warnings.length > 0 && (
              <div className="mt-2 space-y-1">
                {warnings.map((warning, i) => (
                  <p key={i} className="text-sm text-yellow-600">⚠️ {warning}</p>
                ))}
              </div>
            )}
            
            {isValid && usedInputs.length > 0 && (
              <p className="text-sm text-green-600 mt-2">
                ✓ Valid expression using inputs: {usedInputs.map(i => `in(${i})`).join(', ')}
              </p>
            )}
          </div>

          {/* Quick Reference */}
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <h5 className="font-medium text-gray-900 mb-1">Input Access</h5>
              <p className="text-gray-600">• in(0) - First input</p>
              <p className="text-gray-600">• in(1) - Second input</p>
              <p className="text-gray-600">• in(n) - (n+1)th input</p>
            </div>
            <div>
              <h5 className="font-medium text-gray-900 mb-1">Operators</h5>
              <p className="text-gray-600">• + - * / % (arithmetic)</p>
              <p className="text-gray-600">• {'<'} {'>'} {'<='} {'>='} == != (comparison)</p>
              <p className="text-gray-600">• && || ! (logical)</p>
              <p className="text-gray-600">• & | ^ ~ {'<<'} {'>>'} (bitwise)</p>
              <p className="text-gray-600">• ? : (conditional)</p>
            </div>
            <div>
              <h5 className="font-medium text-gray-900 mb-1">Math Functions</h5>
              <p className="text-gray-600">• sqrt, pow, abs, fabs</p>
              <p className="text-gray-600">• sin, cos, tan, atan, atan2</p>
              <p className="text-gray-600">• ceil, floor, round, trunc</p>
              <p className="text-gray-600">• log, log2, log10</p>
              <p className="text-gray-600">• fmin, fmax, signbit</p>
            </div>
          </div>

          {/* Expression Templates */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Expression Templates</h4>
            <div className="grid grid-cols-3 gap-2">
              {templates.map((template) => (
                <button
                  key={template.name}
                  onClick={() => applyTemplate(template)}
                  className="px-3 py-2 text-xs border border-gray-300 rounded hover:bg-gray-50 text-left"
                  title={template.expr}
                >
                  <div className="font-medium text-gray-900">{template.name}</div>
                  <div className="text-gray-500">({template.inputs} inputs)</div>
                </button>
              ))}
            </div>
          </div>

          {/* Help Text */}
          <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong>Evaluate Block:</strong> Computes an output value using a C-style arithmetic/logical expression. 
              Use in(n) to access the nth input (0-indexed). The expression is evaluated at each simulation step.
            </p>
            <p className="text-sm text-blue-800 mt-2">
              <strong>Example:</strong> Expression "(in(0) + in(1)) / 2" computes the average of two inputs.
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
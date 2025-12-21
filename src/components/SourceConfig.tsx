'use client'

import { useState, useEffect } from 'react'
import { Modal, TextInput, NumberInput, Select, Button, Stack, Group, Alert } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'
import { getTypeValidationError, parseType } from '@/lib/typeValidator'
import { useModelStore } from '@/lib/modelStore'

interface SourceConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

const SIGNAL_TYPES = [
  { value: 'constant', label: 'Constant' },
  { value: 'step', label: 'Step' },
  { value: 'ramp', label: 'Ramp' },
  { value: 'sine', label: 'Sine Wave' },
  { value: 'square', label: 'Square Wave' },
  { value: 'triangle', label: 'Triangle Wave' },
  { value: 'noise', label: 'Noise' },
  { value: 'chirp', label: 'Chirp' },
]

export default function SourceConfig({ block, onUpdate, onClose }: SourceConfigProps) {
  const parameters = useModelStore((state) => state.parameters)

  const [signalType, setSignalType] = useState(block?.parameters?.signalType || 'constant')
  const [dataType, setDataType] = useState(block?.parameters?.dataType || 'double')
  const [value, setValue] = useState(block?.parameters?.value || 0)
  const [valueString, setValueString] = useState('')
  const [useParameter, setUseParameter] = useState(block?.parameters?.useParameter || false)
  const [parameterName, setParameterName] = useState(block?.parameters?.parameterName || '')
  const [stepTime, setStepTime] = useState<number>(block?.parameters?.stepTime || 1.0)
  const [stepValue, setStepValue] = useState<number>(block?.parameters?.stepValue || 1.0)
  const [slope, setSlope] = useState<number>(block?.parameters?.slope || 1.0)
  const [startValue, setStartValue] = useState<number>(block?.parameters?.startValue || 0)
  const [frequency, setFrequency] = useState<number>(block?.parameters?.frequency || 1.0)
  const [amplitude, setAmplitude] = useState<number>(block?.parameters?.amplitude || 1.0)
  const [f0, setF0] = useState<number>(block?.parameters?.f0 || 0.1)
  const [f1, setF1] = useState<number>(block?.parameters?.f1 || 10)
  const [duration, setDuration] = useState<number>(block?.parameters?.duration || 10)
  const [mean, setMean] = useState<number>(block?.parameters?.mean || 0)
  const [typeError, setTypeError] = useState<string>('')
  const [valueError, setValueError] = useState<string>('')
  const [isVector, setIsVector] = useState(false)
  const [isMatrix, setIsMatrix] = useState(false)
  const [matrixDims, setMatrixDims] = useState<{ rows: number; cols: number } | null>(null)

  // Initialize value string based on existing value
  useEffect(() => {
    if (block?.parameters?.useParameter && block?.parameters?.parameterName) {
      setValueString(block.parameters.parameterName)
    } else if (Array.isArray(block?.parameters?.value)) {
      if (block.parameters.value.length > 0 && Array.isArray(block.parameters.value[0])) {
        const rows = block.parameters.value.map((row: number[]) => `{${row.join(', ')}}`).join(', ')
        setValueString(`{${rows}}`)
      } else {
        setValueString(`[${block.parameters.value.join(', ')}]`)
      }
    } else {
      setValueString(String(block?.parameters?.value || 0))
    }
  }, [])

  // Validate type and determine if it's a vector or matrix
  useEffect(() => {
    const error = getTypeValidationError(dataType)
    setTypeError(error)

    if (!error) {
      try {
        const parsedType = parseType(dataType)
        setIsVector(parsedType.isArray)
        setIsMatrix(parsedType.isMatrix || false)
        if (parsedType.isMatrix && parsedType.rows && parsedType.cols) {
          setMatrixDims({ rows: parsedType.rows, cols: parsedType.cols })
        } else {
          setMatrixDims(null)
        }
      } catch {
        setIsVector(false)
        setIsMatrix(false)
        setMatrixDims(null)
      }
    }
  }, [dataType])

  // Auto-sync dataType when parameter reference is detected
  useEffect(() => {
    if (useParameter && parameterName) {
      const param = parameters.find(p => p.name === parameterName)
      if (param && param.signalType !== dataType) {
        setDataType(param.signalType)
      }
    }
  }, [useParameter, parameterName, parameters])

  const isParameterReference = (input: string): boolean => {
    const trimmed = input.trim()
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)
  }

  const parseValue = (input: string): { value: number | number[] | number[][], error: string, isParameter?: boolean } => {
    const trimmed = input.trim()

    if (!isVector && !isMatrix && isParameterReference(trimmed)) {
      const param = parameters.find(p => p.name === trimmed)
      if (param) {
        if (param.signalType !== dataType) {
          setDataType(param.signalType)
        }
        return { value: param.value as number, error: '', isParameter: true }
      } else {
        return { value: 0, error: `Parameter "${trimmed}" not found`, isParameter: true }
      }
    }

    if (isMatrix && matrixDims) {
      const matrixMatch = trimmed.match(/^\{\s*(.+)\s*\}$/)
      if (!matrixMatch) {
        return { value: 0, error: 'Matrix values must be enclosed in braces: {{1.0, 2.0}, {3.0, 4.0}}' }
      }

      const content = matrixMatch[1]
      const rowRegex = /\{([^}]+)\}/g
      const rows: number[][] = []
      let match

      while ((match = rowRegex.exec(content)) !== null) {
        const rowContent = match[1]
        const elements = rowContent.split(',').map(s => s.trim())

        const rowValues: number[] = []
        for (const element of elements) {
          const num = parseFloat(element)
          if (isNaN(num)) {
            return { value: 0, error: `Invalid number in matrix: ${element}` }
          }
          rowValues.push(num)
        }

        if (rowValues.length !== matrixDims.cols) {
          return { value: 0, error: `Row ${rows.length + 1} has ${rowValues.length} columns, expected ${matrixDims.cols}` }
        }

        rows.push(rowValues)
      }

      if (rows.length !== matrixDims.rows) {
        return { value: 0, error: `Expected ${matrixDims.rows} rows, got ${rows.length}` }
      }

      return { value: rows, error: '' }
    } else if (isVector) {
      const vectorMatch = trimmed.match(/^[\[\{]\s*(.+?)\s*[\]\}]$/)
      if (!vectorMatch) {
        return { value: 0, error: 'Vector values must be enclosed in brackets: [1.0, 2.0, 3.0]' }
      }

      const elementsStr = vectorMatch[1]
      const elements = elementsStr.split(',').map(s => s.trim())

      const values: number[] = []
      for (const element of elements) {
        const num = parseFloat(element)
        if (isNaN(num)) {
          return { value: 0, error: `Invalid number: ${element}` }
        }
        values.push(num)
      }

      try {
        const parsedType = parseType(dataType)
        if (parsedType.arraySize && values.length !== parsedType.arraySize) {
          return { value: 0, error: `Expected ${parsedType.arraySize} elements, got ${values.length}` }
        }
      } catch {
        // Type parsing error already handled elsewhere
      }

      return { value: values, error: '' }
    } else {
      const num = parseFloat(trimmed)
      if (isNaN(num)) {
        return { value: 0, error: 'Invalid number' }
      }
      return { value: num, error: '' }
    }
  }

  useEffect(() => {
    const result = parseValue(valueString)
    setValue(result.value)
    setValueError(result.error)

    if (result.isParameter && !result.error) {
      setUseParameter(true)
      setParameterName(valueString.trim())
    } else {
      setUseParameter(false)
      setParameterName('')
    }
  }, [valueString, isVector, isMatrix, dataType, parameters])

  const handleSave = () => {
    const params = {
      signalType,
      dataType,
      value,
      useParameter,
      parameterName: useParameter ? parameterName : undefined,
      stepTime,
      stepValue,
      slope,
      startValue,
      frequency,
      amplitude,
      f0,
      f1,
      duration,
      mean
    }
    onUpdate(params)
    onClose()
  }

  const renderSignalSpecificControls = () => {
    switch (signalType) {
      case 'constant':
        return (
          <TextInput
            label="Value"
            value={valueString}
            onChange={(e) => setValueString(e.target.value)}
            error={valueError}
            placeholder={
              isMatrix ? "{{1.0, 2.0}, {3.0, 4.0}}" :
              isVector ? "[1.0, 2.0, 3.0]" :
              "0.0"
            }
            description={
              useParameter && !valueError
                ? `Using parameter "${parameterName}" - type auto-synced to ${dataType}`
                : isMatrix
                ? `Matrix constant (e.g., {{1.0, 2.0}, {3.0, 4.0}} for ${matrixDims?.rows}x${matrixDims?.cols})`
                : isVector
                ? "Vector constant (e.g., [1.0, 2.0, 3.0])"
                : "Constant output value or parameter name (e.g., PI, GAIN)"
            }
          />
        )

      case 'step':
        return (
          <Stack gap="xs">
            <NumberInput
              label="Step Time (s)"
              value={stepTime}
              onChange={(val) => setStepTime(typeof val === 'number' ? val : 0)}
              decimalScale={6}
              description="Time when step occurs"
            />
            <NumberInput
              label="Step Value"
              value={stepValue}
              onChange={(val) => setStepValue(typeof val === 'number' ? val : 0)}
              decimalScale={6}
              description={
                isMatrix ? "Value applied to all matrix elements after step time" :
                isVector ? "Value applied to all vector elements after step time" :
                "Value after step time"
              }
            />
          </Stack>
        )

      case 'ramp':
        return (
          <Stack gap="xs">
            <NumberInput
              label="Starting Value"
              value={startValue}
              onChange={(val) => setStartValue(typeof val === 'number' ? val : 0)}
              decimalScale={6}
              description="Initial value before ramp begins"
            />
            <NumberInput
              label="Ramp Slope"
              value={slope}
              onChange={(val) => setSlope(typeof val === 'number' ? val : 0)}
              decimalScale={6}
              description="Rate of change (units/second)"
            />
          </Stack>
        )

      case 'sine':
        return (
          <Stack gap="xs">
            <NumberInput
              label="Frequency (Hz)"
              value={frequency}
              onChange={(val) => setFrequency(typeof val === 'number' ? val : 0)}
              decimalScale={6}
              description="Sine wave frequency in Hertz"
            />
            <NumberInput
              label="Scale (peak value)"
              value={amplitude}
              onChange={(val) => setAmplitude(typeof val === 'number' ? val : 0)}
              decimalScale={6}
              description="Peak amplitude of the sine wave"
            />
          </Stack>
        )

      case 'square':
      case 'triangle':
        return (
          <Stack gap="xs">
            <NumberInput
              label="Frequency (Hz)"
              value={frequency}
              onChange={(val) => setFrequency(typeof val === 'number' ? val : 0)}
              decimalScale={6}
            />
            <NumberInput
              label="Amplitude"
              value={amplitude}
              onChange={(val) => setAmplitude(typeof val === 'number' ? val : 0)}
              decimalScale={6}
              description={(isVector || isMatrix) ? "Applied to all elements" : undefined}
            />
          </Stack>
        )

      case 'noise':
        return (
          <Stack gap="xs">
            <NumberInput
              label="Amplitude"
              value={amplitude}
              onChange={(val) => setAmplitude(typeof val === 'number' ? val : 0)}
              decimalScale={6}
              description={
                isMatrix ? "Noise amplitude for each matrix element" :
                isVector ? "Noise amplitude for each element" :
                "Noise amplitude"
              }
            />
            <NumberInput
              label="Mean"
              value={mean}
              onChange={(val) => setMean(typeof val === 'number' ? val : 0)}
              decimalScale={6}
              description="Average value"
            />
          </Stack>
        )

      case 'chirp':
        return (
          <Stack gap="xs">
            <NumberInput
              label="Start Frequency (Hz)"
              value={f0}
              onChange={(val) => setF0(typeof val === 'number' ? val : 0)}
              decimalScale={6}
            />
            <NumberInput
              label="End Frequency (Hz)"
              value={f1}
              onChange={(val) => setF1(typeof val === 'number' ? val : 0)}
              decimalScale={6}
            />
            <NumberInput
              label="Duration (s)"
              value={duration}
              onChange={(val) => setDuration(typeof val === 'number' ? val : 0)}
              decimalScale={6}
            />
            <NumberInput
              label="Amplitude"
              value={amplitude}
              onChange={(val) => setAmplitude(typeof val === 'number' ? val : 0)}
              decimalScale={6}
              description={(isVector || isMatrix) ? "Applied to all elements" : undefined}
            />
          </Stack>
        )

      default:
        return null
    }
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Source: ${block?.name || 'Source Block'}`}
      size="lg"
      centered
    >
      <Stack gap="md">
        <TextInput
          label="Data Type"
          value={dataType}
          onChange={(e) => setDataType(e.target.value)}
          error={typeError}
          placeholder="e.g., double, float, double[3], double[2][3]"
          description="C-style data type (e.g., float, double, long, bool, double[3], double[2][3])"
        />

        <Select
          label="Signal Type"
          value={signalType}
          onChange={(val) => setSignalType(val || 'constant')}
          data={SIGNAL_TYPES}
        />

        {renderSignalSpecificControls()}

        <Alert variant="light" color="green" icon={<IconInfoCircle />} title="Source Block">
          Generates time-varying signals for simulation testing and analysis.
          {isMatrix && " For matrix types, use C-style notation: {{1.0, 2.0}, {3.0, 4.0}}"}
          {isVector && " For vector types, use C-style array notation: [1.0, 2.0, 3.0]"}
        </Alert>

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!!typeError || !!valueError}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

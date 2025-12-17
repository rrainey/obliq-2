'use client'

import { useState } from 'react'
import { Modal, TextInput, Button, Stack, Group, Alert } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface ScaleConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

// Helper to check if a string is a valid identifier (parameter name)
const isValidIdentifier = (str: string): boolean => {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str)
}

// Helper to parse gain value - returns number or string (parameter name)
const parseGainValue = (input: string): number | string => {
  const trimmed = input.trim()
  // Check if it's a valid identifier (parameter name)
  if (isValidIdentifier(trimmed)) {
    return trimmed
  }
  // Otherwise try to parse as number
  const num = parseFloat(trimmed)
  return isNaN(num) ? trimmed : num
}

export default function ScaleConfig({ block, onUpdate, onClose }: ScaleConfigProps) {
  // Store gain as string to support both numbers and parameter names
  const [gainInput, setGainInput] = useState(String(block.parameters?.gain ?? 1))
  const [error, setError] = useState<string | null>(null)

  const validateGain = (value: string): string | null => {
    const trimmed = value.trim()
    if (!trimmed) {
      return 'Gain value cannot be empty'
    }
    // Valid if it's a number or a valid identifier
    const num = parseFloat(trimmed)
    if (!isNaN(num)) {
      return null // Valid number
    }
    if (isValidIdentifier(trimmed)) {
      return null // Valid parameter name
    }
    return 'Gain must be a number or a valid parameter name (e.g., MY_GAIN)'
  }

  const handleSave = () => {
    const validationError = validateGain(gainInput)
    if (validationError) {
      setError(validationError)
      return
    }

    const parameters = {
      gain: parseGainValue(gainInput)
    }
    onUpdate(parameters)
    onClose()
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Scale: ${block.name}`}
      size="md"
      centered
    >
      <Stack gap="md">
        <TextInput
          label="Gain"
          value={gainInput}
          onChange={(e) => {
            setGainInput(e.target.value)
            setError(null)
          }}
          error={error}
          placeholder="Enter gain value or parameter name"
          description="Enter a number (e.g., 2.5) or a parameter name (e.g., GAIN_K)"
        />

        <Alert variant="light" color="grape" icon={<IconInfoCircle />} title="Scale Block">
          Multiplies the input signal by a constant gain value.
          Use positive values for amplification, negative for inversion, and fractional values for attenuation.
          Parameter names are resolved during code compilation.
        </Alert>

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

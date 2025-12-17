'use client'

import { useState } from 'react'
import { Modal, NumberInput, Button, Stack, Group, Alert } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface LimitConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function LimitConfig({ block, onUpdate, onClose }: LimitConfigProps) {
  const [lowerLimit, setLowerLimit] = useState<number>(block.parameters?.lowerLimit ?? -1)
  const [upperLimit, setUpperLimit] = useState<number>(block.parameters?.upperLimit ?? 1)
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    if (lowerLimit > upperLimit) {
      setError('Lower limit must be less than or equal to upper limit')
      return
    }

    const parameters = {
      lowerLimit,
      upperLimit
    }
    onUpdate(parameters)
    onClose()
  }

  const handleLowerChange = (value: string | number) => {
    const num = typeof value === 'number' ? value : parseFloat(value)
    if (!isNaN(num)) {
      setLowerLimit(num)
      if (num <= upperLimit) {
        setError(null)
      }
    }
  }

  const handleUpperChange = (value: string | number) => {
    const num = typeof value === 'number' ? value : parseFloat(value)
    if (!isNaN(num)) {
      setUpperLimit(num)
      if (lowerLimit <= num) {
        setError(null)
      }
    }
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Limit: ${block.name}`}
      size="md"
      centered
    >
      <Stack gap="md">
        <NumberInput
          label="Lower Limit"
          value={lowerLimit}
          onChange={handleLowerChange}
          description="Values below this will be clamped to this lower limit"
          decimalScale={10}
          step={0.1}
        />

        <NumberInput
          label="Upper Limit"
          value={upperLimit}
          onChange={handleUpperChange}
          description="Values above this will be clamped to this upper limit"
          decimalScale={10}
          step={0.1}
        />

        {error && (
          <Alert variant="light" color="red" title="Validation Error">
            {error}
          </Alert>
        )}

        <Alert variant="light" color="grape" icon={<IconInfoCircle />} title="Limit Block">
          Clamps input signal values to the specified range.
          Values below the lower limit are set to the lower limit, values above the upper limit are set to the upper limit.
          Supports scalar, vector, and matrix signals (element-wise limiting).
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

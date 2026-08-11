'use client'

import { useState } from 'react'
import { Modal, NumberInput, Button, Stack, Group, Alert, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface UnitDelayConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function UnitDelayConfig({ block, onUpdate, onClose }: UnitDelayConfigProps) {
  const [initialValue, setInitialValue] = useState<number>(block.parameters?.initialValue ?? 0)
  const [sampleInterval, setSampleInterval] = useState<number>(block.parameters?.sampleInterval ?? 0)
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    if (sampleInterval < 0) {
      setError('Sample interval must be ≥ 0')
      return
    }

    onUpdate({
      initialValue,
      sampleInterval
    })
    onClose()
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Unit Delay: ${block.name}`}
      size="md"
      centered
    >
      <Stack gap="md">
        {error && (
          <Alert icon={<IconInfoCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        )}

        <Text size="sm" c="dimmed">
          Output is the previous sample of the input (z⁻¹). No direct feedthrough — useful for
          breaking algebraic loops and discrete guidance memory.
        </Text>

        <NumberInput
          label="Initial Value"
          value={initialValue}
          onChange={(val) => setInitialValue(typeof val === 'number' ? val : 0)}
          decimalScale={10}
          description="Value of the delayed output at the first sample (t = 0)"
        />

        <NumberInput
          label="Sample Interval (s)"
          value={sampleInterval}
          onChange={(val) => setSampleInterval(typeof val === 'number' ? val : 0)}
          decimalScale={10}
          min={0}
          description="0 = update every simulation step; &gt;0 = hold and update on that period"
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

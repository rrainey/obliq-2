'use client'

import { useState } from 'react'
import { Modal, NumberInput, Button, Stack, Group, Alert, Checkbox, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface RelayConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function RelayConfig({ block, onUpdate, onClose }: RelayConfigProps) {
  const [onThreshold, setOnThreshold] = useState<number>(block.parameters?.onThreshold ?? 0)
  const [offThreshold, setOffThreshold] = useState<number>(block.parameters?.offThreshold ?? 0)
  const [onOutput, setOnOutput] = useState<number>(block.parameters?.onOutput ?? 1)
  const [offOutput, setOffOutput] = useState<number>(block.parameters?.offOutput ?? 0)
  const [initialOn, setInitialOn] = useState<boolean>(block.parameters?.initialOn ?? false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    if (onThreshold < offThreshold) {
      setError('On threshold must be ≥ off threshold (hysteresis band)')
      return
    }
    onUpdate({ onThreshold, offThreshold, onOutput, offOutput, initialOn })
    onClose()
  }

  return (
    <Modal opened={true} onClose={onClose} title={`Configure Relay: ${block.name}`} size="md" centered>
      <Stack gap="md">
        {error && (
          <Alert icon={<IconInfoCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        )}

        <Text size="sm" c="dimmed">
          Hysteresis switch: turns on when input ≥ on threshold, off when input ≤ off threshold.
          Between thresholds the previous state is held.
        </Text>

        <NumberInput
          label="On Threshold"
          value={onThreshold}
          onChange={(v) => setOnThreshold(typeof v === 'number' ? v : 0)}
          decimalScale={10}
          description="Switch ON when u ≥ this value"
        />
        <NumberInput
          label="Off Threshold"
          value={offThreshold}
          onChange={(v) => setOffThreshold(typeof v === 'number' ? v : 0)}
          decimalScale={10}
          description="Switch OFF when u ≤ this value"
        />
        <NumberInput
          label="On Output"
          value={onOutput}
          onChange={(v) => setOnOutput(typeof v === 'number' ? v : 1)}
          decimalScale={10}
        />
        <NumberInput
          label="Off Output"
          value={offOutput}
          onChange={(v) => setOffOutput(typeof v === 'number' ? v : 0)}
          decimalScale={10}
        />
        <Checkbox
          label="Initial state ON"
          description="Start with is_on = true"
          checked={initialOn}
          onChange={(e) => setInitialOn(e.currentTarget.checked)}
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

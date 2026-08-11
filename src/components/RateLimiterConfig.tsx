'use client'

import { useState } from 'react'
import { Modal, NumberInput, Button, Stack, Group, Alert, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface RateLimiterConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function RateLimiterConfig({ block, onUpdate, onClose }: RateLimiterConfigProps) {
  const [risingSlewLimit, setRising] = useState<number>(block.parameters?.risingSlewLimit ?? 1)
  const [fallingSlewLimit, setFalling] = useState<number>(block.parameters?.fallingSlewLimit ?? -1)
  const [initialOutput, setInitial] = useState<number>(block.parameters?.initialOutput ?? 0)
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    if (risingSlewLimit <= 0) {
      setError('Rising slew limit must be > 0')
      return
    }
    if (fallingSlewLimit >= 0) {
      setError('Falling slew limit must be < 0')
      return
    }
    onUpdate({ risingSlewLimit, fallingSlewLimit, initialOutput })
    onClose()
  }

  return (
    <Modal opened={true} onClose={onClose} title={`Configure Rate Limiter: ${block.name}`} size="md" centered>
      <Stack gap="md">
        {error && (
          <Alert icon={<IconInfoCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        )}

        <Text size="sm" c="dimmed">
          Limits how fast the output can change (units per second). Uses the simulation step size dt.
        </Text>

        <NumberInput
          label="Rising Slew Limit"
          value={risingSlewLimit}
          onChange={(v) => setRising(typeof v === 'number' ? v : 1)}
          decimalScale={10}
          description="Maximum positive rate of change (must be &gt; 0)"
        />
        <NumberInput
          label="Falling Slew Limit"
          value={fallingSlewLimit}
          onChange={(v) => setFalling(typeof v === 'number' ? v : -1)}
          decimalScale={10}
          description="Minimum (most negative) rate of change (must be &lt; 0)"
        />
        <NumberInput
          label="Initial Output"
          value={initialOutput}
          onChange={(v) => setInitial(typeof v === 'number' ? v : 0)}
          decimalScale={10}
          description="Output value at t = 0"
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

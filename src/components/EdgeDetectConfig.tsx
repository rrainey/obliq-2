'use client'

import { useState } from 'react'
import { Modal, Select, NumberInput, Button, Stack, Group, Text } from '@mantine/core'
import { BlockData } from './BlockNode'

interface EdgeDetectConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function EdgeDetectConfig({ block, onUpdate, onClose }: EdgeDetectConfigProps) {
  const [edge, setEdge] = useState(block.parameters?.edge || 'rising')
  const [threshold, setThreshold] = useState<number>(block.parameters?.threshold ?? 0.5)

  const handleSave = () => {
    onUpdate({ edge, threshold })
    onClose()
  }

  return (
    <Modal opened={true} onClose={onClose} title={`Configure Edge Detect: ${block.name}`} size="md" centered>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Outputs a one-step pulse (1.0) when the input crosses the threshold. Use with integrator
          reset or unit_delay capture for engine start timers.
        </Text>
        <Select
          label="Edge"
          value={edge}
          onChange={(v) => setEdge(v || 'rising')}
          data={[
            { value: 'rising', label: 'Rising (low → high)' },
            { value: 'falling', label: 'Falling (high → low)' },
            { value: 'either', label: 'Either' }
          ]}
        />
        <NumberInput
          label="Threshold"
          value={threshold}
          onChange={(v) => setThreshold(typeof v === 'number' ? v : 0.5)}
          decimalScale={10}
          description="Input is high when ≥ threshold (default 0.5 for 0/1 signals)"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

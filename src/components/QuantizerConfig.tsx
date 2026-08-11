'use client'

import { useState } from 'react'
import { Modal, NumberInput, Button, Stack, Group, Alert, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface QuantizerConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function QuantizerConfig({ block, onUpdate, onClose }: QuantizerConfigProps) {
  const [quantum, setQuantum] = useState<number>(block.parameters?.quantum ?? 1)
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    if (!(quantum > 0)) {
      setError('Quantum must be > 0')
      return
    }
    onUpdate({ quantum })
    onClose()
  }

  return (
    <Modal opened={true} onClose={onClose} title={`Configure Quantizer: ${block.name}`} size="md" centered>
      <Stack gap="md">
        {error && (
          <Alert icon={<IconInfoCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        )}

        <Text size="sm" c="dimmed">
          Rounds the input to the nearest multiple of quantum (element-wise for vectors/matrices):
          y = quantum × floor(u/quantum + 0.5)
        </Text>

        <NumberInput
          label="Quantum"
          value={quantum}
          onChange={(v) => setQuantum(typeof v === 'number' ? v : 1)}
          decimalScale={10}
          min={0}
          description="Quantization step size (&gt; 0)"
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

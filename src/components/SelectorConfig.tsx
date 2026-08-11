'use client'

import { useState } from 'react'
import { Modal, TextInput, Button, Stack, Group, Alert, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface SelectorConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function SelectorConfig({ block, onUpdate, onClose }: SelectorConfigProps) {
  const [indicesText, setIndicesText] = useState(
    Array.isArray(block.parameters?.indices)
      ? (block.parameters.indices as number[]).join(', ')
      : '0'
  )
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    const parts = indicesText.split(/[,\s]+/).filter(Boolean)
    const indices = parts.map(p => parseInt(p, 10))
    if (indices.length === 0 || indices.some(n => isNaN(n) || n < 0)) {
      setError('Enter one or more non-negative integers, e.g. 0, 2, 1')
      return
    }
    onUpdate({ indices })
    onClose()
  }

  return (
    <Modal opened={true} onClose={onClose} title={`Configure Selector: ${block.name}`} size="md" centered>
      <Stack gap="md">
        {error && (
          <Alert icon={<IconInfoCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        )}
        <Text size="sm" c="dimmed">
          Select elements from a vector by 0-based indices. One index → scalar output;
          multiple indices → vector output in the listed order.
        </Text>
        <TextInput
          label="Indices"
          value={indicesText}
          onChange={(e) => setIndicesText(e.currentTarget.value)}
          description="Comma-separated, e.g. 0, 2 or single index 1"
          placeholder="0, 1, 2"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

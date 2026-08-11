'use client'

import { useState } from 'react'
import { Modal, TextInput, Select, Button, Stack, Group, Alert, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface DataStoreReadConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function DataStoreReadConfig({ block, onUpdate, onClose }: DataStoreReadConfigProps) {
  const [storeName, setStoreName] = useState(block.parameters?.storeName || 'store')
  const [dataType, setDataType] = useState(block.parameters?.dataType || 'double')
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(storeName)) {
      setError('Store name must be a valid C identifier')
      return
    }
    onUpdate({ storeName, dataType })
    onClose()
  }

  return (
    <Modal opened={true} onClose={onClose} title={`Data Store Read: ${block.name}`} size="md" centered>
      <Stack gap="md">
        {error && (
          <Alert icon={<IconInfoCircle size={16} />} color="red" variant="light">{error}</Alert>
        )}
        <Text size="sm" c="dimmed">
          Reads a model-scoped named store. Match store name with a Data Store Write.
          Set data type to match the written signal (e.g. double[3]).
        </Text>
        <TextInput
          label="Store Name"
          value={storeName}
          onChange={(e) => setStoreName(e.currentTarget.value)}
        />
        <Select
          label="Data Type"
          value={dataType}
          onChange={(v) => setDataType(v || 'double')}
          data={['double', 'float', 'long', 'bool', 'double[3]', 'double[4]', 'double[3][3]']}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

'use client'

import { useState } from 'react'
import { Modal, TextInput, Select, Button, Stack, Group, Alert, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface DataStoreWriteConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function DataStoreWriteConfig({ block, onUpdate, onClose }: DataStoreWriteConfigProps) {
  const [storeName, setStoreName] = useState(block.parameters?.storeName || 'store')
  const [dataType, setDataType] = useState(block.parameters?.dataType || 'double')
  const [initialValue, setInitialValue] = useState(String(block.parameters?.initialValue ?? '0'))
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(storeName)) {
      setError('Store name must be a valid C identifier')
      return
    }
    onUpdate({ storeName, dataType, initialValue })
    onClose()
  }

  return (
    <Modal opened={true} onClose={onClose} title={`Data Store Write: ${block.name}`} size="md" centered>
      <Stack gap="md">
        {error && (
          <Alert icon={<IconInfoCircle size={16} />} color="red" variant="light">{error}</Alert>
        )}
        <Text size="sm" c="dimmed">
          Writes the input into a model-scoped named store shared across all sheets and
          subsystems (e.g. nIGMMode). Pair with Data Store Read using the same store name.
        </Text>
        <TextInput
          label="Store Name"
          value={storeName}
          onChange={(e) => setStoreName(e.currentTarget.value)}
          description="Valid C identifier"
        />
        <Select
          label="Declared Type"
          value={dataType}
          onChange={(v) => setDataType(v || 'double')}
          data={['double', 'float', 'long', 'bool', 'double[3]', 'double[4]', 'double[3][3]']}
          description="Used when no write input type is available yet; codegen prefers live input type"
        />
        <TextInput
          label="Initial Value"
          value={initialValue}
          onChange={(e) => setInitialValue(e.currentTarget.value)}
          description='C99 initializer, e.g. 0 or {0,0,0}'
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

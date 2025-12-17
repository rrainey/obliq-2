'use client'

import { useState, useEffect } from 'react'
import { Modal, TextInput, NumberInput, Button, Stack, Group, Alert } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'
import { getTypeValidationError } from '@/lib/typeValidator'

interface InputPortConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function InputPortConfig({ block, onUpdate, onClose }: InputPortConfigProps) {
  const [portName, setPortName] = useState(block.parameters?.portName || 'Input')
  const [dataType, setDataType] = useState(block.parameters?.dataType || 'double')
  const [defaultValue, setDefaultValue] = useState<number>(block.parameters?.defaultValue || 0)
  const [typeError, setTypeError] = useState<string>('')

  useEffect(() => {
    const error = getTypeValidationError(dataType)
    setTypeError(error)
  }, [dataType])

  const handleSave = () => {
    const parameters = {
      portName,
      dataType,
      defaultValue
    }
    onUpdate(parameters)
    onClose()
  }

  const isInputPort = block.type === 'input_port'
  const title = isInputPort ? 'Input Port' : 'Output Port'

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure ${title}: ${block.name}`}
      size="md"
      centered
    >
      <Stack gap="md">
        <TextInput
          label="Port Name"
          value={portName}
          onChange={(e) => setPortName(e.target.value)}
          placeholder="Enter port name"
          description="This name identifies the port for external connections"
        />

        {isInputPort && (
          <>
            <TextInput
              label="Data Type"
              value={dataType}
              onChange={(e) => setDataType(e.target.value)}
              error={typeError}
              placeholder="e.g., double, float, int[5]"
              description={typeError ? undefined : "C-style data type (e.g., float, double, long, bool, double[3])"}
            />

            <NumberInput
              label="Default Value"
              value={defaultValue}
              onChange={(val) => setDefaultValue(typeof val === 'number' ? val : 0)}
              decimalScale={10}
              description="Value used when no external input is connected"
            />
          </>
        )}

        <Alert variant="light" color="blue" icon={<IconInfoCircle />} title="Note">
          {isInputPort ? 'Input' : 'Output'} ports are used to connect signals between a parent model and its subsystems.
          They do not generate signals themselves.
        </Alert>

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!!typeError}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

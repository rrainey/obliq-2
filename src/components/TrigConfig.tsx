// components/TrigConfig.tsx

'use client'

import { useState } from 'react'
import { Modal, Select, Button, Stack, Group, Alert, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface TrigConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

const TRIG_FUNCTIONS = [
  { value: 'sin', label: 'sin(x)', description: 'Sine function' },
  { value: 'cos', label: 'cos(x)', description: 'Cosine function' },
  { value: 'atan', label: 'atan(x)', description: 'Arctangent function' },
  { value: 'atan2', label: 'atan2(y, x)', description: 'Two-argument arctangent' },
  { value: 'sincos', label: 'sincos(x)', description: 'Simultaneous sine and cosine' },
]

export default function TrigConfig({ block, onUpdate, onClose }: TrigConfigProps) {
  const [selectedFunction, setSelectedFunction] = useState<string | null>(
    block?.parameters?.function || 'sin'
  )

  const handleSave = () => {
    const parameters = {
      function: selectedFunction
    }
    onUpdate(parameters)
    onClose()
  }

  const selectedFuncInfo = TRIG_FUNCTIONS.find(f => f.value === selectedFunction)

  const getFunctionDetails = () => {
    switch (selectedFunction) {
      case 'atan2':
        return 'Inputs: y (first input), x (second input). Output: Angle in radians (-π to π)'
      case 'sincos':
        return 'Input: Angle in radians. Outputs: sin(x) (first output), cos(x) (second output)'
      case 'sin':
      case 'cos':
        return 'Input: Angle in radians. Output: Value between -1 and 1'
      case 'atan':
        return 'Input: Any real number. Output: Angle in radians (-π/2 to π/2)'
      default:
        return ''
    }
  }

  const getPortConfig = () => {
    switch (selectedFunction) {
      case 'atan2':
        return '2 input ports: y and x'
      case 'sincos':
        return '1 input port, 2 output ports: sin and cos'
      default:
        return '1 input port, 1 output port'
    }
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Trigonometry Block: ${block?.name || 'Trig Block'}`}
      size="md"
      centered
    >
      <Stack gap="md">
        <Select
          label="Trigonometric Function"
          value={selectedFunction}
          onChange={setSelectedFunction}
          data={TRIG_FUNCTIONS.map(f => ({ value: f.value, label: f.label }))}
          description="All angles are in radians"
        />

        {selectedFuncInfo && (
          <Alert variant="light" color="blue" icon={<IconInfoCircle />} title={selectedFuncInfo.label}>
            <Text size="sm">{selectedFuncInfo.description}</Text>
            <Text size="sm" mt="xs">{getFunctionDetails()}</Text>
          </Alert>
        )}

        <Alert variant="light" color="yellow" icon={<IconInfoCircle />} title="Port Configuration">
          {getPortConfig()}
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

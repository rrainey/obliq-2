'use client'

import { useState } from 'react'
import { Modal, Select, Button, Stack, Group, Text } from '@mantine/core'
import { BlockData } from './BlockNode'

interface AtmosphereConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function AtmosphereConfig({ block, onUpdate, onClose }: AtmosphereConfigProps) {
  const [model, setModel] = useState(block.parameters?.model || 'coesa1976')
  const [extrapolation, setExtrapolation] = useState(block.parameters?.extrapolation || 'clamp')

  const handleSave = () => {
    onUpdate({
      ...block.parameters,
      model,
      extrapolation
    })
    onClose()
  }

  return (
    <Modal opened={true} onClose={onClose} title={`Configure Atmosphere: ${block.name}`} size="md" centered>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          1976 COESA atmosphere vs geometric altitude (m). Outputs: temperature (K), pressure (Pa),
          density (kg/m³), speed of sound (m/s). Build dynamic pressure as ½ ρ V² in the model.
        </Text>
        <Select
          label="Model"
          value={model}
          onChange={(v) => setModel(v || 'coesa1976')}
          data={[
            { value: 'coesa1976', label: 'COESA 1976 (embedded table, 0–80 km)' },
            { value: 'table', label: 'Custom table (set breakpoints in parameters)' }
          ]}
        />
        <Select
          label="Extrapolation"
          value={extrapolation}
          onChange={(v) => setExtrapolation(v || 'clamp')}
          data={[
            { value: 'clamp', label: 'Clamp to table ends' },
            { value: 'extrapolate', label: 'Linear extrapolate' }
          ]}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

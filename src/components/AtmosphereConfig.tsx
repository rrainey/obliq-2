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
          U.S. Standard Atmosphere 1976 (COESA) at geometric altitude (m), computed from the standard's
          layer formulae (valid −5 km to 86 km). Outputs, in order: temperature (K), speed of sound (m/s),
          pressure (Pa), density (kg/m³). Build dynamic pressure as ½ ρ V² in the model.
        </Text>
        <Select
          label="Model"
          value={model}
          onChange={(v) => setModel(v || 'coesa1976')}
          data={[
            { value: 'coesa1976', label: 'COESA / U.S. Standard Atmosphere 1976 (formulae, −5 to 86 km)' },
            { value: 'table', label: 'Custom table (set breakpoints in parameters)' }
          ]}
        />
        <Select
          label="Extrapolation"
          value={extrapolation}
          onChange={(v) => setExtrapolation(v || 'clamp')}
          data={[
            { value: 'clamp', label: 'Clamp to the valid range (or the table ends)' },
            { value: 'extrapolate', label: 'Extrapolate (continue the end layers, or linearly for a table)' }
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

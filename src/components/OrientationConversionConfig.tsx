// components/OrientationConversionConfig.tsx

'use client'

import { useState } from 'react'
import { Modal, Select, Button, Stack, Group, Alert, Text, List } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface OrientationConversionConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

const CONVERSION_TYPES = [
  {
    value: 'euler_to_dcm',
    label: 'Euler to DCM',
    description: 'Convert Euler angles (Phi, Theta, Psi) to Direction Cosine Matrix',
    inputs: '3 inputs: Phi_rad, Theta_rad, Psi_rad (double)',
    outputs: '1 output: DCM (double[3][3])'
  },
  {
    value: 'dcm_to_euler',
    label: 'DCM to Euler',
    description: 'Extract Euler angles from Direction Cosine Matrix',
    inputs: '1 input: DCM (double[3][3])',
    outputs: '1 output: Euler_rad (double[3] = {Phi, Theta, Psi})'
  },
  {
    value: 'euler_to_quat',
    label: 'Euler to Quaternion',
    description: 'Convert Euler angles to Quaternion (scalar-first)',
    inputs: '3 inputs: Phi_rad, Theta_rad, Psi_rad (double)',
    outputs: '1 output: q (double[4][1])'
  },
  {
    value: 'dcm_to_quat',
    label: 'DCM to Quaternion',
    description: 'Convert Direction Cosine Matrix to Quaternion',
    inputs: '1 input: DCM (double[3][3])',
    outputs: '1 output: q (double[4][1])'
  },
  {
    value: 'quat_to_euler',
    label: 'Quaternion to Euler',
    description: 'Extract Euler angles from Quaternion',
    inputs: '1 input: q (double[4][1])',
    outputs: '1 output: Euler_rad (double[3] = {Phi, Theta, Psi})'
  },
  {
    value: 'quat_to_dcm',
    label: 'Quaternion to DCM',
    description: 'Convert Quaternion to Direction Cosine Matrix',
    inputs: '1 input: q (double[4][1])',
    outputs: '1 output: DCM (double[3][3])'
  }
]

export default function OrientationConversionConfig({
  block,
  onUpdate,
  onClose
}: OrientationConversionConfigProps) {
  const [conversionType, setConversionType] = useState(
    block?.parameters?.conversionType || 'euler_to_dcm'
  )

  const handleSave = () => {
    const parameters = {
      conversionType
    }
    onUpdate(parameters)
    onClose()
  }

  const selectedConversion = CONVERSION_TYPES.find(c => c.value === conversionType)

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Orientation Conversion: ${block?.name || 'Block'}`}
      size="lg"
      centered
    >
      <Stack gap="md">
        <Select
          label="Conversion Type"
          value={conversionType}
          onChange={(val) => setConversionType(val || 'euler_to_dcm')}
          data={CONVERSION_TYPES.map(conv => ({ value: conv.value, label: conv.label }))}
        />

        {selectedConversion && (
          <Alert variant="light" color="blue" icon={<IconInfoCircle />} title={selectedConversion.label}>
            <Text size="sm">{selectedConversion.description}</Text>
            <Text size="sm" mt="xs"><strong>Inputs:</strong> {selectedConversion.inputs}</Text>
            <Text size="sm"><strong>Outputs:</strong> {selectedConversion.outputs}</Text>
          </Alert>
        )}

        <Alert variant="light" color="gray" title="Coordinate System Convention">
          <Text size="sm"><strong>Body Frame:</strong> +X forward, +Y right wing, +Z down</Text>
          <Text size="sm"><strong>Local Frame:</strong> North=+X, East=+Y, Down=+Z (NED)</Text>
          <Text size="sm"><strong>Rotation Sequence:</strong> ZYX (Yaw-Pitch-Roll)</Text>
          <Text size="sm" mt="xs"><strong>Euler Angles:</strong></Text>
          <List size="sm" ml="md">
            <List.Item>Phi (roll): rotation about X-axis</List.Item>
            <List.Item>Theta (pitch): rotation about Y-axis</List.Item>
            <List.Item>Psi (yaw): rotation about Z-axis</List.Item>
          </List>
        </Alert>

        <Alert variant="light" color="yellow" icon={<IconInfoCircle />} title="Note">
          Quaternion format is scalar-first: q = [q0, q1, q2, q3] where q0 is the scalar component.
          All angles are in radians. Normalization of quaternions is assumed to be performed elsewhere.
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

'use client'

import { Modal, Button, Stack, Group, Alert, Text, Paper, List } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface DemuxConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function DemuxConfig({ block, onUpdate, onClose }: DemuxConfigProps) {
  const outputCount = block?.parameters?.outputCount || 1
  const inputDimensions = block?.parameters?.inputDimensions || [1]

  const getInputTypeDescription = () => {
    if (inputDimensions.length === 1) {
      if (inputDimensions[0] === 1) {
        return 'Scalar'
      }
      return `Vector [${inputDimensions[0]}]`
    } else if (inputDimensions.length === 2) {
      return `Matrix [${inputDimensions[0]}x${inputDimensions[1]}]`
    }
    return 'Unknown'
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Demux Block Information: ${block?.name || 'Demux'}`}
      size="md"
      centered
    >
      <Stack gap="md">
        <Paper p="md" withBorder>
          <Text size="sm" fw={500} mb="xs">Current Configuration</Text>
          <Text size="sm"><strong>Input Type:</strong> {getInputTypeDescription()}</Text>
          <Text size="sm"><strong>Output Ports:</strong> {outputCount}</Text>
        </Paper>

        <Alert variant="light" color="blue" icon={<IconInfoCircle />} title="Demux Block">
          This block automatically splits vector or matrix inputs into scalar outputs.
          <List size="sm" mt="xs">
            <List.Item>Scalar input - 1 output</List.Item>
            <List.Item>Vector [n] - n outputs</List.Item>
            <List.Item>Matrix [m x n] - m x n outputs (row-major order)</List.Item>
          </List>
          <Text size="sm" mt="xs">
            The number of output ports updates automatically based on the connected input signal type.
          </Text>
        </Alert>

        <Group justify="flex-end">
          <Button onClick={onClose}>
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

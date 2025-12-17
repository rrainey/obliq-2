'use client'

import { useState } from 'react'
import { Modal, NumberInput, Select, Button, Stack, Group, Alert, Text, Paper, SimpleGrid } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

const extractBaseType = (outputType: string): string => {
  const match = outputType.match(/^(\w+)(\[|$)/)
  return match ? match[1] : 'double'
}

interface MuxConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function MuxConfig({ block, onUpdate, onClose }: MuxConfigProps) {
  const [rows, setRows] = useState(block.parameters?.rows || 2)
  const [cols, setCols] = useState(block.parameters?.cols || 2)
  const [outputType, setOutputType] = useState(
    block.parameters?.baseType || extractBaseType(block.parameters?.outputType || 'double')
  )

  const totalPorts = rows * cols

  const handleSave = () => {
    onUpdate({
      ...block.parameters,
      rows,
      cols,
      outputType: `${outputType}[${rows}][${cols}]`,
      baseType: outputType
    })
    onClose()
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title="Configure Mux Block"
      size="md"
      centered
    >
      <Stack gap="md">
        <div>
          <Text size="sm" fw={500} mb="xs">Output Matrix Dimensions</Text>
          <SimpleGrid cols={2}>
            <NumberInput
              label="Rows"
              value={rows}
              onChange={(val) => setRows(Math.max(1, Math.min(100, typeof val === 'number' ? val : 1)))}
              min={1}
              max={100}
            />
            <NumberInput
              label="Columns"
              value={cols}
              onChange={(val) => setCols(Math.max(1, Math.min(100, typeof val === 'number' ? val : 1)))}
              min={1}
              max={100}
            />
          </SimpleGrid>
        </div>

        <Select
          label="Element Type"
          value={outputType}
          onChange={(val) => setOutputType(val || 'double')}
          data={[
            { value: 'double', label: 'double' },
            { value: 'float', label: 'float' },
            { value: 'int', label: 'int' },
            { value: 'long', label: 'long' }
          ]}
        />

        <Paper p="sm" withBorder>
          <Text size="sm" fw={500} mb="xs">Configuration Preview:</Text>
          <Text size="xs" ff="monospace">Output Type: <Text span c="blue">{outputType}[{rows}][{cols}]</Text></Text>
          <Text size="xs" ff="monospace">Input Ports: <Text span c="green">{totalPorts}</Text> (numbered 0 to {totalPorts - 1})</Text>
          <Text size="xs" ff="monospace">Port Arrangement: Row-major order</Text>
        </Paper>

        <Paper p="sm" withBorder>
          <Text size="sm" fw={500} mb="xs">Port Layout:</Text>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 4 }}>
            {Array.from({ length: totalPorts }, (_, i) => {
              const row = Math.floor(i / cols)
              const col = i % cols
              return (
                <Paper key={i} p={4} withBorder style={{ textAlign: 'center' }} title={`Row ${row}, Column ${col}`}>
                  <Text size="xs">{i}</Text>
                </Paper>
              )
            })}
          </div>
          <Text size="xs" c="dimmed" mt="xs">
            Inputs are arranged in row-major order: [0,0], [0,1], ..., [{rows - 1},{cols - 1}]
          </Text>
        </Paper>

        {totalPorts > 20 && (
          <Alert variant="light" color="yellow" icon={<IconInfoCircle />}>
            Large matrix: {totalPorts} input ports will be created
          </Alert>
        )}

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

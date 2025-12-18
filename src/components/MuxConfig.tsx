'use client'

import { useState } from 'react'
import { Modal, NumberInput, Select, Button, Stack, Group, Alert, Text, Paper, SimpleGrid, SegmentedControl } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

const extractBaseType = (outputType: string): string => {
  const match = outputType.match(/^(\w+)(\[|$)/)
  return match ? match[1] : 'double'
}

// Determine if current config is vector or matrix
const getOutputShape = (params: Record<string, any> | undefined): 'vector' | 'matrix' => {
  // Check explicit outputShape parameter first
  if (params?.outputShape === 'vector') return 'vector'
  if (params?.outputShape === 'matrix') return 'matrix'
  // Fall back to inferring from rows/cols
  const rows = params?.rows || 2
  const cols = params?.cols || 2
  if (rows === 1 || cols === 1) return 'vector'
  return 'matrix'
}

interface MuxConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function MuxConfig({ block, onUpdate, onClose }: MuxConfigProps) {
  const initialRows = block.parameters?.rows || 2
  const initialCols = block.parameters?.cols || 2

  const [outputShape, setOutputShape] = useState<'vector' | 'matrix'>(
    getOutputShape(block.parameters)
  )
  const [rows, setRows] = useState(initialRows)
  const [cols, setCols] = useState(initialCols)
  const [vectorSize, setVectorSize] = useState(
    // If current config is vector-like, use the non-1 dimension as size
    initialRows === 1 ? initialCols : (initialCols === 1 ? initialRows : initialRows * initialCols)
  )
  const [elementType, setElementType] = useState(
    block.parameters?.baseType || extractBaseType(block.parameters?.outputType || 'double')
  )

  // Calculate total ports based on output shape
  const totalPorts = outputShape === 'vector' ? vectorSize : rows * cols

  // Build output type string based on shape
  const getOutputTypeString = () => {
    if (outputShape === 'vector') {
      return `${elementType}[${vectorSize}]`
    }
    return `${elementType}[${rows}][${cols}]`
  }

  const handleSave = () => {
    if (outputShape === 'vector') {
      // Store as 1×N (row vector)
      onUpdate({
        ...block.parameters,
        outputShape: 'vector',
        rows: 1,
        cols: vectorSize,
        outputType: `${elementType}[${vectorSize}]`,
        baseType: elementType
      })
    } else {
      onUpdate({
        ...block.parameters,
        outputShape: 'matrix',
        rows,
        cols,
        outputType: `${elementType}[${rows}][${cols}]`,
        baseType: elementType
      })
    }
    onClose()
  }

  const handleShapeChange = (value: string) => {
    const newShape = value as 'vector' | 'matrix'
    setOutputShape(newShape)

    if (newShape === 'vector') {
      // Convert matrix to vector: use total element count
      setVectorSize(rows * cols)
    } else {
      // Convert vector to matrix: try to make a reasonable matrix
      // Default to 2×N depending on size
      if (vectorSize <= 4) {
        setRows(vectorSize)
        setCols(1)
      } else {
        // Try to factor into reasonable dimensions
        const sqrt = Math.floor(Math.sqrt(vectorSize))
        if (vectorSize % sqrt === 0) {
          setRows(sqrt)
          setCols(vectorSize / sqrt)
        } else {
          setRows(2)
          setCols(Math.ceil(vectorSize / 2))
        }
      }
    }
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
          <Text size="sm" fw={500} mb="xs">Output Shape</Text>
          <SegmentedControl
            fullWidth
            value={outputShape}
            onChange={handleShapeChange}
            data={[
              { value: 'vector', label: 'Vector' },
              { value: 'matrix', label: 'Matrix' }
            ]}
          />
        </div>

        {outputShape === 'vector' ? (
          <NumberInput
            label="Vector Size (number of elements)"
            value={vectorSize}
            onChange={(val) => setVectorSize(Math.max(1, Math.min(100, typeof val === 'number' ? val : 1)))}
            min={1}
            max={100}
            description="Number of scalar inputs to combine into a vector"
          />
        ) : (
          <div>
            <Text size="sm" fw={500} mb="xs">Matrix Dimensions</Text>
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
        )}

        <Select
          label="Element Type"
          value={elementType}
          onChange={(val) => setElementType(val || 'double')}
          data={[
            { value: 'double', label: 'double' },
            { value: 'float', label: 'float' },
            { value: 'int', label: 'int' },
            { value: 'long', label: 'long' }
          ]}
        />

        <Paper p="sm" withBorder>
          <Text size="sm" fw={500} mb="xs">Configuration Preview:</Text>
          <Text size="xs" ff="monospace">Output Type: <Text span c="blue">{getOutputTypeString()}</Text></Text>
          <Text size="xs" ff="monospace">Input Ports: <Text span c="green">{totalPorts}</Text> (numbered 0 to {totalPorts - 1})</Text>
        </Paper>

        {outputShape === 'vector' ? (
          <Paper p="sm" withBorder>
            <Text size="sm" fw={500} mb="xs">Port Layout:</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Array.from({ length: Math.min(totalPorts, 20) }, (_, i) => (
                <Paper key={i} p={4} withBorder style={{ textAlign: 'center', minWidth: 28 }} title={`Index ${i}`}>
                  <Text size="xs">{i}</Text>
                </Paper>
              ))}
              {totalPorts > 20 && (
                <Paper p={4} withBorder style={{ textAlign: 'center', minWidth: 28 }}>
                  <Text size="xs">...</Text>
                </Paper>
              )}
            </div>
            <Text size="xs" c="dimmed" mt="xs">
              Inputs 0 to {vectorSize - 1} map to vector elements [0] to [{vectorSize - 1}]
            </Text>
          </Paper>
        ) : (
          <Paper p="sm" withBorder>
            <Text size="sm" fw={500} mb="xs">Port Layout:</Text>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cols, 10)}, minmax(0, 1fr))`, gap: 4 }}>
              {Array.from({ length: Math.min(totalPorts, 50) }, (_, i) => {
                const row = Math.floor(i / cols)
                const col = i % cols
                return (
                  <Paper key={i} p={4} withBorder style={{ textAlign: 'center' }} title={`Row ${row}, Column ${col}`}>
                    <Text size="xs">{i}</Text>
                  </Paper>
                )
              })}
              {totalPorts > 50 && (
                <Paper p={4} withBorder style={{ textAlign: 'center' }}>
                  <Text size="xs">...</Text>
                </Paper>
              )}
            </div>
            <Text size="xs" c="dimmed" mt="xs">
              Inputs are arranged in row-major order: [0,0], [0,1], ..., [{rows - 1},{cols - 1}]
            </Text>
          </Paper>
        )}

        {totalPorts > 20 && (
          <Alert variant="light" color="yellow" icon={<IconInfoCircle />}>
            Large {outputShape}: {totalPorts} input ports will be created
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

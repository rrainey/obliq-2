'use client'

import { useState } from 'react'
import { Modal, TextInput, NumberInput, Select, Button, Stack, Group, Alert, Text, Table, ActionIcon, SimpleGrid } from '@mantine/core'
import { IconInfoCircle, IconPlus, IconX } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface Lookup2DConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function Lookup2DConfig({ block, onUpdate, onClose }: Lookup2DConfigProps) {
  const [input1Values, setInput1Values] = useState<number[]>(
    block?.parameters?.input1Values || [0, 1]
  )
  const [input2Values, setInput2Values] = useState<number[]>(
    block?.parameters?.input2Values || [0, 1]
  )
  const [outputTable, setOutputTable] = useState<number[][]>(
    block?.parameters?.outputTable || [[0, 1], [2, 3]]
  )
  const [extrapolation, setExtrapolation] = useState(
    block?.parameters?.extrapolation || 'clamp'
  )

  const handleInput1ValuesChange = (value: string) => {
    try {
      const values = value.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v))
      if (values.length > 0) {
        setInput1Values(values)
        const newTable = Array(values.length).fill(null).map((_, i) =>
          outputTable[i] ? [...outputTable[i]] : Array(input2Values.length).fill(0)
        )
        setOutputTable(newTable)
      }
    } catch {
      // Invalid input, keep current values
    }
  }

  const handleInput2ValuesChange = (value: string) => {
    try {
      const values = value.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v))
      if (values.length > 0) {
        setInput2Values(values)
        const newTable = outputTable.map(row => {
          const newRow = Array(values.length).fill(0)
          for (let j = 0; j < Math.min(row.length, values.length); j++) {
            newRow[j] = row[j] || 0
          }
          return newRow
        })
        setOutputTable(newTable)
      }
    } catch {
      // Invalid input, keep current values
    }
  }

  const updateTableValue = (row: number, col: number, value: number | string) => {
    const numValue = typeof value === 'number' ? value : parseFloat(value) || 0
    const newTable = [...outputTable]
    if (!newTable[row]) {
      newTable[row] = Array(input2Values.length).fill(0)
    }
    newTable[row][col] = isNaN(numValue) ? 0 : numValue
    setOutputTable(newTable)
  }

  const addInput1Point = () => {
    const lastValue = input1Values.length > 0 ? input1Values[input1Values.length - 1] : 0
    setInput1Values([...input1Values, lastValue + 1])
    setOutputTable([...outputTable, Array(input2Values.length).fill(0)])
  }

  const addInput2Point = () => {
    const lastValue = input2Values.length > 0 ? input2Values[input2Values.length - 1] : 0
    setInput2Values([...input2Values, lastValue + 1])
    setOutputTable(outputTable.map(row => [...row, 0]))
  }

  const removeInput1Point = (index: number) => {
    if (input1Values.length > 1) {
      setInput1Values(input1Values.filter((_, i) => i !== index))
      setOutputTable(outputTable.filter((_, i) => i !== index))
    }
  }

  const removeInput2Point = (index: number) => {
    if (input2Values.length > 1) {
      setInput2Values(input2Values.filter((_, i) => i !== index))
      setOutputTable(outputTable.map(row => row.filter((_, j) => j !== index)))
    }
  }

  const updateInput1Value = (index: number, value: number | string) => {
    const numValue = typeof value === 'number' ? value : parseFloat(value) || 0
    const newValues = [...input1Values]
    newValues[index] = isNaN(numValue) ? 0 : numValue
    setInput1Values(newValues)
  }

  const updateInput2Value = (index: number, value: number | string) => {
    const numValue = typeof value === 'number' ? value : parseFloat(value) || 0
    const newValues = [...input2Values]
    newValues[index] = isNaN(numValue) ? 0 : numValue
    setInput2Values(newValues)
  }

  const handleSave = () => {
    const parameters = {
      input1Values: input1Values.length > 0 ? input1Values : [0],
      input2Values: input2Values.length > 0 ? input2Values : [0],
      outputTable: outputTable.length > 0 ? outputTable : [[0]],
      extrapolation
    }
    onUpdate(parameters)
    onClose()
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure 2-D Lookup: ${block?.name || '2-D Lookup'}`}
      size="xl"
      centered
    >
      <Stack gap="md">
        <SimpleGrid cols={2}>
          <div>
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={500}>Input 1 Values ({input1Values.length})</Text>
              <Button variant="light" color="blue" size="xs" leftSection={<IconPlus size={14} />} onClick={addInput1Point}>
                Add Row
              </Button>
            </Group>
            <TextInput
              value={input1Values.join(', ')}
              onChange={(e) => handleInput1ValuesChange(e.target.value)}
              placeholder="0, 1, 2"
              mb="xs"
            />
            <div style={{ maxHeight: 96, overflowY: 'auto' }}>
              <Stack gap={4}>
                {input1Values.map((value, i) => (
                  <Group key={i} gap="xs">
                    <NumberInput
                      value={value}
                      onChange={(val) => updateInput1Value(i, val)}
                      decimalScale={4}
                      size="xs"
                      style={{ flex: 1 }}
                      hideControls
                    />
                    {input1Values.length > 1 && (
                      <ActionIcon variant="light" color="red" size="sm" onClick={() => removeInput1Point(i)}>
                        <IconX size={14} />
                      </ActionIcon>
                    )}
                  </Group>
                ))}
              </Stack>
            </div>
          </div>

          <div>
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={500}>Input 2 Values ({input2Values.length})</Text>
              <Button variant="light" color="green" size="xs" leftSection={<IconPlus size={14} />} onClick={addInput2Point}>
                Add Col
              </Button>
            </Group>
            <TextInput
              value={input2Values.join(', ')}
              onChange={(e) => handleInput2ValuesChange(e.target.value)}
              placeholder="0, 1, 2"
              mb="xs"
            />
            <div style={{ maxHeight: 96, overflowY: 'auto' }}>
              <Stack gap={4}>
                {input2Values.map((value, i) => (
                  <Group key={i} gap="xs">
                    <NumberInput
                      value={value}
                      onChange={(val) => updateInput2Value(i, val)}
                      decimalScale={4}
                      size="xs"
                      style={{ flex: 1 }}
                      hideControls
                    />
                    {input2Values.length > 1 && (
                      <ActionIcon variant="light" color="red" size="sm" onClick={() => removeInput2Point(i)}>
                        <IconX size={14} />
                      </ActionIcon>
                    )}
                  </Group>
                ))}
              </Stack>
            </div>
          </div>
        </SimpleGrid>

        <div>
          <Text size="sm" fw={500} mb="xs">Output Table ({input1Values.length} x {input2Values.length})</Text>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ textAlign: 'center' }}>Input1\Input2</Table.Th>
                  {input2Values.map((val, j) => (
                    <Table.Th key={j} style={{ textAlign: 'center', minWidth: 60 }}>{val.toFixed(2)}</Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {input1Values.map((val1, i) => (
                  <Table.Tr key={i}>
                    <Table.Td style={{ textAlign: 'center', fontWeight: 500 }}>{val1.toFixed(2)}</Table.Td>
                    {input2Values.map((_, j) => (
                      <Table.Td key={j}>
                        <NumberInput
                          value={outputTable[i]?.[j] ?? 0}
                          onChange={(val) => updateTableValue(i, j, val)}
                          decimalScale={4}
                          size="xs"
                          hideControls
                        />
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        </div>

        <Select
          label="Extrapolation Method"
          value={extrapolation}
          onChange={(val) => setExtrapolation(val || 'clamp')}
          data={[
            { value: 'clamp', label: 'Clamp to nearest values' },
            { value: 'extrapolate', label: 'Bilinear extrapolation' }
          ]}
          description="How to handle inputs outside the table range"
        />

        <Alert variant="light" color="lime" icon={<IconInfoCircle />} title="2-D Lookup">
          Performs bilinear interpolation using two inputs.
          Input values should be in ascending order for best results.
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

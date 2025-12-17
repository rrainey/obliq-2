'use client'

import { useState } from 'react'
import { Modal, TextInput, NumberInput, Select, Button, Stack, Group, Alert, Text, Table, ActionIcon, SimpleGrid } from '@mantine/core'
import { IconInfoCircle, IconPlus, IconX, IconArrowsSort } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface Lookup1DConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function Lookup1DConfig({ block, onUpdate, onClose }: Lookup1DConfigProps) {
  const [inputValues, setInputValues] = useState<number[]>(
    block?.parameters?.inputValues || [0, 1, 2]
  )
  const [outputValues, setOutputValues] = useState<number[]>(
    block?.parameters?.outputValues || [0, 1, 4]
  )
  const [extrapolation, setExtrapolation] = useState(
    block?.parameters?.extrapolation || 'clamp'
  )

  const handleInputValuesChange = (value: string) => {
    try {
      const values = value.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v))
      setInputValues(values)
    } catch {
      // Invalid input, keep current values
    }
  }

  const handleOutputValuesChange = (value: string) => {
    try {
      const values = value.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v))
      setOutputValues(values)
    } catch {
      // Invalid input, keep current values
    }
  }

  const addDataPoint = () => {
    const lastInput = inputValues.length > 0 ? inputValues[inputValues.length - 1] : 0
    const lastOutput = outputValues.length > 0 ? outputValues[outputValues.length - 1] : 0
    setInputValues([...inputValues, lastInput + 1])
    setOutputValues([...outputValues, lastOutput])
  }

  const removeDataPoint = (index: number) => {
    if (inputValues.length > 1 && outputValues.length > 1) {
      setInputValues(inputValues.filter((_, i) => i !== index))
      setOutputValues(outputValues.filter((_, i) => i !== index))
    }
  }

  const updateDataPoint = (index: number, inputVal: number | string, outputVal: number | string) => {
    const newInputs = [...inputValues]
    const newOutputs = [...outputValues]

    const numericInput = typeof inputVal === 'number' ? inputVal : parseFloat(inputVal) || 0
    const numericOutput = typeof outputVal === 'number' ? outputVal : parseFloat(outputVal) || 0

    newInputs[index] = isNaN(numericInput) ? 0 : numericInput
    newOutputs[index] = isNaN(numericOutput) ? 0 : numericOutput

    setInputValues(newInputs)
    setOutputValues(newOutputs)
  }

  const sortDataPoints = () => {
    const combined = inputValues.map((input, i) => ({
      input,
      output: outputValues[i] || 0
    }))
    combined.sort((a, b) => a.input - b.input)
    setInputValues(combined.map(p => p.input))
    setOutputValues(combined.map(p => p.output))
  }

  const handleSave = () => {
    const finalInputs = inputValues.length > 0 ? inputValues : [0]
    const finalOutputs = outputValues.length > 0 ? outputValues : [0]

    const parameters = {
      inputValues: finalInputs,
      outputValues: finalOutputs,
      extrapolation
    }
    onUpdate(parameters)
    onClose()
  }

  const maxPoints = Math.max(inputValues.length, outputValues.length)

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure 1-D Lookup: ${block?.name || '1-D Lookup'}`}
      size="lg"
      centered
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="sm" fw={500}>Data Points ({maxPoints} points)</Text>
          <Group gap="xs">
            <Button
              variant="light"
              size="xs"
              leftSection={<IconArrowsSort size={14} />}
              onClick={sortDataPoints}
            >
              Sort
            </Button>
            <Button
              variant="light"
              color="blue"
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={addDataPoint}
            >
              Add
            </Button>
          </Group>
        </Group>

        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          <Table withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Input</Table.Th>
                <Table.Th>Output</Table.Th>
                <Table.Th style={{ width: 50, textAlign: 'center' }}>Action</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {Array.from({ length: maxPoints }, (_, i) => (
                <Table.Tr key={i}>
                  <Table.Td>
                    <NumberInput
                      value={inputValues[i] ?? 0}
                      onChange={(val) => updateDataPoint(i, val, outputValues[i] ?? 0)}
                      decimalScale={6}
                      size="xs"
                      hideControls
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      value={outputValues[i] ?? 0}
                      onChange={(val) => updateDataPoint(i, inputValues[i] ?? 0, val)}
                      decimalScale={6}
                      size="xs"
                      hideControls
                    />
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'center' }}>
                    {maxPoints > 1 && (
                      <ActionIcon
                        variant="light"
                        color="red"
                        size="sm"
                        onClick={() => removeDataPoint(i)}
                      >
                        <IconX size={14} />
                      </ActionIcon>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>

        <SimpleGrid cols={2}>
          <TextInput
            label="Input Values (comma-separated)"
            value={inputValues.join(', ')}
            onChange={(e) => handleInputValuesChange(e.target.value)}
            placeholder="0, 1, 2, 3"
          />
          <TextInput
            label="Output Values (comma-separated)"
            value={outputValues.join(', ')}
            onChange={(e) => handleOutputValuesChange(e.target.value)}
            placeholder="0, 1, 4, 9"
          />
        </SimpleGrid>

        <Select
          label="Extrapolation Method"
          value={extrapolation}
          onChange={(val) => setExtrapolation(val || 'clamp')}
          data={[
            { value: 'clamp', label: 'Clamp to nearest value' },
            { value: 'extrapolate', label: 'Linear extrapolation' }
          ]}
          description="How to handle inputs outside the table range"
        />

        <Alert variant="light" color="cyan" icon={<IconInfoCircle />} title="1-D Lookup">
          Interpolates between input/output pairs.
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

'use client'

import { useState } from 'react'
import { Modal, NumberInput, Button, Stack, Group, Alert, Text, ActionIcon, Paper } from '@mantine/core'
import { IconInfoCircle, IconPlus, IconX } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface TransferFunctionConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function TransferFunctionConfig({ block, onUpdate, onClose }: TransferFunctionConfigProps) {
  const [numerator, setNumerator] = useState<number[]>(block.parameters?.numerator || [1])
  const [denominator, setDenominator] = useState<number[]>(block.parameters?.denominator || [1, 1])

  const handleSave = () => {
    const parameters = {
      numerator: numerator.filter(val => !isNaN(val)),
      denominator: denominator.filter(val => !isNaN(val))
    }

    if (parameters.numerator.length === 0) {
      parameters.numerator = [1]
    }
    if (parameters.denominator.length === 0) {
      parameters.denominator = [1]
    }

    onUpdate(parameters)
    onClose()
  }

  const updateNumerator = (index: number, value: string | number) => {
    const newNumerator = [...numerator]
    newNumerator[index] = typeof value === 'number' ? value : parseFloat(value) || 0
    setNumerator(newNumerator)
  }

  const updateDenominator = (index: number, value: string | number) => {
    const newDenominator = [...denominator]
    newDenominator[index] = typeof value === 'number' ? value : parseFloat(value) || 0
    setDenominator(newDenominator)
  }

  const addNumeratorCoeff = () => {
    setNumerator([...numerator, 0])
  }

  const removeNumeratorCoeff = (index: number) => {
    if (numerator.length > 1) {
      setNumerator(numerator.filter((_, i) => i !== index))
    }
  }

  const addDenominatorCoeff = () => {
    setDenominator([...denominator, 0])
  }

  const removeDenominatorCoeff = (index: number) => {
    if (denominator.length > 1) {
      setDenominator(denominator.filter((_, i) => i !== index))
    }
  }

  const renderTransferFunction = () => {
    const numStr = numerator.map((coeff, idx) => {
      const power = numerator.length - 1 - idx
      if (power === 0) return coeff.toString()
      if (power === 1) return `${coeff}s`
      return `${coeff}s^${power}`
    }).join(' + ').replace(/\+ -/g, '- ')

    const denStr = denominator.map((coeff, idx) => {
      const power = denominator.length - 1 - idx
      if (power === 0) return coeff.toString()
      if (power === 1) return `${coeff}s`
      return `${coeff}s^${power}`
    }).join(' + ').replace(/\+ -/g, '- ')

    return (
      <Paper p="sm" withBorder style={{ textAlign: 'center', fontFamily: 'monospace' }}>
        <Text size="sm" style={{ borderBottom: '1px solid var(--mantine-color-gray-4)', paddingBottom: 4, marginBottom: 4 }}>
          {numStr || '1'}
        </Text>
        <Text size="sm">
          {denStr || '1'}
        </Text>
      </Paper>
    )
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Transfer Function: ${block.name}`}
      size="lg"
      centered
    >
      <Stack gap="md">
        <div>
          <Text size="sm" fw={500} mb="xs">Transfer Function H(s)</Text>
          {renderTransferFunction()}
        </div>

        <div>
          <Text size="sm" fw={500} mb="xs">Numerator Coefficients (highest to lowest power)</Text>
          <Stack gap="xs">
            {numerator.map((coeff, index) => (
              <Group key={index} gap="xs">
                <Text size="sm" c="dimmed" w={50}>s^{numerator.length - 1 - index}:</Text>
                <NumberInput
                  value={coeff}
                  onChange={(val) => updateNumerator(index, val)}
                  decimalScale={6}
                  style={{ flex: 1 }}
                />
                <ActionIcon
                  variant="light"
                  color="red"
                  onClick={() => removeNumeratorCoeff(index)}
                  disabled={numerator.length <= 1}
                >
                  <IconX size={16} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={addNumeratorCoeff}
            mt="xs"
          >
            Add Coefficient
          </Button>
        </div>

        <div>
          <Text size="sm" fw={500} mb="xs">Denominator Coefficients (highest to lowest power)</Text>
          <Stack gap="xs">
            {denominator.map((coeff, index) => (
              <Group key={index} gap="xs">
                <Text size="sm" c="dimmed" w={50}>s^{denominator.length - 1 - index}:</Text>
                <NumberInput
                  value={coeff}
                  onChange={(val) => updateDenominator(index, val)}
                  decimalScale={6}
                  style={{ flex: 1 }}
                />
                <ActionIcon
                  variant="light"
                  color="red"
                  onClick={() => removeDenominatorCoeff(index)}
                  disabled={denominator.length <= 1}
                >
                  <IconX size={16} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={addDenominatorCoeff}
            mt="xs"
          >
            Add Coefficient
          </Button>
        </div>

        <Alert variant="light" color="red" icon={<IconInfoCircle />} title="Transfer Function Block">
          Implements H(s) = N(s)/D(s) using RK4 integration.
          Coefficients are ordered from highest to lowest power of s.
          Example: For H(s) = (2s + 1)/(s² + 3s + 2), enter Numerator: [2, 1], Denominator: [1, 3, 2]
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

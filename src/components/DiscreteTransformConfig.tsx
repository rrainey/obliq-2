'use client'

import { useState } from 'react'
import { Modal, NumberInput, Button, Stack, Group, Alert, Text, ActionIcon, Paper } from '@mantine/core'
import { IconInfoCircle, IconPlus, IconX } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface DiscreteTransformConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function DiscreteTransformConfig({ block, onUpdate, onClose }: DiscreteTransformConfigProps) {
  const [numerator, setNumerator] = useState<number[]>(block.parameters?.numerator || [1])
  const [denominator, setDenominator] = useState<number[]>(block.parameters?.denominator || [1, -0.5])
  const [sampleInterval, setSampleInterval] = useState<number>(block.parameters?.sampleInterval || 0.01)

  const handleSave = () => {
    const parameters = {
      numerator: numerator.filter(val => !isNaN(val)),
      denominator: denominator.filter(val => !isNaN(val)),
      sampleInterval
    }

    if (parameters.numerator.length === 0) {
      parameters.numerator = [1]
    }
    if (parameters.denominator.length === 0) {
      parameters.denominator = [1]
    }
    if (parameters.sampleInterval <= 0) {
      parameters.sampleInterval = 0.01
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

  // Helper to get superscript for power
  const getSuperscript = (power: number): string => {
    if (power === 0) return ''
    if (power === 1) return ''
    const superscripts = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']
    return power.toString().split('').map(d => superscripts[parseInt(d)]).join('')
  }

  const renderTransferFunction = () => {
    // Display as H(z) with positive powers (highest power first, like Transfer Function)
    const numStr = numerator.map((coeff, idx) => {
      const power = numerator.length - 1 - idx
      if (power === 0) return coeff.toString()
      if (power === 1) return `${coeff}z`
      return `${coeff}z${getSuperscript(power)}`
    }).join(' + ').replace(/\+ -/g, '- ')

    const denStr = denominator.map((coeff, idx) => {
      const power = denominator.length - 1 - idx
      if (power === 0) return coeff.toString()
      if (power === 1) return `${coeff}z`
      return `${coeff}z${getSuperscript(power)}`
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

  // Get the power label for a coefficient at given index
  const getPowerLabel = (index: number, totalLength: number): string => {
    const power = totalLength - 1 - index
    if (power === 0) return 'z⁰:'
    if (power === 1) return 'z¹:'
    return `z${getSuperscript(power)}:`
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Discrete Transform: ${block.name}`}
      size="lg"
      centered
    >
      <Stack gap="md">
        <div>
          <Text size="sm" fw={500} mb="xs">Discrete Transfer Function H(z)</Text>
          {renderTransferFunction()}
        </div>

        <NumberInput
          label="Sample Interval (seconds)"
          description="Time between discrete samples (Ts)"
          value={sampleInterval}
          onChange={(val) => setSampleInterval(typeof val === 'number' ? val : 0.01)}
          min={0.0001}
          step={0.001}
          decimalScale={6}
        />

        <div>
          <Text size="sm" fw={500} mb="xs">Numerator Coefficients (highest power first)</Text>
          <Stack gap="xs">
            {numerator.map((coeff, index) => (
              <Group key={index} gap="xs">
                <Text size="sm" c="dimmed" w={50}>{getPowerLabel(index, numerator.length)}</Text>
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
            Add Coefficient (lower power)
          </Button>
        </div>

        <div>
          <Text size="sm" fw={500} mb="xs">Denominator Coefficients (highest power first)</Text>
          <Stack gap="xs">
            {denominator.map((coeff, index) => (
              <Group key={index} gap="xs">
                <Text size="sm" c="dimmed" w={50}>{getPowerLabel(index, denominator.length)}</Text>
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
            Add Coefficient (lower power)
          </Button>
        </div>

        <Alert variant="light" color="blue" icon={<IconInfoCircle />} title="Discrete Transfer Function Block">
          Implements H(z) = N(z)/D(z) using difference equations.
          Coefficients are ordered highest power first (same as Transfer Function block).
          Example: For H(z) = (z + 0.5)/(z - 0.8), enter Numerator: [1, 0.5], Denominator: [1, -0.8]
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

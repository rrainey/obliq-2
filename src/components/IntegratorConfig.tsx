'use client'

import { useState } from 'react'
import { Modal, NumberInput, Button, Stack, Group, Alert, Checkbox, Text, Divider } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface IntegratorConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function IntegratorConfig({ block, onUpdate, onClose }: IntegratorConfigProps) {
  const [initialValue, setInitialValue] = useState<number>(block.parameters?.initialValue ?? 0)
  const [showEnableInput, setShowEnableInput] = useState<boolean>(block.parameters?.showEnableInput ?? false)
  const [showResetInput, setShowResetInput] = useState<boolean>(block.parameters?.showResetInput ?? false)
  const [useLimits, setUseLimits] = useState<boolean>(block.parameters?.useLimits ?? false)
  const [lowerLimit, setLowerLimit] = useState<number>(block.parameters?.lowerLimit ?? -Infinity)
  const [upperLimit, setUpperLimit] = useState<number>(block.parameters?.upperLimit ?? Infinity)
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    if (useLimits && lowerLimit > upperLimit) {
      setError('Lower limit must be less than or equal to upper limit')
      return
    }

    const parameters = {
      initialValue,
      showEnableInput,
      showResetInput,
      useLimits,
      lowerLimit: useLimits ? lowerLimit : -Infinity,
      upperLimit: useLimits ? upperLimit : Infinity
    }
    onUpdate(parameters)
    onClose()
  }

  const handleLowerChange = (value: string | number) => {
    const num = typeof value === 'number' ? value : parseFloat(value)
    if (!isNaN(num)) {
      setLowerLimit(num)
      if (num <= upperLimit) {
        setError(null)
      }
    }
  }

  const handleUpperChange = (value: string | number) => {
    const num = typeof value === 'number' ? value : parseFloat(value)
    if (!isNaN(num)) {
      setUpperLimit(num)
      if (lowerLimit <= num) {
        setError(null)
      }
    }
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Integrator: ${block.name}`}
      size="md"
      centered
    >
      <Stack gap="md">
        <NumberInput
          label="Initial Value"
          value={initialValue}
          onChange={(val) => setInitialValue(typeof val === 'number' ? val : 0)}
          decimalScale={10}
          description="The starting value of the integrator at t=0"
          placeholder="Enter initial value"
        />

        <Divider label="Optional Inputs" labelPosition="left" />

        <Stack gap="xs">
          <Checkbox
            label="Show Enable Input"
            description="When enabled input is 0, integration is paused (output holds)"
            checked={showEnableInput}
            onChange={(e) => setShowEnableInput(e.currentTarget.checked)}
          />

          <Checkbox
            label="Show Reset Input"
            description="On rising edge, resets output to initial value"
            checked={showResetInput}
            onChange={(e) => setShowResetInput(e.currentTarget.checked)}
          />
        </Stack>

        <Divider label="Output Limits" labelPosition="left" />

        <Checkbox
          label="Use Output Limits"
          checked={useLimits}
          onChange={(e) => setUseLimits(e.currentTarget.checked)}
        />

        {useLimits && (
          <Stack gap="xs" ml="md">
            <NumberInput
              label="Lower Limit"
              value={isFinite(lowerLimit) ? lowerLimit : undefined}
              onChange={handleLowerChange}
              decimalScale={10}
              placeholder="Enter lower limit"
            />

            <NumberInput
              label="Upper Limit"
              value={isFinite(upperLimit) ? upperLimit : undefined}
              onChange={handleUpperChange}
              decimalScale={10}
              placeholder="Enter upper limit"
            />

            <Text size="xs" c="dimmed">
              With saturation: when at limit and derivative would push further, integration stops
            </Text>
          </Stack>
        )}

        {error && (
          <Alert variant="light" color="red" title="Validation Error">
            {error}
          </Alert>
        )}

        <Alert variant="light" color="blue" icon={<IconInfoCircle />} title="Integrator Block">
          Integrates the input signal over time using Euler integration.
          Output = Initial Value + ∫ Input dt
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

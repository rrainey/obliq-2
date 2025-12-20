// components/ConditionConfig.tsx

'use client'

import { useState } from 'react'
import { Modal, TextInput, Button, Stack, Group, Alert, SimpleGrid, Text, Paper } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface ConditionConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function ConditionConfig({ block, onUpdate, onClose }: ConditionConfigProps) {
  const [condition, setCondition] = useState(block?.parameters?.condition || '> 0')
  const [isValid, setIsValid] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const validateCondition = (value: string): boolean => {
    const operatorMatch = value.match(/^\s*(>|<|>=|<=|==|!=)\s*(.+)$/)

    if (!operatorMatch) {
      setErrorMessage('Invalid format. Use: operator value (e.g., "> 10.0")')
      setIsValid(false)
      return false
    }

    const comparisonValue = operatorMatch[2].trim()
    const valuePattern = /^-?\d+(\.\d+)?([eE][+-]?\d+)?[fFlL]?$/

    if (!valuePattern.test(comparisonValue)) {
      setErrorMessage('Invalid value. Use a numeric constant (e.g., 10, 3.14, 1.0f)')
      setIsValid(false)
      return false
    }

    setErrorMessage('')
    setIsValid(true)
    return true
  }

  const handleConditionChange = (value: string) => {
    setCondition(value)
    validateCondition(value)
  }

  const handleSave = () => {
    if (validateCondition(condition)) {
      onUpdate({ condition })
      onClose()
    }
  }

  const examples = [
    { label: 'Greater than zero', value: '> 0' },
    { label: 'Less than zero', value: '< 0' },
    { label: 'Greater than 10', value: '> 10.0' },
    { label: 'Less than -5', value: '< -5.0' },
    { label: 'Equal to 1', value: '== 1.0' },
    { label: 'Not equal to 0', value: '!= 0' },
    { label: 'Greater or equal 100', value: '>= 100.0' },
    { label: 'Less or equal 0.5', value: '<= 0.5' },
  ]

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Condition: ${block?.name || 'Condition'}`}
      size="lg"
      centered
    >
      <Stack gap="md">
        <TextInput
          label="Condition (x1 <operator> <value>)"
          value={condition}
          onChange={(e) => handleConditionChange(e.target.value)}
          error={!isValid ? errorMessage : undefined}
          placeholder="> 10.0"
          description="Enter a comparison operator (>, <, >=, <=, ==, !=) followed by a numeric value"
        />

        <div>
          <Text size="sm" fw={500} mb="xs">Quick Examples</Text>
          <SimpleGrid cols={2} spacing="xs">
            {examples.map((example) => (
              <Paper
                key={example.value}
                p="xs"
                withBorder
                style={{ cursor: 'pointer' }}
                onClick={() => handleConditionChange(example.value)}
              >
                <Text size="sm" fw={500}>{example.label}</Text>
                <Text size="xs" c="dimmed" ff="monospace">{example.value}</Text>
              </Paper>
            ))}
          </SimpleGrid>
        </div>

        <Alert variant="light" color="blue" icon={<IconInfoCircle />} title="Condition Block">
          Outputs true when the input signal (x1) satisfies the specified condition.
          The output is a boolean signal that can be used with control blocks like the If block.
          Example: If condition is &quot;&gt; 10.0&quot;, the block outputs true when the input is greater than 10.0.
        </Alert>

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

// components/EvaluateConfig.tsx

'use client'

import { useState, useEffect } from 'react'
import { Modal, NumberInput, Textarea, Button, Stack, Group, Alert, Text, Paper, SimpleGrid, Divider } from '@mantine/core'
import { IconInfoCircle, IconCheck, IconAlertTriangle, IconX } from '@tabler/icons-react'
import { BlockData } from './BlockNode'
import { C99ExpressionParser } from '@/lib/c99ExpressionParser'
import { C99ExpressionValidator } from '@/lib/c99ExpressionValidator'
import { useModelStore } from '@/lib/modelStore'

interface EvaluateConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function EvaluateConfig({ block, onUpdate, onClose }: EvaluateConfigProps) {
  const parameters = useModelStore((state) => state.parameters)
  const [numInputs, setNumInputs] = useState<number>(block?.parameters?.numInputs || 2)
  const [expression, setExpression] = useState(block?.parameters?.expression || 'in(0) + in(1)')
  const [isValid, setIsValid] = useState(true)
  const [errors, setErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [usedInputs, setUsedInputs] = useState<number[]>([])

  useEffect(() => {
    validateExpression()
  }, [expression, numInputs])

  const validateExpression = () => {
    try {
      const parser = new C99ExpressionParser(expression)
      const ast = parser.parse()
      const parameterNames = parameters.map(p => p.name)
      const validator = new C99ExpressionValidator(numInputs, parameterNames)
      const result = validator.validate(ast)

      setIsValid(result.valid)
      setErrors(result.errors)
      setWarnings(result.warnings)
      setUsedInputs(Array.from(result.usedInputs).sort((a, b) => a - b))
    } catch (error) {
      setIsValid(false)
      setErrors([error instanceof Error ? error.message : 'Invalid expression'])
      setWarnings([])
      setUsedInputs([])
    }
  }

  const handleSave = () => {
    if (isValid) {
      onUpdate({ numInputs, expression })
      onClose()
    }
  }

  const templates = [
    { name: 'Sum', expr: 'in(0) + in(1)', inputs: 2 },
    { name: 'Difference', expr: 'in(0) - in(1)', inputs: 2 },
    { name: 'Product', expr: 'in(0) * in(1)', inputs: 2 },
    { name: 'Average', expr: '(in(0) + in(1)) / 2', inputs: 2 },
    { name: 'Max', expr: 'in(0) > in(1) ? in(0) : in(1)', inputs: 2 },
    { name: 'Min', expr: 'in(0) < in(1) ? in(0) : in(1)', inputs: 2 },
    { name: 'Clamp', expr: 'in(0) < in(1) ? in(1) : (in(0) > in(2) ? in(2) : in(0))', inputs: 3 },
    { name: 'Weighted Sum', expr: 'in(0) * 0.7 + in(1) * 0.3', inputs: 2 },
    { name: 'Logic AND', expr: 'in(0) && in(1)', inputs: 2 },
    { name: 'Logic OR', expr: 'in(0) || in(1)', inputs: 2 },
    { name: 'Threshold', expr: 'in(0) > 0.5 ? 1 : 0', inputs: 1 },
    { name: 'Deadband', expr: '(in(0) > -0.1 && in(0) < 0.1) ? 0 : in(0)', inputs: 1 },
    { name: 'Square Root', expr: 'sqrt(in(0))', inputs: 1 },
    { name: 'Power', expr: 'pow(in(0), in(1))', inputs: 2 },
    { name: 'Sine Wave', expr: 'sin(in(0))', inputs: 1 },
    { name: 'Cosine Wave', expr: 'cos(in(0))', inputs: 1 },
    { name: 'Magnitude', expr: 'sqrt(pow(in(0), 2) + pow(in(1), 2))', inputs: 2 },
    { name: 'Angle', expr: 'atan2(in(1), in(0))', inputs: 2 },
    { name: 'Absolute Value', expr: 'fabs(in(0))', inputs: 1 },
    { name: 'Round', expr: 'round(in(0))', inputs: 1 },
  ]

  const applyTemplate = (template: typeof templates[0]) => {
    setNumInputs(template.inputs)
    setExpression(template.expr)
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Evaluate: ${block?.name || 'Evaluate'}`}
      size="xl"
      centered
    >
      <Stack gap="md">
        <NumberInput
          label="Number of Inputs"
          value={numInputs}
          onChange={(val) => setNumInputs(typeof val === 'number' ? Math.max(1, Math.min(10, val)) : 1)}
          min={1}
          max={10}
          w={100}
          description="Number of scalar input ports (1-10)"
        />

        <Textarea
          label="Expression"
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          minRows={3}
          autosize
          maxRows={6}
          placeholder="e.g., in(0) + in(1) * 2"
          error={!isValid}
          styles={{ input: { fontFamily: 'monospace' } }}
        />

        {errors.length > 0 && (
          <Stack gap={4}>
            {errors.map((error, i) => (
              <Group key={i} gap="xs">
                <IconX size={16} color="var(--mantine-color-red-6)" />
                <Text size="sm" c="red">{error}</Text>
              </Group>
            ))}
          </Stack>
        )}

        {warnings.length > 0 && (
          <Stack gap={4}>
            {warnings.map((warning, i) => (
              <Group key={i} gap="xs">
                <IconAlertTriangle size={16} color="var(--mantine-color-yellow-6)" />
                <Text size="sm" c="yellow.8">{warning}</Text>
              </Group>
            ))}
          </Stack>
        )}

        {isValid && usedInputs.length > 0 && (
          <Group gap="xs">
            <IconCheck size={16} color="var(--mantine-color-green-6)" />
            <Text size="sm" c="green">Valid expression using inputs: {usedInputs.map(i => `in(${i})`).join(', ')}</Text>
          </Group>
        )}

        <SimpleGrid cols={4}>
          <Paper p="xs" withBorder>
            <Text size="xs" fw={500}>Input Access</Text>
            <Text size="xs" c="dimmed">in(0) - First input</Text>
            <Text size="xs" c="dimmed">in(1) - Second input</Text>
            <Text size="xs" c="dimmed">in(n) - (n+1)th input</Text>
          </Paper>
          <Paper p="xs" withBorder>
            <Text size="xs" fw={500}>Parameters</Text>
            {parameters.length > 0 ? (
              parameters.slice(0, 3).map((param) => (
                <Text key={param.name} size="xs" c="dimmed">{param.name}</Text>
              ))
            ) : (
              <Text size="xs" c="dimmed" fs="italic">No parameters</Text>
            )}
            {parameters.length > 3 && (
              <Text size="xs" c="dimmed">... +{parameters.length - 3} more</Text>
            )}
          </Paper>
          <Paper p="xs" withBorder>
            <Text size="xs" fw={500}>Operators</Text>
            <Text size="xs" c="dimmed">+ - * / % (arithmetic)</Text>
            <Text size="xs" c="dimmed">{'<'} {'>'} == != (compare)</Text>
            <Text size="xs" c="dimmed">&& || ! (logical)</Text>
            <Text size="xs" c="dimmed">? : (conditional)</Text>
          </Paper>
          <Paper p="xs" withBorder>
            <Text size="xs" fw={500}>Math Functions</Text>
            <Text size="xs" c="dimmed">sqrt, pow, fabs</Text>
            <Text size="xs" c="dimmed">sin, cos, tan, atan2</Text>
            <Text size="xs" c="dimmed">ceil, floor, round</Text>
            <Text size="xs" c="dimmed">fmin, fmax</Text>
          </Paper>
        </SimpleGrid>

        <Divider label="Expression Templates" labelPosition="left" />

        <SimpleGrid cols={4} spacing="xs">
          {templates.map((template) => (
            <Paper
              key={template.name}
              p="xs"
              withBorder
              style={{ cursor: 'pointer' }}
              onClick={() => applyTemplate(template)}
            >
              <Text size="xs" fw={500}>{template.name}</Text>
              <Text size="xs" c="dimmed">({template.inputs} inputs)</Text>
            </Paper>
          ))}
        </SimpleGrid>

        <Alert variant="light" color="blue" icon={<IconInfoCircle />} title="Evaluate Block">
          Computes an output value using a C-style arithmetic/logical expression.
          Use in(n) to access the nth input (0-indexed). You can also reference model parameters by name.
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

'use client'

import { useState, useEffect } from 'react'
import { Modal, TextInput, Button, Stack, Group, Alert, Checkbox, Text, ActionIcon, Badge } from '@mantine/core'
import { IconInfoCircle, IconPlus, IconMinus } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface SumConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function SumConfig({ block, onUpdate, onClose }: SumConfigProps) {
  const [signs, setSigns] = useState(block?.parameters?.signs || '++')
  const [signsError, setSignsError] = useState<string>('')
  const [showPortNames, setShowPortNames] = useState(block?.parameters?.showPortNames || false)

  // Validate signs string
  useEffect(() => {
    if (!signs) {
      setSignsError('Signs cannot be empty')
    } else if (!/^[+-]+$/.test(signs)) {
      setSignsError('Signs must contain only + and - characters')
    } else if (signs.length < 2) {
      setSignsError('Must have at least 2 inputs')
    } else if (signs.length > 10) {
      setSignsError('Maximum 10 inputs allowed')
    } else {
      setSignsError('')
    }
  }, [signs])

  const handleSave = () => {
    const parameters = {
      signs,
      numInputs: signs.length,
      inputs: signs,
      showPortNames
    }
    onUpdate(parameters)
    onClose()
  }

  const handleSignToggle = (index: number) => {
    const signsArray = signs.split('')
    signsArray[index] = signsArray[index] === '+' ? '-' : '+'
    setSigns(signsArray.join(''))
  }

  const handleAddInput = () => {
    if (signs.length < 10) {
      setSigns(signs + '+')
    }
  }

  const handleRemoveInput = () => {
    if (signs.length > 2) {
      setSigns(signs.slice(0, -1))
    }
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Sum: ${block?.name || 'Sum Block'}`}
      size="lg"
      centered
    >
      <Stack gap="md">
        <TextInput
          label="Input Signs Pattern"
          value={signs}
          onChange={(e) => setSigns(e.target.value)}
          error={signsError}
          placeholder="e.g., ++, +-, +-+"
          description="Use + for addition, - for subtraction. Length determines number of inputs."
        />

        <div>
          <Text size="sm" fw={500} mb="xs">Input Configuration</Text>
          <Stack gap="xs">
            {signs.split('').map((sign: string, index: number) => (
              <Group key={index} gap="sm">
                <Text size="sm" c="dimmed" w={60}>Input {index + 1}:</Text>
                <ActionIcon
                  variant="light"
                  color={sign === '+' ? 'green' : 'red'}
                  size="lg"
                  onClick={() => handleSignToggle(index)}
                >
                  {sign === '+' ? <IconPlus size={18} /> : <IconMinus size={18} />}
                </ActionIcon>
                <Text size="sm" c="dimmed">
                  {sign === '+' ? 'Addition' : 'Subtraction'}
                </Text>
              </Group>
            ))}
          </Stack>

          <Group gap="sm" mt="md">
            <Button
              variant="light"
              color="blue"
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={handleAddInput}
              disabled={signs.length >= 10}
            >
              Add Input
            </Button>
            <Button
              variant="light"
              color="red"
              size="xs"
              leftSection={<IconMinus size={14} />}
              onClick={handleRemoveInput}
              disabled={signs.length <= 2}
            >
              Remove Input
            </Button>
            <Badge variant="light" color="gray">
              {signs.length} inputs
            </Badge>
          </Group>
        </div>

        <Alert variant="light" color="blue" icon={<IconInfoCircle />} title="Sum Block">
          Adds and/or subtracts multiple input signals based on the signs pattern.
          Each character in the pattern creates an input port with the corresponding operation.
        </Alert>

        <Alert variant="light" color="yellow" icon={<IconInfoCircle />} title="Example Patterns">
          • "++" - Add two inputs (default)<br />
          • "+-" - Subtract second input from first<br />
          • "+++" - Add three inputs<br />
          • "+-+" - First + third - second
        </Alert>

        <Checkbox
          label="Show Port Names"
          description="When enabled, displays the names of connected Input/Output Port blocks next to each input port."
          checked={showPortNames}
          onChange={(e) => setShowPortNames(e.currentTarget.checked)}
        />

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!!signsError}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

// components/ModelParametersDialog.tsx
'use client'

import { useState } from 'react'
import {
  Modal,
  Table,
  Button,
  Group,
  Stack,
  Text,
  ActionIcon,
  Tooltip,
  TextInput,
  Select,
  NumberInput,
  Paper,
  Alert,
  Code
} from '@mantine/core'
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconCheck,
  IconX,
  IconAlertCircle
} from '@tabler/icons-react'
import { useModelStore } from '@/lib/modelStore'
import { ModelParameter } from '@/lib/modelSchema'

interface ModelParametersDialogProps {
  opened: boolean
  onClose: () => void
  disabled?: boolean
}

interface ParameterFormData {
  name: string
  signalType: string
  value: string
}

const SIGNAL_TYPES = [
  { value: 'double', label: 'double' },
  { value: 'float', label: 'float' },
  { value: 'long', label: 'long' },
  { value: 'bool', label: 'bool' },
  { value: 'double[]', label: 'double[] (vector)' },
  { value: 'float[]', label: 'float[] (vector)' },
  { value: 'long[]', label: 'long[] (vector)' },
  { value: 'bool[]', label: 'bool[] (vector)' },
  { value: 'double[][]', label: 'double[][] (matrix)' },
  { value: 'float[][]', label: 'float[][] (matrix)' }
]

export default function ModelParametersDialog({
  opened,
  onClose,
  disabled = false
}: ModelParametersDialogProps) {
  const parameters = useModelStore((state) => state.parameters)
  const addParameter = useModelStore((state) => state.addParameter)
  const updateParameter = useModelStore((state) => state.updateParameter)
  const deleteParameter = useModelStore((state) => state.deleteParameter)
  const validateParameterName = useModelStore((state) => state.validateParameterName)

  const [editingParam, setEditingParam] = useState<string | null>(null)
  const [addingParam, setAddingParam] = useState(false)
  const [formData, setFormData] = useState<ParameterFormData>({
    name: '',
    signalType: 'double',
    value: '0'
  })
  const [formError, setFormError] = useState<string | null>(null)

  // Reset form
  const resetForm = () => {
    setFormData({ name: '', signalType: 'double', value: '0' })
    setFormError(null)
    setAddingParam(false)
    setEditingParam(null)
  }

  // Start editing a parameter
  const startEdit = (param: ModelParameter) => {
    setEditingParam(param.name)
    setFormData({
      name: param.name,
      signalType: param.signalType,
      value: formatValue(param.value, param.signalType)
    })
    setFormError(null)
  }

  // Format value for display in text input
  const formatValue = (value: number | number[] | number[][], signalType: string): string => {
    if (signalType.includes('[][]')) {
      // Matrix
      return JSON.stringify(value)
    } else if (signalType.includes('[]')) {
      // Vector
      return JSON.stringify(value)
    } else {
      // Scalar
      return String(value)
    }
  }

  // Parse value from text input
  const parseValue = (valueStr: string, signalType: string): number | number[] | number[][] | null => {
    try {
      if (signalType.includes('[][]')) {
        // Matrix
        const parsed = JSON.parse(valueStr)
        if (!Array.isArray(parsed) || !parsed.every(row => Array.isArray(row))) {
          return null
        }
        return parsed
      } else if (signalType.includes('[]')) {
        // Vector
        const parsed = JSON.parse(valueStr)
        if (!Array.isArray(parsed)) {
          return null
        }
        return parsed
      } else {
        // Scalar
        const num = parseFloat(valueStr)
        if (isNaN(num)) {
          return null
        }
        return num
      }
    } catch {
      return null
    }
  }

  // Validate form data
  const validateForm = (data: ParameterFormData, originalName?: string): string | null => {
    // Validate name
    const nameValidation = validateParameterName(data.name, originalName)
    if (!nameValidation.valid) {
      return nameValidation.error || 'Invalid parameter name'
    }

    // Validate value
    const parsedValue = parseValue(data.value, data.signalType)
    if (parsedValue === null) {
      if (data.signalType.includes('[][]')) {
        return 'Value must be a valid 2D array (e.g., [[1, 2], [3, 4]])'
      } else if (data.signalType.includes('[]')) {
        return 'Value must be a valid array (e.g., [1, 2, 3])'
      } else {
        return 'Value must be a valid number'
      }
    }

    return null
  }

  // Handle add parameter
  const handleAdd = () => {
    const error = validateForm(formData)
    if (error) {
      setFormError(error)
      return
    }

    const parsedValue = parseValue(formData.value, formData.signalType)
    if (parsedValue === null) {
      setFormError('Invalid value')
      return
    }

    const newParam: ModelParameter = {
      name: formData.name,
      signalType: formData.signalType,
      value: parsedValue
    }

    addParameter(newParam)
    resetForm()
  }

  // Handle update parameter
  const handleUpdate = (originalName: string) => {
    const error = validateForm(formData, originalName)
    if (error) {
      setFormError(error)
      return
    }

    const parsedValue = parseValue(formData.value, formData.signalType)
    if (parsedValue === null) {
      setFormError('Invalid value')
      return
    }

    updateParameter(originalName, {
      name: formData.name,
      signalType: formData.signalType,
      value: parsedValue
    })
    resetForm()
  }

  // Handle delete parameter
  const handleDelete = (name: string) => {
    if (confirm(`Are you sure you want to delete parameter "${name}"?`)) {
      deleteParameter(name)
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Model Parameters"
      size="xl"
      centered
    >
      <Stack gap="md">
        {/* Info alert */}
        <Alert icon={<IconAlertCircle size={16} />} color="blue" variant="light">
          Model parameters are global name/type/value tuples that can be referenced throughout your model.
        </Alert>

        {/* Parameters table */}
        {parameters.length > 0 || addingParam ? (
          <Paper withBorder>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Value</Table.Th>
                  <Table.Th style={{ width: 100 }}>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {parameters.map((param) => (
                  editingParam === param.name ? (
                    // Edit mode
                    <Table.Tr key={param.name}>
                      <Table.Td>
                        <TextInput
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
                          placeholder="Parameter name"
                          size="xs"
                          disabled={disabled}
                          error={formError?.includes('name') || formError?.includes('identifier') || formError?.includes('exists') || formError?.includes('conflicts')}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Select
                          value={formData.signalType}
                          onChange={(value) => setFormData({ ...formData, signalType: value || 'double' })}
                          data={SIGNAL_TYPES}
                          size="xs"
                          disabled={disabled}
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          value={formData.value}
                          onChange={(e) => setFormData({ ...formData, value: e.currentTarget.value })}
                          placeholder="Value"
                          size="xs"
                          disabled={disabled}
                          error={formError?.includes('Value') || formError?.includes('array') || formError?.includes('number')}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Tooltip label="Save">
                            <ActionIcon
                              color="green"
                              variant="subtle"
                              onClick={() => handleUpdate(param.name)}
                              disabled={disabled}
                            >
                              <IconCheck size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Cancel">
                            <ActionIcon
                              color="gray"
                              variant="subtle"
                              onClick={resetForm}
                              disabled={disabled}
                            >
                              <IconX size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    // Display mode
                    <Table.Tr key={param.name}>
                      <Table.Td>
                        <Code>{param.name}</Code>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">{param.signalType}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" style={{ fontFamily: 'monospace' }}>
                          {formatValue(param.value, param.signalType)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Tooltip label="Edit">
                            <ActionIcon
                              color="blue"
                              variant="subtle"
                              onClick={() => startEdit(param)}
                              disabled={disabled}
                            >
                              <IconEdit size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Delete">
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              onClick={() => handleDelete(param.name)}
                              disabled={disabled}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  )
                ))}

                {/* Add new parameter row */}
                {addingParam && (
                  <Table.Tr>
                    <Table.Td>
                      <TextInput
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
                        placeholder="MY_PARAMETER"
                        size="xs"
                        disabled={disabled}
                        error={formError?.includes('name') || formError?.includes('identifier') || formError?.includes('exists') || formError?.includes('conflicts')}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Select
                        value={formData.signalType}
                        onChange={(value) => setFormData({ ...formData, signalType: value || 'double' })}
                        data={SIGNAL_TYPES}
                        size="xs"
                        disabled={disabled}
                      />
                    </Table.Td>
                    <Table.Td>
                      <TextInput
                        value={formData.value}
                        onChange={(e) => setFormData({ ...formData, value: e.currentTarget.value })}
                        placeholder="0 or [1,2,3] or [[1,2],[3,4]]"
                        size="xs"
                        disabled={disabled}
                        error={formError?.includes('Value') || formError?.includes('array') || formError?.includes('number')}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Tooltip label="Add">
                          <ActionIcon
                            color="green"
                            variant="subtle"
                            onClick={handleAdd}
                            disabled={disabled}
                          >
                            <IconCheck size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Cancel">
                          <ActionIcon
                            color="gray"
                            variant="subtle"
                            onClick={resetForm}
                            disabled={disabled}
                          >
                            <IconX size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Paper>
        ) : (
          <Text size="sm" c="dimmed" ta="center" py="xl">
            No parameters defined. Click "Add Parameter" to create one.
          </Text>
        )}

        {/* Form error display */}
        {formError && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light" onClose={() => setFormError(null)}>
            {formError}
          </Alert>
        )}

        {/* Action buttons */}
        <Group justify="space-between">
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setAddingParam(true)}
            disabled={disabled || addingParam || editingParam !== null}
            variant="light"
          >
            Add Parameter
          </Button>

          <Button onClick={onClose} variant="default">
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

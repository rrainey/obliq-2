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
import { isValidType, getTypeValidationError } from '@/lib/typeValidator'
import { isValidC99Initializer, getC99InitializerError, toC99Initializer, parseC99Initializer } from '@/lib/c99InitializerValidator'

interface ModelParametersDialogProps {
  opened: boolean
  onClose: () => void
  disabled?: boolean
}

interface ParameterFormData {
  name: string
  dataType: string
  defaultValue: string
}

// Common base types for quick selection
const BASE_TYPE_OPTIONS = [
  { value: 'double', label: 'double' },
  { value: 'float', label: 'float' },
  { value: 'long', label: 'long' },
  { value: 'bool', label: 'bool' },
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
    dataType: 'double',
    defaultValue: '0'
  })
  const [formError, setFormError] = useState<string | null>(null)

  // Reset form
  const resetForm = () => {
    setFormData({ name: '', dataType: 'double', defaultValue: '0' })
    setFormError(null)
    setAddingParam(false)
    setEditingParam(null)
  }

  // Start editing a parameter
  const startEdit = (param: ModelParameter) => {
    setEditingParam(param.name)
    // Convert legacy signalType to dataType if needed
    const dataType = param.dataType || convertLegacySignalType(param.signalType, param.value)
    const defaultValue = param.defaultValue || convertLegacyValue(param.value, dataType)
    setFormData({
      name: param.name,
      dataType,
      defaultValue
    })
    setFormError(null)
  }

  // Convert legacy JavaScript-style signalType to C-style dataType
  const convertLegacySignalType = (signalType: string | undefined, value: any): string => {
    if (!signalType) return 'double'

    // Handle legacy array types by inferring dimensions from value
    if (signalType.includes('[][]') && Array.isArray(value) && Array.isArray(value[0])) {
      const rows = value.length
      const cols = value[0].length
      const baseType = signalType.replace('[][]', '')
      return `${baseType}[${rows}][${cols}]`
    } else if (signalType.includes('[]') && Array.isArray(value)) {
      const size = value.length
      const baseType = signalType.replace('[]', '')
      return `${baseType}[${size}]`
    }
    return signalType
  }

  // Convert legacy JavaScript value to C99 initializer string
  const convertLegacyValue = (value: any, dataType: string): string => {
    if (typeof value === 'string') {
      // Already a C99 initializer string
      return value
    }
    // Convert JavaScript value to C99 initializer
    return toC99Initializer(value, dataType)
  }

  // Validate form data using C99 validators
  const validateForm = (data: ParameterFormData, originalName?: string): string | null => {
    // Validate name
    const nameValidation = validateParameterName(data.name, originalName)
    if (!nameValidation.valid) {
      return nameValidation.error || 'Invalid parameter name'
    }

    // Validate dataType using C-language type syntax
    if (!isValidType(data.dataType)) {
      const typeError = getTypeValidationError(data.dataType)
      return typeError || `Invalid type: ${data.dataType}. Use: double, float, long, bool, or arrays like double[3], double[2][3]`
    }

    // Validate defaultValue is a valid C99 initializer for the dataType
    if (!isValidC99Initializer(data.defaultValue, data.dataType)) {
      const valueError = getC99InitializerError(data.defaultValue, data.dataType)
      return valueError || `Invalid value for type ${data.dataType}`
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

    // Parse the C99 initializer to get the JavaScript value for storage
    const parseResult = parseC99Initializer(formData.defaultValue, formData.dataType)
    if (!parseResult.valid) {
      setFormError(parseResult.error || 'Invalid value')
      return
    }

    const newParam: ModelParameter = {
      name: formData.name,
      signalType: formData.dataType, // Keep signalType for backward compatibility
      dataType: formData.dataType,
      value: parseResult.value!,
      defaultValue: formData.defaultValue
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

    // Parse the C99 initializer to get the JavaScript value for storage
    const parseResult = parseC99Initializer(formData.defaultValue, formData.dataType)
    if (!parseResult.valid) {
      setFormError(parseResult.error || 'Invalid value')
      return
    }

    updateParameter(originalName, {
      name: formData.name,
      signalType: formData.dataType, // Keep signalType for backward compatibility
      dataType: formData.dataType,
      value: parseResult.value!,
      defaultValue: formData.defaultValue
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
          <Text size="sm">Model parameters are global name/type/value tuples that can be referenced throughout your model.</Text>
          <Text size="xs" c="dimmed" mt={4}>
            Types: double, float, long, bool, or arrays like double[3], double[2][3].
            Values use C99 syntax: 42, 3.14f, true, {'{1, 2, 3}'}, {'{{1, 0}, {0, 1}}'}.
          </Text>
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
                        <TextInput
                          value={formData.dataType}
                          onChange={(e) => setFormData({ ...formData, dataType: e.currentTarget.value })}
                          placeholder="double, float[3], etc."
                          size="xs"
                          disabled={disabled}
                          error={formError?.includes('type') || formError?.includes('Invalid type')}
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          value={formData.defaultValue}
                          onChange={(e) => setFormData({ ...formData, defaultValue: e.currentTarget.value })}
                          placeholder="0, {1, 2, 3}, etc."
                          size="xs"
                          disabled={disabled}
                          error={formError?.includes('value') || formError?.includes('initializer') || formError?.includes('Expected')}
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
                        <Text size="sm" c="dimmed">{param.dataType || param.signalType}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" style={{ fontFamily: 'monospace' }}>
                          {param.defaultValue || toC99Initializer(param.value, param.dataType || param.signalType || 'double')}
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
                      <TextInput
                        value={formData.dataType}
                        onChange={(e) => setFormData({ ...formData, dataType: e.currentTarget.value })}
                        placeholder="double, float[3], etc."
                        size="xs"
                        disabled={disabled}
                        error={formError?.includes('type') || formError?.includes('Invalid type')}
                      />
                    </Table.Td>
                    <Table.Td>
                      <TextInput
                        value={formData.defaultValue}
                        onChange={(e) => setFormData({ ...formData, defaultValue: e.currentTarget.value })}
                        placeholder="0, {1, 2, 3}, etc."
                        size="xs"
                        disabled={disabled}
                        error={formError?.includes('value') || formError?.includes('initializer') || formError?.includes('Expected')}
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

// components/SubsystemConfig.tsx
'use client'

import { useState } from 'react'
import { Modal, TextInput, Select, Button, Stack, Group, Alert, Text, Table, ActionIcon, Checkbox, Divider, Collapse, Paper } from '@mantine/core'
import { IconInfoCircle, IconPlus, IconPencil, IconTrash, IconExternalLink, IconCheck, IconX, IconChevronDown } from '@tabler/icons-react'
import { BlockData } from './BlockNode'
import { Sheet } from '@/lib/modelStore'
import { ModelParameter } from '@/lib/modelSchema'

interface SubsystemConfigProps {
  block: BlockData
  availableSheets?: Sheet[]
  onUpdate: (parameters: Record<string, any>) => void
  onRename?: (newName: string) => void
  onClose: () => void
  onSheetNavigate?: (sheetId: string) => void
}

type CodeGenStrategy = 'flatten' | 'segregated' | 'segregated_atomic'

const CODE_GEN_STRATEGY_OPTIONS = [
  { value: 'flatten', label: 'Flatten', description: 'Pulls all blocks into the top-level model (default)' },
  { value: 'segregated', label: 'Segregated', description: 'Keeps subsystem blocks separate during code generation' },
  { value: 'segregated_atomic', label: 'Segregated, atomic', description: 'Keeps subsystem blocks separate and treats them as atomic units' },
]

const SIGNAL_TYPES = [
  { value: 'double', label: 'double' },
  { value: 'float', label: 'float' },
  { value: 'long', label: 'long' },
  { value: 'bool', label: 'bool' },
]

interface ParameterFormData {
  name: string
  signalType: string
  value: string
}

export default function SubsystemConfig({ block, availableSheets = [], onUpdate, onRename, onClose, onSheetNavigate }: SubsystemConfigProps) {
  const [blockName, setBlockName] = useState(block.name)
  const [sheets, setSheets] = useState<Sheet[]>(block.parameters?.sheets || [])
  const [inputPorts, setInputPorts] = useState(block.parameters?.inputPorts || ['Input1'])
  const [outputPorts, setOutputPorts] = useState(block.parameters?.outputPorts || ['Output1'])
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null)
  const [editingSheetName, setEditingSheetName] = useState('')
  const [showEnableInput, setShowEnableInput] = useState(block.parameters?.showEnableInput || false)
  const [showPortNames, setShowPortNames] = useState(block.parameters?.showPortNames || false)
  const [codeGenStrategy, setCodeGenStrategy] = useState<CodeGenStrategy>(block.parameters?.codeGenStrategy || 'flatten')
  const [parameters, setParameters] = useState<ModelParameter[]>(block.parameters?.parameters || [])
  const [editingParamIndex, setEditingParamIndex] = useState<number | null>(null)
  const [addingParam, setAddingParam] = useState(false)
  const [paramFormData, setParamFormData] = useState<ParameterFormData>({ name: '', signalType: 'double', value: '0' })
  const [paramFormError, setParamFormError] = useState<string | null>(null)
  const [showParameters, setShowParameters] = useState(false)

  const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const handleSave = () => {
    const nameChanged = blockName !== block.name
    let updatedSheets = sheets
    if (nameChanged) {
      updatedSheets = sheets.map(sheet => {
        const oldNamePattern = new RegExp(`^${escapeRegExp(block.name)}\\s+`)
        if (oldNamePattern.test(sheet.name)) {
          return { ...sheet, name: sheet.name.replace(oldNamePattern, `${blockName} `) }
        }
        return sheet
      })
    }

    const blockParams = {
      sheets: updatedSheets,
      inputPorts: inputPorts.filter((port: string) => port.trim() !== ''),
      outputPorts: outputPorts.filter((port: string) => port.trim() !== ''),
      showEnableInput,
      showPortNames,
      codeGenStrategy,
      parameters: (codeGenStrategy === 'segregated' || codeGenStrategy === 'segregated_atomic') ? parameters : []
    }
    onUpdate(blockParams)

    if (nameChanged && onRename) {
      onRename(blockName)
    }

    onClose()
  }

  const addInputPort = () => setInputPorts([...inputPorts, `Input${inputPorts.length + 1}`])
  const removeInputPort = (index: number) => {
    if (inputPorts.length > 1) setInputPorts(inputPorts.filter((_: string, i: number) => i !== index))
  }
  const updateInputPort = (index: number, value: string) => {
    const updated = [...inputPorts]
    updated[index] = value
    setInputPorts(updated)
  }

  const addOutputPort = () => setOutputPorts([...outputPorts, `Output${outputPorts.length + 1}`])
  const removeOutputPort = (index: number) => {
    if (outputPorts.length > 1) setOutputPorts(outputPorts.filter((_: string, i: number) => i !== index))
  }
  const updateOutputPort = (index: number, value: string) => {
    const updated = [...outputPorts]
    updated[index] = value
    setOutputPorts(updated)
  }

  const addSubsystemSheet = () => {
    const newSheet: Sheet = {
      id: `${block.id}_sheet_${Date.now()}`,
      name: `${blockName} Sheet ${sheets.length + 1}`,
      blocks: [],
      connections: [],
      extents: { width: 1000, height: 800 }
    }
    setSheets([...sheets, newSheet])
  }

  const startEditingSheet = (sheet: Sheet) => {
    setEditingSheetId(sheet.id)
    setEditingSheetName(sheet.name)
  }

  const saveSheetName = () => {
    if (editingSheetId && editingSheetName.trim()) {
      setSheets(sheets.map(sheet =>
        sheet.id === editingSheetId ? { ...sheet, name: editingSheetName.trim() } : sheet
      ))
    }
    setEditingSheetId(null)
    setEditingSheetName('')
  }

  const deleteSheet = (sheetId: string) => {
    const sheet = sheets.find(s => s.id === sheetId)
    if (!sheet || sheets.length <= 1) return
    const hasContent = sheet.blocks.length > 0 || sheet.connections.length > 0
    const confirmMessage = hasContent
      ? `Are you sure you want to delete "${sheet.name}"? This sheet contains ${sheet.blocks.length} blocks and ${sheet.connections.length} connections.`
      : `Are you sure you want to delete "${sheet.name}"?`
    if (window.confirm(confirmMessage)) {
      setSheets(sheets.filter(s => s.id !== sheetId))
    }
  }

  const navigateToSheet = (sheetId: string) => {
    handleSave()
    if (onSheetNavigate) onSheetNavigate(sheetId)
  }

  const resetParamForm = () => {
    setParamFormData({ name: '', signalType: 'double', value: '0' })
    setParamFormError(null)
    setAddingParam(false)
    setEditingParamIndex(null)
  }

  const startEditingParam = (index: number) => {
    const param = parameters[index]
    setEditingParamIndex(index)
    setParamFormData({ name: param.name, signalType: param.signalType, value: String(param.value) })
    setParamFormError(null)
  }

  const validateParamForm = (data: ParameterFormData, excludeIndex?: number): string | null => {
    if (!data.name.trim()) return 'Parameter name cannot be empty'
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(data.name)) return 'Invalid identifier format'
    const existingIndex = parameters.findIndex(p => p.name === data.name)
    if (existingIndex !== -1 && existingIndex !== excludeIndex) return `Parameter "${data.name}" already exists`
    if (isNaN(parseFloat(data.value))) return 'Value must be a valid number'
    return null
  }

  const handleAddParam = () => {
    const error = validateParamForm(paramFormData)
    if (error) { setParamFormError(error); return }
    setParameters([...parameters, { name: paramFormData.name, signalType: paramFormData.signalType, value: parseFloat(paramFormData.value) }])
    resetParamForm()
  }

  const handleUpdateParam = () => {
    if (editingParamIndex === null) return
    const error = validateParamForm(paramFormData, editingParamIndex)
    if (error) { setParamFormError(error); return }
    const updatedParams = [...parameters]
    updatedParams[editingParamIndex] = { name: paramFormData.name, signalType: paramFormData.signalType, value: parseFloat(paramFormData.value) }
    setParameters(updatedParams)
    resetParamForm()
  }

  const handleDeleteParam = (index: number) => {
    if (window.confirm(`Delete parameter "${parameters[index].name}"?`)) {
      setParameters(parameters.filter((_, i) => i !== index))
    }
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Subsystem: ${block.name}`}
      size="xl"
      centered
    >
      <Stack gap="md">
        <TextInput
          label="Subsystem Name"
          value={blockName}
          onChange={(e) => setBlockName(e.target.value)}
          placeholder="Enter subsystem name"
        />

        {/* Sheets Section */}
        <div>
          <Text size="sm" fw={500} mb="xs">Sheets</Text>
          {sheets.length > 0 && (
            <Table withTableBorder withColumnBorders mb="xs">
              <Table.Tbody>
                {sheets.map((sheet) => (
                  <Table.Tr key={sheet.id}>
                    <Table.Td>
                      {editingSheetId === sheet.id ? (
                        <TextInput
                          value={editingSheetName}
                          onChange={(e) => setEditingSheetName(e.target.value)}
                          onBlur={saveSheetName}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveSheetName()
                            if (e.key === 'Escape') { setEditingSheetId(null); setEditingSheetName('') }
                          }}
                          size="xs"
                          autoFocus
                        />
                      ) : (
                        <Text size="sm">{sheet.name}</Text>
                      )}
                    </Table.Td>
                    <Table.Td style={{ width: 100, textAlign: 'right' }}>
                      <Group gap={4} justify="flex-end">
                        <ActionIcon variant="subtle" size="sm" onClick={() => startEditingSheet(sheet)} title="Rename">
                          <IconPencil size={14} />
                        </ActionIcon>
                        <ActionIcon variant="subtle" size="sm" color="red" onClick={() => deleteSheet(sheet.id)} disabled={sheets.length <= 1} title="Delete">
                          <IconTrash size={14} />
                        </ActionIcon>
                        <ActionIcon variant="subtle" size="sm" color="blue" onClick={() => navigateToSheet(sheet.id)} title="Navigate">
                          <IconExternalLink size={14} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
          <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={addSubsystemSheet} fullWidth>
            Add Sheet
          </Button>
        </div>

        {/* Input Ports */}
        <div>
          <Text size="sm" fw={500} mb="xs">Input Ports</Text>
          <Stack gap="xs">
            {inputPorts.map((port: string, index: number) => (
              <Group key={index} gap="xs">
                <TextInput
                  value={port}
                  onChange={(e) => updateInputPort(index, e.target.value)}
                  placeholder={`Input ${index + 1}`}
                  size="xs"
                  style={{ flex: 1 }}
                />
                <ActionIcon variant="subtle" color="red" size="sm" onClick={() => removeInputPort(index)} disabled={inputPorts.length <= 1}>
                  <IconX size={14} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
          <Button variant="subtle" size="xs" leftSection={<IconPlus size={14} />} onClick={addInputPort} mt="xs">
            Add Input Port
          </Button>
        </div>

        {/* Output Ports */}
        <div>
          <Text size="sm" fw={500} mb="xs">Output Ports</Text>
          <Stack gap="xs">
            {outputPorts.map((port: string, index: number) => (
              <Group key={index} gap="xs">
                <TextInput
                  value={port}
                  onChange={(e) => updateOutputPort(index, e.target.value)}
                  placeholder={`Output ${index + 1}`}
                  size="xs"
                  style={{ flex: 1 }}
                />
                <ActionIcon variant="subtle" color="red" size="sm" onClick={() => removeOutputPort(index)} disabled={outputPorts.length <= 1}>
                  <IconX size={14} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
          <Button variant="subtle" size="xs" leftSection={<IconPlus size={14} />} onClick={addOutputPort} mt="xs">
            Add Output Port
          </Button>
        </div>

        <Divider />

        <Checkbox
          label="Show Enable Input"
          description="Adds a boolean input port that controls whether the subsystem is active"
          checked={showEnableInput}
          onChange={(e) => setShowEnableInput(e.currentTarget.checked)}
        />

        <Checkbox
          label="Show Port Names"
          description="Displays the names of connected Input/Output Port blocks next to each port"
          checked={showPortNames}
          onChange={(e) => setShowPortNames(e.currentTarget.checked)}
        />

        <Select
          label="Code Generation Strategy"
          value={codeGenStrategy}
          onChange={(val) => setCodeGenStrategy((val || 'flatten') as CodeGenStrategy)}
          data={CODE_GEN_STRATEGY_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
          description={CODE_GEN_STRATEGY_OPTIONS.find(o => o.value === codeGenStrategy)?.description}
        />

        {/* Subsystem Parameters */}
        {(codeGenStrategy === 'segregated' || codeGenStrategy === 'segregated_atomic') && (
          <>
            <Divider />
            <div>
              <Group justify="space-between" mb="xs" style={{ cursor: 'pointer' }} onClick={() => setShowParameters(!showParameters)}>
                <Text size="sm" fw={500}>Subsystem Parameters</Text>
                <IconChevronDown size={16} style={{ transform: showParameters ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </Group>
              <Text size="xs" c="dimmed" mb="xs">Parameters scoped to this subsystem, generated as #define statements.</Text>

              <Collapse in={showParameters}>
                <Stack gap="xs">
                  {(parameters.length > 0 || addingParam) && (
                    <Table withTableBorder withColumnBorders>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Name</Table.Th>
                          <Table.Th>Type</Table.Th>
                          <Table.Th>Value</Table.Th>
                          <Table.Th style={{ width: 80 }}>Actions</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {parameters.map((param, index) => (
                          editingParamIndex === index ? (
                            <Table.Tr key={index}>
                              <Table.Td><TextInput size="xs" value={paramFormData.name} onChange={(e) => setParamFormData({ ...paramFormData, name: e.target.value })} /></Table.Td>
                              <Table.Td><Select size="xs" value={paramFormData.signalType} onChange={(val) => setParamFormData({ ...paramFormData, signalType: val || 'double' })} data={SIGNAL_TYPES} /></Table.Td>
                              <Table.Td><TextInput size="xs" value={paramFormData.value} onChange={(e) => setParamFormData({ ...paramFormData, value: e.target.value })} /></Table.Td>
                              <Table.Td>
                                <Group gap={4}>
                                  <ActionIcon variant="subtle" color="green" size="sm" onClick={handleUpdateParam}><IconCheck size={14} /></ActionIcon>
                                  <ActionIcon variant="subtle" size="sm" onClick={resetParamForm}><IconX size={14} /></ActionIcon>
                                </Group>
                              </Table.Td>
                            </Table.Tr>
                          ) : (
                            <Table.Tr key={index}>
                              <Table.Td><Text size="xs" ff="monospace">{param.name}</Text></Table.Td>
                              <Table.Td><Text size="xs">{param.signalType}</Text></Table.Td>
                              <Table.Td><Text size="xs" ff="monospace">{param.value}</Text></Table.Td>
                              <Table.Td>
                                <Group gap={4}>
                                  <ActionIcon variant="subtle" size="sm" onClick={() => startEditingParam(index)}><IconPencil size={14} /></ActionIcon>
                                  <ActionIcon variant="subtle" color="red" size="sm" onClick={() => handleDeleteParam(index)}><IconTrash size={14} /></ActionIcon>
                                </Group>
                              </Table.Td>
                            </Table.Tr>
                          )
                        ))}
                        {addingParam && (
                          <Table.Tr>
                            <Table.Td><TextInput size="xs" value={paramFormData.name} onChange={(e) => setParamFormData({ ...paramFormData, name: e.target.value })} placeholder="MY_PARAM" autoFocus /></Table.Td>
                            <Table.Td><Select size="xs" value={paramFormData.signalType} onChange={(val) => setParamFormData({ ...paramFormData, signalType: val || 'double' })} data={SIGNAL_TYPES} /></Table.Td>
                            <Table.Td><TextInput size="xs" value={paramFormData.value} onChange={(e) => setParamFormData({ ...paramFormData, value: e.target.value })} placeholder="0" /></Table.Td>
                            <Table.Td>
                              <Group gap={4}>
                                <ActionIcon variant="subtle" color="green" size="sm" onClick={handleAddParam}><IconCheck size={14} /></ActionIcon>
                                <ActionIcon variant="subtle" size="sm" onClick={resetParamForm}><IconX size={14} /></ActionIcon>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        )}
                      </Table.Tbody>
                    </Table>
                  )}

                  {paramFormError && <Text size="sm" c="red">{paramFormError}</Text>}

                  {!addingParam && editingParamIndex === null && (
                    <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={() => setAddingParam(true)} fullWidth>
                      Add Parameter
                    </Button>
                  )}

                  {parameters.length === 0 && !addingParam && (
                    <Text size="sm" c="dimmed" ta="center">No parameters defined.</Text>
                  )}
                </Stack>
              </Collapse>
            </div>
          </>
        )}

        <Alert variant="light" color="gray" icon={<IconInfoCircle />} title="Subsystem Block">
          Contains a nested diagram with its own blocks and connections.
          Input/output ports define the interface between the subsystem and its parent model.
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

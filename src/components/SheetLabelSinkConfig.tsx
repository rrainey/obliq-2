// components/SheetLabelSinkConfig.tsx
'use client'

import { useState, useEffect } from 'react'
import { Modal, Autocomplete, Button, Stack, Group, Alert } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'
import { collectAvailableSignalNames } from '@/lib/sheetLabelUtils'

interface SheetLabelSinkConfigProps {
  block: BlockData
  blocks: BlockData[]  // Current sheet blocks
  allSheetsBlocks?: BlockData[]  // All blocks across all sheets in the subsystem
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function SheetLabelSinkConfig({
  block,
  blocks,
  allSheetsBlocks,
  onUpdate,
  onClose
}: SheetLabelSinkConfigProps) {
  const [signalName, setSignalName] = useState(block.parameters?.signalName || '')
  const [nameError, setNameError] = useState<string>('')

  // Use all sheets blocks if provided, otherwise fall back to current sheet
  const blocksToSearch = allSheetsBlocks || blocks

  // Get existing signal names (excluding current block's signal)
  const existingSignalNames = collectAvailableSignalNames(
    blocksToSearch.filter((b: BlockData) => b.id !== block.id),
    []
  )

  // Validate signal name
  useEffect(() => {
    if (!signalName.trim()) {
      setNameError('Signal name is required')
    } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(signalName)) {
      setNameError('Must be a valid C identifier (letters, numbers, underscore)')
    } else {
      setNameError('')
    }
  }, [signalName])

  const handleSave = () => {
    if (nameError) return

    const parameters = {
      ...block.parameters,
      signalName: signalName.trim()
    }
    onUpdate(parameters)
    onClose()
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Sheet Label Sink: ${block.name}`}
      size="md"
      centered
    >
      <Stack gap="md">
        <Autocomplete
          label="Signal Name"
          value={signalName}
          onChange={setSignalName}
          data={existingSignalNames}
          error={nameError}
          placeholder="Enter signal name (e.g., motor_speed)"
          description="This name identifies the signal across sheets in the current subsystem"
          autoFocus
        />

        <Alert variant="light" color="grape" icon={<IconInfoCircle />} title="Sheet Label Sink">
          Captures a signal and makes it available to Sheet Label Source blocks
          with the same signal name within the current subsystem scope.
        </Alert>

        <Alert variant="light" color="blue" icon={<IconInfoCircle />} title="Note">
          Signal names must be unique within each subsystem.
          The same signal name can be used in different subsystems without conflict.
        </Alert>

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!!nameError || !signalName.trim()}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

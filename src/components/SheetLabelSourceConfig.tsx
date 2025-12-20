// components/SheetLabelSourceConfig.tsx
'use client'

import { useState } from 'react'
import { Modal, Select, Button, Stack, Group, Alert } from '@mantine/core'
import { IconInfoCircle, IconAlertTriangle, IconCheck } from '@tabler/icons-react'
import { BlockData } from './BlockNode'
import { getSheetLabelSinkInfo } from '@/lib/sheetLabelUtils'

interface SheetLabelSourceConfigProps {
  block: BlockData
  blocks: BlockData[]  // Current sheet blocks
  allSheetsBlocks?: BlockData[]  // All blocks across all sheets in the subsystem
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function SheetLabelSourceConfig({
  block,
  blocks,
  allSheetsBlocks,
  onUpdate,
  onClose
}: SheetLabelSourceConfigProps) {
  const [selectedSignalName, setSelectedSignalName] = useState<string | null>(
    block.parameters?.signalName || null
  )

  // Use all sheets blocks if provided, otherwise fall back to current sheet
  const blocksToSearch = allSheetsBlocks || blocks

  // Get all available sink signal names across all sheets
  const availableSinks = getSheetLabelSinkInfo(blocksToSearch)

  const handleSave = () => {
    const parameters = {
      ...block.parameters,
      signalName: selectedSignalName
    }
    onUpdate(parameters)
    onClose()
  }

  // Build select options
  const selectData = availableSinks.map(sink => ({
    value: sink.signalName,
    label: `${sink.signalName} (from ${sink.blockName})`
  }))

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Sheet Label Source: ${block.name}`}
      size="md"
      centered
    >
      <Stack gap="md">
        {availableSinks.length === 0 ? (
          <Alert variant="light" color="yellow" icon={<IconAlertTriangle />} title="No Signals Available">
            No Sheet Label Sinks found in this subsystem.
            Create a Sheet Label Sink first to capture a signal.
          </Alert>
        ) : (
          <Select
            label="Signal Source"
            value={selectedSignalName}
            onChange={setSelectedSignalName}
            data={selectData}
            placeholder="Select a signal..."
            description="Select which signal this source should output"
            searchable
            clearable
          />
        )}

        <Alert variant="light" color="grape" icon={<IconInfoCircle />} title="Sheet Label Source">
          Outputs the signal value from a Sheet Label Sink with the matching signal name.
          The signal type is inherited from the sink&apos;s input.
        </Alert>

        {selectedSignalName && (
          <Alert variant="light" color="green" icon={<IconCheck />} title="Connected">
            This source will output the signal from &quot;{availableSinks.find(s => s.signalName === selectedSignalName)?.blockName}&quot;
          </Alert>
        )}

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={availableSinks.length === 0}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

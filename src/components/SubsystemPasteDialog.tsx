'use client'

/**
 * Shown when pasting clipboard content that includes subsystem block(s).
 * Lets the user choose a full deep copy vs a reference to the source definition.
 */

import { Modal, Stack, Text, Button, Group, Radio } from '@mantine/core'
import { useState } from 'react'

export type SubsystemPasteChoice = 'copy' | 'reference'

interface SubsystemPasteDialogProps {
  opened: boolean
  subsystemNames: string[]
  onConfirm: (mode: SubsystemPasteChoice) => void
  onCancel: () => void
}

export default function SubsystemPasteDialog({
  opened,
  subsystemNames,
  onConfirm,
  onCancel
}: SubsystemPasteDialogProps) {
  const [mode, setMode] = useState<SubsystemPasteChoice>('copy')
  const label =
    subsystemNames.length === 1
      ? `Subsystem "${subsystemNames[0]}"`
      : `${subsystemNames.length} subsystems`

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title="Paste subsystem"
      centered
    >
      <Stack gap="md">
        <Text size="sm">
          {label} on the clipboard. Paste a full independent copy, or a
          reference that shares the original body (instance parameters only).
        </Text>
        <Radio.Group
          value={mode}
          onChange={(v) => setMode((v as SubsystemPasteChoice) || 'copy')}
        >
          <Stack gap="xs">
            <Radio
              value="copy"
              label="Paste full copy"
              description="Deep-clone sheets and parameters (current behavior)"
            />
            <Radio
              value="reference"
              label="Paste as reference"
              description="Shared body; editable instance parameter values. Source becomes segregated atomic if it was flattened."
            />
          </Stack>
        </Radio.Group>
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(mode)}>Paste</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

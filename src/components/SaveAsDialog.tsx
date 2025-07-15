// components/SaveAsDialog.tsx
'use client'

import { useState } from 'react'
import { Modal, TextInput, Group, Button, Stack } from '@mantine/core'

interface SaveAsDialogProps {
  currentName: string
  onSave: (newName: string) => void
  onClose: () => void
}

export default function SaveAsDialog({ currentName, onSave, onClose }: SaveAsDialogProps) {
  const [newName, setNewName] = useState(currentName)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!newName.trim()) return
    
    setSaving(true)
    await onSave(newName.trim())
    setSaving(false)
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title="Save Model As"
      centered
      size="sm"
    >
      <Stack>
        <TextInput
          label="New Model Name"
          value={newName}
          onChange={(e) => setNewName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newName.trim()) {
              handleSave()
            }
          }}
          placeholder="Enter new model name"
          data-autofocus
          required
        />
        
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            loading={saving}
            disabled={!newName.trim() || newName.trim() === currentName}
          >
            Save As
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
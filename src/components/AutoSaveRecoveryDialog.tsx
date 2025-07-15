// components/AutoSaveRecoveryDialog.tsx
'use client'

import { useState } from 'react'
import { Modal, Text, Group, Button, Stack, Paper, Alert } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'

interface AutoSaveRecoveryDialogProps {
  modelName: string
  autoSaveDate: string
  lastSavedVersion: number
  lastSavedDate: string
  onRecover: () => void
  onDiscard: () => void
}

export default function AutoSaveRecoveryDialog({
  modelName,
  autoSaveDate,
  lastSavedVersion,
  lastSavedDate,
  onRecover,
  onDiscard
}: AutoSaveRecoveryDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false)

  const handleRecover = async () => {
    setIsProcessing(true)
    await onRecover()
  }

  const handleDiscard = async () => {
    setIsProcessing(true)
    await onDiscard()
  }

  // Format dates for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  return (
    <Modal
      opened={true}
      onClose={() => {}} // Prevent closing by clicking outside
      title={
        <Group gap="xs">
          <IconAlertTriangle size={24} color="var(--mantine-color-yellow-6)" />
          <Text fw={600}>Auto-saved Version Found</Text>
        </Group>
      }
      centered
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
      size="md"
    >
      <Stack>
        <Text size="sm">
          An auto-saved version of <Text span fw={600}>"{modelName}"</Text> was found. 
          This may contain unsaved changes from a previous session.
        </Text>

        <Paper p="md" bg="gray.0" withBorder>
          <Stack gap="sm">
            <div>
              <Text size="sm" fw={600} c="gray.7">Auto-saved version:</Text>
              <Text size="sm">{formatDate(autoSaveDate)}</Text>
            </div>
            
            <div>
              <Text size="sm" fw={600} c="gray.7">Last saved version:</Text>
              <Text size="sm">
                Version {lastSavedVersion} - {formatDate(lastSavedDate)}
              </Text>
            </div>
          </Stack>
        </Paper>

        <Alert variant="light" color="blue" p="sm">
          <Text size="xs" fw={500} mb="xs">Choose which version to open:</Text>
          <Stack gap={4}>
            <Text size="xs">
              <Text span fw={600}>• Recover auto-save:</Text> Open the auto-saved version with your unsaved changes
            </Text>
            <Text size="xs">
              <Text span fw={600}>• Open saved version:</Text> Discard the auto-save and open the last saved version
            </Text>
          </Stack>
        </Alert>

        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={handleDiscard}
            disabled={isProcessing}
          >
            Open Saved Version
          </Button>
          
          <Button
            onClick={handleRecover}
            loading={isProcessing}
          >
            Recover Auto-save
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
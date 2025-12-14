// components/ModelValidationModal.tsx

'use client'

import { useState } from 'react'
import { TypeCompatibilityError, formatTypeError } from '@/lib/typeCompatibilityValidator'
import { BlockData } from './BlockNode'
import {
  Modal,
  Tabs,
  Stack,
  Group,
  Text,
  Paper,
  Button,
  Center,
  Badge,
  ActionIcon,
  ScrollArea,
  Box
} from '@mantine/core'
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCircleCheck,
  IconX,
  IconChevronRight,
  IconCopy,
  IconCheck
} from '@tabler/icons-react'

interface ModelValidationModalProps {
  isOpen: boolean
  onClose: () => void
  errors: TypeCompatibilityError[]
  warnings: TypeCompatibilityError[]
  blocks: BlockData[]
  onSelectBlock?: (blockId: string) => void
  onSelectWire?: (wireId: string) => void
}

export default function ModelValidationModal({
  isOpen,
  onClose,
  errors,
  warnings,
  blocks,
  onSelectBlock,
  onSelectWire
}: ModelValidationModalProps) {
  const [selectedTab, setSelectedTab] = useState<string | null>('errors')
  const [copied, setCopied] = useState(false)
  
  // Create a map of block IDs to names for better display
  const blockNameMap = new Map(blocks.map(b => [b.id, b.name]))
  
  if (!isOpen) return null

  const handleItemClick = (item: TypeCompatibilityError) => {
    // Close the modal
    onClose()
    
    // Navigate to the error location
    if (item.wireId && onSelectWire) {
      onSelectWire(item.wireId)
    } else if (item.blockId && onSelectBlock) {
      onSelectBlock(item.blockId)
    }
  }

  const getLocationDescription = (item: TypeCompatibilityError): string => {
    if (item.sourceBlockId && item.targetBlockId) {
      const sourceName = blockNameMap.get(item.sourceBlockId) || 'Unknown'
      const targetName = blockNameMap.get(item.targetBlockId) || 'Unknown'
      return `${sourceName} → ${targetName}`
    } else if (item.blockId) {
      return blockNameMap.get(item.blockId) || 'Unknown Block'
    }
    return 'Model'
  }

  const renderValidationItem = (item: TypeCompatibilityError, index: number) => {
    const location = getLocationDescription(item)
    const formattedError = formatTypeError(item)
    
    return (
      <Paper
        key={`${item.wireId || item.blockId || index}`}
        p="sm"
        withBorder
        style={{ cursor: 'pointer' }}
        onClick={() => handleItemClick(item)}
        className="hover:bg-gray-50 transition-colors"
      >
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Box style={{ flex: 1 }}>
            <Group gap="xs" mb={4}>
              <Badge
                size="sm"
                radius="xl"
                color={item.severity === 'error' ? 'red' : 'yellow'}
                variant="filled"
              >
                {item.severity === 'error' ? '!' : '?'}
              </Badge>
              <Text fw={500} size="sm">{location}</Text>
            </Group>
            <Text size="sm" c="dimmed">{formattedError}</Text>
          </Box>
          <ActionIcon 
            variant="subtle" 
            color="gray"
            size="sm"
          >
            <IconChevronRight size={16} />
          </ActionIcon>
        </Group>
      </Paper>
    )
  }

  const hasErrors = errors.length > 0
  const hasWarnings = warnings.length > 0

  const formatItemForCopy = (item: TypeCompatibilityError): string => {
    const location = getLocationDescription(item)
    const formattedError = formatTypeError(item)
    const severity = item.severity === 'error' ? 'ERROR' : 'WARNING'

    let text = `[${severity}] ${location}: ${formattedError}`

    // Add context details if available
    if (item.details) {
      const details: string[] = []
      if (item.details.expectedType) details.push(`Expected: ${item.details.expectedType}`)
      if (item.details.actualType) details.push(`Actual: ${item.details.actualType}`)
      if (item.details.sourceType) details.push(`Source Type: ${item.details.sourceType}`)
      if (item.details.targetType) details.push(`Target Type: ${item.details.targetType}`)
      if (details.length > 0) {
        text += `\n    ${details.join(', ')}`
      }
    }

    return text
  }

  const handleCopyAll = async () => {
    const allItems = [...errors, ...warnings]
    const text = allItems.map(formatItemForCopy).join('\n\n')

    const header = `Model Validation Results\n${'='.repeat(25)}\nErrors: ${errors.length}, Warnings: ${warnings.length}\n\n`

    await navigator.clipboard.writeText(header + text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title="Model Validation Results"
      size="lg"
      centered
      closeButtonProps={{
        icon: <IconX size={16} />
      }}
    >
      <Stack>
        {/* Summary */}
        <Group justify="space-between">
          <Group gap="md">
            {hasErrors ? (
              <Group gap={4}>
                <IconAlertCircle size={20} color="var(--mantine-color-red-6)" />
                <Text c="red" fw={500}>
                  {errors.length} {errors.length === 1 ? 'Error' : 'Errors'}
                </Text>
              </Group>
            ) : (
              <Group gap={4}>
                <IconCircleCheck size={20} color="var(--mantine-color-green-6)" />
                <Text c="green" fw={500}>No Errors</Text>
              </Group>
            )}
            {hasWarnings && (
              <Group gap={4}>
                <IconAlertTriangle size={20} color="var(--mantine-color-yellow-6)" />
                <Text c="yellow.7" fw={500}>
                  {warnings.length} {warnings.length === 1 ? 'Warning' : 'Warnings'}
                </Text>
              </Group>
            )}
          </Group>
          {(hasErrors || hasWarnings) && (
            <ActionIcon
              variant="subtle"
              color={copied ? 'green' : 'gray'}
              onClick={handleCopyAll}
              title="Copy all errors and warnings to clipboard"
            >
              {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
            </ActionIcon>
          )}
        </Group>

        {/* Content */}
        {!hasErrors && !hasWarnings ? (
          <Center py="xl">
            <Stack align="center">
              <IconCircleCheck size={64} color="var(--mantine-color-green-6)" />
              <Text size="lg" fw={500}>Model is Valid</Text>
              <Text c="dimmed" ta="center">
                All connections have compatible types and the model is ready for simulation.
              </Text>
            </Stack>
          </Center>
        ) : (
          <>
            {/* Tabs */}
            {(hasErrors || hasWarnings) && (
              <Tabs value={selectedTab} onChange={setSelectedTab}>
                <Tabs.List>
                  <Tabs.Tab
                    value="errors"
                    disabled={!hasErrors}
                    leftSection={<IconAlertCircle size={16} />}
                    color="red"
                  >
                    Errors ({errors.length})
                  </Tabs.Tab>
                  <Tabs.Tab
                    value="warnings"
                    disabled={!hasWarnings}
                    leftSection={<IconAlertTriangle size={16} />}
                    color="yellow"
                  >
                    Warnings ({warnings.length})
                  </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="errors" pt="md">
                  <ScrollArea h={400}>
                    <Stack gap="sm">
                      {errors.length === 0 ? (
                        <Text c="dimmed" ta="center" py="xl">
                          No errors found
                        </Text>
                      ) : (
                        errors.map((item, index) => renderValidationItem(item, index))
                      )}
                    </Stack>
                  </ScrollArea>
                </Tabs.Panel>

                <Tabs.Panel value="warnings" pt="md">
                  <ScrollArea h={400}>
                    <Stack gap="sm">
                      {warnings.length === 0 ? (
                        <Text c="dimmed" ta="center" py="xl">
                          No warnings found
                        </Text>
                      ) : (
                        warnings.map((item, index) => renderValidationItem(item, index))
                      )}
                    </Stack>
                  </ScrollArea>
                </Tabs.Panel>
              </Tabs>
            )}
          </>
        )}

        {/* Footer */}
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Click on an item to navigate to its location
          </Text>
          <Button onClick={onClose}>
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
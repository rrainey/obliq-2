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
  IconChevronRight
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
  const activeItems = selectedTab === 'errors' ? errors : warnings

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
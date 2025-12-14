/**
 * WASM Error Display Component
 *
 * Enhanced error display for WASM compilation errors with:
 * - Parsed error messages
 * - Actionable suggestions
 * - Expandable technical details
 * - Severity indicators
 */

'use client'

import { useState } from 'react'
import { Alert, Stack, Text, List, Button, Code, Badge, Group, Modal, ActionIcon, ScrollArea } from '@mantine/core'
import { IconAlertTriangle, IconAlertCircle, IconBug, IconCopy, IconCheck, IconX } from '@tabler/icons-react'
import { parseWasmError, type ParsedWasmError } from '@/lib/wasm/WasmErrorParser'

interface WasmErrorDisplayProps {
  error: string
  details?: string
  onDismiss?: () => void
}

export default function WasmErrorDisplay({ error, details, onDismiss }: WasmErrorDisplayProps) {
  const [detailsModalOpen, setDetailsModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  // Parse the error
  const parsedError: ParsedWasmError = parseWasmError(error, details)

  const handleCopyAll = async () => {
    const parts: string[] = [
      `WASM Compilation Error`,
      `${'='.repeat(25)}`,
      `Category: ${parsedError.category}`,
      `Severity: ${parsedError.severity}`,
      ``,
      `Title: ${parsedError.title}`,
      `Message: ${parsedError.message}`,
    ]

    if (parsedError.blockName) {
      parts.push(`Affected Block: ${parsedError.blockName}`)
    }

    if (parsedError.suggestions.length > 0) {
      parts.push(``, `Suggestions:`)
      parsedError.suggestions.forEach((s, i) => parts.push(`  ${i + 1}. ${s}`))
    }

    if (parsedError.rawError) {
      parts.push(``, `Technical Details:`, parsedError.rawError)
    }

    if (parsedError.lineNumber) {
      parts.push(``, `Error at line ${parsedError.lineNumber} in generated C code`)
    }

    await navigator.clipboard.writeText(parts.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const severityColor = parsedError.severity === 'error' ? 'red' : 'orange'
  const severityIcon = parsedError.severity === 'error' ? <IconAlertCircle size={20} /> : <IconAlertTriangle size={20} />

  return (
    <Alert
      color={severityColor}
      variant="light"
      title={
        <Group gap="xs">
          <Text fw={600}>{parsedError.title}</Text>
          <Badge size="xs" color={severityColor} variant="dot">
            {parsedError.category}
          </Badge>
        </Group>
      }
      icon={severityIcon}
      withCloseButton={!!onDismiss}
      onClose={onDismiss}
    >
      <Stack gap="md">
        {/* Main error message */}
        <Text size="sm">{parsedError.message}</Text>

        {/* Block name if available */}
        {parsedError.blockName && (
          <Text size="sm" c="dimmed">
            Affected block: <Text span fw={600}>{parsedError.blockName}</Text>
          </Text>
        )}

        {/* Suggestions */}
        {parsedError.suggestions.length > 0 && (
          <div>
            <Text size="sm" fw={600} mb="xs">
              {parsedError.isUserFixable ? 'How to fix:' : 'What to try:'}
            </Text>
            <List size="sm" spacing="xs">
              {parsedError.suggestions.map((suggestion, index) => (
                <List.Item key={index}>
                  <Text size="sm">{suggestion}</Text>
                </List.Item>
              ))}
            </List>
          </div>
        )}

        {/* Show Details button */}
        {parsedError.rawError && (
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconBug size={14} />}
            onClick={() => setDetailsModalOpen(true)}
          >
            Show Details
          </Button>
        )}
      </Stack>

      {/* Details Modal */}
      <Modal
        opened={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        title={
          <Group gap="xs">
            <IconBug size={20} />
            <Text fw={600}>WASM Error Details</Text>
            <Badge size="xs" color={severityColor} variant="dot">
              {parsedError.category}
            </Badge>
          </Group>
        }
        size="lg"
        centered
        closeButtonProps={{
          icon: <IconX size={16} />
        }}
      >
        <Stack gap="md">
          {/* Header with copy button */}
          <Group justify="space-between">
            <Text fw={500}>{parsedError.title}</Text>
            <ActionIcon
              variant="subtle"
              color={copied ? 'green' : 'gray'}
              onClick={handleCopyAll}
              title="Copy error details to clipboard"
            >
              {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
            </ActionIcon>
          </Group>

          {/* Error message */}
          <Text size="sm">{parsedError.message}</Text>

          {/* Block name if available */}
          {parsedError.blockName && (
            <Text size="sm" c="dimmed">
              Affected block: <Text span fw={600}>{parsedError.blockName}</Text>
            </Text>
          )}

          {/* Suggestions */}
          {parsedError.suggestions.length > 0 && (
            <div>
              <Text size="sm" fw={600} mb="xs">
                {parsedError.isUserFixable ? 'How to fix:' : 'What to try:'}
              </Text>
              <List size="sm" spacing="xs">
                {parsedError.suggestions.map((suggestion, index) => (
                  <List.Item key={index}>
                    <Text size="sm">{suggestion}</Text>
                  </List.Item>
                ))}
              </List>
            </div>
          )}

          {/* Technical details */}
          {parsedError.rawError && (
            <div>
              <Text size="sm" fw={600} mb="xs">Technical Details:</Text>
              <ScrollArea h={300}>
                <Code block style={{ fontSize: '11px' }}>
                  {parsedError.rawError}
                </Code>
              </ScrollArea>
              {parsedError.lineNumber && (
                <Text size="xs" c="dimmed" mt="xs">
                  Error at line {parsedError.lineNumber} in generated C code
                </Text>
              )}
            </div>
          )}
        </Stack>
      </Modal>
    </Alert>
  )
}

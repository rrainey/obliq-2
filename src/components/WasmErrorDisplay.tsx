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
import { Alert, Stack, Text, List, Button, Collapse, Code, Badge, Group } from '@mantine/core'
import { IconAlertTriangle, IconAlertCircle, IconChevronDown, IconChevronUp, IconBug } from '@tabler/icons-react'
import { parseWasmError, getErrorSummary, shouldShowDetails, type ParsedWasmError } from '@/lib/wasm/WasmErrorParser'

interface WasmErrorDisplayProps {
  error: string
  details?: string
  onDismiss?: () => void
}

export default function WasmErrorDisplay({ error, details, onDismiss }: WasmErrorDisplayProps) {
  const [showDetails, setShowDetails] = useState(false)

  // Parse the error
  const parsedError: ParsedWasmError = parseWasmError(error, details)

  // Auto-show details for non-user-fixable errors
  const autoShowDetails = shouldShowDetails(parsedError)

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

        {/* Technical details (expandable) */}
        {parsedError.rawError && (
          <div>
            <Button
              variant="subtle"
              size="xs"
              leftSection={showDetails || autoShowDetails ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              rightSection={<IconBug size={14} />}
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails || autoShowDetails ? 'Hide' : 'Show'} Technical Details
            </Button>

            <Collapse in={showDetails || autoShowDetails} mt="xs">
              <Code block style={{ maxHeight: '200px', overflow: 'auto', fontSize: '11px' }}>
                {parsedError.rawError}
              </Code>
              {parsedError.lineNumber && (
                <Text size="xs" c="dimmed" mt="xs">
                  Error at line {parsedError.lineNumber} in generated C code
                </Text>
              )}
            </Collapse>
          </div>
        )}

        {/* Fallback notice */}
        {parsedError.severity === 'error' && (
          <Text size="xs" c="dimmed" fs="italic">
            The simulation will automatically fall back to the JavaScript engine.
          </Text>
        )}
      </Stack>
    </Alert>
  )
}

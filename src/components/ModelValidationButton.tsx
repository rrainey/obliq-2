// components/ModelValidationButton.tsx

'use client'

import { useState } from 'react'
import { useWireValidation } from '@/hooks/useWireValidation'
import ModelValidationModal from './ModelValidationModal'
import { BlockData } from './BlockNode'
import { WireData } from './Wire'
import { TypeCompatibilityError } from '@/lib/typeCompatibilityValidator'
import { Button, Badge, Group, Text, Indicator } from '@mantine/core'
import { IconCircleCheck, IconAlertCircle, IconAlertTriangle, IconRefresh } from '@tabler/icons-react'

interface ModelValidationButtonProps {
  blocks: BlockData[]
  wires: WireData[]
  onNavigate?: (item: TypeCompatibilityError) => void
  className?: string
}

export default function ModelValidationButton({
  blocks,
  wires,
  onNavigate,
  className = ''
}: ModelValidationButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { allErrors, allWarnings, isValidating, revalidate } = useWireValidation(blocks, wires)
  
  const hasErrors = allErrors.length > 0
  const hasWarnings = allWarnings.length > 0
  const hasIssues = hasErrors || hasWarnings
  
  const handleClick = () => {
    // Revalidate to ensure latest state
    revalidate()
    setIsModalOpen(true)
  }
  
  const getButtonColor = () => {
    if (hasErrors) return 'red'
    if (hasWarnings) return 'yellow'
    return 'green'
  }
  
  const getIcon = () => {
    if (isValidating) return <IconRefresh size={16} className="animate-spin" />
    if (hasErrors) return <IconAlertCircle size={16} />
    if (hasWarnings) return <IconAlertTriangle size={16} />
    return <IconCircleCheck size={16} />
  }

  const totalIssues = allErrors.length + allWarnings.length

  return (
    <>
      <Indicator
        inline
        label={totalIssues}
        size={16}
        offset={7}
        position="top-end"
        color={hasErrors ? 'red' : 'yellow'}
        disabled={!hasIssues || isValidating}
      >
        <Button
          onClick={handleClick}
          loading={isValidating}
          leftSection={getIcon()}
          color={getButtonColor()}
          variant="filled"
          data-testid="validation-button"
          title="Validate model for type compatibility issues"
        >
          Validate Model
        </Button>
      </Indicator>
      
      {/* Inline indicator for toolbar */}
      {hasIssues && (
        <Group gap="sm" ml="sm">
          {hasErrors && (
            <Badge 
              leftSection={<IconAlertCircle size={14} />}
              color="red" 
              variant="filled"
            >
              {allErrors.length} {allErrors.length === 1 ? 'Error' : 'Errors'}
            </Badge>
          )}
          {hasWarnings && (
            <Badge 
              leftSection={<IconAlertTriangle size={14} />}
              color="yellow" 
              variant="filled"
            >
              {allWarnings.length}
            </Badge>
          )}
        </Group>
      )}
      
      {/* Validation Modal */}
      <ModelValidationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        errors={allErrors}
        warnings={allWarnings}
        blocks={blocks}
        onNavigate={onNavigate}
      />
    </>
  )
}

// Compact version for toolbar integration
export function ValidationStatusIndicator({
  blocks,
  wires,
  onClick
}: {
  blocks: BlockData[]
  wires: WireData[]
  onClick?: () => void
}) {
  const { allErrors, allWarnings, isValidating } = useWireValidation(blocks, wires)
  
  const hasErrors = allErrors.length > 0
  const hasWarnings = allWarnings.length > 0
  
  if (!hasErrors && !hasWarnings && !isValidating) {
    return (
      <Group 
        gap={4}
        onClick={onClick}
        style={{ cursor: 'pointer' }}
      >
        <IconCircleCheck size={16} color="var(--mantine-color-green-6)" />
        <Text size="sm" c="green">Valid</Text>
      </Group>
    )
  }
  
  return (
    <Group 
      gap="xs"
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      {isValidating && (
        <IconRefresh size={16} className="animate-spin" color="var(--mantine-color-gray-5)" />
      )}
      {hasErrors && (
        <Badge 
          leftSection={<IconAlertCircle size={14} />}
          color="red" 
          variant="light"
          size="sm"
        >
          {allErrors.length}
        </Badge>
      )}
      {hasWarnings && (
        <Badge 
          leftSection={<IconAlertTriangle size={14} />}
          color="yellow" 
          variant="light"
          size="sm"
        >
          {allWarnings.length}
        </Badge>
      )}
    </Group>
  )
}
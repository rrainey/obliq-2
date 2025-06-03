// hooks/useWireValidation.ts

import { useState, useEffect, useMemo } from 'react'
import { BlockData } from '@/components/Block'
import { WireData } from '@/components/Wire'
import { validateModelTypeCompatibility, TypeCompatibilityError } from '@/lib/typeCompatibilityValidator'
import { validateSheetLabels } from '@/lib/sheetLabelUtils'

interface UseWireValidationResult {
  typeErrors: Map<string, TypeCompatibilityError>
  allErrors: TypeCompatibilityError[]
  allWarnings: TypeCompatibilityError[]
  isValidating: boolean
  revalidate: () => void
}

export function useWireValidation(
  blocks: BlockData[],
  wires: WireData[]
): UseWireValidationResult {
  const [typeErrors, setTypeErrors] = useState<Map<string, TypeCompatibilityError>>(new Map())
  const [allErrors, setAllErrors] = useState<TypeCompatibilityError[]>([])
  const [allWarnings, setAllWarnings] = useState<TypeCompatibilityError[]>([])
  const [isValidating, setIsValidating] = useState(false)

  // Memoize the validation function
  const validate = useMemo(() => {
    return () => {
      setIsValidating(true)
      
      try {
        // Run type compatibility validation
        const result = validateModelTypeCompatibility(blocks, wires)
        
        // Run sheet label validation
        const sheetLabelIssues = validateSheetLabels(blocks)
        
        // Convert sheet label issues to TypeCompatibilityError format
        const sheetLabelErrors: TypeCompatibilityError[] = sheetLabelIssues.map(issue => ({
          type: issue.type === 'empty_signal_name' ? 'warning' : 'error',
          message: issue.message,
          location: issue.blockName,
          blockId: issue.blockId,
          severity: issue.type === 'empty_signal_name' ? 'warning' : 'error',
          details: issue.signalName ? {
            sourceBlock: issue.blockName,
            targetBlock: issue.blockName, // For consistency with existing interface
            expectedType: 'Signal Name',
            actualType: issue.type === 'duplicate_sink' ? 'Duplicate' : 'Missing'
          } : undefined
        }))
        
        // Create a map of wire IDs to errors for quick lookup
        const errorMap = new Map<string, TypeCompatibilityError>()
        
        for (const error of result.errors) {
          if (error.wireId) {
            errorMap.set(error.wireId, error)
          }
        }
        
        // Combine all errors and warnings
        const combinedErrors = [
          ...result.errors,
          ...sheetLabelErrors.filter(e => e.severity === 'error')
        ]
        
        const combinedWarnings = [
          ...result.warnings,
          ...sheetLabelErrors.filter(e => e.severity === 'warning')
        ]
        
        setTypeErrors(errorMap)
        setAllErrors(combinedErrors)
        setAllWarnings(combinedWarnings)
      } catch (error) {
        console.error('Error during validation:', error)
        setTypeErrors(new Map())
        setAllErrors([])
        setAllWarnings([])
      } finally {
        setIsValidating(false)
      }
    }
  }, [blocks, wires])

  // Run validation when blocks or wires change
  useEffect(() => {
    // Debounce validation to avoid excessive computation
    const timeoutId = setTimeout(() => {
      validate()
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [validate])

  return {
    typeErrors,
    allErrors,
    allWarnings,
    isValidating,
    revalidate: validate
  }
}

/**
 * Hook to validate a wire connection before it's created
 */
export function useWireConnectionValidation() {
  const [validationError, setValidationError] = useState<string | null>(null)

  const validateConnection = (
    sourceBlock: BlockData,
    sourcePortIndex: number,
    targetBlock: BlockData,
    targetPortIndex: number,
    existingWires: WireData[]
  ): boolean => {
    // Reset error
    setValidationError(null)

    // Check if target port already has a connection
    const existingConnection = existingWires.find(
      w => w.targetBlockId === targetBlock.id && w.targetPortIndex === targetPortIndex
    )
    
    if (existingConnection) {
      setValidationError(`Input port already connected`)
      return false
    }

    // Check structural validity
    if (targetBlock.type === 'source' || targetBlock.type === 'input_port') {
      setValidationError(`Cannot connect to ${targetBlock.type} blocks (no inputs)`)
      return false
    }

    if (sourceBlock.type === 'output_port' || 
        sourceBlock.type === 'signal_display' || 
        sourceBlock.type === 'signal_logger') {
      setValidationError(`Cannot connect from ${sourceBlock.type} blocks (no outputs)`)
      return false
    }

    // Add sheet label validation
    if (targetBlock.type === 'sheet_label_source') {
      setValidationError('Cannot connect to Sheet Label Source blocks (no inputs)')
      return false
    }

    if (sourceBlock.type === 'sheet_label_sink') {
      setValidationError('Cannot connect from Sheet Label Sink blocks (no outputs)')
      return false
    }

    // Check for self-connection
    if (sourceBlock.id === targetBlock.id) {
      setValidationError('Cannot connect a block to itself')
      return false
    }

    // Type validation will be done after the wire is created
    // since we need the full model context for type propagation
    
    return true
  }

  const clearError = () => setValidationError(null)

  return {
    validateConnection,
    validationError,
    clearError
  }
}
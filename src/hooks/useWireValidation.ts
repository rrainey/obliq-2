// hooks/useWireValidation.ts

import { useState, useEffect, useMemo } from 'react'
import { BlockData } from '@/components/BlockNode'
import { WireData } from '@/components/Wire'
import { TypeCompatibilityError, validateModelTypeCompatibilityMultiSheet } from '@/lib/typeCompatibilityValidator'
import { useModelStore } from '@/lib/modelStore'

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
  const sheets = useModelStore(state => state.sheets)

  // Memoize the validation function
const validate = useMemo(() => {
  return () => {
    setIsValidating(true)
    
    try {
      // Always use multi-sheet validation - it's a superset of single-sheet validation
      // and properly handles sheet label source/sink type propagation
      let combinedErrors: TypeCompatibilityError[] = []
      let combinedWarnings: TypeCompatibilityError[] = []

      if (sheets && sheets.length > 0) {
        // Multi-sheet validation handles all cases including single sheet
        const multiSheetResult = validateModelTypeCompatibilityMultiSheet(sheets)
        combinedErrors = multiSheetResult.errors
        combinedWarnings = multiSheetResult.warnings
      } else {
        // Fallback for when sheets aren't loaded yet - wrap current blocks/wires as single sheet
        const singleSheetAsMulti = [{ blocks, connections: wires }]
        const multiSheetResult = validateModelTypeCompatibilityMultiSheet(singleSheetAsMulti)
        combinedErrors = multiSheetResult.errors
        combinedWarnings = multiSheetResult.warnings
      }
      
      // Create a map of wire IDs to errors for quick lookup
      const errorMap = new Map<string, TypeCompatibilityError>()
      
      for (const error of combinedErrors) {
        if (error.wireId) {
          errorMap.set(error.wireId, error)
        }
      }
      
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
}, [blocks, wires, sheets])

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
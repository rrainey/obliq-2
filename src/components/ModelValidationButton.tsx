// components/ModelValidationButton.tsx

'use client'

import { useState } from 'react'
import { useWireValidation } from '@/hooks/useWireValidation'
import ModelValidationModal from './ModelValidationModal'
import { BlockData } from './BlockNode'
import { WireData } from './Wire'

interface ModelValidationButtonProps {
  blocks: BlockData[]
  wires: WireData[]
  onSelectBlock?: (blockId: string) => void
  onSelectWire?: (wireId: string) => void
  className?: string
}

export default function ModelValidationButton({
  blocks,
  wires,
  onSelectBlock,
  onSelectWire,
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
    if (hasErrors) return 'bg-red-600 hover:bg-red-700'
    if (hasWarnings) return 'bg-yellow-600 hover:bg-yellow-700'
    return 'bg-green-600 hover:bg-green-700'
  }
  
  const getIconColor = () => {
    if (hasErrors) return 'text-red-600'
    if (hasWarnings) return 'text-yellow-600'
    return 'text-green-600'
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isValidating}
        data-testid="validation-button"  // Add this line
        className={`
          relative inline-flex items-center gap-2 px-4 py-2 rounded-md text-white font-medium
          transition-colors disabled:opacity-50 disabled:cursor-not-allowed
          ${getButtonColor()}
          ${className}
        `}
        title="Validate model for type compatibility issues"
      >
        {/* Icon */}
        <svg 
          className={`w-5 h-5 ${isValidating ? 'animate-spin' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          {isValidating ? (
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
            />
          ) : (
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" 
            />
          )}
        </svg>
        
        {/* Text */}
        <span>Validate Model</span>
        
        {/* Issue count badge */}
        {hasIssues && !isValidating && (
          <span className={`
            absolute -top-2 -right-2 inline-flex items-center justify-center 
            px-2 py-1 text-xs font-bold rounded-full
            ${hasErrors ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}
          `}>
            {allErrors.length + allWarnings.length}
          </span>
        )}
      </button>
      
      {/* Inline indicator for toolbar */}
      {hasIssues && (
        <div className="inline-flex items-center gap-3 ml-3">
          {hasErrors && (
            <span className="inline-flex items-center gap-1 text-sm text-red-600">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {allErrors.length} {allErrors.length === 1 ? 'Error' : 'Errors'}
            </span>
          )}
          {hasWarnings && (
            <span className="inline-flex items-center gap-1 text-sm text-yellow-600">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {allWarnings.length}
            </span>
          )}
        </div>
      )}
      
      {/* Validation Modal */}
      <ModelValidationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        errors={allErrors}
        warnings={allWarnings}
        blocks={blocks}
        onSelectBlock={onSelectBlock}
        onSelectWire={onSelectWire}
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
      <div 
        className="inline-flex items-center gap-1 text-sm text-green-600 cursor-pointer hover:text-green-700"
        onClick={onClick}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        <span>Valid</span>
      </div>
    )
  }
  
  return (
    <div 
      className="inline-flex items-center gap-2 cursor-pointer"
      onClick={onClick}
    >
      {isValidating && (
        <svg className="w-4 h-4 text-gray-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      )}
      {hasErrors && (
        <span className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {allErrors.length}
        </span>
      )}
      {hasWarnings && (
        <span className="inline-flex items-center gap-1 text-sm text-yellow-600 hover:text-yellow-700">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {allWarnings.length}
        </span>
      )}
    </div>
  )
}
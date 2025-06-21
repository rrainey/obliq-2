// components/ModelValidationModal.tsx

'use client'

import { useState, useEffect } from 'react'
import { TypeCompatibilityError, formatTypeError } from '@/lib/typeCompatibilityValidator'
import { BlockData } from './BlockNode'

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
  const [selectedTab, setSelectedTab] = useState<'errors' | 'warnings'>('errors')
  
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
      <div
        key={`${item.wireId || item.blockId || index}`}
        className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={() => handleItemClick(item)}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium ${
                item.severity === 'error' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
              }`}>
                {item.severity === 'error' ? '!' : '?'}
              </span>
              <span className="font-medium text-gray-900">{location}</span>
            </div>
            <p className="mt-1 text-sm text-gray-600">{formattedError}</p>
          </div>
          <svg
            className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    )
  }

  const hasErrors = errors.length > 0
  const hasWarnings = warnings.length > 0
  const activeItems = selectedTab === 'errors' ? errors : warnings

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Model Validation Results</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Summary */}
          <div className="mt-3 flex items-center gap-4 text-sm">
            {hasErrors ? (
              <span className="flex items-center gap-1 text-red-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {errors.length} {errors.length === 1 ? 'Error' : 'Errors'}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-green-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                No Errors
              </span>
            )}
            {hasWarnings && (
              <span className="flex items-center gap-1 text-yellow-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {warnings.length} {warnings.length === 1 ? 'Warning' : 'Warnings'}
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        {(hasErrors || hasWarnings) && (
          <div className="px-6 pt-4">
            <div className="flex border-b border-gray-200">
              <button
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  selectedTab === 'errors'
                    ? 'text-red-600 border-red-600'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                }`}
                onClick={() => setSelectedTab('errors')}
                disabled={!hasErrors}
              >
                Errors ({errors.length})
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  selectedTab === 'warnings'
                    ? 'text-yellow-600 border-yellow-600'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                }`}
                onClick={() => setSelectedTab('warnings')}
                disabled={!hasWarnings}
              >
                Warnings ({warnings.length})
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 px-6 py-4 overflow-y-auto">
          {!hasErrors && !hasWarnings ? (
            <div className="flex flex-col items-center justify-center py-12">
              <svg className="w-16 h-16 text-green-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Model is Valid</h3>
              <p className="text-gray-600 text-center">
                All connections have compatible types and the model is ready for simulation.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeItems.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No {selectedTab} found
                </p>
              ) : (
                activeItems.map((item, index) => renderValidationItem(item, index))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">
              Click on an item to navigate to its location
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
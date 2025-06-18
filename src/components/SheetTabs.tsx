// components/SheetTabs.tsx
'use client'

import { useState } from 'react'

export interface Sheet {
  id: string
  name: string
  blocks: any[]
  connections: any[]
  extents: {
    width: number
    height: number
  }
}

interface SheetTabsProps {
  sheets: Sheet[]
  activeSheetId: string
  onSheetChange: (sheetId: string) => void
  onAddSheet: () => void
  onRenameSheet: (sheetId: string, newName: string) => void
  onDeleteSheet: (sheetId: string) => void
  isInSubsystem?: boolean
  parentSheetId?: string | null
  onNavigateToParent?: () => void
}

// Helper function to determine if a sheet is a main sheet (cannot be deleted)
const isMainSheet = (sheet: Sheet): boolean => {
  return sheet.id === 'main' || sheet.id.endsWith('_main')
}

export default function SheetTabs({ 
  sheets, 
  activeSheetId, 
  onSheetChange, 
  onAddSheet, 
  onRenameSheet, 
  onDeleteSheet,
  isInSubsystem = false,
  parentSheetId = null,
  onNavigateToParent
}: SheetTabsProps) {
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const handleStartEdit = (sheet: Sheet) => {
    setEditingSheetId(sheet.id)
    setEditingName(sheet.name)
  }

  const handleSaveEdit = () => {
    if (editingSheetId && editingName.trim()) {
      onRenameSheet(editingSheetId, editingName.trim())
    }
    setEditingSheetId(null)
    setEditingName('')
  }

  const handleCancelEdit = () => {
    setEditingSheetId(null)
    setEditingName('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  return (
    <div className={`border-b flex items-center px-4 ${
      isInSubsystem 
        ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700' 
        : 'bg-white dark:bg-gray-900 dark:border-gray-700'
    }`}>
      {/* Parent navigation button */}
      {isInSubsystem && parentSheetId && onNavigateToParent && (
        <button
          onClick={onNavigateToParent}
          className="mr-2 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded flex items-center space-x-1"
          title="Navigate to parent sheet"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          <span>Parent</span>
        </button>
      )}
      
      {/* Subsystem indicator */}
      {isInSubsystem && (
        <div className="mr-2 px-2 py-1 bg-purple-600 text-white text-xs font-medium rounded">
          Subsystem
        </div>
      )}
      
      {/* Sheet Tabs */}
      <div className="flex items-center space-x-1 flex-1">
        {sheets.map(sheet => (
          <div key={sheet.id} className="flex items-center">
            {editingSheetId === sheet.id ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={handleSaveEdit}
                onKeyDown={handleKeyDown}
                className="px-3 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            ) : (
              <button
                onClick={() => onSheetChange(sheet.id)}
                onDoubleClick={() => handleStartEdit(sheet)}
                className={`
                  px-3 py-1 text-sm font-medium rounded-t-md border-t border-l border-r
                  ${activeSheetId === sheet.id
                    ? isInSubsystem 
                      ? 'bg-purple-100 text-purple-900 border-purple-300'
                      : 'bg-white text-gray-900 border-gray-300'
                    : isInSubsystem
                      ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                      : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                  }
                `}
                title="Double-click to rename"
              >
                {sheet.name}
              </button>
            )}
            
            {/* Delete button - only show if not editing, there's more than one sheet, and it's not a main sheet */}
            {editingSheetId !== sheet.id && sheets.length > 1 && !isMainSheet(sheet) && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (window.confirm(`Delete sheet "${sheet.name}"?`)) {
                    onDeleteSheet(sheet.id)
                  }
                }}
                className="ml-1 px-1 py-1 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                title="Delete sheet"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        
        {/* Add Sheet Button */}
        <button
          onClick={onAddSheet}
          className={`px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${
            isInSubsystem
              ? 'text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          + Add Sheet
        </button>
      </div>

      {/* Sheet Info */}
      <div className={`text-xs ${
        isInSubsystem ? 'text-purple-600' : 'text-gray-500'
      }`}>
        {sheets.find(s => s.id === activeSheetId)?.blocks?.length || 0} blocks
      </div>
    </div>
  )
}
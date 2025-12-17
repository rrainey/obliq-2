// components/SheetTabs.tsx
'use client'

import { useState } from 'react'
import { useComputedColorScheme } from '@mantine/core'

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
  const colorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true })
  const isDark = colorScheme === 'dark'
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

  // Using Mantine's dark palette: dark.7 = #1A1B1E, dark.6 = #25262B, dark.4 = #373A40
  return (
    <div className={`border-b flex items-center px-4 ${
      isInSubsystem
        ? isDark
          ? 'bg-purple-900/30 border-purple-700'
          : 'bg-purple-50 border-purple-300'
        : isDark
          ? 'bg-[#1A1B1E] border-[#373A40]'
          : 'bg-white border-gray-200'
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
                      ? isDark
                        ? 'bg-purple-800/50 text-purple-100 border-purple-600'
                        : 'bg-purple-100 text-purple-900 border-purple-300'
                      : isDark
                        ? 'bg-[#25262B] text-[#C1C2C5] border-[#373A40]'
                        : 'bg-white text-gray-900 border-gray-300'
                    : isInSubsystem
                      ? isDark
                        ? 'bg-purple-900/20 text-purple-300 border-purple-700 hover:bg-purple-800/40'
                        : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                      : isDark
                        ? 'bg-[#1A1B1E] text-[#909296] border-[#373A40] hover:bg-[#25262B]'
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
                className={`ml-1 px-1 py-1 text-xs rounded ${
                  isDark
                    ? 'text-gray-500 hover:text-red-400 hover:bg-red-900/30'
                    : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                }`}
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
          className={`px-3 py-2 text-sm ${
            isInSubsystem
              ? isDark
                ? 'text-purple-400 hover:text-purple-300 hover:bg-purple-800/30'
                : 'text-purple-600 hover:text-purple-800 hover:bg-purple-100'
              : isDark
                ? 'text-[#909296] hover:text-[#C1C2C5] hover:bg-[#25262B]'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          + Add Sheet
        </button>
      </div>

      {/* Sheet Info */}
      <div className={`text-xs ${
        isInSubsystem
          ? isDark ? 'text-purple-400' : 'text-purple-600'
          : isDark ? 'text-[#909296]' : 'text-gray-500'
      }`}>
        {sheets.find(s => s.id === activeSheetId)?.blocks?.length || 0} blocks
      </div>
    </div>
  )
}
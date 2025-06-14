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
  onDeleteSheet 
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
    <div className="bg-white dark:bg-gray-900 border-b dark:border-gray-700 flex items-center px-4">
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
                    ? 'bg-white text-gray-900 border-gray-300'
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
          className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          + Add Sheet
        </button>
      </div>

      {/* Sheet Info */}
      <div className="text-xs text-gray-500">
        {sheets.find(s => s.id === activeSheetId)?.blocks?.length || 0} blocks
      </div>
    </div>
  )
}
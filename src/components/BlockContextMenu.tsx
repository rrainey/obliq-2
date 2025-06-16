// components/BlockContextMenu.tsx - Updated to match ReactFlow pattern

'use client'

import { useEffect, useRef } from 'react'
import { BlockData } from './Block'
import { Sheet } from '@/lib/modelStore'

interface BlockContextMenuProps {
  nodeId: string
  top?: number
  left?: number
  right?: number
  bottom?: number
  block: BlockData
  availableSheets?: Array<{ id: string; name: string }>
  onClose: () => void
  onPropertiesClick: (blockId: string) => void
  onSheetNavigate: (sheetId: string) => void
}

export default function BlockContextMenu({
  nodeId,
  top,
  left,
  right,
  bottom,
  block,
  availableSheets = [],
  onClose,
  onPropertiesClick,
  onSheetNavigate,
  ...props
}: BlockContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('click', handleClick, true)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  // Check if this is a subsystem block with sheets
  const isSubsystem = block.type === 'subsystem'
  const subsystemSheets = isSubsystem && block.parameters?.sheets 
    ? block.parameters.sheets
    : []

  // Only show the Open Sheet option if there are sheets
  const hasSheets = subsystemSheets.length > 0

  return (
    <div
      ref={menuRef}
      style={{ top, left, right, bottom }}
      className="context-menu absolute z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[180px]"
      {...props}
    >
      {/* Properties menu item */}
      <button
        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        onClick={() => onPropertiesClick(block.id)}
      >
        Properties...
      </button>

      {/* Subsystem sheet navigation - only show if subsystem has sheets */}
      {isSubsystem && hasSheets && (
        <>
          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          <div className="relative group">
            <div className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between cursor-pointer">
              <span>Open Sheet</span>
              <span className="ml-2 text-xs text-gray-500">
                ({subsystemSheets.length} sheet{subsystemSheets.length !== 1 ? 's' : ''}) ▶
              </span>
            </div>
            
            {/* Submenu */}
            <div className="absolute left-full top-0 ml-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[150px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
              {subsystemSheets.map((sheet: Sheet) => (
                <button
                  key={sheet.id}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => onSheetNavigate(sheet.id)}
                >
                  {sheet.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
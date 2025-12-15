// components/WireContextMenu.tsx - Context menu for wire/connection operations

'use client'

import { useEffect, useRef } from 'react'

interface WireContextMenuProps {
  wireId: string
  top?: number
  left?: number
  right?: number
  bottom?: number
  isHighlighted: boolean
  hasCustomRouting: boolean
  onClose: () => void
  onHighlightConnections: (wireId: string) => void
  onRemoveCustomRouting: (wireId: string) => void
  onDelete: (wireId: string) => void
}

export default function WireContextMenu({
  wireId,
  top,
  left,
  right,
  bottom,
  isHighlighted,
  hasCustomRouting,
  onClose,
  onHighlightConnections,
  onRemoveCustomRouting,
  onDelete,
}: WireContextMenuProps) {
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

  return (
    <div
      ref={menuRef}
      style={{ top, left, right, bottom }}
      className="context-menu absolute z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[180px]"
    >
      {/* Highlight Connections menu item */}
      <button
        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between"
        onClick={() => {
          onHighlightConnections(wireId)
          onClose()
        }}
      >
        <span>Highlight Connections</span>
        {isHighlighted && (
          <span className="text-xs text-magenta-500 ml-2" style={{ color: '#d946ef' }}>
            (active)
          </span>
        )}
      </button>

      {/* Remove Custom Routing menu item - only enabled if wire has custom routing */}
      <button
        className={`w-full px-4 py-2 text-left text-sm flex items-center justify-between ${
          hasCustomRouting
            ? 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            : 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
        }`}
        onClick={() => {
          if (hasCustomRouting) {
            onRemoveCustomRouting(wireId)
            onClose()
          }
        }}
        disabled={!hasCustomRouting}
      >
        <span>Remove Custom Routing</span>
      </button>

      <div className="border-t border-gray-200 dark:border-gray-700 my-1" />

      {/* Delete menu item */}
      <button
        className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
        onClick={() => {
          onDelete(wireId)
          onClose()
        }}
      >
        Delete
      </button>
    </div>
  )
}

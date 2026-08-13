// Context menu shown when right-clicking empty canvas area.

'use client'

import { useEffect, useRef } from 'react'

export interface PaneContextMenuProps {
  top?: number
  left?: number
  right?: number
  bottom?: number
  onClose: () => void
  onReorganize: () => void
}

export default function PaneContextMenu({
  top,
  left,
  right,
  bottom,
  onClose,
  onReorganize,
}: PaneContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
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
      className="context-menu absolute z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[220px]"
    >
      <button
        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        onClick={onReorganize}
      >
        Reorganize Block Arrangement
      </button>
    </div>
  )
}

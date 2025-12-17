// components/SheetBreadcrumbs.tsx

'use client'

import React from 'react'
import { ChevronRight } from 'lucide-react'
import { Breadcrumb } from '@/lib/types'
import { useComputedColorScheme } from '@mantine/core'

interface SheetBreadcrumbsProps {
  breadcrumbs: Breadcrumb[]
  onNavigate: (sheetId: string) => void
  className?: string
}

export default function SheetBreadcrumbs({
  breadcrumbs,
  onNavigate,
  className = ''
}: SheetBreadcrumbsProps) {
  const colorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true })
  const isDark = colorScheme === 'dark'

  if (breadcrumbs.length === 0) {
    return null
  }

  const handleClick = (breadcrumb: Breadcrumb, index: number) => {
    // Only navigate if not the current sheet (last breadcrumb)
    if (index < breadcrumbs.length - 1) {
      onNavigate(breadcrumb.sheetId)
    }
  }

  // Using Mantine's dark palette: dark.7 = #1A1B1E, dark.4 = #373A40
  return (
    <div className={`flex items-center space-x-1 px-4 py-2 border-b text-sm ${
      isDark
        ? 'bg-[#1A1B1E] border-[#373A40]'
        : 'bg-gray-50 border-gray-200'
    } ${className}`}>
      {breadcrumbs.map((breadcrumb, index) => (
        <React.Fragment key={breadcrumb.sheetId}>
          {index > 0 && (
            <ChevronRight className={`w-4 h-4 ${isDark ? 'text-[#5C5F66]' : 'text-gray-400'}`} />
          )}
          <span
            className={`
              ${index === breadcrumbs.length - 1
                ? isDark ? 'text-[#C1C2C5] font-medium' : 'text-gray-900 font-medium'
                : isDark ? 'text-[#909296] hover:text-[#C1C2C5]' : 'text-gray-600 hover:text-gray-900'
              }
              ${index < breadcrumbs.length - 1 ? 'cursor-pointer hover:underline' : ''}
            `}
            onClick={() => handleClick(breadcrumb, index)}
            role={index < breadcrumbs.length - 1 ? 'button' : undefined}
            tabIndex={index < breadcrumbs.length - 1 ? 0 : undefined}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && index < breadcrumbs.length - 1) {
                e.preventDefault()
                handleClick(breadcrumb, index)
              }
            }}
          >
            {breadcrumb.sheetName}
          </span>
        </React.Fragment>
      ))}
    </div>
  )
}
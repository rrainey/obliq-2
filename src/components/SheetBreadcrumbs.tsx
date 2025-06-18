// components/SheetBreadcrumbs.tsx

'use client'

import React from 'react'
import { ChevronRight } from 'lucide-react'
import { Breadcrumb } from '@/lib/types'

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
  if (breadcrumbs.length === 0) {
    return null
  }

  const handleClick = (breadcrumb: Breadcrumb, index: number) => {
    // Only navigate if not the current sheet (last breadcrumb)
    if (index < breadcrumbs.length - 1) {
      onNavigate(breadcrumb.sheetId)
    }
  }

  return (
    <div className={`flex items-center space-x-1 px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm ${className}`}>
      {breadcrumbs.map((breadcrumb, index) => (
        <React.Fragment key={breadcrumb.sheetId}>
          {index > 0 && (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
          <span
            className={`
              ${index === breadcrumbs.length - 1 
                ? 'text-gray-900 font-medium' 
                : 'text-gray-600 hover:text-gray-900'
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
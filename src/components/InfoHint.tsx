'use client'

import { useState, type ReactNode } from 'react'
import { Tooltip } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'

interface InfoHintProps {
  /** Description shown in the popup. */
  label: ReactNode
  /** Popup width in px (text wraps). */
  width?: number
  /** Accessible name for the icon; defaults to "More information". */
  ariaLabel?: string
}

/**
 * Small ⓘ icon that shows a description on hover, keyboard focus, or click/tap.
 * It closes on mouse leave, blur, or Escape.
 *
 * Safe to place inside a <label> (e.g. a Checkbox label): clicking the icon
 * shows the description without toggling the control.
 */
export default function InfoHint({ label, width = 280, ariaLabel = 'More information' }: InfoHintProps) {
  const [opened, setOpened] = useState(false)

  return (
    <Tooltip label={label} opened={opened} withArrow multiline w={width} position="top">
      <span
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        style={{ display: 'inline-flex', cursor: 'help', color: 'var(--mantine-color-dimmed)' }}
        onMouseEnter={() => setOpened(true)}
        onMouseLeave={() => setOpened(false)}
        onFocus={() => setOpened(true)}
        onBlur={() => setOpened(false)}
        onClick={(e) => {
          // Don't let the click reach an enclosing <label> and toggle its input
          e.preventDefault()
          e.stopPropagation()
          // Open (not toggle): with a mouse, hover has already opened it
          setOpened(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpened(false)
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpened(o => !o)
          }
        }}
      >
        <IconInfoCircle size={14} />
      </span>
    </Tooltip>
  )
}

// components/AutoSaveStatusIndicator.tsx
'use client'

import { useEffect, useState } from 'react'
import { useModelStore } from '@/lib/modelStore'
import { Group, Text, Transition } from '@mantine/core'
import { IconClock, IconCircleCheck } from '@tabler/icons-react'

export default function AutoSaveStatusIndicator() {
  const { autoSaveEnabled, lastAutoSave } = useModelStore()
  const [showSaved, setShowSaved] = useState(false)

  useEffect(() => {
    if (lastAutoSave) {
      // Show "Saved" message briefly
      setShowSaved(true)
      const timer = setTimeout(() => setShowSaved(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [lastAutoSave])

  if (!autoSaveEnabled) {
    return null
  }

  const formatTime = (dateString: string | null) => {
    if (!dateString) return 'Never'
    
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} min ago`
    
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    
    return date.toLocaleDateString()
  }

  return (
    <div style={{ position: 'relative', width: 120 }}>
      <Transition
        mounted={showSaved}
        transition="fade"
        duration={200}
        timingFunction="ease"
      >
        {(styles) => (
          <Group gap={4} style={{ ...styles, position: 'absolute' }}>
            <IconCircleCheck size={16} color="var(--mantine-color-green-6)" />
            <Text size="xs" c="green.6">Auto-saved</Text>
          </Group>
        )}
      </Transition>
      
      <Transition
        mounted={!showSaved}
        transition="fade"
        duration={200}
        timingFunction="ease"
      >
        {(styles) => (
          <Group gap={4} style={styles}>
            <IconClock size={16} color="var(--mantine-color-gray-6)" />
            <Text size="xs" c="dimmed">
              Auto-save: {formatTime(lastAutoSave)}
            </Text>
          </Group>
        )}
      </Transition>
    </div>
  )
}
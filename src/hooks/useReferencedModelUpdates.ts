'use client'

import { useEffect } from 'react'
import { notifications } from '@mantine/notifications'
import { modelApi } from '@/lib/modelApi'
import { useModelStore } from '@/lib/modelStore'

/**
 * Keeps model references that track a model's latest save up to date. When
 * the window regains focus (typically after editing the referenced model in
 * another tab), each referenced model's file hash is checked and changed
 * models are reloaded; reference blocks then follow any port changes.
 *
 * Focus checks rather than one event stream per referenced model, which
 * could exhaust the browser's per-host connection limit.
 */
export function useReferencedModelUpdates(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    let running = false
    const check = async () => {
      if (running || document.visibilityState === 'hidden') return
      running = true
      try {
        const entries = Object.values(useModelStore.getState().referencedModels)
        const latest = entries.filter(e => e.version === null && e.status === 'ok')
        const changed: string[] = []
        await Promise.all(
          latest.map(async e => {
            const status = await modelApi.status(e.modelId).catch(() => null)
            if (status && status.status !== 'missing' && status.hash !== e.hash) changed.push(e.modelId)
          })
        )
        if (changed.length === 0) return
        await useModelStore.getState().loadReferencedModels(changed)
        const names = changed
          .map(id => entries.find(e => e.modelId === id)?.name || id)
          .map(n => `"${n}"`)
          .join(', ')
        notifications.show({
          title: 'Referenced model updated',
          message: `Reloaded ${names}. Model reference blocks now use its latest save.`,
          color: 'blue',
          autoClose: 4000,
        })
      } finally {
        running = false
      }
    }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [enabled])
}

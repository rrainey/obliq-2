'use client'

import { useEffect, useState } from 'react'
import { modelApi, type FileStatus } from '@/lib/modelApi'

/**
 * Live status of a model's file on disk.
 *
 * Subscribes to the server's SSE stream (GET /api/models/:id/events), which
 * reports the file's current hash whenever it changes, and re-checks when the
 * window regains focus (covers a dropped stream or a sleeping laptop).
 *
 * Callers compare `status.hash` with the hash they loaded: edits made through
 * the Model Builder API/MCP update the server's recorded hash, so they arrive
 * as status 'ok' with a new hash rather than 'changed'.
 */
export function useModelFileStatus(modelId: string | null, enabled: boolean): FileStatus | null {
  const [status, setStatus] = useState<FileStatus | null>(null)

  useEffect(() => {
    setStatus(null)
    if (!modelId || !enabled || typeof window === 'undefined') return

    let cancelled = false
    const update = (next: FileStatus) => {
      if (!cancelled) setStatus(next)
    }

    let source: EventSource | null = null
    if (typeof EventSource !== 'undefined') {
      source = new EventSource(modelApi.eventsUrl(modelId))
      source.addEventListener('status', event => {
        try {
          update(JSON.parse((event as MessageEvent).data))
        } catch {
          // ignore malformed events
        }
      })
    }

    const recheck = () => {
      modelApi.status(modelId).then(update).catch(() => {})
    }
    window.addEventListener('focus', recheck)

    return () => {
      cancelled = true
      source?.close()
      window.removeEventListener('focus', recheck)
    }
  }, [modelId, enabled])

  return status
}

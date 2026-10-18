/**
 * GET /api/models/:id/events — Server-Sent Events stream of model file status.
 *
 * Emits `event: status` with { status: 'ok' | 'changed' | 'missing', hash?, mtimeMs? }
 * once on connect and whenever the file on disk changes, plus a comment
 * heartbeat every 25s. The browser's EventSource sends the session cookie.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/apiAuthMiddleware'
import { storageErrorResponse } from '@/lib/api-support/auth'
import { getStorage } from '@/lib/server/storage'
import { getModelWatcher, type ModelFileEvent } from '@/lib/server/modelWatcher'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEARTBEAT_MS = 25_000

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateRequest(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error || 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }
  const { id } = await context.params

  let initial
  try {
    initial = getStorage().models.checkFileStatus(id)
  } catch (error) {
    return storageErrorResponse(error) ?? NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const encoder = new TextEncoder()
  let cleanup = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cleanup()
        }
      }
      const sendStatus = (event: Omit<ModelFileEvent, 'modelId'>) =>
        send(`event: status\ndata: ${JSON.stringify(event)}\n\n`)

      sendStatus(initial)
      const unsubscribe = getModelWatcher().subscribe(id, ({ modelId: _modelId, ...event }) => sendStatus(event))
      const heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS)

      cleanup = () => {
        cleanup = () => {}
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // already closed
        }
      }
      request.signal.addEventListener('abort', () => cleanup())
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

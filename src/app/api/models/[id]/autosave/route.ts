/**
 * GET    /api/models/:id/autosave        → { autosave: {data, savedAt} | null }
 * PUT    /api/models/:id/autosave {data} → { savedAt }
 * DELETE /api/models/:id/autosave        → { ok }
 */
import { modelsRoute, readJsonBody, requireObject } from '@/lib/server/modelsApi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { id: string }

export const GET = modelsRoute<Params>(({ storage, params }) => ({ autosave: storage.models.getAutosave(params.id) }))

export const PUT = modelsRoute<Params>(async ({ request, storage, params }) => {
  const body = await readJsonBody(request)
  return { savedAt: storage.models.putAutosave(params.id, requireObject(body, 'data')) }
})

export const DELETE = modelsRoute<Params>(({ storage, params }) => {
  storage.models.deleteAutosave(params.id)
  return { ok: true }
})

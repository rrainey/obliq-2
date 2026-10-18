/**
 * GET    /api/models/:id         → { model, data, hash, externalChange }  (current model file)
 * PATCH  /api/models/:id {name}  → { model }
 * DELETE /api/models/:id         → { ok }   (a linked external file is left in place)
 */
import { modelsRoute, readJsonBody, requireString } from '@/lib/server/modelsApi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { id: string }

export const GET = modelsRoute<Params>(({ storage, params }) => {
  const current = storage.models.readCurrent(params.id)
  return { model: current.record, data: current.data, hash: current.hash, externalChange: current.externalChange }
})

export const PATCH = modelsRoute<Params>(async ({ request, storage, params }) => {
  const body = await readJsonBody(request)
  return { model: storage.models.rename(params.id, requireString(body, 'name')) }
})

export const DELETE = modelsRoute<Params>(({ storage, params }) => {
  storage.models.delete(params.id)
  return { ok: true }
})

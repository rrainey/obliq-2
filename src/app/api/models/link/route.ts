/**
 * POST /api/models/link {path, name?} → { model }
 * Registers an existing model JSON file (wrapper or bare ModelData) in place.
 */
import { modelsRoute, readJsonBody, requireString } from '@/lib/server/modelsApi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = modelsRoute(async ({ request, storage }) => {
  const body = await readJsonBody(request)
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : undefined
  return { model: storage.models.link(requireString(body, 'path'), { name }) }
})

/**
 * POST /api/models/:id/duplicate {name, version?} → { model }
 */
import { BadRequestError, modelsRoute, readJsonBody, requireString } from '@/lib/server/modelsApi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = modelsRoute<{ id: string }>(async ({ request, storage, params }) => {
  const body = await readJsonBody(request)
  if (body.version != null && (!Number.isInteger(body.version) || body.version < 1)) {
    throw new BadRequestError(`Invalid version: ${body.version}`)
  }
  return { model: storage.models.duplicate(params.id, requireString(body, 'name'), { version: body.version ?? undefined }) }
})

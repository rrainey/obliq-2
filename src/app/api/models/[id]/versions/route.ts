/**
 * GET  /api/models/:id/versions                   → { versions }
 * POST /api/models/:id/versions {data, baseHash?, note?}
 *        → { model, version, hash }   (explicit Save: writes model file + snapshot)
 *        → 409 MODEL_CONFLICT if the file changed since baseHash
 */
import { modelsRoute, readJsonBody, requireObject } from '@/lib/server/modelsApi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { id: string }

export const GET = modelsRoute<Params>(({ storage, params }) => ({ versions: storage.models.listVersions(params.id) }))

export const POST = modelsRoute<Params>(async ({ request, storage, params }) => {
  const body = await readJsonBody(request)
  const result = storage.models.saveSnapshot(params.id, requireObject(body, 'data'), {
    baseHash: typeof body.baseHash === 'string' ? body.baseHash : undefined,
    note: typeof body.note === 'string' ? body.note : undefined,
  })
  return { model: result.record, version: result.version, hash: result.hash }
})

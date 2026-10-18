/**
 * GET  /api/models          → { models: [...record, availableVersions] }
 * POST /api/models {name, data} → { model }
 */
import { modelsRoute, readJsonBody, requireObject, requireString } from '@/lib/server/modelsApi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = modelsRoute(({ storage }) => {
  const models = storage.models.list().map(model => ({
    ...model,
    availableVersions: storage.models
      .listVersions(model.id)
      .map(v => v.version)
      .reverse(),
  }))
  return { models }
})

export const POST = modelsRoute(async ({ request, storage }) => {
  const body = await readJsonBody(request)
  const model = storage.models.create({ name: requireString(body, 'name'), data: requireObject(body, 'data') })
  return { model }
})

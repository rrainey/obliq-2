/**
 * GET /api/models/:id/versions/:version → { version, data, created_at, note }
 */
import { modelsRoute, parseVersion } from '@/lib/server/modelsApi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = modelsRoute<{ id: string; version: string }>(({ storage, params }) => {
  const version = parseVersion(params.version)
  const record = storage.models.listVersions(params.id).find(v => v.version === version)
  const data = storage.models.getVersion(params.id, version)
  return { version, data, created_at: record?.created_at ?? null, note: record?.note ?? null }
})

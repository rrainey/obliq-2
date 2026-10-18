/**
 * GET /api/models/:id/status → { status: 'ok' | 'changed' | 'missing', hash?, mtimeMs? }
 * Side-effect free comparison of the model file on disk with the last hash the app saw.
 */
import { modelsRoute } from '@/lib/server/modelsApi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = modelsRoute<{ id: string }>(({ storage, params }) => storage.models.checkFileStatus(params.id))

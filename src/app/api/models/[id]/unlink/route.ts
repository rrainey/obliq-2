/**
 * POST /api/models/:id/unlink → { model }
 * Copies a linked model's current content into the managed tree.
 */
import { modelsRoute } from '@/lib/server/modelsApi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = modelsRoute<{ id: string }>(({ storage, params }) => ({ model: storage.models.unlink(params.id) }))

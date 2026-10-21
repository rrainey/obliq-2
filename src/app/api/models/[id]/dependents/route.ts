/**
 * GET /api/models/:id/dependents → { dependents: [{ id, name, versions }] }
 * Stored models whose current file references this model (model references),
 * with the versions they pin (null = latest). Side-effect free.
 */
import { modelsRoute } from '@/lib/server/modelsApi'
import { findModelDependents } from '@/lib/server/modelReferenceLoader'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = modelsRoute<{ id: string }>(({ storage, params }) => ({
  dependents: findModelDependents(storage, params.id),
}))

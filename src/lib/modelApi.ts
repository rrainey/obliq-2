/**
 * Browser client for the /api/models REST routes. Requests are authenticated
 * by the local session cookie established by AuthProvider (GET /api/session).
 */

import type { Model } from '@/lib/types'

export interface ModelListItem extends Model {
  availableVersions: number[]
}

export interface CurrentModelResponse {
  model: Model
  data: any
  /** sha256 of the model file; send back as baseHash when saving. */
  hash: string
  /** True if this load picked up (and recorded) an edit made outside the app. */
  externalChange: boolean
}

export interface VersionSummary {
  model_id: string
  version: number
  content_hash: string
  size_bytes: number
  note: string | null
  created_at: string
}

export class ModelApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: Record<string, any>
  ) {
    super(message)
    this.name = 'ModelApiError'
  }

  get isConflict() {
    return this.code === 'MODEL_CONFLICT'
  }

  get isNotFound() {
    return this.status === 404
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ModelApiError(payload.error || `${method} ${url} failed (${res.status})`, res.status, payload.code, payload.details)
  }
  return payload as T
}

const base = (id: string) => `/api/models/${encodeURIComponent(id)}`

export const modelApi = {
  list: () => request<{ models: ModelListItem[] }>('GET', '/api/models').then(r => r.models),

  create: (name: string, data: any) =>
    request<{ model: Model }>('POST', '/api/models', { name, data }).then(r => r.model),

  link: (path: string, name?: string) =>
    request<{ model: Model }>('POST', '/api/models/link', { path, name }).then(r => r.model),

  getCurrent: (id: string) => request<CurrentModelResponse>('GET', base(id)),

  rename: (id: string, name: string) =>
    request<{ model: Model }>('PATCH', base(id), { name }).then(r => r.model),

  remove: (id: string) => request<{ ok: true }>('DELETE', base(id)),

  duplicate: (id: string, name: string, version?: number) =>
    request<{ model: Model }>('POST', `${base(id)}/duplicate`, { name, version }).then(r => r.model),

  unlink: (id: string) => request<{ model: Model }>('POST', `${base(id)}/unlink`).then(r => r.model),

  listVersions: (id: string) =>
    request<{ versions: VersionSummary[] }>('GET', `${base(id)}/versions`).then(r => r.versions),

  getVersion: (id: string, version: number) =>
    request<{ version: number; data: any; created_at: string | null; note: string | null }>(
      'GET',
      `${base(id)}/versions/${version}`
    ),

  /** Explicit save: writes the model file and records a new version. Throws ModelApiError (isConflict) on 409. */
  save: (id: string, data: any, opts: { baseHash?: string | null; note?: string } = {}) =>
    request<{ model: Model; version: number; hash: string }>('POST', `${base(id)}/versions`, {
      data,
      baseHash: opts.baseHash ?? undefined,
      note: opts.note,
    }),

  getAutosave: (id: string) =>
    request<{ autosave: { data: any; savedAt: string } | null }>('GET', `${base(id)}/autosave`).then(r => r.autosave),

  putAutosave: (id: string, data: any) =>
    request<{ savedAt: string }>('PUT', `${base(id)}/autosave`, { data }).then(r => r.savedAt),

  deleteAutosave: (id: string) => request<{ ok: true }>('DELETE', `${base(id)}/autosave`),

  status: (id: string) =>
    request<{ status: 'ok' | 'changed' | 'missing'; hash?: string; mtimeMs?: number }>('GET', `${base(id)}/status`),
}

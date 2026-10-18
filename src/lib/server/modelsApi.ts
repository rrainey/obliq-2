/**
 * Shared plumbing for the /api/models REST routes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/apiAuthMiddleware'
import { storageErrorResponse } from '@/lib/api-support/auth'
import { getStorage, type Storage } from './storage'

export class BadRequestError extends Error {}

type Handler<P> = (ctx: { request: NextRequest; storage: Storage; params: P }) => Promise<unknown> | unknown

/**
 * Authenticate, run the handler, and map storage errors to HTTP responses.
 * Handlers return a plain object (sent as JSON 200) or a NextResponse.
 */
export function modelsRoute<P = Record<string, never>>(handler: Handler<P>) {
  return async (request: NextRequest, context: { params: Promise<P> }) => {
    const auth = await authenticateRequest(request)
    if (!auth.authenticated) {
      return NextResponse.json({ error: auth.error || 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }
    try {
      const params = (context?.params ? await context.params : {}) as P
      const result = await handler({ request, storage: getStorage(), params })
      return result instanceof NextResponse ? result : NextResponse.json(result ?? { ok: true })
    } catch (error) {
      if (error instanceof BadRequestError) {
        return NextResponse.json({ error: error.message, code: 'BAD_REQUEST' }, { status: 400 })
      }
      const mapped = storageErrorResponse(error)
      if (mapped) return mapped
      console.error(`[api/models] ${request.method} ${request.nextUrl.pathname} failed:`, error)
      return NextResponse.json({ error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
    }
  }
}

export async function readJsonBody(request: NextRequest): Promise<Record<string, any>> {
  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
    return body
  } catch {
    throw new BadRequestError('Request body must be a JSON object')
  }
}

export function requireString(body: Record<string, any>, key: string): string {
  const value = body[key]
  if (typeof value !== 'string' || !value.trim()) throw new BadRequestError(`Missing required field: ${key}`)
  return value.trim()
}

export function requireObject(body: Record<string, any>, key: string): Record<string, any> {
  const value = body[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestError(`Missing required object field: ${key}`)
  }
  return value
}

export function parseVersion(raw: string): number {
  const version = Number(raw)
  if (!Number.isInteger(version) || version < 1) throw new BadRequestError(`Invalid version: ${raw}`)
  return version
}

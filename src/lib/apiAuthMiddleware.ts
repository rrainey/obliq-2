import { NextRequest, NextResponse } from 'next/server'
import { ApiTokenService } from './apiTokenService'
import { getStorage } from './server/storage'
import { isValidSessionCookie, LOCAL_USER_ID, SESSION_COOKIE } from './server/session'

export interface AuthResult {
  authenticated: boolean
  userId?: string
  tokenId?: string
  /** 'api_token' | 'session' — how the caller was authenticated */
  authMethod?: 'api_token' | 'session'
  error?: string
}

/**
 * Authenticate a raw API token (128-char hex from the /tokens page), as used
 * by MCP, automations, and scripts.
 */
export async function authenticateApiRequest(token: string): Promise<AuthResult> {
  if (!token || typeof token !== 'string' || !ApiTokenService.isValidTokenFormat(token)) {
    return { authenticated: false, error: 'Missing or invalid token' }
  }

  const tokens = getStorage().tokens
  const record = tokens.findByHash(ApiTokenService.hashToken(token))
  if (!record) {
    return { authenticated: false, error: 'Invalid token' }
  }

  if (ApiTokenService.isTokenExpired(record.expires_at)) {
    if (process.env.AUTO_DELETE_EXPIRED_TOKENS === 'true') {
      tokens.delete(record.id)
    }
    return { authenticated: false, error: 'Token expired' }
  }

  tokens.touch(record.id)
  return { authenticated: true, userId: LOCAL_USER_ID, tokenId: record.id, authMethod: 'api_token' }
}

/**
 * Authenticate an HTTP request from the browser or an API client.
 *
 * Order:
 * 1. Authorization: Bearer <api_token>
 * 2. Local session cookie (set by GET /api/session)
 */
export async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization')
  if (authHeader) {
    const m = authHeader.match(/^Bearer\s+(.+)$/i)
    const result = await authenticateApiRequest(m ? m[1] : authHeader)
    if (result.authenticated) return result
  }

  if (isValidSessionCookie(request.cookies.get(SESSION_COOKIE)?.value)) {
    return { authenticated: true, userId: LOCAL_USER_ID, authMethod: 'session' }
  }

  return { authenticated: false, error: 'Not authenticated' }
}

/**
 * Wrap a route handler so it only runs for authenticated requests.
 */
export function withApiAuth(
  handler: (request: NextRequest, context: any) => Promise<NextResponse>
) {
  return async (request: NextRequest, context: any) => {
    const authResult = await authenticateRequest(request)
    if (!authResult.authenticated) {
      return NextResponse.json({ error: authResult.error || 'Unauthorized' }, { status: 401 })
    }
    return handler(request, { ...context, userId: authResult.userId })
  }
}

/**
 * Clean up all expired tokens (manual trigger)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  return getStorage().tokens.deleteExpired()
}

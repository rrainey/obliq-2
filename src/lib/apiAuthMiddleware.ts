import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { ApiTokenService, tokenCache } from './apiTokenService'

// Create a server-side Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false
  }
})

/** Anon client used only to validate user session JWTs (not for RLS queries). */
const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
})

export interface AuthResult {
  authenticated: boolean
  userId?: string
  tokenId?: string
  /** 'api_token' | 'session' — how the caller was authenticated */
  authMethod?: 'api_token' | 'session'
  error?: string
}

/**
 * Authenticate a raw token string.
 *
 * Accepts:
 * 1. User API tokens (128-char hex from /tokens page) — for Model Builder / automation
 * 2. Supabase session access tokens (JWT) — for browser UI calls
 */
export async function authenticateApiRequest(token: string): Promise<AuthResult> {
  if (!token || typeof token !== 'string') {
    return {
      authenticated: false,
      error: 'Missing or invalid token'
    }
  }

  // Path 1: long-lived user API token (hex)
  if (ApiTokenService.isValidTokenFormat(token)) {
    return authenticateUserApiToken(token)
  }

  // Path 2: Supabase user session JWT (from browser login)
  return authenticateSessionJwt(token)
}

/**
 * Authenticate an HTTP request for browser or API clients.
 *
 * Order:
 * 1. Authorization: Bearer <api_token|session_jwt>
 * 2. Cookie session (SSR) when no usable Bearer token
 */
export async function authenticateRequest(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization')
  let bearer: string | null = null
  if (authHeader) {
    const m = authHeader.match(/^Bearer\s+(.+)$/i)
    bearer = m ? m[1] : authHeader
  }

  if (bearer) {
    const result = await authenticateApiRequest(bearer)
    if (result.authenticated) {
      return result
    }
    // Fall through to cookies if Bearer was not valid (e.g. stale JWT)
  }

  return authenticateCookieSession()
}

async function authenticateUserApiToken(token: string): Promise<AuthResult> {
  // Hash the provided token
  const tokenHash = ApiTokenService.hashToken(token)

  // Check cache first
  const cachedUserId = tokenCache.get(tokenHash)
  if (cachedUserId) {
    
    // Still need to verify it's not expired
    const { data: tokenData, error } = await supabaseServer
      .from('api_tokens')
      .select('id, expires_at')
      .eq('token_hash', tokenHash)
      .single()
    
    if (!error && tokenData) {
      if (!ApiTokenService.isTokenExpired(tokenData.expires_at)) {
        // Update last_used_at asynchronously (don't wait)
        updateTokenLastUsed(tokenData.id).catch(console.error)
        
        return {
          authenticated: true,
          userId: cachedUserId,
          tokenId: tokenData.id,
          authMethod: 'api_token',
        }
      } else {
        // Token expired - remove from cache
        tokenCache.delete(tokenHash)
        
        // Auto-delete if enabled
        if (process.env.AUTO_DELETE_EXPIRED_TOKENS === 'true') {
          deleteExpiredToken(tokenData.id).catch(console.error)
        }
        
        return {
          authenticated: false,
          error: 'Token expired'
        }
      }
    }
  }

  // Not in cache, query database
  const { data: tokenData, error } = await supabaseServer
    .from('api_tokens')
    .select('id, user_id, expires_at')
    .eq('token_hash', tokenHash)
    .single()

  if (error || !tokenData) {
    return {
      authenticated: false,
      error: 'Invalid token'
    }
  }

  // Check if token is expired
  if (ApiTokenService.isTokenExpired(tokenData.expires_at)) {
    // Auto-delete if enabled
    if (process.env.AUTO_DELETE_EXPIRED_TOKENS === 'true') {
      await deleteExpiredToken(tokenData.id)
    }
    
    return {
      authenticated: false,
      error: 'Token expired'
    }
  }

  // Token is valid - add to cache
  tokenCache.set(tokenHash, tokenData.user_id)

  // Update last_used_at asynchronously
  updateTokenLastUsed(tokenData.id).catch(console.error)

  return {
    authenticated: true,
    userId: tokenData.user_id,
    tokenId: tokenData.id,
    authMethod: 'api_token',
  }
}

/**
 * Validate a Supabase access_token JWT and return the user id.
 */
async function authenticateSessionJwt(accessToken: string): Promise<AuthResult> {
  try {
    const { data, error } = await supabaseAuth.auth.getUser(accessToken)
    if (error || !data.user) {
      return {
        authenticated: false,
        error: error?.message || 'Invalid or expired session',
      }
    }
    return {
      authenticated: true,
      userId: data.user.id,
      authMethod: 'session',
    }
  } catch (e) {
    return {
      authenticated: false,
      error: e instanceof Error ? e.message : 'Session validation failed',
    }
  }
}

/**
 * Authenticate via cookies written by the browser Supabase client.
 */
async function authenticateCookieSession(): Promise<AuthResult> {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a context that cannot set cookies — safe to ignore for auth reads
          }
        },
      },
    })

    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return {
        authenticated: false,
        error: error?.message || 'Not signed in',
      }
    }
    return {
      authenticated: true,
      userId: user.id,
      authMethod: 'session',
    }
  } catch (e) {
    return {
      authenticated: false,
      error: e instanceof Error ? e.message : 'Cookie session validation failed',
    }
  }
}

/**
 * Update token's last_used_at timestamp
 */
async function updateTokenLastUsed(tokenId: string): Promise<void> {
  await supabaseServer
    .from('api_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenId)
}

/**
 * Delete an expired token
 */
async function deleteExpiredToken(tokenId: string): Promise<void> {
  const { error } = await supabaseServer
    .from('api_tokens')
    .delete()
    .eq('id', tokenId)
  
  if (error) {
    console.error('Failed to delete expired token:', error)
  } else {
    console.log('Deleted expired token:', tokenId)
  }
}

/**
 * Middleware wrapper for API routes that require authentication
 */
export function withApiAuth<T extends { params: Promise<{ token: string }> }>(
  handler: (request: NextRequest, context: T & { userId?: string }) => Promise<NextResponse>
) {
  return async (request: NextRequest, context: T): Promise<NextResponse> => {
    const { token } = await context.params
    
    const authResult = await authenticateApiRequest(token)
    
    if (!authResult.authenticated) {
      return NextResponse.json(
        {
          success: false,
          error: authResult.error || 'Authentication failed'
        },
        { status: 401 }
      )
    }
    
    // Add userId to context if available
    const enhancedContext = {
      ...context,
      userId: authResult.userId
    }
    
    return handler(request, enhancedContext)
  }
}

/**
 * Clean up all expired tokens (manual trigger)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const { data, error } = await supabaseServer
    .rpc('cleanup_expired_api_tokens')
  
  if (error) {
    console.error('Failed to cleanup expired tokens:', error)
    return 0
  }
  
  console.log(`Cleaned up ${data} expired tokens`)
  return data || 0
}

/**
 * Get user ID from authentication token
 * Returns null if token is invalid
 */
export async function getUserIdFromToken(token: string): Promise<string | null> {
  const authResult = await authenticateApiRequest(token)

  if (!authResult.authenticated) {
    return null
  }

  return authResult.userId || null
}
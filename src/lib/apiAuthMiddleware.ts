import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ApiTokenService, tokenCache } from './apiTokenService'

// Create a server-side Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false
  }
})

export interface AuthResult {
  authenticated: boolean
  userId?: string
  tokenId?: string
  error?: string
  isEnvironmentToken?: boolean
}

/**
 * Authenticate API request using either environment token or user-specific token
 */
export async function authenticateApiRequest(token: string): Promise<AuthResult> {
  if (!token || typeof token !== 'string') {
    return {
      authenticated: false,
      error: 'Missing or invalid token'
    }
  }

  // First, check if it's the environment token
  const envToken = process.env.AUTOMATION_API_TOKEN || process.env.MODEL_BUILDER_API_TOKEN
  
  if (envToken && token === envToken) {
    return {
      authenticated: true,
      isEnvironmentToken: true
    }
  }

  // Validate token format for user tokens
  if (!ApiTokenService.isValidTokenFormat(token)) {
    return {
      authenticated: false,
      error: 'Invalid token format'
    }
  }

  // Hash the provided token
  const tokenHash = ApiTokenService.hashToken(token)

  // Check cache first
  const cachedUserId = tokenCache.get(tokenHash)
  if (cachedUserId) {
    console.log('Token found in cache')
    
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
          tokenId: tokenData.id
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
    tokenId: tokenData.id
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
 * Returns null if token is invalid or environment token
 */
export async function getUserIdFromToken(token: string): Promise<string | null> {
  const authResult = await authenticateApiRequest(token)
  
  if (!authResult.authenticated || authResult.isEnvironmentToken) {
    return null
  }
  
  return authResult.userId || null
}
// app/api/tokens/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { ApiTokenService } from '@/lib/apiTokenService'
import { authenticateRequest } from '@/lib/apiAuthMiddleware'
import { getStorage, TokenNameConflictError } from '@/lib/server/storage'

export const runtime = 'nodejs'

// GET /api/tokens - List tokens
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request)
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const tokens = getStorage().tokens.list()

    // Add computed fields
    const enrichedTokens = tokens.map(token => ({
      ...token,
      isExpired: ApiTokenService.isTokenExpired(token.expires_at),
      expiresInDays: token.expires_at ? calculateDaysUntilExpiry(token.expires_at) : null
    }))

    return NextResponse.json({
      tokens: enrichedTokens,
      count: enrichedTokens.length
    })

  } catch (error) {
    console.error('API tokens GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/tokens - Create a new token
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request)
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
    const { name, expiresInDays } = body ?? {}

    // Validate input
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Token name is required' },
        { status: 400 }
      )
    }

    const sanitizedName = ApiTokenService.sanitizeTokenName(name)
    if (!sanitizedName) {
      return NextResponse.json(
        { error: 'Invalid token name' },
        { status: 400 }
      )
    }

    // Validate expiry
    const validExpiryOptions = [30, 90, 180, null]
    if (expiresInDays !== undefined && !validExpiryOptions.includes(expiresInDays)) {
      return NextResponse.json(
        { error: 'Invalid expiry option. Must be 30, 90, 180, or null (never expires)' },
        { status: 400 }
      )
    }

    // Generate token and hash
    const { token, tokenHash } = ApiTokenService.createToken()
    const expiresAt = ApiTokenService.calculateExpiryDate(expiresInDays || null)

    let newToken
    try {
      newToken = getStorage().tokens.create({
        name: sanitizedName,
        tokenHash,
        expiresAt: expiresAt ? expiresAt.toISOString() : null
      })
    } catch (error) {
      if (error instanceof TokenNameConflictError) {
        return NextResponse.json(
          { error: 'A token with this name already exists' },
          { status: 409 }
        )
      }
      throw error
    }

    // Return the token data with the raw token (only time it's visible)
    return NextResponse.json({
      id: newToken.id,
      name: newToken.name,
      token: token, // Raw token - only returned on creation
      created_at: newToken.created_at,
      expires_at: newToken.expires_at,
      expiresInDays: expiresInDays || null
    }, { status: 201 })

  } catch (error) {
    console.error('API tokens POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/tokens/[id] - Handled in separate file
// This requires a dynamic route, so it's in app/api/tokens/[id]/route.ts

function calculateDaysUntilExpiry(expiresAt: string): number {
  const now = new Date()
  const expiry = new Date(expiresAt)
  const diffMs = expiry.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  return Math.max(0, diffDays)
}

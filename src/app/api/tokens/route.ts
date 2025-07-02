// app/api/tokens/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { ApiTokenService, ApiToken } from '@/lib/apiTokenService'
import { cookies } from 'next/headers'

// GET /api/tokens - List user's tokens
export async function GET(request: NextRequest) {
  try {
    // Get cookies - await is required in Next.js 14+
    const cookieStore = await cookies()

    console.log('GET')
    
    // Create Supabase client with user's session
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
            try {
              console.log('Setting cookies:', JSON.stringify(cookiesToSet))
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `set` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
              console.log('in server')
            }
          },
        },
      }
    )

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Fetch user's tokens
    const { data: tokens, error } = await supabase
      .from('api_tokens')
      .select('id, name, created_at, expires_at, last_used_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching tokens:', error)
      return NextResponse.json(
        { error: 'Failed to fetch tokens' },
        { status: 500 }
      )
    }

    // Add computed fields
    const enrichedTokens = (tokens || []).map(token => ({
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
    // Get cookies - await is required in Next.js 14+
    const cookieStore = await cookies()
    
    // Create Supabase client with user's session
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
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
              // The `set` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { name, expiresInDays } = body

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

    // Insert into database
    const { data: newToken, error: insertError } = await supabase
      .from('api_tokens')
      .insert({
        user_id: user.id,
        name: sanitizedName,
        token_hash: tokenHash,
        expires_at: expiresAt ? expiresAt.toISOString() : null
      })
      .select()
      .single()

    if (insertError) {
      // Check for duplicate name
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'A token with this name already exists' },
          { status: 409 }
        )
      }
      
      console.error('Error creating token:', insertError)
      return NextResponse.json(
        { error: 'Failed to create token' },
        { status: 500 }
      )
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
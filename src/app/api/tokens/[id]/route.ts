// app/api/tokens/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { tokenCache } from '@/lib/apiTokenService'

interface RouteParams {
  params: Promise<{ id: string }>
}

// DELETE /api/tokens/[id] - Delete a specific token
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    // Validate ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid token ID format' },
        { status: 400 }
      )
    }

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

    // First, get the token to check ownership and get the hash
    const { data: token, error: fetchError } = await supabase
      .from('api_tokens')
      .select('token_hash, user_id')
      .eq('id', id)
      .single()

    if (fetchError || !token) {
      return NextResponse.json(
        { error: 'Token not found' },
        { status: 404 }
      )
    }

    // Verify ownership
    if (token.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Delete the token
    const { error: deleteError } = await supabase
      .from('api_tokens')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting token:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete token' },
        { status: 500 }
      )
    }

    // Remove from cache if present
    tokenCache.delete(token.token_hash)

    return NextResponse.json({
      message: 'Token deleted successfully',
      id
    })

  } catch (error) {
    console.error('API token DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET /api/tokens/[id] - Get a specific token (optional, for future use)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params

    // Validate ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid token ID format' },
        { status: 400 }
      )
    }

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

  // Fetch the specific token
  const { data: token, error } = await supabase
    .from('api_tokens')
    .select('id, name, created_at, expires_at, last_used_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !token) {
    return NextResponse.json(
      { error: 'Token not found' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    ...token,
    isExpired: token.expires_at ? new Date(token.expires_at) < new Date() : false
  })

  } catch (error) {
    console.error('API token GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
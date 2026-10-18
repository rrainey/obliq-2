// app/api/tokens/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { ApiTokenService } from '@/lib/apiTokenService'
import { authenticateRequest } from '@/lib/apiAuthMiddleware'
import { getStorage } from '@/lib/server/storage'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ id: string }>
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// DELETE /api/tokens/[id] - Delete a specific token
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await authenticateRequest(request)
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params

    // Validate ID format
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid token ID format' },
        { status: 400 }
      )
    }

    if (!getStorage().tokens.delete(id)) {
      return NextResponse.json(
        { error: 'Token not found' },
        { status: 404 }
      )
    }

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

// GET /api/tokens/[id] - Get a specific token
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await authenticateRequest(request)
    if (!authResult.authenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params

    // Validate ID format
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid token ID format' },
        { status: 400 }
      )
    }

    const token = getStorage().tokens.get(id)
    if (!token) {
      return NextResponse.json(
        { error: 'Token not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ...token,
      isExpired: ApiTokenService.isTokenExpired(token.expires_at)
    })

  } catch (error) {
    console.error('API token GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/session — establish the local browser session.
 *
 * Sets the httpOnly session cookie and returns the local user. Only honored
 * for same-origin requests; src/middleware.ts additionally restricts Host to
 * loopback names, which blocks DNS-rebinding attempts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { localUserInfo, SESSION_COOKIE, sessionCookieValue } from '@/lib/server/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return NextResponse.json({ error: 'Cross-site session requests are not allowed' }, { status: 403 })
  }

  const response = NextResponse.json({ user: localUserInfo() })
  response.cookies.set(SESSION_COOKIE, sessionCookieValue(), {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  return response
}

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Obliq is a single-user local app. Reject any request whose Host is not a
 * loopback name, which defeats DNS-rebinding attacks from web pages.
 * Extra hosts (e.g. a LAN name) can be allowed via OBLIQ_ALLOWED_HOSTS
 * (comma-separated hostnames, without ports).
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function hostname(hostHeader: string): string {
  if (hostHeader.startsWith('[')) return hostHeader.slice(0, hostHeader.indexOf(']') + 1)
  return hostHeader.split(':')[0]
}

export function middleware(request: NextRequest) {
  const host = hostname(request.headers.get('host') || '').toLowerCase()
  const extra = (process.env.OBLIQ_ALLOWED_HOSTS || '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean)

  if (!LOOPBACK_HOSTS.has(host) && !extra.includes(host)) {
    return new NextResponse('Forbidden host', { status: 403 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

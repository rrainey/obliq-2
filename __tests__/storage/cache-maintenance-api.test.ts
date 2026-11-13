/**
 * @jest-environment node
 */
// The cache-maintenance route deletes WASM cache entries, so it must always
// ask for authentication. Before release 3.8.4 it asked only when the
// CACHE_MAINTENANCE_API_KEY environment variable was set.
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { NextRequest } from 'next/server'
import { getStorage, resetStorage } from '@/lib/server/storage'
import { SESSION_COOKIE, sessionCookieValue } from '@/lib/server/session'
import { ApiTokenService } from '@/lib/apiTokenService'
import * as route from '@/app/api/cache-maintenance/route'

let home: string

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'obliq-cache-api-'))
  process.env.OBLIQ_HOME = home
  delete process.env.CACHE_MAINTENANCE_API_KEY
  resetStorage()
  jest.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
  resetStorage()
  delete process.env.OBLIQ_HOME
  delete process.env.CACHE_MAINTENANCE_API_KEY
  fs.rmSync(home, { recursive: true, force: true })
})

function req(headers: Record<string, string> = {}, body?: unknown) {
  return new NextRequest('http://localhost:3000/api/cache-maintenance', {
    method: 'POST',
    headers: { ...headers, ...(body !== undefined && { 'content-type': 'application/json' }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('POST /api/cache-maintenance', () => {
  it('rejects a request with no credentials, also when no maintenance key is set', async () => {
    expect((await route.POST(req())).status).toBe(401)
  })

  it('rejects an x-api-key when no maintenance key is set', async () => {
    expect((await route.POST(req({ 'x-api-key': 'anything' }))).status).toBe(401)
  })

  it('rejects a wrong maintenance key', async () => {
    process.env.CACHE_MAINTENANCE_API_KEY = 'right-key'
    expect((await route.POST(req({ 'x-api-key': 'wrong-key' }))).status).toBe(401)
    expect((await route.POST(req({ 'x-api-key': 'right-ke' }))).status).toBe(401)
  })

  it('accepts the maintenance key', async () => {
    process.env.CACHE_MAINTENANCE_API_KEY = 'right-key'
    const res = await route.POST(req({ 'x-api-key': 'right-key' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, totalEvicted: 0 })
  })

  it('accepts the local session cookie', async () => {
    const res = await route.POST(req({ cookie: `${SESSION_COOKIE}=${sessionCookieValue()}` }))
    expect(res.status).toBe(200)
  })

  it('accepts an API token and rejects an unknown one', async () => {
    const { token, tokenHash } = ApiTokenService.createToken()
    getStorage().tokens.create({ name: 't', tokenHash, expiresAt: null })
    expect((await route.POST(req({ authorization: `Bearer ${token}` }))).status).toBe(200)
    const other = ApiTokenService.createToken().token
    expect((await route.POST(req({ authorization: `Bearer ${other}` }))).status).toBe(401)
  })

  it('rejects a body value that is not a number of zero or more', async () => {
    const cookie = `${SESSION_COOKIE}=${sessionCookieValue()}`
    expect((await route.POST(req({ cookie }, { maxEntries: -1 }))).status).toBe(400)
    expect((await route.POST(req({ cookie }, { daysOld: '30' }))).status).toBe(400)
    expect((await route.POST(req({ cookie }, { maxSizeMB: 100 }))).status).toBe(200)
  })
})

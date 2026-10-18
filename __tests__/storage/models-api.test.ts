/**
 * @jest-environment node
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { NextRequest } from 'next/server'
import { getStorage, resetStorage } from '@/lib/server/storage'
import { SESSION_COOKIE, sessionCookieValue } from '@/lib/server/session'
import { ApiTokenService } from '@/lib/apiTokenService'
import * as modelsRoute from '@/app/api/models/route'
import * as modelRoute from '@/app/api/models/[id]/route'
import * as versionsRoute from '@/app/api/models/[id]/versions/route'
import * as versionRoute from '@/app/api/models/[id]/versions/[version]/route'
import * as autosaveRoute from '@/app/api/models/[id]/autosave/route'
import * as linkRoute from '@/app/api/models/link/route'
import * as sessionRoute from '@/app/api/session/route'

const data = (tag: string) => ({ version: '2.1', sheets: [{ id: 'main', name: tag, blocks: [], connections: [] }] })

let home: string
let cookie: string

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'obliq-api-'))
  process.env.OBLIQ_HOME = home
  resetStorage()
  cookie = `${SESSION_COOKIE}=${sessionCookieValue()}`
})

afterEach(() => {
  resetStorage()
  delete process.env.OBLIQ_HOME
  fs.rmSync(home, { recursive: true, force: true })
})

function req(method: string, url: string, body?: unknown, headers: Record<string, string> = { cookie }) {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: { ...headers, ...(body !== undefined && { 'content-type': 'application/json' }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

const params = <P,>(p: P) => ({ params: Promise.resolve(p) })

describe('auth', () => {
  it('rejects requests without cookie or token', async () => {
    const res = await modelsRoute.GET(req('GET', '/api/models', undefined, {}), params({}))
    expect(res.status).toBe(401)
  })

  it('accepts an API token', async () => {
    const { token, tokenHash: hash } = ApiTokenService.createToken()
    getStorage().tokens.create({ name: 't', tokenHash: hash, expiresAt: null })
    const res = await modelsRoute.GET(req('GET', '/api/models', undefined, { authorization: `Bearer ${token}` }), params({}))
    expect(res.status).toBe(200)
  })

  it('rejects an expired API token', async () => {
    const { token, tokenHash: hash } = ApiTokenService.createToken()
    getStorage().tokens.create({ name: 't', tokenHash: hash, expiresAt: '2000-01-01T00:00:00.000Z' })
    const res = await modelsRoute.GET(req('GET', '/api/models', undefined, { authorization: `Bearer ${token}` }), params({}))
    expect(res.status).toBe(401)
  })

  it('session route sets a strict httpOnly cookie and refuses cross-site requests', async () => {
    const ok = await sessionRoute.GET(req('GET', '/api/session', undefined, { 'sec-fetch-site': 'same-origin' }))
    expect(ok.status).toBe(200)
    const setCookie = ok.headers.get('set-cookie') || ''
    expect(setCookie).toContain(`${SESSION_COOKIE}=${sessionCookieValue()}`)
    expect(setCookie.toLowerCase()).toContain('httponly')
    expect(setCookie.toLowerCase()).toContain('samesite=strict')
    expect(fs.statSync(path.join(home, 'local-secret')).mode & 0o777).toBe(0o600)

    const cross = await sessionRoute.GET(req('GET', '/api/session', undefined, { 'sec-fetch-site': 'cross-site' }))
    expect(cross.status).toBe(403)
  })
})

describe('/api/models', () => {
  it('create → list → get → save → versions → rename → delete', async () => {
    const created = await (await modelsRoute.POST(req('POST', '/api/models', { name: 'M', data: data('a') }), params({}))).json()
    const id = created.model.id

    const list = await (await modelsRoute.GET(req('GET', '/api/models'), params({}))).json()
    expect(list.models).toHaveLength(1)
    expect(list.models[0].availableVersions).toEqual([1])

    const current = await (await modelRoute.GET(req('GET', `/api/models/${id}`), params({ id }))).json()
    expect(current).toMatchObject({ data: data('a'), externalChange: false })

    const saved = await (await versionsRoute.POST(
      req('POST', `/api/models/${id}/versions`, { data: data('b'), baseHash: current.hash }), params({ id })
    )).json()
    expect(saved.version).toBe(2)

    // Stale baseHash → 409
    const conflict = await versionsRoute.POST(
      req('POST', `/api/models/${id}/versions`, { data: data('c'), baseHash: current.hash }), params({ id })
    )
    expect(conflict.status).toBe(409)
    expect((await conflict.json()).code).toBe('MODEL_CONFLICT')

    const v1 = await (await versionRoute.GET(req('GET', `/api/models/${id}/versions/1`), params({ id, version: '1' }))).json()
    expect(v1.data).toEqual(data('a'))
    const bad = await versionRoute.GET(req('GET', `/api/models/${id}/versions/x`), params({ id, version: 'x' }))
    expect(bad.status).toBe(400)

    const renamed = await (await modelRoute.PATCH(req('PATCH', `/api/models/${id}`, { name: 'N' }), params({ id }))).json()
    expect(renamed.model.name).toBe('N')

    expect((await modelRoute.DELETE(req('DELETE', `/api/models/${id}`), params({ id }))).status).toBe(200)
    expect((await modelRoute.GET(req('GET', `/api/models/${id}`), params({ id }))).status).toBe(404)
  })

  it('autosave put/get/delete', async () => {
    const { model } = await (await modelsRoute.POST(req('POST', '/api/models', { name: 'M', data: data('a') }), params({}))).json()
    const id = model.id
    expect((await (await autosaveRoute.GET(req('GET', `/api/models/${id}/autosave`), params({ id }))).json()).autosave).toBeNull()
    await autosaveRoute.PUT(req('PUT', `/api/models/${id}/autosave`, { data: data('draft') }), params({ id }))
    const got = await (await autosaveRoute.GET(req('GET', `/api/models/${id}/autosave`), params({ id }))).json()
    expect(got.autosave.data).toEqual(data('draft'))
    await autosaveRoute.DELETE(req('DELETE', `/api/models/${id}/autosave`), params({ id }))
    expect((await (await autosaveRoute.GET(req('GET', `/api/models/${id}/autosave`), params({ id }))).json()).autosave).toBeNull()
  })

  it('validates request bodies', async () => {
    expect((await modelsRoute.POST(req('POST', '/api/models', { name: '' , data: data('a') }), params({}))).status).toBe(400)
    expect((await modelsRoute.POST(req('POST', '/api/models', { name: 'x' }), params({}))).status).toBe(400)
  })

  it('links an external file', async () => {
    const ext = path.join(home, 'plant.json')
    fs.writeFileSync(ext, JSON.stringify({ name: 'Plant', data: data('a') }))
    const res = await (await linkRoute.POST(req('POST', '/api/models/link', { path: ext }), params({}))).json()
    expect(res.model).toMatchObject({ name: 'Plant', storage_kind: 'linked', file_path: ext })
    const missing = await linkRoute.POST(req('POST', '/api/models/link', { path: path.join(home, 'nope.json') }), params({}))
    expect(missing.status).toBe(422)
  })
})

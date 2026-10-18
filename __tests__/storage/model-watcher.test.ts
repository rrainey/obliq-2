/**
 * @jest-environment node
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { NextRequest } from 'next/server'
import { getStorage, resetStorage } from '@/lib/server/storage'
import { getModelWatcher, type ModelFileEvent } from '@/lib/server/modelWatcher'
import { sha256 } from '@/lib/server/storage/fileIO'
import { SESSION_COOKIE, sessionCookieValue } from '@/lib/server/session'
import * as eventsRoute from '@/app/api/models/[id]/events/route'

const data = (tag: string) => ({ version: '2.1', sheets: [{ id: 'main', name: tag, blocks: [], connections: [] }] })

let home: string

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'obliq-watch-'))
  process.env.OBLIQ_HOME = home
  resetStorage()
})

afterEach(() => {
  resetStorage()
  delete process.env.OBLIQ_HOME
  fs.rmSync(home, { recursive: true, force: true })
})

/** Collect watcher events for a model; `next(pred)` resolves with the first match. */
function collect(modelId: string) {
  const events: ModelFileEvent[] = []
  const waiters: Array<{ pred: (e: ModelFileEvent) => boolean; resolve: (e: ModelFileEvent) => void }> = []
  const unsubscribe = getModelWatcher().subscribe(modelId, event => {
    events.push(event)
    for (const w of [...waiters]) {
      if (w.pred(event)) {
        waiters.splice(waiters.indexOf(w), 1)
        w.resolve(event)
      }
    }
  })
  const next = (pred: (e: ModelFileEvent) => boolean, timeoutMs = 3000) =>
    new Promise<ModelFileEvent>((resolve, reject) => {
      const found = events.find(pred)
      if (found) return resolve(found)
      const timer = setTimeout(() => reject(new Error(`timed out; saw ${JSON.stringify(events)}`)), timeoutMs)
      waiters.push({ pred, resolve: e => (clearTimeout(timer), resolve(e)) })
    })
  return { events, next, unsubscribe }
}

describe('modelWatcher', () => {
  it('reports external edits as changed, app writes as ok, and deletion as missing', async () => {
    const ext = path.join(home, 'ext', 'plant.json')
    fs.mkdirSync(path.dirname(ext), { recursive: true })
    fs.writeFileSync(ext, JSON.stringify({ name: 'P', data: data('a') }))
    const { id } = getStorage().models.link(ext)
    const watch = collect(id)

    const external = JSON.stringify({ name: 'P', data: data('external') })
    fs.writeFileSync(ext, external)
    const changed = await watch.next(e => e.status === 'changed')
    expect(changed).toMatchObject({ status: 'changed', hash: sha256(external) })

    // The app writing (e.g. Model Builder API) updates the recorded hash → 'ok' with the new hash
    const saved = getStorage().models.writeInPlace(id, data('api'))
    const ok = await watch.next(e => e.status === 'ok' && e.hash === saved.hash)
    expect(ok.status).toBe('ok')

    fs.rmSync(ext)
    await watch.next(e => e.status === 'missing')
    watch.unsubscribe()
  })

  it('stops watching after the last subscriber leaves', async () => {
    const rec = getStorage().models.create({ name: 'M', data: data('a') })
    const watch = collect(rec.id)
    watch.unsubscribe()
    fs.writeFileSync(getStorage().paths.managedModelFile(rec.id), JSON.stringify({ name: 'M', data: data('b') }))
    await new Promise(r => setTimeout(r, 500))
    expect(watch.events).toEqual([])
  })
})

describe('GET /api/models/:id/events', () => {
  it('requires auth and streams the initial status', async () => {
    const rec = getStorage().models.create({ name: 'M', data: data('a') })
    const params = { params: Promise.resolve({ id: rec.id }) }

    const unauth = await eventsRoute.GET(new NextRequest(`http://localhost/api/models/${rec.id}/events`), params)
    expect(unauth.status).toBe(401)

    const controller = new AbortController()
    const res = await eventsRoute.GET(
      new NextRequest(`http://localhost/api/models/${rec.id}/events`, {
        headers: { cookie: `${SESSION_COOKIE}=${sessionCookieValue()}` },
        signal: controller.signal,
      }),
      params
    )
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    const reader = res.body!.getReader()
    const { value } = await reader.read()
    const text = new TextDecoder().decode(value)
    expect(text).toMatch(/^event: status\ndata: /)
    expect(JSON.parse(text.split('data: ')[1])).toMatchObject({ status: 'ok', hash: rec.file_hash })
    controller.abort()
    await reader.cancel()
  })

  it('404s for an unknown model', async () => {
    const res = await eventsRoute.GET(
      new NextRequest('http://localhost/api/models/nope/events', {
        headers: { cookie: `${SESSION_COOKIE}=${sessionCookieValue()}` },
      }),
      { params: Promise.resolve({ id: 'nope' }) }
    )
    expect(res.status).toBe(404)
  })
})

/**
 * @jest-environment node
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  openStorage,
  parseModelDocument,
  ModelConflictError,
  ModelFileMissingError,
  InvalidModelFileError,
  TokenNameConflictError,
  type Storage,
} from '@/lib/server/storage'
import { FileCacheManager } from '@/lib/wasm/cache/FileCacheManager'

const modelData = (tag: string) => ({
  version: '2.1',
  sheets: [{ id: 'main', name: 'Main', blocks: [{ id: tag }], connections: [], extents: { width: 1, height: 1 } }],
  parameters: [],
})

let home: string
let storage: Storage

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'obliq-storage-'))
  storage = openStorage(home)
})

afterEach(() => {
  storage.db.close()
  fs.rmSync(home, { recursive: true, force: true })
})

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'))

describe('parseModelDocument', () => {
  it('accepts wrapper and bare forms', () => {
    expect(parseModelDocument(JSON.stringify({ name: 'A', data: modelData('x') }))).toMatchObject({ name: 'A', format: 'wrapper' })
    expect(parseModelDocument(JSON.stringify(modelData('x')))).toMatchObject({ name: null, format: 'bare' })
  })

  it('rejects other shapes', () => {
    expect(() => parseModelDocument('[]')).toThrow(InvalidModelFileError)
    expect(() => parseModelDocument('{"foo":1}')).toThrow(InvalidModelFileError)
    expect(() => parseModelDocument('{')).toThrow(InvalidModelFileError)
  })
})

describe('ModelRepository (managed)', () => {
  it('creates model.json in wrapper form with an initial version', () => {
    const rec = storage.models.create({ name: 'Plant', data: modelData('a') })
    expect(rec.latest_version).toBe(1)
    const file = storage.paths.managedModelFile(rec.id)
    expect(readJson(file)).toEqual({ name: 'Plant', data: modelData('a') })
    expect(fs.readFileSync(file, 'utf8').endsWith('}\n')).toBe(true)
    expect(fs.existsSync(storage.paths.versionFile(rec.id, 1))).toBe(true)
    expect(storage.models.listVersions(rec.id).map(v => v.version)).toEqual([1])
  })

  it('saveSnapshot writes current + new version and clears autosave', () => {
    const rec = storage.models.create({ name: 'M', data: modelData('a') })
    storage.models.putAutosave(rec.id, modelData('draft'))
    expect(storage.models.getAutosave(rec.id)?.data).toEqual(modelData('draft'))

    const res = storage.models.saveSnapshot(rec.id, modelData('b'))
    expect(res.version).toBe(2)
    expect(storage.models.readCurrent(rec.id).data).toEqual(modelData('b'))
    expect(storage.models.getVersion(rec.id, 1)).toEqual(modelData('a'))
    expect(storage.models.getVersion(rec.id, 2)).toEqual(modelData('b'))
    expect(storage.models.getAutosave(rec.id)).toBeNull()
    expect(storage.models.get(rec.id)!.autosave_at).toBeNull()
  })

  it('writeInPlace does not create versions unless checkpointed', () => {
    const rec = storage.models.create({ name: 'M', data: modelData('a') })
    const r1 = storage.models.writeInPlace(rec.id, modelData('b'))
    expect(r1.version).toBeNull()
    expect(storage.models.get(rec.id)!.latest_version).toBe(1)
    const r2 = storage.models.writeInPlace(rec.id, modelData('c'), { checkpoint: true })
    expect(r2.version).toBe(2)
  })

  it('rejects writes with a stale baseHash', () => {
    const rec = storage.models.create({ name: 'M', data: modelData('a') })
    const { hash } = storage.models.readCurrent(rec.id)
    storage.models.writeInPlace(rec.id, modelData('b'), { baseHash: hash })
    expect(() => storage.models.saveSnapshot(rec.id, modelData('c'), { baseHash: hash })).toThrow(ModelConflictError)
  })

  it('records external edits as a version before reading or overwriting', () => {
    const rec = storage.models.create({ name: 'M', data: modelData('a') })
    const file = storage.paths.managedModelFile(rec.id)
    fs.writeFileSync(file, JSON.stringify({ name: 'M', data: modelData('ext') }))
    expect(storage.models.checkFileStatus(rec.id).status).toBe('changed')

    const cur = storage.models.readCurrent(rec.id)
    expect(cur.externalChange).toBe(true)
    expect(cur.data).toEqual(modelData('ext'))
    const versions = storage.models.listVersions(rec.id)
    expect(versions.map(v => [v.version, v.note])).toEqual([[1, null], [2, 'external']])
    expect(storage.models.checkFileStatus(rec.id).status).toBe('ok')

    // Overwrite without reading first: the external content still gets captured.
    fs.writeFileSync(file, JSON.stringify({ name: 'M', data: modelData('ext2') }))
    storage.models.saveSnapshot(rec.id, modelData('mine'))
    const notes = storage.models.listVersions(rec.id).map(v => v.note)
    expect(notes).toEqual([null, 'external', 'external', null])
    expect(storage.models.getVersion(rec.id, 3)).toEqual(modelData('ext2'))
  })

  it('rename updates DB and wrapper; duplicate and delete', () => {
    const rec = storage.models.create({ name: 'Old', data: modelData('a') })
    storage.models.rename(rec.id, 'New')
    expect(readJson(storage.paths.managedModelFile(rec.id)).name).toBe('New')
    expect(storage.models.listVersions(rec.id)).toHaveLength(1)

    const copy = storage.models.duplicate(rec.id, 'Copy')
    expect(copy.id).not.toBe(rec.id)
    expect(storage.models.readCurrent(copy.id).data).toEqual(modelData('a'))

    storage.models.delete(rec.id)
    expect(storage.models.get(rec.id)).toBeNull()
    expect(fs.existsSync(storage.paths.modelDir(rec.id))).toBe(false)
    expect(storage.models.list().map(m => m.id)).toEqual([copy.id])
  })
})

describe('ModelRepository (linked)', () => {
  let ext: string
  beforeEach(() => {
    ext = path.join(home, 'external', 'plant.json')
    fs.mkdirSync(path.dirname(ext), { recursive: true })
  })

  it('links a wrapper file, writes back in place, and leaves it on delete', () => {
    fs.writeFileSync(ext, JSON.stringify({ name: 'Saturn', data: modelData('a') }, null, 2) + '\n')
    const rec = storage.models.link(ext)
    expect(rec).toMatchObject({ name: 'Saturn', storage_kind: 'linked', file_path: ext, file_format: 'wrapper', latest_version: 1 })
    expect(storage.models.link(ext).id).toBe(rec.id)
    expect(fs.existsSync(storage.paths.managedModelFile(rec.id))).toBe(false)

    storage.models.saveSnapshot(rec.id, modelData('b'))
    expect(readJson(ext)).toEqual({ name: 'Saturn', data: modelData('b') })

    storage.models.delete(rec.id)
    expect(fs.existsSync(ext)).toBe(true)
  })

  it('preserves bare format on write', () => {
    fs.writeFileSync(ext, JSON.stringify(modelData('a')))
    const rec = storage.models.link(ext, { name: 'Bare' })
    expect(rec.file_format).toBe('bare')
    storage.models.writeInPlace(rec.id, modelData('b'))
    expect(readJson(ext)).toEqual(modelData('b'))
    // Versions are always stored in wrapper form.
    expect(readJson(storage.paths.versionFile(rec.id, 1))).toEqual({ name: 'Bare', data: modelData('a') })
  })

  it('reports a missing file and refuses to recreate it', () => {
    fs.writeFileSync(ext, JSON.stringify({ name: 'X', data: modelData('a') }))
    const rec = storage.models.link(ext)
    fs.rmSync(ext)
    expect(storage.models.checkFileStatus(rec.id).status).toBe('missing')
    expect(() => storage.models.readCurrent(rec.id)).toThrow(ModelFileMissingError)
    expect(() => storage.models.writeInPlace(rec.id, modelData('b'))).toThrow(ModelFileMissingError)
  })

  it('unlink copies the content into the managed tree', () => {
    fs.writeFileSync(ext, JSON.stringify({ name: 'X', data: modelData('a') }))
    const rec = storage.models.link(ext)
    const un = storage.models.unlink(rec.id)
    expect(un).toMatchObject({ storage_kind: 'managed', file_path: null })
    expect(readJson(storage.paths.managedModelFile(rec.id)).data).toEqual(modelData('a'))
  })
})

describe('ModelRepository.importModel', () => {
  it('imports versions and autosave idempotently', () => {
    const opts = {
      id: '11111111-2222-3333-4444-555555555555',
      name: 'Imported',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-02-01T00:00:00.000Z',
      versions: [
        { version: 3, data: modelData('v3'), createdAt: '2025-01-03T00:00:00.000Z' },
        { version: 1, data: modelData('v1'), createdAt: '2025-01-01T00:00:00.000Z' },
      ],
      autosave: { data: modelData('auto'), savedAt: '2025-02-01T00:00:00.000Z' },
    }
    const rec = storage.models.importModel(opts)!
    expect(rec.latest_version).toBe(3)
    expect(storage.models.readCurrent(rec.id)).toMatchObject({ data: modelData('v3'), externalChange: false })
    expect(storage.models.listVersions(rec.id).map(v => v.version)).toEqual([1, 3])
    expect(storage.models.getAutosave(rec.id)?.data).toEqual(modelData('auto'))
    expect(storage.models.importModel(opts)).toBeNull()
    // New saves continue after the highest imported version.
    expect(storage.models.saveSnapshot(rec.id, modelData('v4')).version).toBe(4)
  })
})

describe('TokenRepository', () => {
  it('creates, finds, touches, and deletes tokens', () => {
    const t = storage.tokens.create({ name: 'mcp', tokenHash: 'h1', expiresAt: null })
    expect(() => storage.tokens.create({ name: 'mcp', tokenHash: 'h2', expiresAt: null })).toThrow(TokenNameConflictError)
    expect(storage.tokens.findByHash('h1')?.id).toBe(t.id)
    storage.tokens.touch(t.id)
    expect(storage.tokens.get(t.id)?.last_used_at).not.toBeNull()
    storage.tokens.create({ name: 'old', tokenHash: 'h3', expiresAt: '2000-01-01T00:00:00.000Z' })
    expect(storage.tokens.deleteExpired()).toBe(1)
    expect(storage.tokens.delete(t.id)).toBe(true)
    expect(storage.tokens.list()).toEqual([])
  })
})

describe('FileCacheManager', () => {
  const meta = { modelHash: 'mh', compilationTime: 100, optimizationLevel: 'O2', wasmSize: 4, jsSize: 2, blockCount: 3 }

  it('stores, retrieves, evicts', async () => {
    const cache = new FileCacheManager(storage)
    await cache.store('key-a', 'm1', Buffer.from('wasm'), Buffer.from('js'), meta)
    expect(await cache.exists('key-a')).toBe(true)
    const got = await cache.get('key-a')
    expect(got?.wasmData.toString()).toBe('wasm')
    expect(got?.metadata).toEqual(meta)

    await cache.store('key-b', 'm1', Buffer.from('wasm'), Buffer.from('js'), meta)
    await cache.logCompilationMetric({ modelId: 'm1', cacheHit: true, blockCount: 3, optimizationLevel: 'O2' })
    const stats = await cache.getCacheStats()
    expect(stats).toMatchObject({ totalEntries: 2, cacheHitRate: 1 })

    expect(await cache.evictLRU(1, 500)).toBe(1)
    expect(await cache.exists('key-a')).toBe(false)
    expect(fs.existsSync(storage.paths.wasmCacheEntryDir('key-a'))).toBe(false)
  })

  it('drops metadata whose files have vanished', async () => {
    const cache = new FileCacheManager(storage)
    await cache.store('key-c', 'm1', Buffer.from('w'), Buffer.from('j'), meta)
    fs.rmSync(storage.paths.wasmCacheEntryDir('key-c'), { recursive: true })
    expect(await cache.get('key-c')).toBeNull()
    expect(await cache.exists('key-c')).toBe(false)
  })

  it('rejects path-escaping keys', async () => {
    const cache = new FileCacheManager(storage)
    await expect(cache.store('../evil', 'm', Buffer.from(''), Buffer.from(''), meta)).rejects.toThrow(/Invalid cache key/)
  })
})

describe('storage error matching', () => {
  it('matches errors by name, so copies of the class from another bundle still match', () => {
    const foreign = new Error('x')
    foreign.name = 'ModelConflictError'
    expect(foreign instanceof ModelConflictError).toBe(true)
    expect(foreign instanceof ModelFileMissingError).toBe(false)
    expect(new ModelConflictError('id', 'h') instanceof ModelConflictError).toBe(true)
    expect(new Error('plain') instanceof ModelConflictError).toBe(false)
  })
})

describe('autosave identical to the saved model', () => {
  it('is not stored, and clears an existing autosave', () => {
    const rec = storage.models.create({ name: 'M', data: modelData('a') })
    storage.models.putAutosave(rec.id, modelData('draft'))
    // e.g. an autosave that raced a Save: same content as model.json
    storage.models.putAutosave(rec.id, modelData('a'))
    expect(fs.existsSync(storage.paths.autosaveFile(rec.id))).toBe(false)
    expect(storage.models.get(rec.id)!.autosave_at).toBeNull()
  })

  it('found on load is discarded instead of offered for recovery', () => {
    const rec = storage.models.create({ name: 'M', data: modelData('a') })
    // Written directly, as an older build could have left it
    fs.writeFileSync(
      storage.paths.autosaveFile(rec.id),
      JSON.stringify({ name: 'M', savedAt: '2026-01-01T00:00:00.000Z', data: modelData('a') })
    )
    expect(storage.models.getAutosave(rec.id)).toBeNull()
    expect(fs.existsSync(storage.paths.autosaveFile(rec.id))).toBe(false)
    // A real difference is still kept
    storage.models.putAutosave(rec.id, modelData('b'))
    expect(storage.models.getAutosave(rec.id)?.data).toEqual(modelData('b'))
  })
})

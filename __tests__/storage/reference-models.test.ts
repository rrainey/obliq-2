/**
 * @jest-environment node
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  openStorage,
  readReferenceModelsRecord,
  resolveReferenceModelsDir,
  type ReferenceModelsRecord,
} from '@/lib/server/storage'
import { parseModelImport } from '@/lib/modelImport'

const model = (blockId: string) => ({
  version: '2.2',
  sheets: [{ id: 'main', name: 'Main', blocks: [{ id: blockId, type: 'clock', name: 'C', position: { x: 0, y: 0 }, parameters: {} }], connections: [], extents: { width: 100, height: 100 } }],
})

let tmp: string
let home: string
let refDir: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'obliq-ref-'))
  home = path.join(tmp, 'home')
  refDir = path.join(tmp, 'reference-models')
  fs.mkdirSync(refDir)
  fs.writeFileSync(path.join(refDir, 'b-second.json'), JSON.stringify({ name: 'Second', data: model('b') }))
  fs.writeFileSync(path.join(refDir, 'a-first.json'), JSON.stringify(model('a'))) // bare form, name from file
  fs.writeFileSync(path.join(refDir, 'README.md'), '# not a model')
})

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('reference model seeding', () => {
  it('imports every JSON model into a new store, in file-name order', () => {
    const s = openStorage(home, { referenceModelsDir: refDir })
    const names = s.models.list().map(m => m.name).sort()
    expect(names).toEqual(['Second', 'a-first'])
    const record = readReferenceModelsRecord(s.db) as ReferenceModelsRecord
    expect(record.models.map(m => m.file)).toEqual(['a-first.json', 'b-second.json'])
    expect(record.errors).toEqual([])
    // Stored as ordinary managed models with an initial version, normalized like UI import
    const first = s.models.require(record.models[0]!.id)
    expect(first.storage_kind).toBe('managed')
    expect(s.models.listVersions(first.id)).toHaveLength(1)
    expect(s.models.readCurrent(first.id).data.globalSettings).toMatchObject({ integrationAlgorithm: 'rk4' })
    s.db.close()
  })

  it('seeds only once: reopening does not re-import, and deleted models stay deleted', () => {
    let s = openStorage(home, { referenceModelsDir: refDir })
    const [victim] = s.models.list()
    s.models.delete(victim!.id)
    s.db.close()
    s = openStorage(home, { referenceModelsDir: refDir })
    expect(s.models.list()).toHaveLength(1)
    s.db.close()
  })

  it('never seeds an existing store', () => {
    let s = openStorage(home, { referenceModelsDir: null })
    s.models.create({ name: 'Mine', data: model('m') })
    s.db.close()
    s = openStorage(home, { referenceModelsDir: refDir })
    expect(s.models.list().map(m => m.name)).toEqual(['Mine'])
    s.db.close()
  })

  it('records an empty seeding when disabled or when the folder is missing', () => {
    let s = openStorage(home, { referenceModelsDir: null })
    expect(s.models.list()).toHaveLength(0)
    expect(readReferenceModelsRecord(s.db)).toMatchObject({ dir: null, models: [] })
    s.db.close()
    const home2 = path.join(tmp, 'home2')
    s = openStorage(home2, { referenceModelsDir: path.join(tmp, 'nope') })
    expect(s.models.list()).toHaveLength(0)
    s.db.close()
  })

  it('retries when the first open was interrupted before seeding finished', () => {
    let s = openStorage(home, { referenceModelsDir: null })
    s.db.prepare("UPDATE meta SET value = 'pending' WHERE key = 'reference_models'").run()
    s.db.close()
    s = openStorage(home, { referenceModelsDir: refDir })
    expect(s.models.list()).toHaveLength(2)
    s.db.close()
  })

  it('skips a malformed file and imports the rest', () => {
    fs.writeFileSync(path.join(refDir, 'c-broken.json'), '{ not json')
    const s = openStorage(home, { referenceModelsDir: refDir })
    expect(s.models.list()).toHaveLength(2)
    const record = readReferenceModelsRecord(s.db) as ReferenceModelsRecord
    expect(record.errors).toHaveLength(1)
    expect(record.errors[0]).toMatch(/^c-broken\.json: /)
    s.db.close()
  })

  it('resolves the folder from OBLIQ_REFERENCE_MODELS_DIR, empty disables', () => {
    expect(resolveReferenceModelsDir({ OBLIQ_REFERENCE_MODELS_DIR: '' })).toBeNull()
    expect(resolveReferenceModelsDir({ OBLIQ_REFERENCE_MODELS_DIR: '/x/y' })).toBe(path.resolve('/x/y'))
    expect(resolveReferenceModelsDir({})).toBe(path.join(process.cwd(), 'reference-models'))
  })
})

describe('shipped reference models', () => {
  const dir = path.join(process.cwd(), 'reference-models')
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : []

  it('the folder exists with a README', () => {
    expect(fs.existsSync(path.join(dir, 'README.md'))).toBe(true)
  })

  it.each(files.length ? files : ['(none yet)'])('%s parses as an importable {name, data} model', file => {
    if (file === '(none yet)') return
    const text = fs.readFileSync(path.join(dir, file), 'utf8')
    const payload = parseModelImport(text, { fileName: file })
    expect(JSON.parse(text).name).toBe(payload.name) // a real name, not one derived from the file
    expect(Array.isArray(payload.data.sheets)).toBe(true)
  })
})

import {
  parseModelImport,
  nameFromFileName,
  ModelImportError,
  normalizeModelData,
} from '@/lib/modelImport'
import * as fs from 'fs'
import * as path from 'path'

describe('modelImport', () => {
  test('nameFromFileName strips path and extension', () => {
    expect(nameFromFileName('docs/sample-models/saturn/saturn-8.1-gravity-ballistics.json')).toBe(
      'saturn-8.1-gravity-ballistics'
    )
  })

  test('parses export/fixture wrapper', () => {
    const raw = {
      name: 'demo',
      data: {
        version: '2.2',
        sheets: [
          {
            id: 'main',
            name: 'Main',
            blocks: [{ id: 'b1', type: 'source', name: 's', position: { x: 0, y: 0 }, parameters: {} }],
            connections: [],
          },
        ],
        parameters: [{ name: 'mu', dataType: 'double', defaultValue: '1' }],
        dataStores: [],
        globalSettings: {
          simulationTimeStep: 0.1,
          simulationDuration: 50,
          integrationAlgorithm: 'rk4',
        },
      },
    }

    const result = parseModelImport(JSON.stringify(raw))
    expect(result.name).toBe('demo')
    expect(result.data.sheets).toHaveLength(1)
    expect(result.data.parameters).toHaveLength(1)
    expect((result.data.globalSettings as any).simulationTimeStep).toBe(0.1)
  })

  test('parses bare data object and uses file name for name', () => {
    const bare = {
      version: '2.0',
      sheets: [{ id: 'main', name: 'Main', blocks: [], connections: [] }],
    }
    const result = parseModelImport(bare, { fileName: 'my-model.json' })
    expect(result.name).toBe('my-model')
    expect(result.data.version).toBe('2.0')
    expect(result.data.parameters).toEqual([])
    expect(result.data.dataStores).toEqual([])
  })

  test('rejects invalid JSON', () => {
    expect(() => parseModelImport('{not json')).toThrow(ModelImportError)
  })

  test('rejects missing sheets', () => {
    expect(() => parseModelImport({ name: 'x', data: { version: '2.2' } })).toThrow(ModelImportError)
  })

  test('rejects empty sheets', () => {
    expect(() =>
      normalizeModelData({ sheets: [] })
    ).toThrow(ModelImportError)
  })

  test('imports multi-sheet export-shaped JSON', () => {
    const raw = {
      name: 'multi-sheet-demo',
      data: {
        version: '2.2',
        sheets: [
          {
            id: 'main',
            name: 'Main',
            blocks: [
              {
                id: 's1',
                type: 'source',
                name: 'const',
                position: { x: 0, y: 0 },
                parameters: { dataType: 'double', signalType: 'constant', value: 1 },
              },
            ],
            connections: [],
          },
          {
            id: 'sheet2',
            name: 'Other',
            blocks: [],
            connections: [],
          },
        ],
        parameters: [],
        dataStores: [],
        globalSettings: {
          simulationTimeStep: 0.01,
          simulationDuration: 1,
          integrationAlgorithm: 'rk4',
        },
      },
    }
    const result = parseModelImport(JSON.stringify(raw))
    expect(result.name).toBe('multi-sheet-demo')
    expect(result.data.sheets).toHaveLength(2)
  })

  test('imports sample models under docs/sample-models/saturn when present', () => {
    const dir = path.join(__dirname, '../docs/sample-models/saturn')
    if (!fs.existsSync(dir)) {
      return // optional local fixtures; not required in core repo checkout
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    if (files.length === 0) return

    for (const file of files) {
      const text = fs.readFileSync(path.join(dir, file), 'utf8')
      const result = parseModelImport(text, { fileName: file })
      expect(result.name.length).toBeGreaterThan(0)
      expect(Array.isArray(result.data.sheets)).toBe(true)
      expect((result.data.sheets as unknown[]).length).toBeGreaterThan(0)
    }
  })
})

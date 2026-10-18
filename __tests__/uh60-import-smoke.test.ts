import * as fs from 'fs'
import { parseModelImport } from '@/lib/modelImport'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { ModelFlattener } from '@/lib/codegen/ModelFlattener'

describe('UH60_main_rotor.obliq.json import smoke', () => {
  const raw = fs.readFileSync('/home/riley/src/uh60-obliq/UH60_main_rotor.obliq.json', 'utf8')
  const imported = parseModelImport(raw)

  test('imports with lookup parameters', () => {
    expect(imported.name).toBe('UH60_main_rotor')
    expect(imported.data.sheets[0].blocks.length).toBeGreaterThan(20)
    const names = (imported.data.parameters || []).map((p: any) => p.name)
    expect(names).toEqual(expect.arrayContaining(['LDMR_LO', 'CDMRLO', 'AFTFMR_LO']))
  })

  test('flattens for_iterator as segregated and lookups keep *Param', () => {
    const flat = new ModelFlattener().flattenModel(imported.data.sheets as any, 'uh60')
    expect(flat.model.segregatedSubsystems?.some(s => s.forIterator)).toBe(true)
    const ldmr = flat.model.blocks.find(b => /LDMR_Low/.test(b.flattenedName || ''))
    expect(ldmr?.block.parameters?.inputValuesParam).toBe('LDMR_LO')
  })

  test('codegen emits tables, memory latch, for-iterator', () => {
    const gen = new CodeGenerator({ modelName: 'uh60_main_rotor' })
    const result = gen.generate(imported.data.sheets as any, imported.data.parameters || [])
    expect(result.header).toMatch(/CDMRLO/)
    expect(result.header).toMatch(/LDMR_LO/)
    expect(result.source).toMatch(/update_memory_states/)
    expect(result.source).toMatch(/For Iterator/)
    expect(result.subsystemFiles.length).toBeGreaterThan(0)
    const errors = (result.warnings || []).filter(w => w.startsWith('ERROR'))
    expect(errors.filter(e => /LOOKUP_TOO_SMALL/.test(e))).toEqual([])
  })
})

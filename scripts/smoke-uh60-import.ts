import * as fs from 'fs'
import { parseModelImport } from '../src/lib/modelImport'
import { CodeGenerator } from '../src/lib/codegen/CodeGenerator'
import { ModelFlattener } from '../src/lib/codegen/ModelFlattener'

const raw = fs.readFileSync(
  '/home/riley/src/uh60-obliq/UH60_main_rotor.obliq.json',
  'utf8'
)
const imported = parseModelImport(raw)
console.log('import OK', imported.name, 'params', imported.data.parameters?.length)

const flat = new ModelFlattener().flattenModel(
  imported.data.sheets as any,
  'uh60_main_rotor'
)
console.log(
  'segregated',
  flat.model.segregatedSubsystems?.map(
    s => s.subsystemName + (s.forIterator ? '(FI)' : '')
  )
)
const ldmr = flat.model.blocks.find(b => /LDMR_Low/.test(b.flattenedName || ''))
console.log('LDMR params', ldmr?.block.parameters)

const gen = new CodeGenerator({ modelName: 'uh60_main_rotor' })
const result = gen.generate(
  imported.data.sheets as any,
  imported.data.parameters || []
)
console.log('header', result.header.length, 'source', (result.source || '').length)
console.log(
  'subsystemFiles',
  result.subsystemFiles?.map(f => f.subsystemName)
)
console.log(
  'errors',
  result.warnings?.filter(w => w.startsWith('ERROR')).slice(0, 10)
)
console.log('forIter', /For Iterator|iteration_index/.test(result.source || ''))
console.log('memory', /update_memory_states/.test(result.source || ''))
console.log('CDMRLO', /CDMRLO/.test(result.header))
console.log('LDMR_LO', /LDMR_LO/.test(result.header))

/**
 * A sheet label fed by a subsystem output that is itself driven by a sheet
 * label inside the subsystem (a label chain): resolves to the original source
 * and leaves no wire to the removed label sink.
 */
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { cleanupNativeDir, compileAndRunNative } from '../support/nativeCgen'
import { b, sheet, w } from '../support/modelRefFixtures'

jest.setTimeout(120000)

const sub = b('sub', 'subsystem', 'Sub', {
  inputPorts: ['a'],
  outputPorts: ['b'],
  sheets: [
    sheet('s1', [b('si', 'input_port', 'a', { portName: 'a' }), b('itag', 'sheet_label_sink', 'ITag', { signalName: 'y' })], [w('s1w', 'si', 'itag')]),
    sheet('s2', [b('ifrom', 'sheet_label_source', 'IFrom', { signalName: 'y' }), b('so', 'output_port', 'b', { portName: 'b' })], [w('s2w', 'ifrom', 'so')]),
  ],
})
const sheets: any[] = [
  sheet('main', [b('k', 'source', 'K', { value: 7 }), sub, b('tag', 'sheet_label_sink', 'Tag', { signalName: 'x' })], [w('w1', 'k', 'sub'), w('w2', 'sub', 'tag')]),
  sheet('t', [b('from', 'sheet_label_source', 'From', { signalName: 'x' }), b('o', 'output_port', 'Out', { portName: 'Out' })], [w('w3', 'from', 'o')]),
]

test('a label chain through a subsystem output resolves without dangling wires', () => {
  const r = new CodeGenerator({ modelName: 'chain' }).generate(sheets)
  expect(r.warnings.filter(x => /INVALID_CONNECTION/.test(x))).toEqual([])
  const run = compileAndRunNative({
    modelName: 'chain',
    sheets,
    smokeMainBody: '  chain_seed_from_inputs(&model);\n  chain_step(&model);\n  printf("%g\\n", model.outputs.Out);\n  return 0;\n',
  })
  try {
    expect(Number(run.stdout.trim())).toBe(7)
  } finally {
    cleanupNativeDir(run.outDir)
  }
})

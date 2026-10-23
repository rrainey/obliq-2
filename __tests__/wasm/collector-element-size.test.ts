/**
 * The WASM wrapper reports each logger/display's element size, which the
 * results reader uses to unpack samples. A vector fed through a sheet label
 * (directly, or via a subsystem output that is itself fed by a label inside
 * the subsystem) must report its width, not 1, or the plot shows the
 * elements interleaved as one zig-zag line.
 */
import { WasmCodeGenerator } from '@/lib/wasm/codegen/WasmCodeGenerator'
import { b, sheet, w } from '../support/modelRefFixtures'

const elementSizes = (wrapper: string): number[] => {
  const fn = wrapper.slice(wrapper.indexOf('int wasm_get_element_size'))
  const body = fn.slice(0, fn.indexOf('\n}\n'))
  return [...body.matchAll(/case (\d+): return (\d+);/g)].map(m => Number(m[2]))
}

const vec = () => b('v', 'source', 'Vec', { signalType: 'constant', value: [1, 2, 3], dataType: 'double[3]' })

test('a vector display fed by a sheet label reports 3 elements', () => {
  const sheets: any[] = [
    sheet('main', [vec(), b('tag', 'sheet_label_sink', 'Tag', { signalName: 'x' })], [w('w1', 'v', 'tag')]),
    sheet('t', [b('from', 'sheet_label_source', 'From', { signalName: 'x' }), b('d', 'signal_display', 'Scope', {})], [w('w2', 'from', 'd')]),
  ]
  const r = new WasmCodeGenerator({ modelName: 'm' }).generateWasm(sheets, [])
  expect(elementSizes(r.wasmWrapper)).toEqual([3])
})

test('... and through a subsystem output fed by a label inside it', () => {
  const sub = b('sub', 'subsystem', 'Sub', {
    inputPorts: [],
    outputPorts: ['y'],
    sheets: [
      sheet('s1', [vec(), b('itag', 'sheet_label_sink', 'ITag', { signalName: 'inner' })], [w('s1w', 'v', 'itag')]),
      sheet('s2', [b('ifrom', 'sheet_label_source', 'IFrom', { signalName: 'inner' }), b('o', 'output_port', 'y', { portName: 'y' })], [w('s2w', 'ifrom', 'o')]),
    ],
  })
  const sheets: any[] = [
    sheet('main', [sub, b('tag', 'sheet_label_sink', 'Tag', { signalName: 'x' }), b('d0', 'signal_display', 'Direct', {})], [w('w1', 'sub', 'tag'), w('w0', 'sub', 'd0')]),
    sheet('t', [b('from', 'sheet_label_source', 'From', { signalName: 'x' }), b('d', 'signal_display', 'Scope', {})], [w('w2', 'from', 'd')]),
  ]
  const r = new WasmCodeGenerator({ modelName: 'm' }).generateWasm(sheets, [])
  expect(elementSizes(r.wasmWrapper)).toEqual([3, 3])
})

test('a single-output conversion block (quaternion to Euler) through a label reports 3 elements', () => {
  const q = b('q', 'source', 'Quat', { signalType: 'constant', value: [[1], [0], [0], [0]], dataType: 'double[4][1]' })
  const conv = b('c', 'orientation_conversion', 'ToEuler', { conversionType: 'quat_to_euler' })
  const sheets: any[] = [
    sheet('main', [q, conv, b('tag', 'sheet_label_sink', 'Tag', { signalName: 'e' })], [w('w1', 'q', 'c'), w('w2', 'c', 'tag')]),
    sheet('t', [b('from', 'sheet_label_source', 'From', { signalName: 'e' }), b('d', 'signal_display', 'Attitude', {})], [w('w3', 'from', 'd')]),
  ]
  const r = new WasmCodeGenerator({ modelName: 'm' }).generateWasm(sheets, [])
  expect(elementSizes(r.wasmWrapper)).toEqual([3])
})

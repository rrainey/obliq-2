// The WASM wrapper reads scopes and outputs fed by a sheet label (From) on a
// different top-level sheet from the block driving the matching Goto.

import { WasmCodeGenerator } from '@/lib/wasm/codegen/WasmCodeGenerator'

const block = (id: string, type: string, name: string, parameters: Record<string, unknown> = {}) => ({
  id, type, name, position: { x: 0, y: 0 }, parameters,
})
const wire = (id: string, s: string, t: string) => ({ id, sourceBlockId: s, sourcePortIndex: 0, targetBlockId: t, targetPortIndex: 0 })

test('scope and output on another sheet read the Goto driver signal', () => {
  const sheets = [
    {
      id: 'main', name: 'Main', extents: { width: 400, height: 300 },
      blocks: [
        block('clk', 'clock', 'Clk'),
        block('gain', 'scale', 'Doubled', { gain: 2 }),
        block('goto', 'sheet_label_sink', 'Tag', { signalName: 'doubled' }),
      ],
      connections: [wire('w1', 'clk', 'gain'), wire('w2', 'gain', 'goto')],
    },
    {
      id: 'tele', name: 'Telemetry', extents: { width: 400, height: 300 },
      blocks: [
        block('from', 'sheet_label_source', 'From_doubled', { signalName: 'doubled' }),
        block('out', 'output_port', 'doubled', { portName: 'doubled', dataType: 'double' }),
        block('scope', 'signal_display', 'Scope', { maxSamples: 100 }),
      ],
      connections: [wire('w3', 'from', 'out'), wire('w4', 'from', 'scope')],
    },
  ]
  const r = new WasmCodeGenerator({ modelName: 'labels' }).generateWasm(sheets as any, [])
  expect(r.wasmWrapper).not.toContain('signals.From_doubled')
  expect(r.wasmWrapper).toContain('signals.Doubled')
})

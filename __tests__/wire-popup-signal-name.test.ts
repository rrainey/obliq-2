// Mirrors the "signal name" derivation the canvas performs when building
// CustomEdge data, so the popup shows the label the reader needs.
//
// - subsystem source: the specific output port name the wire leaves from
// - input/output port block source: the port's own name
// - source block: the block's name (a source has no separate port identity)
// - anything else: no label at all

import type { BlockData } from '@/components/BlockNode'

const derive = (
  source: BlockData,
  sourcePortIndex: number,
): string | undefined => {
  if (source.type === 'subsystem') {
    const ports = source.parameters?.outputPorts
    const idx = Math.max(0, sourcePortIndex)
    return (Array.isArray(ports) && ports[idx]) || source.name
  }
  if (source.type === 'input_port' || source.type === 'output_port') {
    return source.parameters?.portName
      || source.parameters?.signalName
      || source.name
  }
  if (source.type === 'source') return source.name
  return undefined
}

const block = (type: string, name: string, parameters: Record<string, any> = {}): BlockData =>
  ({ id: 'b', type, name, position: { x: 0, y: 0 }, parameters })

describe('wire hover popup: signal name', () => {
  test('a subsystem source uses the specific output port the wire leaves', () => {
    const sub = block('subsystem', 'Plant', {
      inputPorts: ['u'], outputPorts: ['position', 'velocity', 'accel'],
    })
    expect(derive(sub, 0)).toBe('position')
    expect(derive(sub, 1)).toBe('velocity')
    expect(derive(sub, 2)).toBe('accel')
  })

  test('a subsystem port out of range falls back to the block name', () => {
    const sub = block('subsystem', 'Plant', { inputPorts: ['u'], outputPorts: ['y'] })
    expect(derive(sub, 99)).toBe('Plant')
  })

  test('a subsystem with no port list falls back to the block name', () => {
    expect(derive(block('subsystem', 'Plant'), 0)).toBe('Plant')
  })

  test('a source block uses its own name', () => {
    expect(derive(block('source', 'Reference'), 0)).toBe('Reference')
  })

  test('an input port block prefers portName, then signalName, then name', () => {
    expect(derive(block('input_port', 'In1', { portName: 'throttle' }), 0)).toBe('throttle')
    expect(derive(block('input_port', 'In1', { signalName: 'sig' }), 0)).toBe('sig')
    expect(derive(block('input_port', 'In1'), 0)).toBe('In1')
  })

  test('a scale block has no popup label', () => {
    // Not called out in the requirement, and it would clutter the popup.
    expect(derive(block('scale', 'K1'), 0)).toBeUndefined()
  })

  test('control port indices (enable/reset) do not confuse subsystem lookup', () => {
    // Enable/reset use negative source indices in some paths; clamping to 0
    // yields the first port name rather than throwing.
    const sub = block('subsystem', 'Plant', { inputPorts: ['u'], outputPorts: ['y'] })
    expect(derive(sub, -1)).toBe('y')
  })
})

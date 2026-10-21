// Fixtures for the model reference tests: a referenced model ("Plant") and
// a test model that embeds it twice.

export const b = (id: string, type: string, name: string, parameters: Record<string, unknown> = {}) => ({
  id,
  type,
  name,
  position: { x: 0, y: 0 },
  parameters,
})
export const w = (id: string, s: string, t: string, tp = 0, sp = 0) => ({
  id,
  sourceBlockId: s,
  sourcePortIndex: sp,
  targetBlockId: t,
  targetPortIndex: tp,
})
export const sheet = (id: string, blocks: any[], connections: any[]) => ({ id, name: id, blocks, connections, extents: { width: 800, height: 600 } })
export const param = (name: string, value: number) => ({ name, dataType: 'double', defaultValue: value, signalType: 'double', value })

/**
 * "Plant": y = ∫ K·u dt, y2 = K2·y (through a sheet label to a second sheet),
 * and sq = 3·u, sq2 = 3·u through a segregated subsystem and a reference to it.
 */
export function plantModel(K = 2) {
  const sq = b('main__Sq', 'subsystem', 'Sq', {
    inputPorts: ['a'],
    outputPorts: ['b'],
    codeGenStrategy: 'segregated_atomic',
    sheets: [sheet('sq', [b('sq_in', 'input_port', 'a', { portName: 'a' }), b('sq_g', 'scale', 'Three', { gain: 3 }), b('sq_out', 'output_port', 'b', { portName: 'b' })],
      [w('s1', 'sq_in', 'sq_g'), w('s2', 'sq_g', 'sq_out')])],
  })
  const sqRef = b('main__Sq2', 'subsystem', 'Sq2', {
    inputPorts: ['a'],
    outputPorts: ['b'],
    isReference: true,
    referencedSubsystemId: 'main__Sq',
    codeGenStrategy: 'segregated_atomic',
    sheets: [],
  })
  return {
    sheets: [
      sheet('main', [
        b('main__u', 'input_port', 'u', { portName: 'u' }),
        b('main__gain', 'scale', 'Gain', { gain: 'K' }),
        b('main__int', 'integrator', 'Int', { initialCondition: 0 }),
        b('main__y', 'output_port', 'y', { portName: 'y' }),
        b('main__tag', 'sheet_label_sink', 'TagX', { signalName: 'x' }),
        sq,
        sqRef,
        b('main__sq', 'output_port', 'sq', { portName: 'sq' }),
        b('main__sq2', 'output_port', 'sq2', { portName: 'sq2' }),
      ], [
        w('m1', 'main__u', 'main__gain'),
        w('m2', 'main__gain', 'main__int'),
        w('m3', 'main__int', 'main__y'),
        w('m4', 'main__int', 'main__tag'),
        w('m5', 'main__u', 'main__Sq'),
        w('m6', 'main__u', 'main__Sq2'),
        w('m7', 'main__Sq', 'main__sq'),
        w('m8', 'main__Sq2', 'main__sq2'),
      ]),
      sheet('aux', [
        b('aux__from', 'sheet_label_source', 'FromX', { signalName: 'x' }),
        b('aux__twice', 'evaluate', 'Scaled', { numInputs: 1, expression: 'K2 * in(0)' }),
        b('aux__y2', 'output_port', 'y2', { portName: 'y2' }),
      ], [w('a1', 'aux__from', 'aux__twice'), w('a2', 'aux__twice', 'aux__y2')]),
    ],
    parameters: [param('K', K), param('K2', 3)],
    globalSettings: { simulationTimeStep: 0.01, simulationDuration: 1, integrationAlgorithm: 'rk4' },
  }
}

export const ref = (id: string, name: string, modelId: string, extra: Record<string, unknown> = {}) =>
  b(id, 'subsystem', name, { modelRef: { modelId, version: null }, sheets: [], ...extra })

/** Test model: P1 driven by 1, P2 by 2; its own sheet label "x" carries 100. */
export function harnessModel(modelId = 'plant') {
  return {
    sheets: [
      sheet('main', [
        b('one', 'source', 'One', { signalType: 'constant', value: 1 }),
        b('two', 'source', 'Two', { signalType: 'constant', value: 2 }),
        ref('P1', 'P1', modelId),
        ref('P2', 'P2', modelId),
        b('o_y1', 'output_port', 'y1', { portName: 'y1' }),
        b('o_y21', 'output_port', 'y21', { portName: 'y21' }),
        b('o_y2', 'output_port', 'y2', { portName: 'y2' }),
        b('o_sq', 'output_port', 'sq', { portName: 'sq' }),
        b('o_sq2', 'output_port', 'sq2', { portName: 'sq2' }),
        b('hundred', 'source', 'Hundred', { signalType: 'constant', value: 100 }),
        b('tag', 'sheet_label_sink', 'MyTag', { signalName: 'x' }),
        b('from', 'sheet_label_source', 'MyFrom', { signalName: 'x' }),
        b('o_x', 'output_port', 'xx', { portName: 'xx' }),
      ], [
        w('h1', 'one', 'P1'),
        w('h2', 'two', 'P2'),
        w('h3', 'P1', 'o_y1', 0, 0),
        w('h4', 'P1', 'o_y21', 0, 3), // y2 is the model's 4th output (main: y, sq, sq2; aux: y2)
        w('h5', 'P2', 'o_y2', 0, 0),
        w('h6', 'P1', 'o_sq', 0, 1),
        w('h7', 'P1', 'o_sq2', 0, 2),
        w('h8', 'hundred', 'tag'),
        w('h9', 'from', 'o_x'),
      ]),
    ],
    parameters: [],
  }
}

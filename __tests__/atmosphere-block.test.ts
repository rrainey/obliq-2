// __tests__/atmosphere-block.test.ts

import { AtmosphereBlockModule } from '@/lib/blocks/AtmosphereBlockModule'
import { BlockData } from '@/components/BlockNode'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'
import { ussa1976, ussa1976PressureAltitude, LAYER_BASE_PRESSURES } from '@/lib/atmosphere/ussa1976'
import { cleanupNativeDir, compileAndRunNative } from './support/nativeCgen'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { propagateSignalTypes } from '@/lib/signalTypePropagation'
import { getSignalMemberName } from '@/lib/codegen/signalMemberName'
import { WasmCodeGenerator } from '@/lib/wasm/codegen/WasmCodeGenerator'

/** Minimal atmosphere + density→output model (no on-disk Saturn fixture). */
function minimalAtmosphereModel() {
  return {
    sheets: [
      {
        id: 'main',
        name: 'Main',
        extents: { width: 800, height: 600 },
        blocks: [
          {
            id: 'h',
            name: 'h',
            type: 'source',
            position: { x: 0, y: 0 },
            parameters: { signalType: 'constant', value: 0, dataType: 'double' },
          },
          {
            id: 'atm',
            name: 'Atm',
            type: 'atmosphere',
            position: { x: 100, y: 0 },
            parameters: { model: 'coesa1976', extrapolation: 'clamp' },
          },
          {
            id: 'outT',
            name: 'T',
            type: 'output_port',
            position: { x: 300, y: 0 },
            parameters: { portName: 'T_K' },
          },
          {
            id: 'outRho',
            name: 'rho',
            type: 'output_port',
            position: { x: 300, y: 80 },
            parameters: { portName: 'rho_kgpm3' },
          },
          {
            id: 'outA',
            name: 'a',
            type: 'output_port',
            position: { x: 300, y: 160 },
            parameters: { portName: 'a_mps' },
          },
        ],
        connections: [
          { id: 'w1', sourceBlockId: 'h', sourcePortIndex: 0, targetBlockId: 'atm', targetPortIndex: 0 },
          { id: 'w2', sourceBlockId: 'atm', sourcePortIndex: 0, targetBlockId: 'outT', targetPortIndex: 0 },
          // COESA order: T=0, a=1, P=2, rho=3
          { id: 'w3', sourceBlockId: 'atm', sourcePortIndex: 3, targetBlockId: 'outRho', targetPortIndex: 0 },
          { id: 'w4', sourceBlockId: 'atm', sourcePortIndex: 1, targetBlockId: 'outA', targetPortIndex: 0 },
        ],
      },
    ],
    parameters: [],
  }
}

describe('Atmosphere Block (P7)', () => {
  const module = new AtmosphereBlockModule()

  const block = (): BlockData => ({
    id: 'atm1',
    name: 'Atm1',
    type: 'atmosphere',
    position: { x: 0, y: 0 },
    parameters: {
      model: 'coesa1976',
      extrapolation: 'clamp'
    }
  })

  test('is registered', () => {
    expect(BlockModuleFactory.isSupported('atmosphere')).toBe(true)
  })

  test('four outputs, one input', () => {
    expect(module.getInputPortCount(block())).toBe(1)
    expect(module.getOutputPortCount(block())).toBe(4)
    // Simulink / aerolib COESA order: T, a, P, rho
    expect(module.getOutputPortLabels(block())).toEqual([
      'temperature_K',
      'speed_of_sound_mps',
      'pressure_Pa',
      'density_kgpm3'
    ])
  })

  test('struct members for all outputs', () => {
    const member = module.generateStructMember(block(), 'double')
    expect(member).toContain('Atm1_temperature_K')
    expect(member).toContain('Atm1_pressure_Pa')
    expect(member).toContain('Atm1_density_kgpm3')
    expect(member).toContain('Atm1_speed_of_sound_mps')
  })

  test('codegen emits the standard-atmosphere formulae and writes four signals', () => {
    const code = module.generateComputation(
      block(),
      ['model->signals.h'],
      ['double']
    )
    expect(code).toContain('Atmosphere block')
    expect(code).toContain('Atm1_temperature_K')
    expect(code).toContain('Atm1_density_kgpm3')
    expect(code).toContain('288.15') // sea-level temperature
    expect(code).toContain('U.S. Standard Atmosphere 1976 formulae')
    expect(code).not.toContain('_y[') // no lookup table
  })

  test('layer base pressures match the 1976 standard (Table 4)', () => {
    const published = [101325.0, 22632.06, 5474.889, 868.0187, 110.9063, 66.93887, 3.956420]
    LAYER_BASE_PRESSURES.forEach((p, i) => expect(p / published[i]!).toBeCloseTo(1, 6))
  })

  test.each([
    // z (m), T (K), P (Pa), rho (kg/m3): U.S. Standard Atmosphere 1976, geometric altitude
    [0, 288.15, 101325, 1.225],
    [1000, 281.651, 89876.3, 1.1117],
    [5000, 255.676, 54048.3, 0.73643],
    [10000, 223.252, 26499.9, 0.41351],
    [11000, 216.774, 22700.0, 0.36480],
    [20000, 216.65, 5529.31, 0.088910],
    [32000, 228.49, 889.06, 0.013555],
    [50000, 270.65, 79.779, 0.0010269],
    [80000, 198.639, 1.0525, 1.8458e-5],
    [86000, 186.946, 0.37338, 6.958e-6],
  ])('standard values at %d m', (z, T, P, rho) => {
    const a = ussa1976(z)
    expect(a.temperature_K).toBeCloseTo(T, 2)
    expect(a.pressure_Pa / P).toBeCloseTo(1, 4)
    expect(a.density_kgpm3 / rho).toBeCloseTo(1, 3)
  })

  test('sea-level speed of sound is 340.29 m/s', () => {
    expect(ussa1976(0).speed_of_sound_mps).toBeCloseTo(340.294, 2)
  })

  test('pressure altitude inverts the pressure profile', () => {
    for (const z of [-4000, 0, 250, 8000, 15000, 25000, 40000, 60000, 85000]) {
      expect(ussa1976PressureAltitude(ussa1976(z).pressure_Pa)).toBeCloseTo(z, 6)
    }
  })

  test('clamps outside -5..86 km unless extrapolating', () => {
    expect(ussa1976(120000).pressure_Pa).toBe(ussa1976(86000).pressure_Pa)
    expect(ussa1976(-8000).pressure_Pa).toBe(ussa1976(-5000).pressure_Pa)
    expect(ussa1976(-8000, { extrapolate: true }).pressure_Pa).toBeGreaterThan(ussa1976(-5000).pressure_Pa)
  })

  test('full codegen multi-output signal names', () => {
    const sheets = [{
      id: 'main',
      name: 'Main',
      extents: { width: 800, height: 600 },
      blocks: [
        {
          id: 'h',
          name: 'Alt',
          type: 'source',
          position: { x: 0, y: 0 },
          parameters: { value: '0', dataType: 'double' }
        },
        {
          id: 'atm',
          name: 'Atm',
          type: 'atmosphere',
          position: { x: 100, y: 0 },
          parameters: { model: 'coesa1976', extrapolation: 'clamp' }
        },
        {
          id: 'out',
          name: 'RhoOut',
          type: 'output_port',
          position: { x: 200, y: 0 },
          parameters: { portName: 'rho' }
        }
      ],
      connections: [
        { id: 'c1', sourceBlockId: 'h', sourcePortIndex: 0, targetBlockId: 'atm', targetPortIndex: 0 },
        // density is port 3 (order T, a, P, rho)
        { id: 'c2', sourceBlockId: 'atm', sourcePortIndex: 3, targetBlockId: 'out', targetPortIndex: 0 }
      ]
    }]

    const gen = new CodeGenerator({ modelName: 'atm_test' })
    const result = gen.generate(sheets as any, [])
    expect(result.header).toContain('Atm_density_kgpm3')
    expect(result.source).toContain('Atm_density_kgpm3')
    // multi-output wiring uses suffix
    expect(result.source).toMatch(/signals\.Atm_density_kgpm3/)
  })
})


describe('Atmosphere type propagation (UI)', () => {
  test('all atmosphere ports type as double', () => {
    const sheet = minimalAtmosphereModel().sheets[0]
    const result = propagateSignalTypes(sheet.blocks as any, sheet.connections as any)

    const atm = sheet.blocks.find((b) => b.type === 'atmosphere')
    expect(atm).toBeDefined()
    for (let p = 0; p < 4; p++) {
      expect(result.blockOutputTypes.get(`${atm!.id}:${p}`)).toBe('double')
    }

    for (const wire of sheet.connections) {
      expect(result.signalTypes.get(wire.id)?.type).toBe('double')
    }

    const hardErrors = result.errors.filter((e) => e.severity === 'error')
    expect(hardErrors).toHaveLength(0)
  })
})

describe('Atmosphere WASM multi-output signal names', () => {
  test('getSignalMemberName uses COESA suffixes (T,a,P,rho)', () => {
    expect(getSignalMemberName('Atm', 'atmosphere', 0)).toBe('Atm_temperature_K')
    expect(getSignalMemberName('Atm', 'atmosphere', 1)).toBe('Atm_speed_of_sound_mps')
    expect(getSignalMemberName('Atm', 'atmosphere', 2)).toBe('Atm_pressure_Pa')
    expect(getSignalMemberName('Atm', 'atmosphere', 3)).toBe('Atm_density_kgpm3')
  })

  test('WASM wrapper references Atm_density_kgpm3 not Atm', () => {
    const model = minimalAtmosphereModel()
    const gen = new WasmCodeGenerator({ modelName: 'atm_multi_out' })
    const result = gen.generateWasm(model.sheets as any, model.parameters || [])
    expect(result.wasmWrapper).toContain('signals.Atm_density_kgpm3')
    expect(result.wasmWrapper).toContain('signals.Atm_temperature_K')
    expect(result.wasmWrapper).toContain('signals.Atm_speed_of_sound_mps')
    // Must not return bare multi-output base name
    expect(result.wasmWrapper).not.toMatch(/signals\.Atm;/)
  })
})

describe('Atmosphere native codegen', () => {
  let outDir: string | undefined
  afterAll(() => cleanupNativeDir(outDir))

  test('generated C matches the TypeScript formulae from -5 km to 86 km, clamping beyond', () => {
    const altitudes = [-6000, -5000, -1234, 0, 500, 5000, 10999, 11000, 19999, 20000, 32000, 47000, 51000, 70999, 71000, 84000, 86000, 90000]
    const sheets = [{
      id: 'main', name: 'Main', extents: { width: 800, height: 600 },
      blocks: [
        { id: 'h', name: 'h', type: 'input_port', position: { x: 0, y: 0 }, parameters: { portName: 'h', dataType: 'double' } },
        { id: 'atm', name: 'Atm', type: 'atmosphere', position: { x: 100, y: 0 }, parameters: { model: 'coesa1976', extrapolation: 'clamp' } },
        ...['T', 'a', 'P', 'rho'].map((n, i) => ({ id: `o${i}`, name: n, type: 'output_port', position: { x: 300, y: 80 * i }, parameters: { portName: n, dataType: 'double' } })),
      ],
      connections: [
        { id: 'w0', sourceBlockId: 'h', sourcePortIndex: 0, targetBlockId: 'atm', targetPortIndex: 0 },
        ...[0, 1, 2, 3].map(i => ({ id: `w${i + 1}`, sourceBlockId: 'atm', sourcePortIndex: i, targetBlockId: `o${i}`, targetPortIndex: 0 })),
      ],
    }]
    const r = compileAndRunNative({
      modelName: 'atm_native',
      sheets: sheets as any,
      smokeMainBody: `
  const double hs[${altitudes.length}] = { ${altitudes.join(', ')} };
  for (int i = 0; i < ${altitudes.length}; ++i) {
    model.inputs.h = hs[i];
    atm_native_seed_from_inputs(&model);
    printf("%.17g %.17g %.17g %.17g\\n", model.outputs.T, model.outputs.a, model.outputs.P, model.outputs.rho);
  }
  return 0;
`,
    })
    outDir = r.outDir
    const rows = r.stdout.trim().split('\n').map(l => l.split(' ').map(Number))
    altitudes.forEach((z, i) => {
      const ref = ussa1976(z)
      const [T, a, P, rho] = rows[i]!
      expect(T! / ref.temperature_K).toBeCloseTo(1, 12)
      expect(a! / ref.speed_of_sound_mps).toBeCloseTo(1, 12)
      expect(P! / ref.pressure_Pa).toBeCloseTo(1, 12)
      expect(rho! / ref.density_kgpm3).toBeCloseTo(1, 12)
    })
  })
})

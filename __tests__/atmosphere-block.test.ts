// __tests__/atmosphere-block.test.ts

import { AtmosphereBlockModule } from '@/lib/blocks/AtmosphereBlockModule'
import { BlockData } from '@/components/BlockNode'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'
import { lookupAtmosphere, COESA_1976_TABLE } from '@/lib/atmosphere/coesa1976Tables'
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

  test('codegen embeds table and writes four signals', () => {
    const code = module.generateComputation(
      block(),
      ['model->signals.h'],
      ['double']
    )
    expect(code).toContain('Atmosphere block')
    expect(code).toContain('Atm1_temperature_K')
    expect(code).toContain('Atm1_density_kgpm3')
    expect(code).toContain('288.15') // sea level T in table
  })

  test('sea level density ≈ 1.225 (P7-H1 JS table)', () => {
    const a = lookupAtmosphere(0)
    expect(a.density_kgpm3).toBeCloseTo(1.225, 2)
    expect(a.temperature_K).toBeCloseTo(288.15, 1)
    expect(a.pressure_Pa).toBeCloseTo(101325, -2)
  })

  test('11 km tropopause temperature ≈ 216.65 K (P7-H2)', () => {
    const a = lookupAtmosphere(11000)
    expect(a.temperature_K).toBeCloseTo(216.65, 0)
  })

  test('pressure decreases with altitude (P7-H3)', () => {
    const p0 = lookupAtmosphere(0).pressure_Pa
    const p20 = lookupAtmosphere(20000).pressure_Pa
    const p50 = lookupAtmosphere(50000).pressure_Pa
    expect(p0).toBeGreaterThan(p20)
    expect(p20).toBeGreaterThan(p50)
  })

  test('table has matching lengths', () => {
    const t = COESA_1976_TABLE
    const n = t.altitude_m.length
    expect(t.temperature_K.length).toBe(n)
    expect(t.pressure_Pa.length).toBe(n)
    expect(t.density_kgpm3.length).toBe(n)
    expect(t.speed_of_sound_mps.length).toBe(n)
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
        // density is port 2
        { id: 'c2', sourceBlockId: 'atm', sourcePortIndex: 2, targetBlockId: 'out', targetPortIndex: 0 }
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

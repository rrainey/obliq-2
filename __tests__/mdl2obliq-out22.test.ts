import { wireRootOut22 } from '../src/lib/mdl2obliq/wireRootOut22'
import type { BlockData } from '../src/components/BlockNode'
import type { WireData } from '../src/components/Wire'

describe('wireRootOut22', () => {
  test('packs On_Pad lat/lon/h/Xe/Ve into root Out22', () => {
    const onPad: BlockData = {
      id: 'sub_onpad',
      type: 'subsystem',
      name: 'On_Pad',
      position: { x: 100, y: 100 },
      parameters: {
        inputPorts: ['theta_GMST_rad', 'CG_LLA_deg_m'],
        outputPorts: [
          'lat_deg',
          'lon_deg',
          'h_m',
          'Xe_m',
          'Ve_mps',
          'alpha_deg'
        ],
        sheets: []
      }
    }
    const model = {
      sheets: [
        {
          id: 's0',
          name: 'Main',
          blocks: [onPad],
          connections: [] as WireData[]
        }
      ]
    }
    const r = wireRootOut22(model as any)
    expect(r.wired).toBe(true)
    const out = model.sheets[0].blocks.find(b => b.name === 'Out22')
    expect(out?.type).toBe('output_port')
    expect(out?.parameters?.dataType).toBe('double[9]')
    expect(model.sheets[0].blocks.some(b => b.name === 'Out22_pack')).toBe(true)
    expect(model.sheets[0].connections.length).toBeGreaterThanOrEqual(12)
  })
})

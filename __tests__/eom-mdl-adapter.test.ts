/**
 * EOM MDL adapter flags (forcePathGravity, zeroIdot, veViaTranspose).
 * See DCM_QUAT_EOM_AUDIT.md / EOM_MDL_ADAPTER.
 */

import {
  as205MdlWirePadStateEci,
  quatToDcm
} from '../examples/saturn-ib/as205EciPlant'
import { mat3MulVec, mat3Transpose } from '../examples/saturn-ib/as205Mes'
import {
  buildEomSubsystemBlock,
  buildSixDofVariableMassEom,
  EOM_MDL_ADAPTER
} from '../examples/saturn-ib/sixDofVarMassEom'
import { buildSaturnIbObliqPlant } from '../examples/saturn-ib/saturnIbObliqPlant'

function findBlock(
  blocks: Array<{ name: string; type: string }>,
  name: string
) {
  return blocks.find(b => b.name === name)
}

describe('EOM MDL adapter physics options', () => {
  test('default EOM has v_dot with g_b and Idot path', () => {
    const m = buildSixDofVariableMassEom()
    const names = m.sheets[0].blocks.map(b => b.name)
    expect(names).toContain('v_dot')
    expect(names).toContain('g_b')
    expect(names).toContain('M_net')
    expect(names).toContain('Idot_omega')
  })

  test('EOM_MDL_ADAPTER: forcePathGravity drops separate v_dot+g; keeps F_aug', () => {
    const m = buildSixDofVariableMassEom(EOM_MDL_ADAPTER)
    const names = m.sheets[0].blocks.map(b => b.name)
    expect(names).toContain('F_aug_with_gravity')
    expect(names).toContain('m_g_b')
    // no sum named v_dot that adds g (integrator fed from vdot_tmp)
    expect(names).not.toContain('M_net') // zeroIdot uses M_tmp only
    expect(findBlock(m.sheets[0].blocks, 'r_dot')).toBeDefined()
  })

  test('veViaTranspose: r_dot sourced from C_ib not C_bi', () => {
    const m = buildSixDofVariableMassEom({ veViaTranspose: true })
    const rDot = m.sheets[0].blocks.find(b => b.name === 'r_dot')!
    const C_ib = m.sheets[0].blocks.find(b => b.name === 'C_ib')!
    const wire = m.sheets[0].connections.find(
      c => c.targetBlockId === rDot.id && c.targetPortIndex === 0
    )
    expect(wire?.sourceBlockId).toBe(C_ib.id)
  })

  test('buildEomSubsystemBlock accepts physics + mdlWire IC', () => {
    const pad = as205MdlWirePadStateEci()
    const { eomSubsystem, core } = buildEomSubsystemBlock(0, 0, {
      m0_kg: 586593,
      r0_i: [...pad.r0_E],
      v0_b: [...pad.v0_b],
      q0: pad.q0_bE,
      physics: EOM_MDL_ADAPTER
    })
    expect(eomSubsystem.name).toBe('EOM_6DoF_VarMass')
    expect(core.description).toContain('forcePathGravity')
    expect(core.description).toContain('zeroIdot')
    expect(core.description).toContain('veViaTranspose')
    // IC reconstruct
    const q = [
      pad.q0_bE[0][0],
      pad.q0_bE[1][0],
      pad.q0_bE[2][0],
      pad.q0_bE[3][0]
    ] as [number, number, number, number]
    const ve = mat3MulVec(mat3Transpose(quatToDcm(q)), pad.v0_b)
    for (let i = 0; i < 3; i++) {
      expect(ve[i]).toBeCloseTo(pad.v0_E[i], 5)
    }
  })
})

describe('Saturn plant stays on legacy physics (adapter opt-in)', () => {
  test('live plant EOM does not enable F_aug / zeroIdot by default', () => {
    const plant = buildSaturnIbObliqPlant()
    const eom = plant.sheets[0].blocks.find(b => b.name === 'EOM_6DoF_VarMass')
    expect(eom).toBeDefined()
    const inner = (
      eom!.parameters as { sheets: Array<{ blocks: Array<{ name: string }> }> }
    ).sheets[0].blocks
    const names = inner.map(b => b.name)
    expect(names).not.toContain('F_aug_with_gravity')
    expect(names).toContain('v_dot')
    expect(names).toContain('M_net')
  })
})

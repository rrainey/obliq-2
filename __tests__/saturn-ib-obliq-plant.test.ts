/**
 * Nested Saturn IB Obliq plant — hierarchy + codegen
 */

import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import {
  buildSaturnIbObliqPlant,
  EXPECTED_SIB_STAGE_SUBSYSTEMS,
  EXPECTED_TOP_LEVEL_SUBSYSTEMS
} from '../examples/saturn-ib/saturnIbObliqPlant'
import type { SliceBlock } from '../examples/saturn-ib/sliceModels'

function collectSubsystems(blocks: SliceBlock[]): SliceBlock[] {
  const out: SliceBlock[] = []
  for (const b of blocks) {
    if (b.type === 'subsystem') {
      out.push(b)
      const inner = b.parameters?.sheets?.[0]?.blocks as SliceBlock[] | undefined
      if (inner) out.push(...collectSubsystems(inner))
    }
  }
  return out
}

describe('saturnIbObliqPlant hierarchy', () => {
  const model = buildSaturnIbObliqPlant()
  const root = model.sheets[0]
  const allSubs = collectSubsystems(root.blocks)
  const names = new Set(allSubs.map(b => b.name))

  test('root sheet named Saturn_IB_Stack', () => {
    expect(root.name).toBe('Saturn_IB_Stack')
  })

  test('top-level Simulink subsystems present', () => {
    for (const n of EXPECTED_TOP_LEVEL_SUBSYSTEMS) {
      expect(names.has(n)).toBe(true)
    }
  })

  test('S-IB Stage shell has Simulink-named stub children', () => {
    const sib = root.blocks.find(b => b.name === 'S-IB Stage')!
    const sibNames = new Set(
      (sib.parameters?.sheets?.[0]?.blocks as SliceBlock[])
        .filter(b => b.type === 'subsystem')
        .map(b => b.name)
    )
    // Shell uses full MDL names for structure; live EOM/H1 are root siblings
    expect(sibNames.has('Custom Variable Mass 6DoF (Quaternion)')).toBe(true)
    expect(sibNames.has('H-1 Engine Cluster')).toBe(true)
    expect(sibNames.has('Aerodynamic Forces and Moments')).toBe(true)
  })

  test('live EOM + H-1 TVC + air-rel aero at root; S-IB/IU shells present', () => {
    expect(names.has('Saturn Instrument Unit (IU)')).toBe(true)
    expect(names.has('S-IB Stage')).toBe(true)
    const eom = root.blocks.find(b => b.name === 'EOM_6DoF_VarMass')!
    const inner = eom.parameters?.sheets?.[0]?.blocks as SliceBlock[]
    expect(inner.some(b => b.type === 'integrator')).toBe(true)
    expect(root.blocks.some(b => b.name === 'ThrustMag_N')).toBe(true)
    expect(root.blocks.some(b => b.name === 'H1_Engine_Cluster')).toBe(true)
    expect(root.blocks.some(b => b.name === 'Aero_AirRel')).toBe(true)
    expect(root.blocks.some(b => b.name === 'Chi_Table2B_ElevPd')).toBe(true)
    expect(root.blocks.some(b => b.name === 'M_aero_off')).toBe(false)
    expect(root.blocks.some(b => b.name === 'mdot_total')).toBe(true)
    expect(root.blocks.some(b => b.name === 'J2_Thrust_N')).toBe(true)
    expect(root.blocks.some(b => b.name === 'F_b_sum')).toBe(true)
    expect(root.blocks.some(b => b.name === 'M_b_sum')).toBe(true)
  })

  test('t_burn + EOM hold-down gated on bLiftoff; freeze at bCutoff', () => {
    const tBurn = root.blocks.find(b => b.name === 't_burn')!
    const lift = root.blocks.find(b => b.name === 'bLiftoff_d')!
    const eom = root.blocks.find(b => b.name === 'EOM_6DoF_VarMass')!
    const eomEnBlk = root.blocks.find(b => b.name === 'eom_enable')!
    expect(eom.parameters?.showEnableInput).toBe(true)
    const derWire = root.connections.find(
      c => c.targetBlockId === tBurn.id && c.targetPortIndex === 0
    )
    expect(derWire?.sourceBlockId).toBe(lift.id)
    const eomEn = root.connections.find(
      c => c.targetBlockId === eom.id && c.targetPortIndex === -1
    )
    expect(eomEn?.sourceBlockId).toBe(eomEnBlk.id)
    const mdotG = root.blocks.find(b => b.name === 'mdot_sib_gated')!
    const burnAct = root.blocks.find(b => b.name === 'sib_burn_active')!
    const mdotGate = root.connections.find(
      c => c.targetBlockId === mdotG.id && c.sourceBlockId === burnAct.id
    )
    expect(mdotGate).toBeTruthy()
  })

  test('RTW T2/T3 staging events + J-2 thrust after S-IVB start', () => {
    expect(root.blocks.some(b => b.name === 'Compare_c3')).toBe(true)
    expect(root.blocks.some(b => b.name === 'T2_elapsed')).toBe(true)
    expect(root.blocks.some(b => b.name === 'T3_elapsed')).toBe(true)
    expect(root.blocks.some(b => b.name === 'bIECO_d')).toBe(true)
    expect(root.blocks.some(b => b.name === 'bOECO_d')).toBe(true)
    expect(root.blocks.some(b => b.name === 'bStageSep_d')).toBe(true)
    expect(root.blocks.some(b => b.name === 'bS_IVB_EngineStart_d')).toBe(true)
    expect(root.blocks.some(b => b.name === 'J2_Thrust_N')).toBe(true)
    expect(root.blocks.some(b => b.name === 't_j2')).toBe(true)
    expect(root.blocks.some(b => b.name === 'J2_F_b')).toBe(true)
    expect(root.blocks.some(b => b.name === 'bIGMEnable_d')).toBe(true)
    expect(root.blocks.some(b => b.name === 'bCutoff_d')).toBe(true)
    expect(root.blocks.some(b => b.name === 't_igm_elapsed')).toBe(false)
    expect(root.blocks.some(b => b.name === 'bTgoArm_d')).toBe(false)
    expect(root.blocks.some(b => b.name === 'j2_burn_ok')).toBe(true)
    expect(root.blocks.some(b => b.name === 'LVDC_SFrame_Nav')).toBe(true)
    expect(root.blocks.some(b => b.name === 'LVDC_IGM')).toBe(true)
    const igm = root.blocks.find(b => b.name === 'LVDC_IGM')!
    expect(igm.parameters?.showEnableInput).toBe(true)
    expect(igm.parameters?.inputPorts).toEqual([
      'XS_m',
      'XSdot_mps',
      'G_S_bar_mps2',
      'A_m_bar_mps2',
      'FoverM_mps2',
      'MF_S',
      'T3_sec',
      'Chi_minor_loop_sample',
      'igm_enable'
    ])
    expect(igm.parameters?.outputPorts).toContain('L1')
    expect(igm.parameters?.outputPorts).toContain('L_over_J')
    expect(igm.parameters?.outputPorts).toContain('T_1_i_sec')
    expect(igm.parameters?.outputPorts).toContain('Chi_Y_deg')
    expect(igm.parameters?.outputPorts).toContain('Chi_cmd_deg')
    expect(igm.parameters?.outputPorts).toContain('T_3_i_sec')
    expect(igm.parameters?.outputPorts).toContain('T_3_i_Add8')
    expect(igm.parameters?.outputPorts).toContain('nHSLActive')
    expect(igm.parameters?.outputPorts).toContain('bCutoff')
    const igmBlocks = igm.parameters?.sheets?.[0]?.blocks as SliceBlock[]
    expect(igmBlocks.some(b => b.name === 'Chi_Y_deg_gated')).toBe(true)
    expect(igmBlocks.some(b => b.name === 'L_y')).toBe(true)
    expect(igmBlocks.some(b => b.name === 'L_over_J')).toBe(true)
    // Product15 Chi nested subsystem
    expect(igmBlocks.some(b => b.name === 'IGM_Product15_Chi')).toBe(true)
    const p15 = igmBlocks.find(b => b.name === 'IGM_Product15_Chi')!
    const p15b = p15.parameters?.sheets?.[0]?.blocks as SliceBlock[]
    expect(p15.parameters?.inputPorts).toEqual([
      'XS_m',
      'VS_mps',
      'G_S_mps2',
      'T1',
      'tau3',
      'T3',
      'L1',
      'J1',
      'S1',
      'Q1',
      'P1',
      'U1',
      'L_prime_3',
      'J_prime_3',
      'tau1'
    ])
    expect(p15b.some(b => b.name === 'Product15')).toBe(true)
    expect(p15b.some(b => b.name === 'K_p')).toBe(true)
    expect(p15b.some(b => b.name === 'Chi_Y_deg')).toBe(true)
    expect(p15b.some(b => b.name === 'V_mag')).toBe(true)
    expect(p15b.some(b => b.name === 'phi_iT_rad')).toBe(true)
    expect(p15b.some(b => b.name === 'Add11')).toBe(true)
    expect(p15b.some(b => b.name === 'J_3')).toBe(true)
    expect(p15b.some(b => b.name === 'dV0_mag2')).toBe(true)
    expect(p15b.some(b => b.name === 'Gain1_h')).toBe(true)
    expect(p15b.some(b => b.name === 'T3_eff')).toBe(true)
    const igmWires = igm.parameters?.sheets?.[0]?.connections as {
      sourceBlockId: string
      targetBlockId: string
    }[]
    const tau1Mp = igmBlocks.find(b => b.name === 'tau_1_multiport')!
    const mp = igmBlocks.find(b => b.name === 'Multiport_Switch')!
    const demuxMp = igmBlocks.find(b => b.name === 'demux_Multiport')!
    const t3Base = igmBlocks.find(b => b.name === 'T_3_i_clamped')!
    const bCut = igmBlocks.find(b => b.name === 'bCutoff')!
    // First Phase τ1_eff = RL(MF)·V_ex1 → Multiport; Phase2+ uses preset
    expect(igmBlocks.some(b => b.name === 'MF_S_rate_lim')).toBe(true)
    expect(igmBlocks.some(b => b.name === 'tau_1_first_phase')).toBe(true)
    expect(
      igmWires.some(
        c => c.sourceBlockId === tau1Mp.id && c.targetBlockId === mp.id
      )
    ).toBe(true)
    expect(
      igmWires.some(
        c => c.sourceBlockId === demuxMp.id && c.targetBlockId === p15.id
      )
    ).toBe(true)
    expect(
      igmWires.some(
        c => c.sourceBlockId === t3Base.id && c.targetBlockId === bCut.id
      )
    ).toBe(true)
    // Discrete δT=1.6 s: floor(guid/δT)*δT → T1/T3 stepwise
    expect(igmBlocks.some(b => b.name === 'guid_elapsed_sec')).toBe(true)
    expect(igmBlocks.some(b => b.name === 'guid_elapsed_zoh')).toBe(true)
    expect(igmBlocks.find(b => b.name === 'guid_elapsed_zoh')?.type).toBe(
      'evaluate'
    )
    expect(
      String(
        igmBlocks.find(b => b.name === 'guid_elapsed_zoh')?.parameters
          ?.expression ?? ''
      )
    ).toMatch(/floor\(in\(0\)\/1\.6\)\*1\.6/)
    expect(igmBlocks.some(b => b.name === 'tgo_active')).toBe(true)
    expect(igmBlocks.some(b => b.name === 'phase2_active')).toBe(true)
    expect(igmBlocks.some(b => b.name === 'Multiport_Switch')).toBe(true)
    expect(igmBlocks.find(b => b.name === 'Multiport_Switch')?.type).toBe('mux')
    expect(igmBlocks.some(b => b.name === 'nHSLActive')).toBe(true)
    expect(igmBlocks.some(b => b.name === 'bCutoff')).toBe(true)
    // Wave B: art-τ hold to zoh≥318.7; live τ3 blend; SMCY
    expect(igmBlocks.find(b => b.name === 'tgo_active')?.type).toBe('evaluate')
    expect(igmBlocks.find(b => b.name === 'tau_3_live')?.type).toBe('evaluate')
    expect(igmBlocks.some(b => b.name === 'SMCY_enable')).toBe(true)
    expect(igmBlocks.some(b => b.name === 'SMCY_rad')).toBe(true)
    expect(igmBlocks.some(b => b.name === 'Chi_Y_deg_SMCY')).toBe(true)
    expect(igmBlocks.some(b => b.name === 'SMCZ_enable')).toBe(true)
    expect(igmBlocks.some(b => b.name === 'SMCZ_rad')).toBe(true)
    expect(igmBlocks.some(b => b.name === 'Chi_Z_deg_SMCZ')).toBe(true)
    // SMC ΔV: A_m demux (as_zoh) + Gain3 zoh blocks
    expect(igmBlocks.some(b => b.name === 'demux_AS_SMC')).toBe(true)
    expect(igmBlocks.some(b => b.name === 'SMCY_dv_x_zoh')).toBe(true)
    expect(
      String(
        igmBlocks.find(b => b.name === 'T_3_i_clamped')?.parameters?.expression ??
          ''
      )
    ).toMatch(/318\.7/)
    expect(
      String(
        igmBlocks.find(b => b.name === 'tau_3_live')?.parameters?.expression ?? ''
      )
    ).toMatch(/318\.7|285\.3/)
    // SMC bypass (as_zoh still regresses Ve_y when enabled)
    expect(
      String(
        igmBlocks.find(b => b.name === 'SMCY_enable')?.parameters?.expression ?? ''
      )
    ).toBe('0.0')
    expect(
      String(
        igmBlocks.find(b => b.name === 'SMCZ_enable')?.parameters?.expression ?? ''
      )
    ).toBe('0.0')
    // A.4: Product15 exports T3_eff; parent HSL uses it (Multiport stays T3_base)
    expect(igmBlocks.some(b => b.name === 'T_3_i_eff_pos')).toBe(true)
    expect(p15b.some(b => b.name === 'Gain1_h')).toBe(true)
    expect(p15b.some(b => b.name === 'T3_eff')).toBe(true)
    expect(
      (p15.parameters?.outputPorts as string[] | undefined)?.includes('T3_eff')
    ).toBe(true)
    // Root bCutoff from LVDC HSL (not fixed T_go timer)
    expect(
      root.connections.some(
        c =>
          c.sourceBlockId === igm.id &&
          c.targetBlockId === root.blocks.find(b => b.name === 'bCutoff_d')!.id
      )
    ).toBe(true)
    const igmInner = igm.parameters?.sheets?.[0]?.blocks as SliceBlock[]
    expect(igmInner.some(b => b.name === 'IGM_Intermediate_Parameters')).toBe(
      true
    )
    // Wave C: Chi_Y (elev log) + Chi_cmd → Chi_Table2B Ψ→FCC when IGM on
    const chiGuid = root.blocks.find(b => b.name === 'Chi_Table2B_ElevPd')!
    expect(
      root.connections.some(
        c =>
          c.sourceBlockId === igm.id &&
          c.targetBlockId === chiGuid.id &&
          c.sourcePortIndex === 5 &&
          c.targetPortIndex === 5
      )
    ).toBe(true)
    expect(
      root.connections.some(
        c =>
          c.sourceBlockId === igm.id &&
          c.targetBlockId === chiGuid.id &&
          c.sourcePortIndex === 0 &&
          c.targetPortIndex === 6
      )
    ).toBe(true)
    const inter = igmInner.find(b => b.name === 'IGM_Intermediate_Parameters')!
    expect(inter.parameters?.outputPorts).toEqual([
      'L1',
      'J1',
      'S1',
      'Q1',
      'P1',
      'U1',
      'L_prime_3',
      'L_prime_y',
      'J_prime_3'
    ])
    const outs = root.blocks
      .filter(b => b.type === 'output_port')
      .map(b => b.parameters?.portName ?? b.name)
    for (const n of [
      'bStageSep',
      'bIECO',
      'bOECO',
      'bS_IVB_EngineStart'
    ]) {
      expect(outs).toContain(n)
    }
  })

  test('root exports EOM state + aero + χ guidance for OUT11 mapper', () => {
    const outs = root.blocks
      .filter(b => b.type === 'output_port')
      .map(b => b.parameters?.portName ?? b.name)
    for (const n of [
      'r_i',
      'v_b',
      'omega_b',
      'q_bE',
      'mass_kg',
      'r_mag_m',
      'qbar_Pa',
      'alpha_deg',
      'elev_cmd_deg',
      'elev_meas_deg',
      'beta_P_cmd_deg',
      'beta_Y_cmd_deg',
      'V_S_mag',
      'v_S'
    ]) {
      expect(outs).toContain(n)
    }
  })

  test('Chi_Table2B_ElevPd Wave C Chi→Ψ→FCC; tip-band fallback', () => {
    const chi = root.blocks.find(b => b.name === 'Chi_Table2B_ElevPd')!
    expect(chi.parameters?.inputPorts).toContain('chi_Y_deg')
    expect(chi.parameters?.inputPorts).toContain('chi_cmd_deg')
    const inner = chi.parameters?.sheets?.[0]?.blocks as SliceBlock[]
    const lut = inner.find(b => b.name === 'elev_deg_table')!
    expect(lut.parameters?.inputValues?.[0]).toBe(0)
    expect(lut.parameters?.outputValues?.[0]).toBe(90)
    expect((lut.parameters?.inputValues as number[]).length).toBeGreaterThan(20)
    // Wave C: tip-band fallback clamp(90+Chi_Y,min,max) → Chi_P for Ψ; β from Ψ
    const elevIgm = inner.find(b => b.name === 'elev_igm_from_Chi_Y')!
    expect(elevIgm).toBeTruthy()
    expect(String(elevIgm.parameters?.expression)).toContain('15')
    expect(String(elevIgm.parameters?.expression)).toMatch(/3[0-9]/) // upper ≥30
    expect(inner.some(b => b.name === 'Chi_P_tip_deg')).toBe(true)
    expect(inner.some(b => b.name === 'Psi_P_raw_deg')).toBe(true)
    expect(inner.some(b => b.name === 'Psi_Y_raw_deg')).toBe(true)
    expect(inner.some(b => b.name === 'Psi_P_rate_lim')).toBe(true)
    expect(inner.some(b => b.name === 'beta_P_sel')).toBe(true)
    expect(inner.some(b => b.name === 'beta_Y_sel')).toBe(true)
    // Yaw parked (sat asin + Kp=2 still NaN); Chi_Z_psi_0
    expect(inner.find(b => b.name === 'Theta_Y_deg')?.type).toBe('source')
    expect(inner.some(b => b.name === 'Chi_Z_psi_0')).toBe(true)
    // Θ_P = elev_meas−90 (Chi_Y frame); not raw Body→S Euler pitch
    expect(String(inner.find(b => b.name === 'Theta_P_deg')!.parameters?.expression)).toContain(
      '90.0'
    )
    expect(inner.some(b => b.name === 'IGM_AP_DCM')).toBe(false)
    expect(inner.some(b => b.name === 'elev_cmd_sel')).toBe(true)
    expect(inner.some(b => b.name === 'elev_meas_rad')).toBe(true)
    expect(inner.some(b => b.name === 'C_bS')).toBe(true)
    expect(inner.some(b => b.name === 'V_S_mag')).toBe(true)
    expect(inner.some(b => b.name === 'beta_Y_from_rate')).toBe(true)
    expect(inner.some(b => b.name === 'neg_R')).toBe(false)
  })

  test('Aero_AirRel F&M into body sums with elev PD (isolation config)', () => {
    const aero = root.blocks.find(b => b.name === 'Aero_AirRel')!
    expect(aero.parameters?.inputPorts).toContain('mass_kg')
    const inner = aero.parameters?.sheets?.[0]?.blocks as SliceBlock[]
    expect(inner.some(b => b.name === 'CG_x_m')).toBe(true)
    const mb = root.blocks.find(b => b.name === 'M_b_sum')!
    expect(
      root.connections.some(
        c =>
          c.sourceBlockId === aero.id &&
          c.targetBlockId === mb.id &&
          c.sourcePortIndex === 1
      )
    ).toBe(true)
  })

  test('H1_Engine_Cluster uses mass-scheduled CG_x (RTW <S122>)', () => {
    const h1 = root.blocks.find(b => b.name === 'H1_Engine_Cluster')!
    expect(h1.parameters?.inputPorts).toEqual([
      'T_N',
      'beta_P_deg',
      'beta_Y_deg',
      'mass_kg'
    ])
    const inner = h1.parameters?.sheets?.[0]?.blocks as SliceBlock[]
    const cg = inner.find(b => b.name === 'CG_x_m')!
    expect(cg.type).toBe('lookup_1d')
    expect((cg.parameters?.inputValues as number[])?.at(-1)).toBe(582491)
    const eom = root.blocks.find(b => b.name === 'EOM_6DoF_VarMass')!
    const massToH1 = root.connections.find(
      c =>
        c.sourceBlockId === eom.id &&
        c.targetBlockId === h1.id &&
        c.targetPortIndex === 3
    )
    expect(massToH1).toBeTruthy()
  })

  test('codegen succeeds', () => {
    const gen = new CodeGenerator({
      modelName: 'saturn_ib_obliq_plant',
      integrationAlgorithm: 'rk4'
    })
    const result = gen.generate(model.sheets as any, model.parameters || [])
    expect(result.source).not.toMatch(/Error generating code for/)
    expect(result.source).toContain('_step')
    expect(result.header).toMatch(/bLiftoff|out_pad_h_m|thrust_N/)
    expect(result.header).toMatch(/r_i|omega_b|q_bE/)
  })
})

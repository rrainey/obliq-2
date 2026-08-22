/**
 * Obliq Product15 Chi path for LVDC_IGM — RTW `<S420>` + Product15 terminal.
 *
 * Wave A.1b: Gain1_h + T3_eff from φ-frame ΔV (matches `igmChiPipeline`),
 * not the parent AP·V diagnostic. φ_iT bias (`igmPhiIT` / `IGM_PHI_IT_SCALE`).
 *
 * Nested under `LVDC_IGM` (`codeGenStrategy: 'flatten'`). Double-nest port
 * remap is fixed — see `docs/codegen-double-nest-vector-types.md`.
 */

import type { SliceBlock, SliceWire } from './sliceModels'
import { mat3ToSourceValue } from './as205EciPlant'
import type { Mat3 } from './as205Mes'
import {
  IGM_AP_DCM,
  IGM_AP_DCM_T,
  IGM_V_T_MPS,
  IGM_R_T_M,
  IGM_XDOTDOT_VGT,
  IGM_PHI_IT_SCALE
} from './igmChiAssembly'
import { IGM_V_EX3_MPS } from './igmIntermediateParameters'
import { IGM_CHI_RATE_FREEZE_T3_S, IGM_GAIN5_K_SCALE } from './as205Igm'

let _id = 0
const nid = (p: string) => `p15_${p}_${++_id}`

export function resetIgmProduct15Ids(): void {
  _id = 0
}

function B(
  type: string,
  name: string,
  x: number,
  y: number,
  parameters: Record<string, unknown> = {}
): SliceBlock {
  return { id: nid(type), name, type, position: { x, y }, parameters }
}

function W(
  from: SliceBlock,
  to: SliceBlock,
  fromPort = 0,
  toPort = 0
): SliceWire {
  return {
    id: nid('w'),
    sourceBlockId: from.id,
    sourcePortIndex: fromPort,
    targetBlockId: to.id,
    targetPortIndex: toPort
  }
}

const PI = '3.141592653589793'
const RAD2DEG = `(180.0/${PI})`

/**
 * Nested `IGM_Product15_Chi` — AP·(R,V,G_S) → φ_T=atan2+φ_iT → dV0 →
 * local Gain1_h / T3_eff → S419/S420 → Product15=APᵀ·v_cmd → Chi_Y/Z/cmd.
 *
 * MDL `<S384>` / RTW Product10 uses **G_S** (gravity), not A_m / XYZdotdot.
 * Math Function5 transposes AP before terminal Product15.
 */
export function buildIgmProduct15ChiSubsystem(
  x: number,
  y: number
): {
  block: SliceBlock
  ports: {
    XS: number
    VS: number
    /** S-frame gravity (MDL G_V path / Product10), not A_m */
    GS: number
    T1: number
    tau3: number
    T3: number
    L1: number
    J1: number
    S1: number
    Q1: number
    P1: number
    U1: number
    L_prime_3: number
    J_prime_3: number
    tau1: number
    chiY: number
    chiZ: number
    chiCmd: number
  }
} {
  const blocks: SliceBlock[] = []
  const wires: SliceWire[] = []
  const push = (b: SliceBlock) => {
    blocks.push(b)
    return b
  }

  // —— inputs ——
  const inXS = push(
    B('input_port', 'XS_m', 40, 40, {
      portName: 'XS_m',
      dataType: 'double[3]',
      defaultValue: [0, 0, 0]
    })
  )
  const inVS = push(
    B('input_port', 'VS_mps', 40, 100, {
      portName: 'VS_mps',
      dataType: 'double[3]',
      defaultValue: [0, 0, 0]
    })
  )
  const inGS = push(
    B('input_port', 'G_S_mps2', 40, 160, {
      portName: 'G_S_mps2',
      dataType: 'double[3]',
      defaultValue: [0, 0, 0]
    })
  )
  const V_mag = push(B('mag', 'V_mag', 220, 100, {}))

  const scalarIns: Array<{
    name: string
    key:
      | 'T1'
      | 'tau3'
      | 'T3'
      | 'L1'
      | 'J1'
      | 'S1'
      | 'Q1'
      | 'P1'
      | 'U1'
      | 'L_prime_3'
      | 'J_prime_3'
      | 'tau1'
    y: number
  }> = [
    { name: 'T1', key: 'T1', y: 240 },
    { name: 'tau3', key: 'tau3', y: 290 },
    { name: 'T3', key: 'T3', y: 340 },
    { name: 'L1', key: 'L1', y: 390 },
    { name: 'J1', key: 'J1', y: 440 },
    { name: 'S1', key: 'S1', y: 490 },
    { name: 'Q1', key: 'Q1', y: 540 },
    { name: 'P1', key: 'P1', y: 590 },
    { name: 'U1', key: 'U1', y: 640 },
    { name: 'L_prime_3', key: 'L_prime_3', y: 690 },
    { name: 'J_prime_3', key: 'J_prime_3', y: 740 },
    { name: 'tau1', key: 'tau1', y: 790 }
  ]
  const inScal = {} as Record<(typeof scalarIns)[number]['key'], SliceBlock>
  for (const s of scalarIns) {
    inScal[s.key] = push(
      B('input_port', s.name, 40, s.y, {
        portName: s.name,
        dataType: 'double',
        defaultValue: 0
      })
    )
  }

  // 1. AP · XS → R_ap, AP · VS → V_ap, AP · G_S → G_ap (MDL Product10 path)
  const AP = push(
    B('source', 'P15_AP_DCM', 220, 40, {
      signalType: 'constant',
      value: mat3ToSourceValue(IGM_AP_DCM as Mat3),
      dataType: 'double[3][3]'
    })
  )
  const R_ap = push(B('matrix_multiply', 'P15_R_AP', 380, 40, {}))
  const V_ap = push(B('matrix_multiply', 'P15_V_AP', 380, 100, {}))
  const G_ap = push(B('matrix_multiply', 'P15_G_AP', 380, 160, {}))
  const dR = push(
    B('demux', 'P15_demux_R', 540, 20, {
      outputCount: 3,
      inputDimensions: [3]
    })
  )
  const dVap = push(
    B('demux', 'P15_demux_V', 540, 80, {
      outputCount: 3,
      inputDimensions: [3]
    })
  )
  const dGap = push(
    B('demux', 'P15_demux_G', 540, 140, {
      outputCount: 3,
      inputDimensions: [3]
    })
  )

  // 2. φ_iT (igmPhiIT) + φ_T = atan2(Rz, Rx) + φ_iT
  const T_star_phi = push(
    B('evaluate', 'T_star_phi', 560, 200, {
      numInputs: 2,
      expression: 'in(0)+in(1)'
    })
  )
  const L_prime_y_phi = push(
    B('evaluate', 'L_prime_y_phi', 560, 250, {
      numInputs: 2,
      expression: 'in(0)+in(1)'
    })
  )
  const phi_term1 = push(
    B('evaluate', 'phi_term1', 720, 200, {
      numInputs: 5,
      expression: 'in(0)*in(1)-in(2)+in(3)*in(4)'
    })
  )
  const phi_massTerm = push(
    B('evaluate', 'phi_massTerm', 720, 260, {
      numInputs: 6,
      expression: '(in(0)-in(1))*in(2)+(in(3)-in(4))*in(5)'
    })
  )
  const phi_term2 = push(
    B('evaluate', 'phi_term2', 880, 230, {
      numInputs: 3,
      expression: `in(0)*(1.8/${IGM_V_EX3_MPS})*(in(1)+in(2)-${IGM_V_T_MPS})`
    })
  )
  const phi_iT = push(
    B('evaluate', 'phi_iT_rad', 1040, 200, {
      numInputs: 3,
      expression: `(in(0)-in(1)+in(2))*${IGM_PHI_IT_SCALE}`
    })
  )
  const phi_T = push(
    B('evaluate', 'phi_T_rad', 720, 40, {
      numInputs: 3,
      expression: 'atan2(in(0),in(1))+in(2)'
    })
  )
  const cphi = push(
    B('evaluate', 'cos_phi', 880, 20, {
      numInputs: 1,
      expression: 'cos(in(0))'
    })
  )
  const sphi = push(
    B('evaluate', 'sin_phi', 880, 60, {
      numInputs: 1,
      expression: 'sin(in(0))'
    })
  )

  // 3. φ-frame: RTW Product9/10 DCM [c,0,s; 0,1,0; -s,0,c]
  //    Vt_x = c*Vx + s*Vz, Vt_y = Vy, Vt_z = -s*Vx + c*Vz
  const Vt_x = push(
    B('evaluate', 'Vt_x', 1040, 40, {
      numInputs: 4,
      expression: 'in(0)*in(2)+in(1)*in(3)' // c*Vx + s*Vz
    })
  )
  const Vt_y = push(
    B('evaluate', 'Vt_y', 1040, 80, {
      numInputs: 1,
      expression: 'in(0)'
    })
  )
  const Vt_z = push(
    B('evaluate', 'Vt_z', 1040, 120, {
      numInputs: 4,
      expression: '-in(0)*in(1)+in(2)*in(3)' // -s*Vx + c*Vz
    })
  )
  // φ-frame gravity G_t = same DCM · G_ap  (MDL Product10)
  const Gt_x = push(
    B('evaluate', 'Gt_x', 1040, 180, {
      numInputs: 4,
      expression: 'in(0)*in(2)+in(1)*in(3)'
    })
  )
  const Gt_y = push(
    B('evaluate', 'Gt_y', 1040, 220, {
      numInputs: 1,
      expression: 'in(0)'
    })
  )
  const Gt_z = push(
    B('evaluate', 'Gt_z', 1040, 260, {
      numInputs: 4,
      expression: '-in(0)*in(1)+in(2)*in(3)'
    })
  )
  const Rt_x = push(
    B('evaluate', 'Rt_x', 1040, 320, {
      numInputs: 4,
      expression: 'in(0)*in(2)+in(1)*in(3)'
    })
  )
  const Rt_y = push(
    B('evaluate', 'Rt_y', 1040, 360, {
      numInputs: 1,
      expression: 'in(0)'
    })
  )

  // 4. Two-pass ΔV (`igmChiPipeline`): dV0 at T1+T3 → Gain1_h → T3_eff
  //    then dV / T_star at T1+T3_eff for χ_α/β and S420.
  const dV0x = push(
    B('evaluate', 'dV0x', 1120, 40, {
      numInputs: 3,
      expression: `0.0-in(0)-in(1)*0.5*(${IGM_XDOTDOT_VGT}+in(2))`
    })
  )
  const dV0y = push(
    B('evaluate', 'dV0y', 1120, 90, {
      numInputs: 3,
      expression: '0.0-in(0)-in(1)*0.5*(0.0+in(2))'
    })
  )
  const dV0z = push(
    B('evaluate', 'dV0z', 1120, 140, {
      numInputs: 3,
      expression: `(${IGM_V_T_MPS})-in(0)-in(1)*0.5*(0.0+in(2))`
    })
  )
  const dV0_mag2 = push(
    B('evaluate', 'dV0_mag2', 1280, 40, {
      numInputs: 3,
      expression: 'in(0)*in(0)+in(1)*in(1)+in(2)*in(2)'
    })
  )
  const Gain1_h = push(
    B('evaluate', 'Gain1_h', 1440, 40, {
      numInputs: 2,
      // (|dV0|² / L_y_seed − L_y_seed) / 2 ; L_y_seed = L1+L′3
      expression: 'in(1)>1e-9?(in(0)/in(1)-in(1))*0.5:0.0'
    })
  )
  const T3_eff = push(
    B('evaluate', 'T3_eff', 1600, 40, {
      numInputs: 3,
      // T3 + (τ3−T3)*Gain5_k_scale*Gain1_h
      expression: `in(0)+((in(1)-in(0))*${IGM_GAIN5_K_SCALE})*in(2)`
    })
  )
  const T_star = push(
    B('evaluate', 'T_star', 1760, 40, {
      numInputs: 2,
      expression: 'in(0)+in(1)'
    })
  )

  // 5. ΔV (second pass) = V_T − V − T*_eff·½(A_VT + A)
  const dVx = push(
    B('evaluate', 'dVx', 1760, 100, {
      numInputs: 3,
      expression: `0.0-in(0)-in(1)*0.5*(${IGM_XDOTDOT_VGT}+in(2))`
    })
  )
  const dVy = push(
    B('evaluate', 'dVy', 1760, 160, {
      numInputs: 3,
      expression: '0.0-in(0)-in(1)*0.5*(0.0+in(2))'
    })
  )
  const dVz = push(
    B('evaluate', 'dVz', 1760, 220, {
      numInputs: 3,
      expression: `(${IGM_V_T_MPS})-in(0)-in(1)*0.5*(0.0+in(2))`
    })
  )

  // 6. χ_α = atan(dVx/dVz); χ_β = atan(dVy / hypot(dVx,dVz)) — safe denoms
  const chi_a = push(
    B('evaluate', 'chi_a_rad', 1360, 100, {
      numInputs: 2,
      expression: 'atan(in(0)/(abs(in(1))<1e-12?(in(1)>=0?1e-12:-1e-12):in(1)))'
    })
  )
  const chi_b = push(
    B('evaluate', 'chi_b_rad', 1360, 160, {
      numInputs: 3,
      expression:
        'atan(in(0)/(sqrt(in(1)*in(1)+in(2)*in(2))<1e-12?1e-12:sqrt(in(1)*in(1)+in(2)*in(2))))'
    })
  )

  // 7. S419 live Gain1_h + T3_eff (`igmS419Combos`)
  //    Add11 = L'3 + Gain1_h
  const Add11 = push(
    B('evaluate', 'Add11', 1200, 280, {
      numInputs: 2,
      expression: 'in(0)+in(1)'
    })
  )
  //    J_3 = T3_eff * Gain1_h + J'3
  const J_3 = push(
    B('evaluate', 'J_3', 1200, 340, {
      numInputs: 3,
      expression: 'in(0)*in(1)+in(2)'
    })
  )
  //    S_3 = T3_eff * Add11 − J_3
  const S_3 = push(
    B('evaluate', 'S_3', 1360, 280, {
      numInputs: 3,
      expression: 'in(0)*in(1)-in(2)'
    })
  )
  //    Q_3 = S_3*tau3 − ½ V_ex3 T3_eff²
  const Q_3 = push(
    B('evaluate', 'Q_3', 1520, 280, {
      numInputs: 3,
      expression: `in(0)*in(1)-0.5*${IGM_V_EX3_MPS}*in(2)*in(2)`
    })
  )
  //    Q_y = Q1 + Q_3 + S_3*T1 + J1*T3_eff
  const Q_y = push(
    B('evaluate', 'Q_y', 1680, 280, {
      numInputs: 6,
      expression: 'in(0)+in(1)+in(2)*in(3)+in(4)*in(5)'
    })
  )
  //    L_y = L1 + Add11
  const L_y = push(
    B('evaluate', 'L_y_p15', 1360, 340, {
      numInputs: 2,
      expression: 'in(0)+in(1)'
    })
  )
  //    J_y = J1 + J_3 + Add11*T1
  const J_y = push(
    B('evaluate', 'J_y_p15', 1520, 340, {
      numInputs: 4,
      expression: 'in(0)+in(1)+in(2)*in(3)'
    })
  )
  //    S_y = S1 − J_3 + L_y*T3_eff
  const S_y = push(
    B('evaluate', 'S_y', 1680, 340, {
      numInputs: 4,
      expression: 'in(0)-in(1)+in(2)*in(3)'
    })
  )
  //    L_over_J = L_y / J_y
  const L_over_J = push(
    B('evaluate', 'L_over_J_p15', 1840, 340, {
      numInputs: 2,
      expression: 'abs(in(1))>1e-12?in(0)/in(1):0.0'
    })
  )

  // 8. χ̇_β, C2, C4, S_p, ΔX_V, K_p, U_term, χ̇_α  (igmS420Product15)
  const chi_b_rate = push(
    B('evaluate', 'chi_b_rate', 1840, 100, {
      numInputs: 8,
      // in: T*, Ay, Vy, Ry, Sy, Qy, L/J, chi_b
      expression:
        '((0.5*in(0)*in(0)*in(1)+(in(2)*in(0)+in(3)))+sin(in(7))*in(4))/(((in(4)-in(5)*in(6))*cos(in(7)))==0?1e-12:((in(4)-in(5)*in(6))*cos(in(7))))'
    })
  )
  const chi_b_rate_LJ = push(
    B('evaluate', 'chi_b_rate_LJ', 2000, 100, {
      numInputs: 2,
      expression: 'in(0)*in(1)'
    })
  )
  const C_2 = push(
    B('evaluate', 'C_2', 1840, 160, {
      numInputs: 3,
      expression: 'sin(in(0))*in(1)+cos(in(0))' // sinβ * χ̇β + cosβ
    })
  )
  const C_4 = push(
    B('evaluate', 'C_4', 2000, 160, {
      numInputs: 2,
      expression: 'sin(in(0))*in(1)'
    })
  )
  const S_p = push(
    B('evaluate', 'S_p', 2160, 160, {
      numInputs: 4,
      expression: 'in(0)*in(1)-in(2)*in(3)' // Sy*C2 − Qy*C4
    })
  )
  const DeltaX_V = push(
    B('evaluate', 'DeltaX_V', 2160, 220, {
      numInputs: 6,
      // Rx − RT + Vx*T* + ½ T*² Ax + sinα Sp
      expression: `(in(0)-${IGM_R_T_M})+in(1)*in(2)+0.5*in(2)*in(2)*in(3)+sin(in(4))*in(5)`
    })
  )

  // K_p — Add11 = L'3+Gain1_h, J_3 = T3_eff*Gain1_h+J'3
  const halfVexT3 = push(
    B('evaluate', 'half_Vex3_T3sq', 2160, 280, {
      numInputs: 1,
      expression: `0.5*${IGM_V_EX3_MPS}*in(0)*in(0)`
    })
  )
  const K_p_den_core = push(
    B('evaluate', 'K_p_den_core', 2320, 220, {
      numInputs: 6,
      // P1 + (2*T1+tau3)*J_3 − halfVex + T1²*Add11
      expression: 'in(0)+(2.0*in(1)+in(2))*in(3)-in(4)+in(1)*in(1)*in(5)'
    })
  )
  const K_p = push(
    B('evaluate', 'K_p', 2480, 160, {
      numInputs: 6,
      // Ly, chi_b, C2, Jy, den_core, C4
      expression:
        'in(0)*cos(in(1))/((in(2)*in(3)-in(4)*in(5))==0?1e-12:(in(2)*in(3)-in(4)*in(5)))'
    })
  )

  // U_term = (2T1+τ3)*Q3 − (Vex3/6)T3_eff³ + U1 + S3*T1² + T3_eff*P1
  const U_term = push(
    B('evaluate', 'U_term', 2320, 280, {
      numInputs: 7,
      expression: `(2.0*in(0)+in(1))*in(2)-(${IGM_V_EX3_MPS}/6.0)*in(3)*in(3)*in(3)+in(4)+in(5)*in(0)*in(0)+in(3)*in(6)`
    })
  )
  // χ̇_α = ΔX_V / ((Sp − (C2*Qy − U_term*C4)*Kp) * cos α)
  const chi_a_rate = push(
    B('evaluate', 'chi_a_rate', 2480, 220, {
      numInputs: 8,
      expression:
        'in(0)/((((in(1)-(in(2)*in(3)-in(4)*in(5))*in(6))*cos(in(7)))==0)?1e-12:((in(1)-(in(2)*in(3)-in(4)*in(5))*in(6))*cos(in(7))))'
    })
  )
  const chi_a_rate_Kp = push(
    B('evaluate', 'chi_a_rate_Kp', 2640, 220, {
      numInputs: 2,
      expression: 'in(0)*in(1)'
    })
  )

  // 9. Freeze χ-rates when T3_eff ≤ 15 (RTW Compare). Wave C restores RTW.
  const sw_a = push(
    B('evaluate', 'sw_chi_a_rate', 2640, 100, {
      numInputs: 2,
      expression: `in(1)<=${IGM_CHI_RATE_FREEZE_T3_S}?0.0:in(0)`
    })
  )
  const sw_a_Kp = push(
    B('evaluate', 'sw_chi_a_rate_Kp', 2800, 100, {
      numInputs: 2,
      expression: `in(1)<=${IGM_CHI_RATE_FREEZE_T3_S}?0.0:in(0)`
    })
  )
  const sw_b = push(
    B('evaluate', 'sw_chi_b_rate', 2640, 40, {
      numInputs: 2,
      expression: `in(1)<=${IGM_CHI_RATE_FREEZE_T3_S}?0.0:in(0)`
    })
  )
  const sw_b_LJ = push(
    B('evaluate', 'sw_chi_b_rate_LJ', 2800, 40, {
      numInputs: 2,
      expression: `in(1)<=${IGM_CHI_RATE_FREEZE_T3_S}?0.0:in(0)`
    })
  )

  // 10. chi_a_cmd = chi_a − (sw_a − sw_a_Kp*1.6) − φ_T − π/2
  //     chi_b_cmd = chi_b − (sw_b − sw_b_LJ*1.6)
  const chi_a_cmd = push(
    B('evaluate', 'chi_a_cmd', 2960, 100, {
      numInputs: 4,
      expression: `in(0)-(in(1)-in(2)*1.6)-in(3)-${PI}/2.0`
    })
  )
  const chi_b_cmd = push(
    B('evaluate', 'chi_b_cmd', 2960, 160, {
      numInputs: 3,
      expression: 'in(0)-(in(1)-in(2)*1.6)'
    })
  )

  // 11. v_cmd = [cos(a)*cos(b), sin(b), −sin(a)*cos(b)]; Product15 = APᵀ · v_cmd
  const AP_T = push(
    B('source', 'P15_AP_DCM_T', 3280, 40, {
      signalType: 'constant',
      value: mat3ToSourceValue(IGM_AP_DCM_T as Mat3),
      dataType: 'double[3][3]'
    })
  )
  const v_cmd_x = push(
    B('evaluate', 'v_cmd_x', 3120, 80, {
      numInputs: 2,
      expression: 'cos(in(0))*cos(in(1))'
    })
  )
  const v_cmd_y = push(
    B('evaluate', 'v_cmd_y', 3120, 120, {
      numInputs: 1,
      expression: 'sin(in(0))'
    })
  )
  const v_cmd_z = push(
    B('evaluate', 'v_cmd_z', 3120, 160, {
      numInputs: 2,
      expression: '-sin(in(0))*cos(in(1))'
    })
  )
  const v_cmd = push(
    B('mux', 'v_cmd', 3280, 100, {
      rows: 1,
      cols: 3,
      baseType: 'double',
      outputType: 'double[3]',
      outputShape: 'vector'
    })
  )
  const v15 = push(B('matrix_multiply', 'Product15', 3440, 100, {}))
  const dv15 = push(
    B('demux', 'demux_Product15', 3600, 80, {
      outputCount: 3,
      inputDimensions: [3]
    })
  )

  // 12. Chi_Y = deg(atan2(−vz, vx)); Chi_Z = sat(deg(atan(vy/√(1−vy²))), ±45)
  const chiY = push(
    B('evaluate', 'Chi_Y_deg', 3760, 80, {
      numInputs: 2,
      expression: `atan2(-in(0),in(1))*${RAD2DEG}`
    })
  )
  const chiZ = push(
    B('evaluate', 'Chi_Z_deg', 3760, 140, {
      numInputs: 1,
      expression: `((atan(in(0)/(sqrt(1.0-in(0)*in(0))<1e-12?1e-12:sqrt(1.0-in(0)*in(0)))))*${RAD2DEG})>45.0?45.0:(((atan(in(0)/(sqrt(1.0-in(0)*in(0))<1e-12?1e-12:sqrt(1.0-in(0)*in(0)))))*${RAD2DEG})<-45.0?-45.0:((atan(in(0)/(sqrt(1.0-in(0)*in(0))<1e-12?1e-12:sqrt(1.0-in(0)*in(0)))))*${RAD2DEG}))`
    })
  )

  // 13. Chi_cmd = [0, Chi_Y, Chi_Z]
  const z0 = push(
    B('source', 'Chi_X_0', 3760, 200, {
      signalType: 'constant',
      value: 0,
      dataType: 'double'
    })
  )
  const chiCmd = push(
    B('mux', 'Chi_cmd_deg', 3920, 120, {
      rows: 1,
      cols: 3,
      baseType: 'double',
      outputType: 'double[3]',
      outputShape: 'vector'
    })
  )
  const outY = push(
    B('output_port', 'Chi_Y_deg', 4080, 80, {
      portName: 'Chi_Y_deg',
      dataType: 'double'
    })
  )
  const outZ = push(
    B('output_port', 'Chi_Z_deg', 4080, 140, {
      portName: 'Chi_Z_deg',
      dataType: 'double'
    })
  )
  const outCmd = push(
    B('output_port', 'Chi_cmd_deg', 4080, 200, {
      portName: 'Chi_cmd_deg',
      dataType: 'double[3]'
    })
  )
  // Wave A.4: export φ-frame Add8 terms for parent DSM / HSL
  const outG1h = push(
    B('output_port', 'Gain1_h', 4080, 260, {
      portName: 'Gain1_h',
      dataType: 'double'
    })
  )
  const outT3eff = push(
    B('output_port', 'T3_eff', 4080, 320, {
      portName: 'T3_eff',
      dataType: 'double'
    })
  )

  wires.push(
    W(AP, R_ap, 0, 0),
    W(inXS, R_ap, 0, 1),
    W(AP, V_ap, 0, 0),
    W(inVS, V_ap, 0, 1),
    W(inVS, V_mag),
    W(AP, G_ap, 0, 0),
    W(inGS, G_ap, 0, 1),
    W(R_ap, dR),
    W(V_ap, dVap),
    W(G_ap, dGap),
    // φ_iT
    W(inScal.T1, T_star_phi, 0, 0),
    W(inScal.T3, T_star_phi, 0, 1),
    W(inScal.L1, L_prime_y_phi, 0, 0),
    W(inScal.L_prime_3, L_prime_y_phi, 0, 1),
    W(V_mag, phi_term1, 0, 0),
    W(T_star_phi, phi_term1, 0, 1),
    W(inScal.J_prime_3, phi_term1, 0, 2),
    W(L_prime_y_phi, phi_term1, 0, 3),
    W(inScal.T3, phi_term1, 0, 4),
    W(inScal.tau1, phi_massTerm, 0, 0),
    W(inScal.T1, phi_massTerm, 0, 1),
    W(inScal.L1, phi_massTerm, 0, 2),
    W(inScal.tau3, phi_massTerm, 0, 3),
    W(inScal.T3, phi_massTerm, 0, 4),
    W(inScal.L_prime_3, phi_massTerm, 0, 5),
    W(phi_massTerm, phi_term2, 0, 0),
    W(L_prime_y_phi, phi_term2, 0, 1),
    W(V_mag, phi_term2, 0, 2),
    W(phi_term1, phi_iT, 0, 0),
    W(phi_term2, phi_iT, 0, 1),
    W(inScal.S1, phi_iT, 0, 2),
    W(dR, phi_T, 2, 0), // Rz
    W(dR, phi_T, 0, 1), // Rx
    W(phi_iT, phi_T, 0, 2),
    W(phi_T, cphi),
    W(phi_T, sphi),
    // Vt
    W(cphi, Vt_x, 0, 0),
    W(sphi, Vt_x, 0, 1),
    W(dVap, Vt_x, 0, 2),
    W(dVap, Vt_x, 2, 3),
    W(dVap, Vt_y, 1, 0),
    W(sphi, Vt_z, 0, 0),
    W(dVap, Vt_z, 0, 1),
    W(cphi, Vt_z, 0, 2),
    W(dVap, Vt_z, 2, 3),
    // At
    W(cphi, Gt_x, 0, 0),
    W(sphi, Gt_x, 0, 1),
    W(dGap, Gt_x, 0, 2),
    W(dGap, Gt_x, 2, 3),
    W(dGap, Gt_y, 1, 0),
    W(sphi, Gt_z, 0, 0),
    W(dGap, Gt_z, 0, 1),
    W(cphi, Gt_z, 0, 2),
    W(dGap, Gt_z, 2, 3),
    // Rt_x/y for ΔX_V / χ̇β
    W(cphi, Rt_x, 0, 0),
    W(sphi, Rt_x, 0, 1),
    W(dR, Rt_x, 0, 2),
    W(dR, Rt_x, 2, 3),
    W(dR, Rt_y, 1, 0),
    // dV0 at T1+T3 (T_star_phi) → Gain1_h → T3_eff → T_star
    W(Vt_x, dV0x, 0, 0),
    W(T_star_phi, dV0x, 0, 1),
    W(Gt_x, dV0x, 0, 2),
    W(Vt_y, dV0y, 0, 0),
    W(T_star_phi, dV0y, 0, 1),
    W(Gt_y, dV0y, 0, 2),
    W(Vt_z, dV0z, 0, 0),
    W(T_star_phi, dV0z, 0, 1),
    W(Gt_z, dV0z, 0, 2),
    W(dV0x, dV0_mag2, 0, 0),
    W(dV0y, dV0_mag2, 0, 1),
    W(dV0z, dV0_mag2, 0, 2),
    W(dV0_mag2, Gain1_h, 0, 0),
    W(L_prime_y_phi, Gain1_h, 0, 1),
    W(inScal.T3, T3_eff, 0, 0),
    W(inScal.tau3, T3_eff, 0, 1),
    W(Gain1_h, T3_eff, 0, 2),
    W(inScal.T1, T_star, 0, 0),
    W(T3_eff, T_star, 0, 1),
    W(Vt_x, dVx, 0, 0),
    W(T_star, dVx, 0, 1),
    W(Gt_x, dVx, 0, 2),
    W(Vt_y, dVy, 0, 0),
    W(T_star, dVy, 0, 1),
    W(Gt_y, dVy, 0, 2),
    W(Vt_z, dVz, 0, 0),
    W(T_star, dVz, 0, 1),
    W(Gt_z, dVz, 0, 2),
    W(dVx, chi_a, 0, 0),
    W(dVz, chi_a, 0, 1),
    W(dVy, chi_b, 0, 0),
    W(dVx, chi_b, 0, 1),
    W(dVz, chi_b, 0, 2),
    // S419 live Gain1_h / T3_eff (local φ-frame)
    W(inScal.L_prime_3, Add11, 0, 0),
    W(Gain1_h, Add11, 0, 1),
    W(T3_eff, J_3, 0, 0),
    W(Gain1_h, J_3, 0, 1),
    W(inScal.J_prime_3, J_3, 0, 2),
    W(T3_eff, S_3, 0, 0),
    W(Add11, S_3, 0, 1),
    W(J_3, S_3, 0, 2),
    W(S_3, Q_3, 0, 0),
    W(inScal.tau3, Q_3, 0, 1),
    W(T3_eff, Q_3, 0, 2),
    W(inScal.Q1, Q_y, 0, 0),
    W(Q_3, Q_y, 0, 1),
    W(S_3, Q_y, 0, 2),
    W(inScal.T1, Q_y, 0, 3),
    W(inScal.J1, Q_y, 0, 4),
    W(T3_eff, Q_y, 0, 5),
    W(inScal.L1, L_y, 0, 0),
    W(Add11, L_y, 0, 1),
    W(inScal.J1, J_y, 0, 0),
    W(J_3, J_y, 0, 1),
    W(Add11, J_y, 0, 2),
    W(inScal.T1, J_y, 0, 3),
    W(inScal.S1, S_y, 0, 0),
    W(J_3, S_y, 0, 1),
    W(L_y, S_y, 0, 2),
    W(T3_eff, S_y, 0, 3),
    W(L_y, L_over_J, 0, 0),
    W(J_y, L_over_J, 0, 1),
    // chi_b_rate: T*, Ay, Vy, Ry, Sy, Qy, L/J, chi_b
    W(T_star, chi_b_rate, 0, 0),
    W(Gt_y, chi_b_rate, 0, 1),
    W(Vt_y, chi_b_rate, 0, 2),
    W(Rt_y, chi_b_rate, 0, 3),
    W(S_y, chi_b_rate, 0, 4),
    W(Q_y, chi_b_rate, 0, 5),
    W(L_over_J, chi_b_rate, 0, 6),
    W(chi_b, chi_b_rate, 0, 7),
    W(chi_b_rate, chi_b_rate_LJ, 0, 0),
    W(L_over_J, chi_b_rate_LJ, 0, 1),
    W(chi_b, C_2, 0, 0),
    W(chi_b_rate, C_2, 0, 1),
    W(chi_b, C_4, 0, 0),
    W(chi_b_rate_LJ, C_4, 0, 1),
    W(S_y, S_p, 0, 0),
    W(C_2, S_p, 0, 1),
    W(Q_y, S_p, 0, 2),
    W(C_4, S_p, 0, 3),
    // DeltaX_V: Rx, Vx, T*, Ax, chi_a, Sp
    W(Rt_x, DeltaX_V, 0, 0),
    W(Vt_x, DeltaX_V, 0, 1),
    W(T_star, DeltaX_V, 0, 2),
    W(Gt_x, DeltaX_V, 0, 3),
    W(chi_a, DeltaX_V, 0, 4),
    W(S_p, DeltaX_V, 0, 5),
    W(T3_eff, halfVexT3),
    W(inScal.P1, K_p_den_core, 0, 0),
    W(inScal.T1, K_p_den_core, 0, 1),
    W(inScal.tau3, K_p_den_core, 0, 2),
    W(J_3, K_p_den_core, 0, 3),
    W(halfVexT3, K_p_den_core, 0, 4),
    W(Add11, K_p_den_core, 0, 5),
    W(L_y, K_p, 0, 0),
    W(chi_b, K_p, 0, 1),
    W(C_2, K_p, 0, 2),
    W(J_y, K_p, 0, 3),
    W(K_p_den_core, K_p, 0, 4),
    W(C_4, K_p, 0, 5),
    // U_term: T1, tau3, Q3, T3_eff, U1, S3, P1
    W(inScal.T1, U_term, 0, 0),
    W(inScal.tau3, U_term, 0, 1),
    W(Q_3, U_term, 0, 2),
    W(T3_eff, U_term, 0, 3),
    W(inScal.U1, U_term, 0, 4),
    W(S_3, U_term, 0, 5),
    W(inScal.P1, U_term, 0, 6),
    // chi_a_rate: dX, Sp, C2, Qy, U, C4, Kp, chi_a
    W(DeltaX_V, chi_a_rate, 0, 0),
    W(S_p, chi_a_rate, 0, 1),
    W(C_2, chi_a_rate, 0, 2),
    W(Q_y, chi_a_rate, 0, 3),
    W(U_term, chi_a_rate, 0, 4),
    W(C_4, chi_a_rate, 0, 5),
    W(K_p, chi_a_rate, 0, 6),
    W(chi_a, chi_a_rate, 0, 7),
    W(chi_a_rate, chi_a_rate_Kp, 0, 0),
    W(K_p, chi_a_rate_Kp, 0, 1),
    W(chi_a_rate, sw_a, 0, 0),
    W(T3_eff, sw_a, 0, 1),
    W(chi_a_rate_Kp, sw_a_Kp, 0, 0),
    W(T3_eff, sw_a_Kp, 0, 1),
    W(chi_b_rate, sw_b, 0, 0),
    W(T3_eff, sw_b, 0, 1),
    W(chi_b_rate_LJ, sw_b_LJ, 0, 0),
    W(T3_eff, sw_b_LJ, 0, 1),
    W(chi_a, chi_a_cmd, 0, 0),
    W(sw_a, chi_a_cmd, 0, 1),
    W(sw_a_Kp, chi_a_cmd, 0, 2),
    W(phi_T, chi_a_cmd, 0, 3),
    W(chi_b, chi_b_cmd, 0, 0),
    W(sw_b, chi_b_cmd, 0, 1),
    W(sw_b_LJ, chi_b_cmd, 0, 2),
    W(chi_a_cmd, v_cmd_x, 0, 0),
    W(chi_b_cmd, v_cmd_x, 0, 1),
    W(chi_b_cmd, v_cmd_y),
    W(chi_a_cmd, v_cmd_z, 0, 0),
    W(chi_b_cmd, v_cmd_z, 0, 1),
    W(v_cmd_x, v_cmd, 0, 0),
    W(v_cmd_y, v_cmd, 0, 1),
    W(v_cmd_z, v_cmd, 0, 2),
    W(AP_T, v15, 0, 0), // RTW: transpose(AP) · v_cmd
    W(v_cmd, v15, 0, 1),
    W(v15, dv15),
    W(dv15, chiY, 2, 0), // vz → in(0); vx → in(1); expression uses −vz
    W(dv15, chiY, 0, 1),
    W(dv15, chiZ, 1, 0), // vy
    W(z0, chiCmd, 0, 0),
    W(chiY, chiCmd, 0, 1),
    W(chiZ, chiCmd, 0, 2),
    W(chiY, outY),
    W(chiZ, outZ),
    W(chiCmd, outCmd),
    W(Gain1_h, outG1h),
    W(T3_eff, outT3eff)
  )

  const block = B('subsystem', 'IGM_Product15_Chi', x, y, {
    sheets: [
      {
        id: nid('sheet'),
        name: 'IGM Product15 Chi',
        blocks,
        connections: wires,
        extents: { width: 4240, height: 980 }
      }
    ],
    inputPorts: [
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
    ],
    outputPorts: [
      'Chi_Y_deg',
      'Chi_Z_deg',
      'Chi_cmd_deg',
      'Gain1_h',
      'T3_eff'
    ],
    showEnableInput: false,
    codeGenStrategy: 'flatten'
  })

  return {
    block,
    ports: {
      XS: 0,
      VS: 1,
      GS: 2,
      T1: 3,
      tau3: 4,
      T3: 5,
      L1: 6,
      J1: 7,
      S1: 8,
      Q1: 9,
      P1: 10,
      U1: 11,
      L_prime_3: 12,
      J_prime_3: 13,
      tau1: 14,
      chiY: 0,
      chiZ: 1,
      chiCmd: 2,
      Gain1_h: 3,
      T3_eff: 4
    }
  }
}

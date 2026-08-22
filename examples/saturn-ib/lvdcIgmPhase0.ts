/**
 * Phase 0–1 IGM — MDL-first.
 *
 * - `LVDC_SFrame_Nav` ≈ MDL "LVDC S-Frame Position & Velocity Calculations"
 * - `IGM_Intermediate_Parameters` ≈ MDL sheet (EDD 4.4.20–28)
 * - `LVDC_IGM` shell ≈ MDL "LVDC Iterative Guidance Mode" + nested Intermediate
 *
 * See LVDC_SFRAME_IGM_INVENTORY.md.
 */

import type { SliceBlock, SliceWire } from './sliceModels'
import { mat3ToSourceValue } from './as205EciPlant'
import type { Mat3 } from './as205Mes'
import {
  IGM_V_EX1_MPS,
  IGM_V_EX3_MPS
} from './igmIntermediateParameters'
import {
  IGM_T3_I_IC_S,
  IGM_CUTOFF_TGO_S,
  IGM_SMC_DV_SOURCE,
  IGM_T_HSL_S,
  IGM_TAU1_PRESET_S,
  IGM_TAU3_PRESET_S,
  IGM_ART_TAU_WINDOW_S,
  IGM_TAU3_N_S
} from './as205Igm'
import { IGM_V_EX3_MPS } from './igmIntermediateParameters'
import { buildIgmProduct15ChiSubsystem } from './igmProduct15Obliq'
import { appendIgmSmcyY, appendIgmSmczZ } from './igmSmcyObliq'

let _id = 0
const nid = (p: string) => `lvdc_${p}_${++_id}`
export function resetLvdcPhase0Ids() {
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

/** MDL Estimated Grav mask μ (m³/s²) */
export const LVDC_MU_MDL = 3.986032e14

/**
 * S-frame nav feeding IGM ports 1–6.
 * Ins: r_i[3], v_b[3], q_bE[4x1], mass, thrust_N
 * Outs: XS, XSdot, G_S, A_m, FoverM, MF_S
 */
export function buildLvdcSFrameNavSubsystem(
  x: number,
  y: number,
  mes: Mat3,
  opts: { mdlWireAttitude?: boolean } = {}
): {
  block: SliceBlock
  ports: {
    r_i: number
    v_b: number
    q: number
    mass: number
    thrust: number
    XS: number
    XSdot: number
    G_S: number
    A_m: number
    FoverM: number
    MF_S: number
  }
} {
  const blocks: SliceBlock[] = []
  const wires: SliceWire[] = []
  const push = (b: SliceBlock) => {
    blocks.push(b)
    return b
  }

  const inR = push(
    B('input_port', 'r_i', 40, 40, {
      portName: 'r_i',
      dataType: 'double[3]',
      defaultValue: [0, 0, 0]
    })
  )
  const inVb = push(
    B('input_port', 'v_b', 40, 100, {
      portName: 'v_b',
      dataType: 'double[3]',
      defaultValue: [0, 0, 0]
    })
  )
  const inQ = push(
    B('input_port', 'q_bE', 40, 160, {
      portName: 'q_bE',
      dataType: 'double[4][1]',
      defaultValue: [[1], [0], [0], [0]]
    })
  )
  const inM = push(
    B('input_port', 'mass_kg', 40, 220, {
      portName: 'mass_kg',
      dataType: 'double',
      defaultValue: 1
    })
  )
  const inT = push(
    B('input_port', 'thrust_N', 40, 280, {
      portName: 'thrust_N',
      dataType: 'double',
      defaultValue: 0
    })
  )

  const MES = push(
    B('source', 'MES_E_to_S', 200, 40, {
      signalType: 'constant',
      value: mat3ToSourceValue(mes),
      dataType: 'double[3][3]'
    })
  )
  // Legacy: quat_to_dcm = body→E. mdlWire: quat_to_dcm = ASB (E→body); C_bE = Transpose.
  const C_q = push(
    B('orientation_conversion', 'C_from_q', 200, 160, {
      conversionType: 'quat_to_dcm'
    })
  )
  const C_bE = opts.mdlWireAttitude
    ? push(B('transpose', 'C_bE', 280, 160, {}))
    : C_q
  const XS = push(B('matrix_multiply', 'XS_m', 400, 40, {}))
  const v_E = push(B('matrix_multiply', 'v_E', 400, 120, {}))
  const XSdot = push(B('matrix_multiply', 'XSdot_mps', 560, 120, {}))
  const rMag = push(B('mag', 'R_S_mag', 560, 40, {}))

  // G_S = -mu * XS / |r|^3  (component-wise via evaluate on demux)
  const demuxX = push(
    B('demux', 'demux_XS', 720, 40, {
      outputCount: 3,
      inputDimensions: [3]
    })
  )
  const Gx = push(
    B('evaluate', 'G_S_x', 880, 20, {
      numInputs: 2,
      expression: `-(${LVDC_MU_MDL})*in(0)/(in(1)*in(1)*in(1))`
    })
  )
  const Gy = push(
    B('evaluate', 'G_S_y', 880, 80, {
      numInputs: 2,
      expression: `-(${LVDC_MU_MDL})*in(0)/(in(1)*in(1)*in(1))`
    })
  )
  const Gz = push(
    B('evaluate', 'G_S_z', 880, 140, {
      numInputs: 2,
      expression: `-(${LVDC_MU_MDL})*in(0)/(in(1)*in(1)*in(1))`
    })
  )
  const G_S = push(
    B('mux', 'G_S_bar_mps2', 1040, 60, {
      rows: 1,
      cols: 3,
      baseType: 'double',
      outputType: 'double[3]',
      outputShape: 'vector'
    })
  )

  const FoverM = push(
    B('evaluate', 'FoverM_mps2', 400, 220, {
      numInputs: 2,
      expression: 'in(1) > 1.0 ? in(0)/in(1) : 0.0'
    })
  )
  const MF_S = push(
    B('evaluate', 'MF_S', 400, 280, {
      numInputs: 2,
      expression: 'in(0) > 1.0 ? in(1)/in(0) : 0.0'
    })
  )

  // A_m ≈ (F/m) * body-X in S  (thrust along +X_b)
  const e1 = push(
    B('source', 'e1_body', 200, 340, {
      signalType: 'constant',
      value: [1, 0, 0],
      dataType: 'double[3]'
    })
  )
  const Xb_E = push(B('matrix_multiply', 'Xb_in_E', 400, 340, {}))
  const Xb_S = push(B('matrix_multiply', 'Xb_in_S', 560, 340, {}))
  const demuxXb = push(
    B('demux', 'demux_Xb_S', 720, 340, {
      outputCount: 3,
      inputDimensions: [3]
    })
  )
  const Ax = push(
    B('multiply', 'A_m_x', 880, 300, { numInputs: 2 })
  )
  const Ay = push(
    B('multiply', 'A_m_y', 880, 360, { numInputs: 2 })
  )
  const Az = push(
    B('multiply', 'A_m_z', 880, 420, { numInputs: 2 })
  )
  const A_m = push(
    B('mux', 'A_m_bar_mps2', 1040, 340, {
      rows: 1,
      cols: 3,
      baseType: 'double',
      outputType: 'double[3]',
      outputShape: 'vector'
    })
  )

  const outXS = push(
    B('output_port', 'XS_m', 1200, 40, {
      portName: 'XS_m',
      dataType: 'double[3]'
    })
  )
  const outXSd = push(
    B('output_port', 'XSdot_mps', 1200, 100, {
      portName: 'XSdot_mps',
      dataType: 'double[3]'
    })
  )
  const outG = push(
    B('output_port', 'G_S_bar_mps2', 1200, 160, {
      portName: 'G_S_bar_mps2',
      dataType: 'double[3]'
    })
  )
  const outA = push(
    B('output_port', 'A_m_bar_mps2', 1200, 220, {
      portName: 'A_m_bar_mps2',
      dataType: 'double[3]'
    })
  )
  const outFom = push(
    B('output_port', 'FoverM_mps2', 1200, 280, {
      portName: 'FoverM_mps2',
      dataType: 'double'
    })
  )
  const outMF = push(
    B('output_port', 'MF_S', 1200, 340, {
      portName: 'MF_S',
      dataType: 'double'
    })
  )

  wires.push(
    W(inQ, C_q),
    ...(opts.mdlWireAttitude ? [W(C_q, C_bE)] : []),
    W(MES, XS, 0, 0),
    W(inR, XS, 0, 1),
    W(C_bE, v_E, 0, 0),
    W(inVb, v_E, 0, 1),
    W(MES, XSdot, 0, 0),
    W(v_E, XSdot, 0, 1),
    W(XS, rMag),
    W(XS, demuxX),
    W(demuxX, Gx, 0, 0),
    W(rMag, Gx, 0, 1),
    W(demuxX, Gy, 1, 0),
    W(rMag, Gy, 0, 1),
    W(demuxX, Gz, 2, 0),
    W(rMag, Gz, 0, 1),
    W(Gx, G_S, 0, 0),
    W(Gy, G_S, 0, 1),
    W(Gz, G_S, 0, 2),
    W(inT, FoverM, 0, 0),
    W(inM, FoverM, 0, 1),
    W(inT, MF_S, 0, 0),
    W(inM, MF_S, 0, 1),
    W(C_bE, Xb_E, 0, 0),
    W(e1, Xb_E, 0, 1),
    W(MES, Xb_S, 0, 0),
    W(Xb_E, Xb_S, 0, 1),
    W(Xb_S, demuxXb),
    W(FoverM, Ax, 0, 0),
    W(demuxXb, Ax, 0, 1),
    W(FoverM, Ay, 0, 0),
    W(demuxXb, Ay, 1, 1),
    W(FoverM, Az, 0, 0),
    W(demuxXb, Az, 2, 1),
    W(Ax, A_m, 0, 0),
    W(Ay, A_m, 0, 1),
    W(Az, A_m, 0, 2),
    W(XS, outXS),
    W(XSdot, outXSd),
    W(G_S, outG),
    W(A_m, outA),
    W(FoverM, outFom),
    W(MF_S, outMF)
  )

  const block = B('subsystem', 'LVDC_SFrame_Nav', x, y, {
    sheets: [
      {
        id: nid('sheet'),
        name: 'LVDC S-Frame Position & Velocity Calculations',
        blocks,
        connections: wires,
        extents: { width: 1400, height: 500 }
      }
    ],
    inputPorts: ['r_i', 'v_b', 'q_bE', 'mass_kg', 'thrust_N'],
    outputPorts: [
      'XS_m',
      'XSdot_mps',
      'G_S_bar_mps2',
      'A_m_bar_mps2',
      'FoverM_mps2',
      'MF_S'
    ],
    showEnableInput: false,
    codeGenStrategy: 'flatten'
  })

  return {
    block,
    ports: {
      r_i: 0,
      v_b: 1,
      q: 2,
      mass: 3,
      thrust: 4,
      XS: 0,
      XSdot: 1,
      G_S: 2,
      A_m: 3,
      FoverM: 4,
      MF_S: 5
    }
  }
}

/**
 * MDL `IGM Intermediate Parameters` — one evaluate per outport (EDD 4.4.20–28).
 * Ins: tau_1, T_1_i, tau_3, T_3_i. Requires T < τ for finite log.
 */
export function buildIgmIntermediateParametersSubsystem(
  x: number,
  y: number
): {
  block: SliceBlock
  ports: {
    tau1: number
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
    L_prime_y: number
    J_prime_3: number
  }
} {
  const blocks: SliceBlock[] = []
  const wires: SliceWire[] = []
  const push = (b: SliceBlock) => {
    blocks.push(b)
    return b
  }

  const inTau1 = push(
    B('input_port', 'tau_1_sec', 40, 40, {
      portName: 'tau_1_sec',
      dataType: 'double',
      defaultValue: 286.9
    })
  )
  const inT1 = push(
    B('input_port', 'T_1_i_sec', 40, 100, {
      portName: 'T_1_i_sec',
      dataType: 'double',
      defaultValue: 200
    })
  )
  const inTau3 = push(
    B('input_port', 'tau_3_sec', 40, 160, {
      portName: 'tau_3_sec',
      dataType: 'double',
      defaultValue: 262.52
    })
  )
  const inT3 = push(
    B('input_port', 'T_3_i_sec', 40, 220, {
      portName: 'T_3_i_sec',
      dataType: 'double',
      defaultValue: 116
    })
  )

  const V1 = IGM_V_EX1_MPS
  const V3 = IGM_V_EX3_MPS

  // L1 = V_ex1 * log(τ1/(τ1−T1))
  const L1 = push(
    B('evaluate', 'L1', 280, 40, {
      numInputs: 2,
      expression: `${V1}*log(in(0)/(in(0)-in(1)))`
    })
  )
  // J1 = L1*τ1 − T1*V_ex1
  const J1 = push(
    B('evaluate', 'J1', 280, 100, {
      numInputs: 3,
      expression: `in(0)*in(1) - in(2)*${V1}`
    })
  )
  // S1 = L1*T1 − J1
  const S1 = push(
    B('evaluate', 'S1', 280, 160, {
      numInputs: 3,
      expression: 'in(0)*in(1) - in(2)'
    })
  )
  // Q1 = S1*τ1 − ½ V_ex1 T1²
  const Q1 = push(
    B('evaluate', 'Q1', 280, 220, {
      numInputs: 3,
      expression: `in(0)*in(1) - 0.5*${V1}*in(2)*in(2)`
    })
  )
  // P1 = J1*τ1 − ½ V_ex1 T1²
  const P1 = push(
    B('evaluate', 'P1', 280, 280, {
      numInputs: 3,
      expression: `in(0)*in(1) - 0.5*${V1}*in(2)*in(2)`
    })
  )
  // U1 = Q1*τ1 − (V_ex1/6) T1³
  const U1 = push(
    B('evaluate', 'U1', 280, 340, {
      numInputs: 3,
      expression: `in(0)*in(1) - (${V1}/6.0)*in(2)*in(2)*in(2)`
    })
  )
  const Lp3 = push(
    B('evaluate', 'L_prime_3', 280, 400, {
      numInputs: 2,
      expression: `${V3}*log(in(0)/(in(0)-in(1)))`
    })
  )
  const Lpy = push(
    B('evaluate', 'L_prime_y', 280, 460, {
      numInputs: 2,
      expression: 'in(0)+in(1)'
    })
  )
  const Jp3 = push(
    B('evaluate', 'J_prime_3', 280, 520, {
      numInputs: 3,
      expression: `in(0)*in(1) - in(2)*${V3}`
    })
  )

  const outs = [
    ['L1', L1, 40],
    ['J1', J1, 100],
    ['S1', S1, 160],
    ['Q1', Q1, 220],
    ['P1', P1, 280],
    ['U1', U1, 340],
    ['L_prime_3', Lp3, 400],
    ['L_prime_y', Lpy, 460],
    ['J_prime_3', Jp3, 520]
  ] as const

  const outBlocks = outs.map(([name, src, yy]) => {
    const o = push(
      B('output_port', name, 520, yy, {
        portName: name,
        dataType: 'double'
      })
    )
    wires.push(W(src, o))
    return o
  })

  wires.push(
    W(inTau1, L1, 0, 0),
    W(inT1, L1, 0, 1),
    W(L1, J1, 0, 0),
    W(inTau1, J1, 0, 1),
    W(inT1, J1, 0, 2),
    W(L1, S1, 0, 0),
    W(inT1, S1, 0, 1),
    W(J1, S1, 0, 2),
    W(S1, Q1, 0, 0),
    W(inTau1, Q1, 0, 1),
    W(inT1, Q1, 0, 2),
    W(J1, P1, 0, 0),
    W(inTau1, P1, 0, 1),
    W(inT1, P1, 0, 2),
    W(Q1, U1, 0, 0),
    W(inTau1, U1, 0, 1),
    W(inT1, U1, 0, 2),
    W(inTau3, Lp3, 0, 0),
    W(inT3, Lp3, 0, 1),
    W(L1, Lpy, 0, 0),
    W(Lp3, Lpy, 0, 1),
    W(Lp3, Jp3, 0, 0),
    W(inTau3, Jp3, 0, 1),
    W(inT3, Jp3, 0, 2)
  )

  void outBlocks

  const block = B('subsystem', 'IGM_Intermediate_Parameters', x, y, {
    sheets: [
      {
        id: nid('sheet'),
        name: 'IGM Intermediate Parameters',
        blocks,
        connections: wires,
        extents: { width: 700, height: 600 }
      }
    ],
    inputPorts: ['tau_1_sec', 'T_1_i_sec', 'tau_3_sec', 'T_3_i_sec'],
    outputPorts: [
      'L1',
      'J1',
      'S1',
      'Q1',
      'P1',
      'U1',
      'L_prime_3',
      'L_prime_y',
      'J_prime_3'
    ],
    showEnableInput: false,
    codeGenStrategy: 'flatten'
  })

  return {
    block,
    ports: {
      tau1: 0,
      T1: 1,
      tau3: 2,
      T3: 3,
      L1: 0,
      J1: 1,
      S1: 2,
      Q1: 3,
      P1: 4,
      U1: 5,
      L_prime_3: 6,
      L_prime_y: 7,
      J_prime_3: 8
    }
  }
}

/**
 * IGM shell — MDL port contract + Enable + discrete First Phase / T_go +
 * Add8 export + HSL + Intermediate + nested Product15 Chi.
 *
 * Wave A.2–A.4: δT floor ZOH; First Phase→Phase2 Multiport; Add8 DSM from φ Gain1_h.
 * Product15: φ-frame Gain1_h (A.1b). Artificial-τ modes still collapsed.
 */
export function buildLvdcIgmShellSubsystem(
  x: number,
  y: number
): {
  block: SliceBlock
  ports: {
    XS: number
    XSdot: number
    G_S: number
    A_m: number
    FoverM: number
    MF_S: number
    T3: number
    ChiSample: number
    /** Explicit enable for Chi hold (same as subsystem enable) */
    igmEnable: number
    /** Chi_cmd_deg output index */
    chiCmd: number
    /** Chi_Y_deg scalar output index */
    chiY: number
    /** HSL bCutoff output index */
    bCutoff: number
    /** Live T_3_i (Add8-corrected) output index */
    T3i: number
  }
} {
  const blocks: SliceBlock[] = []
  const wires: SliceWire[] = []
  const push = (b: SliceBlock) => {
    blocks.push(b)
    return b
  }

  const names = [
    ['XS_m', 'double[3]'],
    ['XSdot_mps', 'double[3]'],
    ['G_S_bar_mps2', 'double[3]'],
    ['A_m_bar_mps2', 'double[3]'],
    ['FoverM_mps2', 'double'],
    ['MF_S', 'double'],
    ['T3_sec', 'double'],
    ['Chi_minor_loop_sample', 'double[3]'],
    /** Same as subsystem enable — gates Chi outs (flatten still runs algebra). */
    ['igm_enable', 'double']
  ] as const

  names.forEach(([name, dt], i) => {
    push(
      B('input_port', name, 40, 40 + i * 50, {
        portName: name,
        dataType: dt,
        defaultValue: dt.includes('[') ? [0, 0, 0] : 0
      })
    )
  })

  /*
   * Wave A.2/A.3 + B art-τ: discrete δT = 1.6 s
   *   T1 = 286.9 − zoh (RTW T_1_i IC = τ1 ✓)
   *   Phase2 @ T1≤δT; hold T3 for P_C≈33.4 s while blending τ3
   *   (RTW modes 1→2); mode-3 T3 countdown + τ3 = MF_S·V_ex3
   * Multiport Switch → Intermediate.
   */
  const DELTA_T = 1.6
  const TAU1_IC = IGM_TAU1_PRESET_S
  const ZOH_PHASE2 = 285.3 // TAU1_IC − δT
  const ZOH_T3_COUNT = 318.7 // ZOH_PHASE2 + ART_TAU_HOLD (33.4)
  const TAU3_N = IGM_TAU3_N_S
  const tau1 = push(
    B('source', 'tau_1_preset', 320, 40, {
      signalType: 'constant',
      value: TAU1_IC,
      dataType: 'double'
    })
  )
  const one = push(
    B('source', 'guid_one', 200, 100, {
      signalType: 'constant',
      value: 1,
      dataType: 'double'
    })
  )
  const t0guid = push(
    B('source', 'guid_t0', 200, 140, {
      signalType: 'constant',
      value: 0,
      dataType: 'double'
    })
  )
  // Advances only while LVDC_IGM enabled (derivative gated)
  const guidElapsed = push(
    B('integrator', 'guid_elapsed_sec', 320, 100, {
      showInitPort: true,
      initialValue: 0,
      showResetInput: false
    })
  )
  // Stepped elapsed on δT grid aligned to IGM enable (not absolute model time)
  const guidZoh = push(
    B('evaluate', 'guid_elapsed_zoh', 480, 100, {
      numInputs: 1,
      expression: `floor(in(0)/${DELTA_T})*${DELTA_T}`
    })
  )

  const mfIn = blocks.find(b => b.name === 'MF_S')!
  /*
   * First Phase Multiport τ1 (RTW `<S357>` / `<S387>/Gain2`):
   *   τ1_eff = RateLimit(sat(M/F, ±4)) · V_ex1
   *   NOT the DSM preset tau_1=286.9 (that is modes 1+).
   * Rate: ±0.008 per 1.6 s sample ⇒ ±0.005 /s.
   */
  const mfSat = push(
    B('evaluate', 'MF_S_sat', 400, 40, {
      numInputs: 1,
      expression: 'in(0)<-4?-4:(in(0)>4?4:in(0))'
    })
  )
  const mfRateLim = push(
    B('rate_limiter', 'MF_S_rate_lim', 480, 40, {
      risingSlewLimit: 0.005,
      fallingSlewLimit: -0.005,
      initialOutput: 0
    })
  )
  const tau1First = push(
    B('evaluate', 'tau_1_first_phase', 560, 40, {
      numInputs: 1,
      expression: `in(0)*${IGM_V_EX1_MPS}`
    })
  )
  // Multiport[0]: First Phase → τ1_eff; Phase2+ → preset τ1
  const tau1Mp = push(
    B('evaluate', 'tau_1_multiport', 720, 40, {
      numInputs: 3,
      // in0=zoh, in1=tau1_first, in2=tau1_preset
      expression: `in(0)<${ZOH_PHASE2}?in(1):in(2)`
    })
  )
  /*
   * τ3 path (RTW artificial-τ):
   *   First Phase: preset 262.52
   *   Art-τ: blend τ3_N → MF_S·V_ex3 with (P_C/35)^4
   *   Mode 3+: τ3 = clamp(MF_S·V_ex3, 50, 800)
   */
  const tau3 = push(
    B('evaluate', 'tau_3_live', 480, 220, {
      numInputs: 2,
      // in0=zoh, in1=MF_S
      // u=(P_C/35); blend = (τ3_N−Pc) + (τ_nat−(τ3_N−Pc))*u^4
      expression:
        `in(0)<${ZOH_PHASE2}?${IGM_TAU3_PRESET_S}:` +
        `(in(0)<${ZOH_T3_COUNT}?` +
        `((${TAU3_N}-(in(0)-${ZOH_PHASE2}))+` +
        `((in(1)*${IGM_V_EX3_MPS}<50?50:(in(1)*${IGM_V_EX3_MPS}>800?800:in(1)*${IGM_V_EX3_MPS}))-(${TAU3_N}-(in(0)-${ZOH_PHASE2})))*` +
        `((in(0)-${ZOH_PHASE2})/${IGM_ART_TAU_WINDOW_S})*((in(0)-${ZOH_PHASE2})/${IGM_ART_TAU_WINDOW_S})*((in(0)-${ZOH_PHASE2})/${IGM_ART_TAU_WINDOW_S})*((in(0)-${ZOH_PHASE2})/${IGM_ART_TAU_WINDOW_S}))` +
        `:(in(1)*${IGM_V_EX3_MPS}<50?50:(in(1)*${IGM_V_EX3_MPS}>800?800:in(1)*${IGM_V_EX3_MPS})))`
    })
  )

  const T1 = push(
    B('evaluate', 'T_1_i_clamped', 640, 40, {
      numInputs: 2,
      // 286.9 − zoh, clamp (0, τ1−ε)
      expression:
        `((${TAU1_IC}-in(0))<0?0:((${TAU1_IC}-in(0))>in(1)-1e-3?in(1)-1e-3:(${TAU1_IC}-in(0))))`
    })
  )
  const phase2 = push(
    B('evaluate', 'phase2_active', 640, 160, {
      numInputs: 1,
      expression: `in(0) <= ${DELTA_T} ? 1.0 : 0.0`
    })
  )
  // Hold T3 through First Phase + art-τ; countdown after zoh≥318.7 (mode 3)
  const T3 = push(
    B('evaluate', 'T_3_i_clamped', 640, 220, {
      numInputs: 1,
      expression:
        `in(0)<${ZOH_T3_COUNT}?${IGM_T3_I_IC_S}:((${IGM_T3_I_IC_S}-(in(0)-${ZOH_T3_COUNT}))<0?0:(${IGM_T3_I_IC_S}-(in(0)-${ZOH_T3_COUNT})))`
    })
  )
  // Mode 3+: T3 countdown / HSL arm
  const tgoActive = push(
    B('evaluate', 'tgo_active', 640, 280, {
      numInputs: 1,
      expression: `in(0)>=${ZOH_T3_COUNT}?1.0:0.0`
    })
  )
  /*
   * MDL Multiport Switch `<S356>`: [τ1_mp, T1, τ3_live, T3] → Intermediate.
   * Mode 0 τ1_mp = MF_rate·V_ex1; later modes use preset τ1.
   */
  const multiport = push(
    B('mux', 'Multiport_Switch', 800, 100, {
      rows: 1,
      cols: 4,
      baseType: 'double',
      outputType: 'double[4]',
      outputShape: 'vector'
    })
  )
  const demuxMp = push(
    B('demux', 'demux_Multiport', 960, 100, {
      outputCount: 4,
      inputDimensions: [4]
    })
  )

  const inter = buildIgmIntermediateParametersSubsystem(640, 40)
  push(inter.block)

  /*
   * Chi Steering — Product15 with live K_p, local φ-frame Gain1_h / T3_eff, φ_iT.
   * See igmProduct15Obliq.ts / igmChiPipeline.
   */
  const xsIn = blocks.find(b => b.name === 'XS_m')!
  const xsDotIn = blocks.find(b => b.name === 'XSdot_mps')!
  const gIn = blocks.find(b => b.name === 'G_S_bar_mps2')!
  const aIn = blocks.find(b => b.name === 'A_m_bar_mps2')!
  const p15 = buildIgmProduct15ChiSubsystem(640, 480)
  push(p15.block)
  const demuxVsSmcy = push(
    B('demux', 'demux_VS_SMCY', 1280, 480, {
      outputCount: 3,
      inputDimensions: [3]
    })
  )
  // RTW Gain3 from accel quant; Obliq default as_zoh → A_m demux
  const demuxAsSmcy = push(
    B('demux', 'demux_AS_SMC', 1280, 560, {
      outputCount: 3,
      inputDimensions: [3]
    })
  )
  const dvDemuxSmc =
    IGM_SMC_DV_SOURCE === 'as_zoh' ? demuxAsSmcy : demuxVsSmcy
  // Product15 Chi_Y (raw) — holder evaluate so SMCY can attach
  const chiYRaw = push(
    B('evaluate', 'Chi_Y_deg_raw', 1440, 480, {
      numInputs: 1,
      expression: 'in(0)'
    })
  )
  const t3EventBlk = blocks.find(b => b.name === 'T3_sec')!
  const smcy = appendIgmSmcyY(blocks, wires, {
    t3Event: t3EventBlk,
    T3i: T3,
    chiYRawDeg: chiYRaw,
    dvDemux: dvDemuxSmc,
    x: 1600,
    y: 480
  })
  const chiZRaw = push(
    B('evaluate', 'Chi_Z_deg_raw', 1440, 560, {
      numInputs: 1,
      expression: 'in(0)'
    })
  )
  const smcz = appendIgmSmczZ(blocks, wires, {
    t3Event: t3EventBlk,
    T3i: T3,
    chiZRawDeg: chiZRaw,
    dvDemux: dvDemuxSmc,
    x: 1600,
    y: 700
  })
  const chiX0 = push(
    B('source', 'Chi_X_0_cmd', 1760, 500, {
      signalType: 'constant',
      value: 0,
      dataType: 'double'
    })
  )
  const chiCmdSmc = push(
    B('mux', 'Chi_cmd_deg_SMC', 1840, 500, {
      rows: 1,
      cols: 3,
      baseType: 'double',
      outputType: 'double[3]',
      outputShape: 'vector'
    })
  )
  /*
   * RTW Chi DSM: only updates while IGM enabled; holds last (IC 0) otherwise.
   * Flatten still evaluates Product15 when disabled — gate outputs explicitly.
   */
  const enIn = blocks.find(b => b.name === 'igm_enable')!
  const chiYHold = push(
    B('unit_delay', 'Chi_Y_hold', 1920, 560, {
      initialValue: 0,
      sampleInterval: 0.005,
      dataType: 'double'
    })
  )
  const chiZHold = push(
    B('unit_delay', 'Chi_Z_hold', 1920, 620, {
      initialValue: 0,
      sampleInterval: 0.005,
      dataType: 'double'
    })
  )
  const chiYGated = push(
    B('evaluate', 'Chi_Y_deg_gated', 2000, 560, {
      numInputs: 3,
      expression: 'in(0)>=0.5?in(1):in(2)'
    })
  )
  const chiZGated = push(
    B('evaluate', 'Chi_Z_deg_gated', 2000, 620, {
      numInputs: 3,
      expression: 'in(0)>=0.5?in(1):in(2)'
    })
  )
  const chiCmdGated = push(
    B('mux', 'Chi_cmd_deg_gated', 2080, 500, {
      rows: 1,
      cols: 3,
      baseType: 'double',
      outputType: 'double[3]',
      outputShape: 'vector'
    })
  )
  const outChi = push(
    B('output_port', 'Chi_cmd_deg', 2240, 500, {
      portName: 'Chi_cmd_deg',
      dataType: 'double[3]'
    })
  )
  const outChiY = push(
    B('output_port', 'Chi_Y_deg', 2240, 560, {
      portName: 'Chi_Y_deg',
      dataType: 'double'
    })
  )
  const outL1 = push(
    B('output_port', 'L1', 1220, 160, {
      portName: 'L1',
      dataType: 'double'
    })
  )

  const t3In = blocks.find(b => b.name === 'T3_sec')!
  const t3Sink = push(
    B('evaluate', 'T3_event_hold', 320, 400, {
      numInputs: 1,
      expression: 'in(0)'
    })
  )

  // S419 L_y = L1 + L′3 (Gain1_h=0 seed); L_over_J = L_y / J_y
  const L_y = push(
    B('evaluate', 'L_y', 900, 220, {
      numInputs: 2,
      expression: 'in(0)+in(1)'
    })
  )
  const J_y = push(
    B('evaluate', 'J_y', 900, 280, {
      numInputs: 2,
      expression: 'in(0)+in(1)'
    })
  )
  const L_over_J = push(
    B('evaluate', 'L_over_J', 900, 340, {
      numInputs: 2,
      expression: 'abs(in(1))>1e-12 ? in(0)/in(1) : 0.0'
    })
  )
  const outLoverJ = push(
    B('output_port', 'L_over_J', 1220, 220, {
      portName: 'L_over_J',
      dataType: 'double'
    })
  )

  /*
   * Wave A.4 — Add8-corrected cutoff from Product15 φ-frame T3_eff:
   *   Product15(T3_base) → T3_eff / Gain1_h (exported)
   *   HSL/bCutoff use live T3_eff (clamped ≥0)
   *   Multiport keeps T3_base (full DSM→Intermediate deferred — wild Gain1_h
   *   NaN'd Intermediate/Chi when T3_eff was written back).
   * No continuous rate write-back (prior sat −5 → 20 s cutoff).
   */
  const T3_eff_pos = push(
    B('evaluate', 'T_3_i_eff_pos', 1440, 280, {
      numInputs: 1,
      expression: 'in(0)<0?0:in(0)'
    })
  )
  /*
   * HSL Cutoff Timing: Phase2 ∧ T3_eff ≤ thresholds.
   */
  const nHSL = push(
    B('evaluate', 'nHSLActive', 1600, 340, {
      numInputs: 2,
      // in0=T3_eff, in1=tgo_active
      expression: `in(1)>=0.5 && in(0) <= ${IGM_T_HSL_S} ? 1.0 : 0.0`
    })
  )
  const bCutoff = push(
    B('evaluate', 'bCutoff', 1600, 400, {
      numInputs: 2,
      // Keep cut@T3≤HSL(5): RTW 0.04 + freeze@15 tumbled; freeze@5+cut@0.04
      // added ~5 s frozen-Chi thrust and collapsed Ve_y (−48%).
      expression: `in(1)>=0.5 && in(0) <= ${IGM_T_HSL_S} ? 1.0 : 0.0`
    })
  )
  const outT3i = push(
    B('output_port', 'T_3_i_sec', 1920, 160, {
      portName: 'T_3_i_sec',
      dataType: 'double'
    })
  )
  const outT3eff = push(
    B('output_port', 'T_3_i_Add8', 1920, 220, {
      portName: 'T_3_i_Add8',
      dataType: 'double'
    })
  )
  const outHSL = push(
    B('output_port', 'nHSLActive', 1760, 340, {
      portName: 'nHSLActive',
      dataType: 'double'
    })
  )
  const outCutoff = push(
    B('output_port', 'bCutoff', 1760, 400, {
      portName: 'bCutoff',
      dataType: 'double'
    })
  )

  // Export live T1; nIGMMode: 0=First Phase, 1=Phase2, 4=HSL (RTW-ish)
  const outT1 = push(
    B('output_port', 'T_1_i_sec', 1220, 100, {
      portName: 'T_1_i_sec',
      dataType: 'double'
    })
  )
  const nIGMMode = push(
    B('evaluate', 'nIGMMode', 900, 400, {
      numInputs: 3,
      // in0=T1, in1=T3, in2=tgo (mode3+): 0 First, 2 art-τ, 3 Phase2, 4 HSL
      expression: `in(0)>1.6?0.0:(in(2)<0.5?2.0:(in(1)<=${IGM_T_HSL_S}?4.0:3.0))`
    })
  )
  const outMode = push(
    B('output_port', 'nIGMMode', 1220, 340, {
      portName: 'nIGMMode',
      dataType: 'double'
    })
  )

  wires.push(
    // Guidance elapsed (enable-gated) → floor ZOH → discrete T1; Phase2 → T3
    W(one, guidElapsed, 0, 0),
    W(t0guid, guidElapsed, 0, 1),
    W(guidElapsed, guidZoh),
    W(guidZoh, T1, 0, 0),
    W(tau1, T1, 0, 1),
    W(T1, phase2),
    W(guidZoh, tau3, 0, 0),
    W(mfIn, tau3, 0, 1),
    W(guidZoh, T3),
    W(guidZoh, tgoActive),
    // First Phase τ1_eff = RL(sat(MF))·V_ex1
    W(mfIn, mfSat),
    W(mfSat, mfRateLim),
    W(mfRateLim, tau1First),
    W(guidZoh, tau1Mp, 0, 0),
    W(tau1First, tau1Mp, 0, 1),
    W(tau1, tau1Mp, 0, 2),
    // Multiport [τ1_mp, T1, τ3_live, T3] → Intermediate (MDL Multiport Switch)
    W(tau1Mp, multiport, 0, 0),
    W(T1, multiport, 0, 1),
    W(tau3, multiport, 0, 2),
    W(T3, multiport, 0, 3),
    W(multiport, demuxMp),
    W(demuxMp, inter.block, 0, inter.ports.tau1),
    W(demuxMp, inter.block, 1, inter.ports.T1),
    W(demuxMp, inter.block, 2, inter.ports.tau3),
    W(demuxMp, inter.block, 3, inter.ports.T3),
    W(inter.block, outL1, inter.ports.L1, 0),
    W(T1, outT1),
    W(inter.block, L_y, inter.ports.L1, 0),
    W(inter.block, L_y, inter.ports.L_prime_3, 1),
    W(inter.block, J_y, inter.ports.J1, 0),
    W(inter.block, J_y, inter.ports.J_prime_3, 1),
    W(L_y, L_over_J, 0, 0),
    W(J_y, L_over_J, 0, 1),
    W(L_over_J, outLoverJ),
    // Product15 Chi — Multiport T1/τ/T3_base (Add8 inside P15)
    // MDL Product10 / <S384>: gravity G_S into ΔV — not A_m / XYZdotdot
    W(xsIn, p15.block, 0, p15.ports.XS),
    W(xsDotIn, p15.block, 0, p15.ports.VS),
    W(gIn, p15.block, 0, p15.ports.GS),
    W(demuxMp, p15.block, 1, p15.ports.T1),
    W(demuxMp, p15.block, 2, p15.ports.tau3),
    W(demuxMp, p15.block, 3, p15.ports.T3),
    W(inter.block, p15.block, inter.ports.L1, p15.ports.L1),
    W(inter.block, p15.block, inter.ports.J1, p15.ports.J1),
    W(inter.block, p15.block, inter.ports.S1, p15.ports.S1),
    W(inter.block, p15.block, inter.ports.Q1, p15.ports.Q1),
    W(inter.block, p15.block, inter.ports.P1, p15.ports.P1),
    W(inter.block, p15.block, inter.ports.U1, p15.ports.U1),
    W(inter.block, p15.block, inter.ports.L_prime_3, p15.ports.L_prime_3),
    W(inter.block, p15.block, inter.ports.J_prime_3, p15.ports.J_prime_3),
    W(demuxMp, p15.block, 0, p15.ports.tau1),
    W(xsDotIn, demuxVsSmcy),
    W(aIn, demuxAsSmcy),
    W(p15.block, chiYRaw, p15.ports.chiY, 0),
    W(p15.block, chiZRaw, p15.ports.chiZ, 0),
    W(chiX0, chiCmdSmc, 0, 0),
    W(smcy.Chi_Y_deg, chiCmdSmc, 0, 1),
    W(smcz.Chi_Z_deg, chiCmdSmc, 0, 2),
    // Enable-gate Chi outs (hold when IGM off)
    W(enIn, chiYGated, 0, 0),
    W(smcy.Chi_Y_deg, chiYGated, 0, 1),
    W(chiYHold, chiYGated, 0, 2),
    W(chiYGated, chiYHold),
    W(enIn, chiZGated, 0, 0),
    W(smcz.Chi_Z_deg, chiZGated, 0, 1),
    W(chiZHold, chiZGated, 0, 2),
    W(chiZGated, chiZHold),
    W(chiX0, chiCmdGated, 0, 0),
    W(chiYGated, chiCmdGated, 0, 1),
    W(chiZGated, chiCmdGated, 0, 2),
    W(chiCmdGated, outChi),
    W(chiYGated, outChiY),
    // A.4: export T3_eff; HSL/bCutoff on raw T3 (T3_eff stays high via Add8
    // and missed early cutoff — tumble window).
    W(p15.block, T3_eff_pos, p15.ports.T3_eff, 0),
    W(T3, outT3i),
    W(T3_eff_pos, outT3eff),
    W(T3, nHSL, 0, 0),
    W(tgoActive, nHSL, 0, 1),
    W(nHSL, outHSL),
    W(T3, bCutoff, 0, 0),
    W(tgoActive, bCutoff, 0, 1),
    W(bCutoff, outCutoff),
    W(T1, nIGMMode, 0, 0),
    W(T3, nIGMMode, 0, 1),
    W(tgoActive, nIGMMode, 0, 2),
    W(nIGMMode, outMode),
    W(t3In, t3Sink)
  )

  const block = B('subsystem', 'LVDC_IGM', x, y, {
    sheets: [
      {
        id: nid('sheet'),
        name: 'LVDC Iterative Guidance Mode',
        blocks,
        connections: wires,
        extents: { width: 1900, height: 650 }
      }
    ],
    inputPorts: names.map(n => n[0]),
    outputPorts: [
      'Chi_cmd_deg',
      'L1',
      'L_over_J',
      'T_1_i_sec',
      'nIGMMode',
      'Chi_Y_deg',
      'T_3_i_sec',
      'T_3_i_Add8',
      'nHSLActive',
      'bCutoff'
    ],
    showEnableInput: true,
    codeGenStrategy: 'flatten'
  })

  return {
    block,
    ports: {
      XS: 0,
      XSdot: 1,
      G_S: 2,
      A_m: 3,
      FoverM: 4,
      MF_S: 5,
      T3: 6,
      ChiSample: 7,
      igmEnable: 8,
      chiCmd: 0,
      chiY: 5,
      T3i: 6,
      bCutoff: 9
    }
  }
}

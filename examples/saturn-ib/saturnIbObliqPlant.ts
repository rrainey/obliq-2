/**
 * Obliq plant mirroring saturn_ib_stack.mdl nested subsystem structure.
 *
 * Root sheet ≈ Saturn_IB_Stack contents. Named subsystems match Simulink
 * for discrepancy isolation. Leaves are real (9.x physics) or stubs.
 *
 * Consumed by lib_SaturnIBObliq via cgen → SaturnIBPlantObliq mapper.
 */

import type { SliceBlock, SliceModel, SliceSheet, SliceWire } from './sliceModels'
import { sliceToModelData } from './sliceModels'
import { buildEomSubsystemBlock } from './sixDofVarMassEom'
import {
  as205DefaultPadStateEci,
  mat3ToSourceValue
} from './as205EciPlant'
import type { Mat3 } from './as205Mes'
import {
  table5ThrustTimeBreakpoints,
  table5ThrustN,
  table5MdotFromMass
} from './as205ThrustTable'
import {
  J2_THRUST_TIME_BIAS_S,
  J2_THRUST_TIME_S,
  J2_THRUST_N,
  J2_MDOT_AT_REF_KGPS,
  J2_MDOT_REF_THRUST_N,
  SIVB_MASS_STOP_KG
} from './as205J2'
import {
  IGM_ENABLE_T3_S,
  IGM_TIP_ELEV_MIN_DEG,
  IGM_TIP_ELEV_MAX_DEG
} from './as205Igm'
import {
  buildLvdcSFrameNavSubsystem,
  buildLvdcIgmShellSubsystem,
  resetLvdcPhase0Ids
} from './lvdcIgmPhase0'

import { H1_GIMBAL_LIMIT_DEG } from './as205Engines'
import { AS205_PAD, OMEGA_EARTH } from './as205PadFrames'
import {
  AERO_S_REF_M2,
  CA_MACH_BREAKPOINTS,
  CA_VALUES,
  CN_ANGLE_DEG_BREAKPOINTS,
  CN_MACH_BREAKPOINTS,
  CN_TABLE,
  CP_MACH_BREAKPOINTS,
  CP_VALUES_M,
  SIB_CG_MASS_BREAKPOINTS_KG,
  SIB_CG_X_M,
  SIB_CG_Y_M,
  SIB_CG_Z_M
} from './as205Aero'
import {
  table2bChiTimeBreakpoints,
  table2bPlantElevDeg
} from './as205ChiTable'
import {
  CHI_TO_PSI_RATE_LIMIT_DEG_S,
  CHI_TO_PSI_SAT_DEG
} from './igmChiToPsi'

let _id = 0
const nid = (p: string) => `${p}_${++_id}`
export function resetSaturnIbPlantIds() {
  _id = 0
  resetLvdcPhase0Ids()
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

export type PortSpec = { name: string; dataType?: string }

/** Named stub subsystem: each output driven by a typed zero (or 0). */
export function makeStubSubsystem(
  name: string,
  x: number,
  y: number,
  inputs: PortSpec[],
  outputs: PortSpec[],
  opts?: { passthrough?: Array<{ from: string; to: string }> }
): SliceBlock {
  const blocks: SliceBlock[] = []
  const wires: SliceWire[] = []
  const inBlocks = new Map<string, SliceBlock>()

  inputs.forEach((p, i) => {
    const b = B('input_port', p.name, 40, 40 + i * 60, {
      portName: p.name,
      dataType: p.dataType || 'double',
      defaultValue: 0
    })
    blocks.push(b)
    inBlocks.set(p.name, b)
  })

  const pass = new Map(
    (opts?.passthrough || []).map(p => [p.to, p.from] as const)
  )

  outputs.forEach((p, i) => {
    const out = B('output_port', `out_${p.name}`, 520, 40 + i * 60, {
      portName: p.name,
      dataType: p.dataType || 'double'
    })
    blocks.push(out)
    const fromName = pass.get(p.name)
    if (fromName && inBlocks.has(fromName)) {
      wires.push(W(inBlocks.get(fromName)!, out))
    } else {
      const dt = p.dataType || 'double'
      let zeroVal: unknown = 0
      if (dt === 'double[3]') zeroVal = [0, 0, 0]
      else if (dt === 'double[4]') zeroVal = [0, 0, 0, 0]
      else if (dt === 'double[4][1]') zeroVal = [[1], [0], [0], [0]]
      else if (dt === 'double[3][3]')
        zeroVal = [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1]
        ]
      const z = B('source', `zero_${p.name}`, 280, 40 + i * 60, {
        signalType: 'constant',
        value: zeroVal,
        dataType: dt
      })
      blocks.push(z)
      wires.push(W(z, out))
    }
  })

  return B('subsystem', name, x, y, {
    sheets: [
      {
        id: nid('sheet'),
        name: name,
        blocks,
        connections: wires,
        extents: { width: 700, height: Math.max(200, 80 + outputs.length * 60) }
      }
    ]
  })
}

/**
 * H-1 Engine Cluster: T(t), β_P/β_Y, mass → F_eng, M_eng (equal outer gimbals).
 * CG_x from RTW `<S122>/CG X` vs mass (same LUT as aero moment arm).
 */
function buildH1EngineClusterSubsystem(x: number, y: number): {
  block: SliceBlock
  ports: {
    T: number
    betaP: number
    betaY: number
    mass: number
    F: number
    M: number
  }
} {
  const blocks: SliceBlock[] = []
  const wires: SliceWire[] = []
  const push = (b: SliceBlock) => {
    blocks.push(b)
    return b
  }

  const inT = push(
    B('input_port', 'T_N', 40, 80, {
      portName: 'T_N',
      dataType: 'double',
      defaultValue: 0
    })
  )
  const inBp = push(
    B('input_port', 'beta_P_deg', 40, 160, {
      portName: 'beta_P_deg',
      dataType: 'double',
      defaultValue: 0
    })
  )
  const inBy = push(
    B('input_port', 'beta_Y_deg', 40, 240, {
      portName: 'beta_Y_deg',
      dataType: 'double',
      defaultValue: 0
    })
  )
  const inMass = push(
    B('input_port', 'mass_kg', 40, 300, {
      portName: 'mass_kg',
      dataType: 'double',
      defaultValue: 586593
    })
  )
  const limP = push(
    B('limit', 'beta_P_lim', 200, 160, {
      lowerLimit: -H1_GIMBAL_LIMIT_DEG,
      upperLimit: H1_GIMBAL_LIMIT_DEG
    })
  )
  const limY = push(
    B('limit', 'beta_Y_lim', 200, 240, {
      lowerLimit: -H1_GIMBAL_LIMIT_DEG,
      upperLimit: H1_GIMBAL_LIMIT_DEG
    })
  )
  const Th = push(
    B('evaluate', 'T_half', 200, 80, {
      numInputs: 1,
      expression: '0.5*in(0)'
    })
  )
  const bpR = push(
    B('evaluate', 'beta_P_rad', 360, 160, {
      numInputs: 1,
      expression: 'in(0)*3.141592653589793/180.0'
    })
  )
  const byR = push(
    B('evaluate', 'beta_Y_rad', 360, 240, {
      numInputs: 1,
      expression: 'in(0)*3.141592653589793/180.0'
    })
  )
  const CGx = push(
    B('lookup_1d', 'CG_x_m', 200, 300, {
      inputValues: SIB_CG_MASS_BREAKPOINTS_KG,
      outputValues: SIB_CG_X_M,
      extrapolation: 'clamp'
    })
  )
  const Fx = push(
    B('evaluate', 'Fx_eng', 520, 60, {
      numInputs: 3,
      expression: 'in(0)*(cos(in(1))*cos(in(2))+1.0)'
    })
  )
  const Fy = push(
    B('evaluate', 'Fy_eng', 520, 120, {
      numInputs: 2,
      expression: 'in(0)*sin(in(1))'
    })
  )
  const Fz = push(
    B('evaluate', 'Fz_eng', 520, 180, {
      numInputs: 3,
      expression: 'in(0)*sin(in(1))*cos(in(2))'
    })
  )
  const Feng = push(
    B('mux', 'F_engines_N', 700, 100, {
      rows: 1,
      cols: 3,
      baseType: 'double',
      outputType: 'double[3]',
      outputShape: 'vector'
    })
  )
  const Mx = push(
    B('source', 'Mx_eng', 520, 240, {
      signalType: 'constant',
      value: 0,
      dataType: 'double'
    })
  )
  const My = push(
    B('evaluate', 'My_eng', 520, 300, {
      numInputs: 4,
      expression: 'in(0)*in(1)*sin(in(2))*cos(in(3))'
    })
  )
  const Mz = push(
    B('evaluate', 'Mz_eng', 520, 360, {
      numInputs: 3,
      expression: '-in(0)*in(1)*sin(in(2))'
    })
  )
  const Meng = push(
    B('mux', 'M_engines_Nm', 700, 300, {
      rows: 1,
      cols: 3,
      baseType: 'double',
      outputType: 'double[3]',
      outputShape: 'vector'
    })
  )
  const outF = push(
    B('output_port', 'F_eng', 880, 100, {
      portName: 'F_eng',
      dataType: 'double[3]'
    })
  )
  const outM = push(
    B('output_port', 'M_eng', 880, 300, {
      portName: 'M_eng',
      dataType: 'double[3]'
    })
  )

  wires.push(
    W(inT, Th),
    W(inBp, limP),
    W(inBy, limY),
    W(inMass, CGx),
    W(limP, bpR),
    W(limY, byR),
    W(Th, Fx, 0, 0),
    W(bpR, Fx, 0, 1),
    W(byR, Fx, 0, 2),
    W(Th, Fy, 0, 0),
    W(byR, Fy, 0, 1),
    W(Th, Fz, 0, 0),
    W(bpR, Fz, 0, 1),
    W(byR, Fz, 0, 2),
    W(Fx, Feng, 0, 0),
    W(Fy, Feng, 0, 1),
    W(Fz, Feng, 0, 2),
    W(Th, My, 0, 0),
    W(CGx, My, 0, 1),
    W(bpR, My, 0, 2),
    W(byR, My, 0, 3),
    W(Th, Mz, 0, 0),
    W(CGx, Mz, 0, 1),
    W(byR, Mz, 0, 2),
    W(Mx, Meng, 0, 0),
    W(My, Meng, 0, 1),
    W(Mz, Meng, 0, 2),
    W(Feng, outF),
    W(Meng, outM)
  )

  // Short C-safe name; MDL alias "H-1 Engine Cluster" in hierarchy doc.
  // inputPorts/outputPorts required so ModelFlattener can remap host wires.
  const block = B('subsystem', 'H1_Engine_Cluster', x, y, {
    sheets: [
      {
        id: nid('sheet'),
        name: 'H1_Engine_Cluster',
        blocks,
        connections: wires,
        extents: { width: 1000, height: 450 }
      }
    ],
    inputPorts: ['T_N', 'beta_P_deg', 'beta_Y_deg', 'mass_kg'],
    outputPorts: ['F_eng', 'M_eng'],
    showEnableInput: false,
    codeGenStrategy: 'flatten'
  })
  return {
    block,
    ports: { T: 0, betaP: 1, betaY: 2, mass: 3, F: 0, M: 1 }
  }
}

/**
 * Air-relative aero (mdl "Aerodynamic Forces and Moments" tables).
 *   v_air_E = C_bE·v_b − ω_E×r_E ; α,β,q̄,Mach from v_air_b
 *   mdlWireAttitude: C_bE = Transpose(quat_to_dcm(q)) for RTW LIO quat IC
 *   F_aero from CA_T / CN(α,β) / q̄·S_ref
 * Moments (r_arm×F) are computed inside but the plant sums a diagnostic-zero
 * M into EOM (matches 9.4+ isolation until CG/CP path is trusted).
 */
function buildAeroAirRelSubsystem(
  x: number,
  y: number,
  opts: { mdlWireAttitude?: boolean } = {}
): {
  block: SliceBlock
  ports: {
    r_i: number
    v_b: number
    q: number
    r_mag: number
    mass: number
    F: number
    M: number
    qbar: number
    alpha_deg: number
  }
} {
  const blocks: SliceBlock[] = []
  const wires: SliceWire[] = []
  const push = (b: SliceBlock) => {
    blocks.push(b)
    return b
  }

  const inRi = push(
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
  const inRmag = push(
    B('input_port', 'r_mag', 40, 220, {
      portName: 'r_mag',
      dataType: 'double',
      defaultValue: AS205_PAD.R_L_m
    })
  )
  const inMass = push(
    B('input_port', 'mass_kg', 40, 280, {
      portName: 'mass_kg',
      dataType: 'double',
      defaultValue: 586593
    })
  )

  const Re = push(
    B('source', 'R_L_m', 40, 280, {
      signalType: 'constant',
      value: AS205_PAD.R_L_m,
      dataType: 'double'
    })
  )
  const alt = push(
    B('sum', 'altitude_m', 200, 240, { signs: '+-', numInputs: 2 })
  )
  const atm = push(
    B('atmosphere', 'Atm', 360, 240, {
      model: 'coesa1976',
      extrapolation: 'clamp'
    })
  )
  const half = push(
    B('source', 'half', 360, 320, {
      signalType: 'constant',
      value: 0.5,
      dataType: 'double'
    })
  )
  const omegaE = push(
    B('source', 'omega_E_eci', 200, 40, {
      signalType: 'constant',
      value: [0, 0, OMEGA_EARTH],
      dataType: 'double[3]'
    })
  )
  const vRotE = push(B('cross', 'v_earth_rot', 360, 40, {}))
  const C_q = push(
    B('orientation_conversion', 'C_from_q', 200, 120, {
      conversionType: 'quat_to_dcm'
    })
  )
  // Legacy: C_bE = quat_to_dcm(q). mdlWire: C_bE = Transpose(ASB(q)).
  const C_bE = opts.mdlWireAttitude
    ? push(B('transpose', 'C_bE', 280, 120, {}))
    : C_q
  const v_E = push(B('matrix_multiply', 'v_E', 360, 100, {}))
  const vAirE = push(
    B('sum', 'v_air_E', 520, 80, { signs: '+-', numInputs: 2 })
  )
  const C_ib = push(B('transpose', 'C_ib', 520, 140, {}))
  const vAirB = push(B('matrix_multiply', 'v_air_b', 680, 100, {}))
  const Vair = push(B('mag', 'V_air_mag', 840, 100, {}))
  const Vsq = push(
    B('multiply', 'V_air_sq', 840, 160, { numInputs: 2 })
  )
  const halfRho = push(
    B('multiply', 'half_rho', 840, 220, { numInputs: 2 })
  )
  const qbar = push(B('multiply', 'qbar', 1000, 180, { numInputs: 2 }))

  const demuxV = push(
    B('demux', 'demux_v_air_b', 840, 40, {
      outputCount: 3,
      inputDimensions: [3]
    })
  )
  const Vsafe = push(
    B('evaluate', 'V_air_safe', 1000, 40, {
      numInputs: 1,
      expression: 'in(0) > 1e-3 ? in(0) : 1e-3'
    })
  )
  const alpha = push(
    B('evaluate', 'alpha_rad', 1000, 80, {
      numInputs: 2,
      expression:
        'atan2(in(1), in(0) == 0.0 && in(1) == 0.0 ? 1e-9 : in(0))'
    })
  )
  const beta = push(
    B('evaluate', 'beta_rad', 1000, 120, {
      numInputs: 2,
      expression:
        'asin(in(0)/in(1) > 1.0 ? 1.0 : (in(0)/in(1) < -1.0 ? -1.0 : in(0)/in(1)))'
    })
  )
  // mdl: Angle Conversion (rad→deg) → CN lookup (signed angle, clamp) → Unary Minus
  // Do NOT use |α|/sign(α) — that diverges from saturn_ib_stack RTW for α<0.
  const alphaDeg = push(
    B('evaluate', 'alpha_deg', 1160, 80, {
      numInputs: 1,
      expression: 'in(0)*180.0/3.141592653589793'
    })
  )
  const betaDeg = push(
    B('evaluate', 'beta_deg', 1160, 140, {
      numInputs: 1,
      expression: 'in(0)*180.0/3.141592653589793'
    })
  )
  const Mach = push(B('divide', 'Mach', 1000, 260, {}))
  const CA = push(
    B('lookup_1d', 'CA_T', 1160, 260, {
      inputValues: CA_MACH_BREAKPOINTS,
      outputValues: CA_VALUES,
      extrapolation: 'clamp'
    })
  )
  const CNa = push(
    B('lookup_2d', 'CN_alpha', 1320, 40, {
      input1Values: CN_MACH_BREAKPOINTS,
      input2Values: CN_ANGLE_DEG_BREAKPOINTS,
      outputTable: CN_TABLE,
      extrapolation: 'clamp'
    })
  )
  const CNb = push(
    B('lookup_2d', 'CN_beta', 1320, 120, {
      input1Values: CN_MACH_BREAKPOINTS,
      input2Values: CN_ANGLE_DEG_BREAKPOINTS,
      outputTable: CN_TABLE,
      extrapolation: 'clamp'
    })
  )
  const Sref = push(
    B('source', 'S_ref_m2', 1160, 320, {
      signalType: 'constant',
      value: AERO_S_REF_M2,
      dataType: 'double'
    })
  )
  const qS = push(B('multiply', 'qbar_S', 1320, 200, { numInputs: 2 }))
  // RTW Product2: F = [-CA, -CN_β, -CN_α] * q̄ * S_ref
  const Fx = push(
    B('evaluate', 'F_aero_x', 1480, 40, {
      numInputs: 2,
      expression: '-in(0)*in(1)'
    })
  )
  const Fy = push(
    B('evaluate', 'F_aero_y', 1480, 100, {
      numInputs: 2,
      expression: '-in(0)*in(1)'
    })
  )
  const Fz = push(
    B('evaluate', 'F_aero_z', 1480, 160, {
      numInputs: 2,
      expression: '-in(0)*in(1)'
    })
  )
  const Faero = push(
    B('mux', 'F_aero', 1640, 80, {
      rows: 1,
      cols: 3,
      baseType: 'double',
      outputType: 'double[3]',
      outputShape: 'vector'
    })
  )
  // M_aero = r_arm × F_aero ; r_arm = CP_vec − CG(mass) — RTW <S122> CG LUTs
  const CP = push(
    B('lookup_1d', 'CP_m', 1160, 380, {
      inputValues: CP_MACH_BREAKPOINTS,
      outputValues: CP_VALUES_M,
      extrapolation: 'clamp'
    })
  )
  const CGx = push(
    B('lookup_1d', 'CG_x_m', 1000, 400, {
      inputValues: SIB_CG_MASS_BREAKPOINTS_KG,
      outputValues: SIB_CG_X_M,
      extrapolation: 'clamp'
    })
  )
  const CGy = push(
    B('lookup_1d', 'CG_y_m', 1000, 460, {
      inputValues: SIB_CG_MASS_BREAKPOINTS_KG,
      outputValues: SIB_CG_Y_M,
      extrapolation: 'clamp'
    })
  )
  const CGz = push(
    B('lookup_1d', 'CG_z_m', 1000, 520, {
      inputValues: SIB_CG_MASS_BREAKPOINTS_KG,
      outputValues: SIB_CG_Z_M,
      extrapolation: 'clamp'
    })
  )
  const CG = push(
    B('mux', 'CG_m', 1160, 440, {
      rows: 1,
      cols: 3,
      baseType: 'double',
      outputType: 'double[3]',
      outputShape: 'vector'
    })
  )
  const demuxCG = push(
    B('demux', 'demux_CG', 1320, 400, {
      outputCount: 3,
      inputDimensions: [3]
    })
  )
  const rx = push(
    B('sum', 'r_arm_x', 1480, 360, { signs: '+-', numInputs: 2 })
  )
  const ry = push(B('uminus', 'r_arm_y', 1480, 420, {}))
  const rz = push(B('uminus', 'r_arm_z', 1480, 480, {}))
  const rArm = push(
    B('mux', 'r_arm', 1640, 400, {
      rows: 1,
      cols: 3,
      baseType: 'double',
      outputType: 'double[3]',
      outputShape: 'vector'
    })
  )
  const Maero = push(B('cross', 'M_aero', 1800, 360, {}))

  const outF = push(
    B('output_port', 'F_aero', 1960, 80, {
      portName: 'F_aero',
      dataType: 'double[3]'
    })
  )
  const outM = push(
    B('output_port', 'M_aero', 1960, 360, {
      portName: 'M_aero',
      dataType: 'double[3]'
    })
  )
  const outQbar = push(
    B('output_port', 'qbar_Pa', 1960, 180, {
      portName: 'qbar_Pa',
      dataType: 'double'
    })
  )
  const outAlpha = push(
    B('output_port', 'alpha_deg', 1960, 240, {
      portName: 'alpha_deg',
      dataType: 'double'
    })
  )

  wires.push(
    W(inRmag, alt, 0, 0),
    W(Re, alt, 0, 1),
    W(alt, atm),
    W(omegaE, vRotE, 0, 0),
    W(inRi, vRotE, 0, 1),
    W(inQ, C_q),
    ...(opts.mdlWireAttitude ? [W(C_q, C_bE)] : []),
    W(C_bE, v_E, 0, 0),
    W(inVb, v_E, 0, 1),
    W(v_E, vAirE, 0, 0),
    W(vRotE, vAirE, 0, 1),
    W(C_bE, C_ib),
    W(C_ib, vAirB, 0, 0),
    W(vAirE, vAirB, 0, 1),
    W(vAirB, Vair),
    W(Vair, Vsq, 0, 0),
    W(Vair, Vsq, 0, 1),
    W(half, halfRho, 0, 0),
    W(atm, halfRho, 3, 1),
    W(halfRho, qbar, 0, 0),
    W(Vsq, qbar, 0, 1),
    W(vAirB, demuxV),
    W(Vair, Vsafe),
    W(demuxV, alpha, 0, 0),
    W(demuxV, alpha, 2, 1),
    W(demuxV, beta, 1, 0),
    W(Vsafe, beta, 0, 1),
    W(alpha, alphaDeg),
    W(beta, betaDeg),
    W(Vair, Mach, 0, 0),
    W(atm, Mach, 1, 1),
    W(Mach, CA),
    W(Mach, CNa, 0, 0),
    W(alphaDeg, CNa, 0, 1),
    W(Mach, CNb, 0, 0),
    W(betaDeg, CNb, 0, 1),
    W(Mach, CP),
    W(qbar, qS, 0, 0),
    W(Sref, qS, 0, 1),
    W(CA, Fx, 0, 0),
    W(qS, Fx, 0, 1),
    W(CNb, Fy, 0, 0),
    W(qS, Fy, 0, 1),
    W(CNa, Fz, 0, 0),
    W(qS, Fz, 0, 1),
    W(Fx, Faero, 0, 0),
    W(Fy, Faero, 0, 1),
    W(Fz, Faero, 0, 2),
    W(inMass, CGx),
    W(inMass, CGy),
    W(inMass, CGz),
    W(CGx, CG, 0, 0),
    W(CGy, CG, 0, 1),
    W(CGz, CG, 0, 2),
    W(CG, demuxCG),
    W(CP, rx, 0, 0),
    W(demuxCG, rx, 0, 1),
    W(demuxCG, ry, 1, 0),
    W(demuxCG, rz, 2, 0),
    W(rx, rArm, 0, 0),
    W(ry, rArm, 0, 1),
    W(rz, rArm, 0, 2),
    W(rArm, Maero, 0, 0),
    W(Faero, Maero, 0, 1),
    W(Faero, outF),
    W(Maero, outM),
    W(qbar, outQbar),
    W(alphaDeg, outAlpha)
  )

  const block = B('subsystem', 'Aero_AirRel', x, y, {
    sheets: [
      {
        id: nid('sheet'),
        name: 'Aero_AirRel',
        blocks,
        connections: wires,
        extents: { width: 2100, height: 600 }
      }
    ],
    inputPorts: ['r_i', 'v_b', 'q_bE', 'r_mag', 'mass_kg'],
    outputPorts: ['F_aero', 'M_aero', 'qbar_Pa', 'alpha_deg'],
    showEnableInput: false,
    codeGenStrategy: 'flatten'
  })

  return {
    block,
    ports: {
      r_i: 0,
      v_b: 1,
      q: 2,
      r_mag: 3,
      mass: 4,
      F: 0,
      M: 1,
      qbar: 2,
      alpha_deg: 3
    }
  }
}

/**
 * Table 2B elev PD (pre-IGM) + Wave C Chi→Ψ→FCC (IGM on).
 *
 * Pre-IGM: Table 2B elev program + Body→S elev PD → β_P + R-damp → β_Y.
 * IGM on (MDL): Body→S Euler Θ + Chi_cmd → Chi→Ψ (Eqn 8.3.x) → rate-limit
 * ±12 °/s → sat ±15.3° → β from −Kp·Ψ (elev tip-band removed).
 * Also exports |V_S| via frozen MES (v_S = MES · C_bE · v_b).
 */
function buildChiTable2BElevPdSubsystem(
  x: number,
  y: number,
  mes: Mat3,
  opts: { mdlWireAttitude?: boolean } = {}
): {
  block: SliceBlock
  ports: {
    tBurn: number
    omega_b: number
    q: number
    v_b: number
    igmEnable: number
    chiY: number
    chiCmd: number
    betaP: number
    betaY: number
    elevCmd: number
    elevMeas: number
    V_S: number
    v_S: number
  }
} {
  const blocks: SliceBlock[] = []
  const wires: SliceWire[] = []
  const push = (b: SliceBlock) => {
    blocks.push(b)
    return b
  }
  const D2R = '0.017453292519943295'
  const R2D = '57.29577951308232'

  const inT = push(
    B('input_port', 't_burn', 40, 40, {
      portName: 't_burn',
      dataType: 'double',
      defaultValue: 0
    })
  )
  const inW = push(
    B('input_port', 'omega_b', 40, 100, {
      portName: 'omega_b',
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
  const inVb = push(
    B('input_port', 'v_b', 40, 220, {
      portName: 'v_b',
      dataType: 'double[3]',
      defaultValue: [0, 0, 0]
    })
  )
  const inIgm = push(
    B('input_port', 'igm_enable', 40, 280, {
      portName: 'igm_enable',
      dataType: 'double',
      defaultValue: 0
    })
  )
  const inChiY = push(
    B('input_port', 'chi_Y_deg', 40, 340, {
      portName: 'chi_Y_deg',
      dataType: 'double',
      defaultValue: 0
    })
  )
  const inChiCmd = push(
    B('input_port', 'chi_cmd_deg', 40, 400, {
      portName: 'chi_cmd_deg',
      dataType: 'double[3]',
      defaultValue: [0, 0, 0]
    })
  )

  // —— elev_cmd (diagnostic / pre-IGM): Table 2B, or unclamped 90+Chi_Y ——
  const chiLut = push(
    B('lookup_1d', 'elev_deg_table', 200, 40, {
      inputValues: table2bChiTimeBreakpoints(),
      outputValues: table2bPlantElevDeg(),
      extrapolation: 'clamp'
    })
  )
  /*
   * Wave C elev log / tip fallback: clamp(90+Chi_Y, min, max).
   * Unclamped tip dived; upper retuned toward ref h (see IGM_TIP_ELEV_*).
   */
  const elevIgmChi = push(
    B('evaluate', 'elev_igm_from_Chi_Y', 360, 40, {
      numInputs: 1,
      expression:
        `((90.0+in(0))<${IGM_TIP_ELEV_MIN_DEG}?${IGM_TIP_ELEV_MIN_DEG}:((90.0+in(0))>${IGM_TIP_ELEV_MAX_DEG}?${IGM_TIP_ELEV_MAX_DEG}:(90.0+in(0))))`
    })
  )
  // Chi_P for Ψ = rate-limited elev_cmd − 90 (matches Wave B elev slew into tip)
  const chiP_tip = push(
    B('evaluate', 'Chi_P_tip_deg', 800, 80, {
      numInputs: 1,
      expression: 'in(0)-90.0'
    })
  )
  const elevSel = push(
    B('evaluate', 'elev_cmd_sel', 520, 40, {
      numInputs: 3,
      expression: 'in(2) >= 0.5 ? in(1) : in(0)'
    })
  )
  const elevRateLim = push(
    B('rate_limiter', 'elev_rate_lim', 680, 40, {
      risingSlewLimit: 1.2,
      fallingSlewLimit: -1.2,
      initialOutput: 90
    })
  )
  const elevCmdRad = push(
    B('units_conversion', 'elev_cmd_rad', 840, 40, {
      conversionType: 'deg_to_rad'
    })
  )

  // —— Body→S: C_bS = MES · C_bE ; elev + Euler Θ ——
  const MES = push(
    B('source', 'MES_E_to_S', 200, 160, {
      signalType: 'constant',
      value: mat3ToSourceValue(mes),
      dataType: 'double[3][3]'
    })
  )
  const C_q = push(
    B('orientation_conversion', 'C_from_q', 200, 240, {
      conversionType: 'quat_to_dcm'
    })
  )
  const C_bE = opts.mdlWireAttitude
    ? push(B('transpose', 'C_bE', 280, 240, {}))
    : C_q
  const C_bS = push(B('matrix_multiply', 'C_bS', 400, 200, {}))
  const e1 = push(
    B('source', 'e1_body', 400, 280, {
      signalType: 'constant',
      value: [1, 0, 0],
      dataType: 'double[3]'
    })
  )
  const Xb_S = push(B('matrix_multiply', 'Xb_in_S', 560, 240, {}))
  const demuxXb = push(
    B('demux', 'demux_Xb_S', 720, 240, {
      outputCount: 3,
      inputDimensions: [3]
    })
  )
  const elevMeas = push(
    B('evaluate', 'elev_meas_rad', 880, 240, {
      numInputs: 1,
      expression:
        'asin(in(0) > 1.0 ? 1.0 : (in(0) < -1.0 ? -1.0 : in(0)))'
    })
  )
  const elevMeasDeg = push(
    B('evaluate', 'elev_meas_deg', 1040, 240, {
      numInputs: 1,
      expression: `in(0)*${R2D}`
    })
  )
  /*
   * Chi→Ψ Θ (pitch-only live):
   *   Θ_P = elev_meas−90; Θ_Y=0; Chi_Z=0
   *   Sat(asin)±45 + Kp_yaw=2 still NaN’d (~t692, Ve_y flip at IGM). Park yaw.
   */
  const q_bS = push(
    B('orientation_conversion', 'q_bS', 560, 120, {
      conversionType: 'dcm_to_quat'
    })
  )
  const eul_bS = push(
    B('orientation_conversion', 'eul_BodyToSM', 720, 80, {
      conversionType: 'quat_to_euler'
    })
  )
  const thR_deg = push(
    B('source', 'Theta_R_deg', 880, 40, {
      signalType: 'constant',
      value: 0,
      dataType: 'double'
    })
  )
  const thP_deg = push(
    B('evaluate', 'Theta_P_deg', 880, 80, {
      numInputs: 1,
      expression: `in(0)*${R2D}-90.0`
    })
  )
  const thY_deg = push(
    B('source', 'Theta_Y_deg', 880, 120, {
      signalType: 'constant',
      value: 0,
      dataType: 'double'
    })
  )
  const demuxChi = push(
    B('demux', 'demux_Chi_cmd', 200, 400, {
      outputCount: 3,
      inputDimensions: [3]
    })
  )
  const chiR0 = push(
    B('source', 'Chi_R_psi_0', 360, 120, {
      signalType: 'constant',
      value: 0,
      dataType: 'double'
    })
  )
  const chiZ0 = push(
    B('source', 'Chi_Z_psi_0', 360, 160, {
      signalType: 'constant',
      value: 0,
      dataType: 'double'
    })
  )

  /*
   * Chi→Ψ (MDL Eqn 8.3.3/8.3.4/8.2.2). ΔΘ = Θ−χ (deg);
   * half-angles from ½·rad(Θ+χ) on R/Y; Ψ in deg.
   */
  const dR = push(
    B('evaluate', 'delta_Theta_R', 1040, 40, {
      numInputs: 2,
      expression: 'in(0)-in(1)'
    })
  )
  const dP = push(
    B('evaluate', 'delta_Theta_P', 1040, 80, {
      numInputs: 2,
      expression: 'in(0)-in(1)'
    })
  )
  const dY = push(
    B('evaluate', 'delta_Theta_Y', 1040, 120, {
      numInputs: 2,
      expression: 'in(0)-in(1)'
    })
  )
  const halfR = push(
    B('evaluate', 'half_ThetaChi_R', 1040, 160, {
      numInputs: 2,
      expression: `0.5*(in(0)+in(1))*${D2R}`
    })
  )
  const halfY = push(
    B('evaluate', 'half_ThetaChi_Y', 1040, 200, {
      numInputs: 2,
      expression: `0.5*(in(0)+in(1))*${D2R}`
    })
  )
  const A3 = push(
    B('evaluate', 'A3_sin_halfY', 1200, 40, {
      numInputs: 1,
      expression: 'sin(in(0))'
    })
  )
  const A2 = push(
    B('evaluate', 'A2_sin_halfR', 1200, 80, {
      numInputs: 1,
      expression: 'sin(in(0))'
    })
  )
  const cY = push(
    B('evaluate', 'cY_cos_halfY', 1200, 120, {
      numInputs: 1,
      expression: 'cos(in(0))'
    })
  )
  const A5 = push(
    B('evaluate', 'A5_cos_halfR', 1200, 160, {
      numInputs: 1,
      expression: 'cos(in(0))'
    })
  )
  const A1 = push(
    B('evaluate', 'A1_cY_A5', 1360, 40, {
      numInputs: 2,
      expression: 'in(0)*in(1)'
    })
  )
  const A4 = push(
    B('evaluate', 'A4_A2_cY', 1360, 80, {
      numInputs: 2,
      expression: 'in(0)*in(1)'
    })
  )
  const PsiR_raw = push(
    B('evaluate', 'Psi_R_raw_deg', 1520, 40, {
      numInputs: 3,
      expression: 'in(0)+in(1)*in(2)' // dR + A3*dP
    })
  )
  const PsiP_raw = push(
    B('evaluate', 'Psi_P_raw_deg', 1520, 80, {
      numInputs: 4,
      expression: 'in(0)*in(1)+in(2)*in(3)' // A1*dP + A2*dY
    })
  )
  const PsiY_raw = push(
    B('evaluate', 'Psi_Y_raw_deg', 1520, 120, {
      numInputs: 4,
      expression: 'in(0)*in(1)-in(2)*in(3)' // A5*dY - A4*dP
    })
  )
  // MDL: Rate Limiter ±12 °/s → Saturate ±15.3°
  const PsiP_rl = push(
    B('rate_limiter', 'Psi_P_rate_lim', 1680, 80, {
      risingSlewLimit: CHI_TO_PSI_RATE_LIMIT_DEG_S,
      fallingSlewLimit: -CHI_TO_PSI_RATE_LIMIT_DEG_S,
      initialOutput: 0
    })
  )
  const PsiY_rl = push(
    B('rate_limiter', 'Psi_Y_rate_lim', 1680, 120, {
      risingSlewLimit: CHI_TO_PSI_RATE_LIMIT_DEG_S,
      fallingSlewLimit: -CHI_TO_PSI_RATE_LIMIT_DEG_S,
      initialOutput: 0
    })
  )
  const PsiP_sat = push(
    B('limit', 'Psi_P_sat', 1840, 80, {
      lowerLimit: -CHI_TO_PSI_SAT_DEG,
      upperLimit: CHI_TO_PSI_SAT_DEG
    })
  )
  const PsiY_sat = push(
    B('limit', 'Psi_Y_sat', 1840, 120, {
      lowerLimit: -CHI_TO_PSI_SAT_DEG,
      upperLimit: CHI_TO_PSI_SAT_DEG
    })
  )
  const PsiP_rad = push(
    B('evaluate', 'Psi_P_rad', 2000, 80, {
      numInputs: 1,
      expression: `in(0)*${D2R}`
    })
  )
  const PsiY_rad = push(
    B('evaluate', 'Psi_Y_rad', 2000, 120, {
      numInputs: 1,
      expression: `in(0)*${D2R}`
    })
  )

  // —— Pre-IGM elev PD: e = elev_cmd − elev_meas ; β_P = Kp·e − Kd·Q ——
  const attErr = push(
    B('sum', 'att_err_rad', 1040, 280, { signs: '+-', numInputs: 2 })
  )
  const Kp = push(
    B('source', 'Kp_att', 1040, 320, {
      signalType: 'constant',
      value: 20,
      dataType: 'double'
    })
  )
  const betaPAttElev = push(
    B('matrix_multiply', 'beta_P_att_elev', 1200, 280, {})
  )
  const demuxW = push(
    B('demux', 'demux_omega', 720, 320, {
      outputCount: 3,
      inputDimensions: [3]
    })
  )
  const Kd = push(
    B('source', 'Kd_rate', 1040, 360, {
      signalType: 'constant',
      value: 8,
      dataType: 'double'
    })
  )
  const negQ = push(B('uminus', 'neg_Q', 880, 360, {}))
  const betaPDamp = push(B('matrix_multiply', 'beta_P_damp', 1200, 360, {}))
  const betaPElevSum = push(
    B('sum', 'beta_P_elev_pd', 1360, 300, { signs: '++', numInputs: 2 })
  )

  /*
   * Wave C IGM FCC: elev e ≈ −Ψ_P ⇒ β_P = −Kp·Ψ_P_rad − Kd·Q.
   * Yaw: β_Y = −Kp·Ψ_Y_rad + Kd_lat·R (rate damp polarity unchanged).
   */
  const negPsiP = push(B('uminus', 'neg_Psi_P', 2160, 80, {}))
  const betaPAttPsi = push(
    B('matrix_multiply', 'beta_P_att_psi', 2320, 80, {})
  )
  const betaPPsiSum = push(
    B('sum', 'beta_P_psi_pd', 2480, 120, { signs: '++', numInputs: 2 })
  )
  const negPsiY = push(B('uminus', 'neg_Psi_Y', 2160, 160, {}))
  const betaYAttPsi = push(
    B('matrix_multiply', 'beta_Y_att_psi', 2320, 160, {})
  )
  const KdLat = push(
    B('source', 'Kd_lat', 1040, 440, {
      signalType: 'constant',
      value: 8,
      dataType: 'double'
    })
  )
  const betaYFromR = push(
    B('matrix_multiply', 'beta_Y_from_rate', 1200, 440, {})
  )
  const betaYPsiSum = push(
    B('sum', 'beta_Y_psi_pd', 2480, 200, { signs: '++', numInputs: 2 })
  )

  // Select elev-PD vs Ψ-PD on igm_enable
  const betaPSel = push(
    B('evaluate', 'beta_P_sel', 2640, 140, {
      numInputs: 3,
      expression: 'in(2) >= 0.5 ? in(1) : in(0)'
    })
  )
  const betaYSel = push(
    B('evaluate', 'beta_Y_sel', 2640, 220, {
      numInputs: 3,
      expression: 'in(2) >= 0.5 ? in(1) : in(0)'
    })
  )
  const betaPLim = push(
    B('limit', 'beta_P_cmd_lim', 2800, 140, {
      lowerLimit: -H1_GIMBAL_LIMIT_DEG,
      upperLimit: H1_GIMBAL_LIMIT_DEG
    })
  )
  const betaYLim = push(
    B('limit', 'beta_Y_cmd_lim', 2800, 220, {
      lowerLimit: -H1_GIMBAL_LIMIT_DEG,
      upperLimit: H1_GIMBAL_LIMIT_DEG
    })
  )

  // |V_S|: v_E = C_bE · v_b ; v_S = MES · v_E
  const v_E = push(B('matrix_multiply', 'v_E', 400, 360, {}))
  const v_S = push(B('matrix_multiply', 'v_S', 560, 360, {}))
  const V_S = push(B('mag', 'V_S_mag', 720, 400, {}))

  const outBetaP = push(
    B('output_port', 'beta_P_deg', 2960, 140, {
      portName: 'beta_P_deg',
      dataType: 'double'
    })
  )
  const outBetaY = push(
    B('output_port', 'beta_Y_deg', 2960, 220, {
      portName: 'beta_Y_deg',
      dataType: 'double'
    })
  )
  const outElevCmd = push(
    B('output_port', 'elev_cmd_deg', 2960, 40, {
      portName: 'elev_cmd_deg',
      dataType: 'double'
    })
  )
  const outElevMeas = push(
    B('output_port', 'elev_meas_deg', 2960, 280, {
      portName: 'elev_meas_deg',
      dataType: 'double'
    })
  )
  const outVS = push(
    B('output_port', 'V_S_mag', 2960, 360, {
      portName: 'V_S_mag',
      dataType: 'double'
    })
  )
  const outvS = push(
    B('output_port', 'v_S', 2960, 440, {
      portName: 'v_S',
      dataType: 'double[3]'
    })
  )

  wires.push(
    W(inT, chiLut),
    W(inQ, C_q),
    ...(opts.mdlWireAttitude ? [W(C_q, C_bE)] : []),
    W(MES, C_bS, 0, 0),
    W(C_bE, C_bS, 0, 1),
    W(C_bS, Xb_S, 0, 0),
    W(e1, Xb_S, 0, 1),
    W(Xb_S, demuxXb),
    W(C_bS, q_bS),
    W(q_bS, eul_bS),
    W(elevMeas, thP_deg), // Θ_P = elev_meas − 90 (Chi_Y frame)
    W(C_bE, v_E, 0, 0),
    W(inVb, v_E, 0, 1),
    W(MES, v_S, 0, 0),
    W(v_E, v_S, 0, 1),
    W(v_S, V_S),
    // elev diagnostic / pre-IGM cmd (tip-clamped)
    W(inChiY, elevIgmChi),
    W(chiLut, elevSel, 0, 0),
    W(elevIgmChi, elevSel, 0, 1),
    W(inIgm, elevSel, 0, 2),
    W(elevSel, elevRateLim),
    W(elevRateLim, chiP_tip), // tip Chi_P tracks rate-limited elev cmd
    W(elevRateLim, elevCmdRad),
    W(demuxXb, elevMeas, 0, 0),
    W(elevMeas, elevMeasDeg),
    W(inChiCmd, demuxChi),
    W(thR_deg, dR, 0, 0),
    W(chiR0, dR, 0, 1),
    W(thP_deg, dP, 0, 0),
    W(chiP_tip, dP, 0, 1),
    W(thY_deg, dY, 0, 0),
    W(chiZ0, dY, 0, 1),
    W(thR_deg, halfR, 0, 0),
    W(chiR0, halfR, 0, 1),
    W(thY_deg, halfY, 0, 0),
    W(chiZ0, halfY, 0, 1),
    W(halfY, A3),
    W(halfR, A2),
    W(halfY, cY),
    W(halfR, A5),
    W(cY, A1, 0, 0),
    W(A5, A1, 0, 1),
    W(A2, A4, 0, 0),
    W(cY, A4, 0, 1),
    W(dR, PsiR_raw, 0, 0),
    W(A3, PsiR_raw, 0, 1),
    W(dP, PsiR_raw, 0, 2),
    W(A1, PsiP_raw, 0, 0),
    W(dP, PsiP_raw, 0, 1),
    W(A2, PsiP_raw, 0, 2),
    W(dY, PsiP_raw, 0, 3),
    W(A5, PsiY_raw, 0, 0),
    W(dY, PsiY_raw, 0, 1),
    W(A4, PsiY_raw, 0, 2),
    W(dP, PsiY_raw, 0, 3),
    W(PsiP_raw, PsiP_rl),
    W(PsiY_raw, PsiY_rl),
    W(PsiP_rl, PsiP_sat),
    W(PsiY_rl, PsiY_sat),
    W(PsiP_sat, PsiP_rad),
    W(PsiY_sat, PsiY_rad),
    // elev PD path
    W(elevCmdRad, attErr, 0, 0),
    W(elevMeas, attErr, 0, 1),
    W(attErr, betaPAttElev, 0, 0),
    W(Kp, betaPAttElev, 0, 1),
    W(inW, demuxW),
    W(demuxW, negQ, 1, 0),
    W(negQ, betaPDamp, 0, 0),
    W(Kd, betaPDamp, 0, 1),
    W(betaPAttElev, betaPElevSum, 0, 0),
    W(betaPDamp, betaPElevSum, 0, 1),
    // Ψ PD path
    W(PsiP_rad, negPsiP),
    W(negPsiP, betaPAttPsi, 0, 0),
    W(Kp, betaPAttPsi, 0, 1),
    W(betaPAttPsi, betaPPsiSum, 0, 0),
    W(betaPDamp, betaPPsiSum, 0, 1),
    W(PsiY_rad, negPsiY),
    W(negPsiY, betaYAttPsi, 0, 0),
    W(Kp, betaYAttPsi, 0, 1),
    W(demuxW, betaYFromR, 2, 0),
    W(KdLat, betaYFromR, 0, 1),
    W(betaYAttPsi, betaYPsiSum, 0, 0),
    W(betaYFromR, betaYPsiSum, 0, 1),
    // select + limit
    W(betaPElevSum, betaPSel, 0, 0),
    W(betaPPsiSum, betaPSel, 0, 1),
    W(inIgm, betaPSel, 0, 2),
    W(betaYFromR, betaYSel, 0, 0), // pre-IGM: rate-only yaw
    W(betaYPsiSum, betaYSel, 0, 1),
    W(inIgm, betaYSel, 0, 2),
    W(betaPSel, betaPLim),
    W(betaYSel, betaYLim),
    W(betaPLim, outBetaP),
    W(betaYLim, outBetaY),
    W(elevRateLim, outElevCmd),
    W(elevMeasDeg, outElevMeas),
    W(V_S, outVS),
    W(v_S, outvS)
  )

  const block = B('subsystem', 'Chi_Table2B_ElevPd', x, y, {
    sheets: [
      {
        id: nid('sheet'),
        name: 'Chi_Table2B_ElevPd',
        blocks,
        connections: wires,
        extents: { width: 3100, height: 520 }
      }
    ],
    inputPorts: [
      't_burn',
      'omega_b',
      'q_bE',
      'v_b',
      'igm_enable',
      'chi_Y_deg',
      'chi_cmd_deg'
    ],
    outputPorts: [
      'beta_P_deg',
      'beta_Y_deg',
      'elev_cmd_deg',
      'elev_meas_deg',
      'V_S_mag',
      'v_S'
    ],
    showEnableInput: false,
    codeGenStrategy: 'flatten'
  })

  return {
    block,
    ports: {
      tBurn: 0,
      omega_b: 1,
      q: 2,
      v_b: 3,
      igmEnable: 4,
      chiY: 5,
      chiCmd: 6,
      betaP: 0,
      betaY: 1,
      elevCmd: 2,
      elevMeas: 3,
      V_S: 4,
      v_S: 5
    }
  }
}

/**
 * S-IB Stage: Simulink-named stub children for structure.
 * Live EOM + H-1 + aero are **root siblings** (historical workaround for
 * double-nest port remap; fixed in `ModelFlattener` — see
 * `docs/codegen-double-nest-vector-types.md`). Re-nest under S-IB when convenient.
 */
function buildSibStageStubShell(x: number, y: number): SliceBlock {
  const blocks: SliceBlock[] = []
  const wires: SliceWire[] = []
  const push = (b: SliceBlock) => {
    blocks.push(b)
    return b
  }

  const inU = push(
    B('input_port', 'stage_enable', 40, 40, {
      portName: 'stage_enable',
      dataType: 'double',
      defaultValue: 1
    })
  )

  const stubNames = [
    'Custom Variable Mass 6DoF (Quaternion)',
    'H-1 Engine Cluster',
    'Aerodynamic Forces and Moments',
    'Earth Gravity Model',
    'Relative Wind',
    'Vehicle Mass Properties',
    'ECI to LLA',
    'Retrorocket Motors'
  ]
  stubNames.forEach((name, i) => {
    push(
      makeStubSubsystem(
        name,
        40 + (i % 4) * 260,
        100 + Math.floor(i / 4) * 180,
        [{ name: 'u', dataType: 'double' }],
        [{ name: 'y', dataType: 'double' }]
      )
    )
  })

  const outY = push(
    B('output_port', 'stage_active', 40, 500, {
      portName: 'stage_active',
      dataType: 'double'
    })
  )
  wires.push(W(inU, outY))

  return B('subsystem', 'S-IB Stage', x, y, {
    sheets: [
      {
        id: nid('sheet'),
        name: 'S-IB Stage',
        blocks,
        connections: wires,
        extents: { width: 1100, height: 600 }
      }
    ]
  })
}

/** IU: bLiftoff from plant time vs T_L_prime; gimbal cmds stubbed to 0. */
function buildIUSubsystem(x: number, y: number): SliceBlock {
  const blocks: SliceBlock[] = []
  const wires: SliceWire[] = []
  const push = (b: SliceBlock) => {
    blocks.push(b)
    return b
  }

  const inTl = push(
    B('input_port', 'T_L_prime_sec', 40, 80, {
      portName: 'T_L_prime_sec',
      dataType: 'double',
      defaultValue: 300
    })
  )
  const one = push(
    B('source', 'one', 40, 160, {
      signalType: 'constant',
      value: 1,
      dataType: 'double'
    })
  )
  const t0 = push(
    B('source', 't0', 40, 220, {
      signalType: 'constant',
      value: 0,
      dataType: 'double'
    })
  )
  const tPlant = push(
    B('integrator', 't_plant', 200, 160, {
      showInitPort: true,
      initialValue: 0,
      showResetInput: false
    })
  )
  const lift = push(
    B('evaluate', 'bLiftoff_d', 400, 100, {
      numInputs: 2,
      expression: 'in(0) >= in(1) ? 1.0 : 0.0'
    })
  )
  const zero = push(
    B('source', 'zero', 400, 200, {
      signalType: 'constant',
      value: 0,
      dataType: 'double'
    })
  )

  const fcc = makeStubSubsystem(
    'Flight Control Computer',
    200,
    300,
    [
      { name: 'att_err', dataType: 'double' },
      { name: 'Q_rps', dataType: 'double' }
    ],
    [
      { name: 'beta_P_deg', dataType: 'double' },
      { name: 'beta_Y_deg', dataType: 'double' }
    ]
  )
  push(fcc)

  const lvdc = makeStubSubsystem(
    'LVDA / LVDC',
    480,
    300,
    [
      { name: 't_s', dataType: 'double' },
      { name: 'r_S', dataType: 'double[3]' }
    ],
    [
      { name: 'chi_deg', dataType: 'double' },
      { name: 'nIGMMode', dataType: 'double' }
    ]
  )
  push(lvdc)

  for (const name of [
    'Body Rate Gyros',
    'Accelerometers',
    'ST-124M Stabilized Platform'
  ]) {
    push(
      makeStubSubsystem(
        name,
        760,
        40 + 100 * ['Body Rate Gyros', 'Accelerometers', 'ST-124M Stabilized Platform'].indexOf(name),
        [{ name: 'omega_b', dataType: 'double[3]' }],
        [{ name: 'sense', dataType: 'double[3]' }]
      )
    )
  }

  const outLift = push(
    B('output_port', 'bLiftoff', 640, 100, {
      portName: 'bLiftoff',
      dataType: 'double'
    })
  )
  const outBp = push(
    B('output_port', 'beta_P_deg', 640, 180, {
      portName: 'beta_P_deg',
      dataType: 'double'
    })
  )
  const outBy = push(
    B('output_port', 'beta_Y_deg', 640, 240, {
      portName: 'beta_Y_deg',
      dataType: 'double'
    })
  )
  const outT = push(
    B('output_port', 'time_s', 640, 40, {
      portName: 'time_s',
      dataType: 'double'
    })
  )
  const outStage = push(
    B('output_port', 'bStageSep', 640, 300, {
      portName: 'bStageSep',
      dataType: 'double'
    })
  )
  const outIECO = push(
    B('output_port', 'bIECO', 640, 360, {
      portName: 'bIECO',
      dataType: 'double'
    })
  )
  const outOECO = push(
    B('output_port', 'bOECO', 640, 420, {
      portName: 'bOECO',
      dataType: 'double'
    })
  )
  const outSivb = push(
    B('output_port', 'bS_IVB_EngineStart', 640, 480, {
      portName: 'bS_IVB_EngineStart',
      dataType: 'double'
    })
  )

  wires.push(
    W(one, tPlant, 0, 0),
    W(t0, tPlant, 0, -1),
    W(tPlant, lift, 0, 0),
    W(inTl, lift, 0, 1),
    W(lift, outLift),
    W(tPlant, outT),
    W(zero, outBp),
    W(zero, outBy),
    W(zero, outStage),
    W(zero, outIECO),
    W(zero, outOECO),
    W(zero, outSivb),
    W(tPlant, lvdc, 0, 0)
  )

  return B('subsystem', 'Saturn Instrument Unit (IU)', x, y, {
    sheets: [
      {
        id: nid('sheet'),
        name: 'Saturn Instrument Unit (IU)',
        blocks,
        connections: wires,
        extents: { width: 1000, height: 600 }
      }
    ]
  })
}

function buildInitialConditionsSubsystem(
  x: number,
  y: number,
  padE: ReturnType<typeof as205DefaultPadStateEci>
): SliceBlock {
  const blocks: SliceBlock[] = []
  const wires: SliceWire[] = []
  const push = (b: SliceBlock) => {
    blocks.push(b)
    return b
  }

  // Nested named stubs for MDL parity
  for (const [i, name] of [
    'Date to JD',
    'T to GMST',
    'MES Transform',
    'E-Frame to s-Frame (MES matrix)',
    'Initial Position and Velocity (Eqns 3.4)',
    'L/V Inertial Orientation',
    'LLA to ECF'
  ].entries()) {
    push(
      makeStubSubsystem(
        name,
        40 + (i % 3) * 280,
        40 + Math.floor(i / 3) * 160,
        [{ name: 'u', dataType: 'double' }],
        [{ name: 'y', dataType: 'double' }]
      )
    )
  }

  const r0 = push(
    B('source', 'r0_E', 40, 400, {
      signalType: 'constant',
      value: [...padE.r0_E],
      dataType: 'double[3]'
    })
  )
  const v0 = push(
    B('source', 'v0_b', 40, 460, {
      signalType: 'constant',
      value: [...padE.v0_b],
      dataType: 'double[3]'
    })
  )
  const q0 = push(
    B('source', 'q0_bE', 40, 520, {
      signalType: 'constant',
      value: padE.q0_bE,
      dataType: 'double[4][1]'
    })
  )
  const mes = push(
    B('source', 'MES_E_to_S', 40, 580, {
      signalType: 'constant',
      value: mat3ToSourceValue(padE.MES),
      dataType: 'double[3][3]'
    })
  )

  const outR = push(
    B('output_port', 'r0_E', 400, 400, {
      portName: 'r0_E',
      dataType: 'double[3]'
    })
  )
  const outV = push(
    B('output_port', 'v0_b', 400, 460, {
      portName: 'v0_b',
      dataType: 'double[3]'
    })
  )
  const outQ = push(
    B('output_port', 'q0_bE', 400, 520, {
      portName: 'q0_bE',
      dataType: 'double[4][1]'
    })
  )
  const outMes = push(
    B('output_port', 'MES', 400, 580, {
      portName: 'MES',
      dataType: 'double[3][3]'
    })
  )

  wires.push(W(r0, outR), W(v0, outV), W(q0, outQ), W(mes, outMes))

  return B('subsystem', 'Initial Conditions', x, y, {
    sheets: [
      {
        id: nid('sheet'),
        name: 'Initial Conditions',
        blocks,
        connections: wires,
        extents: { width: 700, height: 700 }
      }
    ]
  })
}

/**
 * Full plant model: Saturn_IB_Stack nested structure for lib_SaturnIBObliq.
 */
export function buildSaturnIbObliqPlant(): SliceModel {
  resetSaturnIbPlantIds()
  // Legacy IC (LIOᵀ quat, Ve=C_bE·Vb). MDL wire-as-is adapter remains opt-in
  // via as205MdlWirePadStateEci + EOM_MDL_ADAPTER — see DCM_QUAT_EOM_AUDIT.md
  const padE = as205DefaultPadStateEci()
  const blocks: SliceBlock[] = []
  const wires: SliceWire[] = []
  const push = (b: SliceBlock) => {
    blocks.push(b)
    return b
  }

  // —— Root ExternalInputs (unique port names for cgen) ——
  const inAz = push(
    B('input_port', 'A_z_deg', 40, 40, {
      portName: 'A_z_deg',
      dataType: 'double',
      defaultValue: 82.82
    })
  )
  const inTl = push(
    B('input_port', 'T_L_prime_sec', 40, 100, {
      portName: 'T_L_prime_sec',
      dataType: 'double',
      defaultValue: 300
    })
  )
  const inLat = push(
    B('input_port', 'pad_lat_deg', 40, 160, {
      portName: 'pad_lat_deg',
      dataType: 'double',
      defaultValue: 28.521963
    })
  )
  const inLon = push(
    B('input_port', 'pad_lon_deg', 40, 220, {
      portName: 'pad_lon_deg',
      dataType: 'double',
      defaultValue: -80.561141
    })
  )
  const inH = push(
    B('input_port', 'pad_h_m', 40, 280, {
      portName: 'pad_h_m',
      dataType: 'double',
      defaultValue: 34.7
    })
  )

  // —— Top-level Simulink children ——
  const bodyToEci = makeStubSubsystem(
    'Body to ECI',
    280,
    40,
    [{ name: 'q_bE', dataType: 'double[4][1]' }],
    [{ name: 'veh_q_ECI', dataType: 'double[4]' }],
    { passthrough: [] }
  )
  // Custom: demux quat column → 4-vector for host
  // Replace stub with thin real path below after S-IB exists
  push(bodyToEci)

  push(
    makeStubSubsystem(
      'CM_ISS',
      280,
      160,
      [{ name: 'q_ECItoSM', dataType: 'double[4]' }],
      [
        { name: 'CM_IMU_OGA_rad', dataType: 'double' },
        { name: 'CM_IMU_IGA_rad', dataType: 'double' },
        { name: 'CM_IMU_MGA_rad', dataType: 'double' }
      ]
    )
  )
  push(
    makeStubSubsystem(
      "Earth's Rotation",
      280,
      280,
      [{ name: 't_s', dataType: 'double' }],
      [{ name: 'omega_E', dataType: 'double[3]' }]
    )
  )

  const ic = buildInitialConditionsSubsystem(280, 400, padE)
  push(ic)

  push(
    makeStubSubsystem(
      'MES Transform',
      560,
      40,
      [{ name: 'A_z_deg', dataType: 'double' }],
      [{ name: 'MES', dataType: 'double[3][3]' }]
    )
  )

  // On Pad: MDL-named shell; live pad LLA/h passthrough is at root (codegen)
  const onPad = push(
    makeStubSubsystem(
      'On Pad',
      560,
      160,
      [{ name: 'pad_h_m', dataType: 'double' }],
      [{ name: 'out_pad_h_m', dataType: 'double' }],
      { passthrough: [{ from: 'pad_h_m', to: 'out_pad_h_m' }] }
    )
  )

  const sibShell = buildSibStageStubShell(560, 360)
  push(sibShell)

  const sivb = makeStubSubsystem(
    'S-IVB Stage',
    900,
    360,
    [
      { name: 'stage_enable', dataType: 'double' },
      { name: 'beta_P_deg', dataType: 'double' },
      { name: 'beta_Y_deg', dataType: 'double' }
    ],
    [
      { name: 'r_i', dataType: 'double[3]' },
      { name: 'v_b', dataType: 'double[3]' },
      { name: 'q', dataType: 'double[4][1]' },
      { name: 'mass_kg', dataType: 'double' }
    ]
  )
  push(sivb)

  // IU shell for MDL names; live liftoff clock at root (subsystem multi-out
  // typing currently drops host-facing ports — see hierarchy doc).
  const iu = makeStubSubsystem(
    'Saturn Instrument Unit (IU)',
    900,
    40,
    [{ name: 'T_L_prime_sec', dataType: 'double' }],
    [
      { name: 'bLiftoff', dataType: 'double' },
      { name: 'beta_P_deg', dataType: 'double' },
      { name: 'beta_Y_deg', dataType: 'double' }
    ]
  )
  push(iu)

  const one = push(
    B('source', 'one', 40, 360, {
      signalType: 'constant',
      value: 1,
      dataType: 'double'
    })
  )
  const t0 = push(
    B('source', 't0', 40, 420, {
      signalType: 'constant',
      value: 0,
      dataType: 'double'
    })
  )
  const tPlant = push(
    B('integrator', 't_plant', 200, 360, {
      showInitPort: true,
      initialValue: 0,
      showResetInput: false
    })
  )
  const lift = push(
    B('evaluate', 'bLiftoff_d', 400, 360, {
      numInputs: 2,
      expression: 'in(0) >= in(1) ? 1.0 : 0.0'
    })
  )
  const t0Evt = push(
    B('source', 'event_t0', 400, 440, {
      signalType: 'constant',
      value: 0,
      dataType: 'double'
    })
  )

  /*
   * Staging / cutoff events (RTW LVDC T2/T3 timers, Saturn_IB_Stack.c):
   *   Compare_c3 := mass_kg <= 198488.9  → starts T2 (elapsed while true)
   *   bIECO      := T2 >= 3.2 s
   *   bOECO      := T2 >= 6.2 s          → starts T3
   *   bStageSep  := T3 >= 1.38 s
   *   bS_IVB_EngineStart := T3 >= 2.7 s
   * Post-sep: H-1 off; J-2 Thrust-vs-Time (RTW <S304>); mass→137883 via host poke.
   * Simulink uses a separate S-IVB 6DoF + IcNeedsLoading — Obliq gap noted in as205J2.ts.
   */
  const MASS_IECO_ARM_KG = 198488.9
  const compareC3 = push(
    B('evaluate', 'Compare_c3', 720, 360, {
      numInputs: 1,
      expression: `in(0) <= ${MASS_IECO_ARM_KG} ? 1.0 : 0.0`
    })
  )
  const t2 = push(
    B('integrator', 'T2_elapsed', 880, 360, {
      showInitPort: true,
      initialValue: 0,
      showResetInput: false
    })
  )
  const bIECO = push(
    B('evaluate', 'bIECO_d', 1040, 320, {
      numInputs: 1,
      expression: 'in(0) >= 3.2 ? 1.0 : 0.0'
    })
  )
  const bOECO = push(
    B('evaluate', 'bOECO_d', 1040, 380, {
      numInputs: 1,
      expression: 'in(0) >= 6.2 ? 1.0 : 0.0'
    })
  )
  const t3 = push(
    B('integrator', 'T3_elapsed', 880, 440, {
      showInitPort: true,
      initialValue: 0,
      showResetInput: false
    })
  )
  const bStage = push(
    B('evaluate', 'bStageSep_d', 1040, 440, {
      numInputs: 1,
      expression: 'in(0) >= 1.38 ? 1.0 : 0.0'
    })
  )
  const bSivb = push(
    B('evaluate', 'bS_IVB_EngineStart_d', 1040, 500, {
      numInputs: 1,
      expression: 'in(0) >= 2.7 ? 1.0 : 0.0'
    })
  )
  /*
   * IGM enable (RTW <S352>): T3 >= 44.
   * bCutoff comes from LVDC_IGM HSL (T_3_i Add8 ≤ 0.04) — wired after igm.
   */
  const bIgmEn = push(
    B('evaluate', 'bIGMEnable_d', 1040, 560, {
      numInputs: 1,
      expression: `in(0) >= ${IGM_ENABLE_T3_S} ? 1.0 : 0.0`
    })
  )
  // Hold-down only (S-IVB continues on same EOM after StageSep)
  // Propellant / H-1 thrust stop at StageSep (S-IB jettison)
  const burnActive = push(
    B('evaluate', 'sib_burn_active', 720, 260, {
      numInputs: 2,
      expression: 'in(0) * (1.0 - in(1))'
    })
  )
  /*
   * After HSL bCutoff, freeze EOM: open-loop elev + incomplete orbit leaves
   * suborbital V → ballistic reentry NaN without control torque.
   */
  const eomEnable = push(
    B('evaluate', 'eom_enable', 720, 300, {
      numInputs: 2,
      expression: 'in(0) * (1.0 - in(1))'
    })
  )

  // Live S-IB H-1 TVC + EOM at root (MDL nests under S-IB Stage).
  // t_burṅ = bLiftoff ⇒ schedule stays at Table-5 t=0 (T=0) until liftoff,
  // then advances as flight time from first motion (matches 9.x / TN Table 5).
  const tBurn = push(
    B('integrator', 't_burn', 200, 520, {
      showInitPort: true,
      initialValue: 0,
      showResetInput: false
    })
  )
  const thrustMag = push(
    B('lookup_1d', 'ThrustMag_N', 360, 520, {
      inputValues: table5ThrustTimeBreakpoints(),
      outputValues: table5ThrustN(),
      extrapolation: 'clamp'
    })
  )
  const mdotTn = table5MdotFromMass()
  const mdotCmd = push(
    B('lookup_1d', 'mdot_kgps', 360, 600, {
      inputValues: mdotTn.t_s,
      outputValues: mdotTn.mdot_kgps,
      extrapolation: 'clamp'
    })
  )
  // H-1 mdot/thrust gated by liftoff×!StageSep
  const mdotSibGated = push(
    B('multiply', 'mdot_sib_gated', 480, 600, { numInputs: 2 })
  )
  const thrustGated = push(
    B('multiply', 'thrust_gated', 480, 520, { numInputs: 2 })
  )

  // J-2: t_j2̇ = bS_IVB_EngineStart; LUT arg = 147.26 + t_j2 (RTW Bias)
  const tJ2 = push(
    B('integrator', 't_j2', 200, 900, {
      showInitPort: true,
      initialValue: 0,
      showResetInput: false
    })
  )
  const j2Bias = push(
    B('source', 'j2_time_bias', 40, 900, {
      signalType: 'constant',
      value: J2_THRUST_TIME_BIAS_S,
      dataType: 'double'
    })
  )
  const j2LutT = push(
    B('sum', 'j2_lut_t', 360, 900, { signs: '++', numInputs: 2 })
  )
  const j2Thrust = push(
    B('lookup_1d', 'J2_Thrust_N', 520, 900, {
      inputValues: J2_THRUST_TIME_S,
      outputValues: J2_THRUST_N,
      extrapolation: 'clamp'
    })
  )
  /*
   * J-2 burn gate: EngineStart ∧ ¬bCutoff ∧ mass > 30074 (safety).
   * Primary end-of-burn is IGM-timed bCutoff; mass floor is RTW Stop backstop.
   */
  const j2BurnOk = push(
    B('evaluate', 'j2_burn_ok', 520, 960, {
      numInputs: 3,
      expression: `in(0) * (1.0 - in(1)) * (in(2) > ${SIVB_MASS_STOP_KG} ? 1.0 : 0.0)`
    })
  )
  const j2ThrustGated = push(
    B('multiply', 'j2_thrust_gated', 680, 900, { numInputs: 2 })
  )
  const j2Mdot = push(
    B('evaluate', 'j2_mdot_kgps', 680, 960, {
      numInputs: 1,
      expression: `(${J2_MDOT_AT_REF_KGPS} / ${J2_MDOT_REF_THRUST_N}) * in(0)`
    })
  )
  /*
   * J-2 body force with open-loop TVC from χ β_P/β_Y (RTW <S304> has actuators;
   * Obliq uses instantaneous gimbal — no actuator TF yet).
   * F ≈ T · [cosβp·cosβy, sinβy, sinβp]; M = r_CG × F with stub CG_x.
   */
  const j2CGx = push(
    B('source', 'j2_CG_x', 680, 1020, {
      signalType: 'constant',
      value: 5.0,
      dataType: 'double'
    })
  )
  const j2Fx = push(
    B('evaluate', 'j2_Fx', 840, 900, {
      numInputs: 3,
      expression:
        'in(0)*cos(in(1)*0.017453292519943295)*cos(in(2)*0.017453292519943295)'
    })
  )
  const j2Fy = push(
    B('evaluate', 'j2_Fy', 840, 960, {
      numInputs: 2,
      expression: 'in(0)*sin(in(1)*0.017453292519943295)'
    })
  )
  const j2Fz = push(
    B('evaluate', 'j2_Fz', 840, 1020, {
      numInputs: 2,
      expression: 'in(0)*sin(in(1)*0.017453292519943295)'
    })
  )
  const j2F = push(
    B('mux', 'J2_F_b', 1000, 960, {
      rows: 1,
      cols: 3,
      baseType: 'double',
      outputType: 'double[3]',
      outputShape: 'vector'
    })
  )
  // M = (r_thrust - r_CG) × F with r_thrust≈0, r_CG=[CGx,0,0]
  // → My = +CGx·Fz, Mz = −CGx·Fy (matches H-1 damp polarity with β_Y=+Kd·R)
  const j2Mx0 = push(
    B('source', 'j2_Mx0', 840, 1080, {
      signalType: 'constant',
      value: 0,
      dataType: 'double'
    })
  )
  const j2My = push(
    B('evaluate', 'j2_My', 1000, 1020, {
      numInputs: 2,
      expression: 'in(0)*in(1)'
    })
  )
  const j2Mz = push(
    B('evaluate', 'j2_Mz', 1000, 1080, {
      numInputs: 2,
      expression: '-in(0)*in(1)'
    })
  )
  const j2M = push(
    B('mux', 'J2_M_b', 1160, 1020, {
      rows: 1,
      cols: 3,
      baseType: 'double',
      outputType: 'double[3]',
      outputShape: 'vector'
    })
  )
  const mdotTotal = push(
    B('sum', 'mdot_total', 840, 600, { signs: '++', numInputs: 2 })
  )
  const thrustTotal = push(
    B('sum', 'thrust_total', 840, 520, { signs: '++', numInputs: 2 })
  )

  // Table 2B elev PD → β_P + R-damp → β_Y (9.6); |V_S| via MES
  const chiGuid = buildChiTable2BElevPdSubsystem(200, 680, padE.MES)
  push(chiGuid.block)
  const h1 = buildH1EngineClusterSubsystem(520, 520)
  push(h1.block)
  const aero = buildAeroAirRelSubsystem(520, 820)
  push(aero.block)
  const Fb = push(
    B('sum', 'F_b_sum', 960, 560, { signs: '+++', numInputs: 3 })
  )
  const Mb = push(
    B('sum', 'M_b_sum', 960, 640, { signs: '+++', numInputs: 3 })
  )
  const { eomSubsystem, ports: eomPorts } = buildEomSubsystemBlock(1120, 480, {
    m0_kg: 586593,
    m_ref_kg: 586593,
    r0_i: [...padE.r0_E],
    v0_b: [...padE.v0_b],
    omega0: [0, 0, 0],
    q0: padE.q0_bE
  })
  eomSubsystem.name = 'EOM_6DoF_VarMass'
  eomSubsystem.id = nid('sub')
  // Hold-down: freeze 6DoF until bLiftoff; stays enabled through S-IVB (J-2)
  eomSubsystem.parameters = {
    ...eomSubsystem.parameters,
    showEnableInput: true
  }
  push(eomSubsystem)

  // —— Phase 0: S-frame nav + IGM shell (MDL port contract) ——
  const sFrame = buildLvdcSFrameNavSubsystem(40, 1100, padE.MES)
  push(sFrame.block)
  const igm = buildLvdcIgmShellSubsystem(520, 1100)
  push(igm.block)
  // HSL bCutoff from LVDC (T_3_i Add8 ≤ 0.04) — replaces fixed T_go stub
  const bCutoff = push(
    B('evaluate', 'bCutoff_d', 720, 1050, {
      numInputs: 1,
      expression: 'in(0)'
    })
  )
  const igmEnGate = push(
    B('evaluate', 'igm_enable_gate', 400, 1050, {
      numInputs: 2,
      expression: 'in(0) * (1.0 - in(1))'
    })
  )
  const chiSample0 = push(
    B('source', 'chi_sample_zero', 400, 1180, {
      signalType: 'constant',
      value: 0,
      dataType: 'double'
    })
  )
  const chiSample = push(
    B('mux', 'Chi_minor_loop_sample', 520, 1180, {
      rows: 1,
      cols: 3,
      baseType: 'double',
      outputType: 'double[3]',
      outputShape: 'vector'
    })
  )

  // —— Root outputs for SaturnIBPlantObliq mapper ——
  const outTime = push(
    B('output_port', 'time_s', 1200, 40, { portName: 'time_s' })
  )
  const outLift = push(
    B('output_port', 'bLiftoff', 1200, 100, { portName: 'bLiftoff' })
  )
  const outPadH = push(
    B('output_port', 'out_pad_h_m', 1200, 160, { portName: 'out_pad_h_m' })
  )
  const outPadLat = push(
    B('output_port', 'out_pad_lat_deg', 1200, 220, {
      portName: 'out_pad_lat_deg'
    })
  )
  const outPadLon = push(
    B('output_port', 'out_pad_lon_deg', 1200, 280, {
      portName: 'out_pad_lon_deg'
    })
  )
  const outAz = push(
    B('output_port', 'out_A_z_deg', 1200, 340, { portName: 'out_A_z_deg' })
  )
  const outStage = push(
    B('output_port', 'bStageSep', 1200, 400, { portName: 'bStageSep' })
  )
  const outIECO = push(
    B('output_port', 'bIECO', 1200, 460, { portName: 'bIECO' })
  )
  const outOECO = push(
    B('output_port', 'bOECO', 1200, 520, { portName: 'bOECO' })
  )
  const outSivbStart = push(
    B('output_port', 'bS_IVB_EngineStart', 1200, 580, {
      portName: 'bS_IVB_EngineStart'
    })
  )
  const outMass = push(
    B('output_port', 'mass_kg', 1200, 640, { portName: 'mass_kg' })
  )
  const outThrust = push(
    B('output_port', 'thrust_N', 1200, 700, { portName: 'thrust_N' })
  )
  const outRmag = push(
    B('output_port', 'r_mag_m', 1400, 40, { portName: 'r_mag_m' })
  )
  // EOM state for host OUT11 / veh_q_ECI packing
  const outRi = push(
    B('output_port', 'r_i', 1400, 100, {
      portName: 'r_i',
      dataType: 'double[3]'
    })
  )
  const outVb = push(
    B('output_port', 'v_b', 1400, 160, {
      portName: 'v_b',
      dataType: 'double[3]'
    })
  )
  const outWb = push(
    B('output_port', 'omega_b', 1400, 220, {
      portName: 'omega_b',
      dataType: 'double[3]'
    })
  )
  const outQ = push(
    B('output_port', 'q_bE', 1400, 280, {
      portName: 'q_bE',
      dataType: 'double[4][1]'
    })
  )
  const outQbar = push(
    B('output_port', 'qbar_Pa', 1400, 340, { portName: 'qbar_Pa' })
  )
  const outAlpha = push(
    B('output_port', 'alpha_deg', 1400, 400, { portName: 'alpha_deg' })
  )
  const outMaero = push(
    B('output_port', 'M_aero', 1400, 440, {
      portName: 'M_aero',
      dataType: 'double[3]'
    })
  )
  const outElev = push(
    B('output_port', 'elev_cmd_deg', 1400, 500, { portName: 'elev_cmd_deg' })
  )
  const outElevMeas = push(
    B('output_port', 'elev_meas_deg', 1400, 540, {
      portName: 'elev_meas_deg'
    })
  )
  const outBetaP = push(
    B('output_port', 'beta_P_cmd_deg', 1400, 580, {
      portName: 'beta_P_cmd_deg'
    })
  )
  const outBetaY = push(
    B('output_port', 'beta_Y_cmd_deg', 1400, 620, {
      portName: 'beta_Y_cmd_deg'
    })
  )
  const outVS = push(
    B('output_port', 'V_S_mag', 1400, 660, { portName: 'V_S_mag' })
  )
  const outvS = push(
    B('output_port', 'v_S', 1400, 700, {
      portName: 'v_S',
      dataType: 'double[3]'
    })
  )

  const stageOn = push(
    B('source', 'sib_stage_enable', 560, 320, {
      signalType: 'constant',
      value: 1,
      dataType: 'double'
    })
  )

  wires.push(
    W(inTl, iu, 0, 0),
    W(one, tPlant, 0, 0),
    W(t0, tPlant, 0, -1),
    W(tPlant, lift, 0, 0),
    W(inTl, lift, 0, 1),
    W(lift, outLift),
    W(tPlant, outTime),
    // RTW T2/T3 staging chain (mass arm → IECO/OECO → StageSep/S-IVB)
    W(eomSubsystem, compareC3, eomPorts.mass, 0),
    W(compareC3, t2, 0, 0),
    W(t0Evt, t2, 0, 1),
    W(t2, bIECO),
    W(t2, bOECO),
    W(bOECO, t3, 0, 0),
    W(t0Evt, t3, 0, 1),
    W(t3, bStage),
    W(t3, bSivb),
    W(t3, bIgmEn),
    W(bStage, outStage),
    W(bIECO, outIECO),
    W(bOECO, outOECO),
    W(bSivb, outSivbStart),
    W(lift, burnActive, 0, 0),
    W(bStage, burnActive, 0, 1),
    W(lift, eomEnable, 0, 0),
    W(bCutoff, eomEnable, 0, 1),
    // Phase 0 S-frame → IGM shell (Enable = IGM∧¬cutoff)
    W(bIgmEn, igmEnGate, 0, 0),
    W(bCutoff, igmEnGate, 0, 1),
    W(igmEnGate, igm.block, 0, -1),
    W(igmEnGate, igm.block, 0, igm.ports.igmEnable), // Chi hold gate (same signal)
    W(igm.block, bCutoff, igm.ports.bCutoff, 0),
    W(eomSubsystem, sFrame.block, eomPorts.r_i, sFrame.ports.r_i),
    W(eomSubsystem, sFrame.block, eomPorts.v_b, sFrame.ports.v_b),
    W(eomSubsystem, sFrame.block, eomPorts.q, sFrame.ports.q),
    W(eomSubsystem, sFrame.block, eomPorts.mass, sFrame.ports.mass),
    W(thrustTotal, sFrame.block, 0, sFrame.ports.thrust),
    W(sFrame.block, igm.block, sFrame.ports.XS, igm.ports.XS),
    W(sFrame.block, igm.block, sFrame.ports.XSdot, igm.ports.XSdot),
    W(sFrame.block, igm.block, sFrame.ports.G_S, igm.ports.G_S),
    W(sFrame.block, igm.block, sFrame.ports.A_m, igm.ports.A_m),
    W(sFrame.block, igm.block, sFrame.ports.FoverM, igm.ports.FoverM),
    W(sFrame.block, igm.block, sFrame.ports.MF_S, igm.ports.MF_S),
    W(t3, igm.block, 0, igm.ports.T3),
    W(chiSample0, chiSample, 0, 0),
    W(chiSample0, chiSample, 0, 1),
    W(chiSample0, chiSample, 0, 2),
    W(chiSample, igm.block, 0, igm.ports.ChiSample),
    W(stageOn, sibShell, 0, 0),
    W(inH, onPad, 0, 0),
    // Direct root passthrough for pad (On Pad multi-out was dropped by codegen)
    W(inLat, outPadLat),
    W(inLon, outPadLon),
    W(inH, outPadH),
    W(inAz, outAz),
    W(bStage, sivb, 0, 0),
    // Live H-1 TVC + J-2 + air-rel aero + EOM (hold-down on liftoff; J-2 after start)
    W(lift, tBurn, 0, 0),
    W(t0, tBurn, 0, 1),
    W(eomEnable, eomSubsystem, 0, -1),
    W(tBurn, thrustMag),
    W(tBurn, mdotCmd),
    W(mdotCmd, mdotSibGated, 0, 0),
    W(burnActive, mdotSibGated, 0, 1),
    W(thrustMag, thrustGated, 0, 0),
    W(burnActive, thrustGated, 0, 1),
    W(thrustGated, h1.block, 0, h1.ports.T),
    // J-2 axial thrust (no gimbal yet — RTW has actuators under <S304>)
    W(bSivb, tJ2, 0, 0),
    W(t0Evt, tJ2, 0, 1),
    W(j2Bias, j2LutT, 0, 0),
    W(tJ2, j2LutT, 0, 1),
    W(j2LutT, j2Thrust),
    W(bSivb, j2BurnOk, 0, 0),
    W(bCutoff, j2BurnOk, 0, 1),
    W(eomSubsystem, j2BurnOk, eomPorts.mass, 2),
    W(j2Thrust, j2ThrustGated, 0, 0),
    W(j2BurnOk, j2ThrustGated, 0, 1),
    W(j2ThrustGated, j2Mdot),
    W(j2ThrustGated, j2Fx, 0, 0),
    W(chiGuid.block, j2Fx, chiGuid.ports.betaP, 1),
    W(chiGuid.block, j2Fx, chiGuid.ports.betaY, 2),
    W(j2ThrustGated, j2Fy, 0, 0),
    W(chiGuid.block, j2Fy, chiGuid.ports.betaY, 1),
    W(j2ThrustGated, j2Fz, 0, 0),
    W(chiGuid.block, j2Fz, chiGuid.ports.betaP, 1),
    W(j2Fx, j2F, 0, 0),
    W(j2Fy, j2F, 0, 1),
    W(j2Fz, j2F, 0, 2),
    W(j2CGx, j2My, 0, 0),
    W(j2Fz, j2My, 0, 1),
    W(j2CGx, j2Mz, 0, 0),
    W(j2Fy, j2Mz, 0, 1),
    W(j2Mx0, j2M, 0, 0),
    W(j2My, j2M, 0, 1),
    W(j2Mz, j2M, 0, 2),
    W(mdotSibGated, mdotTotal, 0, 0),
    W(j2Mdot, mdotTotal, 0, 1),
    W(thrustGated, thrustTotal, 0, 0),
    W(j2ThrustGated, thrustTotal, 0, 1),
    W(tBurn, chiGuid.block, 0, chiGuid.ports.tBurn),
    W(eomSubsystem, chiGuid.block, eomPorts.omega_b, chiGuid.ports.omega_b),
    W(eomSubsystem, chiGuid.block, eomPorts.q, chiGuid.ports.q),
    W(eomSubsystem, chiGuid.block, eomPorts.v_b, chiGuid.ports.v_b),
    W(bIgmEn, chiGuid.block, 0, chiGuid.ports.igmEnable),
    // Wave C: Chi_Y (elev log) + Chi_cmd → Chi→Ψ→FCC when IGM on
    W(igm.block, chiGuid.block, igm.ports.chiY, chiGuid.ports.chiY),
    W(igm.block, chiGuid.block, igm.ports.chiCmd, chiGuid.ports.chiCmd),
    W(chiGuid.block, h1.block, chiGuid.ports.betaP, h1.ports.betaP),
    W(chiGuid.block, h1.block, chiGuid.ports.betaY, h1.ports.betaY),
    W(eomSubsystem, h1.block, eomPorts.mass, h1.ports.mass),
    W(h1.block, Fb, h1.ports.F, 0),
    W(aero.block, Fb, aero.ports.F, 1),
    W(j2F, Fb, 0, 2),
    W(h1.block, Mb, h1.ports.M, 0),
    W(aero.block, Mb, aero.ports.M, 1),
    W(j2M, Mb, 0, 2),
    W(Fb, eomSubsystem, 0, eomPorts.F_b),
    W(Mb, eomSubsystem, 0, eomPorts.M_b),
    W(mdotTotal, eomSubsystem, 0, eomPorts.mdot),
    // Aero feeds from EOM state (algebraic in-step; integrators hold)
    W(eomSubsystem, aero.block, eomPorts.r_i, aero.ports.r_i),
    W(eomSubsystem, aero.block, eomPorts.v_b, aero.ports.v_b),
    W(eomSubsystem, aero.block, eomPorts.q, aero.ports.q),
    W(eomSubsystem, aero.block, eomPorts.r_mag, aero.ports.r_mag),
    W(eomSubsystem, aero.block, eomPorts.mass, aero.ports.mass),
    W(eomSubsystem, outMass, eomPorts.mass, 0),
    W(eomSubsystem, outRmag, eomPorts.r_mag, 0),
    W(eomSubsystem, outRi, eomPorts.r_i, 0),
    W(eomSubsystem, outVb, eomPorts.v_b, 0),
    W(eomSubsystem, outWb, eomPorts.omega_b, 0),
    W(eomSubsystem, outQ, eomPorts.q, 0),
    W(aero.block, outQbar, aero.ports.qbar, 0),
    W(aero.block, outAlpha, aero.ports.alpha_deg, 0),
    W(aero.block, outMaero, aero.ports.M, 0),
    W(chiGuid.block, outElev, chiGuid.ports.elevCmd, 0),
    W(chiGuid.block, outElevMeas, chiGuid.ports.elevMeas, 0),
    W(chiGuid.block, outBetaP, chiGuid.ports.betaP, 0),
    W(chiGuid.block, outBetaY, chiGuid.ports.betaY, 0),
    W(chiGuid.block, outVS, chiGuid.ports.V_S, 0),
    W(chiGuid.block, outvS, chiGuid.ports.v_S, 0),
    W(thrustTotal, outThrust),
    W(eomSubsystem, bodyToEci, eomPorts.q, 0)
  )

  const main: SliceSheet = {
    id: 'main',
    name: 'Saturn_IB_Stack',
    blocks,
    connections: wires,
    extents: { width: 1600, height: 800 }
  }

  return {
    name: 'saturn-ib-obliq-plant',
    description:
      'Obliq plant: EOM+H1+aero; T2/T3; J-2; LVDC S-Frame+IGM (Chi→Ψ→FCC Wave C).',
    sheets: [main],
    parameters: [],
    globalSettings: {
      simulationTimeStep: 0.005,
      simulationDuration: 1000,
      integrationAlgorithm: 'rk4'
    }
  }
}

/** JSON document for cgen / fixtures */
export function buildSaturnIbObliqPlantDocument() {
  const m = buildSaturnIbObliqPlant()
  return {
    name: m.name,
    data: sliceToModelData(m)
  }
}

/** Expected subsystem names for tests (MDL parity). */
export const EXPECTED_TOP_LEVEL_SUBSYSTEMS = [
  'Body to ECI',
  'CM_ISS',
  "Earth's Rotation",
  'Initial Conditions',
  'MES Transform',
  'On Pad',
  'S-IB Stage',
  'S-IVB Stage',
  'Saturn Instrument Unit (IU)'
] as const

/** Names inside the S-IB Stage shell (MDL strings; live physics at root). */
export const EXPECTED_SIB_STAGE_SUBSYSTEMS = [
  'Custom Variable Mass 6DoF (Quaternion)',
  'H-1 Engine Cluster',
  'Aerodynamic Forces and Moments',
  'Earth Gravity Model',
  'Relative Wind',
  'Vehicle Mass Properties',
  'ECI to LLA',
  'Retrorocket Motors'
] as const

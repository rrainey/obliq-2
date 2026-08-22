/**
 * 6-DOF variable-mass equations of motion (quaternion attitude)
 *
 * Aligns with Aerospace Blockset **Custom Variable Mass 6DoF (Quaternion)**
 * body-axis EOM used in saturn_ib_stack.mdl:
 *
 * Translation (body):
 *   v̇_b = F_b / m − ω × v_b + g_b
 *
 * Rotation (variable mass — includes İω term):
 *   I(m) = I_ref · (m / m_ref)     (principal / diagonal I_ref for now)
 *   İ    = I_ref · (ṁ / m_ref)     (ṁ = −ṁ_prop)
 *   ω̇    = I⁻¹ [ M_b − ω × (I ω) − İ ω ]
 *
 * Quaternion kinematics:
 *   q̇ = ½ Ω(ω) q   (body2quaternion_rates) + unit renorm
 *
 * Inertial kinematics:
 *   ṙ_i = C_bi · v_b
 *
 * Gravity (point mass; Simulink may use oblate Earth model later):
 *   g_i = −μ r_i / |r|³ ,  g_b = C_biᵀ · g_i
 *
 * Still simplified vs full mdl: diagonal I only (no products of inertia /
 * matrix inverse); mass integrated inside (custom type feeds m,I from parent).
 *
 * AS-205 9.4+ frame: r_i in E; pad via as205EciPlant; S export via MES.
 */

import {
  table2bChiTimeBreakpoints,
  table2bPlantElevDeg
} from './as205ChiTable'
import {
  table5ThrustTimeBreakpoints,
  table5ThrustN,
  table5MdotFromMass
} from './as205ThrustTable'
import {
  as205DefaultPadStateEci,
  mat3ToSourceValue
} from './as205EciPlant'
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
import { H1_GIMBAL_LIMIT_DEG } from './as205Engines'

/** Local types (avoid circular import with sliceModels) */
export interface SliceBlock {
  id: string
  name: string
  type: string
  position: { x: number; y: number }
  parameters?: Record<string, any>
}

export interface SliceWire {
  id: string
  sourceBlockId: string
  sourcePortIndex: number
  targetBlockId: string
  targetPortIndex: number
}

export interface SliceSheet {
  id: string
  name: string
  blocks: SliceBlock[]
  connections: SliceWire[]
  extents: { width: number; height: number }
}

export interface SliceModel {
  name: string
  description: string
  sheets: SliceSheet[]
  parameters?: Array<{
    name: string
    dataType?: string
    defaultValue?: string
    signalType?: string
    value?: number | number[]
  }>
  globalSettings: {
    simulationTimeStep: number
    simulationDuration: number
    integrationAlgorithm?: 'euler' | 'rk4'
  }
}

let _id = 0
const nid = (p: string) => `${p}_${++_id}`
const resetIds = () => {
  _id = 0
}

function B(
  type: string,
  name: string,
  x: number,
  y: number,
  parameters: Record<string, any> = {}
): SliceBlock {
  return { id: nid(type), name, type, position: { x, y }, parameters }
}

function W(from: SliceBlock, to: SliceBlock, fp = 0, tp = 0): SliceWire {
  return {
    id: nid('w'),
    sourceBlockId: from.id,
    sourcePortIndex: fp,
    targetBlockId: to.id,
    targetPortIndex: tp
  }
}

/**
 * Physics / MDL Custom-6DoF adapter options (see DCM_QUAT_EOM_AUDIT.md).
 */
export interface EomPhysicsOptions {
  /**
   * If true: F_aug = F_b + m·g_b, then v̇ = F_aug/m − ω×v (no separate +g_b).
   * Matches MDL “gravity in Forces” contract; spherical g still computed here.
   */
  forcePathGravity?: boolean
  /**
   * If true: drop İω term (MDL grounds I_dot into 6DoF).
   */
  zeroIdot?: boolean
  /**
   * If true: ṙ = C_ib·v_b with C_bi=quat_to_dcm(q), C_ib=C_biᵀ.
   * Use with mdlWire IC q=dcmToQuat(LIO) so Ve=Transpose(ASB)·Vb.
   */
  veViaTranspose?: boolean
}

/** Locked MDL wire-as-is + Custom 6DoF adapter defaults for Saturn plant. */
export const EOM_MDL_ADAPTER: EomPhysicsOptions = {
  forcePathGravity: true,
  zeroIdot: true,
  veViaTranspose: true
}

/**
 * Build the 6-DOF variable-mass quaternion EOM as a main demonstration sheet.
 *
 * External drives (sources, replace with input_ports for a subsystem):
 *   F_b [3], M_b [3], mdot_prop ≥ 0
 *
 * IC sources:
 *   r0_i [3], v0_b [3], omega0 [3], q0 [4×1], m0
 */
export function buildSixDofVariableMassEom(
  physics: EomPhysicsOptions = {}
): SliceModel {
  const forcePathGravity = physics.forcePathGravity === true
  const zeroIdot = physics.zeroIdot === true
  const veViaTranspose = physics.veViaTranspose === true

  resetIds()
  const blocks: SliceBlock[] = []
  const wires: SliceWire[] = []
  const add = (b: SliceBlock) => {
    blocks.push(b)
    return b
  }
  const connect = (a: SliceBlock, b: SliceBlock, fp = 0, tp = 0) => {
    wires.push(W(a, b, fp, tp))
  }

  // ─── Constants / environment ─────────────────────────────────────────
  const mu = add(
    B('source', 'mu', 20, 20, {
      signalType: 'constant',
      value: 3.986004418e14,
      dataType: 'double'
    })
  )
  const m_ref = add(
    B('source', 'm_ref', 20, 80, {
      signalType: 'constant',
      value: 590000,
      dataType: 'double'
    })
  )
  const Ixx_ref = add(
    B('source', 'Ixx_ref', 20, 140, {
      signalType: 'constant',
      value: 1.0e7,
      dataType: 'double'
    })
  )
  const Iyy_ref = add(
    B('source', 'Iyy_ref', 20, 200, {
      signalType: 'constant',
      value: 8.0e7,
      dataType: 'double'
    })
  )
  const Izz_ref = add(
    B('source', 'Izz_ref', 20, 260, {
      signalType: 'constant',
      value: 8.0e7,
      dataType: 'double'
    })
  )

  // ─── External inputs (demo sources) ──────────────────────────────────
  const Fb = add(
    B('source', 'F_b', 20, 360, {
      signalType: 'constant',
      value: [0, 0, 0],
      dataType: 'double[3]'
    })
  )
  const Mb = add(
    B('source', 'M_b', 20, 440, {
      signalType: 'constant',
      value: [0, 0, 0],
      dataType: 'double[3]'
    })
  )
  // Propellant burn rate ≥ 0 (kg/s). Demo: constant 0 (coast). Set >0 for mass loss.
  const mdot_prop = add(
    B('source', 'mdot_prop', 20, 520, {
      signalType: 'constant',
      value: 0,
      dataType: 'double'
    })
  )

  // ─── Initial conditions ──────────────────────────────────────────────
  // r0: on pad-ish radius along +X_ECI
  const r0 = add(
    B('source', 'r0_i', 20, 600, {
      signalType: 'constant',
      value: [6.371e6 + 50, 0, 0],
      dataType: 'double[3]'
    })
  )
  const v0 = add(
    B('source', 'v0_b', 20, 680, {
      signalType: 'constant',
      value: [0, 0, 0],
      dataType: 'double[3]'
    })
  )
  const w0 = add(
    B('source', 'omega0', 20, 760, {
      signalType: 'constant',
      value: [0.0, 0.01, 0.0], // small pitch rate for attitude motion
      dataType: 'double[3]'
    })
  )
  const q0 = add(
    B('source', 'q0', 20, 840, {
      signalType: 'constant',
      dataType: 'double[4][1]',
      value: [[1], [0], [0], [0]]
    })
  )
  const m0 = add(
    B('source', 'm0', 20, 920, {
      signalType: 'constant',
      value: 590000,
      dataType: 'double'
    })
  )

  // ─── State integrators ───────────────────────────────────────────────
  const r_i = add(
    B('integrator', 'r_i', 900, 600, {
      showInitPort: true,
      initialValue: 0,
      showEnableInput: false,
      showResetInput: false
    })
  )
  const v_b = add(
    B('integrator', 'v_b', 900, 400, {
      showInitPort: true,
      initialValue: 0
    })
  )
  const omega = add(
    B('integrator', 'omega_b', 900, 200, {
      showInitPort: true,
      initialValue: 0
    })
  )
  // q_raw integrates; q_hat is unit-normalized for all attitude consumers
  const q_raw = add(
    B('integrator', 'q_raw', 900, 40, {
      showInitPort: true,
      initialValue: 0
    })
  )
  const mass = add(
    B('integrator', 'mass', 500, 920, {
      showInitPort: true,
      initialValue: 0,
      useLimits: true,
      lowerLimit: 1, // never zero mass
      upperLimit: 1e9
    })
  )

  connect(r0, r_i, 0, 1)
  connect(v0, v_b, 0, 1)
  connect(w0, omega, 0, 1)
  connect(q0, q_raw, 0, 1)
  connect(m0, mass, 0, 1)

  // ─── Mass: ṁ = −mdot_prop ────────────────────────────────────────────
  const mdot = add(B('uminus', 'm_dot', 300, 920, {}))
  connect(mdot_prop, mdot)
  connect(mdot, mass, 0, 0)

  // ─── Variable principal inertias I = I_ref * (m / m_ref) ─────────────
  const m_over_mref = add(B('divide', 'm_over_mref', 300, 860, {}))
  connect(mass, m_over_mref, 0, 0)
  connect(m_ref, m_over_mref, 0, 1)

  const Ixx = add(B('matrix_multiply', 'Ixx', 480, 140, {})) // scalar * scalar path via mm
  const Iyy = add(B('matrix_multiply', 'Iyy', 480, 200, {}))
  const Izz = add(B('matrix_multiply', 'Izz', 480, 260, {}))
  // matrix_multiply scalar×scalar works
  connect(Ixx_ref, Ixx, 0, 0)
  connect(m_over_mref, Ixx, 0, 1)
  connect(Iyy_ref, Iyy, 0, 0)
  connect(m_over_mref, Iyy, 0, 1)
  connect(Izz_ref, Izz, 0, 0)
  connect(m_over_mref, Izz, 0, 1)

  // ─── Demux omega → P, Q, R ───────────────────────────────────────────
  const demux_w = add(
    B('demux', 'demux_omega', 500, 40, {
      outputCount: 3,
      inputDimensions: [3]
    })
  )
  connect(omega, demux_w)
  // ports 0,1,2 = P,Q,R

  // ─── Quaternion renorm: q_hat = q_raw / |q_raw| ─────────────────────
  const demux_q = add(
    B('demux', 'demux_q_raw', 1040, 40, {
      outputCount: 4,
      inputDimensions: [4, 1]
    })
  )
  connect(q_raw, demux_q)
  const qmag = add(
    B('evaluate', 'q_mag', 1180, 40, {
      numInputs: 4,
      expression:
        'sqrt(in(0)*in(0)+in(1)*in(1)+in(2)*in(2)+in(3)*in(3))'
    })
  )
  connect(demux_q, qmag, 0, 0)
  connect(demux_q, qmag, 1, 1)
  connect(demux_q, qmag, 2, 2)
  connect(demux_q, qmag, 3, 3)
  // avoid /0: qmag_safe = max(qmag, eps) via evaluate
  const qmag_safe = add(
    B('evaluate', 'q_mag_safe', 1180, 100, {
      numInputs: 1,
      expression: 'in(0) > 1e-12 ? in(0) : 1e-12'
    })
  )
  connect(qmag, qmag_safe)
  const qn0 = add(B('divide', 'q0_hat', 1320, 20, {}))
  const qn1 = add(B('divide', 'q1_hat', 1320, 60, {}))
  const qn2 = add(B('divide', 'q2_hat', 1320, 100, {}))
  const qn3 = add(B('divide', 'q3_hat', 1320, 140, {}))
  connect(demux_q, qn0, 0, 0)
  connect(qmag_safe, qn0, 0, 1)
  connect(demux_q, qn1, 1, 0)
  connect(qmag_safe, qn1, 0, 1)
  connect(demux_q, qn2, 2, 0)
  connect(qmag_safe, qn2, 0, 1)
  connect(demux_q, qn3, 3, 0)
  connect(qmag_safe, qn3, 0, 1)
  const q = add(
    B('mux', 'q_hat', 1460, 60, {
      rows: 4,
      cols: 1,
      baseType: 'double',
      outputType: 'double[4][1]',
      outputShape: 'matrix'
    })
  )
  connect(qn0, q, 0, 0)
  connect(qn1, q, 0, 1)
  connect(qn2, q, 0, 2)
  connect(qn3, q, 0, 3)

  // ─── Quaternion kinematics (uses unit q) ─────────────────────────────
  const qdot = add(B('body2quaternion_rates', 'q_dot', 700, 40, {}))
  connect(q, qdot, 0, 0)
  connect(demux_w, qdot, 0, 1) // P
  connect(demux_w, qdot, 1, 2) // Q
  connect(demux_w, qdot, 2, 3) // R
  connect(qdot, q_raw, 0, 0) // integrate un-normalized rate into q_raw

  // ─── DCM body→inertial (from unit quaternion) ────────────────────────
  const C_bi = add(
    B('orientation_conversion', 'C_bi', 700, 140, {
      conversionType: 'quat_to_dcm'
    })
  )
  connect(q, C_bi, 0, 0)
  const C_ib = add(B('transpose', 'C_ib', 700, 220, {})) // inertial→body
  connect(C_bi, C_ib)

  // ─── Gravity g_i = −μ r / |r|³ ───────────────────────────────────────
  const rmag = add(B('mag', 'r_mag', 500, 600, {}))
  connect(r_i, rmag)
  const rmag2 = add(B('multiply', 'r_mag2', 500, 660, { numInputs: 2 }))
  connect(rmag, rmag2, 0, 0)
  connect(rmag, rmag2, 0, 1)
  const rmag3 = add(B('multiply', 'r_mag3', 500, 720, { numInputs: 2 }))
  connect(rmag2, rmag3, 0, 0)
  connect(rmag, rmag3, 0, 1)
  const mu_over_r3 = add(B('divide', 'mu_over_r3', 640, 660, {}))
  connect(mu, mu_over_r3, 0, 0)
  connect(rmag3, mu_over_r3, 0, 1)
  // g_i = − (μ/r³) * r  (scalar * vector via matrix_multiply, then uminus)
  const mu_r = add(B('matrix_multiply', 'mu_r_vec', 780, 600, {}))
  connect(mu_over_r3, mu_r, 0, 0)
  connect(r_i, mu_r, 0, 1)
  const g_i = add(B('uminus', 'g_i', 900, 720, {}))
  connect(mu_r, g_i)

  // g_b = C_ib * g_i
  const g_b = add(B('matrix_multiply', 'g_b', 780, 720, {}))
  connect(C_ib, g_b, 0, 0)
  connect(g_i, g_b, 0, 1)

  // ─── Translational ───────────────────────────────────────────────────
  // Legacy: v̇ = F/m − ω×v + g_b
  // forcePathGravity: F_aug = F + m·g_b; v̇ = F_aug/m − ω×v  (MDL Forces contract)
  const m_g_b = add(B('matrix_multiply', 'm_g_b', 500, 360, {}))
  connect(mass, m_g_b, 0, 0)
  connect(g_b, m_g_b, 0, 1)
  const F_for_accel = forcePathGravity
    ? (() => {
        const F_aug = add(
          B('sum', 'F_aug_with_gravity', 560, 360, { signs: '++', numInputs: 2 })
        )
        connect(Fb, F_aug, 0, 0)
        connect(m_g_b, F_aug, 0, 1)
        return F_aug
      })()
    : Fb

  const F_over_m = add(B('divide', 'F_over_m', 500, 400, {}))
  connect(F_for_accel, F_over_m, 0, 0)
  connect(mass, F_over_m, 0, 1)

  const w_cross_v = add(B('cross', 'w_x_v', 500, 480, {}))
  connect(omega, w_cross_v, 0, 0)
  connect(v_b, w_cross_v, 0, 1)
  const neg_wxv = add(B('uminus', 'neg_wxv', 640, 480, {}))
  connect(w_cross_v, neg_wxv)

  const vdot_1 = add(B('sum', 'vdot_tmp', 700, 400, { signs: '++', numInputs: 2 }))
  connect(F_over_m, vdot_1, 0, 0)
  connect(neg_wxv, vdot_1, 0, 1)
  if (forcePathGravity) {
    // F already includes m·g_b — no separate +g_b
    connect(vdot_1, v_b, 0, 0)
  } else {
    const v_dot = add(B('sum', 'v_dot', 820, 400, { signs: '++', numInputs: 2 }))
    connect(vdot_1, v_dot, 0, 0)
    connect(g_b, v_dot, 0, 1)
    connect(v_dot, v_b, 0, 0)
  }

  // ─── ṙ_i: legacy C_bi·v_b; mdlWire Ve=Transpose(ASB)·Vb ⇒ C_ib·v_b ───
  const r_dot = add(B('matrix_multiply', 'r_dot', 780, 520, {}))
  connect(veViaTranspose ? C_ib : C_bi, r_dot, 0, 0)
  connect(v_b, r_dot, 0, 1)
  connect(r_dot, r_i, 0, 0)

  // ─── Rotational Euler (variable-mass, principal axes) ─────────────────
  // Simulink Custom Variable Mass 6DoF:
  //   ω̇ = I⁻¹ [ M − ω×(Iω) − İω ]
  // I = I_ref (m/m_ref),  İ = I_ref (ṁ/m_ref),  ṁ = −ṁ_prop
  //
  // Iω (component-wise for diagonal I)
  const Iw_x = add(B('matrix_multiply', 'Iw_x', 500, 300, {}))
  const Iw_y = add(B('matrix_multiply', 'Iw_y', 500, 340, {}))
  const Iw_z = add(B('matrix_multiply', 'Iw_z', 500, 380, {}))
  connect(Ixx, Iw_x, 0, 0)
  connect(demux_w, Iw_x, 0, 1)
  connect(Iyy, Iw_y, 0, 0)
  connect(demux_w, Iw_y, 1, 1)
  connect(Izz, Iw_z, 0, 0)
  connect(demux_w, Iw_z, 2, 1)
  const Iw = add(
    B('mux', 'I_omega', 640, 320, {
      outputShape: 'vector',
      rows: 1,
      cols: 3,
      baseType: 'double',
      outputType: 'double[3]'
    })
  )
  connect(Iw_x, Iw, 0, 0)
  connect(Iw_y, Iw, 0, 1)
  connect(Iw_z, Iw, 0, 2)

  // ω × (Iω)
  const w_cross_Iw = add(B('cross', 'w_x_Iw', 700, 300, {}))
  connect(omega, w_cross_Iw, 0, 0)
  connect(Iw, w_cross_Iw, 0, 1)
  const neg_wIw = add(B('uminus', 'neg_wIw', 820, 300, {}))
  connect(w_cross_Iw, neg_wIw)

  // İ = I_ref · (ṁ / m_ref);  ṁ signal is m_dot = −mdot_prop
  const mdot_over_mref = add(B('divide', 'mdot_over_mref', 300, 800, {}))
  connect(mdot, mdot_over_mref, 0, 0)
  connect(m_ref, mdot_over_mref, 0, 1)
  const Idot_xx = add(B('matrix_multiply', 'Idot_xx', 480, 800, {}))
  const Idot_yy = add(B('matrix_multiply', 'Idot_yy', 480, 840, {}))
  const Idot_zz = add(B('matrix_multiply', 'Idot_zz', 480, 880, {}))
  connect(Ixx_ref, Idot_xx, 0, 0)
  connect(mdot_over_mref, Idot_xx, 0, 1)
  connect(Iyy_ref, Idot_yy, 0, 0)
  connect(mdot_over_mref, Idot_yy, 0, 1)
  connect(Izz_ref, Idot_zz, 0, 0)
  connect(mdot_over_mref, Idot_zz, 0, 1)
  // İω
  const Idot_w_x = add(B('matrix_multiply', 'Idot_w_x', 640, 800, {}))
  const Idot_w_y = add(B('matrix_multiply', 'Idot_w_y', 640, 840, {}))
  const Idot_w_z = add(B('matrix_multiply', 'Idot_w_z', 640, 880, {}))
  connect(Idot_xx, Idot_w_x, 0, 0)
  connect(demux_w, Idot_w_x, 0, 1)
  connect(Idot_yy, Idot_w_y, 0, 0)
  connect(demux_w, Idot_w_y, 1, 1)
  connect(Idot_zz, Idot_w_z, 0, 0)
  connect(demux_w, Idot_w_z, 2, 1)
  const Idot_w = add(
    B('mux', 'Idot_omega', 780, 820, {
      outputShape: 'vector',
      rows: 1,
      cols: 3,
      baseType: 'double',
      outputType: 'double[3]'
    })
  )
  connect(Idot_w_x, Idot_w, 0, 0)
  connect(Idot_w_y, Idot_w, 0, 1)
  connect(Idot_w_z, Idot_w, 0, 2)
  const neg_Idot_w = add(B('uminus', 'neg_Idot_w', 900, 820, {}))
  connect(Idot_w, neg_Idot_w)

  // M_net = M − ω×(Iω) − İω  (zeroIdot: drop İω — MDL grounds I_dot)
  const M_tmp = add(B('sum', 'M_tmp', 700, 360, { signs: '++', numInputs: 2 }))
  connect(Mb, M_tmp, 0, 0)
  connect(neg_wIw, M_tmp, 0, 1)
  let M_net: SliceBlock = M_tmp
  if (!zeroIdot) {
    M_net = add(B('sum', 'M_net', 820, 360, { signs: '++', numInputs: 2 }))
    connect(M_tmp, M_net, 0, 0)
    connect(neg_Idot_w, M_net, 0, 1)
  }

  // ω̇_i = M_net_i / I_i  (principal-axis inverse)
  const demux_M = add(
    B('demux', 'demux_Mnet', 940, 360, {
      outputCount: 3,
      inputDimensions: [3]
    })
  )
  connect(M_net, demux_M)
  const wd_x = add(B('divide', 'wd_x', 1080, 300, {}))
  const wd_y = add(B('divide', 'wd_y', 1080, 340, {}))
  const wd_z = add(B('divide', 'wd_z', 1080, 380, {}))
  connect(demux_M, wd_x, 0, 0)
  connect(Ixx, wd_x, 0, 1)
  connect(demux_M, wd_y, 1, 0)
  connect(Iyy, wd_y, 0, 1)
  connect(demux_M, wd_z, 2, 0)
  connect(Izz, wd_z, 0, 1)
  const w_dot = add(
    B('mux', 'omega_dot', 1200, 320, {
      outputShape: 'vector',
      rows: 1,
      cols: 3,
      baseType: 'double',
      outputType: 'double[3]'
    })
  )
  connect(wd_x, w_dot, 0, 0)
  connect(wd_y, w_dot, 0, 1)
  connect(wd_z, w_dot, 0, 2)
  connect(w_dot, omega, 0, 0)

  // ─── Outputs ─────────────────────────────────────────────────────────
  const out_r = add(B('output_port', 'r_i_out', 1360, 600, { portName: 'r_i' }))
  const out_v = add(B('output_port', 'v_b_out', 1360, 400, { portName: 'v_b' }))
  const out_w = add(B('output_port', 'omega_out', 1360, 200, { portName: 'omega_b' }))
  const out_q = add(B('output_port', 'q_out', 1360, 40, { portName: 'q' }))
  const out_m = add(B('output_port', 'mass_out', 1360, 920, { portName: 'mass' }))
  const out_h = add(B('output_port', 'rmag_out', 1360, 660, { portName: 'r_mag' }))

  connect(r_i, out_r)
  connect(v_b, out_v)
  connect(omega, out_w)
  connect(q, out_q)
  connect(mass, out_m)
  connect(rmag, out_h)

  const mainSheet: SliceSheet = {
    id: 'main',
    name: '6DoF_VarMass_Quat',
    blocks,
    connections: wires,
    extents: { width: 1400, height: 1000 }
  }

  const descParts = [
    '6-DOF variable-mass EOM',
    forcePathGravity ? 'forcePathGravity' : 'g_in_vdot',
    zeroIdot ? 'zeroIdot' : 'Idot_omega',
    veViaTranspose ? 'veViaTranspose' : 've=C_bi*vb'
  ]
  return {
    name: 'saturn-6dof-varmass-quaternion-eom',
    description: descParts.join('; '),
    sheets: [mainSheet],
    parameters: [
      {
        name: 'mu_earth',
        dataType: 'double',
        defaultValue: '3.986004418e14',
        signalType: 'double',
        value: 3.986004418e14
      },
      {
        name: 'm_ref_kg',
        dataType: 'double',
        defaultValue: '590000',
        signalType: 'double',
        value: 590000
      }
    ],
    globalSettings: {
      simulationTimeStep: 0.01,
      simulationDuration: 30,
      integrationAlgorithm: 'rk4'
    }
  }
}

export interface EomSubsystemOptions {
  /** Initial mass IC (kg). Default from core EOM (590000). TN Table 5 first-motion ≈ 586593. */
  m0_kg?: number
  /** Reference mass for I ∝ m/m_ref. Defaults to m0_kg when set. */
  m_ref_kg?: number
  /** Body rate IC [P,Q,R] (rad/s). Default core has small Q≈0.01. */
  omega0?: number[]
  /**
   * Inertial position IC (m). AS-205 9.4+: **E-system** (ECI) pad r_E.
   */
  r0_i?: number[]
  /**
   * Body velocity IC (m/s). AS-205: V_S at pad (B‖S); r integrates in E.
   */
  v0_b?: number[]
  /** Attitude quat IC (column). Legacy LIOᵀ or mdlWire LIO — see physics.veViaTranspose. */
  q0?: number[][]
  /** MDL Custom-6DoF adapter physics (defaults off for demos). */
  physics?: EomPhysicsOptions
}

/** EOM as flattenable subsystem (shared by burn demos / Obliq Saturn_IB plant). */
export function buildEomSubsystemBlock(
  x = 520,
  y = 220,
  options: EomSubsystemOptions = {}
): {
  eomSubsystem: SliceBlock
  core: SliceModel
  /** Port indices on EOM subsystem */
  ports: {
    F_b: number
    M_b: number
    mdot: number
    r_i: number
    v_b: number
    omega_b: number
    q: number
    mass: number
    r_mag: number
  }
} {
  const core = buildSixDofVariableMassEom(options.physics ?? {})
  const coreSheet = core.sheets[0]

  const renamePort: Record<string, { portName: string; dataType: string }> = {
    F_b: { portName: 'F_b', dataType: 'double[3]' },
    M_b: { portName: 'M_b', dataType: 'double[3]' },
    mdot_prop: { portName: 'mdot_prop', dataType: 'double' }
  }

  const m0 = options.m0_kg
  const mRef = options.m_ref_kg ?? options.m0_kg
  const omega0 = options.omega0
  const r0 = options.r0_i
  const v0 = options.v0_b
  const q0 = options.q0

  const subBlocks = coreSheet.blocks.map(b => {
    if (renamePort[b.name]) {
      const p = renamePort[b.name]
      return {
        ...b,
        type: 'input_port',
        name: p.portName,
        parameters: {
          portName: p.portName,
          dataType: p.dataType,
          defaultValue: 0
        }
      }
    }
    // Optional mass IC / reference overrides (TN alignment)
    if (m0 !== undefined && b.name === 'm0') {
      return { ...b, parameters: { ...b.parameters, value: m0 } }
    }
    if (mRef !== undefined && b.name === 'm_ref') {
      return { ...b, parameters: { ...b.parameters, value: mRef } }
    }
    if (omega0 !== undefined && b.name === 'omega0') {
      return {
        ...b,
        parameters: { ...b.parameters, value: omega0, dataType: 'double[3]' }
      }
    }
    if (r0 !== undefined && b.name === 'r0_i') {
      return {
        ...b,
        parameters: { ...b.parameters, value: r0, dataType: 'double[3]' }
      }
    }
    if (v0 !== undefined && b.name === 'v0_b') {
      return {
        ...b,
        parameters: { ...b.parameters, value: v0, dataType: 'double[3]' }
      }
    }
    if (q0 !== undefined && b.name === 'q0') {
      return {
        ...b,
        parameters: {
          ...b.parameters,
          value: q0,
          dataType: 'double[4][1]'
        }
      }
    }
    return { ...b }
  })

  if (m0 !== undefined || mRef !== undefined) {
    core.parameters = (core.parameters || []).map(p => {
      if (p.name === 'm_ref_kg' && mRef !== undefined) {
        return { ...p, defaultValue: String(mRef), value: mRef }
      }
      return p
    })
  }

  const outputPortNames = ['r_i', 'v_b', 'omega_b', 'q', 'mass', 'r_mag']
  const inputPortNames = ['F_b', 'M_b', 'mdot_prop']

  const eomSubsystem: SliceBlock = {
    id: 'sub_eom',
    name: 'EOM_6DoF_VarMass',
    type: 'subsystem',
    position: { x, y },
    parameters: {
      sheets: [
        {
          id: 'eom_internal',
          name: 'EOM Internals',
          blocks: subBlocks,
          connections: coreSheet.connections.map(c => ({ ...c })),
          extents: { width: 1600, height: 1100 }
        }
      ],
      inputPorts: inputPortNames,
      outputPorts: outputPortNames,
      showEnableInput: false,
      codeGenStrategy: 'flatten'
    }
  }

  return {
    eomSubsystem,
    core,
    ports: {
      F_b: 0,
      M_b: 1,
      mdot: 2,
      r_i: 0,
      v_b: 1,
      omega_b: 2,
      q: 3,
      mass: 4,
      r_mag: 5
    }
  }
}

/**
 * Package EOM physics as a subsystem with ports:
 *   in:  F_b[3], M_b[3], mdot_prop
 *   out: r_i[3], v_b[3], omega_b[3], q[4x1], mass, r_mag
 * Parent applies axial thrust + burn schedule for a short boost demo.
 */
export function buildSixDofVehicleBurnDemo(): SliceModel {
  resetIds()
  const { eomSubsystem, core, ports } = buildEomSubsystemBlock(520, 220)

  // Parent: axial thrust after liftoff + propellant flow
  const liftoff = B('source', 'liftoff', 40, 80, {
    signalType: 'step',
    stepTime: 1.0,
    stepValue: 1.0,
    dataType: 'double'
  })
  const edge = B('edge_detect', 'liftoff_edge', 180, 80, {
    edge: 'rising',
    threshold: 0.5
  })
  const one = B('source', 'one', 40, 160, {
    signalType: 'constant',
    value: 1,
    dataType: 'double'
  })
  const tBurn = B('integrator', 't_burn', 180, 160, {
    showResetInput: true,
    initialValue: 0,
    showInitPort: false
  })
  // Thrust magnitude schedule (N)
  const thrustMag = B('lookup_1d', 'ThrustMag_N', 340, 160, {
    inputValues: [0, 0.5, 1, 5, 20, 50, 80, 100],
    outputValues: [0, 4e5, 8e5, 8.9e5, 8.9e5, 8.9e5, 5e5, 0],
    extrapolation: 'clamp'
  })
  // mdot during burn ~ T/(Isp*g0) with Isp~260s → mdot ≈ T/2550
  const mdotScale = B('source', 'mdot_scale', 340, 260, {
    signalType: 'constant',
    value: 1 / 2550,
    dataType: 'double'
  })
  const mdotCmd = B('matrix_multiply', 'mdot_cmd', 500, 220, {})
  // F_b = [Thrust, 0, 0]
  const zero = B('source', 'zero', 340, 320, {
    signalType: 'constant',
    value: 0,
    dataType: 'double'
  })
  const Fb = B('mux', 'F_b_cmd', 500, 160, {
    rows: 1,
    cols: 3,
    baseType: 'double',
    outputType: 'double[3]',
    outputShape: 'vector'
  })
  const Mb = B('source', 'M_b_cmd', 500, 300, {
    signalType: 'constant',
    value: [0, 0, 0],
    dataType: 'double[3]'
  })

  const outR = B('output_port', 'r_i', 780, 160, { portName: 'r_i' })
  const outV = B('output_port', 'v_b', 780, 220, { portName: 'v_b' })
  const outM = B('output_port', 'mass', 780, 280, { portName: 'mass' })
  const outQ = B('output_port', 'q', 780, 340, { portName: 'q' })
  const outRmag = B('output_port', 'r_mag', 780, 400, { portName: 'r_mag' })
  const outT = B('output_port', 'thrust', 780, 100, { portName: 'thrust_N' })

  const parentBlocks = [
    liftoff,
    edge,
    one,
    tBurn,
    thrustMag,
    mdotScale,
    mdotCmd,
    zero,
    Fb,
    Mb,
    eomSubsystem,
    outR,
    outV,
    outM,
    outQ,
    outRmag,
    outT
  ]

  const parentWires: SliceWire[] = [
    W(liftoff, edge),
    W(one, tBurn, 0, 0),
    W(edge, tBurn, 0, -2),
    W(tBurn, thrustMag),
    W(thrustMag, outT),
    W(thrustMag, mdotCmd, 0, 0),
    W(mdotScale, mdotCmd, 0, 1),
    W(thrustMag, Fb, 0, 0), // Fx
    W(zero, Fb, 0, 1), // Fy
    W(zero, Fb, 0, 2), // Fz
    W(Fb, eomSubsystem, 0, ports.F_b),
    W(Mb, eomSubsystem, 0, ports.M_b),
    W(mdotCmd, eomSubsystem, 0, ports.mdot),
    W(eomSubsystem, outR, ports.r_i, 0),
    W(eomSubsystem, outV, ports.v_b, 0),
    W(eomSubsystem, outQ, ports.q, 0),
    W(eomSubsystem, outM, ports.mass, 0),
    W(eomSubsystem, outRmag, ports.r_mag, 0)
  ]

  return {
    name: 'saturn-6dof-vehicle-burn-demo',
    description:
      'Vehicle burn demo: EOM_6DoF_VarMass subsystem with axial thrust LUT + mdot after liftoff edge',
    sheets: [
      {
        id: 'main',
        name: 'Vehicle',
        blocks: parentBlocks,
        connections: parentWires,
        extents: { width: 1000, height: 600 }
      }
    ],
    parameters: core.parameters,
    globalSettings: {
      simulationTimeStep: 0.05,
      simulationDuration: 120,
      integrationAlgorithm: 'rk4'
    }
  }
}

/**
 * Phase 9.1 — Open-loop 6-DoF ascent (sprint integration model)
 *
 * Composes:
 *   - EOM_6DoF_VarMass (variable-mass quaternion dynamics)
 *   - Liftoff edge → burn timer → axial thrust LUT + mdot
 *   - Geometric altitude from |r| − R_earth
 *   - Atmosphere + dynamic pressure (plots only; no aero force yet)
 *   - Signal displays + loggers for demo without extra wiring
 *
 * Success criteria: import, run ~150 s, see r_mag grow, mass drop, altitude climb,
 * density/q̄ during atmosphere, attitude (q) evolve from IC body rate.
 */
export function buildSixDofOpenLoopAscent(): SliceModel {
  resetIds()
  const { eomSubsystem, core, ports } = buildEomSubsystemBlock(560, 260)

  // ── Propulsion schedule (open-loop S-IB–ish boost, order-of-magnitude) ──
  const liftoff = B('source', 'liftoff', 40, 60, {
    signalType: 'step',
    stepTime: 1.0,
    stepValue: 1.0,
    dataType: 'double'
  })
  const edge = B('edge_detect', 'liftoff_edge', 180, 60, {
    edge: 'rising',
    threshold: 0.5
  })
  const one = B('source', 'one', 40, 140, {
    signalType: 'constant',
    value: 1,
    dataType: 'double'
  })
  const tBurn = B('integrator', 't_burn', 180, 140, {
    showResetInput: true,
    initialValue: 0,
    showInitPort: false
  })
  // Longer axial thrust table (N) vs burn time (s) — simplified Saturn-IB stack
  const thrustMag = B('lookup_1d', 'ThrustMag_N', 340, 140, {
    inputValues: [0, 0.5, 2, 10, 50, 100, 130, 145, 150, 160],
    outputValues: [0, 5e5, 8.5e5, 8.9e5, 8.9e5, 8.9e5, 8.9e5, 6e5, 1e5, 0],
    extrapolation: 'clamp'
  })
  // ṁ ≈ T / (Isp * g0); Isp ~ 260 s → T/2550
  const mdotScale = B('source', 'mdot_scale', 340, 240, {
    signalType: 'constant',
    value: 1 / 2550,
    dataType: 'double'
  })
  const mdotCmd = B('matrix_multiply', 'mdot_cmd', 480, 200, {})
  const zero = B('source', 'zero', 340, 320, {
    signalType: 'constant',
    value: 0,
    dataType: 'double'
  })
  const Fb = B('mux', 'F_b_cmd', 480, 140, {
    rows: 1,
    cols: 3,
    baseType: 'double',
    outputType: 'double[3]',
    outputShape: 'vector'
  })
  // Open-loop: zero commanded body moment (attitude free-response from IC ω)
  const Mb = B('source', 'M_b_cmd', 480, 320, {
    signalType: 'constant',
    value: [0, 0, 0],
    dataType: 'double[3]'
  })

  // ── Atmosphere sampling (plots; not force-coupled in v1) ──
  const Re = B('source', 'R_earth', 560, 480, {
    signalType: 'constant',
    value: 6371000,
    dataType: 'double'
  })
  // h = |r| − R_e
  const alt = B('sum', 'altitude_m', 720, 440, {
    signs: '+-',
    numInputs: 2
  })
  const atm = B('atmosphere', 'Atm', 880, 440, {
    model: 'coesa1976',
    extrapolation: 'clamp'
  })
  const half = B('source', 'half', 720, 560, {
    signalType: 'constant',
    value: 0.5,
    dataType: 'double'
  })
  const Vmag = B('mag', 'V_mag', 720, 360, {})
  const Vsq = B('multiply', 'V_sq', 860, 360, { numInputs: 2 })
  const halfRho = B('multiply', 'half_rho', 1000, 420, { numInputs: 2 })
  const qbar = B('multiply', 'qbar', 1140, 400, { numInputs: 2 })

  // ── Ports + visualization sinks ──
  const outR = B('output_port', 'r_i', 900, 100, { portName: 'r_i' })
  const outV = B('output_port', 'v_b', 900, 160, { portName: 'v_b' })
  const outW = B('output_port', 'omega_b', 900, 220, { portName: 'omega_b' })
  const outQ = B('output_port', 'q', 900, 280, { portName: 'q' })
  const outM = B('output_port', 'mass', 900, 340, { portName: 'mass_kg' })
  const outRmag = B('output_port', 'r_mag', 900, 520, { portName: 'r_mag_m' })
  const outT = B('output_port', 'thrust', 720, 60, { portName: 'thrust_N' })
  const outAlt = B('output_port', 'h', 1140, 480, { portName: 'altitude_m' })
  const outRho = B('output_port', 'rho', 1140, 540, { portName: 'rho_kgpm3' })
  const outQbar = B('output_port', 'qbar_out', 1280, 400, { portName: 'qbar_Pa' })

  // Displays (real-time plots in app)
  const dispR = B('signal_display', 'disp_r_mag', 1100, 100, {
    title: 'Geocentric radius |r| (m)'
  })
  const dispM = B('signal_display', 'disp_mass', 1100, 180, {
    title: 'Mass (kg)'
  })
  const dispT = B('signal_display', 'disp_thrust', 1100, 260, {
    title: 'Thrust (N)'
  })
  const dispH = B('signal_display', 'disp_altitude', 1280, 100, {
    title: 'Altitude MSL (m)'
  })
  const dispQbar = B('signal_display', 'disp_qbar', 1280, 180, {
    title: 'Dynamic pressure q̄ (Pa)'
  })
  const dispV = B('signal_display', 'disp_V', 1280, 260, {
    title: 'Body speed |v_b| (m/s)'
  })

  // Loggers (CSV export)
  const logR = B('signal_logger', 'log_r_mag', 1100, 340, {})
  const logM = B('signal_logger', 'log_mass', 1100, 400, {})
  const logH = B('signal_logger', 'log_altitude', 1280, 340, {})
  const logQbar = B('signal_logger', 'log_qbar', 1280, 480, {})

  const parentBlocks = [
    liftoff,
    edge,
    one,
    tBurn,
    thrustMag,
    mdotScale,
    mdotCmd,
    zero,
    Fb,
    Mb,
    eomSubsystem,
    Re,
    alt,
    atm,
    half,
    Vmag,
    Vsq,
    halfRho,
    qbar,
    outR,
    outV,
    outW,
    outQ,
    outM,
    outRmag,
    outT,
    outAlt,
    outRho,
    outQbar,
    dispR,
    dispM,
    dispT,
    dispH,
    dispQbar,
    dispV,
    logR,
    logM,
    logH,
    logQbar
  ]

  const parentWires: SliceWire[] = [
    // Propulsion
    W(liftoff, edge),
    W(one, tBurn, 0, 0),
    W(edge, tBurn, 0, -2),
    W(tBurn, thrustMag),
    W(thrustMag, outT),
    W(thrustMag, mdotCmd, 0, 0),
    W(mdotScale, mdotCmd, 0, 1),
    W(thrustMag, Fb, 0, 0),
    W(zero, Fb, 0, 1),
    W(zero, Fb, 0, 2),
    W(Fb, eomSubsystem, 0, ports.F_b),
    W(Mb, eomSubsystem, 0, ports.M_b),
    W(mdotCmd, eomSubsystem, 0, ports.mdot),
    // EOM outs
    W(eomSubsystem, outR, ports.r_i, 0),
    W(eomSubsystem, outV, ports.v_b, 0),
    W(eomSubsystem, outW, ports.omega_b, 0),
    W(eomSubsystem, outQ, ports.q, 0),
    W(eomSubsystem, outM, ports.mass, 0),
    W(eomSubsystem, outRmag, ports.r_mag, 0),
    // Atmosphere path: h = |r| − Re, V = |v_b|
    W(eomSubsystem, alt, ports.r_mag, 0),
    W(Re, alt, 0, 1),
    W(alt, atm),
    W(eomSubsystem, Vmag, ports.v_b, 0),
    W(Vmag, Vsq, 0, 0),
    W(Vmag, Vsq, 0, 1),
    W(half, halfRho, 0, 0),
    W(atm, halfRho, 3, 1), // density
    W(halfRho, qbar, 0, 0),
    W(Vsq, qbar, 0, 1),
    W(alt, outAlt),
    W(atm, outRho, 3, 0),
    W(qbar, outQbar),
    // Displays
    W(eomSubsystem, dispR, ports.r_mag, 0),
    W(eomSubsystem, dispM, ports.mass, 0),
    W(thrustMag, dispT),
    W(alt, dispH),
    W(qbar, dispQbar),
    W(Vmag, dispV),
    // Loggers
    W(eomSubsystem, logR, ports.r_mag, 0),
    W(eomSubsystem, logM, ports.mass, 0),
    W(alt, logH),
    W(qbar, logQbar)
  ]

  return {
    name: 'saturn-9.1-open-loop-6dof-ascent',
    description:
      'Open-loop 6-DoF ascent: EOM + liftoff/thrust/mdot + altitude/atmosphere/q̄ plots (no aero force). Sprint integration model.',
    sheets: [
      {
        id: 'main',
        name: 'OpenLoopAscent',
        blocks: parentBlocks,
        connections: parentWires,
        extents: { width: 1500, height: 700 }
      }
    ],
    parameters: [
      ...(core.parameters || []),
      {
        name: 'R_earth_m',
        dataType: 'double',
        defaultValue: '6371000.0',
        signalType: 'double',
        value: 6371000
      },
      {
        name: 'Isp_s',
        dataType: 'double',
        defaultValue: '260',
        signalType: 'double',
        value: 260
      }
    ],
    globalSettings: {
      // Fixed-step RK4: 0.05 s is a balance of rate-limit fidelity and run time
      simulationTimeStep: 0.05,
      // Cover boost (~150 s table) + short coast for plots
      simulationDuration: 180,
      integrationAlgorithm: 'rk4'
    }
  }
}

/**
 * Phase 9.2 — Closed-loop pitch-rate damping (simple FCC-style loop)
 *
 * Composes:
 *   - EOM_6DoF_VarMass with open-loop axial thrust (short boost)
 *   - Body rate feedback: demux ω → Q (pitch)
 *   - Error = Q_cmd − Q (default Q_cmd = 0 → rate damp)
 *   - transfer_function + limit → My (body pitch moment)
 *   - M_b = [0, My, 0]
 *
 * EOM IC includes a small pitch rate (ω_y ≈ 0.01 rad/s) so damping is visible.
 * Success: My opposes pitch rate; |Q| decays after boost; mass/thrust still move.
 */
export function buildSixDofClosedLoopPitchRateDamp(): SliceModel {
  resetIds()
  const { eomSubsystem, core, ports } = buildEomSubsystemBlock(720, 280)

  // ── Short open-loop boost (so attitude loop is visible, not only coast) ──
  const liftoff = B('source', 'liftoff', 40, 40, {
    signalType: 'step',
    stepTime: 0.5,
    stepValue: 1.0,
    dataType: 'double'
  })
  const edge = B('edge_detect', 'liftoff_edge', 180, 40, {
    edge: 'rising',
    threshold: 0.5
  })
  const one = B('source', 'one', 40, 120, {
    signalType: 'constant',
    value: 1,
    dataType: 'double'
  })
  const tBurn = B('integrator', 't_burn', 180, 120, {
    showResetInput: true,
    initialValue: 0,
    showInitPort: false
  })
  const thrustMag = B('lookup_1d', 'ThrustMag_N', 340, 120, {
    inputValues: [0, 0.5, 2, 10, 20, 30, 40],
    outputValues: [0, 5e5, 8e5, 8.5e5, 8e5, 2e5, 0],
    extrapolation: 'clamp'
  })
  const mdotScale = B('source', 'mdot_scale', 340, 200, {
    signalType: 'constant',
    value: 1 / 2550,
    dataType: 'double'
  })
  const mdotCmd = B('matrix_multiply', 'mdot_cmd', 480, 180, {})
  const zero = B('source', 'zero', 340, 280, {
    signalType: 'constant',
    value: 0,
    dataType: 'double'
  })
  const Fb = B('mux', 'F_b_cmd', 480, 120, {
    rows: 1,
    cols: 3,
    baseType: 'double',
    outputType: 'double[3]',
    outputShape: 'vector'
  })

  // ── Pitch-rate loop (FCC skeleton → body moment) ──
  // demux ω_b = [P, Q, R]
  const demuxW = B('demux', 'demux_omega', 900, 200, {
    outputCount: 3,
    inputDimensions: [3]
  })
  // Commanded pitch rate (rad/s): 0 = damp to zero
  const Qcmd = B('source', 'Q_cmd', 900, 80, {
    signalType: 'constant',
    value: 0,
    dataType: 'double'
  })
  // err = Q_cmd − Q
  const Qerr = B('sum', 'Q_err', 1040, 140, {
    signs: '+-',
    numInputs: 2
  })
  // S-IB-ish first-order filter (from 8.6 FCC slice)
  const Qfilt = B('transfer_function', 'Q_filter', 1180, 140, {
    numerator: [1],
    denominator: [0.1556, 1]
  })
  // Gain: error (rad/s) → moment command scale (N·m)
  // Name must not match a model parameter #define (e.g. K_q) — that breaks C codegen.
  const Kq = B('source', 'Kq_gain', 1180, 60, {
    signalType: 'constant',
    value: 5e6,
    dataType: 'double'
  })
  const MyRaw = B('matrix_multiply', 'My_raw', 1320, 140, {})
  // Actuator/command limit (N·m)
  const MyLim = B('limit', 'My_limit', 1460, 140, {
    lowerLimit: -2e7,
    upperLimit: 2e7
  })
  // M_b = [0, My, 0]
  const Mb = B('mux', 'M_b_cmd', 1600, 200, {
    rows: 1,
    cols: 3,
    baseType: 'double',
    outputType: 'double[3]',
    outputShape: 'vector'
  })

  // ── Ports + visualization ──
  const outR = B('output_port', 'r_i', 900, 360, { portName: 'r_i' })
  const outV = B('output_port', 'v_b', 900, 420, { portName: 'v_b' })
  const outW = B('output_port', 'omega_b', 900, 480, { portName: 'omega_b' })
  const outQ = B('output_port', 'q', 900, 540, { portName: 'q' })
  const outM = B('output_port', 'mass', 900, 600, { portName: 'mass_kg' })
  const outRmag = B('output_port', 'r_mag', 900, 660, { portName: 'r_mag_m' })
  const outThrust = B('output_port', 'thrust', 720, 40, { portName: 'thrust_N' })
  const outMy = B('output_port', 'My', 1600, 80, { portName: 'My_Nm' })
  const outQrate = B('output_port', 'Q_rps', 1040, 40, { portName: 'Q_rps' })

  const dispQ = B('signal_display', 'disp_Q', 1200, 360, {
    title: 'Pitch rate Q (rad/s)'
  })
  const dispMy = B('signal_display', 'disp_My', 1200, 440, {
    title: 'Pitch moment My (N·m)'
  })
  const dispThrust = B('signal_display', 'disp_thrust', 1200, 520, {
    title: 'Thrust (N)'
  })
  const dispRmag = B('signal_display', 'disp_r_mag', 1200, 600, {
    title: 'Geocentric radius |r| (m)'
  })
  const logQ = B('signal_logger', 'log_Q', 1400, 360, {})
  const logMy = B('signal_logger', 'log_My', 1400, 440, {})

  const parentBlocks = [
    liftoff,
    edge,
    one,
    tBurn,
    thrustMag,
    mdotScale,
    mdotCmd,
    zero,
    Fb,
    demuxW,
    Qcmd,
    Qerr,
    Qfilt,
    Kq,
    MyRaw,
    MyLim,
    Mb,
    eomSubsystem,
    outR,
    outV,
    outW,
    outQ,
    outM,
    outRmag,
    outThrust,
    outMy,
    outQrate,
    dispQ,
    dispMy,
    dispThrust,
    dispRmag,
    logQ,
    logMy
  ]

  const parentWires: SliceWire[] = [
    // Propulsion
    W(liftoff, edge),
    W(one, tBurn, 0, 0),
    W(edge, tBurn, 0, -2),
    W(tBurn, thrustMag),
    W(thrustMag, outThrust),
    W(thrustMag, mdotCmd, 0, 0),
    W(mdotScale, mdotCmd, 0, 1),
    W(thrustMag, Fb, 0, 0),
    W(zero, Fb, 0, 1),
    W(zero, Fb, 0, 2),
    W(Fb, eomSubsystem, 0, ports.F_b),
    W(mdotCmd, eomSubsystem, 0, ports.mdot),
    // Rate loop: ω → demux → Q
    W(eomSubsystem, demuxW, ports.omega_b, 0),
    W(Qcmd, Qerr, 0, 0),
    W(demuxW, Qerr, 1, 1), // Q = pitch = port 1
    W(Qerr, Qfilt),
    W(Qfilt, MyRaw, 0, 0),
    W(Kq, MyRaw, 0, 1),
    W(MyRaw, MyLim),
    // M_b = [0, My, 0]
    W(zero, Mb, 0, 0),
    W(MyLim, Mb, 0, 1),
    W(zero, Mb, 0, 2),
    W(Mb, eomSubsystem, 0, ports.M_b),
    // EOM outs
    W(eomSubsystem, outR, ports.r_i, 0),
    W(eomSubsystem, outV, ports.v_b, 0),
    W(eomSubsystem, outW, ports.omega_b, 0),
    W(eomSubsystem, outQ, ports.q, 0),
    W(eomSubsystem, outM, ports.mass, 0),
    W(eomSubsystem, outRmag, ports.r_mag, 0),
    W(MyLim, outMy),
    W(demuxW, outQrate, 1, 0),
    // Displays / logs
    W(demuxW, dispQ, 1, 0),
    W(MyLim, dispMy),
    W(thrustMag, dispThrust),
    W(eomSubsystem, dispRmag, ports.r_mag, 0),
    W(demuxW, logQ, 1, 0),
    W(MyLim, logMy)
  ]

  return {
    name: 'saturn-9.2-closed-loop-pitch-rate-damp',
    description:
      'Closed-loop pitch-rate damp: EOM + short boost + Q feedback through TF/limit → My (FCC-style). Sprint 9.2.',
    sheets: [
      {
        id: 'main',
        name: 'ClosedLoopRate',
        blocks: parentBlocks,
        connections: parentWires,
        extents: { width: 1800, height: 750 }
      }
    ],
    parameters: [
      ...(core.parameters || []),
      {
        // Prefixed so it cannot collide with a signal named K_q / Kq_gain
        name: 'pitch_rate_gain',
        dataType: 'double',
        defaultValue: '5e6',
        signalType: 'double',
        value: 5e6
      }
    ],
    globalSettings: {
      simulationTimeStep: 0.02,
      simulationDuration: 60,
      integrationAlgorithm: 'rk4'
    }
  }
}

/**
 * Phase 9.3 — Open-loop 6-DoF ascent with simple aero drag into EOM
 *
 * Extends the 9.1 plant by coupling atmosphere/q̄ into body force:
 *   D = q̄ · Cd · A_ref
 *   F_aero = −D · v̂_b   (v̂_b = v_b / max(|v_b|, ε))
 *   F_b = F_thrust + F_aero
 *
 * Cd·A_ref defaults are order-of-magnitude Saturn-IB (A≈34 m², Cd≈0.5 → 17 m²).
 * Not a full aero table (no CN, Cm, α-dependent moments) — plant check only.
 *
 * Validation: qualitative h(t)/mass vs TN-AP-67-158 Table 5
 * (docs/sample-models/saturn/as205-reference/as205_trajectory_reference.csv).
 * Simulink may disagree with the TN; prefer TN when debugging residuals.
 */
export function buildSixDofOpenLoopAscentWithAero(): SliceModel {
  resetIds()
  const { eomSubsystem, core, ports } = buildEomSubsystemBlock(720, 280)

  // ── Propulsion schedule (same shape as 9.1) ──
  const liftoff = B('source', 'liftoff', 40, 40, {
    signalType: 'step',
    stepTime: 1.0,
    stepValue: 1.0,
    dataType: 'double'
  })
  const edge = B('edge_detect', 'liftoff_edge', 180, 40, {
    edge: 'rising',
    threshold: 0.5
  })
  const one = B('source', 'one', 40, 120, {
    signalType: 'constant',
    value: 1,
    dataType: 'double'
  })
  const tBurn = B('integrator', 't_burn', 180, 120, {
    showResetInput: true,
    initialValue: 0,
    showInitPort: false
  })
  const thrustMag = B('lookup_1d', 'ThrustMag_N', 340, 120, {
    inputValues: [0, 0.5, 2, 10, 50, 100, 130, 145, 150, 160],
    outputValues: [0, 5e5, 8.5e5, 8.9e5, 8.9e5, 8.9e5, 8.9e5, 6e5, 1e5, 0],
    extrapolation: 'clamp'
  })
  const mdotScale = B('source', 'mdot_scale', 340, 220, {
    signalType: 'constant',
    value: 1 / 2550,
    dataType: 'double'
  })
  const mdotCmd = B('matrix_multiply', 'mdot_cmd', 480, 180, {})
  const zero = B('source', 'zero', 340, 300, {
    signalType: 'constant',
    value: 0,
    dataType: 'double'
  })
  // Axial thrust vector [T, 0, 0]
  const Fthrust = B('mux', 'F_thrust', 480, 120, {
    rows: 1,
    cols: 3,
    baseType: 'double',
    outputType: 'double[3]',
    outputShape: 'vector'
  })
  const Mb = B('source', 'M_b_cmd', 480, 320, {
    signalType: 'constant',
    value: [0, 0, 0],
    dataType: 'double[3]'
  })

  // ── Atmosphere + q̄ ──
  const Re = B('source', 'R_earth', 720, 520, {
    signalType: 'constant',
    value: 6371000,
    dataType: 'double'
  })
  const alt = B('sum', 'altitude_m', 880, 480, {
    signs: '+-',
    numInputs: 2
  })
  const atm = B('atmosphere', 'Atm', 1040, 480, {
    model: 'coesa1976',
    extrapolation: 'clamp'
  })
  const half = B('source', 'half', 880, 600, {
    signalType: 'constant',
    value: 0.5,
    dataType: 'double'
  })
  const Vmag = B('mag', 'V_mag', 880, 380, {})
  const Vsq = B('multiply', 'V_sq', 1020, 380, { numInputs: 2 })
  const halfRho = B('multiply', 'half_rho', 1160, 440, { numInputs: 2 })
  const qbar = B('multiply', 'qbar', 1300, 400, { numInputs: 2 })

  // ── Aero drag: F_aero = −(q̄·CdA) · v̂_b ──
  // CdA ≈ Cd * π*(D/2)²; D≈6.6 m, Cd≈0.5 → ~17 m²
  const CdA = B('source', 'CdA_m2', 880, 300, {
    signalType: 'constant',
    value: 17.0,
    dataType: 'double'
  })
  const Dmag = B('multiply', 'D_mag', 1160, 340, { numInputs: 2 })
  // |v| floor to avoid /0 on the pad
  const Vsafe = B('evaluate', 'V_safe', 1020, 300, {
    numInputs: 1,
    expression: 'in(0) > 1e-3 ? in(0) : 1e-3'
  })
  const demuxV = B('demux', 'demux_vb', 880, 220, {
    outputCount: 3,
    inputDimensions: [3]
  })
  const vh0 = B('divide', 'vhat_x', 1020, 180, {})
  const vh1 = B('divide', 'vhat_y', 1020, 220, {})
  const vh2 = B('divide', 'vhat_z', 1020, 260, {})
  const vhat = B('mux', 'v_hat', 1160, 220, {
    rows: 1,
    cols: 3,
    baseType: 'double',
    outputType: 'double[3]',
    outputShape: 'vector'
  })
  // D_vec = Dmag * vhat, then F_aero = −D_vec
  const Dvec = B('matrix_multiply', 'D_vec', 1300, 280, {})
  const Faero = B('uminus', 'F_aero', 1440, 280, {})
  // F_b = F_thrust + F_aero
  const Fb = B('sum', 'F_b_cmd', 1580, 180, {
    signs: '++',
    numInputs: 2
  })

  // ── Ports + visualization ──
  const outR = B('output_port', 'r_i', 1100, 40, { portName: 'r_i' })
  const outV = B('output_port', 'v_b', 1100, 100, { portName: 'v_b' })
  const outW = B('output_port', 'omega_b', 1100, 160, { portName: 'omega_b' })
  const outQ = B('output_port', 'q', 1260, 40, { portName: 'q' })
  const outM = B('output_port', 'mass', 1260, 100, { portName: 'mass_kg' })
  const outRmag = B('output_port', 'r_mag', 1260, 160, { portName: 'r_mag_m' })
  const outT = B('output_port', 'thrust', 640, 40, { portName: 'thrust_N' })
  const outAlt = B('output_port', 'h', 1440, 480, { portName: 'altitude_m' })
  const outRho = B('output_port', 'rho', 1440, 540, { portName: 'rho_kgpm3' })
  const outQbar = B('output_port', 'qbar_out', 1440, 400, { portName: 'qbar_Pa' })
  const outDrag = B('output_port', 'drag', 1580, 340, { portName: 'drag_N' })

  const dispR = B('signal_display', 'disp_r_mag', 1700, 40, {
    title: 'Geocentric radius |r| (m)'
  })
  const dispM = B('signal_display', 'disp_mass', 1700, 120, {
    title: 'Mass (kg)'
  })
  const dispH = B('signal_display', 'disp_altitude', 1700, 200, {
    title: 'Altitude MSL (m)'
  })
  const dispQbar = B('signal_display', 'disp_qbar', 1700, 280, {
    title: 'Dynamic pressure q̄ (Pa)'
  })
  const dispV = B('signal_display', 'disp_V', 1700, 360, {
    title: 'Body speed |v_b| (m/s)'
  })
  const dispD = B('signal_display', 'disp_drag', 1700, 440, {
    title: 'Drag magnitude (N)'
  })

  const logH = B('signal_logger', 'log_altitude', 1860, 120, {})
  const logM = B('signal_logger', 'log_mass', 1860, 200, {})
  const logQbar = B('signal_logger', 'log_qbar', 1860, 280, {})
  const logV = B('signal_logger', 'log_V', 1860, 360, {})

  const parentBlocks = [
    liftoff,
    edge,
    one,
    tBurn,
    thrustMag,
    mdotScale,
    mdotCmd,
    zero,
    Fthrust,
    Mb,
    eomSubsystem,
    Re,
    alt,
    atm,
    half,
    Vmag,
    Vsq,
    halfRho,
    qbar,
    CdA,
    Dmag,
    Vsafe,
    demuxV,
    vh0,
    vh1,
    vh2,
    vhat,
    Dvec,
    Faero,
    Fb,
    outR,
    outV,
    outW,
    outQ,
    outM,
    outRmag,
    outT,
    outAlt,
    outRho,
    outQbar,
    outDrag,
    dispR,
    dispM,
    dispH,
    dispQbar,
    dispV,
    dispD,
    logH,
    logM,
    logQbar,
    logV
  ]

  const parentWires: SliceWire[] = [
    // Propulsion
    W(liftoff, edge),
    W(one, tBurn, 0, 0),
    W(edge, tBurn, 0, -2),
    W(tBurn, thrustMag),
    W(thrustMag, outT),
    W(thrustMag, mdotCmd, 0, 0),
    W(mdotScale, mdotCmd, 0, 1),
    W(thrustMag, Fthrust, 0, 0),
    W(zero, Fthrust, 0, 1),
    W(zero, Fthrust, 0, 2),
    // Atmosphere path
    W(eomSubsystem, alt, ports.r_mag, 0),
    W(Re, alt, 0, 1),
    W(alt, atm),
    W(eomSubsystem, Vmag, ports.v_b, 0),
    W(Vmag, Vsq, 0, 0),
    W(Vmag, Vsq, 0, 1),
    W(half, halfRho, 0, 0),
    W(atm, halfRho, 3, 1),
    W(halfRho, qbar, 0, 0),
    W(Vsq, qbar, 0, 1),
    // Aero unit velocity
    W(eomSubsystem, demuxV, ports.v_b, 0),
    W(Vmag, Vsafe),
    W(demuxV, vh0, 0, 0),
    W(Vsafe, vh0, 0, 1),
    W(demuxV, vh1, 1, 0),
    W(Vsafe, vh1, 0, 1),
    W(demuxV, vh2, 2, 0),
    W(Vsafe, vh2, 0, 1),
    W(vh0, vhat, 0, 0),
    W(vh1, vhat, 0, 1),
    W(vh2, vhat, 0, 2),
    // Drag force
    W(qbar, Dmag, 0, 0),
    W(CdA, Dmag, 0, 1),
    W(Dmag, Dvec, 0, 0),
    W(vhat, Dvec, 0, 1),
    W(Dvec, Faero),
    W(Fthrust, Fb, 0, 0),
    W(Faero, Fb, 0, 1),
    // EOM inputs
    W(Fb, eomSubsystem, 0, ports.F_b),
    W(Mb, eomSubsystem, 0, ports.M_b),
    W(mdotCmd, eomSubsystem, 0, ports.mdot),
    // EOM outs
    W(eomSubsystem, outR, ports.r_i, 0),
    W(eomSubsystem, outV, ports.v_b, 0),
    W(eomSubsystem, outW, ports.omega_b, 0),
    W(eomSubsystem, outQ, ports.q, 0),
    W(eomSubsystem, outM, ports.mass, 0),
    W(eomSubsystem, outRmag, ports.r_mag, 0),
    W(alt, outAlt),
    W(atm, outRho, 3, 0),
    W(qbar, outQbar),
    W(Dmag, outDrag),
    // Displays
    W(eomSubsystem, dispR, ports.r_mag, 0),
    W(eomSubsystem, dispM, ports.mass, 0),
    W(alt, dispH),
    W(qbar, dispQbar),
    W(Vmag, dispV),
    W(Dmag, dispD),
    // Loggers (TN compare channels)
    W(alt, logH),
    W(eomSubsystem, logM, ports.mass, 0),
    W(qbar, logQbar),
    W(Vmag, logV)
  ]

  return {
    name: 'saturn-9.3-open-loop-6dof-ascent-aero',
    description:
      'Open-loop 6-DoF ascent with simple aero drag (F_aero = −q̄·CdA·v̂_b) into EOM. Compare h/mass/q̄ to TN-AP-67-158 (not Simulink).',
    sheets: [
      {
        id: 'main',
        name: 'OpenLoopAscentAero',
        blocks: parentBlocks,
        connections: parentWires,
        extents: { width: 2000, height: 720 }
      }
    ],
    parameters: [
      ...(core.parameters || []),
      {
        name: 'R_earth_m',
        dataType: 'double',
        defaultValue: '6371000.0',
        signalType: 'double',
        value: 6371000
      },
      {
        name: 'CdA_m2',
        dataType: 'double',
        defaultValue: '17.0',
        signalType: 'double',
        value: 17.0
      },
      {
        name: 'Isp_s',
        dataType: 'double',
        defaultValue: '260',
        signalType: 'double',
        value: 260
      }
    ],
    globalSettings: {
      simulationTimeStep: 0.05,
      simulationDuration: 180,
      integrationAlgorithm: 'rk4'
    }
  }
}

/**
 * Phase 9.4 — Open-loop χ time-tilt on 6-DoF plant (with aero)
 *
 * Composes:
 *   - 9.3 plant: axial thrust + mdot + F_aero = −q̄·CdA·v̂ into EOM
 *   - 8.8-style χ(t) pitch program: lookup_1d + rate_limiter (deg)
 *   - Q_cmd ≈ d(χ_rad)/dt via unit_delay discrete derivative
 *   - Pitch-rate loop (9.2-style): Q_cmd − Q → TF → gain → My limit
 *   - M_b = [0, My, 0]
 *
 * Propulsion is order-of-magnitude TN Table 5 (S-IB ~7 MN class, m0 ≈ 586593 kg),
 * not the old 0.9 MN demo table. χ table is still a simplified time-tilt (not full
 * Table 2B polynomials). Prefer TN for trajectory residuals; Simulink may disagree.
 *
 * Loggers/displays use maxSamples ≥ duration/dt so CSV export covers the full run
 * (default 1000 samples only kept the last ~50 s at dt=0.05).
 *
 * Success: χ_cmd tilts over; |Q| tracks Q_cmd; h climbs (positive MSL); mass drops
 * toward staging-class values; q̄ peaks mid-boost. Residual vs Table 5 still qualitative.
 */
export function buildSixDofOpenLoopChiAscent(): SliceModel {
  resetIds()
  // TN Table 5 first-motion mass (~586593 kg); m_ref tracks m0 for I ∝ m/m_ref
  const m0Tn = 586593
  // ECI pad: Initial Position S → MESᵀ → r_E; B‖S ⇒ v_b0=V_S, q0=dcm(MESᵀ)
  // See as205EciPlant.ts / as205Mes.ts (Apollo 7 LaunchDate for Θ_E).
  const padE = as205DefaultPadStateEci()
  const { eomSubsystem, core, ports } = buildEomSubsystemBlock(720, 300, {
    m0_kg: m0Tn,
    m_ref_kg: m0Tn,
    r0_i: padE.r0_E,
    v0_b: padE.v0_b,
    omega0: [0, 0, 0],
    q0: padE.q0_bE
  })
  const dt = 0.05
  const duration = 180
  // Full-run circular buffer: ceil(duration/dt)+margin (default 1000 → only last 50 s)
  const collectorMaxSamples = Math.ceil(duration / dt) + 200 // 3800

  // ── Propulsion — Table 5 thrust for F_b; mdot from Table 5 mass history ──
  // Independent LUTs isolate force direction (altitude) vs mass residual.
  // See as205ThrustTable.ts (prefer TN over Simulink).
  const mdotTn = table5MdotFromMass()
  const liftoff = B('source', 'liftoff', 40, 40, {
    signalType: 'step',
    stepTime: 1.0,
    stepValue: 1.0,
    dataType: 'double'
  })
  const edge = B('edge_detect', 'liftoff_edge', 180, 40, {
    edge: 'rising',
    threshold: 0.5
  })
  const one = B('source', 'one', 40, 120, {
    signalType: 'constant',
    value: 1,
    dataType: 'double'
  })
  const tBurn = B('integrator', 't_burn', 180, 120, {
    showResetInput: true,
    initialValue: 0,
    showInitPort: false
  })
  const thrustMag = B('lookup_1d', 'ThrustMag_N', 340, 120, {
    inputValues: table5ThrustTimeBreakpoints(),
    outputValues: table5ThrustN(),
    extrapolation: 'clamp'
  })
  // Propellant mdot(t) from finite differences of Table 5 mass (kg/s ≥ 0)
  const mdotCmd = B('lookup_1d', 'mdot_kgps', 480, 200, {
    inputValues: mdotTn.t_s,
    outputValues: mdotTn.mdot_kgps,
    extrapolation: 'clamp'
  })
  const zero = B('source', 'zero', 340, 300, {
    signalType: 'constant',
    value: 0,
    dataType: 'double'
  })
  // ── H-1 engine cluster + TVC (replaces free My / axial-only F) ──
  // F_eng, M_eng from T and gimbal β_P, β_Y (see as205Engines.ts)
  // Outer half thrust gimballed, inner half fixed +X; M about CG(mass).
  const CGx = B('lookup_1d', 'CG_x_m', 480, 60, {
    inputValues: SIB_CG_MASS_BREAKPOINTS_KG,
    outputValues: SIB_CG_X_M,
    extrapolation: 'clamp'
  })
  // β_P, β_Y (deg) — from control; default 0 until wired
  const betaP = B('source', 'beta_P_deg', 480, 100, {
    signalType: 'constant',
    value: 0,
    dataType: 'double'
  })
  const betaY = B('source', 'beta_Y_deg', 480, 140, {
    signalType: 'constant',
    value: 0,
    dataType: 'double'
  })
  // Clamp gimbals ±H1_GIMBAL_LIMIT_DEG
  const betaPLim = B('limit', 'beta_P_lim', 620, 100, {
    lowerLimit: -H1_GIMBAL_LIMIT_DEG,
    upperLimit: H1_GIMBAL_LIMIT_DEG
  })
  const betaYLim = B('limit', 'beta_Y_lim', 620, 140, {
    lowerLimit: -H1_GIMBAL_LIMIT_DEG,
    upperLimit: H1_GIMBAL_LIMIT_DEG
  })
  // Equivalent cluster (as205Engines): Th=T/2 outer gimballed + T/2 inner fixed +X
  // Fx=Th*(cos bp cos by + 1); Fy=Th*sin by; Fz=Th*sin bp cos by
  // My=Th*CGx*sin bp cos by; Mz=-Th*CGx*sin by
  const Th = B('evaluate', 'T_half', 620, 60, {
    numInputs: 1,
    expression: '0.5*in(0)'
  })
  const bpR = B('evaluate', 'beta_P_rad', 780, 100, {
    numInputs: 1,
    expression: 'in(0)*3.141592653589793/180.0'
  })
  const byR = B('evaluate', 'beta_Y_rad', 780, 140, {
    numInputs: 1,
    expression: 'in(0)*3.141592653589793/180.0'
  })
  const Fx_eng = B('evaluate', 'Fx_eng', 940, 60, {
    numInputs: 3,
    expression: 'in(0)*(cos(in(1))*cos(in(2))+1.0)'
  })
  const Fy_eng = B('evaluate', 'Fy_eng', 940, 100, {
    numInputs: 2,
    expression: 'in(0)*sin(in(1))'
  })
  const Fz_eng = B('evaluate', 'Fz_eng', 940, 140, {
    numInputs: 3,
    expression: 'in(0)*sin(in(1))*cos(in(2))'
  })
  const FengVec = B('mux', 'F_engines_N', 1100, 80, {
    rows: 1,
    cols: 3,
    baseType: 'double',
    outputType: 'double[3]',
    outputShape: 'vector'
  })
  const Mx_eng = B('source', 'Mx_eng', 940, 180, {
    signalType: 'constant',
    value: 0,
    dataType: 'double'
  })
  const My_eng = B('evaluate', 'My_eng', 940, 220, {
    numInputs: 4,
    expression: 'in(0)*in(1)*sin(in(2))*cos(in(3))'
  })
  const Mz_eng = B('evaluate', 'Mz_eng', 940, 260, {
    numInputs: 3,
    expression: '-in(0)*in(1)*sin(in(2))'
  })
  const MengVec = B('mux', 'M_engines_Nm', 1100, 200, {
    rows: 1,
    cols: 3,
    baseType: 'double',
    outputType: 'double[3]',
    outputShape: 'vector'
  })

  // ── Atmosphere + q̄ + aero ──
  // Geometric altitude ≈ |r_E| − R_L (AS-205 pad radius; |R_S|=|R_E|=R_L at pad)
  const Re = B('source', 'R_earth', 720, 560, {
    signalType: 'constant',
    value: AS205_PAD.R_L_m,
    dataType: 'double'
  })
  const alt = B('sum', 'altitude_m', 880, 520, {
    signs: '+-',
    numInputs: 2
  })
  const atm = B('atmosphere', 'Atm', 1040, 520, {
    model: 'coesa1976',
    extrapolation: 'clamp'
  })
  const half = B('source', 'half', 880, 640, {
    signalType: 'constant',
    value: 0.5,
    dataType: 'double'
  })

  // ── S-frame export via constant [MES] (frozen at GRR / Apollo 7 epoch) ──
  // r_S = MES · r_E
  // v_E = C_bE · v_b ,  v_S = MES · v_E
  const MES = B('source', 'MES_E_to_S', 720, 40, {
    signalType: 'constant',
    value: mat3ToSourceValue(padE.MES),
    dataType: 'double[3][3]'
  })
  const r_S = B('matrix_multiply', 'r_S', 900, 40, {})
  const demux_rS = B('demux', 'demux_r_S', 1040, 20, {
    outputCount: 3,
    inputDimensions: [3]
  })
  const C_bE_live = B('orientation_conversion', 'C_bE_live', 1480, 40, {
    conversionType: 'quat_to_dcm'
  })
  const v_E_vec = B('matrix_multiply', 'v_E', 1620, 40, {})
  const v_S = B('matrix_multiply', 'v_S', 1760, 40, {})
  const V_S_mag = B('mag', 'V_S_mag', 1900, 40, {})
  const demux_vS = B('demux', 'demux_v_S', 1900, 100, {
    outputCount: 3,
    inputDimensions: [3]
  })

  // ── Air-relative velocity for aero (critical) ──
  // At pad, inertial v_b ≈ Earth-rate (~409 m/s horizontal) with X_b vertical
  // ⇒ α≈90° if aero used inertial v_b — multi-MN side force / blow-up.
  // Atmosphere co-rotates: v_air_E = v_E − ω_E × r_E ; α,β,q̄,Mach from v_air_b.
  const omegaE = B('source', 'omega_E_eci', 720, 360, {
    signalType: 'constant',
    value: [0, 0, OMEGA_EARTH],
    dataType: 'double[3]'
  })
  const v_rot_E = B('cross', 'v_earth_rot', 900, 360, {})
  const v_air_E = B('sum', 'v_air_E', 1040, 360, {
    signs: '+-',
    numInputs: 2
  })
  const C_ib = B('transpose', 'C_ib_aero', 1480, 100, {})
  const v_air_b = B('matrix_multiply', 'v_air_b', 1620, 100, {})
  const Vair_mag = B('mag', 'V_air_mag', 880, 420, {})
  const Vsq = B('multiply', 'V_air_sq', 1020, 420, { numInputs: 2 })
  const halfRho = B('multiply', 'half_rho', 1160, 480, { numInputs: 2 })
  const qbar = B('multiply', 'qbar', 1300, 440, { numInputs: 2 })

  // ── Simulink-style aero (CA_T, CN, CP → F_aero, M_aero) — match RTW <S110> ──
  const Sref = B('source', 'S_ref_m2', 720, 640, {
    signalType: 'constant',
    value: AERO_S_REF_M2,
    dataType: 'double'
  })
  const CGy = B('lookup_1d', 'CG_y_m', 720, 700, {
    inputValues: SIB_CG_MASS_BREAKPOINTS_KG,
    outputValues: SIB_CG_Y_M,
    extrapolation: 'clamp'
  })
  const CGz = B('lookup_1d', 'CG_z_m', 720, 760, {
    inputValues: SIB_CG_MASS_BREAKPOINTS_KG,
    outputValues: SIB_CG_Z_M,
    extrapolation: 'clamp'
  })
  const CG = B('mux', 'CG_m', 880, 700, {
    rows: 1,
    cols: 3,
    baseType: 'double',
    outputType: 'double[3]',
    outputShape: 'vector'
  })
  const demuxV = B('demux', 'demux_v_air_b', 880, 260, {
    outputCount: 3,
    inputDimensions: [3]
  })
  const Vsafe = B('evaluate', 'V_air_safe', 1020, 340, {
    numInputs: 1,
    expression: 'in(0) > 1e-3 ? in(0) : 1e-3'
  })
  // α = atan2(w,u), β = asin(v/V) on **air-relative** body velocity
  const alpha = B('evaluate', 'alpha_rad', 1020, 220, {
    numInputs: 2,
    expression: 'atan2(in(1), in(0) == 0.0 && in(1) == 0.0 ? 1e-9 : in(0))'
  })
  const beta = B('evaluate', 'beta_rad', 1020, 280, {
    numInputs: 2,
    expression:
      'asin(in(0)/in(1) > 1.0 ? 1.0 : (in(0)/in(1) < -1.0 ? -1.0 : in(0)/in(1)))'
  })
  // mdl: Angle Conversion (signed deg) → CN Lookup2D → Unary Minus (not |α|·sign)
  const alphaDeg = B('evaluate', 'alpha_deg', 1180, 220, {
    numInputs: 1,
    expression: 'in(0)*180.0/3.141592653589793'
  })
  const betaDeg = B('evaluate', 'beta_deg', 1180, 280, {
    numInputs: 1,
    expression: 'in(0)*180.0/3.141592653589793'
  })
  // Mach = V / a_sound (atmosphere port 3)
  const Mach = B('divide', 'Mach', 1040, 600, {})
  const CA = B('lookup_1d', 'CA_T', 1180, 600, {
    inputValues: CA_MACH_BREAKPOINTS,
    outputValues: CA_VALUES,
    extrapolation: 'clamp'
  })
  const CNa = B('lookup_2d', 'CN_alpha', 1340, 200, {
    input1Values: CN_MACH_BREAKPOINTS,
    input2Values: CN_ANGLE_DEG_BREAKPOINTS,
    outputTable: CN_TABLE,
    extrapolation: 'clamp'
  })
  const CNb = B('lookup_2d', 'CN_beta', 1340, 280, {
    input1Values: CN_MACH_BREAKPOINTS,
    input2Values: CN_ANGLE_DEG_BREAKPOINTS,
    outputTable: CN_TABLE,
    extrapolation: 'clamp'
  })
  const CP = B('lookup_1d', 'CP_m', 1180, 680, {
    inputValues: CP_MACH_BREAKPOINTS,
    outputValues: CP_VALUES_M,
    extrapolation: 'clamp'
  })
  // q̄·S
  const qS = B('multiply', 'qbar_S', 1440, 440, { numInputs: 2 })
  // RTW Product2: F = [-CA, -CN_β, -CN_α] * q̄ * S_ref
  const Fx = B('evaluate', 'F_aero_x', 1580, 200, {
    numInputs: 2,
    expression: '-in(0)*in(1)'
  })
  const Fy = B('evaluate', 'F_aero_y', 1580, 260, {
    numInputs: 2,
    expression: '-in(0)*in(1)'
  })
  const Fz = B('evaluate', 'F_aero_z', 1580, 320, {
    numInputs: 2,
    expression: '-in(0)*in(1)'
  })
  const Faero = B('mux', 'F_aero', 1720, 240, {
    rows: 1,
    cols: 3,
    baseType: 'double',
    outputType: 'double[3]',
    outputShape: 'vector'
  })
  // Body force = engines (TVC) + aero
  const Fb = B('sum', 'F_b_cmd', 1860, 160, {
    signs: '++',
    numInputs: 2
  })
  // r_arm = CP_vec − CG(mass); M = r × F
  const demuxCG = B('demux', 'demux_CG', 1340, 700, {
    outputCount: 3,
    inputDimensions: [3]
  })
  const rx = B('sum', 'r_arm_x', 1500, 640, { signs: '+-', numInputs: 2 })
  const ry = B('uminus', 'r_arm_y', 1500, 700, {})
  const rz = B('uminus', 'r_arm_z', 1500, 760, {})
  const rArm = B('mux', 'r_arm', 1640, 680, {
    rows: 1,
    cols: 3,
    baseType: 'double',
    outputType: 'double[3]',
    outputShape: 'vector'
  })
  const Maero = B('cross', 'M_aero', 1780, 640, {})
  // Body moment = engine TVC + aero moments (RTW CG/CN path; was MaeroOff)
  const Mb = B('sum', 'M_b_cmd', 1860, 220, {
    signs: '++',
    numInputs: 2
  })


  // ── χ time-tilt program (8.8-style, flight time from liftoff) ──
  // Simplified AS-205-ish tilt: hold vertical, then nose-down to ~28° by staging.
  // Not full Table 2B polynomials — shape only.
  const chiLut = B('lookup_1d', 'chi_deg_cmd', 40, 420, {
    inputValues: [0, 10, 15, 30, 50, 80, 110, 140, 160],
    outputValues: [90, 90, 85, 75, 60, 45, 35, 30, 28],
    extrapolation: 'clamp'
  })
  // TN criterion: commanded attitude rates ≲ 1 deg/s
  const chiRateLim = B('rate_limiter', 'chi_rate_lim', 220, 420, {
    risingSlewLimit: 1.0,
    fallingSlewLimit: -1.0,
    initialOutput: 90
  })
  const chiToRad = B('units_conversion', 'chi_to_rad', 400, 420, {
    conversionType: 'deg_to_rad'
  })
  // Q_cmd ≈ d(χ)/dt via unit delay (fixed-step discrete derivative)
  const chiPrev = B('unit_delay', 'chi_rad_prev', 400, 500, {
    initialValue: Math.PI / 2, // 90 deg
    sampleInterval: 0
  })
  const dChi = B('sum', 'd_chi', 560, 420, {
    signs: '+-',
    numInputs: 2
  })
  const dtSrc = B('source', 'dt_s', 560, 500, {
    signalType: 'constant',
    value: dt,
    dataType: 'double'
  })
  const Qcmd = B('divide', 'Q_cmd', 700, 420, {})

  // ── Pitch-rate loop → My (9.2-style) ──
  const demuxW = B('demux', 'demux_omega', 900, 120, {
    outputCount: 3,
    inputDimensions: [3]
  })
  const Qerr = B('sum', 'Q_err', 1040, 140, {
    signs: '+-',
    numInputs: 2
  })
  const Qfilt = B('transfer_function', 'Q_filter', 1180, 140, {
    numerator: [1],
    denominator: [0.1556, 1]
  })
  // Pitch-rate loop commands **pitch gimbal** β_P (deg), not free My.
  // K_β ≈ 40 deg/(rad/s): Q_err=0.1 → 4° gimbal (within ±8° H-1 limit).
  const Kq = B('source', 'K_beta_rate', 1180, 60, {
    signalType: 'constant',
    value: 40,
    dataType: 'double'
  })
  const betaP_from_rate = B('matrix_multiply', 'beta_P_from_rate', 1320, 140, {})
  // My_limit name kept for 9.6 patches — holds β_P command (deg), not free My
  const MyLim = B('limit', 'My_limit', 1460, 140, {
    lowerLimit: -H1_GIMBAL_LIMIT_DEG,
    upperLimit: H1_GIMBAL_LIMIT_DEG
  })

  // ── Ports + visualization ──
  const outR = B('output_port', 'r_i', 1100, 40, { portName: 'r_i' })
  const outV = B('output_port', 'v_b', 1260, 40, { portName: 'v_b' })
  const outW = B('output_port', 'omega_b', 1100, 80, { portName: 'omega_b' })
  const outQ = B('output_port', 'q', 1260, 80, { portName: 'q' })
  const outM = B('output_port', 'mass', 1100, 600, { portName: 'mass_kg' })
  const outRmag = B('output_port', 'r_mag', 1260, 600, { portName: 'r_mag_m' })
  const outT = B('output_port', 'thrust', 640, 40, { portName: 'thrust_N' })
  const outAlt = B('output_port', 'h', 1440, 520, { portName: 'altitude_m' })
  const outQbar = B('output_port', 'qbar_out', 1440, 440, { portName: 'qbar_Pa' })
  const outChi = B('output_port', 'chi_cmd', 400, 340, { portName: 'chi_cmd_deg' })
  const outQrate = B('output_port', 'Q_rps', 900, 40, { portName: 'Q_rps' })
  const outQcmd = B('output_port', 'Q_cmd_out', 700, 340, { portName: 'Q_cmd_rps' })
  // outMy port name kept; signal is β_P (deg) after TVC migration
  const outMy = B('output_port', 'My', 1600, 60, { portName: 'beta_P_cmd_deg' })
  const outBetaY = B('output_port', 'beta_Y_out', 1600, 100, {
    portName: 'beta_Y_cmd_deg'
  })
  const outMengY = B('output_port', 'My_eng_out', 1600, 140, {
    portName: 'My_engines_Nm'
  })
  const outRS = B('output_port', 'r_S_out', 1180, 20, { portName: 'r_S_m' })
  const outVS = B('output_port', 'v_S_out', 2040, 40, { portName: 'v_S_mps' })
  const outVSmag = B('output_port', 'V_S_mag_out', 2040, 80, {
    portName: 'V_S_mag_mps'
  })

  const coll = { maxSamples: collectorMaxSamples }
  const dispChi = B('signal_display', 'disp_chi', 1760, 160, {
    title: 'χ cmd (deg)',
    ...coll
  })
  const dispQ = B('signal_display', 'disp_Q', 1760, 240, {
    title: 'Pitch rate Q (rad/s)',
    ...coll
  })
  const dispQcmd = B('signal_display', 'disp_Qcmd', 1760, 320, {
    title: 'Q_cmd (rad/s)',
    ...coll
  })
  const dispH = B('signal_display', 'disp_altitude', 1760, 400, {
    title: 'Altitude MSL (m)',
    ...coll
  })
  const dispM = B('signal_display', 'disp_mass', 1760, 480, {
    title: 'Mass (kg)',
    ...coll
  })
  const dispQbar = B('signal_display', 'disp_qbar', 1760, 560, {
    title: 'Dynamic pressure q̄ (Pa)',
    ...coll
  })
  const dispMy = B('signal_display', 'disp_My', 1760, 640, {
    title: 'Pitch gimbal β_P (deg)',
    ...coll
  })
  const dispBetaY = B('signal_display', 'disp_beta_Y', 1760, 720, {
    title: 'Yaw gimbal β_Y (deg)',
    ...coll
  })
  const dispVS = B('signal_display', 'disp_V_S', 2040, 160, {
    title: 'Space-frame |V_S| (m/s)',
    ...coll
  })

  const logH = B('signal_logger', 'log_altitude', 1920, 240, { ...coll })
  const logM = B('signal_logger', 'log_mass', 1920, 320, { ...coll })
  const logQbar = B('signal_logger', 'log_qbar', 1920, 400, { ...coll })
  const logChi = B('signal_logger', 'log_chi', 1920, 480, { ...coll })
  const logQ = B('signal_logger', 'log_Q', 1920, 560, { ...coll })
  // S-frame state for TN Space residual (not CLI default; use --fields when ready)
  const logXS = B('signal_logger', 'log_X_S', 2080, 240, { ...coll })
  const logYS = B('signal_logger', 'log_Y_S', 2080, 320, { ...coll })
  const logZS = B('signal_logger', 'log_Z_S', 2080, 400, { ...coll })
  const logVSmag = B('signal_logger', 'log_V_S', 2080, 480, { ...coll })
  const logVSx = B('signal_logger', 'log_VX_S', 2080, 560, { ...coll })
  const logVSy = B('signal_logger', 'log_VY_S', 2080, 640, { ...coll })
  const logVSz = B('signal_logger', 'log_VZ_S', 2080, 720, { ...coll })

  const parentBlocks = [
    liftoff,
    edge,
    one,
    tBurn,
    thrustMag,
    mdotCmd,
    zero,
    CGx,
    betaP,
    betaY,
    betaPLim,
    betaYLim,
    Th,
    bpR,
    byR,
    Fx_eng,
    Fy_eng,
    Fz_eng,
    FengVec,
    Mx_eng,
    My_eng,
    Mz_eng,
    MengVec,
    eomSubsystem,
    MES,
    r_S,
    demux_rS,
    C_bE_live,
    v_E_vec,
    v_S,
    V_S_mag,
    demux_vS,
    omegaE,
    v_rot_E,
    v_air_E,
    C_ib,
    v_air_b,
    Re,
    alt,
    atm,
    half,
    Vair_mag,
    Vsq,
    halfRho,
    qbar,
    Sref,
    CGy,
    CGz,
    CG,
    demuxV,
    Vsafe,
    alpha,
    beta,
    alphaDeg,
    betaDeg,
    Mach,
    CA,
    CNa,
    CNb,
    CP,
    qS,
    Fx,
    Fy,
    Fz,
    Faero,
    Fb,
    demuxCG,
    rx,
    ry,
    rz,
    rArm,
    Maero,
    Mb,
    chiLut,
    chiRateLim,
    chiToRad,
    chiPrev,
    dChi,
    dtSrc,
    Qcmd,
    demuxW,
    Qerr,
    Qfilt,
    Kq,
    betaP_from_rate,
    MyLim,
    outR,
    outV,
    outW,
    outQ,
    outM,
    outRmag,
    outT,
    outAlt,
    outQbar,
    outChi,
    outQrate,
    outQcmd,
    outMy,
    outBetaY,
    outMengY,
    outRS,
    outVS,
    outVSmag,
    dispChi,
    dispQ,
    dispQcmd,
    dispH,
    dispM,
    dispQbar,
    dispMy,
    dispBetaY,
    dispVS,
    logH,
    logM,
    logQbar,
    logChi,
    logQ,
    logXS,
    logYS,
    logZS,
    logVSmag,
    logVSx,
    logVSy,
    logVSz
  ]

  const parentWires: SliceWire[] = [
    // Propulsion timer
    W(liftoff, edge),
    W(one, tBurn, 0, 0),
    W(edge, tBurn, 0, -2),
    W(tBurn, thrustMag),
    W(thrustMag, outT),
    W(tBurn, mdotCmd),
    // H-1 engines + TVC: T, β_P, β_Y → F_eng, M_eng
    W(thrustMag, Th),
    W(betaP_from_rate, MyLim), // rate loop → β_P command (via My_limit name)
    W(MyLim, betaPLim),
    W(betaY, betaYLim),
    W(betaPLim, bpR),
    W(betaYLim, byR),
    W(Th, Fx_eng, 0, 0),
    W(bpR, Fx_eng, 0, 1),
    W(byR, Fx_eng, 0, 2),
    W(Th, Fy_eng, 0, 0),
    W(byR, Fy_eng, 0, 1),
    W(Th, Fz_eng, 0, 0),
    W(bpR, Fz_eng, 0, 1),
    W(byR, Fz_eng, 0, 2),
    W(Fx_eng, FengVec, 0, 0),
    W(Fy_eng, FengVec, 0, 1),
    W(Fz_eng, FengVec, 0, 2),
    W(Th, My_eng, 0, 0),
    W(CGx, My_eng, 0, 1),
    W(bpR, My_eng, 0, 2),
    W(byR, My_eng, 0, 3),
    W(Th, Mz_eng, 0, 0),
    W(CGx, Mz_eng, 0, 1),
    W(byR, Mz_eng, 0, 2),
    W(Mx_eng, MengVec, 0, 0),
    W(My_eng, MengVec, 0, 1),
    W(Mz_eng, MengVec, 0, 2),
    // Atmosphere + air-relative q̄
    W(eomSubsystem, alt, ports.r_mag, 0),
    W(Re, alt, 0, 1),
    W(alt, atm),
    W(omegaE, v_rot_E, 0, 0),
    W(eomSubsystem, v_rot_E, ports.r_i, 1),
    W(v_E_vec, v_air_E, 0, 0),
    W(v_rot_E, v_air_E, 0, 1),
    W(C_bE_live, C_ib),
    W(C_ib, v_air_b, 0, 0),
    W(v_air_E, v_air_b, 0, 1),
    W(v_air_b, Vair_mag),
    W(Vair_mag, Vsq, 0, 0),
    W(Vair_mag, Vsq, 0, 1),
    W(half, halfRho, 0, 0),
    W(atm, halfRho, 3, 1),
    W(halfRho, qbar, 0, 0),
    W(Vsq, qbar, 0, 1),
    // Aero
    W(v_air_b, demuxV),
    W(Vair_mag, Vsafe),
    W(demuxV, alpha, 0, 0),
    W(demuxV, alpha, 2, 1),
    W(demuxV, beta, 1, 0),
    W(Vsafe, beta, 0, 1),
    W(alpha, alphaDeg),
    W(beta, betaDeg),
    W(Vair_mag, Mach, 0, 0),
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
    // F_b = F_engines + F_aero
    W(FengVec, Fb, 0, 0),
    W(Faero, Fb, 0, 1),
    W(Fb, eomSubsystem, 0, ports.F_b),
    W(mdotCmd, eomSubsystem, 0, ports.mdot),
    // Mass-sched CG (RTW <S122>) for H-1 arms + aero r_arm
    W(eomSubsystem, CGx, ports.mass, 0),
    W(eomSubsystem, CGy, ports.mass, 0),
    W(eomSubsystem, CGz, ports.mass, 0),
    W(CGx, CG, 0, 0),
    W(CGy, CG, 0, 1),
    W(CGz, CG, 0, 2),
    // M_aero = r × F (live; companion-plant parity)
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
    W(MengVec, Mb, 0, 0),
    W(Maero, Mb, 0, 1),
    W(Mb, eomSubsystem, 0, ports.M_b),
    // χ program → Q_cmd
    W(tBurn, chiLut),
    W(chiLut, chiRateLim),
    W(chiRateLim, chiToRad),
    W(chiToRad, chiPrev),
    W(chiToRad, dChi, 0, 0),
    W(chiPrev, dChi, 0, 1),
    W(dChi, Qcmd, 0, 0),
    W(dtSrc, Qcmd, 0, 1),
    // Rate loop → β_P gimbal
    W(eomSubsystem, demuxW, ports.omega_b, 0),
    W(Qcmd, Qerr, 0, 0),
    W(demuxW, Qerr, 1, 1),
    W(Qerr, Qfilt),
    W(Qfilt, betaP_from_rate, 0, 0),
    W(Kq, betaP_from_rate, 0, 1),
    // EOM / sensor outs
    W(eomSubsystem, outR, ports.r_i, 0),
    W(eomSubsystem, outV, ports.v_b, 0),
    W(eomSubsystem, outW, ports.omega_b, 0),
    W(eomSubsystem, outQ, ports.q, 0),
    W(eomSubsystem, outM, ports.mass, 0),
    W(eomSubsystem, outRmag, ports.r_mag, 0),
    W(alt, outAlt),
    W(qbar, outQbar),
    W(chiRateLim, outChi),
    W(demuxW, outQrate, 1, 0),
    W(Qcmd, outQcmd),
    W(MyLim, outMy),
    W(betaYLim, outBetaY),
    W(My_eng, outMengY),
    // S-frame via MES
    W(MES, r_S, 0, 0),
    W(eomSubsystem, r_S, ports.r_i, 1),
    W(r_S, demux_rS),
    W(r_S, outRS),
    W(eomSubsystem, C_bE_live, ports.q, 0),
    W(C_bE_live, v_E_vec, 0, 0),
    W(eomSubsystem, v_E_vec, ports.v_b, 1),
    W(MES, v_S, 0, 0),
    W(v_E_vec, v_S, 0, 1),
    W(v_S, V_S_mag),
    W(v_S, demux_vS),
    W(v_S, outVS),
    W(V_S_mag, outVSmag),
    // Displays
    W(chiRateLim, dispChi),
    W(demuxW, dispQ, 1, 0),
    W(Qcmd, dispQcmd),
    W(alt, dispH),
    W(eomSubsystem, dispM, ports.mass, 0),
    W(qbar, dispQbar),
    W(MyLim, dispMy),
    W(betaYLim, dispBetaY),
    W(V_S_mag, dispVS),
    // Loggers
    W(alt, logH),
    W(eomSubsystem, logM, ports.mass, 0),
    W(qbar, logQbar),
    W(chiRateLim, logChi),
    W(demuxW, logQ, 1, 0),
    W(demux_rS, logXS, 0, 0),
    W(demux_rS, logYS, 1, 0),
    W(demux_rS, logZS, 2, 0),
    W(V_S_mag, logVSmag),
    W(demux_vS, logVSx, 0, 0),
    W(demux_vS, logVSy, 1, 0),
    W(demux_vS, logVSz, 2, 0)
  ]

  return {
    name: 'saturn-9.4-open-loop-chi-6dof-ascent',
    description:
      'ECI 6DoF + H-1 TVC (β_P/β_Y → F,M) + air-rel F&M aero (RTW CN Unary-Minus + <S122> CG mass-sched) + MES. No free My. TN residual diagnostic.',
    sheets: [
      {
        id: 'main',
        name: 'OpenLoopChiAscent',
        blocks: parentBlocks,
        connections: parentWires,
        extents: { width: 2200, height: 820 }
      }
    ],
    parameters: [
      ...(core.parameters || []),
      {
        name: 'R_pad_m',
        dataType: 'double',
        defaultValue: String(AS205_PAD.R_L_m),
        signalType: 'double',
        value: AS205_PAD.R_L_m
      },
      {
        name: 'R_earth_m',
        dataType: 'double',
        defaultValue: String(AS205_PAD.R_L_m),
        signalType: 'double',
        value: AS205_PAD.R_L_m
      },
      {
        name: 'CdA_m2',
        dataType: 'double',
        defaultValue: '12.0',
        signalType: 'double',
        value: 12.0
      },
      {
        name: 'pitch_rate_gain',
        dataType: 'double',
        defaultValue: '40',
        signalType: 'double',
        value: 40
      },
      {
        name: 'm0_kg',
        dataType: 'double',
        defaultValue: String(m0Tn),
        signalType: 'double',
        value: m0Tn
      }
    ],
    globalSettings: {
      simulationTimeStep: dt,
      simulationDuration: duration,
      integrationAlgorithm: 'rk4'
    }
  }
}

/**
 * Phase 9.5 — Same plant as 9.4 with TN-AP-67-158 **Table 2B** pitch command
 *
 * χ_c from Table 2B is TN convention (0° = vertical, negative downrange).
 * Converted for the open-loop rate path as elev = 90 + χ_c (see as205ChiTable.ts).
 * Rate-only tracking: d(elev)/dt → Q_cmd → β_P gimbal (H-1 TVC), not free My.
 *
 * Prefer TN residual vs Table 5; Simulink may disagree.
 */
export function buildSixDofOpenLoopChiAscentTable2B(): SliceModel {
  const m = buildSixDofOpenLoopChiAscent()
  const sheet = m.sheets[0]
  const chiLut = sheet.blocks.find(b => b.name === 'chi_deg_cmd')
  if (!chiLut) {
    throw new Error('9.5: expected chi_deg_cmd block from 9.4 base')
  }
  chiLut.parameters = {
    ...chiLut.parameters,
    inputValues: table2bChiTimeBreakpoints(),
    outputValues: table2bPlantElevDeg(),
    extrapolation: 'clamp'
  }
  // Rate limiter already starts at 90° elev (vertical)
  const rateLim = sheet.blocks.find(b => b.name === 'chi_rate_lim')
  if (rateLim) {
    rateLim.parameters = {
      ...rateLim.parameters,
      initialOutput: 90,
      // Table 2B average ~0.5 °/s; allow ≤1 °/s TN criterion with small margin
      risingSlewLimit: 1.2,
      fallingSlewLimit: -1.2
    }
  }

  m.name = 'saturn-9.5-open-loop-chi-table2b-ascent'
  m.description =
    '9.4 ECI 6DoF + H-1 TVC + TN Table 2B χ→β_P + air-rel F&M (RTW CG/CN). Rate loop only; TN primary for residuals.'
  if (sheet.name) sheet.name = 'OpenLoopChiTable2B'
  return m
}

/**
 * Phase 9.6 — Table 2B elev program with **Body→S elevation PD → H-1 gimbals**
 *
 * Measured elev from body X in S (plumbline / TN Space-frame axes):
 *   C_bS = MES · C_bE          (Body→S DCM; EDD-style composition)
 *   X_b^S = C_bS · [1,0,0]
 *   elev = asin(clamp(X_b^S · X_S)) = asin(X_b^S_x)
 *     → π/2 at vertical (B‖S pad), decreases as nose tips toward Z_S
 *
 * Actuation is **H-1 TVC only** (no free My/Mx/Mz):
 *   e = elev_meas − elev_cmd     // +β_P → +My → decreases elev (tip downrange)
 *   β_P (deg) = Kp·e − Kd·Q      // limited ±8°
 *   β_Y (deg) = +Kd_lat·R        // yaw-rate damp (H-1 Mz≈−T CGx β_Y ⇒ β_Y∝R)
 *   F_b, M_b = engine cluster(T, β_P, β_Y) + aero
 *
 * Gains in deg / (rad error) and deg / (rad/s) — sized for dMy/dβ_P ≈ CGx·T/2.
 * elev_cmd from Table 2B via elev = 90 + χ_c (deg). Aero uses air-relative v.
 */
export function buildSixDofOpenLoopChiAttitudePd(): SliceModel {
  const m = buildSixDofOpenLoopChiAscentTable2B()
  // omega0 = 0 for clean pad vertical
  const eom = m.sheets[0].blocks.find(b => b.name === 'EOM_6DoF_VarMass')!
  const eomBlocks = eom.parameters?.sheets?.[0]?.blocks as SliceBlock[] | undefined
  if (eomBlocks) {
    const w0 = eomBlocks.find(b => b.name === 'omega0')
    if (w0) {
      w0.parameters = {
        ...w0.parameters,
        value: [0, 0, 0],
        dataType: 'double[3]'
      }
    }
  }

  const sheet = m.sheets[0]
  const demuxW = sheet.blocks.find(b => b.name === 'demux_omega')!
  const chiToRad = sheet.blocks.find(b => b.name === 'chi_to_rad')!
  const myLim = sheet.blocks.find(b => b.name === 'My_limit')!
  const betaPFromRate = sheet.blocks.find(b => b.name === 'beta_P_from_rate')!
  const betaYLim = sheet.blocks.find(b => b.name === 'beta_Y_lim')!
  const betaYSrc = sheet.blocks.find(b => b.name === 'beta_Y_deg')!
  const MES = sheet.blocks.find(b => b.name === 'MES_E_to_S')!
  const C_bE = sheet.blocks.find(b => b.name === 'C_bE_live')!

  // Drop rate-only β_P → My_limit and open-loop β_Y source → lim
  // (rate path blocks stay wired to themselves; only actuator feed is replaced)
  sheet.connections = sheet.connections.filter(c => {
    if (
      c.sourceBlockId === betaPFromRate.id &&
      c.targetBlockId === myLim.id
    ) {
      return false
    }
    if (
      c.sourceBlockId === betaYSrc.id &&
      c.targetBlockId === betaYLim.id
    ) {
      return false
    }
    return true
  })

  // Body→S: C_bS = MES · C_bE (Simulink BODYtoSM DCM path)
  const C_bS = B('matrix_multiply', 'C_bS', 900, 520, {})
  // Full SM Euler: dcm_to_quat → quat_to_euler (Φ,Θ,Ψ body vs S)
  const q_bS = B('orientation_conversion', 'q_bS', 1040, 480, {
    conversionType: 'dcm_to_quat'
  })
  const eul_bS = B('orientation_conversion', 'eul_BodyToSM', 1180, 440, {
    conversionType: 'quat_to_euler'
  })
  const e1 = B('source', 'e1_body', 900, 600, {
    signalType: 'constant',
    value: [1, 0, 0],
    dataType: 'double[3]'
  })
  const Xb_S = B('matrix_multiply', 'Xb_in_S', 1040, 560, {})
  const demux_XbS = B('demux', 'demux_Xb_S', 1180, 560, {
    outputCount: 3,
    inputDimensions: [3]
  })
  // elev from horizontal for TN Table 2B program (≠ Euler Θ)
  const elevMeas = B('evaluate', 'elev_meas_rad', 1320, 520, {
    numInputs: 1,
    expression:
      'asin(in(0) > 1.0 ? 1.0 : (in(0) < -1.0 ? -1.0 : in(0)))'
  })
  // e = elev_cmd − elev_meas (H-1: β_P<0 tips downrange; match companion plant)
  const attErr = B('sum', 'att_err_rad', 1460, 460, {
    signs: '+-',
    numInputs: 2
  })
  // Kp ≈ 20 deg/rad elev error (~1.1° gimbal per 3° elev error)
  const Kp = B('source', 'Kp_att', 1460, 380, {
    signalType: 'constant',
    value: 20,
    dataType: 'double'
  })
  // My_att name kept for tests — signal is β_P_att (deg)
  const MyAtt = B('matrix_multiply', 'My_att', 1600, 440, {})
  // Kd ≈ 8 deg/(rad/s)
  const Kd = B('source', 'Kd_rate', 1460, 560, {
    signalType: 'constant',
    value: 8,
    dataType: 'double'
  })
  const negQ = B('uminus', 'neg_Q', 1320, 600, {})
  const MyDamp = B('matrix_multiply', 'My_damp', 1600, 560, {})
  // My_pd = β_P_pd (deg) → My_limit (±8°) → beta_P_lim → engines
  const MyPd = B('sum', 'My_pd', 1740, 500, {
    signs: '++',
    numInputs: 2
  })
  // Yaw-rate → β_Y gimbal (no free Mz). Roll Mx not produced by equal-gimbal cluster.
  const KdLat = B('source', 'Kd_lat', 1460, 640, {
    signalType: 'constant',
    value: 8,
    dataType: 'double'
  })
  const betaY_from_rate = B('matrix_multiply', 'beta_Y_from_rate', 1600, 740, {})
  myLim.parameters = {
    ...myLim.parameters,
    lowerLimit: -H1_GIMBAL_LIMIT_DEG,
    upperLimit: H1_GIMBAL_LIMIT_DEG
  }

  const coll = {
    maxSamples:
      (sheet.blocks.find(b => b.name === 'log_altitude')?.parameters
        ?.maxSamples as number) || 3800
  }
  const dispTheta = B('signal_display', 'disp_theta', 1880, 480, {
    title: 'elev meas (rad)',
    ...coll
  })
  const logTheta = B('signal_logger', 'log_theta', 2040, 480, { ...coll })
  const outTheta = B('output_port', 'theta_out', 1880, 560, {
    portName: 'elev_meas_rad'
  })
  // BODYtoSM Euler loggers (Simulink BodytoSM_Phi/Theta/Yaw)
  const logPhi = B('signal_logger', 'log_BodyToSM_Phi', 2040, 560, { ...coll })
  const logThSM = B('signal_logger', 'log_BodyToSM_Theta', 2040, 640, {
    ...coll
  })
  const logPsi = B('signal_logger', 'log_BodyToSM_Psi', 2040, 720, { ...coll })
  const outPhi = B('output_port', 'phi_SM_out', 1880, 640, {
    portName: 'BodyToSM_Phi_rad'
  })
  const outThSM = B('output_port', 'theta_SM_out', 1880, 720, {
    portName: 'BodyToSM_Theta_rad'
  })
  const outPsi = B('output_port', 'psi_SM_out', 1880, 800, {
    portName: 'BodyToSM_Psi_rad'
  })

  sheet.blocks.push(
    C_bS,
    q_bS,
    eul_bS,
    e1,
    Xb_S,
    demux_XbS,
    elevMeas,
    attErr,
    Kp,
    MyAtt,
    Kd,
    negQ,
    MyDamp,
    MyPd,
    KdLat,
    betaY_from_rate,
    dispTheta,
    logTheta,
    outTheta,
    logPhi,
    logThSM,
    logPsi,
    outPhi,
    outThSM,
    outPsi
  )

  sheet.connections.push(
    // C_bS = MES · C_bE
    W(MES, C_bS, 0, 0),
    W(C_bE, C_bS, 0, 1),
    // Full Body→SM Euler
    W(C_bS, q_bS),
    W(q_bS, eul_bS),
    W(eul_bS, logPhi, 0, 0),
    W(eul_bS, logThSM, 1, 0),
    W(eul_bS, logPsi, 2, 0),
    W(eul_bS, outPhi, 0, 0),
    W(eul_bS, outThSM, 1, 0),
    W(eul_bS, outPsi, 2, 0),
    // elev PD → β_P (deg): e = elev_meas − elev_cmd
    W(C_bS, Xb_S, 0, 0),
    W(e1, Xb_S, 0, 1),
    W(Xb_S, demux_XbS),
    W(demux_XbS, elevMeas, 0, 0),
    W(chiToRad, attErr, 0, 0), // +cmd
    W(elevMeas, attErr, 0, 1), // −meas → e = cmd − meas
    W(attErr, MyAtt, 0, 0),
    W(Kp, MyAtt, 0, 1),
    W(demuxW, negQ, 1, 0),
    W(negQ, MyDamp, 0, 0),
    W(Kd, MyDamp, 0, 1),
    W(MyAtt, MyPd, 0, 0),
    W(MyDamp, MyPd, 0, 1),
    W(MyPd, myLim),
    // Yaw-rate damp → β_Y gimbal (β_Y ∝ +R for H-1 Mz damping)
    W(demuxW, betaY_from_rate, 2, 0),
    W(KdLat, betaY_from_rate, 0, 1),
    W(betaY_from_rate, betaYLim),
    W(elevMeas, dispTheta),
    W(elevMeas, logTheta),
    W(elevMeas, outTheta)
  )

  m.name = 'saturn-9.6-chi-table2b-attitude-pd'
  m.description =
    '9.5 ECI 6DoF + H-1 TVC + BodyToSM elev PD → β_P + R-damp → β_Y; air-rel F&M (RTW CG/CN); İω. No free My. TN residual diagnostic.'
  sheet.name = 'ChiAttitudePd'
  m.parameters = [
    ...(m.parameters || []),
    {
      name: 'Kp_att',
      dataType: 'double',
      defaultValue: '20',
      signalType: 'double',
      value: 20
    },
    {
      name: 'Kd_rate',
      dataType: 'double',
      defaultValue: '8',
      signalType: 'double',
      value: 8
    },
    {
      name: 'Kd_lat',
      dataType: 'double',
      defaultValue: '8',
      signalType: 'double',
      value: 8
    }
  ]
  return m
}

/** @deprecated use buildSixDofVehicleBurnDemo */
export function buildSixDofVarMassSubsystemDemo(): SliceModel {
  return buildSixDofVehicleBurnDemo()
}

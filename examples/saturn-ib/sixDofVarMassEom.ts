/**
 * 6-DOF variable-mass equations of motion (quaternion attitude)
 *
 * Body-frame translational EOM:
 *   v̇_b = F_b / m − ω × v_b + g_b
 *
 * Body-frame rotational EOM (principal axes, I ∝ m):
 *   I(m) = I_ref * (m / m_ref)
 *   ω̇ = I⁻¹ [ M_b − ω × (I ω) ]
 *
 * Quaternion kinematics:
 *   q̇ = ½ Ω(ω) q   (body2quaternion_rates)
 *
 * Inertial kinematics:
 *   ṙ_i = C_bi · v_b     (C_bi from quat_to_dcm: body → inertial)
 *
 * Mass:
 *   ṁ = −ṁ_prop          (ṁ_prop ≥ 0 is propellant burn rate)
 *
 * Gravity (point mass):
 *   g_i = −μ r_i / |r|³
 *   g_b = C_biᵀ · g_i
 *
 * Conventions:
 *   - Quaternion scalar-first [q0,q1,q2,q3], body rates (P,Q,R) = ω in body axes
 *   - DCM from orientation_conversion quat_to_dcm treated as body→inertial
 *   - Principal inertia only (diagonal I); off-diagonal products of inertia omitted
 */

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
 * Build the 6-DOF variable-mass quaternion EOM as a main demonstration sheet.
 *
 * External drives (sources, replace with input_ports for a subsystem):
 *   F_b [3], M_b [3], mdot_prop ≥ 0
 *
 * IC sources:
 *   r0_i [3], v0_b [3], omega0 [3], q0 [4×1], m0
 */
export function buildSixDofVariableMassEom(): SliceModel {
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

  // ─── Translational: v̇ = F/m − ω×v + g_b ────────────────────────────
  const F_over_m = add(B('divide', 'F_over_m', 500, 400, {}))
  connect(Fb, F_over_m, 0, 0)
  connect(mass, F_over_m, 0, 1)

  const w_cross_v = add(B('cross', 'w_x_v', 500, 480, {}))
  connect(omega, w_cross_v, 0, 0)
  connect(v_b, w_cross_v, 0, 1)
  const neg_wxv = add(B('uminus', 'neg_wxv', 640, 480, {}))
  connect(w_cross_v, neg_wxv)

  const vdot_1 = add(B('sum', 'vdot_tmp', 700, 400, { signs: '++', numInputs: 2 }))
  connect(F_over_m, vdot_1, 0, 0)
  connect(neg_wxv, vdot_1, 0, 1)
  const v_dot = add(B('sum', 'v_dot', 820, 400, { signs: '++', numInputs: 2 }))
  connect(vdot_1, v_dot, 0, 0)
  connect(g_b, v_dot, 0, 1)
  connect(v_dot, v_b, 0, 0)

  // ─── ṙ_i = C_bi * v_b ────────────────────────────────────────────────
  const r_dot = add(B('matrix_multiply', 'r_dot', 780, 520, {}))
  connect(C_bi, r_dot, 0, 0)
  connect(v_b, r_dot, 0, 1)
  connect(r_dot, r_i, 0, 0)

  // ─── Rotational Euler (principal axes) ───────────────────────────────
  // Iω
  const demux_Iw_in = demux_w // reuse P,Q,R
  // Iw_x = Ixx * P, etc.
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
  // mux: for vector 1x3, inputs are 3 scalars in order
  connect(Iw_x, Iw, 0, 0)
  connect(Iw_y, Iw, 0, 1)
  connect(Iw_z, Iw, 0, 2)

  // ω × (Iω)
  const w_cross_Iw = add(B('cross', 'w_x_Iw', 700, 300, {}))
  connect(omega, w_cross_Iw, 0, 0)
  connect(Iw, w_cross_Iw, 0, 1)
  const neg_wIw = add(B('uminus', 'neg_wIw', 820, 300, {}))
  connect(w_cross_Iw, neg_wIw)

  // M_net = M − ω×(Iω)
  const M_net = add(B('sum', 'M_net', 700, 360, { signs: '++', numInputs: 2 }))
  connect(Mb, M_net, 0, 0)
  connect(neg_wIw, M_net, 0, 1)

  // ω̇_i = M_net_i / I_i
  const demux_M = add(
    B('demux', 'demux_Mnet', 820, 360, {
      outputCount: 3,
      inputDimensions: [3]
    })
  )
  connect(M_net, demux_M)
  const wd_x = add(B('divide', 'wd_x', 960, 300, {}))
  const wd_y = add(B('divide', 'wd_y', 960, 340, {}))
  const wd_z = add(B('divide', 'wd_z', 960, 380, {}))
  connect(demux_M, wd_x, 0, 0)
  connect(Ixx, wd_x, 0, 1)
  connect(demux_M, wd_y, 1, 0)
  connect(Iyy, wd_y, 0, 1)
  connect(demux_M, wd_z, 2, 0)
  connect(Izz, wd_z, 0, 1)
  const w_dot = add(
    B('mux', 'omega_dot', 1080, 320, {
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
  const out_r = add(B('output_port', 'r_i_out', 1200, 600, { portName: 'r_i' }))
  const out_v = add(B('output_port', 'v_b_out', 1200, 400, { portName: 'v_b' }))
  const out_w = add(B('output_port', 'omega_out', 1200, 200, { portName: 'omega_b' }))
  const out_q = add(B('output_port', 'q_out', 1200, 40, { portName: 'q' }))
  const out_m = add(B('output_port', 'mass_out', 1200, 920, { portName: 'mass' }))
  const out_h = add(B('output_port', 'rmag_out', 1200, 660, { portName: 'r_mag' }))

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

  return {
    name: 'saturn-6dof-varmass-quaternion-eom',
    description:
      '6-DOF variable-mass EOM with unit-quaternion renormalization, principal inertia ∝ mass, point-mass gravity, body forces/moments',
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

/** EOM as flattenable subsystem (shared by burn demos). */
function buildEomSubsystemBlock(x = 520, y = 220): {
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
  const core = buildSixDofVariableMassEom()
  const coreSheet = core.sheets[0]

  const renamePort: Record<string, { portName: string; dataType: string }> = {
    F_b: { portName: 'F_b', dataType: 'double[3]' },
    M_b: { portName: 'M_b', dataType: 'double[3]' },
    mdot_prop: { portName: 'mdot_prop', dataType: 'double' }
  }

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
    return { ...b }
  })

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
    W(atm, halfRho, 2, 1), // density
    W(halfRho, qbar, 0, 0),
    W(Vsq, qbar, 0, 1),
    W(alt, outAlt),
    W(atm, outRho, 2, 0),
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
    W(atm, halfRho, 2, 1),
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
    W(atm, outRho, 2, 0),
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

/** @deprecated use buildSixDofVehicleBurnDemo */
export function buildSixDofVarMassSubsystemDemo(): SliceModel {
  return buildSixDofVehicleBurnDemo()
}

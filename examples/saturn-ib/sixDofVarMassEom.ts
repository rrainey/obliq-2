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

/**
 * Package EOM physics as a subsystem with ports:
 *   in:  F_b[3], M_b[3], mdot_prop
 *   out: r_i[3], v_b[3], omega_b[3], q[4x1], mass, r_mag
 * Parent applies axial thrust + burn schedule for a short boost demo.
 */
export function buildSixDofVehicleBurnDemo(): SliceModel {
  resetIds()

  // Build core EOM once and convert F/M/mdot sources → input ports inside a subsystem
  const core = buildSixDofVariableMassEom()
  const coreSheet = core.sheets[0]

  // Clone and rewrite external drive sources to input ports
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
    // Drop outer output_port wrappers' port names stay as subsystem outputs
    return { ...b }
  })

  // Keep output ports as subsystem outputs (already portName set)
  const outputPortNames = ['r_i', 'v_b', 'omega_b', 'q', 'mass', 'r_mag']
  const inputPortNames = ['F_b', 'M_b', 'mdot_prop']

  const eomSubsystem: SliceBlock = {
    id: 'sub_eom',
    name: 'EOM_6DoF_VarMass',
    type: 'subsystem',
    position: { x: 400, y: 200 },
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

  const outR = B('output_port', 'r_i', 700, 160, { portName: 'r_i' })
  const outV = B('output_port', 'v_b', 700, 220, { portName: 'v_b' })
  const outM = B('output_port', 'mass', 700, 280, { portName: 'mass' })
  const outQ = B('output_port', 'q', 700, 340, { portName: 'q' })
  const outRmag = B('output_port', 'r_mag', 700, 400, { portName: 'r_mag' })
  const outT = B('output_port', 'thrust', 700, 100, { portName: 'thrust_N' })

  // Find subsystem output port indices by order of outputPorts
  // outputPorts: r_i=0, v_b=1, omega_b=2, q=3, mass=4, r_mag=5

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
    W(Fb, eomSubsystem, 0, 0), // F_b
    W(Mb, eomSubsystem, 0, 1), // M_b
    W(mdotCmd, eomSubsystem, 0, 2), // mdot
    W(eomSubsystem, outR, 0, 0),
    W(eomSubsystem, outV, 1, 0),
    W(eomSubsystem, outQ, 3, 0),
    W(eomSubsystem, outM, 4, 0),
    W(eomSubsystem, outRmag, 5, 0)
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

/** @deprecated use buildSixDofVehicleBurnDemo */
export function buildSixDofVarMassSubsystemDemo(): SliceModel {
  return buildSixDofVehicleBurnDemo()
}

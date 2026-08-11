/**
 * Saturn-IB Phase 8 vertical slice models.
 * Minimal models that exercise the new blocks on the critical path to a full stack port.
 *
 * Export as sheets[] for CodeGenerator / sample JSON.
 */

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
const resetIds = () => { _id = 0 }

function block(
  type: string,
  name: string,
  x: number,
  y: number,
  parameters: Record<string, any> = {}
): SliceBlock {
  return { id: nid(type), name, type, position: { x, y }, parameters }
}

function wire(from: SliceBlock, to: SliceBlock, fromPort = 0, toPort = 0): SliceWire {
  return {
    id: nid('wire'),
    sourceBlockId: from.id,
    sourcePortIndex: fromPort,
    targetBlockId: to.id,
    targetPortIndex: toPort
  }
}

function sheet(blocks: SliceBlock[], connections: SliceWire[], name = 'Main'): SliceSheet {
  return {
    id: 'main',
    name,
    blocks,
    connections,
    extents: { width: 1200, height: 800 }
  }
}

/** AS-205 style guidance constants (from AS205_presettings.m) */
export const AS205_PARAMETERS = [
  { name: 'V_T_mps', dataType: 'double', defaultValue: '7780.976', signalType: 'double', value: 7780.976 },
  { name: 'R_T_m', dataType: 'double', defaultValue: '6570774.0', signalType: 'double', value: 6570774.0 },
  { name: 'A_z_deg', dataType: 'double', defaultValue: '82.8200', signalType: 'double', value: 82.82 },
  { name: 'phi_L_deg', dataType: 'double', defaultValue: '28.521963', signalType: 'double', value: 28.521963 },
  { name: 'lambda_L_deg', dataType: 'double', defaultValue: '-80.561141', signalType: 'double', value: -80.561141 },
  { name: 'epsilon_2_sec', dataType: 'double', defaultValue: '15.0', signalType: 'double', value: 15.0 },
  { name: 'epsilon_prime_sec', dataType: 'double', defaultValue: '3.0', signalType: 'double', value: 3.0 },
  { name: 'T3_IGM_sec', dataType: 'double', defaultValue: '30.0', signalType: 'double', value: 30.0 },
  { name: 'mu_earth', dataType: 'double', defaultValue: '3.986004418e14', signalType: 'double', value: 3.986004418e14 },
  { name: 'R_earth_m', dataType: 'double', defaultValue: '6371000.0', signalType: 'double', value: 6371000.0 }
]

/**
 * 8.1 Radial free-fall under inverse-square gravity
 *   r_dot = v
 *   v_dot = -mu / r^2
 */
export function buildGravityBallistics(): SliceModel {
  resetIds()
  const mu = block('source', 'mu', 40, 200, {
    signalType: 'constant', value: 3.986004418e14, dataType: 'double'
  })
  const r0 = block('source', 'r0', 40, 80, {
    signalType: 'constant', value: 6.471e6, dataType: 'double' // ~100 km alt
  })
  const v0 = block('source', 'v0', 40, 320, {
    signalType: 'constant', value: 0, dataType: 'double'
  })
  const rInt = block('integrator', 'r', 400, 120, {
    showInitPort: true, initialValue: 0, showResetInput: false, showEnableInput: false
  })
  const vInt = block('integrator', 'v', 400, 280, {
    showInitPort: true, initialValue: 0, showResetInput: false, showEnableInput: false
  })
  // a = -mu / (r*r)
  const rSq = block('multiply', 'r_sq', 560, 200, { numInputs: 2 })
  const muOverR2 = block('divide', 'mu_over_r2', 700, 200, {})
  const accel = block('uminus', 'accel', 840, 200, {})
  const outR = block('output_port', 'r_m', 1000, 120, { portName: 'r_m' })
  const outV = block('output_port', 'v_mps', 1000, 280, { portName: 'v_mps' })
  const outA = block('output_port', 'a_mps2', 1000, 200, { portName: 'a_mps2' })

  const blocks = [mu, r0, v0, rInt, vInt, rSq, muOverR2, accel, outR, outV, outA]
  const connections = [
    wire(r0, rInt, 0, 1), // x(0)
    wire(v0, vInt, 0, 1),
    wire(vInt, rInt, 0, 0), // r_dot = v
    wire(accel, vInt, 0, 0), // v_dot = a
    wire(rInt, rSq, 0, 0),
    wire(rInt, rSq, 0, 1),
    wire(mu, muOverR2, 0, 0),
    wire(rSq, muOverR2, 0, 1),
    wire(muOverR2, accel),
    wire(rInt, outR),
    wire(vInt, outV),
    wire(accel, outA)
  ]

  return {
    name: 'saturn-8.1-gravity-ballistics',
    description: '1D radial free-fall: r_dot=v, v_dot=-mu/r^2 with integrator x(0) and divide',
    sheets: [sheet(blocks, connections)],
    parameters: AS205_PARAMETERS.filter(p => ['mu_earth', 'R_earth_m'].includes(p.name)),
    globalSettings: {
      simulationTimeStep: 0.1,
      simulationDuration: 100,
      integrationAlgorithm: 'rk4'
    }
  }
}

/**
 * 8.3 Engine timer: edge start → time-since-start → thrust lookup
 */
export function buildEngineThrustTimer(): SliceModel {
  resetIds()
  const startCmd = block('source', 'StartCmd', 40, 200, {
    signalType: 'step', stepTime: 1.0, stepValue: 1.0, dataType: 'double'
  })
  const edge = block('edge_detect', 'EngineStart', 200, 200, {
    edge: 'rising', threshold: 0.5
  })
  const clock = block('clock', 'Time', 40, 80, {})
  // Capture t0 on edge using unit_delay in a hold pattern is complex;
  // Use integrator for time_since: enable-style via reset on edge and integrate 1
  const one = block('source', 'One', 40, 320, {
    signalType: 'constant', value: 1, dataType: 'double'
  })
  const tSince = block('integrator', 't_since_start', 400, 280, {
    showResetInput: true,
    showInitPort: false,
    initialValue: 0,
    showEnableInput: false
  })
  // Thrust table: time 0..10 → thrust rises then flat (simplified H-1)
  const thrustLut = block('lookup_1d', 'Thrust_N', 600, 280, {
    inputValues: [0, 0.5, 1, 2, 5, 10, 20, 50, 100, 150],
    outputValues: [0, 2e5, 8e5, 8.9e5, 8.9e5, 8.9e5, 8.9e5, 8.9e5, 8.5e5, 0],
    extrapolation: 'clamp'
  })
  const outT = block('output_port', 'thrust_N', 800, 280, { portName: 'thrust_N' })
  const outPulse = block('output_port', 'start_pulse', 400, 120, { portName: 'start_pulse' })
  const outTs = block('output_port', 't_since_s', 800, 200, { portName: 't_since_s' })

  const blocks = [startCmd, edge, clock, one, tSince, thrustLut, outT, outPulse, outTs]
  const connections = [
    wire(startCmd, edge),
    wire(edge, outPulse),
    wire(one, tSince, 0, 0), // integrate 1 → time
    wire(edge, tSince, 0, -2), // reset on rising edge (control port)
    wire(tSince, thrustLut),
    wire(thrustLut, outT),
    wire(tSince, outTs)
  ]

  return {
    name: 'saturn-8.3-engine-thrust-timer',
    description: 'Edge detect on start command resets integrator; time-since-start drives thrust lookup_1d',
    sheets: [sheet(blocks, connections)],
    globalSettings: {
      simulationTimeStep: 0.05,
      simulationDuration: 20,
      integrationAlgorithm: 'rk4'
    }
  }
}

/**
 * 8.4 Atmosphere + dynamic pressure q = 0.5 * rho * V^2
 */
export function buildAtmosphereDynamicPressure(): SliceModel {
  resetIds()
  const alt = block('source', 'altitude_m', 40, 200, {
    signalType: 'ramp', startValue: 0, slope: 1000, dataType: 'double' // 1 km/s climb
  })
  const V = block('source', 'V_mps', 40, 360, {
    signalType: 'constant', value: 500, dataType: 'double'
  })
  const atm = block('atmosphere', 'Atm', 250, 180, {
    model: 'coesa1976', extrapolation: 'clamp'
  })
  const half = block('source', 'half', 40, 440, {
    signalType: 'constant', value: 0.5, dataType: 'double'
  })
  const Vsq = block('multiply', 'Vsq', 250, 360, { numInputs: 2 })
  // q = 0.5 * rho * V^2
  const halfRho = block('multiply', 'half_rho', 450, 280, { numInputs: 2 })
  const qbar = block('multiply', 'qbar', 620, 320, { numInputs: 2 })
  const outRho = block('output_port', 'rho', 450, 160, { portName: 'rho_kgpm3' })
  const outT = block('output_port', 'T', 450, 80, { portName: 'T_K' })
  const outQ = block('output_port', 'qbar', 800, 320, { portName: 'qbar_Pa' })
  const outA = block('output_port', 'a_sound', 450, 240, { portName: 'a_mps' })

  const blocks = [alt, V, atm, half, Vsq, halfRho, qbar, outRho, outT, outQ, outA]
  const connections = [
    wire(alt, atm),
    wire(atm, outT, 0, 0), // temperature
    wire(atm, outRho, 2, 0), // density port 2
    wire(atm, outA, 3, 0), // speed of sound
    wire(V, Vsq, 0, 0),
    wire(V, Vsq, 0, 1),
    wire(half, halfRho, 0, 0),
    wire(atm, halfRho, 2, 1), // rho
    wire(halfRho, qbar, 0, 0),
    wire(Vsq, qbar, 0, 1),
    wire(qbar, outQ)
  ]

  return {
    name: 'saturn-8.4-atmosphere-qbar',
    description: 'COESA atmosphere + dynamic pressure q=0.5*rho*V^2 during climb',
    sheets: [sheet(blocks, connections)],
    globalSettings: {
      simulationTimeStep: 0.1,
      simulationDuration: 60,
      integrationAlgorithm: 'rk4'
    }
  }
}

/**
 * 8.7 Derived-rate-modulator style: error → relay → unit_delay feedback path
 */
export function buildRateModulator(): SliceModel {
  resetIds()
  const cmd = block('source', 'cmd', 40, 200, {
    signalType: 'constant', value: 1, dataType: 'double'
  })
  const fb = block('unit_delay', 'fb', 500, 320, {
    initialValue: 0, sampleInterval: 0
  })
  const err = block('sum', 'error', 200, 200, { signs: '+-', numInputs: 2 })
  const relay = block('relay', 'modulator', 360, 200, {
    onThreshold: 0.1,
    offThreshold: -0.1,
    onOutput: 1,
    offOutput: -1,
    initialOn: false
  })
  const out = block('output_port', 'u_cmd', 600, 200, { portName: 'u_cmd' })

  const blocks = [cmd, fb, err, relay, out]
  const connections = [
    wire(cmd, err, 0, 0),
    wire(fb, err, 0, 1),
    wire(err, relay),
    wire(relay, out),
    wire(relay, fb)
  ]

  return {
    name: 'saturn-8.7-rate-modulator',
    description: 'Relay + unit_delay bang-bang modulator (SACS-style skeleton)',
    sheets: [sheet(blocks, connections)],
    globalSettings: {
      simulationTimeStep: 0.01,
      simulationDuration: 2,
      integrationAlgorithm: 'rk4'
    }
  }
}

/**
 * 8.8 Chi time-tilt program with rate limiter
 */
export function buildChiTimeTilt(): SliceModel {
  resetIds()
  const clock = block('clock', 't', 40, 200, {})
  // Pitch program: hold, then tilt over ~20s to ~45 deg, then hold
  const chiLut = block('lookup_1d', 'chi_deg_cmd', 220, 200, {
    inputValues: [0, 10, 15, 35, 50, 100, 200],
    outputValues: [90, 90, 85, 50, 45, 45, 45],
    extrapolation: 'clamp'
  })
  const rateLim = block('rate_limiter', 'chi_rate_lim', 420, 200, {
    risingSlewLimit: 5, // deg/s
    fallingSlewLimit: -5,
    initialOutput: 90
  })
  const outCmd = block('output_port', 'chi_raw', 420, 80, { portName: 'chi_raw_deg' })
  const outLim = block('output_port', 'chi_lim', 600, 200, { portName: 'chi_lim_deg' })

  const blocks = [clock, chiLut, rateLim, outCmd, outLim]
  const connections = [
    wire(clock, chiLut),
    wire(chiLut, outCmd),
    wire(chiLut, rateLim),
    wire(rateLim, outLim)
  ]

  return {
    name: 'saturn-8.8-chi-time-tilt',
    description: 'Time-tilt chi pitch program via lookup_1d + rate_limiter',
    sheets: [sheet(blocks, connections)],
    parameters: AS205_PARAMETERS.filter(p => p.name === 'A_z_deg'),
    globalSettings: {
      simulationTimeStep: 0.1,
      simulationDuration: 120,
      integrationAlgorithm: 'rk4'
    }
  }
}

/**
 * 8.9 IGM mode shell using data stores
 */
export function buildIgmModeShell(): SliceModel {
  resetIds()
  const clock = block('clock', 't', 40, 200, {})
  // Mode steps: 0 until t=10, then 1, then 2 after t=30
  const modeEval = block('evaluate', 'mode_logic', 220, 200, {
    numInputs: 1,
    expression: 'in(0) < 10.0 ? 0.0 : (in(0) < 30.0 ? 1.0 : 2.0)'
  })
  const write = block('data_store_write', 'Write_nIGMMode', 400, 200, {
    storeName: 'nIGMMode',
    dataType: 'double',
    initialValue: '0'
  })
  const read = block('data_store_read', 'Read_nIGMMode', 400, 320, {
    storeName: 'nIGMMode',
    dataType: 'double'
  })
  const outMode = block('output_port', 'nIGMMode', 600, 320, { portName: 'nIGMMode' })
  const outT = block('output_port', 'time_s', 220, 80, { portName: 'time_s' })

  const blocks = [clock, modeEval, write, read, outMode, outT]
  const connections = [
    wire(clock, modeEval),
    wire(modeEval, write),
    wire(read, outMode),
    wire(clock, outT)
  ]

  return {
    name: 'saturn-8.9-igm-mode-shell',
    description: 'IGM mode variable nIGMMode via data_store write/read (time-based mode steps)',
    sheets: [sheet(blocks, connections)],
    parameters: AS205_PARAMETERS.filter(p =>
      ['T3_IGM_sec', 'epsilon_2_sec', 'epsilon_prime_sec', 'V_T_mps', 'R_T_m'].includes(p.name)
    ),
    globalSettings: {
      simulationTimeStep: 0.1,
      simulationDuration: 50,
      integrationAlgorithm: 'rk4'
    }
  }
}

/**
 * 8.6 FCC attitude filter (transfer function) + limit
 */
export function buildFccFilter(): SliceModel {
  resetIds()
  const err = block('source', 'att_err', 40, 200, {
    signalType: 'step', stepTime: 0.5, stepValue: 1.0, dataType: 'double'
  })
  // S-IB style first-order-ish: num=[1], den=[0.1556, 1] from Saturn model filters
  const filt = block('transfer_function', 'att_filter', 220, 200, {
    numerator: [1],
    denominator: [0.1556, 1]
  })
  const lim = block('limit', 'cmd_limit', 400, 200, {
    lowerLimit: -1,
    upperLimit: 1
  })
  const out = block('output_port', 'beta_c', 560, 200, { portName: 'beta_c' })

  const blocks = [err, filt, lim, out]
  const connections = [
    wire(err, filt),
    wire(filt, lim),
    wire(lim, out)
  ]

  return {
    name: 'saturn-8.6-fcc-filter',
    description: 'Attitude error through transfer_function + limit (FCC skeleton)',
    sheets: [sheet(blocks, connections)],
    globalSettings: {
      simulationTimeStep: 0.01,
      simulationDuration: 5,
      integrationAlgorithm: 'rk4'
    }
  }
}

/**
 * 8.2 Vacuum attitude kinematics (quaternion EoM core)
 *   q_dot = body2quaternion_rates(q, P, Q, R)
 *   q = integral(q_dot) with IC [1,0,0,0]^T
 * Slow body rates → orientation evolves; no translation forces.
 */
export function buildSixDofVacuumKinematics(): SliceModel {
  resetIds()
  // Identity quaternion as 4×1 column: scalar-first [1,0,0,0]
  const q0 = block('source', 'q0', 40, 200, {
    signalType: 'constant',
    dataType: 'double[4][1]',
    value: [[1], [0], [0], [0]]
  })
  const P = block('source', 'P_rps', 40, 80, {
    signalType: 'constant', value: 0.01, dataType: 'double'
  })
  const Q = block('source', 'Q_rps', 40, 140, {
    signalType: 'constant', value: 0.02, dataType: 'double'
  })
  const R = block('source', 'R_rps', 40, 320, {
    signalType: 'constant', value: 0.0, dataType: 'double'
  })
  const qInt = block('integrator', 'q', 420, 200, {
    showInitPort: true,
    initialValue: 0,
    showResetInput: false,
    showEnableInput: false
  })
  const qdot = block('body2quaternion_rates', 'qdot', 260, 200, {})
  const outQ = block('output_port', 'q_out', 600, 200, { portName: 'q' })
  const outP = block('output_port', 'P_out', 600, 80, { portName: 'P' })
  const outQrate = block('output_port', 'Q_out', 600, 140, { portName: 'Q' })

  // Also translate DCM for visibility of attitude
  const quat2dcm = block('orientation_conversion', 'q2dcm', 420, 360, {
    conversionType: 'quat_to_dcm'
  })
  const outDcm = block('output_port', 'DCM', 600, 360, { portName: 'DCM' })

  const blocks = [q0, P, Q, R, qInt, qdot, outQ, outP, outQrate, quat2dcm, outDcm]
  const connections = [
    wire(q0, qInt, 0, 1), // x(0)
    wire(qInt, qdot, 0, 0), // q
    wire(P, qdot, 0, 1),
    wire(Q, qdot, 0, 2),
    wire(R, qdot, 0, 3),
    wire(qdot, qInt, 0, 0), // derivative
    wire(qInt, outQ),
    wire(P, outP),
    wire(Q, outQrate),
    wire(qInt, quat2dcm, 0, 0),
    wire(quat2dcm, outDcm)
  ]

  return {
    name: 'saturn-8.2-6dof-vacuum-kinematics',
    description:
      'Vacuum quaternion kinematics: body2quaternion_rates + integrator x(0) + quat_to_dcm (no force/torque)',
    sheets: [sheet(blocks, connections)],
    globalSettings: {
      simulationTimeStep: 0.01,
      simulationDuration: 20,
      integrationAlgorithm: 'rk4'
    }
  }
}

/**
 * Helper: build an enabled stage subsystem with an internal integrator (propellant / burn timer).
 * When enable is false, subsystem freezes internal state (stage dead).
 */
function buildStageSubsystem(
  id: string,
  name: string,
  x: number,
  y: number
): SliceBlock {
  const inPort = {
    id: `${id}_in`,
    name: 'mdot_in',
    type: 'input_port',
    position: { x: 40, y: 200 },
    parameters: { portName: 'mdot_in', dataType: 'double', defaultValue: 0 }
  }
  const outPort = {
    id: `${id}_out`,
    name: 'prop_used',
    type: 'output_port',
    position: { x: 360, y: 200 },
    parameters: { portName: 'prop_used' }
  }
  const integ = {
    id: `${id}_int`,
    name: 'propellant_used',
    type: 'integrator',
    position: { x: 200, y: 190 },
    parameters: {
      initialValue: 0,
      showInitPort: false,
      showResetInput: false,
      showEnableInput: false
    }
  }
  const stageSheet = {
    id: `${id}_sheet`,
    name: `${name} Internals`,
    blocks: [inPort, integ, outPort],
    connections: [
      {
        id: `${id}_w1`,
        sourceBlockId: inPort.id,
        sourcePortIndex: 0,
        targetBlockId: integ.id,
        targetPortIndex: 0
      },
      {
        id: `${id}_w2`,
        sourceBlockId: integ.id,
        sourcePortIndex: 0,
        targetBlockId: outPort.id,
        targetPortIndex: 0
      }
    ],
    extents: { width: 500, height: 400 }
  }

  return {
    id,
    name,
    type: 'subsystem',
    position: { x, y },
    parameters: {
      sheets: [stageSheet],
      inputPorts: ['mdot_in'],
      outputPorts: ['prop_used'],
      showEnableInput: true,
      codeGenStrategy: 'flatten'
    }
  }
}

/**
 * 8.5 Stage enable freeze
 * S-IB stage integrates mdot while enable=1; after sep (enable→0) propellant-used freezes.
 */
export function buildStageEnableFreeze(): SliceModel {
  resetIds()
  // Enable true until t=10s (burn), then false (stage separation freezes subsystem).
  // Subsystem enable port requires bool — use condition, not evaluate 1.0/0.0.
  const clock = block('clock', 't', 40, 40, {})
  const enableCond = block('condition', 'enable_SIB', 180, 120, {
    condition: '< 10.0'
  })
  const mdot = block('source', 'mdot', 40, 280, {
    signalType: 'constant', value: 1000, dataType: 'double' // kg/s
  })
  const stage = buildStageSubsystem('sub_sib', 'S_IB_Stage', 360, 200)
  const outProp = block('output_port', 'prop_used_kg', 560, 200, { portName: 'prop_used_kg' })
  const outEn = block('output_port', 'enable_out', 360, 80, { portName: 'enable' })

  const blocks = [clock, enableCond, mdot, stage, outProp, outEn]
  const connections = [
    wire(clock, enableCond),
    wire(enableCond, outEn),
    // enable port is -1 on subsystem
    {
      id: nid('wire'),
      sourceBlockId: enableCond.id,
      sourcePortIndex: 0,
      targetBlockId: stage.id,
      targetPortIndex: -1
    },
    // mdot → subsystem input 0
    wire(mdot, stage, 0, 0),
    wire(stage, outProp, 0, 0)
  ]

  return {
    name: 'saturn-8.5-stage-enable-freeze',
    description:
      'S-IB stage subsystem with enable: integrates propellant while enable=1, freezes after sep (t≥10s)',
    sheets: [sheet(blocks, connections)],
    globalSettings: {
      simulationTimeStep: 0.1,
      simulationDuration: 20,
      integrationAlgorithm: 'rk4'
    }
  }
}

/**
 * 8.10 Simplified 1D open-loop ascent
 * Combines: edge start → thrust LUT, gravity, mass constant, atmosphere density sample.
 *   a = T/m - mu/r^2
 *   r_dot = v, v_dot = a
 */
export function buildOpenLoopAscent1D(): SliceModel {
  resetIds()
  const start = block('source', 'liftoff', 40, 40, {
    signalType: 'step', stepTime: 0.5, stepValue: 1, dataType: 'double'
  })
  const edge = block('edge_detect', 'liftoff_edge', 180, 40, {
    edge: 'rising', threshold: 0.5
  })
  const one = block('source', 'one', 40, 120, {
    signalType: 'constant', value: 1, dataType: 'double'
  })
  const tBurn = block('integrator', 't_burn', 180, 120, {
    showResetInput: true,
    initialValue: 0,
    showInitPort: false
  })
  const thrust = block('lookup_1d', 'Thrust_N', 340, 120, {
    inputValues: [0, 0.5, 1, 2, 10, 50, 100, 140, 150],
    outputValues: [0, 5e5, 8e5, 8.9e5, 8.9e5, 8.9e5, 8.9e5, 8e5, 0],
    extrapolation: 'clamp'
  })
  const mass = block('source', 'mass_kg', 40, 280, {
    signalType: 'constant', value: 5.9e5, dataType: 'double' // ~Saturn-IB stack order
  })
  const mu = block('source', 'mu', 40, 360, {
    signalType: 'constant', value: 3.986004418e14, dataType: 'double'
  })
  const r0 = block('source', 'r0', 40, 440, {
    signalType: 'constant', value: 6371000 + 34, dataType: 'double' // pad radius
  })
  const v0 = block('source', 'v0', 40, 520, {
    signalType: 'constant', value: 0, dataType: 'double'
  })
  const rInt = block('integrator', 'r', 520, 400, {
    showInitPort: true, initialValue: 0
  })
  const vInt = block('integrator', 'v', 520, 520, {
    showInitPort: true, initialValue: 0
  })
  // a_thrust = T/m
  const aThrust = block('divide', 'a_thrust', 500, 200, {})
  // r^2, gravity, total accel
  const rSq = block('multiply', 'r_sq', 680, 360, { numInputs: 2 })
  const gMag = block('divide', 'g_mag', 820, 360, {})
  const gAcc = block('uminus', 'g_acc', 940, 360, {})
  const aTot = block('sum', 'a_tot', 700, 240, { signs: '++', numInputs: 2 })
  // altitude for atmosphere
  const Re = block('source', 'Re', 40, 600, {
    signalType: 'constant', value: 6371000, dataType: 'double'
  })
  const alt = block('sum', 'altitude', 680, 480, { signs: '+-', numInputs: 2 })
  const atm = block('atmosphere', 'Atm', 860, 480, {
    model: 'coesa1976', extrapolation: 'clamp'
  })

  const outR = block('output_port', 'r_m', 1100, 400, { portName: 'r_m' })
  const outV = block('output_port', 'v_mps', 1100, 520, { portName: 'v_mps' })
  const outT = block('output_port', 'thrust_N', 500, 80, { portName: 'thrust_N' })
  const outAlt = block('output_port', 'h_m', 1100, 480, { portName: 'h_m' })
  const outRho = block('output_port', 'rho', 1100, 560, { portName: 'rho_kgpm3' })
  const outA = block('output_port', 'a_mps2', 1100, 240, { portName: 'a_mps2' })

  const blocks = [
    start, edge, one, tBurn, thrust, mass, mu, r0, v0, rInt, vInt,
    aThrust, rSq, gMag, gAcc, aTot, Re, alt, atm,
    outR, outV, outT, outAlt, outRho, outA
  ]
  const connections = [
    wire(start, edge),
    wire(one, tBurn, 0, 0),
    wire(edge, tBurn, 0, -2),
    wire(tBurn, thrust),
    wire(thrust, outT),
    wire(thrust, aThrust, 0, 0),
    wire(mass, aThrust, 0, 1),
    wire(r0, rInt, 0, 1),
    wire(v0, vInt, 0, 1),
    wire(vInt, rInt, 0, 0),
    wire(aTot, vInt, 0, 0),
    wire(rInt, rSq, 0, 0),
    wire(rInt, rSq, 0, 1),
    wire(mu, gMag, 0, 0),
    wire(rSq, gMag, 0, 1),
    wire(gMag, gAcc),
    wire(aThrust, aTot, 0, 0),
    wire(gAcc, aTot, 0, 1),
    wire(rInt, alt, 0, 0),
    wire(Re, alt, 0, 1),
    wire(alt, atm),
    wire(rInt, outR),
    wire(vInt, outV),
    wire(alt, outAlt),
    wire(atm, outRho, 2, 0),
    wire(aTot, outA)
  ]

  return {
    name: 'saturn-8.10-open-loop-ascent-1d',
    description:
      '1D open-loop ascent: liftoff edge → thrust table, gravity, atmosphere density (order-of-magnitude stack)',
    sheets: [sheet(blocks, connections)],
    parameters: AS205_PARAMETERS.filter(p =>
      ['mu_earth', 'R_earth_m', 'V_T_mps', 'R_T_m', 'A_z_deg'].includes(p.name)
    ),
    globalSettings: {
      simulationTimeStep: 0.1,
      simulationDuration: 160,
      integrationAlgorithm: 'rk4'
    }
  }
}

export function allSaturnSlices(): SliceModel[] {
  // Lazy import to avoid circular dependency with sixDofVarMassEom
  const {
    buildSixDofVariableMassEom,
    buildSixDofVehicleBurnDemo,
    buildSixDofOpenLoopAscent,
    buildSixDofClosedLoopPitchRateDamp
  } = require('./sixDofVarMassEom') as typeof import('./sixDofVarMassEom')
  return [
    buildGravityBallistics(),
    buildSixDofVacuumKinematics(),
    buildSixDofVariableMassEom(),
    buildSixDofVehicleBurnDemo(),
    buildSixDofOpenLoopAscent(),
    buildSixDofClosedLoopPitchRateDamp(),
    buildEngineThrustTimer(),
    buildAtmosphereDynamicPressure(),
    buildStageEnableFreeze(),
    buildRateModulator(),
    buildChiTimeTilt(),
    buildIgmModeShell(),
    buildFccFilter(),
    buildOpenLoopAscent1D()
  ]
}

/** Convert slice to exportable model data JSON shape */
export function sliceToModelData(slice: SliceModel) {
  return {
    version: '2.2',
    metadata: {
      created: new Date().toISOString(),
      description: slice.description
    },
    sheets: slice.sheets,
    parameters: (slice.parameters || []).map(p => ({
      name: p.name,
      dataType: p.dataType || 'double',
      defaultValue: p.defaultValue ?? String(p.value ?? 0),
      signalType: p.signalType || p.dataType || 'double',
      value: p.value
    })),
    dataStores: [],
    globalSettings: slice.globalSettings
  }
}

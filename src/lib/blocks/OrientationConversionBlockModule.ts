// lib/blocks/OrientationConversionBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

/**
 * Conversion types supported by the OrientationConversion block.
 * All angles are in radians, using aerospace ZYX convention:
 * - Phi (roll): rotation about X-axis
 * - Theta (pitch): rotation about Y-axis
 * - Psi (yaw): rotation about Z-axis
 *
 * Body frame: +X forward, +Y right wing, +Z down
 * Local frame: North=+X, East=+Y, Down=+Z
 *
 * Quaternion is scalar-first: [q0, q1, q2, q3] where q0 is the scalar component
 */
export type OrientationConversionType =
  | 'euler_to_dcm'      // 3 inputs (Phi, Theta, Psi) → 1 output (3x3 DCM)
  | 'dcm_to_euler'      // 1 input (3x3 DCM) → 3 outputs (Phi, Theta, Psi)
  | 'euler_to_quat'     // 3 inputs (Phi, Theta, Psi) → 1 output (4x1 quaternion)
  | 'dcm_to_quat'       // 1 input (3x3 DCM) → 1 output (4x1 quaternion)
  | 'quat_to_euler'     // 1 input (4x1 quaternion) → 3 outputs (Phi, Theta, Psi)
  | 'quat_to_dcm'       // 1 input (4x1 quaternion) → 1 output (3x3 DCM)

export class OrientationConversionBlockModule implements IBlockModule {

  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const conversionType: OrientationConversionType = block.parameters?.conversionType || 'euler_to_dcm'

    let code = `    // Orientation Conversion block: ${block.name} (${conversionType})\n`

    switch (conversionType) {
      case 'euler_to_dcm':
        code += this.generateEulerToDCM(inputs, outputName)
        break
      case 'dcm_to_euler':
        code += this.generateDCMToEuler(inputs, outputName, block.name)
        break
      case 'euler_to_quat':
        code += this.generateEulerToQuat(inputs, outputName)
        break
      case 'dcm_to_quat':
        code += this.generateDCMToQuat(inputs, outputName)
        break
      case 'quat_to_euler':
        code += this.generateQuatToEuler(inputs, outputName, block.name)
        break
      case 'quat_to_dcm':
        code += this.generateQuatToDCM(inputs, outputName)
        break
      default:
        code += `    // Unknown conversion type: ${conversionType}\n`
    }

    return code
  }

  /**
   * Euler angles (Phi, Theta, Psi) to DCM using ZYX rotation sequence
   * DCM = R_z(Psi) * R_y(Theta) * R_x(Phi)
   */
  private generateEulerToDCM(inputs: string[], outputName: string): string {
    const phi = inputs[0] || '0.0'      // Roll
    const theta = inputs[1] || '0.0'    // Pitch
    const psi = inputs[2] || '0.0'      // Yaw

    return `    {
        double c_phi = cos(${phi});
        double s_phi = sin(${phi});
        double c_theta = cos(${theta});
        double s_theta = sin(${theta});
        double c_psi = cos(${psi});
        double s_psi = sin(${psi});

        // DCM = R_z(Psi) * R_y(Theta) * R_x(Phi)
        ${outputName}[0][0] = c_theta * c_psi;
        ${outputName}[0][1] = c_theta * s_psi;
        ${outputName}[0][2] = -s_theta;

        ${outputName}[1][0] = s_phi * s_theta * c_psi - c_phi * s_psi;
        ${outputName}[1][1] = s_phi * s_theta * s_psi + c_phi * c_psi;
        ${outputName}[1][2] = s_phi * c_theta;

        ${outputName}[2][0] = c_phi * s_theta * c_psi + s_phi * s_psi;
        ${outputName}[2][1] = c_phi * s_theta * s_psi - s_phi * c_psi;
        ${outputName}[2][2] = c_phi * c_theta;
    }
`
  }

  /**
   * DCM to Euler angles extraction
   * Handles gimbal lock at theta = ±90 degrees
   */
  private generateDCMToEuler(inputs: string[], outputName: string, blockName: string): string {
    const dcm = inputs[0] || 'dcm'
    const phiOut = `model->signals.${BlockModuleUtils.sanitizeIdentifier(blockName)}_phi`
    const thetaOut = `model->signals.${BlockModuleUtils.sanitizeIdentifier(blockName)}_theta`
    const psiOut = `model->signals.${BlockModuleUtils.sanitizeIdentifier(blockName)}_psi`

    return `    {
        // Extract Euler angles from DCM
        // Theta (pitch) from -sin(theta) = DCM[0][2]
        double sin_theta = -${dcm}[0][2];

        // Clamp to [-1, 1] to avoid numerical issues with asin
        if (sin_theta > 1.0) sin_theta = 1.0;
        if (sin_theta < -1.0) sin_theta = -1.0;

        ${thetaOut} = asin(sin_theta);

        // Check for gimbal lock (theta near ±90 degrees)
        double cos_theta = cos(${thetaOut});

        if (fabs(cos_theta) > 1.0e-10) {
            // Normal case: no gimbal lock
            ${phiOut} = atan2(${dcm}[1][2], ${dcm}[2][2]);
            ${psiOut} = atan2(${dcm}[0][1], ${dcm}[0][0]);
        } else {
            // Gimbal lock: theta = ±90 degrees
            // Set psi = 0 and compute phi from remaining elements
            ${psiOut} = 0.0;
            ${phiOut} = atan2(-${dcm}[2][1], ${dcm}[1][1]);
        }
    }
`
  }

  /**
   * Euler angles to Quaternion (scalar-first)
   * q = [q0, q1, q2, q3] where q0 is scalar
   */
  private generateEulerToQuat(inputs: string[], outputName: string): string {
    const phi = inputs[0] || '0.0'
    const theta = inputs[1] || '0.0'
    const psi = inputs[2] || '0.0'

    return `    {
        double c_phi_2 = cos(${phi} * 0.5);
        double s_phi_2 = sin(${phi} * 0.5);
        double c_theta_2 = cos(${theta} * 0.5);
        double s_theta_2 = sin(${theta} * 0.5);
        double c_psi_2 = cos(${psi} * 0.5);
        double s_psi_2 = sin(${psi} * 0.5);

        // Quaternion from Euler angles (ZYX sequence, scalar-first)
        ${outputName}[0][0] = c_phi_2 * c_theta_2 * c_psi_2 + s_phi_2 * s_theta_2 * s_psi_2;  // q0 (scalar)
        ${outputName}[1][0] = s_phi_2 * c_theta_2 * c_psi_2 - c_phi_2 * s_theta_2 * s_psi_2;  // q1
        ${outputName}[2][0] = c_phi_2 * s_theta_2 * c_psi_2 + s_phi_2 * c_theta_2 * s_psi_2;  // q2
        ${outputName}[3][0] = c_phi_2 * c_theta_2 * s_psi_2 - s_phi_2 * s_theta_2 * c_psi_2;  // q3
    }
`
  }

  /**
   * DCM to Quaternion using Shepperd's method
   * Numerically stable for all rotations
   */
  private generateDCMToQuat(inputs: string[], outputName: string): string {
    const dcm = inputs[0] || 'dcm'

    return `    {
        // DCM to Quaternion using Shepperd's method
        double trace = ${dcm}[0][0] + ${dcm}[1][1] + ${dcm}[2][2];
        double q0, q1, q2, q3;

        if (trace > 0.0) {
            double s = 0.5 / sqrt(trace + 1.0);
            q0 = 0.25 / s;
            q1 = (${dcm}[1][2] - ${dcm}[2][1]) * s;
            q2 = (${dcm}[2][0] - ${dcm}[0][2]) * s;
            q3 = (${dcm}[0][1] - ${dcm}[1][0]) * s;
        } else if (${dcm}[0][0] > ${dcm}[1][1] && ${dcm}[0][0] > ${dcm}[2][2]) {
            double s = 2.0 * sqrt(1.0 + ${dcm}[0][0] - ${dcm}[1][1] - ${dcm}[2][2]);
            q0 = (${dcm}[1][2] - ${dcm}[2][1]) / s;
            q1 = 0.25 * s;
            q2 = (${dcm}[1][0] + ${dcm}[0][1]) / s;
            q3 = (${dcm}[2][0] + ${dcm}[0][2]) / s;
        } else if (${dcm}[1][1] > ${dcm}[2][2]) {
            double s = 2.0 * sqrt(1.0 + ${dcm}[1][1] - ${dcm}[0][0] - ${dcm}[2][2]);
            q0 = (${dcm}[2][0] - ${dcm}[0][2]) / s;
            q1 = (${dcm}[1][0] + ${dcm}[0][1]) / s;
            q2 = 0.25 * s;
            q3 = (${dcm}[2][1] + ${dcm}[1][2]) / s;
        } else {
            double s = 2.0 * sqrt(1.0 + ${dcm}[2][2] - ${dcm}[0][0] - ${dcm}[1][1]);
            q0 = (${dcm}[0][1] - ${dcm}[1][0]) / s;
            q1 = (${dcm}[2][0] + ${dcm}[0][2]) / s;
            q2 = (${dcm}[2][1] + ${dcm}[1][2]) / s;
            q3 = 0.25 * s;
        }

        ${outputName}[0][0] = q0;
        ${outputName}[1][0] = q1;
        ${outputName}[2][0] = q2;
        ${outputName}[3][0] = q3;
    }
`
  }

  /**
   * Quaternion to Euler angles
   */
  private generateQuatToEuler(inputs: string[], outputName: string, blockName: string): string {
    const quat = inputs[0] || 'quat'
    const phiOut = `model->signals.${BlockModuleUtils.sanitizeIdentifier(blockName)}_phi`
    const thetaOut = `model->signals.${BlockModuleUtils.sanitizeIdentifier(blockName)}_theta`
    const psiOut = `model->signals.${BlockModuleUtils.sanitizeIdentifier(blockName)}_psi`

    return `    {
        double q0 = ${quat}[0][0];  // Scalar
        double q1 = ${quat}[1][0];
        double q2 = ${quat}[2][0];
        double q3 = ${quat}[3][0];

        // Phi (roll)
        double sinr_cosp = 2.0 * (q0 * q1 + q2 * q3);
        double cosr_cosp = 1.0 - 2.0 * (q1 * q1 + q2 * q2);
        ${phiOut} = atan2(sinr_cosp, cosr_cosp);

        // Theta (pitch)
        double sinp = 2.0 * (q0 * q2 - q3 * q1);
        if (fabs(sinp) >= 1.0) {
            ${thetaOut} = copysign(M_PI / 2.0, sinp);  // Gimbal lock
        } else {
            ${thetaOut} = asin(sinp);
        }

        // Psi (yaw)
        double siny_cosp = 2.0 * (q0 * q3 + q1 * q2);
        double cosy_cosp = 1.0 - 2.0 * (q2 * q2 + q3 * q3);
        ${psiOut} = atan2(siny_cosp, cosy_cosp);
    }
`
  }

  /**
   * Quaternion to DCM
   */
  private generateQuatToDCM(inputs: string[], outputName: string): string {
    const quat = inputs[0] || 'quat'

    return `    {
        double q0 = ${quat}[0][0];  // Scalar
        double q1 = ${quat}[1][0];
        double q2 = ${quat}[2][0];
        double q3 = ${quat}[3][0];

        double q0_sq = q0 * q0;
        double q1_sq = q1 * q1;
        double q2_sq = q2 * q2;
        double q3_sq = q3 * q3;

        ${outputName}[0][0] = q0_sq + q1_sq - q2_sq - q3_sq;
        ${outputName}[0][1] = 2.0 * (q1 * q2 + q0 * q3);
        ${outputName}[0][2] = 2.0 * (q1 * q3 - q0 * q2);

        ${outputName}[1][0] = 2.0 * (q1 * q2 - q0 * q3);
        ${outputName}[1][1] = q0_sq - q1_sq + q2_sq - q3_sq;
        ${outputName}[1][2] = 2.0 * (q2 * q3 + q0 * q1);

        ${outputName}[2][0] = 2.0 * (q1 * q3 + q0 * q2);
        ${outputName}[2][1] = 2.0 * (q2 * q3 - q0 * q1);
        ${outputName}[2][2] = q0_sq - q1_sq - q2_sq + q3_sq;
    }
`
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    const conversionType: OrientationConversionType = block.parameters?.conversionType || 'euler_to_dcm'

    switch (conversionType) {
      case 'euler_to_dcm':
      case 'quat_to_dcm':
        return 'double[3][3]'  // 3x3 DCM matrix
      case 'euler_to_quat':
      case 'dcm_to_quat':
        return 'double[4][1]'  // 4x1 quaternion column vector
      case 'dcm_to_euler':
      case 'quat_to_euler':
        return 'double'  // Returns multiple separate outputs
      default:
        return 'double'
    }
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    const conversionType: OrientationConversionType = block.parameters?.conversionType || 'euler_to_dcm'
    const baseName = BlockModuleUtils.sanitizeIdentifier(block.name)

    switch (conversionType) {
      case 'euler_to_dcm':
      case 'quat_to_dcm':
        return `    double ${baseName}[3][3];`
      case 'euler_to_quat':
      case 'dcm_to_quat':
        return `    double ${baseName}[4][1];`
      case 'dcm_to_euler':
      case 'quat_to_euler':
        // Three separate output signals for Euler angles
        return `    double ${baseName}_phi;\n    double ${baseName}_theta;\n    double ${baseName}_psi;`
      default:
        return BlockModuleUtils.generateStructMember(block.name, outputType)
    }
  }

  requiresState(block: BlockData): boolean {
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    return []
  }

  generateInitialization(block: BlockData): string {
    return ''
  }

  private simEulerToDCM(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[]
  ): void {
    const phi = typeof inputs[0] === 'number' ? inputs[0] : 0
    const theta = typeof inputs[1] === 'number' ? inputs[1] : 0
    const psi = typeof inputs[2] === 'number' ? inputs[2] : 0

    const c_phi = Math.cos(phi)
    const s_phi = Math.sin(phi)
    const c_theta = Math.cos(theta)
    const s_theta = Math.sin(theta)
    const c_psi = Math.cos(psi)
    const s_psi = Math.sin(psi)

    const dcm: number[][] = [
      [c_theta * c_psi, c_theta * s_psi, -s_theta],
      [s_phi * s_theta * c_psi - c_phi * s_psi, s_phi * s_theta * s_psi + c_phi * c_psi, s_phi * c_theta],
      [c_phi * s_theta * c_psi + s_phi * s_psi, c_phi * s_theta * s_psi - s_phi * c_psi, c_phi * c_theta]
    ]

    blockState.outputs[0] = dcm
  }

  private simDCMToEuler(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[]
  ): void {
    const dcm = inputs[0] as number[][] | undefined

    if (!dcm || !Array.isArray(dcm) || dcm.length !== 3) {
      blockState.outputs[0] = 0
      blockState.outputs[1] = 0
      blockState.outputs[2] = 0
      return
    }

    // Extract theta from -sin(theta) = DCM[0][2]
    let sin_theta = -dcm[0][2]
    sin_theta = Math.max(-1, Math.min(1, sin_theta))
    const theta = Math.asin(sin_theta)
    const cos_theta = Math.cos(theta)

    let phi: number
    let psi: number

    if (Math.abs(cos_theta) > 1.0e-10) {
      // Normal case
      phi = Math.atan2(dcm[1][2], dcm[2][2])
      psi = Math.atan2(dcm[0][1], dcm[0][0])
    } else {
      // Gimbal lock
      psi = 0
      phi = Math.atan2(-dcm[2][1], dcm[1][1])
    }

    blockState.outputs[0] = phi
    blockState.outputs[1] = theta
    blockState.outputs[2] = psi
  }

  private simEulerToQuat(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[]
  ): void {
    const phi = typeof inputs[0] === 'number' ? inputs[0] : 0
    const theta = typeof inputs[1] === 'number' ? inputs[1] : 0
    const psi = typeof inputs[2] === 'number' ? inputs[2] : 0

    const c_phi_2 = Math.cos(phi * 0.5)
    const s_phi_2 = Math.sin(phi * 0.5)
    const c_theta_2 = Math.cos(theta * 0.5)
    const s_theta_2 = Math.sin(theta * 0.5)
    const c_psi_2 = Math.cos(psi * 0.5)
    const s_psi_2 = Math.sin(psi * 0.5)

    const quat: number[][] = [
      [c_phi_2 * c_theta_2 * c_psi_2 + s_phi_2 * s_theta_2 * s_psi_2],  // q0
      [s_phi_2 * c_theta_2 * c_psi_2 - c_phi_2 * s_theta_2 * s_psi_2],  // q1
      [c_phi_2 * s_theta_2 * c_psi_2 + s_phi_2 * c_theta_2 * s_psi_2],  // q2
      [c_phi_2 * c_theta_2 * s_psi_2 - s_phi_2 * s_theta_2 * c_psi_2]   // q3
    ]

    blockState.outputs[0] = quat
  }

  private simDCMToQuat(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[]
  ): void {
    const dcm = inputs[0] as number[][] | undefined

    if (!dcm || !Array.isArray(dcm) || dcm.length !== 3) {
      blockState.outputs[0] = [[1], [0], [0], [0]]
      return
    }

    const trace = dcm[0][0] + dcm[1][1] + dcm[2][2]
    let q0: number, q1: number, q2: number, q3: number

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1)
      q0 = 0.25 / s
      q1 = (dcm[1][2] - dcm[2][1]) * s
      q2 = (dcm[2][0] - dcm[0][2]) * s
      q3 = (dcm[0][1] - dcm[1][0]) * s
    } else if (dcm[0][0] > dcm[1][1] && dcm[0][0] > dcm[2][2]) {
      const s = 2 * Math.sqrt(1 + dcm[0][0] - dcm[1][1] - dcm[2][2])
      q0 = (dcm[1][2] - dcm[2][1]) / s
      q1 = 0.25 * s
      q2 = (dcm[1][0] + dcm[0][1]) / s
      q3 = (dcm[2][0] + dcm[0][2]) / s
    } else if (dcm[1][1] > dcm[2][2]) {
      const s = 2 * Math.sqrt(1 + dcm[1][1] - dcm[0][0] - dcm[2][2])
      q0 = (dcm[2][0] - dcm[0][2]) / s
      q1 = (dcm[1][0] + dcm[0][1]) / s
      q2 = 0.25 * s
      q3 = (dcm[2][1] + dcm[1][2]) / s
    } else {
      const s = 2 * Math.sqrt(1 + dcm[2][2] - dcm[0][0] - dcm[1][1])
      q0 = (dcm[0][1] - dcm[1][0]) / s
      q1 = (dcm[2][0] + dcm[0][2]) / s
      q2 = (dcm[2][1] + dcm[1][2]) / s
      q3 = 0.25 * s
    }

    blockState.outputs[0] = [[q0], [q1], [q2], [q3]]
  }

  private simQuatToEuler(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[]
  ): void {
    const quat = inputs[0] as number[][] | undefined

    if (!quat || !Array.isArray(quat) || quat.length !== 4) {
      blockState.outputs[0] = 0
      blockState.outputs[1] = 0
      blockState.outputs[2] = 0
      return
    }

    const q0 = quat[0][0]
    const q1 = quat[1][0]
    const q2 = quat[2][0]
    const q3 = quat[3][0]

    // Phi (roll)
    const sinr_cosp = 2 * (q0 * q1 + q2 * q3)
    const cosr_cosp = 1 - 2 * (q1 * q1 + q2 * q2)
    const phi = Math.atan2(sinr_cosp, cosr_cosp)

    // Theta (pitch)
    let sinp = 2 * (q0 * q2 - q3 * q1)
    sinp = Math.max(-1, Math.min(1, sinp))
    const theta = Math.asin(sinp)

    // Psi (yaw)
    const siny_cosp = 2 * (q0 * q3 + q1 * q2)
    const cosy_cosp = 1 - 2 * (q2 * q2 + q3 * q3)
    const psi = Math.atan2(siny_cosp, cosy_cosp)

    blockState.outputs[0] = phi
    blockState.outputs[1] = theta
    blockState.outputs[2] = psi
  }

  private simQuatToDCM(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[]
  ): void {
    const quat = inputs[0] as number[][] | undefined

    if (!quat || !Array.isArray(quat) || quat.length !== 4) {
      // Return identity matrix
      blockState.outputs[0] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
      return
    }

    const q0 = quat[0][0]
    const q1 = quat[1][0]
    const q2 = quat[2][0]
    const q3 = quat[3][0]

    const q0_sq = q0 * q0
    const q1_sq = q1 * q1
    const q2_sq = q2 * q2
    const q3_sq = q3 * q3

    const dcm: number[][] = [
      [q0_sq + q1_sq - q2_sq - q3_sq, 2 * (q1 * q2 + q0 * q3), 2 * (q1 * q3 - q0 * q2)],
      [2 * (q1 * q2 - q0 * q3), q0_sq - q1_sq + q2_sq - q3_sq, 2 * (q2 * q3 + q0 * q1)],
      [2 * (q1 * q3 + q0 * q2), 2 * (q2 * q3 - q0 * q1), q0_sq - q1_sq - q2_sq + q3_sq]
    ]

    blockState.outputs[0] = dcm
  }

  getInputPortCount(block: BlockData): number {
    const conversionType: OrientationConversionType = block.parameters?.conversionType || 'euler_to_dcm'

    switch (conversionType) {
      case 'euler_to_dcm':
      case 'euler_to_quat':
        return 3  // Phi, Theta, Psi
      case 'dcm_to_euler':
      case 'dcm_to_quat':
        return 1  // DCM matrix
      case 'quat_to_euler':
      case 'quat_to_dcm':
        return 1  // Quaternion
      default:
        return 1
    }
  }

  getOutputPortCount(block: BlockData): number {
    const conversionType: OrientationConversionType = block.parameters?.conversionType || 'euler_to_dcm'

    switch (conversionType) {
      case 'euler_to_dcm':
      case 'quat_to_dcm':
        return 1  // DCM matrix
      case 'euler_to_quat':
      case 'dcm_to_quat':
        return 1  // Quaternion
      case 'dcm_to_euler':
      case 'quat_to_euler':
        return 3  // Phi, Theta, Psi
      default:
        return 1
    }
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    const conversionType: OrientationConversionType = block.parameters?.conversionType || 'euler_to_dcm'

    switch (conversionType) {
      case 'euler_to_dcm':
      case 'euler_to_quat':
        return ['Phi_rad', 'Theta_rad', 'Psi_rad']
      case 'dcm_to_euler':
      case 'dcm_to_quat':
        return ['DCM']
      case 'quat_to_euler':
      case 'quat_to_dcm':
        return ['q']
      default:
        return undefined
    }
  }

  getOutputPortLabels(block: BlockData): string[] | undefined {
    const conversionType: OrientationConversionType = block.parameters?.conversionType || 'euler_to_dcm'

    switch (conversionType) {
      case 'euler_to_dcm':
      case 'quat_to_dcm':
        return ['DCM']
      case 'euler_to_quat':
      case 'dcm_to_quat':
        return ['q']
      case 'dcm_to_euler':
      case 'quat_to_euler':
        return ['Phi_rad', 'Theta_rad', 'Psi_rad']
      default:
        return undefined
    }
  }
}

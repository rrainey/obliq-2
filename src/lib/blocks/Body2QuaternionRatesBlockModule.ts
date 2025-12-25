// lib/blocks/Body2QuaternionRatesBlockModule.ts
//
// Converts body angular rates (P, Q, R) to quaternion rates given current quaternion.
// Implements the quaternion kinematic equation:
//
// [q̇₀]       [0   -P   -Q   -R] [q₀]
// [q̇₁] = ½ * [P    0    R   -Q] [q₁]
// [q̇₂]       [Q   -R    0    P] [q₂]
// [q̇₃]       [R    Q   -P    0] [q₃]
//
// Quaternion is scalar-first: q = [q₀, q₁, q₂, q₃] where q₀ is the scalar component
// Body rates: P (roll rate), Q (pitch rate), R (yaw rate) in rad/sec

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class Body2QuaternionRatesBlockModule implements IBlockModule {

  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`

    // inputs[0] = quaternion q (4x1 column vector)
    // inputs[1] = P (roll rate, rad/sec)
    // inputs[2] = Q (pitch rate, rad/sec)
    // inputs[3] = R (yaw rate, rad/sec)
    const q = inputs[0] || 'q'
    const P = inputs[1] || '0.0'
    const Q = inputs[2] || '0.0'
    const R = inputs[3] || '0.0'

    let code = `    // Body2QuaternionRates block: ${block.name}\n`
    code += `    // Quaternion kinematic equation: q_dot = 0.5 * Omega * q\n`
    code += `    {\n`
    code += `        double q0 = ${q}[0][0];  // Scalar component\n`
    code += `        double q1 = ${q}[1][0];\n`
    code += `        double q2 = ${q}[2][0];\n`
    code += `        double q3 = ${q}[3][0];\n`
    code += `        double p = ${P};\n`
    code += `        double qr = ${Q};\n`  // Use 'qr' to avoid conflict with 'q'
    code += `        double r = ${R};\n`
    code += `\n`
    code += `        // q_dot = 0.5 * [0, -P, -Q, -R; P, 0, R, -Q; Q, -R, 0, P; R, Q, -P, 0] * q\n`
    code += `        ${outputName}[0][0] = 0.5 * (       - p*q1 - qr*q2 - r*q3);\n`
    code += `        ${outputName}[1][0] = 0.5 * ( p*q0         + r*q2  - qr*q3);\n`
    code += `        ${outputName}[2][0] = 0.5 * (qr*q0  - r*q1         + p*q3);\n`
    code += `        ${outputName}[3][0] = 0.5 * ( r*q0 + qr*q1  - p*q2       );\n`
    code += `    }\n`

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Output is always a 4x1 quaternion rate vector
    return 'double[4][1]'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    const baseName = BlockModuleUtils.sanitizeIdentifier(block.name)
    return `    double ${baseName}[4][1];`
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

  getInputPortCount(block: BlockData): number {
    return 4  // q, P, Q, R
  }

  getOutputPortCount(block: BlockData): number {
    return 1  // q_dot
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    return ['q', 'P', 'Q', 'R']
  }

  getOutputPortLabels(block: BlockData): string[] | undefined {
    return ['q̇']
  }
}

// lib/blocks/MuxBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class MuxBlockModule implements IBlockModule {
  generateComputation(
    block: BlockData,
    inputs: string[],
    inputTypes?: string[]
  ): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const rows = block.parameters?.rows || 2
    const cols = block.parameters?.cols || 2
    const expectedInputs = rows * cols
    const outputType = this.getOutputType(block, inputTypes || [])
    const typeInfo = BlockModuleUtils.parseType(outputType)

    // Concatenate vector inputs (e.g. aerolib SinCos sin[3]+cos[3] → [6])
    const concatSizes = (inputTypes || []).map(t => {
      const p = BlockModuleUtils.parseType(t || 'double')
      if (p.isArray && p.arraySize) return p.arraySize
      if (p.isMatrix && p.rows && (p.cols === 1 || p.cols === undefined)) return p.rows
      return 1
    })
    const concatTotal = concatSizes.reduce((a, b) => a + b, 0)
    const concatOk =
      inputs.length >= 2 &&
      inputs.length <= 24 &&
      concatSizes.length === inputs.length &&
      concatSizes.some(s => s > 1) &&
      concatSizes.every(s => s >= 1 && s <= 16) &&
      typeInfo.isArray &&
      typeInfo.arraySize === concatTotal &&
      concatTotal <= 64
    if (concatOk) {
      let code = `    // Mux block: ${block.name} (concatenate vectors → ${typeInfo.arraySize})\n`
      let offset = 0
      for (let k = 0; k < inputs.length; k++) {
        const n = concatSizes[k]
        const p = BlockModuleUtils.parseType((inputTypes || [])[k] || 'double')
        const colMat = !!(p.isMatrix && p.cols === 1 && p.rows)
        if (n > 1) {
          for (let i = 0; i < n; i++) {
            const rhs = colMat ? `${inputs[k]}[${i}][0]` : `${inputs[k]}[${i}]`
            code += `    ${outputName}[${offset + i}] = ${rhs};\n`
          }
        } else {
          code += `    ${outputName}[${offset}] = ${inputs[k]};\n`
        }
        offset += n
      }
      return code
    }

    // Non-concat path: if a "scalar" port is actually a vector, take [0]
    // (avoids assigning double* into double mux slots).
    
    let code = `    // Mux block: ${block.name} (${rows}×${cols})\n`
    
    // Special case: 1×1 mux is a pass-through
    if (rows === 1 && cols === 1 && !typeInfo.isMatrix && !typeInfo.isArray) {
      if (inputs.length > 0) {
        code += `    ${outputName} = ${inputs[0]};\n`
      } else {
        code += `    ${outputName} = 0.0;\n`
      }
      return code
    }

    // Prefer declared matrix shape (e.g. double[4][1] quaternion column)
    // over treating n×1 / 1×n as a 1D vector — C type must match indexing.
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      const columnMajor = block.parameters?.fillOrder === 'column'
      code += columnMajor
        ? `    // Matrix output (column-major input order)\n`
        : `    // Matrix output (row-major order)\n`
      for (let i = 0; i < typeInfo.rows; i++) {
        for (let j = 0; j < typeInfo.cols; j++) {
          const inputIndex = columnMajor
            ? j * typeInfo.rows + i
            : i * typeInfo.cols + j
          if (inputIndex < inputs.length) {
            code += `    ${outputName}[${i}][${j}] = ${inputs[inputIndex]};\n`
          } else {
            code += `    ${outputName}[${i}][${j}] = 0.0;\n`
          }
        }
      }
      return code
    }
    
    // Vector output (1D array type, or 1×n / n×1 without matrix declaration)
    if (typeInfo.isArray && typeInfo.arraySize) {
      const size = typeInfo.arraySize
      code += `    // Vector output\n`
      for (let i = 0; i < size; i++) {
        if (i < inputs.length) {
          const t = (inputTypes || [])[i] || 'double'
          const p = BlockModuleUtils.parseType(t)
          let rhs = inputs[i]
          if (p.isMatrix && p.rows && p.cols) {
            // Column quat [4][1] or DCM — take (0,0) for single mux slot
            rhs = `${inputs[i]}[0][0]`
          } else if (p.isArray && p.arraySize) {
            rhs = `${inputs[i]}[0]`
          } else if (/q0_q1_q2_q3/i.test(inputs[i])) {
            rhs = `${inputs[i]}[0][0]`
          }
          // Do not subscript scalars (Normalization, Dry, etc.) even if type map is wrong
          // bool / scalar: leave as-is (never subscript)
          code += `    ${outputName}[${i}] = ${rhs};\n`
        } else {
          code += `    ${outputName}[${i}] = 0.0;\n`
        }
      }
      return code
    }

    if (rows === 1 || cols === 1) {
      const size = Math.max(rows, cols)
      code += `    // Vector output\n`
      for (let i = 0; i < size; i++) {
        if (i < inputs.length) {
          code += `    ${outputName}[${i}] = ${inputs[i]};\n`
        } else {
          code += `    ${outputName}[${i}] = 0.0;\n`
        }
      }
    } else {
      // Matrix output
      const columnMajor = block.parameters?.fillOrder === 'column'
      code += columnMajor
        ? `    // Matrix output (column-major input order)\n`
        : `    // Matrix output (row-major order)\n`
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const inputIndex = columnMajor ? j * rows + i : i * cols + j
          if (inputIndex < inputs.length) {
            code += `    ${outputName}[${i}][${j}] = ${inputs[inputIndex]};\n`
          } else {
            code += `    ${outputName}[${i}][${j}] = 0.0;\n`
          }
        }
      }
    }
    
    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Vector-input mux → concatenate widths (SinCos [3]+[3]→[6], or
    // telemetry mux of mixed scalars/vectors). Cap total to avoid TypePropagator
    // feedback explosions.
    const declared = block.parameters?.outputType as string | undefined
    if (
      inputTypes &&
      inputTypes.length >= 2 &&
      inputTypes.length <= 24 &&
      !String(declared || '').includes('][')
    ) {
      const sizes = inputTypes.map(t => {
        const p = BlockModuleUtils.parseType(t || 'double')
        if (p.isArray && p.arraySize && p.arraySize <= 16) return p.arraySize
        if (
          p.isMatrix &&
          p.rows &&
          p.rows <= 16 &&
          (p.cols === 1 || p.cols === undefined)
        ) {
          return p.rows
        }
        // Column quat double[4][1]
        if (p.isMatrix && p.rows === 4 && p.cols === 1) return 4
        return 1
      })
      const total = sizes.reduce((a, b) => a + b, 0)
      // Simulink Mux expands vector inputs (e.g. ω[3]+q[4]+gain → 8).
      // Allow unequal small widths; reject large filter/state vectors (size>4).
      if (
        sizes.some(s => s > 1) &&
        sizes.every(s => s >= 1 && s <= 4) &&
        total <= 16 &&
        inputTypes.length <= 8
      ) {
        return `double[${total}]`
      }
    }

    // If outputType is already computed and stored, use it directly
    if (declared) {
      return declared
    }

    // Fallback: derive from parameters
    const rows = block.parameters?.rows || 2
    const cols = block.parameters?.cols || 2
    const baseType = block.parameters?.baseType || 'double'

    // Special case: 1×1 mux outputs a scalar
    if (rows === 1 && cols === 1) {
      return baseType
    }

    // Vector output (either 1×n or n×1)
    if (rows === 1 || cols === 1) {
      const size = Math.max(rows, cols)
      return `${baseType}[${size}]`
    }

    // Matrix output
    return `${baseType}[${rows}][${cols}]`
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Mux blocks always need signal storage
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Mux blocks don't need state variables
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // No state needed
    return []
  }

  generateInitialization(block: BlockData): string {
    // No initialization needed
    return ''
  }

  getInputPortCount(block: BlockData): number {
    // Mux blocks have dynamic input count based on dimensions
    const rows = block.parameters?.rows || 2
    const cols = block.parameters?.cols || 2
    return rows * cols
  }

  getOutputPortCount(block: BlockData): number {
    // Mux blocks always have exactly 1 output
    return 1
  }

  // Could provide custom labels but default numbering is fine
  getInputPortLabels?(block: BlockData): string[] | undefined {
    return undefined
  }

  getOutputPortLabels?(block: BlockData): string[] | undefined {
    return undefined
  }
}
// lib/blocks/Lookup2DBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

function resolve2DAxis(
  blockName: string,
  role: 'input1' | 'input2',
  inline: number[] | undefined,
  paramName: string | undefined
): { decl: string; arr: string; sizeExpr: string; constSize?: number } {
  if (paramName) {
    const p = BlockModuleUtils.sanitizeIdentifier(paramName)
    return {
      decl: `        // ${role} breakpoints from model parameter ${p}\n`,
      arr: p,
      sizeExpr: `${p}_SIZE`
    }
  }
  const values = inline && inline.length ? inline : [0, 1]
  const local = `${blockName}_${role}`
  return {
    decl:
      `        const double ${local}[${values.length}] = {` +
      values.join(', ') +
      `};\n`,
    arr: local,
    sizeExpr: String(values.length),
    constSize: values.length
  }
}

function resolve2DTable(
  blockName: string,
  inline: number[][] | undefined,
  paramName: string | undefined,
  rowsExpr: string,
  colsExpr: string,
  constRows?: number,
  constCols?: number
): { decl: string; arr: string; rowsExpr: string; colsExpr: string } {
  if (paramName) {
    const p = BlockModuleUtils.sanitizeIdentifier(paramName)
    return {
      decl: `        // Output table from model parameter ${p}\n`,
      arr: p,
      rowsExpr: `${p}_ROWS`,
      colsExpr: `${p}_COLS`
    }
  }
  const table = inline && inline.length ? inline : [[0, 0], [0, 1]]
  const rows = constRows ?? table.length
  const cols = constCols ?? (table[0]?.length || 2)
  let decl = `        const double ${blockName}_table[${rows}][${cols}] = {\n`
  for (let i = 0; i < rows; i++) {
    decl += `            {`
    const row = table[i] || []
    const rowValues: (number | string)[] = []
    for (let j = 0; j < cols; j++) {
      rowValues.push(row[j] || 0)
    }
    decl += rowValues.join(', ')
    decl += `}`
    if (i < rows - 1) decl += ','
    decl += '\n'
  }
  decl += `        };\n`
  return {
    decl,
    arr: `${blockName}_table`,
    rowsExpr: String(rows),
    colsExpr: String(cols)
  }
}

export class Lookup2DBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const blockName = BlockModuleUtils.sanitizeIdentifier(block.name)

    if (inputs.length < 2) {
      return `    ${outputName} = 0.0; // Insufficient inputs\n`
    }

    const input1Expr = inputs[0]
    const input2Expr = inputs[1]
    const extrapolation = block.parameters?.extrapolation || 'clamp'

    const axis1 = resolve2DAxis(
      blockName,
      'input1',
      block.parameters?.input1Values,
      block.parameters?.input1ValuesParam
    )
    const axis2 = resolve2DAxis(
      blockName,
      'input2',
      block.parameters?.input2Values,
      block.parameters?.input2ValuesParam
    )
    const table = resolve2DTable(
      blockName,
      block.parameters?.outputTable,
      block.parameters?.outputTableParam,
      axis1.sizeExpr,
      axis2.sizeExpr,
      axis1.constSize,
      axis2.constSize
    )

    // Prefer table dimension macros when table is a model parameter
    const rowsExpr = block.parameters?.outputTableParam ? table.rowsExpr : axis1.sizeExpr
    const colsExpr = block.parameters?.outputTableParam ? table.colsExpr : axis2.sizeExpr

    let code = `    // 2D Lookup block: ${block.name}\n`
    code += `    {\n`
    code += `        double input1 = ${input1Expr};\n`
    code += `        double input2 = ${input2Expr};\n`
    code += `        double output = 0.0;\n`
    code += `        \n`
    code += `        // Lookup table dimensions / breakpoints\n`
    code += axis1.decl
    code += axis2.decl
    code += table.decl
    code += `        const int ${blockName}_rows = ${rowsExpr};\n`
    code += `        const int ${blockName}_cols = ${colsExpr};\n`
    code += `        \n`

    const a1 = axis1.arr
    const a2 = axis2.arr
    const tbl = table.arr
    const rows = `${blockName}_rows`
    const cols = `${blockName}_cols`

    // Find indices and interpolation factors
    code += `        // Find indices and interpolation factors\n`
    code += `        int i0 = 0, i1 = 0;\n`
    code += `        int j0 = 0, j1 = 0;\n`
    code += `        double t1 = 0.0, t2 = 0.0;\n`
    code += `        \n`

    // Find input1 indices
    code += `        // Find row indices for input1\n`
    code += `        if (input1 <= ${a1}[0]) {\n`
    code += `            i0 = i1 = 0;\n`
    code += `            t1 = 0.0;\n`
    if (extrapolation === 'extrapolate') {
      code += `            if (${rows} > 1 && ${a1}[1] != ${a1}[0]) {\n`
      code += `                t1 = (input1 - ${a1}[0]) / (${a1}[1] - ${a1}[0]);\n`
      code += `                i1 = 1;\n`
      code += `            }\n`
    }
    code += `        } else if (input1 >= ${a1}[${rows} - 1]) {\n`
    code += `            i0 = i1 = ${rows} - 1;\n`
    code += `            t1 = 0.0;\n`
    if (extrapolation === 'extrapolate') {
      code += `            if (${rows} > 1 && ${a1}[${rows} - 1] != ${a1}[${rows} - 2]) {\n`
      code += `                i0 = ${rows} - 2;\n`
      code += `                t1 = (input1 - ${a1}[${rows} - 2]) / (${a1}[${rows} - 1] - ${a1}[${rows} - 2]);\n`
      code += `            }\n`
    }
    code += `        } else {\n`
    code += `            for (int i = 0; i < ${rows} - 1; i++) {\n`
    code += `                if (input1 >= ${a1}[i] && input1 <= ${a1}[i + 1]) {\n`
    code += `                    i0 = i;\n`
    code += `                    i1 = i + 1;\n`
    code += `                    if (${a1}[i1] != ${a1}[i0]) {\n`
    code += `                        t1 = (input1 - ${a1}[i0]) / (${a1}[i1] - ${a1}[i0]);\n`
    code += `                    }\n`
    code += `                    break;\n`
    code += `                }\n`
    code += `            }\n`
    code += `        }\n`
    code += `        \n`

    // Find input2 indices
    code += `        // Find column indices for input2\n`
    code += `        if (input2 <= ${a2}[0]) {\n`
    code += `            j0 = j1 = 0;\n`
    code += `            t2 = 0.0;\n`
    if (extrapolation === 'extrapolate') {
      code += `            if (${cols} > 1 && ${a2}[1] != ${a2}[0]) {\n`
      code += `                t2 = (input2 - ${a2}[0]) / (${a2}[1] - ${a2}[0]);\n`
      code += `                j1 = 1;\n`
      code += `            }\n`
    }
    code += `        } else if (input2 >= ${a2}[${cols} - 1]) {\n`
    code += `            j0 = j1 = ${cols} - 1;\n`
    code += `            t2 = 0.0;\n`
    if (extrapolation === 'extrapolate') {
      code += `            if (${cols} > 1 && ${a2}[${cols} - 1] != ${a2}[${cols} - 2]) {\n`
      code += `                j0 = ${cols} - 2;\n`
      code += `                t2 = (input2 - ${a2}[${cols} - 2]) / (${a2}[${cols} - 1] - ${a2}[${cols} - 2]);\n`
      code += `            }\n`
    }
    code += `        } else {\n`
    code += `            for (int j = 0; j < ${cols} - 1; j++) {\n`
    code += `                if (input2 >= ${a2}[j] && input2 <= ${a2}[j + 1]) {\n`
    code += `                    j0 = j;\n`
    code += `                    j1 = j + 1;\n`
    code += `                    if (${a2}[j1] != ${a2}[j0]) {\n`
    code += `                        t2 = (input2 - ${a2}[j0]) / (${a2}[j1] - ${a2}[j0]);\n`
    code += `                    }\n`
    code += `                    break;\n`
    code += `                }\n`
    code += `            }\n`
    code += `        }\n`
    code += `        \n`

    // Bilinear interpolation
    code += `        // Bilinear interpolation\n`
    code += `        double v00 = ${tbl}[i0][j0];\n`
    code += `        double v01 = ${tbl}[i0][j1];\n`
    code += `        double v10 = ${tbl}[i1][j0];\n`
    code += `        double v11 = ${tbl}[i1][j1];\n`
    code += `        \n`
    code += `        double v0 = v00 + t2 * (v01 - v00);\n`
    code += `        double v1 = v10 + t2 * (v11 - v10);\n`
    code += `        output = v0 + t1 * (v1 - v0);\n`
    code += `        \n`
    code += `        ${outputName} = output;\n`
    code += `    }\n`

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    if (inputTypes.length === 0) {
      return 'double'
    }
    const baseType = BlockModuleUtils.parseType(inputTypes[0]).baseType
    return baseType
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(_block: BlockData): boolean {
    return false
  }

  generateStateStructMembers(_block: BlockData, _outputType: string): string[] {
    return []
  }

  generateInitialization(_block: BlockData): string {
    return ''
  }

  getInputPortCount(_block: BlockData): number {
    return 2
  }

  getOutputPortCount(_block: BlockData): number {
    return 1
  }
}

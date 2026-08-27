// lib/blocks/IntegratorBlockModule.ts
//
// Integrator is mathematically equivalent to a 1/s transfer function.
// We use the same _states[] pattern as TransferFunction for code reuse.
// State order is 1 (single state variable per element).
//
// Port model:
//   Data ports (left edge, index >= 0):
//     [0] Derivative  (always)
//     [1] x(0)        (when showInitPort) — external initial condition
//   Control ports (visual placement only, negative indices):
//     [-1] Enable     (top, when showEnableInput)
//     [-2] Reset      (bottom, when showResetInput) — rising edge
//
// Codegen input array (built by AlgebraicEvaluator):
//   [0] derivative
//   [1] x(0) if showInitPort
//   [last] reset expression if showResetInput (appended after data ports)

import { BlockData } from '@/components/BlockNode'
import { BlockState, SimulationState } from '@/lib/simulationTypes'
import { IBlockModule, BlockModuleUtils, CodeGenContext } from './BlockModule'

export class IntegratorBlockModule implements IBlockModule {
  /**
   * Generate computation code - outputs current state value only.
   * State integration is handled by StateIntegrator (Euler/RK4).
   * Also handles reset logic which affects state but not integration method.
   */
  generateComputation(
    block: BlockData,
    inputs: string[],
    inputTypes?: string[],
    context?: CodeGenContext
  ): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    const intName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const {
      showInitPort = false,
      showResetInput = false,
      useLimits = false,
      upperLimit = Infinity,
      lowerLimit = -Infinity,
      initialValue = 0
    } = block.parameters || {}

    let code = `    // Integrator block: ${block.name}\n`

    if (inputs.length === 0) {
      code += `    ${outputName} = 0.0; // No input\n`
      return code
    }

    const outputType = this.getOutputType(block, inputTypes || [])
    const typeInfo = BlockModuleUtils.parseType(outputType)

    // Layout of inputs[] from AlgebraicEvaluator:
    //   [0] derivative
    //   [1] x(0) if showInitPort
    //   [last] reset if showResetInput
    let nextIndex = 1
    let initExpr: string | undefined
    if (showInitPort) {
      initExpr = inputs[nextIndex]
      nextIndex++
    }
    let resetExpr: string | undefined
    if (showResetInput) {
      resetExpr = inputs[nextIndex]
    }

    // RTW IcNeedsLoading: load live x(0) only while the enable scope is active.
    // Integrators publish state→signal even when disabled, so this must be gated
    // here (not via the usual algebra enable wrap).
    // Topo: AlgebraicEvaluator adds a dep on the x(0) driver so Stage_Sep→
    // Body_to_ECI_Sum runs before this load under segregated LVDC.
    if (showInitPort && initExpr) {
      const enableExpr = context?.enableExpr && context.enableExpr !== '1'
        ? context.enableExpr
        : null
      const loadIndent = enableExpr ? '        ' : '    '
      code += `    /* IcNeedsLoading: defer x(0) until first enabled evaluation */\n`
      if (enableExpr) {
        code += `    if (${enableExpr} && model->states.${intName}_ic_needs_loading) {\n`
      } else {
        code += `    if (model->states.${intName}_ic_needs_loading) {\n`
      }
      code += this.generateStateAssignFromSource(
        intName,
        typeInfo,
        initExpr,
        initialValue,
        useLimits,
        lowerLimit,
        upperLimit,
        loadIndent
      )
      code += `${loadIndent}model->states.${intName}_ic_needs_loading = 0;\n`
      code += `    }\n`
    }

    // Reset logic (rising edge detection)
    if (showResetInput && resetExpr) {
      code += `    bool ${intName}_reset = (bool)${resetExpr};\n`
      code += `    bool ${intName}_rising_edge = ${intName}_reset && !model->states.${intName}_reset_prev;\n`
      code += `    if (${intName}_rising_edge) {\n`

      // Prefer live x(0) signal when showInitPort; otherwise parameter initialValue
      code += this.generateStateAssignFromSource(
        intName,
        typeInfo,
        showInitPort && initExpr ? initExpr : null,
        initialValue,
        useLimits,
        lowerLimit,
        upperLimit,
        '        '
      )

      code += `    }\n`
      code += `    model->states.${intName}_reset_prev = ${intName}_reset;\n`
    }

    // Output current state value
    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            ${outputName}[i][j] = model->states.${intName}_states[i][j];\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        ${outputName}[i] = model->states.${intName}_states[i];\n`
      code += `    }\n`
    } else {
      code += `    ${outputName} = model->states.${intName}_states[0];\n`
    }

    return code
  }

  /**
   * Assign integrator state from either a signal expression or a static initial value.
   */
  private generateStateAssignFromSource(
    intName: string,
    typeInfo: ReturnType<typeof BlockModuleUtils.parseType>,
    initExpr: string | null,
    initialValue: number | number[] | number[][],
    useLimits: boolean,
    lowerLimit: number,
    upperLimit: number,
    indent: string
  ): string {
    const clamp = (expr: string): string => {
      if (useLimits && isFinite(lowerLimit) && isFinite(upperLimit)) {
        return `fmax(${lowerLimit}, fmin(${upperLimit}, ${expr}))`
      }
      return expr
    }

    // AlgebraicEvaluator falls back to '0.0' when x(0) is unconnected. That is a
    // scalar literal — must not emit 0.0[i] / 0.0[i][j] for vector/matrix states.
    const isScalarLiteral =
      !!initExpr && /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(initExpr.trim())

    let code = ''
    if (initExpr && !isScalarLiteral) {
      // Live x(0) signal (array/matrix or scalar signal expression)
      if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
        code += `${indent}for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
        code += `${indent}    for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
        code += `${indent}        model->states.${intName}_states[i][j] = ${clamp(`${initExpr}[i][j]`)};\n`
        code += `${indent}    }\n`
        code += `${indent}}\n`
      } else if (typeInfo.isArray && typeInfo.arraySize) {
        code += `${indent}for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
        code += `${indent}    model->states.${intName}_states[i] = ${clamp(`${initExpr}[i]`)};\n`
        code += `${indent}}\n`
      } else {
        code += `${indent}model->states.${intName}_states[0] = ${clamp(initExpr)};\n`
      }
    } else if (initExpr && isScalarLiteral) {
      // Unconnected / constant scalar x(0): broadcast to all elements
      if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
        code += `${indent}for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
        code += `${indent}    for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
        code += `${indent}        model->states.${intName}_states[i][j] = ${clamp(initExpr)};\n`
        code += `${indent}    }\n`
        code += `${indent}}\n`
      } else if (typeInfo.isArray && typeInfo.arraySize) {
        code += `${indent}for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
        code += `${indent}    model->states.${intName}_states[i] = ${clamp(initExpr)};\n`
        code += `${indent}}\n`
      } else {
        code += `${indent}model->states.${intName}_states[0] = ${clamp(initExpr)};\n`
      }
    } else {
      // Static parameter initialValue
      const scalarInitial = typeof initialValue === 'number' ? initialValue : 0
      if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
        code += `${indent}for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
        code += `${indent}    for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
        const initVal = typeof initialValue === 'number' ? String(initialValue) : `${scalarInitial}`
        code += `${indent}        model->states.${intName}_states[i][j] = ${clamp(initVal)};\n`
        code += `${indent}    }\n`
        code += `${indent}}\n`
      } else if (typeInfo.isArray && typeInfo.arraySize) {
        code += `${indent}for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
        code += `${indent}    model->states.${intName}_states[i] = ${clamp(String(scalarInitial))};\n`
        code += `${indent}}\n`
      } else {
        code += `${indent}model->states.${intName}_states[0] = ${clamp(String(scalarInitial))};\n`
      }
    }
    return code
  }

  /**
   * Generate state derivative computation for RK4/Euler integration.
   * For an integrator (1/s), the derivative is simply the input signal (port 0).
   */
  generateStateDerivative(
    block: BlockData,
    inputExpr: string,
    stateAccessor: string,
    outputType: string
  ): string {
    const intName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const {
      useLimits = false,
      upperLimit = Infinity,
      lowerLimit = -Infinity
    } = block.parameters || {}
    const typeInfo = BlockModuleUtils.parseType(outputType)

    let code = `    /* State derivatives for ${block.name} (integrator: 1/s) */\n`

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      if (useLimits && isFinite(lowerLimit) && isFinite(upperLimit)) {
        code += `            double ${intName}_current = ${stateAccessor}->${intName}_states[i][j];\n`
        code += `            double ${intName}_deriv = ${inputExpr}[i][j];\n`
        code += `            if ((${intName}_current >= ${upperLimit} && ${intName}_deriv > 0.0) ||\n`
        code += `                (${intName}_current <= ${lowerLimit} && ${intName}_deriv < 0.0)) {\n`
        code += `                state_derivatives->${intName}_states[i][j] = 0.0;\n`
        code += `            } else {\n`
        code += `                state_derivatives->${intName}_states[i][j] = ${intName}_deriv;\n`
        code += `            }\n`
      } else {
        code += `            state_derivatives->${intName}_states[i][j] = ${inputExpr}[i][j];\n`
      }
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      if (useLimits && isFinite(lowerLimit) && isFinite(upperLimit)) {
        code += `        double ${intName}_current = ${stateAccessor}->${intName}_states[i];\n`
        code += `        double ${intName}_deriv = ${inputExpr}[i];\n`
        code += `        if ((${intName}_current >= ${upperLimit} && ${intName}_deriv > 0.0) ||\n`
        code += `            (${intName}_current <= ${lowerLimit} && ${intName}_deriv < 0.0)) {\n`
        code += `            state_derivatives->${intName}_states[i] = 0.0;\n`
        code += `        } else {\n`
        code += `            state_derivatives->${intName}_states[i] = ${intName}_deriv;\n`
        code += `        }\n`
      } else {
        code += `        state_derivatives->${intName}_states[i] = ${inputExpr}[i];\n`
      }
      code += `    }\n`
    } else {
      if (useLimits && isFinite(lowerLimit) && isFinite(upperLimit)) {
        code += `    double ${intName}_current = ${stateAccessor}->${intName}_states[0];\n`
        code += `    double ${intName}_deriv = ${inputExpr};\n`
        code += `    if ((${intName}_current >= ${upperLimit} && ${intName}_deriv > 0.0) ||\n`
        code += `        (${intName}_current <= ${lowerLimit} && ${intName}_deriv < 0.0)) {\n`
        code += `        state_derivatives->${intName}_states[0] = 0.0;\n`
        code += `    } else {\n`
        code += `        state_derivatives->${intName}_states[0] = ${intName}_deriv;\n`
        code += `    }\n`
      } else {
        code += `    state_derivatives->${intName}_states[0] = ${inputExpr};\n`
      }
    }

    return code
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Explicit dataType from emit/translator wins (e.g. double[4][1] quat)
    const explicit = block.parameters?.dataType
    if (typeof explicit === 'string' && explicit.includes('[')) {
      return explicit
    }

    // Output type is the state type. Prefer derivative (port 0) when known;
    // with showInitPort, x(0) (port 1) is often the only typed input in a
    // kinematics feedback loop (q̇ depends on q) until a later pass.
    const showInitPort = !!block.parameters?.showInitPort
    const deriv = inputTypes[0]
    const ic = showInitPort ? inputTypes[1] : undefined

    const isDimensional = (t?: string) => !!t && t.includes('[')
    const isKnown = (t?: string) => !!t && t.length > 0

    // Prefer any non-scalar type (quaternion/vector integrators)
    if (isDimensional(deriv)) return deriv!
    if (isDimensional(ic)) return ic!

    if (isKnown(deriv)) return deriv!
    if (isKnown(ic)) return ic!

    // Fallback: first provided type, else double
    for (const t of inputTypes) {
      if (isKnown(t)) return t
    }
    return 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    return true
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    const intName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const typeInfo = BlockModuleUtils.parseType(outputType)
    const members: string[] = []
    const { showResetInput = false, showInitPort = false } = block.parameters || {}

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      members.push(`    double ${intName}_states[${typeInfo.rows}][${typeInfo.cols}];`)
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      members.push(`    double ${intName}_states[${typeInfo.arraySize}];`)
    } else {
      members.push(`    double ${intName}_states[1];`)
    }

    if (showInitPort) {
      // RTW IcNeedsLoading: defer x(0) copy until first enabled evaluation
      members.push(`    int ${intName}_ic_needs_loading;`)
    }

    if (showResetInput) {
      members.push(`    bool ${intName}_reset_prev;`)
    }

    return members
  }

  generateInitialization(block: BlockData, outputType?: string, initSignalExpr?: string): string {
    const intName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const {
      initialValue = 0,
      showResetInput = false,
      showInitPort = false,
      useLimits = false,
      upperLimit = Infinity,
      lowerLimit = -Infinity
    } = block.parameters || {}

    let code = ''
    const typeInfo = BlockModuleUtils.parseType(outputType || 'double')

    const getClampedValue = (val: number): string => {
      if (useLimits && isFinite(lowerLimit) && isFinite(upperLimit)) {
        return `fmax(${lowerLimit}, fmin(${upperLimit}, ${val}))`
      }
      return String(val)
    }

    // showInitPort: RTW IcNeedsLoading — do NOT eagerly copy x(0) here.
    // Seed state to 0 and set the flag; generateComputation loads live x(0)
    // on the first enabled algebraic evaluation (handoff for disabled stages).
    // initSignalExpr is intentionally unused at init/reseed time.
    void initSignalExpr
    if (showInitPort) {
      code += `    /* IcNeedsLoading: defer x(0) for ${intName}; load when enabled */\n`
      if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
        for (let i = 0; i < typeInfo.rows; i++) {
          for (let j = 0; j < typeInfo.cols; j++) {
            code += `    model->states.${intName}_states[${i}][${j}] = 0.0;\n`
          }
        }
      } else if (typeInfo.isArray && typeInfo.arraySize) {
        for (let i = 0; i < typeInfo.arraySize; i++) {
          code += `    model->states.${intName}_states[${i}] = 0.0;\n`
        }
      } else {
        code += `    model->states.${intName}_states[0] = 0.0;\n`
      }
      code += `    model->states.${intName}_ic_needs_loading = 1;\n`
    } else {
      // Static initial value from parameters
      const scalarInitial = typeof initialValue === 'number' ? initialValue : 0

      if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
        code += `    // Initialize ${intName}_states (matrix ${typeInfo.rows}x${typeInfo.cols})\n`
        for (let i = 0; i < typeInfo.rows; i++) {
          for (let j = 0; j < typeInfo.cols; j++) {
            let val: number
            if (Array.isArray(initialValue) && Array.isArray(initialValue[i])) {
              val = (initialValue[i] as number[])[j] ?? scalarInitial
            } else {
              val = scalarInitial
            }
            code += `    model->states.${intName}_states[${i}][${j}] = ${getClampedValue(val)};\n`
          }
        }
      } else if (typeInfo.isArray && typeInfo.arraySize) {
        code += `    // Initialize ${intName}_states (vector size ${typeInfo.arraySize})\n`
        for (let i = 0; i < typeInfo.arraySize; i++) {
          let val: number
          if (Array.isArray(initialValue) && !Array.isArray(initialValue[0])) {
            val = (initialValue[i] as number) ?? scalarInitial
          } else {
            val = scalarInitial
          }
          code += `    model->states.${intName}_states[${i}] = ${getClampedValue(val)};\n`
        }
      } else {
        code += `    model->states.${intName}_states[0] = ${getClampedValue(scalarInitial)};\n`
      }
    }

    if (showResetInput) {
      code += `    model->states.${intName}_reset_prev = false;\n`
    }

    return code
  }

  generatePostIntegrationLimiting(block: BlockData, outputType: string): string {
    const intName = BlockModuleUtils.sanitizeIdentifier(block.name)
    const {
      useLimits = false,
      upperLimit = Infinity,
      lowerLimit = -Infinity
    } = block.parameters || {}

    if (!useLimits || !isFinite(lowerLimit) || !isFinite(upperLimit)) {
      return ''
    }

    const typeInfo = BlockModuleUtils.parseType(outputType)
    let code = `    /* Apply limits to ${block.name} */\n`

    if (typeInfo.isMatrix && typeInfo.rows && typeInfo.cols) {
      code += `    for (int i = 0; i < ${typeInfo.rows}; i++) {\n`
      code += `        for (int j = 0; j < ${typeInfo.cols}; j++) {\n`
      code += `            model->states.${intName}_states[i][j] = fmax(${lowerLimit}, fmin(${upperLimit}, model->states.${intName}_states[i][j]));\n`
      code += `        }\n`
      code += `    }\n`
    } else if (typeInfo.isArray && typeInfo.arraySize) {
      code += `    for (int i = 0; i < ${typeInfo.arraySize}; i++) {\n`
      code += `        model->states.${intName}_states[i] = fmax(${lowerLimit}, fmin(${upperLimit}, model->states.${intName}_states[i]));\n`
      code += `    }\n`
    } else {
      code += `    model->states.${intName}_states[0] = fmax(${lowerLimit}, fmin(${upperLimit}, model->states.${intName}_states[0]));\n`
    }

    return code
  }

  getInputPortCount(block: BlockData): number {
    // Data ports only (left edge). Enable/reset are control ports (negative indices).
    return block.parameters?.showInitPort ? 2 : 1
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    if (block.parameters?.showInitPort) {
      return ['Derivative', 'x(0)']
    }
    return ['Derivative']
  }

  getOutputPortLabels(block: BlockData): string[] | undefined {
    return ['Output']
  }

  isDirectFeedthrough(block: BlockData): boolean {
    // Output is integrated state, not a direct function of derivative input.
    // Note: when showInitPort is on, x(0) is sampled on first enabled eval
    // (IcNeedsLoading) and on reset — not continuously.
    return false
  }

  computeDerivatives(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    time: number
  ): number[] | undefined {
    const derivative = inputs[0]

    if (typeof derivative === 'number') {
      return [derivative]
    } else if (Array.isArray(derivative)) {
      if (Array.isArray(derivative[0])) {
        return (derivative as unknown as number[][]).flat()
      } else {
        return derivative as number[]
      }
    }

    return undefined
  }
}

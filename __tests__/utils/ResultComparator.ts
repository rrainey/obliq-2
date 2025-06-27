// __tests__/utils/ResultComparator.ts

import { ExecutionResult } from './ModelExecutor'
import { TestModel } from './TestModelBuilder'

export interface ComparisonResult {
  passed: boolean
  totalOutputs: number
  matchedOutputs: number
  tolerance: number
  details: OutputComparison[]
  summary: string
  executionTimeRatio: number
}

export interface OutputComparison {
  portName: string
  simulationValue: number | number[]
  compiledValue: number | number[]
  difference: number | number[]
  percentError: number | number[]
  maxError: number
  passed: boolean
  message?: string
}

export interface ComparisonOptions {
  tolerance?: number // Default 0.001 (0.1%)
  absoluteTolerance?: number // For values near zero
  ignoreOutputs?: string[] // Output ports to ignore
  customTolerances?: { [portName: string]: number } // Per-output tolerances
  verbose?: boolean
}

/**
 * Utility for comparing simulation and compiled execution results
 */
export class ResultComparator {
  private options: Required<ComparisonOptions>

  constructor(options: ComparisonOptions = {}) {
    this.options = {
      tolerance: options.tolerance ?? 0.001,
      absoluteTolerance: options.absoluteTolerance ?? 1e-10,
      ignoreOutputs: options.ignoreOutputs ?? [],
      customTolerances: options.customTolerances ?? {},
      verbose: options.verbose ?? false
    }
  }

  /**
   * Compare two execution results
   */
  compare(
    simulation: ExecutionResult,
    compiled: ExecutionResult,
    model?: TestModel
  ): ComparisonResult {
    // Check if both executions succeeded
    if (!simulation.success || !compiled.success) {
      return this.createFailureResult(simulation, compiled)
    }

    // Get all output port names
    const outputNames = new Set([
      ...Object.keys(simulation.outputs),
      ...Object.keys(compiled.outputs)
    ])

    // Remove ignored outputs
    for (const ignored of this.options.ignoreOutputs) {
      outputNames.delete(ignored)
    }

    // Compare each output
    const details: OutputComparison[] = []
    let matchedOutputs = 0

    for (const portName of outputNames) {
      const comparison = this.compareOutput(
        portName,
        simulation.outputs[portName],
        compiled.outputs[portName],
        model
      )
      
      details.push(comparison)
      if (comparison.passed) {
        matchedOutputs++
      }
    }

    // Calculate execution time ratio
    const executionTimeRatio = compiled.simulationTime / simulation.simulationTime

    // Generate summary
    const passed = matchedOutputs === outputNames.size
    const summary = this.generateSummary(
      passed,
      matchedOutputs,
      outputNames.size,
      executionTimeRatio
    )

    return {
      passed,
      totalOutputs: outputNames.size,
      matchedOutputs,
      tolerance: this.options.tolerance,
      details,
      summary,
      executionTimeRatio
    }
  }

  /**
   * Compare against expected outputs from model metadata
   */
  compareWithExpected(
    result: ExecutionResult,
    model: TestModel,
    mode: 'simulation' | 'compiled'
  ): ComparisonResult {
    if (!result.success) {
      return this.createExecutionFailureResult(result, mode)
    }

    const expectedOutputs = this.getExpectedOutputs(model)
    const details: OutputComparison[] = []
    let matchedOutputs = 0

    for (const [portName, expectedValue] of Object.entries(expectedOutputs)) {
      const actualValue = result.outputs[portName]
      const comparison = this.compareOutput(
        portName,
        expectedValue,
        actualValue,
        model,
        'expected'
      )

      details.push(comparison)
      if (comparison.passed) {
        matchedOutputs++
      }
    }

    const passed = matchedOutputs === Object.keys(expectedOutputs).length
    const summary = `${mode} vs expected: ${matchedOutputs}/${Object.keys(expectedOutputs).length} outputs matched`

    return {
      passed,
      totalOutputs: Object.keys(expectedOutputs).length,
      matchedOutputs,
      tolerance: model.metadata.tolerance ?? this.options.tolerance,
      details,
      summary,
      executionTimeRatio: 1.0
    }
  }

  /**
   * Generate a detailed HTML report
   */
  generateHTMLReport(
    comparison: ComparisonResult,
    model?: TestModel,
    simulation?: ExecutionResult,
    compiled?: ExecutionResult
  ): string {
    let html = `<!DOCTYPE html>
<html>
<head>
    <title>Model Comparison Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background-color: #f0f0f0; padding: 10px; border-radius: 5px; }
        .pass { color: green; font-weight: bold; }
        .fail { color: red; font-weight: bold; }
        .warning { color: orange; font-weight: bold; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .error-cell { background-color: #ffeeee; }
        .pass-cell { background-color: #eeffee; }
        .details { margin-top: 20px; }
        .execution-info { background-color: #f9f9f9; padding: 10px; margin: 10px 0; }
        pre { background-color: #f4f4f4; padding: 10px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Model Comparison Report</h1>
        ${model ? `<h2>${model.metadata.description || 'Unnamed Model'}</h2>` : ''}
        <p>Generated: ${new Date().toISOString()}</p>
    </div>

    <div class="summary">
        <h2>Summary</h2>
        <p class="${comparison.passed ? 'pass' : 'fail'}">${comparison.summary}</p>
        <p>Tolerance: ${(comparison.tolerance * 100).toFixed(3)}%</p>
        <p>Execution time ratio (compiled/simulation): ${comparison.executionTimeRatio.toFixed(2)}x</p>
    </div>

    <div class="execution-info">
        <h3>Execution Details</h3>
        ${simulation ? `
        <p><strong>Simulation:</strong> 
           ${simulation.success ? 'Success' : 'Failed'} 
           (${simulation.simulationTime.toFixed(3)}s)
           ${simulation.error ? `<br>Error: ${simulation.error}` : ''}
        </p>` : ''}
        ${compiled ? `
        <p><strong>Compiled:</strong> 
           ${compiled.success ? 'Success' : 'Failed'} 
           (${compiled.simulationTime.toFixed(3)}s)
           ${compiled.error ? `<br>Error: ${compiled.error}` : ''}
        </p>` : ''}
    </div>

    <div class="details">
        <h2>Output Comparison</h2>
        <table>
            <tr>
                <th>Output Port</th>
                <th>Simulation Value</th>
                <th>Compiled Value</th>
                <th>Difference</th>
                <th>Error %</th>
                <th>Status</th>
            </tr>
            ${comparison.details.map(detail => this.generateDetailRow(detail)).join('\n')}
        </table>
    </div>

    ${this.generateCharts(comparison)}

    ${simulation?.logs || compiled?.rawOutput ? `
    <div class="logs">
        <h2>Execution Logs</h2>
        ${simulation?.logs ? `
        <h3>Simulation Logs</h3>
        <pre>${simulation.logs.join('\n')}</pre>
        ` : ''}
        ${compiled?.rawOutput && this.options.verbose ? `
        <h3>Compiled Output</h3>
        <pre>${compiled.rawOutput}</pre>
        ` : ''}
    </div>
    ` : ''}
</body>
</html>`

    return html
  }

  /**
   * Generate a text summary suitable for console output
   */
  generateTextReport(comparison: ComparisonResult): string {
    const lines: string[] = []
    
    lines.push('=' .repeat(80))
    lines.push('MODEL COMPARISON REPORT')
    lines.push('=' .repeat(80))
    lines.push('')
    lines.push(`Status: ${comparison.passed ? 'PASSED ✓' : 'FAILED ✗'}`)
    lines.push(`Summary: ${comparison.summary}`)
    lines.push(`Tolerance: ${(comparison.tolerance * 100).toFixed(3)}%`)
    lines.push(`Execution time ratio: ${comparison.executionTimeRatio.toFixed(2)}x`)
    lines.push('')
    lines.push('Output Details:')
    lines.push('-'.repeat(80))

    for (const detail of comparison.details) {
      lines.push(`\n${detail.portName}:`)
      lines.push(`  Simulation: ${this.formatValue(detail.simulationValue)}`)
      lines.push(`  Compiled:   ${this.formatValue(detail.compiledValue)}`)
      lines.push(`  Difference: ${this.formatValue(detail.difference)}`)
      lines.push(`  Max Error:  ${(detail.maxError * 100).toFixed(4)}%`)
      lines.push(`  Status:     ${detail.passed ? 'PASS ✓' : 'FAIL ✗'}`)
      if (detail.message) {
        lines.push(`  Note:       ${detail.message}`)
      }
    }

    lines.push('')
    lines.push('=' .repeat(80))

    return lines.join('\n')
  }

  // Private helper methods

  private compareOutput(
    portName: string,
    value1: number | number[] | undefined,
    value2: number | number[] | undefined,
    model?: TestModel,
    mode: 'comparison' | 'expected' = 'comparison'
  ): OutputComparison {
    // Handle missing values
    if (value1 === undefined || value2 === undefined) {
      return this.createMissingValueComparison(portName, value1, value2, mode)
    }

    // Get tolerance for this output
    const tolerance = this.getToleranceForOutput(portName, model)

    // Convert to arrays for uniform handling
    const array1 = Array.isArray(value1) ? value1 : [value1]
    const array2 = Array.isArray(value2) ? value2 : [value2]

    // Check dimensions
    if (array1.length !== array2.length) {
      return this.createDimensionMismatchComparison(portName, value1, value2)
    }

    // Calculate differences
    const differences = array1.map((v1, i) => v1 - array2[i])
    const percentErrors = array1.map((v1, i) => {
      const v2 = array2[i]
      if (Math.abs(v1) < this.options.absoluteTolerance && 
          Math.abs(v2) < this.options.absoluteTolerance) {
        return 0 // Both near zero
      }
      const denominator = Math.max(Math.abs(v1), Math.abs(v2))
      return Math.abs(v1 - v2) / denominator
    })

    const maxError = Math.max(...percentErrors)
    const passed = maxError <= tolerance

    return {
      portName,
      simulationValue: value1,
      compiledValue: value2,
      difference: Array.isArray(value1) ? differences : differences[0],
      percentError: Array.isArray(value1) ? percentErrors : percentErrors[0],
      maxError,
      passed,
      message: passed ? undefined : `Exceeded tolerance: ${(maxError * 100).toFixed(4)}% > ${(tolerance * 100).toFixed(3)}%`
    }
  }

  private createFailureResult(
    simulation: ExecutionResult,
    compiled: ExecutionResult
  ): ComparisonResult {
    const details: OutputComparison[] = []
    
    if (!simulation.success) {
      details.push({
        portName: 'SIMULATION_ERROR',
        simulationValue: 0,
        compiledValue: 0,
        difference: 0,
        percentError: 0,
        maxError: 1.0,
        passed: false,
        message: `Simulation failed: ${simulation.error}`
      })
    }

    if (!compiled.success) {
      details.push({
        portName: 'COMPILATION_ERROR',
        simulationValue: 0,
        compiledValue: 0,
        difference: 0,
        percentError: 0,
        maxError: 1.0,
        passed: false,
        message: `Compilation failed: ${compiled.error}`
      })
    }

    return {
      passed: false,
      totalOutputs: 0,
      matchedOutputs: 0,
      tolerance: this.options.tolerance,
      details,
      summary: 'Execution failed',
      executionTimeRatio: 0
    }
  }

  private createExecutionFailureResult(
    result: ExecutionResult,
    mode: string
  ): ComparisonResult {
    return {
      passed: false,
      totalOutputs: 0,
      matchedOutputs: 0,
      tolerance: this.options.tolerance,
      details: [{
        portName: 'EXECUTION_ERROR',
        simulationValue: 0,
        compiledValue: 0,
        difference: 0,
        percentError: 0,
        maxError: 1.0,
        passed: false,
        message: `${mode} execution failed: ${result.error}`
      }],
      summary: `${mode} execution failed`,
      executionTimeRatio: 0
    }
  }

  private createMissingValueComparison(
    portName: string,
    value1: any,
    value2: any,
    mode: string
  ): OutputComparison {
    const label1 = mode === 'expected' ? 'Expected' : 'Simulation'
    const label2 = mode === 'expected' ? 'Actual' : 'Compiled'
    
    return {
      portName,
      simulationValue: value1 ?? 0,
      compiledValue: value2 ?? 0,
      difference: 0,
      percentError: 1.0,
      maxError: 1.0,
      passed: false,
      message: value1 === undefined 
        ? `${label1} value missing`
        : `${label2} value missing`
    }
  }

  private createDimensionMismatchComparison(
    portName: string,
    value1: any,
    value2: any
  ): OutputComparison {
    return {
      portName,
      simulationValue: value1,
      compiledValue: value2,
      difference: 0,
      percentError: 1.0,
      maxError: 1.0,
      passed: false,
      message: `Dimension mismatch: ${Array.isArray(value1) ? value1.length : 'scalar'} vs ${Array.isArray(value2) ? value2.length : 'scalar'}`
    }
  }

  private getToleranceForOutput(portName: string, model?: TestModel): number {
    // Check custom tolerances first
    if (this.options.customTolerances[portName] !== undefined) {
      return this.options.customTolerances[portName]
    }

    // Check model metadata
    if (model?.metadata.tolerance !== undefined) {
      return model.metadata.tolerance
    }

    // Use default
    return this.options.tolerance
  }

  private getExpectedOutputs(model: TestModel): { [portName: string]: number | number[] } {
    const expected: { [portName: string]: number | number[] } = {}

    // Handle single expected output
    if (model.metadata.expectedOutput !== undefined) {
      // Find first output port
      for (const sheet of model.sheets) {
        for (const block of sheet.blocks) {
          if (block.type === 'output_port') {
            const portName = block.parameters?.portName as string
            if (portName) {
              expected[portName] = model.metadata.expectedOutput
              break
            }
          }
        }
        if (Object.keys(expected).length > 0) break
      }
    }

    // Handle multiple expected outputs
    if (model.metadata.expectedOutputs) {
      Object.assign(expected, model.metadata.expectedOutputs)
    }

    return expected
  }

  private generateSummary(
    passed: boolean,
    matched: number,
    total: number,
    timeRatio: number
  ): string {
    const status = passed ? 'PASSED' : 'FAILED'
    const performance = timeRatio < 1 
      ? `compiled ${(1/timeRatio).toFixed(1)}x faster`
      : timeRatio > 1
      ? `compiled ${timeRatio.toFixed(1)}x slower`
      : 'similar performance'
    
    return `${status}: ${matched}/${total} outputs matched (${performance})`
  }

  private formatValue(value: number | number[]): string {
    if (Array.isArray(value)) {
      if (value.length <= 5) {
        return `[${value.map(v => v.toFixed(6)).join(', ')}]`
      }
      return `[${value.slice(0, 3).map(v => v.toFixed(6)).join(', ')}, ... (${value.length} total)]`
    }
    return value.toFixed(6)
  }

  private generateDetailRow(detail: OutputComparison): string {
    const cellClass = detail.passed ? 'pass-cell' : 'error-cell'
    const statusIcon = detail.passed ? '✓' : '✗'
    
    return `
      <tr>
        <td>${detail.portName}</td>
        <td>${this.formatValue(detail.simulationValue)}</td>
        <td>${this.formatValue(detail.compiledValue)}</td>
        <td class="${cellClass}">${this.formatValue(detail.difference)}</td>
        <td class="${cellClass}">${(detail.maxError * 100).toFixed(4)}%</td>
        <td class="${cellClass}">${statusIcon} ${detail.passed ? 'Pass' : 'Fail'}</td>
      </tr>
    `
  }

  private generateCharts(comparison: ComparisonResult): string {
    // This could be expanded to include actual charts using Chart.js or similar
    // For now, just a placeholder
    return `
    <div class="charts">
        <h2>Error Distribution</h2>
        <p>Chart visualization would go here</p>
        <!-- Canvas for Chart.js or similar -->
    </div>
    `
  }
}

/**
 * Quick comparison function
 */
export function compareResults(
  simulation: ExecutionResult,
  compiled: ExecutionResult,
  options?: ComparisonOptions
): ComparisonResult {
  const comparator = new ResultComparator(options)
  return comparator.compare(simulation, compiled)
}

/**
 * Compare and print to console
 */
export function compareAndPrint(
  simulation: ExecutionResult,
  compiled: ExecutionResult,
  options?: ComparisonOptions
): boolean {
  const comparator = new ResultComparator(options)
  const result = comparator.compare(simulation, compiled)
  console.log(comparator.generateTextReport(result))
  return result.passed
}
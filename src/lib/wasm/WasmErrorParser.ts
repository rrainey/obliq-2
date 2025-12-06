/**
 * WASM Error Parser
 *
 * Parses emcc compilation errors and maps them to user-friendly messages
 * with suggestions for fixing common issues.
 */

export interface ParsedWasmError {
  /** Error category */
  category: 'compilation' | 'codegen' | 'docker' | 'cache' | 'network' | 'unknown'

  /** Short error title */
  title: string

  /** Detailed error message */
  message: string

  /** Raw error details (for debugging) */
  rawError: string

  /** Affected block name (if identifiable) */
  blockName?: string

  /** Line number in generated C code (if available) */
  lineNumber?: number

  /** Suggested fixes */
  suggestions: string[]

  /** Is this error likely user-fixable? */
  isUserFixable: boolean

  /** Severity level */
  severity: 'error' | 'warning'
}

/**
 * Parse WASM compilation error into structured format
 */
export function parseWasmError(errorMessage: string, details?: string): ParsedWasmError {
  const fullError = details || errorMessage
  const lowerError = fullError.toLowerCase()

  // Docker errors
  if (lowerError.includes('docker') || lowerError.includes('container')) {
    return {
      category: 'docker',
      title: 'Docker Not Available',
      message: 'The WebAssembly compiler requires Docker to be running.',
      rawError: fullError,
      suggestions: [
        'Start Docker Desktop and try again',
        'Ensure Docker is installed and configured correctly',
        'Check Docker daemon is running: docker ps',
        'Use JavaScript engine instead (disable WASM in settings)'
      ],
      isUserFixable: true,
      severity: 'error'
    }
  }

  // Network/cache errors
  if (lowerError.includes('fetch') || lowerError.includes('network') || lowerError.includes('timeout')) {
    return {
      category: 'network',
      title: 'Network Error',
      message: 'Failed to fetch or cache compilation result.',
      rawError: fullError,
      suggestions: [
        'Check your internet connection',
        'Retry the compilation',
        'Clear browser cache and reload',
        'Check Supabase service status'
      ],
      isUserFixable: true,
      severity: 'error'
    }
  }

  // Cache errors
  if (lowerError.includes('cache') || lowerError.includes('storage')) {
    return {
      category: 'cache',
      title: 'Cache Error',
      message: 'Failed to store or retrieve compilation from cache.',
      rawError: fullError,
      suggestions: [
        'Clear browser cache and try again',
        'Check available disk space',
        'Compilation will work but won\'t be cached'
      ],
      isUserFixable: true,
      severity: 'warning'
    }
  }

  // Division by zero
  if (lowerError.includes('division by zero') || lowerError.includes('divide by zero')) {
    const blockName = extractBlockName(fullError)
    const lineNumber = extractLineNumber(fullError)
    return {
      category: 'compilation',
      title: 'Division by Zero',
      message: blockName
        ? `Block "${blockName}" has a division by zero error.`
        : 'A block in your model has a division by zero error.',
      rawError: fullError,
      blockName,
      lineNumber,
      suggestions: [
        'Check denominator coefficients in Transfer Function blocks',
        'Ensure gain blocks don\'t have zero denominators',
        'Verify mathematical expressions don\'t divide by zero'
      ],
      isUserFixable: true,
      severity: 'error'
    }
  }

  // Undefined reference
  if (lowerError.includes('undefined reference') || lowerError.includes('undeclared identifier')) {
    const blockName = extractBlockName(fullError)
    const lineNumber = extractLineNumber(fullError)
    return {
      category: 'compilation',
      title: 'Undefined Reference',
      message: blockName
        ? `Block "${blockName}" references an undefined variable or function.`
        : 'A block references an undefined variable or function.',
      rawError: fullError,
      blockName,
      lineNumber,
      suggestions: [
        'Check custom expression blocks for typos',
        'Verify all referenced variables are defined',
        'Ensure block connections are complete',
        'Report this as a code generation bug if error persists'
      ],
      isUserFixable: true,
      severity: 'error'
    }
  }

  // Type mismatch
  if (lowerError.includes('type mismatch') || lowerError.includes('incompatible types')) {
    const blockName = extractBlockName(fullError)
    const lineNumber = extractLineNumber(fullError)
    return {
      category: 'compilation',
      title: 'Type Mismatch',
      message: blockName
        ? `Block "${blockName}" has incompatible signal types.`
        : 'Incompatible signal types detected.',
      rawError: fullError,
      blockName,
      lineNumber,
      suggestions: [
        'Check signal type annotations (scalar/vector/matrix)',
        'Verify block input/output type compatibility',
        'Use type conversion blocks if needed',
        'Review type validation warnings before compilation'
      ],
      isUserFixable: true,
      severity: 'error'
    }
  }

  // Syntax error in generated C
  if (lowerError.includes('syntax error') || lowerError.includes('parse error')) {
    const blockName = extractBlockName(fullError)
    const lineNumber = extractLineNumber(fullError)
    return {
      category: 'codegen',
      title: 'Code Generation Error',
      message: 'Invalid C code was generated from your model.',
      rawError: fullError,
      blockName,
      lineNumber,
      suggestions: [
        'This is likely a code generation bug',
        'Try simplifying the model and test again',
        'Check for unusual block parameter values',
        'Report this issue with your model structure',
        'Use JavaScript engine as workaround'
      ],
      isUserFixable: false,
      severity: 'error'
    }
  }

  // Memory/size errors
  if (lowerError.includes('memory') || lowerError.includes('out of memory') || lowerError.includes('allocation')) {
    return {
      category: 'compilation',
      title: 'Memory Error',
      message: 'Compilation ran out of memory or exceeded limits.',
      rawError: fullError,
      suggestions: [
        'Model may be too large for WASM compilation',
        'Try reducing model complexity',
        'Close other browser tabs to free memory',
        'Use JavaScript engine for very large models',
        'Contact support for memory limit increases'
      ],
      isUserFixable: true,
      severity: 'error'
    }
  }

  // Timeout
  if (lowerError.includes('timeout') || lowerError.includes('timed out')) {
    return {
      category: 'compilation',
      title: 'Compilation Timeout',
      message: 'Compilation took too long and was cancelled.',
      rawError: fullError,
      suggestions: [
        'Model may be too complex',
        'Try a lower optimization level (O0 or O1)',
        'Reduce model size or complexity',
        'Retry - first compilation is slower',
        'Use JavaScript engine for complex models'
      ],
      isUserFixable: true,
      severity: 'error'
    }
  }

  // emcc not found / installation issue
  if (lowerError.includes('emcc') || lowerError.includes('emscripten')) {
    return {
      category: 'docker',
      title: 'Emscripten Compiler Not Found',
      message: 'The Emscripten compiler (emcc) is not available in the Docker container.',
      rawError: fullError,
      suggestions: [
        'Verify Docker image is built correctly',
        'Rebuild Docker image: docker build -t obliq-emscripten .',
        'Check Dockerfile includes Emscripten installation',
        'Contact system administrator if hosted'
      ],
      isUserFixable: false,
      severity: 'error'
    }
  }

  // Generic compilation error
  if (lowerError.includes('error:') || lowerError.includes('failed')) {
    const blockName = extractBlockName(fullError)
    const lineNumber = extractLineNumber(fullError)
    return {
      category: 'compilation',
      title: 'Compilation Failed',
      message: blockName
        ? `Compilation failed in block "${blockName}".`
        : 'WASM compilation encountered an error.',
      rawError: fullError,
      blockName,
      lineNumber,
      suggestions: [
        'Check model for invalid block parameters',
        'Review error details below for specifics',
        'Try using JavaScript engine instead',
        'Report persistent errors with model structure'
      ],
      isUserFixable: true,
      severity: 'error'
    }
  }

  // Unknown error
  return {
    category: 'unknown',
    title: 'Unknown Error',
    message: errorMessage || 'An unexpected error occurred during WASM compilation.',
    rawError: fullError,
    suggestions: [
      'Try reloading the page and compiling again',
      'Use JavaScript engine as alternative',
      'Check browser console for additional details',
      'Report this error with full details'
    ],
    isUserFixable: false,
    severity: 'error'
  }
}

/**
 * Extract block name from error message
 */
function extractBlockName(error: string): string | undefined {
  // Look for patterns like:
  // - "in function 'Block_TransferFunction1'"
  // - "Block_Gain2"
  // - "block 'MyBlock'"

  const patterns = [
    /in function ['"]?Block_([\w_]+)['"]?/i,
    /Block_([\w_]+)/,
    /block ['"](\w+)['"]/i,
    /'(\w+)'\s+block/i
  ]

  for (const pattern of patterns) {
    const match = error.match(pattern)
    if (match && match[1]) {
      // Remove common prefixes and convert underscores to spaces
      return match[1]
        .replace(/^Block_/, '')
        .replace(/_/g, ' ')
        .trim()
    }
  }

  return undefined
}

/**
 * Extract line number from error message
 */
function extractLineNumber(error: string): number | undefined {
  // Look for patterns like:
  // - "file.c:42:5: error:"
  // - "line 42:"
  // - ":42:"

  const patterns = [
    /\.c:(\d+):/,           // file.c:42:
    /line\s+(\d+):/i,       // line 123:
    /\b(\d+):(\d+):/,       // 42:5: (line:column)
    /:(\d+):/               // :456: (generic)
  ]

  for (const pattern of patterns) {
    const match = error.match(pattern)
    if (match) {
      // Take the first captured number
      const lineNum = match[1]
      if (lineNum) {
        return parseInt(lineNum, 10)
      }
    }
  }

  return undefined
}

/**
 * Get user-friendly error summary
 */
export function getErrorSummary(parsedError: ParsedWasmError): string {
  const parts = [parsedError.title]

  if (parsedError.blockName) {
    parts.push(`in block "${parsedError.blockName}"`)
  }

  if (parsedError.lineNumber) {
    parts.push(`(line ${parsedError.lineNumber})`)
  }

  return parts.join(' ')
}

/**
 * Determine if error should show full details by default
 */
export function shouldShowDetails(parsedError: ParsedWasmError): boolean {
  return !parsedError.isUserFixable || parsedError.category === 'unknown'
}

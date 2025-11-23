/**
 * WASM Error Parser Tests
 *
 * Tests the error parsing logic for various WASM compilation errors.
 */

import { parseWasmError, getErrorSummary, shouldShowDetails } from '@/lib/wasm/WasmErrorParser'

describe('WasmErrorParser', () => {
  describe('Docker Errors', () => {
    it('should parse Docker not running error', () => {
      const error = 'Docker daemon not running'
      const parsed = parseWasmError(error)

      expect(parsed.category).toBe('docker')
      expect(parsed.title).toBe('Docker Not Available')
      expect(parsed.isUserFixable).toBe(true)
      expect(parsed.severity).toBe('error')
      expect(parsed.suggestions).toContain('Start Docker Desktop and try again')
    })

    it('should parse Docker container error', () => {
      const error = 'Error: Container failed to start'
      const parsed = parseWasmError(error)

      expect(parsed.category).toBe('docker')
      expect(parsed.title).toBe('Docker Not Available')
    })
  })

  describe('Compilation Errors', () => {
    it('should parse division by zero error', () => {
      const error = 'Error: division by zero in denominator'
      const parsed = parseWasmError(error)

      expect(parsed.category).toBe('compilation')
      expect(parsed.title).toBe('Division by Zero')
      expect(parsed.isUserFixable).toBe(true)
      expect(parsed.suggestions).toContain('Check denominator coefficients in Transfer Function blocks')
    })

    it('should parse division by zero with block name', () => {
      const error = "in function 'Block_TransferFunction1': division by zero"
      const parsed = parseWasmError(error)

      expect(parsed.category).toBe('compilation')
      expect(parsed.title).toBe('Division by Zero')
      expect(parsed.blockName).toBe('TransferFunction1')
    })

    it('should parse undefined reference error', () => {
      const error = 'undefined reference to `variable_foo`'
      const parsed = parseWasmError(error)

      expect(parsed.category).toBe('compilation')
      expect(parsed.title).toBe('Undefined Reference')
      expect(parsed.isUserFixable).toBe(true)
    })

    it('should parse type mismatch error', () => {
      const error = 'type mismatch: incompatible types in assignment'
      const parsed = parseWasmError(error)

      expect(parsed.category).toBe('compilation')
      expect(parsed.title).toBe('Type Mismatch')
      expect(parsed.isUserFixable).toBe(true)
      expect(parsed.suggestions).toContain('Check signal type annotations (scalar/vector/matrix)')
    })

    it('should parse timeout error', () => {
      const error = 'Compilation timed out after 30 seconds'
      const parsed = parseWasmError(error)

      expect(parsed.category).toBe('compilation')
      expect(parsed.title).toBe('Compilation Timeout')
      expect(parsed.isUserFixable).toBe(true)
      expect(parsed.suggestions).toContain('Try a lower optimization level (O0 or O1)')
    })

    it('should parse memory error', () => {
      const error = 'Out of memory during compilation'
      const parsed = parseWasmError(error)

      expect(parsed.category).toBe('compilation')
      expect(parsed.title).toBe('Memory Error')
      expect(parsed.isUserFixable).toBe(true)
    })
  })

  describe('Code Generation Errors', () => {
    it('should parse syntax error in generated C', () => {
      const error = 'file.c:42: syntax error: expected `;` before `}`'
      const parsed = parseWasmError(error)

      expect(parsed.category).toBe('codegen')
      expect(parsed.title).toBe('Code Generation Error')
      expect(parsed.lineNumber).toBe(42)
      expect(parsed.isUserFixable).toBe(false)
      expect(parsed.suggestions).toContain('This is likely a code generation bug')
    })
  })

  describe('Network/Cache Errors', () => {
    it('should parse network error', () => {
      const error = 'Network request failed: fetch error'
      const parsed = parseWasmError(error)

      expect(parsed.category).toBe('network')
      expect(parsed.title).toBe('Network Error')
      expect(parsed.isUserFixable).toBe(true)
      expect(parsed.suggestions).toContain('Check your internet connection')
    })

    it('should parse cache error', () => {
      const error = 'Failed to store compilation in cache'
      const parsed = parseWasmError(error)

      expect(parsed.category).toBe('cache')
      expect(parsed.title).toBe('Cache Error')
      expect(parsed.severity).toBe('warning')
    })
  })

  describe('Block Name Extraction', () => {
    it('should extract block name from various formats', () => {
      const testCases = [
        { error: "in function 'Block_Gain1': compilation failed", expected: 'Gain1' },
        { error: "Block_TransferFunction2: error: something went wrong", expected: 'TransferFunction2' },
        { error: "block 'MyBlock' has compilation failed", expected: 'MyBlock' },
        { error: "'CustomBlock' block failed to compile", expected: 'CustomBlock' }
      ]

      testCases.forEach(({ error, expected }) => {
        const parsed = parseWasmError(error)
        expect(parsed.blockName).toBe(expected)
      })
    })

    it('should handle block names with underscores', () => {
      const error = "Block_Transfer_Function_1: error: compilation failed"
      const parsed = parseWasmError(error)
      expect(parsed.blockName).toBe('Transfer Function 1')
    })
  })

  describe('Line Number Extraction', () => {
    it('should extract line numbers from various formats', () => {
      const testCases = [
        { error: "file.c:42:5: error: some error", expected: 42 },
        { error: "line 123: syntax error occurred", expected: 123 },
        { error: "compilation failed at :456:", expected: 456 }
      ]

      testCases.forEach(({ error, expected }) => {
        const parsed = parseWasmError(error)
        expect(parsed.lineNumber).toBe(expected)
      })
    })
  })

  describe('Error Summary', () => {
    it('should generate summary without block name', () => {
      const parsed = parseWasmError('division by zero')
      const summary = getErrorSummary(parsed)
      expect(summary).toBe('Division by Zero')
    })

    it('should generate summary with block name', () => {
      const parsed = parseWasmError("Block_Gain1: division by zero")
      const summary = getErrorSummary(parsed)
      expect(summary).toBe('Division by Zero in block "Gain1"')
    })

    it('should generate summary with block name and line number', () => {
      const parsed = parseWasmError("file.c:42: Block_Gain1: division by zero")
      const summary = getErrorSummary(parsed)
      expect(summary).toBe('Division by Zero in block "Gain1" (line 42)')
    })
  })

  describe('Show Details Logic', () => {
    it('should show details for non-user-fixable errors', () => {
      const parsed = parseWasmError('syntax error in generated C')
      expect(shouldShowDetails(parsed)).toBe(true)
    })

    it('should not show details for user-fixable errors', () => {
      const parsed = parseWasmError('division by zero')
      expect(shouldShowDetails(parsed)).toBe(false)
    })

    it('should show details for unknown errors', () => {
      const parsed = parseWasmError('some weird error')
      expect(shouldShowDetails(parsed)).toBe(true)
    })
  })

  describe('Unknown Errors', () => {
    it('should handle completely unknown errors gracefully', () => {
      const error = 'Something completely unexpected happened'
      const parsed = parseWasmError(error)

      expect(parsed.category).toBe('unknown')
      expect(parsed.title).toBe('Unknown Error')
      expect(parsed.isUserFixable).toBe(false)
      expect(parsed.suggestions.length).toBeGreaterThan(0)
    })
  })

  describe('Real-world Error Examples', () => {
    it('should parse real emcc division by zero error', () => {
      const error = `
        model.c:145:23: error: division by zero
        double result = 1.0 / 0.0;
                            ^
        in function 'Block_TransferFunction1'
        1 error generated.
      `
      const parsed = parseWasmError(error)

      expect(parsed.category).toBe('compilation')
      expect(parsed.title).toBe('Division by Zero')
      expect(parsed.blockName).toBe('TransferFunction1')
      expect(parsed.lineNumber).toBe(145)
    })

    it('should parse real Docker error', () => {
      const error = 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?'
      const parsed = parseWasmError(error)

      expect(parsed.category).toBe('docker')
      expect(parsed.title).toBe('Docker Not Available')
      expect(parsed.suggestions).toContain('Start Docker Desktop and try again')
    })

    it('should parse real timeout error', () => {
      const error = 'Command timed out after 30000ms'
      const parsed = parseWasmError(error)

      expect(parsed.category).toBe('compilation')
      expect(parsed.title).toBe('Compilation Timeout')
    })
  })

  describe('Severity Levels', () => {
    it('should mark cache errors as warnings', () => {
      const parsed = parseWasmError('cache storage failed')
      expect(parsed.severity).toBe('warning')
    })

    it('should mark compilation errors as errors', () => {
      const parsed = parseWasmError('compilation failed')
      expect(parsed.severity).toBe('error')
    })
  })
})

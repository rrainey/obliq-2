/**
 * Browser Compatibility Test Suite
 *
 * Phase 4, Task 4.3: Verify WASM works across browsers
 *
 * Note: These tests verify WebAssembly feature support.
 * For full browser testing, use Playwright with:
 *   npx playwright test __tests__/e2e/wasm-browser.spec.ts
 */

// Feature detection tests that can run in Jest (Node.js)
describe('Browser Compatibility: Feature Detection', () => {
  describe('WebAssembly Support Detection', () => {
    it('should detect WebAssembly availability', () => {
      // WebAssembly is available in Node.js
      expect(typeof WebAssembly).toBe('object')
    })

    it('should have WebAssembly.compile function', () => {
      expect(typeof WebAssembly.compile).toBe('function')
    })

    it('should have WebAssembly.instantiate function', () => {
      expect(typeof WebAssembly.instantiate).toBe('function')
    })

    it('should have WebAssembly.Module constructor', () => {
      expect(typeof WebAssembly.Module).toBe('function')
    })

    it('should have WebAssembly.Instance constructor', () => {
      expect(typeof WebAssembly.Instance).toBe('function')
    })

    it('should have WebAssembly.Memory constructor', () => {
      expect(typeof WebAssembly.Memory).toBe('function')
    })

    it('should have WebAssembly.Table constructor', () => {
      expect(typeof WebAssembly.Table).toBe('function')
    })
  })

  describe('WebAssembly Memory Operations', () => {
    it('should create a WebAssembly.Memory instance', () => {
      const memory = new WebAssembly.Memory({ initial: 1 })
      expect(memory).toBeInstanceOf(WebAssembly.Memory)
      expect(memory.buffer).toBeInstanceOf(ArrayBuffer)
    })

    it('should grow WebAssembly memory', () => {
      const memory = new WebAssembly.Memory({ initial: 1, maximum: 10 })
      const oldSize = memory.buffer.byteLength

      memory.grow(1)

      expect(memory.buffer.byteLength).toBeGreaterThan(oldSize)
    })

    it('should access memory via typed arrays', () => {
      const memory = new WebAssembly.Memory({ initial: 1 })

      const int32View = new Int32Array(memory.buffer)
      int32View[0] = 42

      const float64View = new Float64Array(memory.buffer)
      float64View[0] = 3.14159

      expect(float64View[0]).toBeCloseTo(3.14159, 5)
    })
  })

  describe('WebAssembly Module Compilation', () => {
    // Minimal valid WASM module (just exports nothing)
    const minimalWasm = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, // WASM magic number
      0x01, 0x00, 0x00, 0x00, // WASM version
    ])

    it('should compile a minimal WASM module', async () => {
      const module = await WebAssembly.compile(minimalWasm)
      expect(module).toBeInstanceOf(WebAssembly.Module)
    })

    it('should instantiate a minimal WASM module', async () => {
      const { instance } = await WebAssembly.instantiate(minimalWasm)
      expect(instance).toBeInstanceOf(WebAssembly.Instance)
    })

    it('should validate WASM modules', () => {
      const isValid = WebAssembly.validate(minimalWasm)
      expect(isValid).toBe(true)
    })

    it('should reject invalid WASM binary', () => {
      const invalidWasm = new Uint8Array([0x00, 0x00, 0x00, 0x00])
      const isValid = WebAssembly.validate(invalidWasm)
      expect(isValid).toBe(false)
    })
  })

  describe('WASM with Exports', () => {
    // WASM module that exports a function: (func (result i32) i32.const 42)
    const wasmWithExport = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, // magic
      0x01, 0x00, 0x00, 0x00, // version
      0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f, // type section: () -> i32
      0x03, 0x02, 0x01, 0x00, // function section: 1 function, type 0
      0x07, 0x07, 0x01, 0x03, 0x67, 0x65, 0x74, 0x00, 0x00, // export section: "get" -> func 0
      0x0a, 0x06, 0x01, 0x04, 0x00, 0x41, 0x2a, 0x0b, // code section: const 42, end
    ])

    it('should call exported WASM function', async () => {
      const { instance } = await WebAssembly.instantiate(wasmWithExport)
      const get = instance.exports.get as () => number

      expect(get()).toBe(42)
    })
  })

  describe('Float64 Operations', () => {
    // WASM module that doubles a float64:
    // (func (param f64) (result f64) local.get 0 f64.const 2.0 f64.mul)
    const wasmDouble = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, // magic
      0x01, 0x00, 0x00, 0x00, // version
      0x01, 0x06, 0x01, 0x60, 0x01, 0x7c, 0x01, 0x7c, // type: f64 -> f64
      0x03, 0x02, 0x01, 0x00, // function section
      0x07, 0x0a, 0x01, 0x06, 0x64, 0x6f, 0x75, 0x62, 0x6c, 0x65, 0x00, 0x00, // export "double"
      0x0a, 0x10, 0x01, 0x0e, 0x00, // code section
      0x20, 0x00, // local.get 0
      0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, // f64.const 2.0
      0xa2, // f64.mul
      0x0b, // end
    ])

    it('should perform float64 multiplication', async () => {
      const { instance } = await WebAssembly.instantiate(wasmDouble)
      const double = instance.exports.double as (x: number) => number

      expect(double(21.0)).toBe(42.0)
      expect(double(1.5)).toBeCloseTo(3.0, 10)
      expect(double(-5.0)).toBe(-10.0)
    })

    it('should handle special float values', async () => {
      const { instance } = await WebAssembly.instantiate(wasmDouble)
      const double = instance.exports.double as (x: number) => number

      expect(double(Infinity)).toBe(Infinity)
      expect(double(-Infinity)).toBe(-Infinity)
      expect(Number.isNaN(double(NaN))).toBe(true)
    })
  })

  describe('Memory Import/Export', () => {
    it('should create and share memory between JS and WASM', async () => {
      // Test that memory can be created and shared
      const memory = new WebAssembly.Memory({ initial: 1, maximum: 10 })

      // Write from JavaScript
      const int32View = new Int32Array(memory.buffer)
      int32View[0] = 42
      int32View[1] = 100

      // Read back
      expect(int32View[0]).toBe(42)
      expect(int32View[1]).toBe(100)

      // Float64 operations
      const float64View = new Float64Array(memory.buffer)
      float64View[10] = 3.14159265359

      expect(float64View[10]).toBeCloseTo(3.14159265359, 10)
    })

    it('should handle memory buffer views correctly', () => {
      const memory = new WebAssembly.Memory({ initial: 1 })

      // Multiple views of the same buffer
      const u8 = new Uint8Array(memory.buffer)
      const i32 = new Int32Array(memory.buffer)
      const f64 = new Float64Array(memory.buffer)

      // Write as int32
      i32[0] = 0x12345678

      // Read as bytes
      expect(u8[0]).toBe(0x78) // Little-endian
      expect(u8[1]).toBe(0x56)
      expect(u8[2]).toBe(0x34)
      expect(u8[3]).toBe(0x12)
    })
  })
})

/**
 * Browser User Agent Detection
 * These patterns help identify browser types for compatibility reporting
 */
describe('Browser Detection Utilities', () => {
  const browserPatterns = {
    chrome: /Chrome\/(\d+)/,
    firefox: /Firefox\/(\d+)/,
    safari: /Safari\/(\d+).*Version\/(\d+)/,
    edge: /Edg\/(\d+)/,
    ie: /MSIE (\d+)|Trident.*rv:(\d+)/,
  }

  it('should have browser detection patterns', () => {
    expect(Object.keys(browserPatterns)).toContain('chrome')
    expect(Object.keys(browserPatterns)).toContain('firefox')
    expect(Object.keys(browserPatterns)).toContain('safari')
    expect(Object.keys(browserPatterns)).toContain('edge')
  })

  it('should detect Chrome user agent', () => {
    const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    const match = chromeUA.match(browserPatterns.chrome)
    expect(match).not.toBeNull()
    expect(match![1]).toBe('120')
  })

  it('should detect Firefox user agent', () => {
    const firefoxUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121'
    const match = firefoxUA.match(browserPatterns.firefox)
    expect(match).not.toBeNull()
    expect(match![1]).toBe('121')
  })
})

/**
 * Feature Support Matrix
 */
describe('WebAssembly Feature Support Matrix', () => {
  const wasmFeatures = {
    basic: true, // Basic WASM support
    streaming: typeof WebAssembly.compileStreaming === 'function',
    bigInt: typeof BigInt !== 'undefined',
    sharedMemory: (() => {
      try {
        new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true })
        return true
      } catch {
        return false
      }
    })(),
    simd: (() => {
      // SIMD detection via feature detection
      try {
        return WebAssembly.validate(new Uint8Array([
          0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
          0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
          0x03, 0x02, 0x01, 0x00,
          0x0a, 0x0a, 0x01, 0x08, 0x00, 0xfd, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x0b
        ]))
      } catch {
        return false
      }
    })()
  }

  it('should report basic WASM support', () => {
    expect(wasmFeatures.basic).toBe(true)
  })

  it('should report streaming compilation support', () => {
    // Node.js doesn't have compileStreaming
    // In browsers, this would typically be true
    console.log(`Streaming compilation: ${wasmFeatures.streaming ? 'supported' : 'not available'}`)
    expect(typeof wasmFeatures.streaming).toBe('boolean')
  })

  it('should report BigInt support', () => {
    expect(wasmFeatures.bigInt).toBe(true)
  })

  it('should detect SharedArrayBuffer support', () => {
    console.log(`SharedArrayBuffer: ${wasmFeatures.sharedMemory ? 'supported' : 'not available'}`)
    expect(typeof wasmFeatures.sharedMemory).toBe('boolean')
  })

  it('should generate feature support summary', () => {
    console.log('\n=== WebAssembly Feature Support ===')
    console.log(`Basic WASM:      ${wasmFeatures.basic ? 'YES' : 'NO'}`)
    console.log(`Streaming:       ${wasmFeatures.streaming ? 'YES' : 'NO'}`)
    console.log(`BigInt:          ${wasmFeatures.bigInt ? 'YES' : 'NO'}`)
    console.log(`SharedMemory:    ${wasmFeatures.sharedMemory ? 'YES' : 'NO'}`)
    console.log(`SIMD:            ${wasmFeatures.simd ? 'YES' : 'NO'}`)
    console.log('===================================\n')

    expect(wasmFeatures.basic).toBe(true)
  })
})

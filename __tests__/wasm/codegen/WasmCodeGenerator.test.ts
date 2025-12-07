/**
 * Tests for WasmCodeGenerator
 */

import { WasmCodeGenerator } from '@/lib/wasm/codegen/WasmCodeGenerator'
import type { Sheet } from '@/types/canvas'

describe('WasmCodeGenerator', () => {
  const createSimpleModel = (): Sheet[] => [
    {
      id: 'main',
      name: 'Main',
      blocks: [
        {
          id: 'input1',
          name: 'Input1',
          type: 'input_port',
          position: { x: 100, y: 100 },
          parameters: { portName: 'a', initialValue: 0 }
        },
        {
          id: 'input2',
          name: 'Input2',
          type: 'input_port',
          position: { x: 100, y: 200 },
          parameters: { portName: 'b', initialValue: 0 }
        },
        {
          id: 'gain1',
          name: 'Gain1',
          type: 'scale',
          position: { x: 300, y: 100 },
          parameters: { gain: 2.0 }
        },
        {
          id: 'output1',
          name: 'Output1',
          type: 'output_port',
          position: { x: 500, y: 100 },
          parameters: { portName: 'result' }
        }
      ],
      connections: [
        {
          id: 'wire1',
          source: 'input1',
          sourcePortIndex: 0,
          target: 'gain1',
          targetPortIndex: 0
        },
        {
          id: 'wire2',
          source: 'gain1',
          sourcePortIndex: 0,
          target: 'output1',
          targetPortIndex: 0
        }
      ],
      extents: { width: 800, height: 600 }
    }
  ]

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const generator = new WasmCodeGenerator()
      expect(generator).toBeInstanceOf(WasmCodeGenerator)
    })

    it('should create instance with custom options', () => {
      const generator = new WasmCodeGenerator({
        modelName: 'TestModel',
        includeEmscriptenExports: false,
        includeDebugFunctions: true
      })
      expect(generator).toBeInstanceOf(WasmCodeGenerator)
    })
  })

  describe('generateWasm', () => {
    it('should generate complete WASM code with all components', () => {
      const generator = new WasmCodeGenerator({ modelName: 'TestModel' })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      // Should have base code generator results
      expect(result.header).toBeTruthy()
      expect(result.source).toBeTruthy()
      expect(result.modelName).toBe('TestModel')

      // Should have WASM-specific results
      expect(result.wasmWrapper).toBeTruthy()
      expect(result.inputMap).toBeInstanceOf(Map)
      expect(result.outputMap).toBeInstanceOf(Map)

      // Check input/output mappings
      expect(result.inputMap.size).toBe(2)
      expect(result.inputMap.get('a')).toBe(0)
      expect(result.inputMap.get('b')).toBe(1)

      expect(result.outputMap.size).toBe(1)
      expect(result.outputMap.get('result')).toBe(0)
    })

    it('should include EMSCRIPTEN_KEEPALIVE by default', () => {
      const generator = new WasmCodeGenerator({ modelName: 'TestModel' })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.wasmWrapper).toContain('EMSCRIPTEN_KEEPALIVE')
      expect(result.wasmWrapper).toContain('#include <emscripten.h>')
    })

    it('should omit EMSCRIPTEN_KEEPALIVE when disabled', () => {
      const generator = new WasmCodeGenerator({
        modelName: 'TestModel',
        includeEmscriptenExports: false
      })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.wasmWrapper).not.toContain('EMSCRIPTEN_KEEPALIVE')
      expect(result.wasmWrapper).not.toContain('#include <emscripten.h>')
    })

    it('should include debug functions when enabled', () => {
      const generator = new WasmCodeGenerator({
        modelName: 'TestModel',
        includeDebugFunctions: true
      })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.wasmWrapper).toContain('wasm_get_input_count')
      expect(result.wasmWrapper).toContain('wasm_get_output_count')
      expect(result.wasmWrapper).toContain('wasm_get_input_name')
      expect(result.wasmWrapper).toContain('wasm_get_output_name')
      expect(result.wasmWrapper).toContain('input_names[]')
      expect(result.wasmWrapper).toContain('output_names[]')
    })

    it('should omit debug functions by default', () => {
      const generator = new WasmCodeGenerator({ modelName: 'TestModel' })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.wasmWrapper).not.toContain('wasm_get_input_count')
      expect(result.wasmWrapper).not.toContain('input_names[]')
    })
  })

  describe('WASM wrapper content', () => {
    it('should include wasm_init function', () => {
      const generator = new WasmCodeGenerator({ modelName: 'TestModel' })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.wasmWrapper).toContain('void wasm_init(double dt)')
      expect(result.wasmWrapper).toContain('TestModel_init(&TestModel_instance, dt)')
    })

    it('should include wasm_set_input function with switch cases', () => {
      const generator = new WasmCodeGenerator({ modelName: 'TestModel' })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.wasmWrapper).toContain('void wasm_set_input(int index, double value)')
      expect(result.wasmWrapper).toContain('switch(index)')
      expect(result.wasmWrapper).toContain('case 0:')
      expect(result.wasmWrapper).toContain('case 1:')
      expect(result.wasmWrapper).toContain('TestModel_instance.inputs.a')
      expect(result.wasmWrapper).toContain('TestModel_instance.inputs.b')
    })

    it('should include wasm_get_output function with switch cases', () => {
      const generator = new WasmCodeGenerator({ modelName: 'TestModel' })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.wasmWrapper).toContain('double wasm_get_output(int index)')
      expect(result.wasmWrapper).toContain('switch(index)')
      expect(result.wasmWrapper).toContain('case 0:')
      expect(result.wasmWrapper).toContain('return TestModel_instance.outputs.result')
    })

    it('should include wasm_step function', () => {
      const generator = new WasmCodeGenerator({ modelName: 'TestModel' })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.wasmWrapper).toContain('void wasm_step(double dt)')
      expect(result.wasmWrapper).toContain('TestModel_instance.dt = dt')
      expect(result.wasmWrapper).toContain('TestModel_step(&TestModel_instance)')
    })

    it('should include wasm_get_time function', () => {
      const generator = new WasmCodeGenerator({ modelName: 'TestModel' })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.wasmWrapper).toContain('double wasm_get_time()')
      expect(result.wasmWrapper).toContain('return TestModel_instance.time')
    })

    it('should include global model instance', () => {
      const generator = new WasmCodeGenerator({ modelName: 'TestModel' })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.wasmWrapper).toContain('static TestModel_t TestModel_instance = {0}')
    })

    it('should include model header file', () => {
      const generator = new WasmCodeGenerator({ modelName: 'TestModel' })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.wasmWrapper).toContain('#include "TestModel.h"')
    })
  })

  describe('input/output mapping', () => {
    it('should map input ports by index', () => {
      const generator = new WasmCodeGenerator({ modelName: 'TestModel' })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.inputMap.get('a')).toBe(0)
      expect(result.inputMap.get('b')).toBe(1)
    })

    it('should map output ports by index', () => {
      const generator = new WasmCodeGenerator({ modelName: 'TestModel' })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.outputMap.get('result')).toBe(0)
    })

    it('should handle models with no inputs', () => {
      const generator = new WasmCodeGenerator({ modelName: 'TestModel' })
      const model: Sheet[] = [
        {
          id: 'main',
          name: 'Main',
          blocks: [
            {
              id: 'constant1',
              name: 'Constant1',
              type: 'constant',
              position: { x: 100, y: 100 },
              parameters: { value: 1.0 }
            },
            {
              id: 'output1',
              name: 'Output1',
              type: 'output_port',
              position: { x: 300, y: 100 },
              parameters: { portName: 'out' }
            }
          ],
          connections: [
            {
              id: 'wire1',
              source: 'constant1',
              sourcePortIndex: 0,
              target: 'output1',
              targetPortIndex: 0
            }
          ],
          extents: { width: 800, height: 600 }
        }
      ]

      const result = generator.generateWasm(model)

      expect(result.inputMap.size).toBe(0)
      expect(result.outputMap.size).toBe(1)
      expect(result.wasmWrapper).toContain('void wasm_set_input')
    })

    it('should handle models with no outputs', () => {
      const generator = new WasmCodeGenerator({ modelName: 'TestModel' })
      const model: Sheet[] = [
        {
          id: 'main',
          name: 'Main',
          blocks: [
            {
              id: 'input1',
              name: 'Input1',
              type: 'input_port',
              position: { x: 100, y: 100 },
              parameters: { portName: 'a', initialValue: 0 }
            },
            {
              id: 'scope1',
              name: 'Scope1',
              type: 'scope',
              position: { x: 300, y: 100 },
              parameters: {}
            }
          ],
          connections: [
            {
              id: 'wire1',
              source: 'input1',
              sourcePortIndex: 0,
              target: 'scope1',
              targetPortIndex: 0
            }
          ],
          extents: { width: 800, height: 600 }
        }
      ]

      const result = generator.generateWasm(model)

      expect(result.inputMap.size).toBe(1)
      expect(result.outputMap.size).toBe(0)
      expect(result.wasmWrapper).toContain('double wasm_get_output')
      expect(result.wasmWrapper).toContain('// No scalar output ports defined')
    })
  })

  describe('model name sanitization', () => {
    it('should sanitize model names with spaces', () => {
      const generator = new WasmCodeGenerator({ modelName: 'Test Model' })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.wasmWrapper).toContain('Test_Model_instance')
      expect(result.wasmWrapper).not.toContain('Test Model_instance')
    })

    it('should sanitize model names with special characters', () => {
      const generator = new WasmCodeGenerator({ modelName: 'Test-Model@123' })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.wasmWrapper).toContain('Test_Model_123_instance')
    })
  })

  describe('debug functions content', () => {
    it('should generate correct input name array', () => {
      const generator = new WasmCodeGenerator({
        modelName: 'TestModel',
        includeDebugFunctions: true
      })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.wasmWrapper).toContain('static const char* input_names[] = {')
      expect(result.wasmWrapper).toContain('"a"')
      expect(result.wasmWrapper).toContain('"b"')
    })

    it('should generate correct output name array', () => {
      const generator = new WasmCodeGenerator({
        modelName: 'TestModel',
        includeDebugFunctions: true
      })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.wasmWrapper).toContain('static const char* output_names[] = {')
      expect(result.wasmWrapper).toContain('"result"')
    })

    it('should return correct input count', () => {
      const generator = new WasmCodeGenerator({
        modelName: 'TestModel',
        includeDebugFunctions: true
      })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.wasmWrapper).toContain('return 2;') // 2 inputs
    })

    it('should return correct output count', () => {
      const generator = new WasmCodeGenerator({
        modelName: 'TestModel',
        includeDebugFunctions: true
      })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      expect(result.wasmWrapper).toContain('return 1;') // 1 output
    })
  })

  describe('generated code validity', () => {
    it('should generate valid C syntax for wrapper', () => {
      const generator = new WasmCodeGenerator({ modelName: 'TestModel' })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      // Check for common C syntax elements
      expect(result.wasmWrapper).toContain('#include')
      expect(result.wasmWrapper).toContain('void')
      expect(result.wasmWrapper).toContain('double')
      expect(result.wasmWrapper).toContain('int')
      expect(result.wasmWrapper).toContain('switch')
      expect(result.wasmWrapper).toContain('case')
      expect(result.wasmWrapper).toContain('return')

      // Should not have unmatched braces
      const openBraces = (result.wasmWrapper.match(/{/g) || []).length
      const closeBraces = (result.wasmWrapper.match(/}/g) || []).length
      expect(openBraces).toBe(closeBraces)

      // Should not have unmatched parentheses
      const openParens = (result.wasmWrapper.match(/\(/g) || []).length
      const closeParens = (result.wasmWrapper.match(/\)/g) || []).length
      expect(openParens).toBe(closeParens)
    })

    it('should generate valid C header file', () => {
      const generator = new WasmCodeGenerator({ modelName: 'TestModel' })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      // Header should have include guards
      expect(result.header).toContain('#ifndef')
      expect(result.header).toContain('#define')
      expect(result.header).toContain('#endif')

      // Should have model struct typedef
      expect(result.header).toContain('typedef struct')
    })

    it('should generate valid C source file', () => {
      const generator = new WasmCodeGenerator({ modelName: 'TestModel' })
      const model = createSimpleModel()

      const result = generator.generateWasm(model)

      // Source should include header
      expect(result.source).toContain('#include')

      // Should have init and step functions
      expect(result.source).toContain('_init')
      expect(result.source).toContain('_step')
    })
  })
})

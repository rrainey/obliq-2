/**
 * Test suite for compiling actual generated models to WebAssembly
 *
 * This test:
 * 1. Creates a simple test model
 * 2. Generates C code using existing CodeGenerator
 * 3. Compiles the C code to WASM using Emscripten
 * 4. Loads and executes the WASM module
 * 5. Verifies outputs match expected values
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { WasmCodeGenerator } from '@/lib/wasm/codegen/WasmCodeGenerator';
import type { Sheet } from '@/types/canvas';

const execAsync = promisify(exec);

describe('Model to WASM Compilation', () => {
  const projectRoot = path.join(__dirname, '../..');
  const fixturesDir = path.join(__dirname, 'fixtures');
  const dockerImage = 'obliq-emscripten:test';
  const outputDir = path.join(fixturesDir, 'model-output');

  jest.setTimeout(300000); // 5 minutes

  beforeAll(async () => {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up output directory
    // Uncomment to enable cleanup:
    // await fs.rm(outputDir, { recursive: true, force: true });
  });

  /**
   * Helper function to create a simple test model
   */
  function createSimpleTestModel(): Sheet[] {
    return [
      {
        id: 'main',
        name: 'Main',
        blocks: [
          {
            id: 'input1',
            name: 'Input1',
            type: 'input_port',
            position: { x: 100, y: 100 },
            parameters: {
              portName: 'a',
              initialValue: 0
            }
          },
          {
            id: 'input2',
            name: 'Input2',
            type: 'input_port',
            position: { x: 100, y: 200 },
            parameters: {
              portName: 'b',
              initialValue: 0
            }
          },
          {
            id: 'sum1',
            name: 'Sum1',
            type: 'sum',
            position: { x: 300, y: 150 },
            parameters: {
              signs: '++'
            }
          },
          {
            id: 'gain1',
            name: 'Gain1',
            type: 'scale',
            position: { x: 500, y: 150 },
            parameters: {
              gain: 2.0
            }
          },
          {
            id: 'output1',
            name: 'Output1',
            type: 'output_port',
            position: { x: 700, y: 150 },
            parameters: {
              portName: 'result'
            }
          }
        ],
        connections: [
          {
            id: 'wire1',
            sourceBlockId: 'input1',
            sourcePortIndex: 0,
            targetBlockId: 'sum1',
            targetPortIndex: 0
          },
          {
            id: 'wire2',
            sourceBlockId: 'input2',
            sourcePortIndex: 0,
            targetBlockId: 'sum1',
            targetPortIndex: 1
          },
          {
            id: 'wire3',
            sourceBlockId: 'sum1',
            sourcePortIndex: 0,
            targetBlockId: 'gain1',
            targetPortIndex: 0
          },
          {
            id: 'wire4',
            sourceBlockId: 'gain1',
            sourcePortIndex: 0,
            targetBlockId: 'output1',
            targetPortIndex: 0
          }
        ],
        extents: { width: 1000, height: 600 }
      }
    ];
  }

  describe('C Code Generation', () => {
    let generatedCode: { header: string; source: string; wasmWrapper: string };

    it('should generate C code from test model using WasmCodeGenerator', () => {
      const model = createSimpleTestModel();

      // Use WasmCodeGenerator which includes WASM wrapper generation
      const generator = new WasmCodeGenerator({ modelName: 'model' });
      const result = generator.generateWasm(model);

      // Code generation should succeed (warnings are okay)
      expect(result.header).toBeTruthy();
      expect(result.source).toBeTruthy();
      expect(result.wasmWrapper).toBeTruthy();

      // Verify key structures are present
      expect(result.header).toContain('typedef struct');
      expect(result.header).toContain('model_inputs_t');
      expect(result.header).toContain('model_outputs_t');
      expect(result.source).toContain('void model_evaluate_algebraic');

      // Verify WASM wrapper includes expected functions
      expect(result.wasmWrapper).toContain('wasm_init');
      expect(result.wasmWrapper).toContain('wasm_set_input');
      expect(result.wasmWrapper).toContain('wasm_get_output');
      expect(result.wasmWrapper).toContain('wasm_step');
      expect(result.wasmWrapper).toContain('EMSCRIPTEN_KEEPALIVE');

      // Verify input/output mappings
      expect(result.inputMap.get('a')).toBe(0);
      expect(result.inputMap.get('b')).toBe(1);
      expect(result.outputMap.get('result')).toBe(0);

      generatedCode = result;

      console.log('Generated header length:', result.header.length);
      console.log('Generated source length:', result.source.length);
      console.log('Generated WASM wrapper length:', result.wasmWrapper.length);
    });

    it('should write generated C files to disk', async () => {
      const headerPath = path.join(outputDir, 'model.h');
      const sourcePath = path.join(outputDir, 'model.c');
      const wrapperPath = path.join(outputDir, 'model_wasm.c');

      await fs.writeFile(headerPath, generatedCode.header);
      await fs.writeFile(sourcePath, generatedCode.source);
      await fs.writeFile(wrapperPath, generatedCode.wasmWrapper);

      const headerExists = await fs.access(headerPath).then(() => true).catch(() => false);
      const sourceExists = await fs.access(sourcePath).then(() => true).catch(() => false);
      const wrapperExists = await fs.access(wrapperPath).then(() => true).catch(() => false);

      expect(headerExists).toBe(true);
      expect(sourceExists).toBe(true);
      expect(wrapperExists).toBe(true);
    });
  });

  describe('WASM Compilation with Emscripten', () => {
    it('should compile generated C code to WASM', async () => {
      console.log('Compiling model to WebAssembly...');

      // The WASM wrapper is already generated by WasmCodeGenerator and written to disk
      // Now compile with Emscripten using Docker
      const isWindows = process.platform === 'win32';
      const compileCmd = isWindows
        ? `docker run --rm -v "${outputDir}:/workspace" ${dockerImage} ` +
          `emcc /workspace/model.c /workspace/model_wasm.c ` +
          `-I/workspace -o /workspace/model.js ` +
          `-s WASM=1 ` +
          `-s "EXPORTED_FUNCTIONS=[\\"_wasm_init\\",\\"_wasm_set_input\\",\\"_wasm_get_output\\",\\"_wasm_step\\",\\"_wasm_get_time\\",\\"_malloc\\",\\"_free\\"]" ` +
          `-s "EXPORTED_RUNTIME_METHODS=[\\"ccall\\",\\"cwrap\\"]" ` +
          `-s MODULARIZE=1 ` +
          `-s "EXPORT_NAME=createModelModule" ` +
          `-s ALLOW_MEMORY_GROWTH=1 ` +
          `-s INITIAL_MEMORY=16MB ` +
          `-O2 -lm`
        : `docker run --rm -v "${outputDir}:/workspace" ${dockerImage} ` +
          `emcc /workspace/model.c /workspace/model_wasm.c ` +
          `-I/workspace -o /workspace/model.js ` +
          `-s WASM=1 ` +
          `-s 'EXPORTED_FUNCTIONS=["_wasm_init","_wasm_set_input","_wasm_get_output","_wasm_step","_wasm_get_time","_malloc","_free"]' ` +
          `-s 'EXPORTED_RUNTIME_METHODS=["ccall","cwrap"]' ` +
          `-s MODULARIZE=1 ` +
          `-s 'EXPORT_NAME=createModelModule' ` +
          `-s ALLOW_MEMORY_GROWTH=1 ` +
          `-s INITIAL_MEMORY=16MB ` +
          `-O2 -lm`;

      const { stdout, stderr } = await execAsync(compileCmd);

      if (stdout) console.log('Compilation output:', stdout);
      if (stderr) console.log('Compilation warnings:', stderr);

      // Verify output files
      const jsExists = await fs.access(path.join(outputDir, 'model.js'))
        .then(() => true)
        .catch(() => false);
      const wasmExists = await fs.access(path.join(outputDir, 'model.wasm'))
        .then(() => true)
        .catch(() => false);

      expect(jsExists).toBe(true);
      expect(wasmExists).toBe(true);

      const jsStats = await fs.stat(path.join(outputDir, 'model.js'));
      const wasmStats = await fs.stat(path.join(outputDir, 'model.wasm'));

      console.log(`Generated model.js: ${jsStats.size} bytes`);
      console.log(`Generated model.wasm: ${wasmStats.size} bytes`);
    });
  });

  describe('WASM Execution', () => {
    it('should load and execute the compiled WASM model', async () => {
      console.log('Loading and executing WASM model...');

      const modelJsPath = path.join(outputDir, 'model.js');
      const createModule = require(modelJsPath);
      const module = await createModule();

      // Verify exported functions exist
      expect(typeof module._wasm_init).toBe('function');
      expect(typeof module._wasm_set_input).toBe('function');
      expect(typeof module._wasm_get_output).toBe('function');
      expect(typeof module._wasm_step).toBe('function');

      // Initialize model with dt=0.01 (10ms timestep)
      module._wasm_init(0.01);

      // Test 1: a=2, b=3 => sum=5 => gain(2.0) => result=10
      module._wasm_set_input(0, 2.0); // a = 2
      module._wasm_set_input(1, 3.0); // b = 3
      module._wasm_step(0.01);

      const result1 = module._wasm_get_output(0);
      console.log('Test 1: a=2, b=3 => result =', result1, '(expected 10.0)');
      expect(result1).toBeCloseTo(10.0, 10);

      // Test 2: a=5, b=-2 => sum=3 => gain(2.0) => result=6
      module._wasm_set_input(0, 5.0); // a = 5
      module._wasm_set_input(1, -2.0); // b = -2
      module._wasm_step(0.01);

      const result2 = module._wasm_get_output(0);
      console.log('Test 2: a=5, b=-2 => result =', result2, '(expected 6.0)');
      expect(result2).toBeCloseTo(6.0, 10);

      // Test 3: a=0, b=0 => sum=0 => gain(2.0) => result=0
      module._wasm_set_input(0, 0.0);
      module._wasm_set_input(1, 0.0);
      module._wasm_step(0.01);

      const result3 = module._wasm_get_output(0);
      console.log('Test 3: a=0, b=0 => result =', result3, '(expected 0.0)');
      expect(result3).toBeCloseTo(0.0, 10);

      console.log('✓ All model execution tests passed!');
    });

    it('should maintain state across multiple steps', async () => {
      const modelJsPath = path.join(outputDir, 'model.js');
      const createModule = require(modelJsPath);
      const module = await createModule();

      module._wasm_init(0.01);

      // Run multiple steps and verify time progression
      module._wasm_set_input(0, 1.0);
      module._wasm_set_input(1, 1.0);

      for (let i = 0; i < 10; i++) {
        module._wasm_step(0.01);
      }

      const time = module._wasm_get_time();
      console.log('After 10 steps (dt=0.01):', time, 'seconds');
      expect(time).toBeCloseTo(0.1, 10);

      // Output should be consistent (2.0 * 2 = 4.0)
      const result = module._wasm_get_output(0);
      expect(result).toBeCloseTo(4.0, 10);
    });
  });
});

/**
 * Test suite for Emscripten setup and basic WASM compilation
 *
 * This test verifies that:
 * 1. Emscripten Docker image can be built
 * 2. Simple C code can be compiled to WASM
 * 3. The compiled WASM module can be loaded and executed
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

describe('Emscripten Setup', () => {
  const projectRoot = path.join(__dirname, '../..');
  const dockerDir = path.join(projectRoot, '__tests__/wasm/docker');
  const fixturesDir = path.join(projectRoot, '__tests__/wasm/fixtures');
  const dockerImage = 'obliq-emscripten:test';

  // Increase timeout for Docker operations
  jest.setTimeout(300000); // 5 minutes

  describe('Docker Image Build', () => {
    it('should build Emscripten Docker image successfully', async () => {
      console.log('Building Emscripten Docker image...');

      const { stdout, stderr } = await execAsync(
        `docker build -t ${dockerImage} -f "${path.join(dockerDir, 'Dockerfile.emscripten')}" "${dockerDir}"`
      );

      console.log('Build output:', stdout);
      if (stderr) console.log('Build warnings:', stderr);

      // Verify image exists
      const { stdout: images } = await execAsync(`docker images ${dockerImage} --format "{{.Repository}}:{{.Tag}}"`);
      expect(images).toContain(dockerImage);
    });

    it('should have Emscripten compiler available in image', async () => {
      console.log('Verifying Emscripten installation...');

      const { stdout } = await execAsync(
        `docker run --rm ${dockerImage} emcc --version`
      );

      console.log('Emscripten version:', stdout);
      expect(stdout).toContain('emcc');
      expect(stdout).toContain('Emscripten');
    });
  });

  describe('Basic WASM Compilation', () => {
    beforeAll(async () => {
      // Clean up any previous compilation artifacts
      try {
        await fs.unlink(path.join(fixturesDir, 'hello.js'));
        await fs.unlink(path.join(fixturesDir, 'hello.wasm'));
      } catch (error) {
        // Files may not exist, that's okay
      }
    });

    it('should compile hello.c to WASM', async () => {
      console.log('Compiling hello.c to WebAssembly...');

      // Use PowerShell script for compilation on Windows for better reliability
      const isWindows = process.platform === 'win32';
      const scriptPath = path.join(projectRoot, '__tests__/wasm/scripts',
        isWindows ? 'compile-hello-docker.ps1' : 'compile-hello-docker.sh');

      let compileCmd;
      if (isWindows) {
        compileCmd = `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`;
      } else {
        compileCmd = `bash "${scriptPath}"`;
      }

      const { stdout, stderr } = await execAsync(compileCmd);

      if (stdout) console.log('Compilation output:', stdout);
      if (stderr) console.log('Compilation warnings:', stderr);

      // Verify output files exist
      const jsExists = await fs.access(path.join(fixturesDir, 'hello.js'))
        .then(() => true)
        .catch(() => false);
      const wasmExists = await fs.access(path.join(fixturesDir, 'hello.wasm'))
        .then(() => true)
        .catch(() => false);

      expect(jsExists).toBe(true);
      expect(wasmExists).toBe(true);

      // Check file sizes are reasonable
      const jsStats = await fs.stat(path.join(fixturesDir, 'hello.js'));
      const wasmStats = await fs.stat(path.join(fixturesDir, 'hello.wasm'));

      console.log(`Generated hello.js: ${jsStats.size} bytes`);
      console.log(`Generated hello.wasm: ${wasmStats.size} bytes`);

      expect(jsStats.size).toBeGreaterThan(1000); // At least 1KB
      expect(wasmStats.size).toBeGreaterThan(100); // At least 100 bytes
    });

    it('should be able to load and execute WASM module in Node.js', async () => {
      console.log('Loading and executing WASM module...');

      // Load the Emscripten-generated JS file
      const helloJsPath = path.join(fixturesDir, 'hello.js');

      // Dynamic import of the module
      const createModule = require(helloJsPath);
      const module = await createModule();

      // Test exported functions
      expect(typeof module._add).toBe('function');
      expect(typeof module._multiply).toBe('function');
      expect(typeof module._compute_sin).toBe('function');

      // Test function execution
      const addResult = module._add(2.0, 3.0);
      expect(addResult).toBeCloseTo(5.0, 10);

      const multiplyResult = module._multiply(2.0, 3.0);
      expect(multiplyResult).toBeCloseTo(6.0, 10);

      const sinResult = module._compute_sin(Math.PI / 2);
      expect(sinResult).toBeCloseTo(1.0, 10);

      // Test edge cases
      expect(module._add(0, 0)).toBeCloseTo(0, 10);
      expect(module._add(-1, 1)).toBeCloseTo(0, 10);
      expect(module._multiply(0, 5)).toBeCloseTo(0, 10);
      expect(module._multiply(-2, 3)).toBeCloseTo(-6, 10);
      expect(module._compute_sin(0)).toBeCloseTo(0, 10);

      console.log('✓ All WASM function tests passed!');
    });
  });

  describe('Cleanup', () => {
    it('should clean up test artifacts', async () => {
      // Optional: clean up generated files after tests
      // Uncomment if you want auto-cleanup:
      // await fs.unlink(path.join(fixturesDir, 'hello.js'));
      // await fs.unlink(path.join(fixturesDir, 'hello.wasm'));

      // For now, keep files for manual browser testing
      console.log('Test artifacts kept in:', fixturesDir);
      console.log('Run "python -m http.server 8000" in that directory to test in browser');
      expect(true).toBe(true);
    });
  });
});

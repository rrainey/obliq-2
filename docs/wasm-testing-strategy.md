# Testing Strategy for WebAssembly Simulation Architecture

## Overview

This document outlines the complete testing strategy for the WebAssembly-based simulation system, replacing the previous JavaScript simulation engine tests with equivalent Wasm-based tests.

## Testing Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Test Layers                              │
│                                                              │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Unit Tests (Jest)                                  │   │
│  │  - Code generation                                  │   │
│  │  - Cache management                                 │   │
│  │  - Model hashing                                    │   │
│  │  - Type validation                                  │   │
│  └────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Integration Tests (Jest + Docker)                  │   │
│  │  - Emscripten compilation                           │   │
│  │  - Wasm module loading                              │   │
│  │  - API endpoint testing                             │   │
│  │  - Supabase Storage caching                         │   │
│  └────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌────────────────────────────────────────────────────┐   │
│  │  E2E Tests (Playwright)                             │   │
│  │  - Full user workflows                              │   │
│  │  - UI interactions                                  │   │
│  │  - Simulation visualization                         │   │
│  └────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌────────────────────────────────────────────────────┐   │
│  │  Cross-Validation Tests                             │   │
│  │  - Wasm vs Reference results                        │   │
│  │  - Numerical accuracy verification                  │   │
│  │  - Multi-block model validation                     │   │
│  └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Test Infrastructure Setup

### 1. Docker Environment for Emscripten

**File:** `__tests__/docker/Dockerfile.emscripten`

```dockerfile
FROM node:20-alpine

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    cmake \
    ninja \
    git \
    build-base

# Install Emscripten SDK
WORKDIR /opt
RUN git clone --depth 1 https://github.com/emscripten-core/emsdk.git
WORKDIR /opt/emsdk
RUN ./emsdk install 3.1.50
RUN ./emsdk activate 3.1.50

# Set environment variables
ENV PATH="/opt/emsdk:/opt/emsdk/upstream/emscripten:${PATH}"
ENV EMSDK="/opt/emsdk"
ENV EM_CONFIG="/opt/emsdk/.emscripten"

# Create working directory
WORKDIR /app

# Verify Emscripten installation
RUN emcc --version

CMD ["/bin/sh"]
```

### 2. Test Database Schema

**File:** `__tests__/fixtures/test-schema.sql`

```sql
-- Wasm cache metadata table
CREATE TABLE IF NOT EXISTS wasm_cache_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL,
  model_hash TEXT NOT NULL,
  cache_key TEXT NOT NULL UNIQUE,
  wasm_path TEXT NOT NULL,
  js_path TEXT NOT NULL,
  compilation_time_ms INTEGER NOT NULL,
  optimization_level TEXT NOT NULL,
  wasm_size_bytes INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  access_count INTEGER DEFAULT 0
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_wasm_cache_model_hash 
  ON wasm_cache_metadata(model_id, model_hash);
CREATE INDEX IF NOT EXISTS idx_wasm_cache_key 
  ON wasm_cache_metadata(cache_key);

-- Compilation metrics table
CREATE TABLE IF NOT EXISTS wasm_compilation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL,
  user_id UUID,
  cache_hit BOOLEAN NOT NULL,
  compilation_time_ms INTEGER,
  block_count INTEGER NOT NULL,
  optimization_level TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Simulation performance metrics
CREATE TABLE IF NOT EXISTS wasm_simulation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL,
  user_id UUID,
  cache_key TEXT NOT NULL,
  steps_executed INTEGER NOT NULL,
  total_time_ms INTEGER NOT NULL,
  avg_step_time_us FLOAT NOT NULL,
  peak_memory_mb FLOAT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. Test Utilities

**File:** `__tests__/utils/wasmTestUtils.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'

const execAsync = promisify(exec)

export class WasmTestUtils {
  private supabase: any
  private testBucket = 'wasm-cache-test'
  
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  
  async setupTestEnvironment() {
    // Create test bucket if it doesn't exist
    const { data: buckets } = await this.supabase.storage.listBuckets()
    const bucketExists = buckets.some((b: any) => b.name === this.testBucket)
    
    if (!bucketExists) {
      await this.supabase.storage.createBucket(this.testBucket, {
        public: false,
        fileSizeLimit: 10485760, // 10MB
      })
    }
    
    // Clean test data
    await this.cleanTestData()
  }
  
  async cleanTestData() {
    // Delete all files from test bucket
    const { data: files } = await this.supabase.storage
      .from(this.testBucket)
      .list()
    
    if (files && files.length > 0) {
      const filePaths = files.map((f: any) => f.name)
      await this.supabase.storage
        .from(this.testBucket)
        .remove(filePaths)
    }
    
    // Clear metadata table
    await this.supabase
      .from('wasm_cache_metadata')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
  }
  
  async compileModelToWasm(
    modelJson: any,
    options: { optimizationLevel?: string } = {}
  ): Promise<{ wasmPath: string; jsPath: string; compilationTime: number }> {
    const tempDir = await fs.mkdtemp('/tmp/wasm-test-')
    
    try {
      // Generate C code (use actual code generator)
      const { generateCCode } = await import('@/lib/codeGeneration')
      const { sourceCode, headerCode, wasmInterface } = generateCCode(modelJson)
      
      // Write files
      await fs.writeFile(path.join(tempDir, 'model.h'), headerCode)
      await fs.writeFile(path.join(tempDir, 'model.c'), sourceCode)
      await fs.writeFile(path.join(tempDir, 'wasm.c'), wasmInterface)
      
      // Compile with Emscripten
      const optLevel = options.optimizationLevel || 'O2'
      const startTime = Date.now()
      
      await execAsync(`
        docker run --rm \
          -v ${tempDir}:/work \
          obliq-emscripten:test \
          emcc /work/model.c /work/wasm.c \
            -o /work/model.js \
            -s WASM=1 \
            -s EXPORTED_FUNCTIONS='["_model_init","_model_step","_model_set_input","_model_get_output","_malloc","_free"]' \
            -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","getValue","HEAPF64"]' \
            -s MODULARIZE=1 \
            -s EXPORT_NAME='createModelModule' \
            -${optLevel} \
            -lm
      `)
      
      const compilationTime = Date.now() - startTime
      
      return {
        wasmPath: path.join(tempDir, 'model.wasm'),
        jsPath: path.join(tempDir, 'model.js'),
        compilationTime
      }
    } catch (error) {
      await fs.rm(tempDir, { recursive: true, force: true })
      throw error
    }
  }
  
  async loadWasmModule(jsPath: string): Promise<any> {
    // Dynamic import of the generated JS file
    const createModule = require(jsPath)
    return await createModule.default()
  }
  
  async cacheWasmFiles(
    cacheKey: string,
    wasmPath: string,
    jsPath: string,
    metadata: any
  ) {
    // Upload to Supabase Storage
    const wasmData = await fs.readFile(wasmPath)
    const jsData = await fs.readFile(jsPath)
    
    await this.supabase.storage
      .from(this.testBucket)
      .upload(`${cacheKey}.wasm`, wasmData, { upsert: true })
    
    await this.supabase.storage
      .from(this.testBucket)
      .upload(`${cacheKey}.js`, jsData, { upsert: true })
    
    // Store metadata
    await this.supabase
      .from('wasm_cache_metadata')
      .upsert({
        cache_key: cacheKey,
        wasm_path: `${this.testBucket}/${cacheKey}.wasm`,
        js_path: `${this.testBucket}/${cacheKey}.js`,
        ...metadata
      })
  }
  
  async getCachedWasmModule(cacheKey: string): Promise<any | null> {
    // Check metadata
    const { data: metadata } = await this.supabase
      .from('wasm_cache_metadata')
      .select('*')
      .eq('cache_key', cacheKey)
      .single()
    
    if (!metadata) return null
    
    // Download JS file
    const { data: jsData } = await this.supabase.storage
      .from(this.testBucket)
      .download(`${cacheKey}.js`)
    
    if (!jsData) return null
    
    // Write to temp file and load
    const tempPath = `/tmp/${cacheKey}.js`
    await fs.writeFile(tempPath, await jsData.text())
    
    return this.loadWasmModule(tempPath)
  }
}
```

## Unit Tests

### 1. Code Generation Tests

**File:** `__tests__/unit/codegen/WasmCodeGenerator.test.ts`

```typescript
import { WasmCodeGenerator } from '@/lib/codegen/WasmCodeGenerator'
import { createTestModel } from '@/__tests__/fixtures/modelFixtures'

describe('WasmCodeGenerator', () => {
  let generator: WasmCodeGenerator
  
  beforeEach(() => {
    const model = createTestModel('simple-sum')
    generator = new WasmCodeGenerator(model)
  })
  
  describe('Interface Generation', () => {
    it('should generate init function with EMSCRIPTEN_KEEPALIVE', () => {
      const code = generator.generateWasmInterface()
      
      expect(code).toContain('EMSCRIPTEN_KEEPALIVE')
      expect(code).toMatch(/void\* \w+_model_init\(double dt\)/)
      expect(code).toContain('malloc(sizeof(')
    })
    
    it('should generate set_input function with switch statement', () => {
      const code = generator.generateWasmInterface()
      
      expect(code).toContain('_model_set_input')
      expect(code).toMatch(/switch\s*\(\s*index\s*\)/)
      expect(code).toContain('model->inputs.')
    })
    
    it('should generate get_output function', () => {
      const code = generator.generateWasmInterface()
      
      expect(code).toContain('_model_get_output')
      expect(code).toContain('return model->outputs.')
    })
    
    it('should generate scope data accessor', () => {
      const model = createTestModel('with-logger')
      generator = new WasmCodeGenerator(model)
      const code = generator.generateWasmInterface()
      
      expect(code).toContain('_model_get_scope_data')
      expect(code).toContain('*length =')
    })
    
    it('should generate destroy function', () => {
      const code = generator.generateWasmInterface()
      
      expect(code).toContain('_model_destroy')
      expect(code).toContain('free(model)')
    })
  })
  
  describe('Type Generation', () => {
    it('should generate TypeScript types', () => {
      const types = generator.generateTypeScriptTypes()
      
      expect(types).toContain('export interface')
      expect(types).toContain('Inputs')
      expect(types).toContain('Outputs')
      expect(types).toContain('ModelModule')
    })
    
    it('should generate index maps', () => {
      const maps = generator.generateIndexMaps()
      
      expect(maps).toContain('INPUT_INDEX_MAP')
      expect(maps).toContain('OUTPUT_INDEX_MAP')
      expect(maps).toContain('as const')
    })
  })
  
  describe('Core Logic Generation', () => {
    it('should generate algebraic evaluation function', () => {
      const code = generator.generateCoreLogic()
      
      expect(code).toContain('_evaluate_algebraic')
      expect(code).toMatch(/void \w+_evaluate_algebraic/)
    })
    
    it('should generate RK4 integration', () => {
      const model = createTestModel('with-transfer-function')
      generator = new WasmCodeGenerator(model)
      const code = generator.generateCoreLogic()
      
      expect(code).toContain('integrate_states')
      expect(code).toContain('k1, k2, k3, k4')
    })
  })
})
```

### 2. Cache Management Tests

**File:** `__tests__/unit/cache/SupabaseCacheManager.test.ts`

```typescript
import { SupabaseCacheManager } from '@/lib/cache/SupabaseCacheManager'
import { WasmTestUtils } from '@/__tests__/utils/wasmTestUtils'

describe('SupabaseCacheManager', () => {
  let cacheManager: SupabaseCacheManager
  let testUtils: WasmTestUtils
  
  beforeAll(async () => {
    testUtils = new WasmTestUtils()
    await testUtils.setupTestEnvironment()
  })
  
  beforeEach(() => {
    cacheManager = new SupabaseCacheManager()
  })
  
  afterEach(async () => {
    await testUtils.cleanTestData()
  })
  
  describe('Cache Operations', () => {
    it('should store and retrieve wasm files', async () => {
      const modelJson = { /* test model */ }
      const cacheKey = 'test-cache-key-123'
      const wasmData = Buffer.from('fake wasm data')
      const jsData = Buffer.from('fake js data')
      
      await cacheManager.store(cacheKey, {
        wasmData,
        jsData,
        metadata: {
          modelHash: 'abc123',
          compilationTime: 1000,
          optimizationLevel: 'O2'
        }
      })
      
      const cached = await cacheManager.get(cacheKey)
      expect(cached).not.toBeNull()
      expect(cached!.metadata.compilationTime).toBe(1000)
    })
    
    it('should return null for non-existent cache', async () => {
      const cached = await cacheManager.get('non-existent-key')
      expect(cached).toBeNull()
    })
    
    it('should update access count on retrieval', async () => {
      const cacheKey = 'access-test-key'
      await cacheManager.store(cacheKey, {
        wasmData: Buffer.from('data'),
        jsData: Buffer.from('data'),
        metadata: { modelHash: 'abc' }
      })
      
      await cacheManager.get(cacheKey)
      await cacheManager.get(cacheKey)
      
      const metadata = await cacheManager.getMetadata(cacheKey)
      expect(metadata!.accessCount).toBe(2)
    })
    
    it('should clean up old cache entries', async () => {
      // Create 15 old cache entries
      for (let i = 0; i < 15; i++) {
        await cacheManager.store(`old-key-${i}`, {
          wasmData: Buffer.from('data'),
          jsData: Buffer.from('data'),
          metadata: { modelHash: `hash${i}` }
        })
      }
      
      // Set their timestamp to 31 days ago
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 31)
      
      // Run cleanup
      const cleaned = await cacheManager.cleanupOldEntries(30)
      expect(cleaned).toBe(15)
    })
  })
  
  describe('Model Hash', () => {
    it('should generate consistent hash for same model', () => {
      const model1 = { sheets: [{ blocks: [{ type: 'sum' }] }] }
      const model2 = { sheets: [{ blocks: [{ type: 'sum' }] }] }
      
      const hash1 = cacheManager.hashModel(model1)
      const hash2 = cacheManager.hashModel(model2)
      
      expect(hash1).toBe(hash2)
    })
    
    it('should generate different hash for different models', () => {
      const model1 = { sheets: [{ blocks: [{ type: 'sum' }] }] }
      const model2 = { sheets: [{ blocks: [{ type: 'multiply' }] }] }
      
      const hash1 = cacheManager.hashModel(model1)
      const hash2 = cacheManager.hashModel(model2)
      
      expect(hash1).not.toBe(hash2)
    })
    
    it('should ignore non-structural changes', () => {
      const model1 = { 
        sheets: [{ blocks: [{ type: 'sum', position: { x: 0, y: 0 } }] }] 
      }
      const model2 = { 
        sheets: [{ blocks: [{ type: 'sum', position: { x: 100, y: 50 } }] }] 
      }
      
      const hash1 = cacheManager.hashModel(model1)
      const hash2 = cacheManager.hashModel(model2)
      
      expect(hash1).toBe(hash2)
    })
  })
})
```

### 3. Model Hashing Tests

**File:** `__tests__/unit/utils/modelHash.test.ts`

```typescript
import { hashModel, hashModelForCache } from '@/lib/utils/modelHash'

describe('Model Hashing', () => {
  it('should hash only structural elements', () => {
    const model = {
      id: 'test-id',
      name: 'Test Model',
      sheets: [{
        blocks: [
          { id: 'b1', type: 'sum', position: { x: 0, y: 0 }, parameters: { a: 1 } },
          { id: 'b2', type: 'multiply', position: { x: 100, y: 0 }, parameters: { b: 2 } }
        ],
        connections: [
          { source: 'b1', target: 'b2' }
        ]
      }]
    }
    
    const hash = hashModel(model)
    expect(hash).toHaveLength(16)
    expect(hash).toMatch(/^[a-f0-9]+$/)
  })
  
  it('should be stable across runs', () => {
    const model = { sheets: [{ blocks: [{ type: 'sum' }] }] }
    
    const hash1 = hashModel(model)
    const hash2 = hashModel(model)
    const hash3 = hashModel(model)
    
    expect(hash1).toBe(hash2)
    expect(hash2).toBe(hash3)
  })
  
  it('should include block parameters', () => {
    const model1 = { 
      sheets: [{ blocks: [{ type: 'scale', parameters: { gain: 2.0 } }] }] 
    }
    const model2 = { 
      sheets: [{ blocks: [{ type: 'scale', parameters: { gain: 3.0 } }] }] 
    }
    
    expect(hashModel(model1)).not.toBe(hashModel(model2))
  })
  
  it('should exclude UI-only properties', () => {
    const model1 = { 
      sheets: [{ 
        blocks: [{ type: 'sum', name: 'Sum1', position: { x: 0, y: 0 } }] 
      }] 
    }
    const model2 = { 
      sheets: [{ 
        blocks: [{ type: 'sum', name: 'Sum2', position: { x: 50, y: 100 } }] 
      }] 
    }
    
    expect(hashModel(model1)).toBe(hashModel(model2))
  })
})
```

## Integration Tests

### 1. Compilation Pipeline Tests

**File:** `__tests__/integration/compilation/wasmCompilation.test.ts`

```typescript
import { WasmTestUtils } from '@/__tests__/utils/wasmTestUtils'
import { createTestModel } from '@/__tests__/fixtures/modelFixtures'

describe('Wasm Compilation Pipeline', () => {
  let testUtils: WasmTestUtils
  
  beforeAll(async () => {
    testUtils = new WasmTestUtils()
    await testUtils.setupTestEnvironment()
  })
  
  afterAll(async () => {
    await testUtils.cleanTestData()
  })
  
  describe('Basic Compilation', () => {
    it('should compile simple sum model', async () => {
      const model = createTestModel('simple-sum')
      
      const result = await testUtils.compileModelToWasm(model)
      
      expect(result.wasmPath).toBeTruthy()
      expect(result.jsPath).toBeTruthy()
      expect(result.compilationTime).toBeGreaterThan(0)
      expect(result.compilationTime).toBeLessThan(5000) // < 5 seconds
    })
    
    it('should compile transfer function model', async () => {
      const model = createTestModel('transfer-function')
      
      const result = await testUtils.compileModelToWasm(model)
      
      // Verify files exist
      const fs = require('fs/promises')
      const wasmExists = await fs.access(result.wasmPath).then(() => true).catch(() => false)
      const jsExists = await fs.access(result.jsPath).then(() => true).catch(() => false)
      
      expect(wasmExists).toBe(true)
      expect(jsExists).toBe(true)
    })
    
    it('should compile matrix operation model', async () => {
      const model = createTestModel('matrix-multiply')
      
      const result = await testUtils.compileModelToWasm(model)
      
      expect(result.compilationTime).toBeLessThan(10000) // < 10 seconds for complex model
    })
  })
  
  describe('Optimization Levels', () => {
    it('should compile faster with O0', async () => {
      const model = createTestModel('medium-model')
      
      const o0Result = await testUtils.compileModelToWasm(model, { optimizationLevel: 'O0' })
      const o2Result = await testUtils.compileModelToWasm(model, { optimizationLevel: 'O2' })
      
      expect(o0Result.compilationTime).toBeLessThan(o2Result.compilationTime)
    })
    
    it('should produce smaller binary with O2', async () => {
      const model = createTestModel('medium-model')
      const fs = require('fs/promises')
      
      const o0Result = await testUtils.compileModelToWasm(model, { optimizationLevel: 'O0' })
      const o2Result = await testUtils.compileModelToWasm(model, { optimizationLevel: 'O2' })
      
      const o0Stats = await fs.stat(o0Result.wasmPath)
      const o2Stats = await fs.stat(o2Result.wasmPath)
      
      expect(o2Stats.size).toBeLessThan(o0Stats.size)
    })
  })
  
  describe('Error Handling', () => {
    it('should fail gracefully on invalid C code', async () => {
      const invalidModel = createTestModel('invalid-syntax')
      
      await expect(
        testUtils.compileModelToWasm(invalidModel)
      ).rejects.toThrow()
    })
    
    it('should provide meaningful error messages', async () => {
      const invalidModel = createTestModel('type-mismatch')
      
      try {
        await testUtils.compileModelToWasm(invalidModel)
        fail('Should have thrown error')
      } catch (error: any) {
        expect(error.message).toContain('error:')
        // Should include line number
        expect(error.message).toMatch(/:\d+:/)
      }
    })
  })
})
```

### 2. Wasm Module Loading Tests

**File:** `__tests__/integration/wasm/wasmModuleLoading.test.ts`

```typescript
import { WasmTestUtils } from '@/__tests__/utils/wasmTestUtils'
import { createTestModel } from '@/__tests__/fixtures/modelFixtures'

describe('Wasm Module Loading', () => {
  let testUtils: WasmTestUtils
  
  beforeAll(async () => {
    testUtils = new WasmTestUtils()
    await testUtils.setupTestEnvironment()
  })
  
  describe('Module Initialization', () => {
    it('should load and initialize module', async () => {
      const model = createTestModel('simple-sum')
      const { jsPath } = await testUtils.compileModelToWasm(model)
      
      const module = await testUtils.loadWasmModule(jsPath)
      
      expect(module).toBeDefined()
      expect(module._model_init).toBeInstanceOf(Function)
      expect(module._model_step).toBeInstanceOf(Function)
    })
    
    it('should create model instance', async () => {
      const model = createTestModel('simple-sum')
      const { jsPath } = await testUtils.compileModelToWasm(model)
      const module = await testUtils.loadWasmModule(jsPath)
      
      const handle = module._model_init(0.01)
      
      expect(handle).toBeGreaterThan(0) // Valid pointer
      
      module._model_destroy(handle)
    })
  })
  
  describe('I/O Operations', () => {
    it('should set and get inputs', async () => {
      const model = createTestModel('simple-sum')
      const { jsPath } = await testUtils.compileModelToWasm(model)
      const module = await testUtils.loadWasmModule(jsPath)
      const handle = module._model_init(0.01)
      
      module._model_set_input(handle, 0, 3.0)
      module._model_set_input(handle, 1, 4.0)
      
      module._model_step(handle)
      
      const output = module._model_get_output(handle, 0)
      expect(output).toBeCloseTo(7.0, 10)
      
      module._model_destroy(handle)
    })
    
    it('should handle multiple steps', async () => {
      const model = createTestModel('transfer-function')
      const { jsPath } = await testUtils.compileModelToWasm(model)
      const module = await testUtils.loadWasmModule(jsPath)
      const handle = module._model_init(0.01)
      
      module._model_set_input(handle, 0, 1.0)
      
      const outputs = []
      for (let i = 0; i < 100; i++) {
        module._model_step(handle)
        outputs.push(module._model_get_output(handle, 0))
      }
      
      // Verify output changes over time (system dynamics)
      expect(outputs[0]).not.toBe(outputs[99])
      expect(Math.abs(outputs[99] - outputs[98])).toBeLessThan(0.01) // Converging
      
      module._model_destroy(handle)
    })
  })
  
  describe('Scope Data', () => {
    it('should retrieve logged data', async () => {
      const model = createTestModel('with-logger')
      const { jsPath } = await testUtils.compileModelToWasm(model)
      const module = await testUtils.loadWasmModule(jsPath)
      const handle = module._model_init(0.01)
      
      // Run 10 steps
      for (let i = 0; i < 10; i++) {
        module._model_set_input(handle, 0, i * 0.1)
        module._model_step(handle)
      }
      
      // Get scope data
      const lengthPtr = module._malloc(4)
      const dataPtr = module._model_get_scope_data(handle, 0, lengthPtr)
      const length = module.getValue(lengthPtr, 'i32')
      
      expect(length).toBe(10)
      
      // Read data from Wasm memory
      const data = new Float64Array(module.HEAPF64.buffer, dataPtr, length)
      expect(data.length).toBe(10)
      
      module._free(lengthPtr)
      module._model_destroy(handle)
    })
  })
  
  describe('Memory Management', () => {
    it('should not leak memory over many iterations', async () => {
      const model = createTestModel('simple-sum')
      const { jsPath } = await testUtils.compileModelToWasm(model)
      const module = await testUtils.loadWasmModule(jsPath)
      
      const initialMemory = process.memoryUsage().heapUsed
      
      // Create and destroy 1000 instances
      for (let i = 0; i < 1000; i++) {
        const handle = module._model_init(0.01)
        module._model_step(handle)
        module._model_destroy(handle)
      }
      
      // Force garbage collection if available
      if (global.gc) global.gc()
      
      const finalMemory = process.memoryUsage().heapUsed
      const leakMB = (finalMemory - initialMemory) / 1024 / 1024
      
      expect(leakMB).toBeLessThan(10) // Less than 10MB growth
    })
  })
})
```

### 3. API Endpoint Tests

**File:** `__tests__/integration/api/compileWasmApi.test.ts`

```typescript
import { WasmTestUtils } from '@/__tests__/utils/wasmTestUtils'
import { createTestModel } from '@/__tests__/fixtures/modelFixtures'

describe('Compile Wasm API', () => {
  let testUtils: WasmTestUtils
  
  beforeAll(async () => {
    testUtils = new WasmTestUtils()
    await testUtils.setupTestEnvironment()
  })
  
  afterEach(async () => {
    await testUtils.cleanTestData()
  })
  
  describe('POST /api/compile-wasm', () => {
    it('should compile model and return URLs', async () => {
      const model = createTestModel('simple-sum')
      
      const response = await fetch('http://localhost:3000/api/compile-wasm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: 'test-model-id',
          modelJson: model,
          optimizationLevel: 'O2'
        })
      })
      
      expect(response.status).toBe(200)
      
      const result = await response.json()
      expect(result.wasmUrl).toBeTruthy()
      expect(result.jsUrl).toBeTruthy()
      expect(result.compilationTime).toBeGreaterThan(0)
      expect(result.cacheHit).toBe(false)
    })
    
    it('should return cached result on second request', async () => {
      const model = createTestModel('simple-sum')
      const requestBody = {
        modelId: 'test-model-id',
        modelJson: model,
        optimizationLevel: 'O2'
      }
      
      // First request - compile
      const response1 = await fetch('http://localhost:3000/api/compile-wasm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      const result1 = await response1.json()
      
      // Second request - should be cached
      const response2 = await fetch('http://localhost:3000/api/compile-wasm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      const result2 = await response2.json()
      
      expect(result2.cacheHit).toBe(true)
      expect(result2.compilationTime).toBeLessThan(result1.compilationTime)
      expect(result2.compilationTime).toBeLessThan(100) // < 100ms for cache
    })
    
    it('should handle compilation errors', async () => {
      const invalidModel = createTestModel('invalid-syntax')
      
      const response = await fetch('http://localhost:3000/api/compile-wasm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: 'invalid-model',
          modelJson: invalidModel
        })
      })
      
      expect(response.status).toBe(400)
      const error = await response.json()
      expect(error.error).toBeTruthy()
      expect(error.details).toBeTruthy()
    })
    
    it('should enforce rate limiting', async () => {
      const model = createTestModel('simple-sum')
      
      // Make 11 requests rapidly
      const promises = []
      for (let i = 0; i < 11; i++) {
        promises.push(
          fetch('http://localhost:3000/api/compile-wasm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              modelId: `test-${i}`,
              modelJson: model
            })
          })
        )
      }
      
      const responses = await Promise.all(promises)
      const statuses = responses.map(r => r.status)
      
      // At least one should be rate limited (429)
      expect(statuses).toContain(429)
    })
  })
  
  describe('Supabase Storage Integration', () => {
    it('should store compiled files in Supabase Storage', async () => {
      const model = createTestModel('simple-sum')
      
      const response = await fetch('http://localhost:3000/api/compile-wasm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: 'storage-test',
          modelJson: model
        })
      })
      
      const result = await response.json()
      
      // Verify files exist in Supabase Storage
      const { data: files } = await testUtils.supabase.storage
        .from('wasm-cache')
        .list()
      
      const cacheKey = result.wasmUrl.split('/').pop()?.replace('.wasm', '')
      const wasmExists = files.some((f: any) => f.name === `${cacheKey}.wasm`)
      const jsExists = files.some((f: any) => f.name === `${cacheKey}.js`)
      
      expect(wasmExists).toBe(true)
      expect(jsExists).toBe(true)
    })
    
    it('should store metadata in database', async () => {
      const model = createTestModel('simple-sum')
      
      await fetch('http://localhost:3000/api/compile-wasm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: 'metadata-test',
          modelJson: model
        })
      })
      
      // Check metadata table
      const { data: metadata } = await testUtils.supabase
        .from('wasm_cache_metadata')
        .select('*')
        .eq('model_id', 'metadata-test')
        .single()
      
      expect(metadata).toBeTruthy()
      expect(metadata.compilation_time_ms).toBeGreaterThan(0)
      expect(metadata.wasm_size_bytes).toBeGreaterThan(0)
    })
  })
})
```

## Cross-Validation Tests

### File: `__tests__/cross-validation/wasmAccuracy.test.ts`

```typescript
import { WasmSimulationEngine } from '@/lib/simulation/WasmSimulationEngine'
import { createTestModel } from '@/__tests__/fixtures/modelFixtures'
import { generateReferenceResults } from '@/__tests__/fixtures/referenceResults'

describe('Wasm Simulation Accuracy', () => {
  describe('Basic Block Operations', () => {
    it('should match reference for Sum block', async () => {
      const model = createTestModel('sum-block')
      const engine = new WasmSimulationEngine(model)
      await engine.initialize()
      
      const testCases = [
        { inputs: [1.0, 2.0], expected: 3.0 },
        { inputs: [-1.0, 1.0], expected: 0.0 },
        { inputs: [0.5, 0.25], expected: 0.75 },
      ]
      
      for (const testCase of testCases) {
        engine.setInputs({ a: testCase.inputs[0], b: testCase.inputs[1] })
        const result = engine.step()
        
        expect(result.outputs.sum).toBeCloseTo(testCase.expected, 15) // 15 decimal places
      }
      
      engine.destroy()
    })
    
    it('should match reference for Multiply block', async () => {
      const model = createTestModel('multiply-block')
      const engine = new WasmSimulationEngine(model)
      await engine.initialize()
      
      const testCases = [
        { inputs: [2.0, 3.0], expected: 6.0 },
        { inputs: [-2.0, 3.0], expected: -6.0 },
        { inputs: [0.1, 0.2], expected: 0.02 },
      ]
      
      for (const testCase of testCases) {
        engine.setInputs({ a: testCase.inputs[0], b: testCase.inputs[1] })
        const result = engine.step()
        
        expect(result.outputs.product).toBeCloseTo(testCase.expected, 15)
      }
      
      engine.destroy()
    })
  })
  
  describe('Transfer Function Accuracy', () => {
    it('should match reference solution for first-order system', async () => {
      // H(s) = 1 / (s + 1)
      // Step response: y(t) = 1 - e^(-t)
      const model = createTestModel('first-order-tf')
      const engine = new WasmSimulationEngine(model, { dt: 0.001 })
      await engine.initialize()
      
      engine.setInputs({ u: 1.0 }) // Unit step
      
      const outputs = []
      const times = []
      
      for (let i = 0; i < 5000; i++) { // 5 seconds
        const result = engine.step()
        times.push(result.time)
        outputs.push(result.outputs.y)
      }
      
      // Check at specific time points
      const checkPoints = [
        { t: 1.0, expected: 1 - Math.exp(-1) },    // 0.632
        { t: 2.0, expected: 1 - Math.exp(-2) },    // 0.865
        { t: 5.0, expected: 1 - Math.exp(-5) },    // 0.993
      ]
      
      for (const point of checkPoints) {
        const index = Math.round(point.t / 0.001)
        expect(outputs[index]).toBeCloseTo(point.expected, 3)
      }
      
      engine.destroy()
    })
    
    it('should match reference for second-order system', async () => {
      // H(s) = 1 / (s^2 + 2*ζ*ωn*s + ωn^2)
      // ζ = 0.5, ωn = 2 rad/s (underdamped)
      const model = createTestModel('second-order-tf')
      const engine = new WasmSimulationEngine(model, { dt: 0.001 })
      await engine.initialize()
      
      engine.setInputs({ u: 1.0 })
      
      const outputs = []
      for (let i = 0; i < 10000; i++) { // 10 seconds
        const result = engine.step()
        outputs.push(result.outputs.y)
      }
      
      // Verify peak overshoot
      const maxOutput = Math.max(...outputs)
      const expectedOvershoot = Math.exp(-Math.PI * 0.5 / Math.sqrt(1 - 0.5**2))
      expect(maxOutput).toBeCloseTo(1 + expectedOvershoot, 2)
      
      // Verify settling time (within 2% of final value)
      const settledIndex = outputs.findIndex((v, i) => 
        i > 1000 && Math.abs(v - 1.0) < 0.02
      )
      const settlingTime = settledIndex * 0.001
      expect(settlingTime).toBeGreaterThan(2.5)
      expect(settlingTime).toBeLessThan(4.0)
      
      engine.destroy()
    })
  })
  
  describe('RK4 Integration Accuracy', () => {
    it('should converge with decreasing step size', async () => {
      const model = createTestModel('oscillator')
      
      const stepSizes = [0.1, 0.01, 0.001]
      const results = []
      
      for (const dt of stepSizes) {
        const engine = new WasmSimulationEngine(model, { dt })
        await engine.initialize()
        
        engine.setInputs({ u: 1.0 })
        
        let finalOutput = 0
        const steps = Math.floor(10.0 / dt) // 10 seconds
        
        for (let i = 0; i < steps; i++) {
          const result = engine.step()
          finalOutput = result.outputs.y
        }
        
        results.push(finalOutput)
        engine.destroy()
      }
      
      // Results should converge
      const diff1 = Math.abs(results[1] - results[0])
      const diff2 = Math.abs(results[2] - results[1])
      
      expect(diff2).toBeLessThan(diff1) // Converging
      expect(diff2).toBeLessThan(0.001) // Final difference small
    })
  })
  
  describe('Matrix Operations', () => {
    it('should correctly multiply matrices', async () => {
      const model = createTestModel('matrix-multiply')
      const engine = new WasmSimulationEngine(model)
      await engine.initialize()
      
      // A = [[1, 2], [3, 4]]
      // B = [[5, 6], [7, 8]]
      // C = [[19, 22], [43, 50]]
      
      engine.setInputs({
        A: [[1, 2], [3, 4]],
        B: [[5, 6], [7, 8]]
      })
      
      const result = engine.step()
      
      expect(result.outputs.C[0][0]).toBeCloseTo(19, 10)
      expect(result.outputs.C[0][1]).toBeCloseTo(22, 10)
      expect(result.outputs.C[1][0]).toBeCloseTo(43, 10)
      expect(result.outputs.C[1][1]).toBeCloseTo(50, 10)
      
      engine.destroy()
    })
  })
  
  describe('Complex Model Accuracy', () => {
    it('should match reference for cascaded systems', async () => {
      const model = createTestModel('cascaded-tf')
      const reference = await generateReferenceResults(model)
      
      const engine = new WasmSimulationEngine(model, { dt: 0.01 })
      await engine.initialize()
      
      engine.setInputs({ u: 1.0 })
      
      const wasmOutputs = []
      for (let i = 0; i < 1000; i++) {
        const result = engine.step()
        wasmOutputs.push(result.outputs.y)
      }
      
      // Compare with reference
      for (let i = 0; i < wasmOutputs.length; i++) {
        const error = Math.abs(wasmOutputs[i] - reference[i])
        expect(error).toBeLessThan(1e-6) // 1 micr unit error
      }
      
      engine.destroy()
    })
  })
})
```

## E2E Tests

### File: `__tests__/e2e/simulationWorkflow.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test.describe('Wasm Simulation Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/models/new')
  })
  
  test('should compile and run simple model', async ({ page }) => {
    // Create a simple Sum model
    await page.click('[data-testid="block-library-sum"]')
    await page.click('[data-testid="canvas"]', { position: { x: 200, y: 200 } })
    
    // Add input ports
    await page.click('[data-testid="block-library-input-port"]')
    await page.click('[data-testid="canvas"]', { position: { x: 100, y: 180 } })
    await page.click('[data-testid="block-library-input-port"]')
    await page.click('[data-testid="canvas"]', { position: { x: 100, y: 220 } })
    
    // Add output port
    await page.click('[data-testid="block-library-output-port"]')
    await page.click('[data-testid="canvas"]', { position: { x: 300, y: 200 } })
    
    // Connect blocks
    await page.dragAndDrop(
      '[data-testid="block-Input1-output-0"]',
      '[data-testid="block-Sum1-input-0"]'
    )
    await page.dragAndDrop(
      '[data-testid="block-Input2-output-0"]',
      '[data-testid="block-Sum1-input-1"]'
    )
    await page.dragAndDrop(
      '[data-testid="block-Sum1-output-0"]',
      '[data-testid="block-Output1-input-0"]'
    )
    
    // Set input values
    await page.click('[data-testid="block-Input1"]')
    await page.fill('[data-testid="input-constant-value"]', '3.0')
    
    await page.click('[data-testid="block-Input2"]')
    await page.fill('[data-testid="input-constant-value"]', '4.0')
    
    // Run simulation
    await page.click('[data-testid="run-simulation"]')
    
    // Should show compilation progress
    await expect(page.locator('text=Compiling to WebAssembly')).toBeVisible()
    
    // Should complete
    await expect(page.locator('[data-testid="simulation-running"]')).toBeVisible({ timeout: 10000 })
    
    // Check output value
    const output = await page.locator('[data-testid="output-Output1-value"]').textContent()
    expect(parseFloat(output!)).toBeCloseTo(7.0, 1)
  })
  
  test('should use cached compilation on reload', async ({ page }) => {
    // Create and run a model
    await page.click('[data-testid="block-library-sum"]')
    await page.click('[data-testid="canvas"]', { position: { x: 200, y: 200 } })
    await page.click('[data-testid="run-simulation"]')
    
    // Wait for first compilation
    await expect(page.locator('text=Compilation complete')).toBeVisible({ timeout: 10000 })
    
    const firstCompileTime = await page.locator('[data-testid="compilation-time"]').textContent()
    
    // Stop simulation
    await page.click('[data-testid="stop-simulation"]')
    
    // Run again
    await page.click('[data-testid="run-simulation"]')
    
    // Should show cache hit
    await expect(page.locator('text=Loaded from cache')).toBeVisible()
    
    const secondCompileTime = await page.locator('[data-testid="compilation-time"]').textContent()
    
    // Second should be much faster
    expect(parseFloat(secondCompileTime!)).toBeLessThan(parseFloat(firstCompileTime!) / 10)
  })
  
  test('should display compilation errors clearly', async ({ page }) => {
    // Create an invalid model (not possible through UI, but simulate)
    await page.evaluate(() => {
      // Inject invalid model that will fail compilation
      localStorage.setItem('test-invalid-model', JSON.stringify({
        sheets: [{ blocks: [{ type: 'invalid-block-type' }] }]
      }))
    })
    
    await page.goto('http://localhost:3000/models/test-invalid-model')
    await page.click('[data-testid="run-simulation"]')
    
    // Should show error dialog
    await expect(page.locator('[data-testid="compilation-error-dialog"]')).toBeVisible()
    await expect(page.locator('text=Compilation Failed')).toBeVisible()
  })
})
```

## Performance Benchmarks

### File: `__tests__/benchmarks/wasmPerformance.test.ts`

```typescript
import { WasmSimulationEngine } from '@/lib/simulation/WasmSimulationEngine'
import { createTestModel } from '@/__tests__/fixtures/modelFixtures'

describe('Wasm Performance Benchmarks', () => {
  describe('Compilation Speed', () => {
    it('should compile small model in <2 seconds', async () => {
      const model = createTestModel('small', { blockCount: 10 })
      const engine = new WasmSimulationEngine(model)
      
      const start = performance.now()
      await engine.initialize()
      const duration = performance.now() - start
      
      expect(duration).toBeLessThan(2000)
      console.log(`Small model compilation: ${duration.toFixed(0)}ms`)
      
      engine.destroy()
    })
    
    it('should compile medium model in <5 seconds', async () => {
      const model = createTestModel('medium', { blockCount: 50 })
      const engine = new WasmSimulationEngine(model)
      
      const start = performance.now()
      await engine.initialize()
      const duration = performance.now() - start
      
      expect(duration).toBeLessThan(5000)
      console.log(`Medium model compilation: ${duration.toFixed(0)}ms`)
      
      engine.destroy()
    })
    
    it('should compile large model in <15 seconds', async () => {
      const model = createTestModel('large', { blockCount: 200 })
      const engine = new WasmSimulationEngine(model)
      
      const start = performance.now()
      await engine.initialize()
      const duration = performance.now() - start
      
      expect(duration).toBeLessThan(15000)
      console.log(`Large model compilation: ${duration.toFixed(0)}ms`)
      
      engine.destroy()
    })
  })
  
  describe('Simulation Speed', () => {
    it('should achieve >50k steps/second for small model', async () => {
      const model = createTestModel('small', { blockCount: 10 })
      const engine = new WasmSimulationEngine(model, { dt: 0.001 })
      await engine.initialize()
      
      const stepCount = 100000
      const start = performance.now()
      
      for (let i = 0; i < stepCount; i++) {
        engine.step()
      }
      
      const duration = performance.now() - start
      const stepsPerSecond = (stepCount / duration) * 1000
      
      expect(stepsPerSecond).toBeGreaterThan(50000)
      console.log(`Small model: ${stepsPerSecond.toFixed(0)} steps/sec`)
      
      engine.destroy()
    })
    
    it('should achieve >10k steps/second for large model', async () => {
      const model = createTestModel('large', { blockCount: 200 })
      const engine = new WasmSimulationEngine(model, { dt: 0.001 })
      await engine.initialize()
      
      const stepCount = 10000
      const start = performance.now()
      
      for (let i = 0; i < stepCount; i++) {
        engine.step()
      }
      
      const duration = performance.now() - start
      const stepsPerSecond = (stepCount / duration) * 1000
      
      expect(stepsPerSecond).toBeGreaterThan(10000)
      console.log(`Large model: ${stepsPerSecond.toFixed(0)} steps/sec`)
      
      engine.destroy()
    })
  })
  
  describe('Cache Performance', () => {
    it('should load cached module in <100ms', async () => {
      const model = createTestModel('medium')
      
      // First load (compilation)
      const engine1 = new WasmSimulationEngine(model)
      await engine1.initialize()
      engine1.destroy()
      
      // Second load (from cache)
      const engine2 = new WasmSimulationEngine(model)
      const start = performance.now()
      await engine2.initialize()
      const duration = performance.now() - start
      
      expect(duration).toBeLessThan(100)
      console.log(`Cache hit: ${duration.toFixed(0)}ms`)
      
      engine2.destroy()
    })
  })
  
  describe('Memory Usage', () => {
    it('should use <50MB for typical simulation', async () => {
      const model = createTestModel('medium')
      const engine = new WasmSimulationEngine(model)
      await engine.initialize()
      
      const initialMemory = process.memoryUsage().heapUsed
      
      // Run 10,000 steps
      for (let i = 0; i < 10000; i++) {
        engine.step()
      }
      
      const finalMemory = process.memoryUsage().heapUsed
      const memoryGrowthMB = (finalMemory - initialMemory) / 1024 / 1024
      
      expect(memoryGrowthMB).toBeLessThan(50)
      console.log(`Memory growth: ${memoryGrowthMB.toFixed(1)}MB`)
      
      engine.destroy()
    })
  })
})
```

## Test Execution

### NPM Scripts

**File:** `package.json` (additions)

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest __tests__/unit",
    "test:integration": "jest __tests__/integration",
    "test:e2e": "playwright test",
    "test:cross-validation": "jest __tests__/cross-validation",
    "test:benchmarks": "jest __tests__/benchmarks --maxWorkers=1",
    "test:wasm": "npm run test:unit && npm run test:integration && npm run test:cross-validation",
    "test:all": "npm run test:wasm && npm run test:e2e",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

### Jest Configuration

**File:** `jest.config.js`

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'lib/**/*.ts',
    'app/api/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageThresholds: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  globals: {
    'ts-jest': {
      tsconfig: {
        esModuleInterop: true,
      },
    },
  },
}
```

### Test Setup

**File:** `__tests__/setup.ts`

```typescript
import { WasmTestUtils } from './__tests__/utils/wasmTestUtils'

// Global test timeout
jest.setTimeout(30000) // 30 seconds for compilation tests

// Setup test environment
beforeAll(async () => {
  const testUtils = new WasmTestUtils()
  await testUtils.setupTestEnvironment()
})

// Custom matchers
expect.extend({
  toBeCloseTo(received: number, expected: number, precision: number = 2) {
    const pass = Math.abs(received - expected) < Math.pow(10, -precision)
    return {
      pass,
      message: () =>
        `expected ${received} to be close to ${expected} (precision: ${precision})`,
    }
  },
})
```

## CI/CD Integration

### GitHub Actions Workflow

**File:** `.github/workflows/test.yml`

```yaml
name: Test

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  integration-tests:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Build Emscripten Docker image
        run: docker build -t obliq-emscripten:test -f __tests__/docker/Dockerfile.emscripten .
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_TEST_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_TEST_SERVICE_KEY }}

  e2e-tests:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright
        run: npx playwright install --with-deps
      
      - name: Run E2E tests
        run: npm run test:e2e
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/

  cross-validation:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Build Emscripten Docker image
        run: docker build -t obliq-emscripten:test -f __tests__/docker/Dockerfile.emscripten .
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run cross-validation tests
        run: npm run test:cross-validation
```

## Test Documentation

### Running Tests Locally

```bash
# Install dependencies
npm install

# Build Emscripten Docker image
docker build -t obliq-emscripten:test -f __tests__/docker/Dockerfile.emscripten .

# Run all tests
npm run test:all

# Run specific test suites
npm run test:unit              # Unit tests only
npm run test:integration       # Integration tests only
npm run test:e2e               # E2E tests only
npm run test:cross-validation  # Accuracy tests only
npm run test:benchmarks        # Performance benchmarks only

# Watch mode for development
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Test Organization

```
__tests__/
├── unit/                    # Fast, isolated tests
│   ├── codegen/            # Code generation logic
│   ├── cache/              # Cache management
│   └── utils/              # Utility functions
├── integration/            # Tests requiring compilation
│   ├── compilation/        # Emscripten compilation
│   ├── wasm/              # Wasm module loading
│   └── api/               # API endpoint tests
├── cross-validation/      # Accuracy verification
│   └── wasmAccuracy.test.ts
├── e2e/                   # Full user workflows
│   └── simulationWorkflow.spec.ts
├── benchmarks/            # Performance measurements
│   └── wasmPerformance.test.ts
├── fixtures/              # Test data
│   ├── modelFixtures.ts   # Test models
│   ├── referenceResults.ts # Expected outputs
│   └── test-schema.sql    # Database schema
├── utils/                 # Test utilities
│   └── wasmTestUtils.ts   # Wasm testing helpers
└── docker/                # Docker configurations
    └── Dockerfile.emscripten
```

## Success Metrics

### Test Coverage Targets
- Unit tests: >90% coverage
- Integration tests: All critical paths covered
- E2E tests: All major user workflows covered
- Cross-validation: <1e-10 error vs reference

### Performance Targets
- Compilation: <2s for small models, <5s for medium
- Cached load: <100ms
- Simulation: >50k steps/sec for typical models
- Memory: <50MB growth over 10k steps

### CI/CD Requirements
- All tests must pass before merge
- Coverage must not decrease
- Performance benchmarks within 10% of baseline

## Migration from Existing Tests

### Deprecated Tests
The following existing tests are replaced by Wasm tests:
- `simulationEngine.test.ts` → `wasmAccuracy.test.ts` (cross-validation)
- `blockExecution.test.ts` → `wasmAccuracy.test.ts` (individual blocks)
- `integration-methods.test.ts` → `wasmAccuracy.test.ts` (RK4 accuracy)

### New Test Requirements
Every new block type must include:
1. Unit test for code generation
2. Integration test for compilation
3. Cross-validation test vs reference
4. E2E test in a simple model

## Conclusion

This testing strategy provides comprehensive coverage of the WebAssembly simulation system, ensuring:
- **Correctness**: Cross-validation tests verify accuracy
- **Performance**: Benchmarks ensure speed targets
- **Reliability**: Integration tests catch compilation issues
- **Usability**: E2E tests validate user workflows

The test infrastructure replaces the existing JavaScript simulation tests with Wasm-equivalent tests while adding new test categories specific to compilation and caching.

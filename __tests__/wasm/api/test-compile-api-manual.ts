/**
 * Manual integration test for WASM compilation API
 *
 * Run with: npx ts-node __tests__/wasm/api/test-compile-api-manual.ts
 *
 * Prerequisites:
 * - Dev server running on localhost:3000
 * - Test model created in Supabase
 * - Docker with obliq-emscripten:latest
 */

import * as fs from 'fs'
import * as path from 'path'

const API_URL = process.env.API_URL || 'http://localhost:3000/api/compile-wasm'
const TEST_MODEL_ID = process.env.TEST_MODEL_ID || '550e8400-e29b-41d4-a716-446655440000'

async function testCompilationAPI() {
  console.log('===== WASM Compilation API Manual Test =====\n')

  try {
    // Test 1: Compile a model
    console.log(`Test 1: Compiling model ${TEST_MODEL_ID}...`)
    const startTime = Date.now()

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        modelId: TEST_MODEL_ID,
        optimizationLevel: 'O2'
      })
    })

    const elapsed = Date.now() - startTime

    if (!response.ok) {
      const error = await response.json()
      console.error('❌ Compilation failed:', error)
      return
    }

    const data = await response.json()
    console.log(`✅ Compilation successful (${elapsed}ms)`)
    console.log(`   Model: ${data.metadata.modelName}`)
    console.log(`   Cache hit: ${data.metadata.cacheHit}`)
    console.log(`   WASM size: ${(data.metadata.wasmSize / 1024).toFixed(2)} KB`)
    console.log(`   JS size: ${(data.metadata.jsSize / 1024).toFixed(2)} KB`)
    console.log(`   Blocks: ${data.metadata.blockCount}`)
    console.log(`   Optimization: ${data.metadata.optimizationLevel}`)
    console.log(`   Inputs: ${data.metadata.inputMap.length}`)
    console.log(`   Outputs: ${data.metadata.outputMap.length}`)

    // Save compiled files for inspection
    const outputDir = path.join(__dirname, '../fixtures/api-test-output')
    await fs.promises.mkdir(outputDir, { recursive: true })

    const wasmPath = path.join(outputDir, 'model.wasm')
    const jsPath = path.join(outputDir, 'model.js')

    const wasmBuffer = Buffer.from(data.wasmData, 'base64')
    const jsBuffer = Buffer.from(data.jsData, 'base64')

    await fs.promises.writeFile(wasmPath, wasmBuffer)
    await fs.promises.writeFile(jsPath, jsBuffer)

    console.log(`\n   Files saved to: ${outputDir}`)

    // Test 2: Compile again (should hit cache)
    console.log('\nTest 2: Compiling again (should hit cache)...')
    const startTime2 = Date.now()

    const response2 = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        modelId: TEST_MODEL_ID,
        optimizationLevel: 'O2'
      })
    })

    const elapsed2 = Date.now() - startTime2
    const data2 = await response2.json()

    console.log(`✅ Second compilation (${elapsed2}ms)`)
    console.log(`   Cache hit: ${data2.metadata.cacheHit}`)
    console.log(`   Speedup: ${(elapsed / elapsed2).toFixed(1)}x faster`)

    if (!data2.metadata.cacheHit) {
      console.warn('⚠️  Warning: Expected cache hit but got cache miss')
    }

    // Test 3: Different optimization level
    console.log('\nTest 3: Compiling with different optimization (O0)...')
    const startTime3 = Date.now()

    const response3 = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        modelId: TEST_MODEL_ID,
        optimizationLevel: 'O0'
      })
    })

    const elapsed3 = Date.now() - startTime3
    const data3 = await response3.json()

    console.log(`✅ O0 compilation (${elapsed3}ms)`)
    console.log(`   Cache hit: ${data3.metadata.cacheHit}`)
    console.log(`   WASM size: ${(data3.metadata.wasmSize / 1024).toFixed(2)} KB (vs ${(data.metadata.wasmSize / 1024).toFixed(2)} KB for O2)`)

    // Test 4: Invalid model ID
    console.log('\nTest 4: Testing error handling (invalid model ID)...')
    const response4 = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        modelId: 'invalid-id'
      })
    })

    const data4 = await response4.json()

    if (response4.status === 400) {
      console.log('✅ Correctly rejected invalid model ID')
      console.log(`   Error: ${data4.error}`)
    } else {
      console.error('❌ Should have rejected invalid model ID')
    }

    // Test 5: Non-existent model
    console.log('\nTest 5: Testing error handling (non-existent model)...')
    const response5 = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        modelId: '00000000-0000-0000-0000-000000000000'
      })
    })

    const data5 = await response5.json()

    if (response5.status === 404) {
      console.log('✅ Correctly returned 404 for non-existent model')
    } else {
      console.error('❌ Should have returned 404 for non-existent model')
    }

    console.log('\n===== All Tests Completed =====')
  } catch (error) {
    console.error('❌ Test failed with error:', error)
    throw error
  }
}

// Run the tests
testCompilationAPI()
  .then(() => {
    console.log('\n✅ Success!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error)
    process.exit(1)
  })

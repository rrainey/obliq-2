# WebAssembly Implementation Roadmap

## Executive Summary

This document outlines a phased approach to migrating from JavaScript-based simulation to WebAssembly-compiled C code, ensuring perfect fidelity between interactive simulation and embedded deployment.

**Timeline:** 8-10 weeks
**Risk Level:** Medium (new technology, but well-contained)
**Impact:** High (eliminates simulation discrepancies)

## Phase 0: Preparation & Infrastructure (Week 1)

### Task 0.1: Set Up Emscripten Development Environment
**Objective:** Get Emscripten working locally and in CI

**Steps:**
1. Install Emscripten SDK locally
2. Create Docker image with Emscripten
3. Test basic compilation: `emcc hello.c -o hello.wasm`
4. Verify Wasm works in browser
5. Update CI/CD to build Docker image

**Deliverable:** Working Emscripten environment
**Test:** Compile and run simple "Hello World" Wasm module

### Task 0.2: Create Wasm Cache Infrastructure
**Objective:** Set up caching to minimize compilation time

**Steps:**
1. Create `/public/wasm-cache` directory structure
2. Implement `hashModel()` function for cache keys
3. Create Redis/file-based cache service
4. Add cache cleanup cron job
5. Implement cache metrics

**Deliverable:** Working cache system
**Test:** Compile same model twice, verify second is instant

### Task 0.3: Update C Code Generator for Wasm Export
**Objective:** Generate C code with Wasm-compatible interface

**Steps:**
1. Create `WasmCodeGenerator.ts` extending existing generator
2. Add `EMSCRIPTEN_KEEPALIVE` to exported functions
3. Generate interface functions:
   - `model_init(double dt)`
   - `model_set_input(void* handle, int index, double value)`
   - `model_get_output(void* handle, int index)`
   - `model_step(void* handle)`
4. Generate index maps for inputs/outputs
5. Add scope data accessors

**Deliverable:** C code that compiles with Emscripten
**Test:** Generate code for test model, compile to Wasm, load in Node

### Task 0.4: Create Basic Wasm Compilation API
**Objective:** Server endpoint that compiles models to Wasm

**Steps:**
1. Create `app/api/compile-wasm/route.ts`
2. Implement compilation pipeline:
   - Receive model JSON
   - Generate C code
   - Write to temp directory
   - Call `emcc` via exec
   - Return .wasm and .js files
3. Add timeout protection (30 seconds)
4. Add error handling for compilation failures
5. Implement basic caching

**Deliverable:** Working compilation endpoint
**Test:** POST model JSON, receive compiled Wasm

## Phase 1: Basic Wasm Simulation (Weeks 2-3)

### Task 1.1: Create WasmSimulationEngine Class
**Objective:** JavaScript wrapper for Wasm simulation

**Location:** `lib/simulation/WasmSimulationEngine.ts`

**Steps:**
1. Create class structure
2. Implement `initialize()` method:
   - Fetch compiled Wasm
   - Load module
   - Call `_model_init()`
3. Implement `setInputs()` method
4. Implement `step()` method
5. Implement `getOutputs()` method
6. Implement `destroy()` cleanup
7. Add TypeScript types for all methods

**Deliverable:** Working WasmSimulationEngine class
**Test:** Unit tests for simple Sum and Multiply blocks

### Task 1.2: Implement Memory Management
**Objective:** Safe allocation/deallocation of Wasm memory

**Steps:**
1. Create memory allocation helpers
2. Implement buffer copying (JS ↔ Wasm)
3. Add memory usage tracking
4. Implement leak detection (dev mode)
5. Add memory limit safeguards

**Deliverable:** Robust memory management
**Test:** Run 1000 simulations, verify no memory leaks

### Task 1.3: Add Scope Data Retrieval
**Objective:** Get Signal Logger data from Wasm

**Steps:**
1. Generate `model_get_scope_data()` in C
2. Implement JavaScript wrapper
3. Add data serialization
4. Support multiple loggers
5. Add max buffer size limits

**Deliverable:** Working scope data access
**Test:** Log 1000 samples, retrieve and verify

### Task 1.4: Create Feature Flag System
**Objective:** Toggle between JS and Wasm engines

**Steps:**
1. Add `useWasmSimulation` feature flag
2. Create engine factory:
   ```typescript
   function createEngine(model, useWasm) {
     return useWasm 
       ? new WasmSimulationEngine(model)
       : new JavaScriptSimulationEngine(model)
   }
   ```
3. Add UI toggle in settings
4. Persist preference to localStorage
5. Add telemetry to track usage

**Deliverable:** Switchable engines
**Test:** Toggle flag, verify correct engine used

## Phase 2: UI Integration (Week 4)

### Task 2.1: Update SimulationControls Component
**Objective:** Use Wasm engine in UI

**Steps:**
1. Modify `SimulationControls.tsx` to use `WasmSimulationEngine`
2. Add compilation status indicator
3. Show compilation time
4. Display "Compiling..." state
5. Handle compilation errors gracefully

**Deliverable:** UI that uses Wasm for simulation
**Test:** Run simulation from UI, verify outputs match

### Task 2.2: Add Compilation Progress Indicator
**Objective:** Show progress during compilation

**Steps:**
1. Implement Server-Sent Events for progress
2. Update API to emit progress events:
   - "Generating C code"
   - "Compiling to Wasm"
   - "Optimizing"
3. Create ProgressBar component
4. Add estimated time remaining
5. Show cache hit indicator

**Deliverable:** Live compilation progress
**Test:** Compile large model, verify progress updates

### Task 2.3: Implement Pre-warming
**Objective:** Compile in background when editor loads

**Steps:**
1. Start compilation when model editor opens
2. Don't block UI
3. Cache result
4. Use cached result when "Run" clicked
5. Handle editor close gracefully

**Deliverable:** Near-instant simulation start
**Test:** Open editor, wait 2 seconds, click Run (should start immediately)

### Task 2.4: Add Error Reporting UI
**Objective:** Show compilation errors clearly

**Steps:**
1. Parse `emcc` error messages
2. Map C line numbers to model blocks
3. Create ErrorDialog component
4. Show which block caused error
5. Provide suggestions for common errors

**Deliverable:** User-friendly error messages
**Test:** Create invalid model, verify clear error shown

## Phase 3: Performance Optimization (Week 5)

### Task 3.1: Implement Aggressive Caching
**Objective:** Maximize cache hit rate

**Steps:**
1. Cache at multiple levels:
   - Browser (IndexedDB)
   - Server (Redis/filesystem)
   - CDN (for public models)
2. Implement cache warming for popular models
3. Add cache analytics
4. Implement smart eviction (LRU)
5. Pre-compile common block combinations

**Deliverable:** >90% cache hit rate
**Test:** Open same model 5 times, only first should compile

### Task 3.2: Optimize Emscripten Flags
**Objective:** Minimize compilation time and binary size

**Steps:**
1. Benchmark different optimization levels (O0, O1, O2, O3)
2. Test LLVM options for Wasm
3. Enable link-time optimization
4. Minimize exported functions
5. Strip debug info for production
6. Use `-s MODULARIZE=1` for better loading

**Deliverable:** Optimized compilation
**Test:** Compile same model with different flags, measure time/size

### Task 3.3: Implement Incremental Compilation
**Objective:** Only recompile changed subsystems

**Steps:**
1. Create subsystem diff algorithm
2. Compile subsystems independently
3. Link compiled subsystems
4. Cache individual subsystems
5. Handle subsystem dependencies

**Deliverable:** Fast recompilation on edits
**Test:** Edit single block, verify only affected subsystem recompiles

### Task 3.4: Add Parallel Compilation
**Objective:** Compile large models faster

**Steps:**
1. Split model into independent subsystems
2. Compile subsystems in parallel
3. Link results together
4. Handle compilation failures
5. Limit parallelism based on CPU cores

**Deliverable:** Faster compilation for large models
**Test:** Compile 100-block model, compare serial vs parallel

## Phase 4: Testing & Validation (Week 6)

### Task 4.1: Create Cross-Validation Test Suite
**Objective:** Verify Wasm matches JavaScript exactly

**Steps:**
1. Create test harness that runs both engines
2. Test all block types
3. Test various combinations
4. Run for 10,000 steps each
5. Compare outputs (allow 1e-10 tolerance)
6. Test edge cases:
   - Division by zero
   - Very small/large numbers
   - Matrix operations
   - Transfer functions

**Deliverable:** Comprehensive test suite
**Test:** All tests pass with <1e-10 difference

### Task 4.2: Performance Benchmarking
**Objective:** Measure Wasm vs JavaScript speed

**Steps:**
1. Create benchmark suite
2. Test models of varying sizes (10, 100, 1000 blocks)
3. Measure:
   - Steps per second
   - Memory usage
   - Compilation time
   - Cache hit rate
4. Generate comparison charts
5. Identify bottlenecks

**Deliverable:** Performance report
**Target:** Wasm 5-10x faster than JavaScript

### Task 4.3: Browser Compatibility Testing
**Objective:** Ensure Wasm works on all browsers

**Steps:**
1. Test on Chrome, Firefox, Safari, Edge
2. Test on mobile browsers
3. Handle WebAssembly.compileStreaming unavailable
4. Fallback for old browsers without Wasm
5. Add browser compatibility warnings

**Deliverable:** Works on all modern browsers
**Test:** Run on BrowserStack, verify all pass

### Task 4.4: Load Testing
**Objective:** Ensure server can handle compilation load

**Steps:**
1. Simulate 100 concurrent compilations
2. Measure response times
3. Test cache performance under load
4. Identify resource bottlenecks
5. Implement rate limiting if needed

**Deliverable:** Stable under load
**Test:** 95th percentile response time <3s

## Phase 5: Integration & Polish (Week 7)

### Task 5.1: Integrate with Existing Features
**Objective:** Ensure Wasm works with all app features

**Steps:**
1. Test with multi-sheet models
2. Test with subsystems
3. Test with enabled/disabled subsystems
4. Test with sheet labels
5. Test with matrix operations
6. Test with all block types
7. Verify code generation still works

**Deliverable:** All features work with Wasm
**Test:** Run full integration test suite

### Task 5.2: Update Documentation
**Objective:** Document Wasm architecture

**Steps:**
1. Review and update architecture document (`design/00-architecture.md`); add a `design/11-Unifying-simulation-with-Wasm.md` document

**Deliverable:** Complete documentation
**Test:** New developer can set up and use system

### Task 5.3: Add Telemetry & Monitoring
**Objective:** Track Wasm usage and issues

**Steps:**
1. Log compilation metrics
2. Log simulation performance
3. Track errors by type
4. Monitor cache hit rates
5. Create Grafana dashboards
6. Set up alerts for failures

**Deliverable:** Observability system
**Test:** View real-time metrics in dashboard

### Task 5.4: Optimize User Experience
**Objective:** Make Wasm compilation seamless

**Steps:**
1. Show "First time compiling, please wait..." message
2. Add tips during compilation:
   "💡 Tip: Compilation happens once per model version"
3. Celebrate fast cache hits:
   "⚡ Loaded from cache (0.1s)"
4. Show speed comparison when simulation runs
5. Add "Simulation running 8.2x faster with WebAssembly"

**Deliverable:** Polished UX
**Test:** User testing shows positive feedback

## Phase 6: Migration & Rollout (Week 8)

### Task 6.1: Deprecate JavaScript Engine
**Objective:** Remove old simulation code

**Timeline:** After 2 weeks of successful Wasm usage

**Steps:**
1. Make Wasm the only option
2. Remove JavaScript simulation code
3. Remove toggle flag
4. Update all tests
5. Archive old code
5. Update `design/00-architecture.md` to reflect removal of JavaScript Engine

**Deliverable:** Simplified codebase
**Test:** All tests pass without JavaScript engine

## Phase 7: Advanced Features (Weeks 9-10)

### Task 7.1: SIMD Optimization
**Objective:** Use SIMD for faster computation

**Steps:**
1. Enable `-msimd128` in Emscripten
2. Use SIMD for matrix operations
3. Benchmark improvements
4. Add fallback for non-SIMD browsers

**Deliverable:** 2-4x faster matrix ops
**Test:** Matrix multiply benchmark shows improvement

### Task 7.2: Multi-threading Support
**Objective:** Run simulation in Web Worker

**Steps:**
1. Enable `-pthread` in Emscripten
2. Move simulation to Web Worker
3. Use SharedArrayBuffer for communication
4. Test browser compatibility
5. Fallback to single-threaded

**Deliverable:** Non-blocking simulation
**Test:** UI stays responsive during long simulations

### Task 7.3: Adaptive Optimization
**Objective:** Recompile with higher optimization for long sims

**Steps:**
1. Detect when simulation will be long
2. Show "Optimizing for long simulation..."
3. Recompile with O3
4. Cache both O0 and O3 versions
5. Use O0 for quick tests, O3 for long runs

**Deliverable:** Smart optimization
**Test:** Short sim uses O0, long sim uses O3

### Task 7.4: Wasm Streaming Compilation
**Objective:** Start executing while downloading

**Steps:**
1. Use `WebAssembly.compileStreaming()`
2. Stream from server with proper MIME type
3. Start simulation before full download
4. Handle streaming errors

**Deliverable:** Faster startup
**Test:** Large model starts executing sooner

## Risk Management

### Risk 1: Compilation Too Slow
**Mitigation:**
- Aggressive caching (>90% hit rate)
- Pre-warming on editor load
- Progressive enhancement (keep JS engine as fallback)
- Incremental compilation for edits

**Likelihood:** Medium
**Impact:** High
**Contingency:** Keep JavaScript engine as backup

### Risk 2: Wasm Binary Too Large
**Mitigation:**
- Use optimization flags
- Strip debug symbols
- Compression (gzip)
- Code splitting for large models

**Likelihood:** Low
**Impact:** Medium
**Contingency:** Lazy-load rarely-used blocks

### Risk 3: Browser Compatibility Issues
**Mitigation:**
- Comprehensive browser testing
- Feature detection
- Graceful fallback to JavaScript
- Clear error messages

**Likelihood:** Medium
**Impact:** Medium
**Contingency:** Maintain JavaScript engine longer

### Risk 4: Numerical Accuracy Issues
**Mitigation:**
- Extensive cross-validation tests
- Use same math library as embedded
- Test edge cases (overflow, underflow)
- Monitor error reports

**Likelihood:** Low
**Impact:** High
**Contingency:** Allow user to report discrepancies

### Risk 5: Server Load from Compilation
**Mitigation:**
- Aggressive caching
- Rate limiting
- Horizontal scaling
- Consider client-side compilation (future)

**Likelihood:** Medium
**Impact:** Medium
**Contingency:** Increase server capacity

## Success Metrics

### Technical Metrics
- ✅ Cache hit rate >85%
- ✅ Compilation time P95 <2s (cached: <100ms)
- ✅ Simulation 5-10x faster than JavaScript
- ✅ Memory usage <50MB per simulation
- ✅ Zero accuracy differences >1e-10
- ✅ Error rate <1%
- ✅ Browser support: Chrome, Firefox, Safari, Edge

### User Experience Metrics
- ✅ 90% of simulations start in <1s
- ✅ No user-visible delays for cached models
- ✅ Clear error messages for 100% of failures
- ✅ Positive user feedback >80%

### Business Metrics
- ✅ Zero reported simulation discrepancies
- ✅ Increased user confidence in generated code
- ✅ Reduced support tickets about simulation issues
- ✅ Faster model development cycles

## Rollback Plan

If critical issues arise during rollout:

1. **Immediate:** Disable Wasm via feature flag (30 seconds)
2. **Short-term:** Roll back to previous deployment (5 minutes)
3. **Long-term:** Keep JavaScript engine as fallback (permanent)

**Rollback Triggers:**
- Error rate >5%
- User complaints >10/day
- Critical bug discovered
- Performance degradation >50%

## Cost Analysis

### Development Time
- 8-10 weeks of senior engineer time
- ~$40,000-50,000 in development costs

### Infrastructure
- Server resources: +$100/month (Emscripten Docker, Redis cache)
- CDN bandwidth: +$50/month (Wasm binary distribution)
- Monitoring: Included in existing tools

### Maintenance
- ~5 hours/month ongoing maintenance
- Update Emscripten versions quarterly

### ROI
- **Eliminated costs:** 
  - No more JavaScript/C simulation discrepancy bugs
  - Reduced debugging time: ~10 hours/month saved
  - Fewer support tickets: ~$200/month saved
- **Payback period:** 6-8 months

## Conclusion

The WebAssembly approach provides the best balance of:
- **Correctness**: Perfect fidelity to embedded code
- **Performance**: 5-10x faster than JavaScript
- **User Experience**: Sub-second startup with caching
- **Simplicity**: No Docker, SSH, or complex infrastructure
- **Maintainability**: Single C codebase

The phased rollout ensures we can validate each step and roll back if needed. The aggressive caching strategy addresses the main UX concern (compilation time), making the Wasm approach feel instant for most users.

**Recommendation:** Proceed with Phase 0 immediately.
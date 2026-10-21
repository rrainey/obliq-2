// lib/wasm/wasmExports.ts
//
// C functions the simulation WASM module exports. Both compile routes build
// their emcc command from this list, so a new wrapper function is added here
// once (and CODEGEN_VERSION in cache/cacheKey.ts is bumped).

export const WASM_EXPORTED_FUNCTIONS = [
  '_wasm_init',
  '_wasm_set_input',
  '_wasm_get_output',
  '_wasm_step',
  '_wasm_get_time',
  '_wasm_get_collector_count',
  '_wasm_get_collector_name',
  '_wasm_get_sample_count',
  '_wasm_get_sample_write_index',
  '_wasm_get_max_samples',
  '_wasm_get_last_sample_time',
  '_wasm_get_samples',
  '_wasm_get_element_size',
  '_wasm_get_output_port_count',
  '_wasm_get_output_port_name',
  '_wasm_get_assert_count',
  '_wasm_get_assert_number',
  '_wasm_get_assert_text',
  '_wasm_stop_requested',
  '_wasm_cleanup',
  '_malloc',
  '_free',
] as const

/** The emcc `-s EXPORTED_FUNCTIONS=[...]` argument, quoted for a shell command line. */
export function emccExportedFunctionsArg(): string {
  return `-s "EXPORTED_FUNCTIONS=[${WASM_EXPORTED_FUNCTIONS.map(f => `\\"${f}\\"`).join(',')}]" `
}

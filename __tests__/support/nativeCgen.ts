/**
 * Native C codegen + compile helper for purpose-built numeric tests.
 *
 * Uses the same path as `scripts/obliq-cgen.ts`: CodeGenerator → CMake → gcc.
 * Writes a custom smoke main that prints RESULT lines for assertion.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execSync } from 'child_process'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'
import { CCodeBuilder } from '@/lib/codegen/CCodeBuilder'
import { Sheet } from '@/lib/simulationTypes'
import { ModelParameter } from '@/lib/modelSchema'

export interface NativeCgenOptions {
  modelName: string
  sheets: Sheet[]
  parameters?: ModelParameter[]
  dt?: number
  /** Default 'rk4'. */
  integrationAlgorithm?: 'rk4' | 'euler'
  /** Body of main() after includes; must print results and return 0 on success. */
  smokeMainBody: string
  /** Extra #includes for the smoke main (default: stdio + math). */
  smokeIncludes?: string[]
}

export interface NativeCgenResult {
  outDir: string
  stdout: string
  header: string
  source: string
  subsystemFiles: { subsystemName: string; header: string; source: string }[]
}

function writeCMake(outDir: string, modelName: string, subsystemNames: string[]): void {
  const subSources = subsystemNames.map(n => `  ${n}.c`).join('\n')
  const content = `cmake_minimum_required(VERSION 3.16)
project(${modelName}_smoke C)
set(CMAKE_C_STANDARD 99)
add_library(${modelName} STATIC
  ${modelName}.c
${subSources}
)
target_include_directories(${modelName} PUBLIC \${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(${modelName} PUBLIC m)
add_executable(${modelName}_smoke smoke_main.c)
target_link_libraries(${modelName}_smoke PRIVATE ${modelName} m)
`
  fs.writeFileSync(path.join(outDir, 'CMakeLists.txt'), content)
}

/**
 * Generate, compile, and run a custom smoke main. Throws on build/run failure.
 * Caller should delete `result.outDir` in afterAll / finally if desired.
 */
export function compileAndRunNative(opts: NativeCgenOptions): NativeCgenResult {
  const modelName = CCodeBuilder.sanitizeIdentifier(opts.modelName)
  const dt = opts.dt ?? 0.01
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `obliq-native-${modelName}-`))

  const gen = new CodeGenerator({
    modelName,
    integrationAlgorithm: opts.integrationAlgorithm ?? 'rk4',
    generateMain: false
  })
  const result = gen.generate(opts.sheets, opts.parameters || [])

  fs.writeFileSync(path.join(outDir, `${modelName}.h`), result.header)
  fs.writeFileSync(path.join(outDir, `${modelName}.c`), result.source)
  const subsystemNames: string[] = []
  for (const sub of result.subsystemFiles || []) {
    subsystemNames.push(sub.subsystemName)
    fs.writeFileSync(path.join(outDir, `${sub.subsystemName}.h`), sub.header)
    fs.writeFileSync(path.join(outDir, `${sub.subsystemName}.c`), sub.source)
  }

  const includes = [
    `#include "${modelName}.h"`,
    '#include <stdio.h>',
    '#include <math.h>',
    ...(opts.smokeIncludes || [])
  ].join('\n')

  const smoke = `${includes}

int main(void) {
  ${modelName}_t model;
  ${modelName}_init(&model, ${dt});
${opts.smokeMainBody}
}
`
  fs.writeFileSync(path.join(outDir, 'smoke_main.c'), smoke)
  writeCMake(outDir, modelName, subsystemNames)

  const buildDir = path.join(outDir, 'build')
  fs.mkdirSync(buildDir, { recursive: true })
  execSync(`cmake -S "${outDir}" -B "${buildDir}"`, { encoding: 'utf8' })
  execSync(`cmake --build "${buildDir}"`, { encoding: 'utf8' })

  const bin = path.join(buildDir, `${modelName}_smoke`)
  const stdout = execSync(`"${bin}"`, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })

  return {
    outDir,
    stdout,
    header: result.header,
    source: result.source || '',
    subsystemFiles: (result.subsystemFiles || []).map(s => ({
      subsystemName: s.subsystemName,
      header: s.header,
      source: s.source
    }))
  }
}

export function parseResultLine(stdout: string, key: string): number {
  const re = new RegExp(`(?:^|\\n)${key}=(-?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)`)
  const m = stdout.match(re)
  if (!m) {
    throw new Error(`Missing RESULT key ${key} in stdout:\n${stdout}`)
  }
  return Number(m[1])
}

export function cleanupNativeDir(outDir: string | undefined): void {
  // KEEP_NATIVE=1 keeps the generated project for inspection
  if (process.env.KEEP_NATIVE) return
  if (!outDir) return
  try {
    fs.rmSync(outDir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

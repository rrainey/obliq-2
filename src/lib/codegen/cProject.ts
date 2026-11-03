// lib/codegen/cProject.ts
//
// The files of a generated C project. The editor's download and the command line
// (scripts/obliq-cgen.ts) both call buildCProject, so they deliver the same inventory.
// It reads and writes nothing: the caller supplies the generator's result and writes
// or zips the files.

import { CCodeBuilder } from './CCodeBuilder'

export interface PortSpec {
  name: string
  /** C element type, e.g. double */
  cType: string
  /** Array dimensions; [] for a scalar */
  dims: number[]
}

/**
 * The model's input and output ports, read from the generated header's
 * `<model>_inputs_t` and `<model>_outputs_t` structs, so the manifest lists
 * exactly what a host compiles against.
 */
export function portsFromHeader(header: string, modelName: string): { inputs: PortSpec[]; outputs: PortSpec[] } {
  const struct = (suffix: string): PortSpec[] => {
    const m = header.match(new RegExp(`typedef struct \\{([^}]*)\\} ${modelName}_${suffix}_t;`))
    if (!m) return []
    const ports: PortSpec[] = []
    for (const line of m[1]!.split('\n')) {
      const f = line.match(/^\s*([A-Za-z_][\w ]*?)\s+([A-Za-z_]\w*)((?:\[\d+\])*);\s*\/\*\s*(?:Input|Output) port/)
      if (!f) continue
      ports.push({ name: f[2]!, cType: f[1]!.trim(), dims: [...f[3]!.matchAll(/\[(\d+)\]/g)].map(d => Number(d[1])) })
    }
    return ports
  }
  return { inputs: struct('inputs'), outputs: struct('outputs') }
}

/** s: the step of a model with no saved simulation step */
export const DEFAULT_DT = 0.005

/** The model's saved simulation step, for the files that step the model. */
export function defaultStep(data: { globalSettings?: { simulationTimeStep?: unknown } }): number {
  const dt = Number(data.globalSettings?.simulationTimeStep)
  return Number.isFinite(dt) && dt > 0 ? dt : DEFAULT_DT
}

export interface CProjectInput {
  /** Any model name. Files and C identifiers use its sanitized form */
  displayName: string
  result: {
    header: string
    source: string
    warnings?: string[]
    stats?: unknown
    subsystemFiles?: Array<{ subsystemName: string; header: string; source: string }>
  }
  /** s: the step smoke_main.c and the README use */
  dt: number
  /** The saved model version, when the model comes from the store */
  modelVersion?: number
  /** Where the model came from: a file path or a store reference */
  source: string
  generator: { name: string; version: string; commit: string | null; dirty: boolean | null }
  /** A command line profile: replaces the smoke main and adds its own sources */
  profile?: { name: string; smokeMain: string; files: Record<string, string>; sources: string[] }
}

export const cProjectModelName = (displayName: string) => CCodeBuilder.sanitizeIdentifier(displayName)

function cmakeLists(modelName: string, sources: string[]): string {
  const extra = sources.map(s => `  ${s}\n`).join('')
  return `cmake_minimum_required(VERSION 3.16)
project(${modelName}_cgen C)

add_library(${modelName} STATIC
  ${modelName}.c
${extra})
target_include_directories(${modelName} PUBLIC \${CMAKE_CURRENT_SOURCE_DIR})
target_compile_options(${modelName} PRIVATE -Wall -Wextra -O2)
target_link_libraries(${modelName} PUBLIC m)

add_executable(${modelName}_smoke smoke_main.c)
target_compile_definitions(${modelName}_smoke PRIVATE OBLIQ_SMOKE_MAIN)
target_link_libraries(${modelName}_smoke PRIVATE ${modelName})
`
}

/**
 * Guarded: PlatformIO compiles every source in a library's folder, and a second
 * main() would stop an Arduino build. CMakeLists.txt defines OBLIQ_SMOKE_MAIN.
 */
function smokeMain(modelName: string, dt: number): string {
  return `#ifdef OBLIQ_SMOKE_MAIN
#include "${modelName}.h"
#include <stdio.h>

int main(void) {
  static ${modelName}_t model;
  ${modelName}_init(&model, ${dt});
  ${modelName}_seed_from_inputs(&model);
  for (int i = 0; i < 10; i++) {
    ${modelName}_step(&model);
  }
  printf("smoke ok steps=10 time=%g\\n", model.time);
  return 0;
}
#endif
`
}

function readme(modelName: string, input: CProjectInput, moduleNames: string[]): string {
  const { displayName, dt, modelVersion } = input
  const ports = portsFromHeader(input.result.header, modelName)
  const scalar = (list: PortSpec[]) => list.find(p => p.dims.length === 0 && p.cType === 'double')
  const inName = scalar(ports.inputs)?.name
  const outName = scalar(ports.outputs)?.name
  const modules = moduleNames.map(n => `- \`${n}.c\`, \`${n}.h\`: segregated subsystem module\n`).join('')
  return `# ${displayName}: generated C library${modelVersion !== undefined ? ` (version ${modelVersion})` : ''}

obliq-2 generated this library from a block diagram model.

## Files

- \`${modelName}.c\`, \`${modelName}.h\`: the model
${modules}- \`CMakeLists.txt\`: builds a static library and a smoke test
- \`smoke_main.c\`: the smoke test. Only \`CMakeLists.txt\` compiles its contents
- \`cgen-manifest.json\`: the ports, the generator and the files
- \`library.properties\`: PlatformIO and Arduino library description

## Build with CMake

\`\`\`sh
cmake -S . -B build
cmake --build build
./build/${modelName}_smoke
\`\`\`

## Use with PlatformIO

Put this folder in your project's \`lib\` folder, and include \`${modelName}.h\`.

## Use from C

Call \`${modelName}_seed_from_inputs\` once after \`${modelName}_init\`, with the inputs already written. The model's saved step is ${dt} s.

\`\`\`c
#include "${modelName}.h"

static ${modelName}_t model;

int main(void) {
  ${modelName}_init(&model, ${dt});
${inName ? `  model.inputs.${inName} = 0.0;\n` : ''}  ${modelName}_seed_from_inputs(&model);
  for (int i = 0; i < 100; i++) {
${inName ? `    model.inputs.${inName} = 0.0; /* your input */\n` : ''}    ${modelName}_step(&model);
${outName ? `    double ${outName} = model.outputs.${outName}; /* your output */\n    (void)${outName};\n` : ''}  }
  return 0;
}
\`\`\`
`
}

/** All files of the project, by file name. */
export function buildCProject(input: CProjectInput): Record<string, string> {
  const modelName = cProjectModelName(input.displayName)
  const { result, dt, modelVersion, profile } = input
  const modules = result.subsystemFiles ?? []
  const moduleSources = modules.map(m => `${m.subsystemName}.c`)
  const files: Record<string, string> = {
    [`${modelName}.h`]: result.header,
    [`${modelName}.c`]: result.source,
  }
  for (const m of modules) {
    files[`${m.subsystemName}.h`] = m.header
    files[`${m.subsystemName}.c`] = m.source
  }
  Object.assign(files, profile?.files)
  files['smoke_main.c'] = profile?.smokeMain ?? smokeMain(modelName, dt)
  files['CMakeLists.txt'] = cmakeLists(modelName, [...(profile?.sources ?? []), ...moduleSources])
  files['library.properties'] = `name=${modelName}\nversion=${modelVersion ?? 1}\ndescription=Generated C library for ${input.displayName}\n`
  files['README.md'] = readme(modelName, input, modules.map(m => m.subsystemName))
  const ports = portsFromHeader(result.header, modelName)
  files['cgen-manifest.json'] = JSON.stringify({
    modelName,
    displayName: input.displayName,
    profile: profile?.name ?? 'generic',
    ...(modelVersion !== undefined && { modelVersion }),
    sourceJson: input.source,
    generatedAt: new Date().toISOString(),
    generator: input.generator,
    warnings: result.warnings ?? [],
    stats: result.stats ?? {},
    inputs: ports.inputs,
    outputs: ports.outputs,
    files: Object.keys(files),
  }, null, 2) + '\n'
  return files
}

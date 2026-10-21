// lib/codegen/AssertResults.ts
//
// Model-level C for Assert blocks: the OBLIQ_ASSERTS switch, the result type,
// and <model>_assert_count / _assert_result / _stop_requested. All of it is
// inside #ifdef OBLIQ_ASSERTS; obliq's own simulation and test builds define
// it in the header (CodeGenerationOptions.asserts), exported code does not.
//
// Every model gets the functions (with a count of 0 when it has no Assert
// blocks), so runners can call them unconditionally.

import { FlattenedBlock, FlattenedModel } from './ModelFlattener'
import { CCodeBuilder } from './CCodeBuilder'

export const ASSERT_BLOCK_TYPE = 'assert'

/** Assert blocks this model reports: those compiled into its own step function. */
export function reportedAssertBlocks(model: FlattenedModel): FlattenedBlock[] {
  return model.blocks.filter(b => b.block.type === ASSERT_BLOCK_TYPE)
}

/** Assert blocks inside segregated subsystems, which are not checked yet. */
export function unsupportedAssertBlocks(model: FlattenedModel): { subsystem: string; block: FlattenedBlock }[] {
  const found: { subsystem: string; block: FlattenedBlock }[] = []
  for (const sub of model.segregatedSubsystems || []) {
    for (const b of sub.flattenedModel.blocks) {
      if (b.block.type === ASSERT_BLOCK_TYPE) found.push({ subsystem: sub.subsystemName, block: b })
    }
    found.push(...unsupportedAssertBlocks(sub.flattenedModel))
  }
  return found
}

function cString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
}

/** Header text placed after the includes. */
export function generateAssertHeaderPreamble(enabled: boolean): string {
  let code = '/* Assert blocks: compiled only when OBLIQ_ASSERTS is defined */\n'
  if (enabled) {
    code += '#ifndef OBLIQ_ASSERTS\n#define OBLIQ_ASSERTS 1\n#endif\n'
  }
  code += `#ifdef OBLIQ_ASSERTS
#ifndef OBLIQ_ASSERT_RESULT_DEFINED
#define OBLIQ_ASSERT_RESULT_DEFINED
typedef enum {
    OBLIQ_ASSERT_NOT_CHECKED = 0,
    OBLIQ_ASSERT_PASSED = 1,
    OBLIQ_ASSERT_FAILED = 2
} obliq_assert_status_t;

typedef struct {
    const char* name;            /* block name */
    const char* qualified_name;  /* flattened name, unique in the model */
    const char* block_id;        /* editor block id */
    int stops_on_failure;
    obliq_assert_status_t status;
    unsigned long checks;        /* steps checked */
    unsigned long failures;      /* steps failed */
    double first_fail_time;      /* -1 when none */
    double first_fail_value;
    int first_fail_index;        /* flat element index; -1 for a scalar or when none */
    double worst_violation;      /* largest amount outside the condition */
} obliq_assert_result_t;
#endif
#endif
`
  return code
}

/** Model struct member (inside the struct). */
export function generateAssertStructMember(): string {
  return '#ifdef OBLIQ_ASSERTS\n    int stop_requested; /* set by an Assert that stops on failure */\n#endif'
}

export function generateAssertPrototypes(modelName: string): string {
  return `#ifdef OBLIQ_ASSERTS
/* Number of Assert blocks reported by ${modelName}_assert_result */
int ${modelName}_assert_count(void);
/* Result of Assert block i; returns 0, or -1 for a bad index */
int ${modelName}_assert_result(const ${modelName}_t* model, int index, obliq_assert_result_t* result);
/* Non-zero once an Assert set to stop on failure has failed */
int ${modelName}_stop_requested(const ${modelName}_t* model);
#endif
`
}

export function generateAssertFunctions(modelName: string, asserts: FlattenedBlock[]): string {
  let code = '#ifdef OBLIQ_ASSERTS\n'
  code += `int ${modelName}_assert_count(void) {\n    return ${asserts.length};\n}\n\n`
  code += `int ${modelName}_assert_result(const ${modelName}_t* model, int index, obliq_assert_result_t* r) {\n`
  if (asserts.length === 0) {
    code += '    (void)model; (void)index; (void)r;\n    return -1;\n}\n\n'
  } else {
    code += '    switch (index) {\n'
    asserts.forEach((b, i) => {
      const st = `model->states.${CCodeBuilder.sanitizeIdentifier(b.flattenedName)}`
      code += `    case ${i}:\n`
      code += `        r->name = ${cString(b.block.name)};\n`
      code += `        r->qualified_name = ${cString(b.flattenedName)};\n`
      code += `        r->block_id = ${cString(b.originalId)};\n`
      code += `        r->stops_on_failure = ${b.block.parameters?.onFailure === 'stop' ? 1 : 0};\n`
      code += `        r->checks = ${st}_checks;\n`
      code += `        r->failures = ${st}_failures;\n`
      code += `        r->first_fail_time = ${st}_first_fail_time;\n`
      code += `        r->first_fail_value = ${st}_first_fail_value;\n`
      code += `        r->first_fail_index = ${st}_first_fail_index;\n`
      code += `        r->worst_violation = ${st}_worst_violation;\n`
      code += '        break;\n'
    })
    code += '    default:\n        return -1;\n    }\n'
    code += '    r->status = r->checks == 0UL ? OBLIQ_ASSERT_NOT_CHECKED\n'
    code += '              : r->failures > 0UL ? OBLIQ_ASSERT_FAILED : OBLIQ_ASSERT_PASSED;\n'
    code += '    return 0;\n}\n\n'
  }
  code += `int ${modelName}_stop_requested(const ${modelName}_t* model) {\n    return model->stop_requested;\n}\n`
  code += '#endif /* OBLIQ_ASSERTS */\n'
  return code
}

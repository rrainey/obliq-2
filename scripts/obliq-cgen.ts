#!/usr/bin/env npx tsx
/**
 * Emit a standalone C project from an Obliq model JSON document.
 *
 * Usage:
 *   npx --yes tsx scripts/obliq-cgen.ts <model.json> --out <dir> \
 *     [--name my_model] [--profile generic|saturn-ib-stack] [--dt 0.005] [--compile]
 *
 * Accepts either:
 *   { "name": "...", "data": { "sheets": [...], "parameters": [...] } }
 *   { "sheets": [...], "parameters": [...], ... }   // bare ModelData
 */

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { CodeGenerator } from '../src/lib/codegen/CodeGenerator'
import { CCodeBuilder } from '../src/lib/codegen/CCodeBuilder'

type Profile = 'generic' | 'saturn-ib-stack'

function usage(): never {
  console.error(`Usage: npx tsx scripts/obliq-cgen.ts <model.json> --out <dir> [options]

Options:
  --out <dir>              Output directory (required)
  --name <id>              C identifier / lib name (default: from JSON name or 'obliq_model')
  --profile <name>         generic (default) | saturn-ib-stack
  --dt <sec>               Default step used in smoke main (default 0.005)
  --algorithm <rk4|euler>  Integration algorithm (default rk4)
  --compile                gcc-compile static lib + smoke main after emit
  --help                   This message
`)
  process.exit(1)
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  if (i < 0 || i + 1 >= process.argv.length) return undefined
  return process.argv[i + 1]
}

function positionalModel(): string | undefined {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
  // skip values that belong to flags (simple: only first non-flag that looks like a path)
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]
    if (a.startsWith('--')) {
      if (a !== '--compile' && a !== '--help' && a !== '-h') i++
      continue
    }
    return a
  }
  return undefined
}

function loadModelJson(filePath: string): {
  displayName: string
  sheets: any[]
  parameters: any[]
  dataStores: any[]
  integrationAlgorithm?: 'rk4' | 'euler'
} {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const data = raw.data && raw.data.sheets ? raw.data : raw
  if (!data.sheets || !Array.isArray(data.sheets)) {
    throw new Error(`No sheets[] in ${filePath}`)
  }
  const displayName =
    (typeof raw.name === 'string' && raw.name) ||
    data.metadata?.description ||
    path.basename(filePath, '.json')
  const algo = data.globalSettings?.integrationAlgorithm
  return {
    displayName,
    sheets: data.sheets,
    parameters: data.parameters || [],
    dataStores: data.dataStores || [],
    integrationAlgorithm: algo === 'euler' || algo === 'rk4' ? algo : undefined
  }
}

function saturnIbAdapterHeader(modelName: string): string {
  return `/**
 * RTW-shaped adapter stubs for Saturn_IB_Stack ExternalInputs/Outputs.
 * Wire Obliq ports to these fields as the plant grows (Phase 1 Tier B).
 */
#ifndef ${modelName.toUpperCase()}_RTW_ADAPTER_H
#define ${modelName.toUpperCase()}_RTW_ADAPTER_H

#include "${modelName}.h"
#include <stdbool.h>

typedef struct {
  double LaunchDate[6];
  double A_z_deg;
  double CG_LLA_deg_m[3];
  double q_ECItoSM[4];
  double T_L_prime_sec;
} ExternalInputs_saturn_ib_stack;

typedef struct {
  double FDAI_Roll_deg;
  double FDAI_Pitch_deg;
  double FDAI_Yaw_deg;
  double FDAI_RollDot_dps;
  double FDAI_PitchDot_dps;
  double FDAI_YawDot_dps;
  double CM_IMU_PIPA_Pulses[3];
  double CM_IMU_IGA_rad;
  double CM_IMU_MGA_Rad;
  double CM_IMU_OGA_rad;
  double OUT11[25];
  double OUT12[24];
  bool bStageSep;
  bool bIECO;
  bool bOECO;
  bool bS_IVB_EngineStart;
  double veh_q_ECI[4];
  bool bLiftoff;
  double BodyToSM_Phi_deg;
  double BodyToSM_Theta_deg;
  double BodyToSM_Psi_deg;
  double OUT22[9];
} ExternalOutputs_saturn_ib_stack;

#ifdef __cplusplus
extern "C" {
#endif

/** Copy host inputs into Obliq model inputs (stub: LaunchDate/A_z/… unmapped until ports exist). */
void ${modelName}_apply_external_inputs(
  ${modelName}_t *model,
  const ExternalInputs_saturn_ib_stack *in
);

/** Copy Obliq outputs into RTW-shaped outs (stub: zeros until ports exist). */
void ${modelName}_collect_external_outputs(
  const ${modelName}_t *model,
  ExternalOutputs_saturn_ib_stack *out
);

/** One 200 Hz-style step: apply inputs → step → collect outputs. */
void ${modelName}_rtw_step(
  ${modelName}_t *model,
  const ExternalInputs_saturn_ib_stack *in,
  ExternalOutputs_saturn_ib_stack *out
);

#ifdef __cplusplus
}
#endif

#endif /* ${modelName.toUpperCase()}_RTW_ADAPTER_H */
`
}

function saturnIbAdapterSource(modelName: string): string {
  return `#include "${modelName}_rtw_adapter.h"
#include <string.h>
#include <math.h>

/* Reseed integrator ICs only once after inputs are live — never every step. */
static int ${modelName}_ics_seeded = 0;

void ${modelName}_apply_external_inputs(
  ${modelName}_t *model,
  const ExternalInputs_saturn_ib_stack *in
) {
  if (!model || !in) return;
  for (int i = 0; i < 6; i++) model->inputs.LaunchDate[i] = in->LaunchDate[i];
  model->inputs.A_z_deg = in->A_z_deg;
  for (int i = 0; i < 3; i++) model->inputs.CG_LLA_deg_m[i] = in->CG_LLA_deg_m[i];
  for (int i = 0; i < 4; i++) model->inputs.q_ECItoSM[i][0] = in->q_ECItoSM[i];
  model->inputs.T_L_prime_sec = in->T_L_prime_sec;
  /* Algebraic IC (LLA→ECF, DCM→quat) depends on inputs; reseed states once. */
  ${modelName}_evaluate_algebraic(model);
  if (!${modelName}_ics_seeded) {
    ${modelName}_reseed_integrator_ics(model);
    ${modelName}_evaluate_algebraic(model);
    ${modelName}_ics_seeded = 1;
  }
}

void ${modelName}_collect_external_outputs(
  const ${modelName}_t *model,
  ExternalOutputs_saturn_ib_stack *out
) {
  if (!model || !out) return;
  memset(out, 0, sizeof(*out));
  out->FDAI_Roll_deg = model->outputs.FDAI_Roll_deg;
  out->FDAI_Pitch_deg = model->outputs.FDAI_Pitch_deg;
  out->FDAI_Yaw_deg = model->outputs.FDAI_Yaw_deg;
  out->FDAI_RollDot_dps = model->outputs.FDAI_RollDot_dps;
  out->FDAI_PitchDot_dps = model->outputs.FDAI_PitchDot_dps;
  out->FDAI_YawDot_dps = model->outputs.FDAI_YawDot_dps;
  for (int i = 0; i < 3; i++) out->CM_IMU_PIPA_Pulses[i] = model->outputs.CM_IMU_PIPA_Pulses[i];
  out->CM_IMU_IGA_rad = model->outputs.CM_IMU_IGA_rad;
  out->CM_IMU_MGA_Rad = model->outputs.CM_IMU_MGA_Rad;
  out->CM_IMU_OGA_rad = model->outputs.CM_IMU_OGA_rad;
  /* Model Out11 is double[12]; RTW OUT11 is [25] — copy what we have */
  for (int i = 0; i < 12 && i < 25; i++) out->OUT11[i] = model->outputs.Out11[i];
  for (int i = 0; i < 11 && i < 24; i++) out->OUT12[i] = model->outputs.Out12[i];
  out->bStageSep = model->outputs.bStageSep;
  out->bIECO = model->outputs.bIECO;
  out->bOECO = model->outputs.bOECO;
  out->bS_IVB_EngineStart = model->outputs.bS_IVB_EngineStart;
  for (int i = 0; i < 4; i++) out->veh_q_ECI[i] = model->outputs.veh_q_ECI[i][0];
  out->bLiftoff = (model->outputs.bLiftoff != 0.0);
  out->BodyToSM_Phi_deg = model->outputs.BodyToSM_Phi_deg;
  out->BodyToSM_Theta_deg = model->outputs.BodyToSM_Theta_deg;
  out->BodyToSM_Psi_deg = model->outputs.BodyToSM_Psi_deg;
  /*
   * OUT22 pad reference [lat, lon, h, Xe[3], Ve[3]].
   * Primary: root Out22 from mdl2obliq wireRootOut22.
   * Fallback: flattened On_Pad signals (if Out22 port absent, cgen will fail
   * on outputs.Out22 — saturn-ib-stack emit always wires it when On_Pad exists).
   */
  for (int i = 0; i < 9; i++) out->OUT22[i] = model->outputs.Out22[i];
  /* Pack primary trajectory: S_IB until stage sep; S_IVB after; else IC Product.
   * (S_IVB xe IC is Body_to_ECI_Sum and is not pad-correct before sep.) */
  {
    const double *xe_ivb = model->signals.S_IVB_Stage_Custom_Variable_Mass_6DoF_Quaternion_xe_ye_ze;
    const double *ve_ivb = model->signals.S_IVB_Stage_Custom_Variable_Mass_6DoF_Quaternion_Velocity_Conversion1;
    const double *xe_ib = model->signals.S_IB_Stage_Custom_Variable_Mass_6DoF_Quaternion_xe_ye_ze;
    const double *ve_ib = model->signals.S_IB_Stage_Custom_Variable_Mass_6DoF_Quaternion_Velocity_Conversion1;
    const double *xe_ic = model->signals.Initial_Conditions_Product;
    const double *q_ib = &model->signals.S_IB_Stage_Custom_Variable_Mass_6DoF_Quaternion_Calculate_DCM_Euler_Angles_q0_q1_q2_q3[0][0];
    double rib = sqrt(xe_ib[0]*xe_ib[0]+xe_ib[1]*xe_ib[1]+xe_ib[2]*xe_ib[2]);
    double rivb = sqrt(xe_ivb[0]*xe_ivb[0]+xe_ivb[1]*xe_ivb[1]+xe_ivb[2]*xe_ivb[2]);
    int use_ivb = out->bStageSep && rivb > 1.0;
    const double *xe = use_ivb ? xe_ivb : (rib > 1.0 ? xe_ib : xe_ic);
    const double *ve = use_ivb ? ve_ivb : ve_ib;
    double r = sqrt(xe[0]*xe[0] + xe[1]*xe[1] + xe[2]*xe[2]);
    out->OUT11[0] = xe[0];
    out->OUT11[1] = xe[1];
    out->OUT11[2] = xe[2];
    out->OUT11[3] = ve[0];
    out->OUT11[4] = ve[1];
    out->OUT11[5] = ve[2];
    out->OUT11[6] = r > 0.0 ? (r - 6371000.0) : 0.0;
    /* Fallback quat from S_IB EOM if top-level veh_q_ECI port is still zero */
    {
      double qn = fabs(out->veh_q_ECI[0]) + fabs(out->veh_q_ECI[1]) +
                  fabs(out->veh_q_ECI[2]) + fabs(out->veh_q_ECI[3]);
      if (qn < 1e-12) {
        out->veh_q_ECI[0] = model->signals.S_IB_Stage_Custom_Variable_Mass_6DoF_Quaternion_Calculate_DCM_Euler_Angles_q0_q1_q2_q3[0][0];
        out->veh_q_ECI[1] = model->signals.S_IB_Stage_Custom_Variable_Mass_6DoF_Quaternion_Calculate_DCM_Euler_Angles_q0_q1_q2_q3[1][0];
        out->veh_q_ECI[2] = model->signals.S_IB_Stage_Custom_Variable_Mass_6DoF_Quaternion_Calculate_DCM_Euler_Angles_q0_q1_q2_q3[2][0];
        out->veh_q_ECI[3] = model->signals.S_IB_Stage_Custom_Variable_Mass_6DoF_Quaternion_Calculate_DCM_Euler_Angles_q0_q1_q2_q3[3][0];
        (void)q_ib;
      }
    }
  }
}

void ${modelName}_rtw_step(
  ${modelName}_t *model,
  const ExternalInputs_saturn_ib_stack *in,
  ExternalOutputs_saturn_ib_stack *out
) {
  ${modelName}_apply_external_inputs(model, in);
  ${modelName}_step(model);
  ${modelName}_collect_external_outputs(model, out);
}
`
}

function cmakeLists(modelName: string, profile: Profile): string {
  const adapter =
    profile === 'saturn-ib-stack'
      ? `  ${modelName}_rtw_adapter.c\n`
      : ''
  return `cmake_minimum_required(VERSION 3.16)
project(${modelName}_cgen C)

add_library(${modelName} STATIC
  ${modelName}.c
${adapter})
target_include_directories(${modelName} PUBLIC \${CMAKE_CURRENT_SOURCE_DIR})
target_compile_options(${modelName} PRIVATE -Wall -Wextra -O2)

add_executable(${modelName}_smoke smoke_main.c)
target_link_libraries(${modelName}_smoke PRIVATE ${modelName} m)
`
}

function smokeMain(modelName: string, dt: number, profile: Profile): string {
  if (profile === 'saturn-ib-stack') {
    return `#include "${modelName}_rtw_adapter.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <math.h>

static void write_final_json(const char *path, double t,
                             const ExternalOutputs_saturn_ib_stack *o) {
  FILE *f = fopen(path, "w");
  if (!f) { perror(path); return; }
  fprintf(f, "{\\n");
  fprintf(f, "  \\"elapsed_sim_sec\\": %.17g,\\n", t);
  fprintf(f, "  \\"s2_Xe_x_m\\": %.17g,\\n", o->OUT11[0]);
  fprintf(f, "  \\"s2_Xe_y_m\\": %.17g,\\n", o->OUT11[1]);
  fprintf(f, "  \\"s2_Xe_z_m\\": %.17g,\\n", o->OUT11[2]);
  fprintf(f, "  \\"s2_Ve_x_mps\\": %.17g,\\n", o->OUT11[3]);
  fprintf(f, "  \\"s2_Ve_y_mps\\": %.17g,\\n", o->OUT11[4]);
  fprintf(f, "  \\"s2_Ve_z_mps\\": %.17g,\\n", o->OUT11[5]);
  fprintf(f, "  \\"s2_h_m\\": %.17g,\\n", o->OUT11[6]);
  fprintf(f, "  \\"veh_q_ECI_q0\\": %.17g,\\n", o->veh_q_ECI[0]);
  fprintf(f, "  \\"veh_q_ECI_q1\\": %.17g,\\n", o->veh_q_ECI[1]);
  fprintf(f, "  \\"veh_q_ECI_q2\\": %.17g,\\n", o->veh_q_ECI[2]);
  fprintf(f, "  \\"veh_q_ECI_q3\\": %.17g,\\n", o->veh_q_ECI[3]);
  fprintf(f, "  \\"BodyToSM_Phi_deg\\": %.17g,\\n", o->BodyToSM_Phi_deg);
  fprintf(f, "  \\"BodyToSM_Theta_deg\\": %.17g,\\n", o->BodyToSM_Theta_deg);
  fprintf(f, "  \\"BodyToSM_Psi_deg\\": %.17g,\\n", o->BodyToSM_Psi_deg);
  fprintf(f, "  \\"pad_lat_deg\\": %.17g,\\n", o->OUT22[0]);
  fprintf(f, "  \\"pad_lon_deg\\": %.17g,\\n", o->OUT22[1]);
  fprintf(f, "  \\"pad_h_m\\": %.17g,\\n", o->OUT22[2]);
  fprintf(f, "  \\"pad_Xe_x_m\\": %.17g,\\n", o->OUT22[3]);
  fprintf(f, "  \\"pad_Xe_y_m\\": %.17g,\\n", o->OUT22[4]);
  fprintf(f, "  \\"pad_Xe_z_m\\": %.17g,\\n", o->OUT22[5]);
  fprintf(f, "  \\"pad_Ve_x_mps\\": %.17g,\\n", o->OUT22[6]);
  fprintf(f, "  \\"pad_Ve_y_mps\\": %.17g,\\n", o->OUT22[7]);
  fprintf(f, "  \\"pad_Ve_z_mps\\": %.17g,\\n", o->OUT22[8]);
  fprintf(f, "  \\"bLiftoff\\": %s,\\n", o->bLiftoff ? "true" : "false");
  fprintf(f, "  \\"bStageSep\\": %s,\\n", o->bStageSep ? "true" : "false");
  fprintf(f, "  \\"bIECO\\": %s,\\n", o->bIECO ? "true" : "false");
  fprintf(f, "  \\"bOECO\\": %s,\\n", o->bOECO ? "true" : "false");
  fprintf(f, "  \\"bS_IVB_EngineStart\\": %s\\n", o->bS_IVB_EngineStart ? "true" : "false");
  fprintf(f, "}\\n");
  fclose(f);
}

int main(int argc, char **argv) {
  double duration = 1.0;
  const char *outPath = "final.json";
  for (int a = 1; a < argc; a++) {
    if (!strcmp(argv[a], "--duration") && a + 1 < argc) duration = atof(argv[++a]);
    else if (!strcmp(argv[a], "--out") && a + 1 < argc) outPath = argv[++a];
  }

  ${modelName}_t model;
  ExternalInputs_saturn_ib_stack in;
  ExternalOutputs_saturn_ib_stack out;
  memset(&in, 0, sizeof(in));
  in.A_z_deg = 82.82;
  in.CG_LLA_deg_m[0] = 28.521963;
  in.CG_LLA_deg_m[1] = -80.561141;
  in.CG_LLA_deg_m[2] = 34.7;
  in.T_L_prime_sec = 300.0;
  in.q_ECItoSM[0] = 1.0;
  in.LaunchDate[0] = 1968; in.LaunchDate[1] = 10; in.LaunchDate[2] = 11;
  in.LaunchDate[3] = 14; in.LaunchDate[4] = 57; in.LaunchDate[5] = 45;

  ${modelName}_init(&model, ${dt});
  ${modelName}_apply_external_inputs(&model, &in);
  /* IC snapshot after init (before stepping) */
  ${modelName}_collect_external_outputs(&model, &out);
  write_final_json("final-ic.json", model.time, &out);

  const int nsteps = (int)(duration / ${dt} + 0.5);
  for (int i = 0; i < nsteps; i++) {
    ${modelName}_rtw_step(&model, &in, &out);
  }
  write_final_json(outPath, model.time, &out);
  printf("batch ok steps=%d time=%g out=%s bLiftoff=%d Xe=(%.3g,%.3g,%.3g)\\n",
         nsteps, model.time, outPath, (int)out.bLiftoff,
         out.OUT11[0], out.OUT11[1], out.OUT11[2]);
  printf("  OUT22 pad lat=%.6f lon=%.6f h=%.3f |Xe|=%.3f\\n",
         out.OUT22[0], out.OUT22[1], out.OUT22[2],
         sqrt(out.OUT22[3]*out.OUT22[3]+out.OUT22[4]*out.OUT22[4]+out.OUT22[5]*out.OUT22[5]));
  return 0;
}
`
  }
  return `#include "${modelName}.h"
#include <stdio.h>

int main(void) {
  ${modelName}_t model;
  ${modelName}_init(&model, ${dt});
  for (int i = 0; i < 10; i++) {
    ${modelName}_step(&model);
  }
  printf("smoke ok steps=10 time=%g\\n", model.time);
  return 0;
}
`
}

function writeManifest(
  outDir: string,
  meta: {
    modelName: string
    displayName: string
    profile: Profile
    sourceJson: string
    warnings: string[]
    stats: Record<string, number>
  }
) {
  const manifest = {
    modelName: meta.modelName,
    displayName: meta.displayName,
    profile: meta.profile,
    sourceJson: meta.sourceJson,
    generatedAt: new Date().toISOString(),
    warnings: meta.warnings,
    stats: meta.stats,
    files:
      meta.profile === 'saturn-ib-stack'
        ? [
            `${meta.modelName}.c`,
            `${meta.modelName}.h`,
            `${meta.modelName}_rtw_adapter.c`,
            `${meta.modelName}_rtw_adapter.h`,
            'CMakeLists.txt',
            'smoke_main.c'
          ]
        : [`${meta.modelName}.c`, `${meta.modelName}.h`, 'CMakeLists.txt', 'smoke_main.c']
  }
  fs.writeFileSync(
    path.join(outDir, 'cgen-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  )
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) usage()

  const modelPath = positionalModel()
  const outDir = arg('--out')
  if (!modelPath || !outDir) {
    console.error('Error: <model.json> and --out are required\n')
    usage()
  }
  if (!fs.existsSync(modelPath!)) {
    console.error(`Model not found: ${modelPath}`)
    process.exit(1)
  }

  const profile = (arg('--profile') || 'generic') as Profile
  if (profile !== 'generic' && profile !== 'saturn-ib-stack') {
    console.error(`Unknown profile: ${profile}`)
    process.exit(1)
  }

  const dt = Number(arg('--dt') ?? '0.005')
  const loaded = loadModelJson(modelPath!)
  const rawName = arg('--name') || loaded.displayName
  const modelName = CCodeBuilder.sanitizeIdentifier(rawName)
  const algorithm =
    (arg('--algorithm') as 'rk4' | 'euler' | undefined) ||
    loaded.integrationAlgorithm ||
    'rk4'

  const gen = new CodeGenerator({
    modelName,
    integrationAlgorithm: algorithm,
    generateMain: false
  })
  const result = gen.generate(
    loaded.sheets as any,
    loaded.parameters as any,
    loaded.dataStores as any
  )

  if (result.source.includes('Error generating code for')) {
    console.error('Code generation reported block errors; see source.')
  }

  const absOut = path.resolve(outDir!)
  fs.mkdirSync(absOut, { recursive: true })
  fs.writeFileSync(path.join(absOut, `${modelName}.h`), result.header)
  fs.writeFileSync(path.join(absOut, `${modelName}.c`), result.source)
  fs.writeFileSync(path.join(absOut, 'CMakeLists.txt'), cmakeLists(modelName, profile))
  fs.writeFileSync(path.join(absOut, 'smoke_main.c'), smokeMain(modelName, dt, profile))

  if (profile === 'saturn-ib-stack') {
    fs.writeFileSync(
      path.join(absOut, `${modelName}_rtw_adapter.h`),
      saturnIbAdapterHeader(modelName)
    )
    fs.writeFileSync(
      path.join(absOut, `${modelName}_rtw_adapter.c`),
      saturnIbAdapterSource(modelName)
    )
  }

  for (const sub of result.subsystemFiles || []) {
    fs.writeFileSync(path.join(absOut, sub.headerFileName), sub.header)
    fs.writeFileSync(path.join(absOut, sub.sourceFileName), sub.source)
  }

  writeManifest(absOut, {
    modelName,
    displayName: loaded.displayName,
    profile,
    sourceJson: path.resolve(modelPath!),
    warnings: result.warnings || [],
    stats: result.stats as any
  })

  console.log(`Wrote C project → ${absOut}`)
  console.log(`  model: ${modelName}  profile: ${profile}  algo: ${algorithm}`)
  if (result.warnings?.length) {
    console.log(`  warnings: ${result.warnings.length}`)
  }

  if (process.argv.includes('--compile')) {
    const buildDir = path.join(absOut, 'build')
    fs.mkdirSync(buildDir, { recursive: true })
    console.log('Configuring + building smoke…')
    execSync(`cmake -S "${absOut}" -B "${buildDir}"`, { stdio: 'inherit' })
    execSync(`cmake --build "${buildDir}"`, { stdio: 'inherit' })
    execSync(`"${path.join(buildDir, `${modelName}_smoke`)}"`, { stdio: 'inherit' })
  }
}

main()

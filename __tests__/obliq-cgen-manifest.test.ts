/**
 * scripts/obliq-cgen.ts manifest: it lists the model's input and output
 * ports (name, C type, dimensions) from the generated header, the obliq-2
 * version and commit that generated it, and every file it wrote, including
 * segregated subsystem modules. An integrating host checks an export against
 * its interface from the manifest alone.
 */
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { portsFromHeader } from '../scripts/obliq-cgen'
import { VEHICLE_INPUTS } from '../scripts/build-fpv-reference-model'

jest.setTimeout(300000)

describe('obliq-cgen manifest', () => {
  test('portsFromHeader reads scalars, vectors and matrices from the port structs only', () => {
    const header = `
typedef struct {
    double a; /* Input port: a */
    double v[3]; /* Input port: v */
    int32_t m[2][4]; /* Input port: m */
} demo_inputs_t;

typedef struct {
    double y[6]; /* Output port: y */
    bool flag; /* Output port: flag */
} demo_outputs_t;

typedef struct {
    double not_a_port[2];
} demo_signals_t;
`
    expect(portsFromHeader(header, 'demo')).toEqual({
      inputs: [
        { name: 'a', cType: 'double', dims: [] },
        { name: 'v', cType: 'double', dims: [3] },
        { name: 'm', cType: 'int32_t', dims: [2, 4] },
      ],
      outputs: [
        { name: 'y', cType: 'double', dims: [6] },
        { name: 'flag', cType: 'bool', dims: [] },
      ],
    })
    expect(portsFromHeader(header, 'other')).toEqual({ inputs: [], outputs: [] })
  })

  test('the FPV Vehicle export lists its ports, generator and every file', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'obliq-cgen-manifest-'))
    try {
      const root = path.resolve(__dirname, '..')
      execFileSync('npx', ['tsx', 'scripts/obliq-cgen.ts', 'reference-models/fpv-vehicle.json', '--out', out, '--name', 'FPV_Vehicle'],
        { cwd: root, stdio: 'ignore' })
      const manifest = JSON.parse(fs.readFileSync(path.join(out, 'cgen-manifest.json'), 'utf8'))
      // Inputs in port order, with the builder's types
      expect(manifest.inputs).toEqual(VEHICLE_INPUTS.map(([name, type]) => {
        const dims = [...type.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]))
        return { name, cType: 'double', dims }
      }))
      const outputs = manifest.outputs.map((p: { name: string }) => p.name)
      for (const name of ['gnss_pos', 'alt_est', 'fc_mode', 'fc_warnings', 'rescue_phase', 'home_distance_m']) {
        expect(outputs).toContain(name)
      }
      expect(manifest.outputs.find((p: { name: string }) => p.name === 'gnss_pos')).toEqual({ name: 'gnss_pos', cType: 'double', dims: [3] })
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
      expect(manifest.generator.name).toBe('obliq-2')
      expect(manifest.generator.version).toBe(pkg.version)
      expect(manifest.generator.commit).toMatch(/^[0-9a-f]{40}$/)
      expect(typeof manifest.generator.dirty).toBe('boolean')
      // Every listed file was written, including the segregated motor module
      expect(manifest.files).toEqual(expect.arrayContaining(['FPV_Vehicle.c', 'FPV_Vehicle.h', 'Motor_RR.c', 'Motor_RR.h', 'CMakeLists.txt', 'smoke_main.c']))
      for (const f of manifest.files) expect(fs.existsSync(path.join(out, f))).toBe(true)
    } finally {
      fs.rmSync(out, { recursive: true, force: true })
    }
  })
})

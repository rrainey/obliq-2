/**
 * Saturation Dynamic: element-wise clamp(u, lo, up) for vectors, and the
 * integration of the block in the palette, the registry, validation, the
 * model schema, the Model Builder API, the MCP server and the PDF.
 */

import { SaturationDynamicBlockModule } from '../src/lib/blocks/SaturationDynamicBlockModule'
import type { BlockData } from '../src/components/BlockNode'
import { blockTypes as paletteEntries } from '../src/components/BlockLibrarySidebar'
import { BlockTypes, blockTypeRegistry, isValidBlockType } from '../src/lib/blockTypeRegistry'
import { BlockModuleFactory } from '../src/lib/blocks/BlockModuleFactory'
import { PortCountAdapter } from '../src/lib/validation/PortCountAdapter'
import { createBlock } from '../src/lib/blockFactory'
import { validateBlockParameters } from '../src/lib/blockParameterValidator'
import { validateModelDataWithErrors } from '../src/lib/modelSchema'
import {
  saturationDynamicInputError,
  validateBlockOperation,
  validateModelTypeCompatibilityMultiSheet,
} from '../src/lib/typeCompatibilityValidator'
import { validateMultiSheetTypeCompatibility } from '../src/lib/multiSheetTypeValidator'
import { getGlyphSpec, glyphWorkList } from '../src/lib/export/blockGlyphs'
import { blockTypeSchemas, listBlockTypesTool } from '../mcp-server/src/tools/block-types'


const mod = new SaturationDynamicBlockModule()
const block = {
  id: 'sat1',
  type: 'saturation_dynamic',
  name: 'Saturation_Dynamic',
  parameters: { numInputs: 3 }
} as unknown as BlockData

describe('SaturationDynamicBlockModule', () => {

  test('output type follows u when vector', () => {
    expect(
      mod.getOutputType(block, ['double[3]', 'double[3]', 'double[3]'])
    ).toBe('double[3]')
    expect(mod.getOutputType(block, ['double', 'double[3]', 'double'])).toBe(
      'double[3]'
    )
  })

  test('generates element-wise clamp loop for double[3]', () => {
    const code = mod.generateComputation(
      block,
      ['model->signals.up', 'model->signals.u', 'model->signals.lo'],
      ['double[3]', 'double[3]', 'double[3]']
    )
    expect(code).toMatch(/for \(int i = 0; i < 3; i\+\+\)/)
    expect(code).toMatch(/fmax\(_lo, fmin\(_up, _u\)\)/)
    expect(code).not.toMatch(/vector→scalar head/)
  })

  test('scalar clamp when all scalar', () => {
    const code = mod.generateComputation(
      block,
      ['model->signals.up', 'model->signals.u', 'model->signals.lo'],
      ['double', 'double', 'double']
    )
    expect(code).toMatch(
      /Saturation_Dynamic = fmax\(model->signals\.lo, fmin\(model->signals\.up, model->signals\.u\)\)/
    )
    expect(code).not.toMatch(/for \(int i/)
  })
})

// --- Integration: palette, registry, ports, validation, schema, API, MCP ---

describe('Saturation Dynamic: user-facing integration', () => {
  test('is in the palette under Discontinuities', () => {
    const entry = paletteEntries.find(b => b.id === 'saturation_dynamic')
    expect(entry).toBeDefined()
    expect(entry!.name).toBe('Saturation Dynamic')
    expect(entry!.category).toBe('Discontinuities')
    expect(entry!.vectorSupport).toBe('full')
    expect(entry!.description.length).toBeGreaterThan(0)
    expect(entry!.icon.length).toBeGreaterThan(0)
  })

  test('has a registry entry that agrees with the module and the palette', () => {
    expect(BlockTypes.SATURATION_DYNAMIC).toBe('saturation_dynamic')
    expect(isValidBlockType('saturation_dynamic')).toBe(true)
    const def = blockTypeRegistry[BlockTypes.SATURATION_DYNAMIC]
    expect(def.displayName).toBe('Saturation Dynamic')
    expect(def.category).toBe('Discontinuities')
    expect(def.defaultParameters).toEqual({})
    expect(def.inputs.map(p => p.name)).toEqual(['up', 'u', 'lo'])
    expect(def.outputs.map(p => p.name)).toEqual(['y'])
    expect(def.inputs.map(p => p.name)).toEqual(mod.getInputPortLabels(block))
    expect(def.outputs.map(p => p.name)).toEqual(mod.getOutputPortLabels(block))
  })

  test('factory, port counts and port labels (port order up, u, lo)', () => {
    expect(BlockModuleFactory.isSupported('saturation_dynamic')).toBe(true)
    expect(BlockModuleFactory.getSupportedBlockTypes()).toContain('saturation_dynamic')
    expect(PortCountAdapter.getPortCounts(block)).toEqual({ inputCount: 3, outputCount: 1 })
    expect(PortCountAdapter.getInputPortLabels(block)).toEqual(['up', 'u', 'lo'])
    expect(PortCountAdapter.getOutputPortLabels(block)).toEqual(['y'])
  })

  test('a block dropped on the canvas (createBlock) has 3 inputs, 1 output and no parameters', () => {
    const b = createBlock('saturation_dynamic', { existingBlockCount: 2 })
    expect(b.name).toBe('Saturation Dynamic2')
    expect(b.inputs).toEqual(['up', 'u', 'lo'])
    expect(b.outputs).toEqual(['y'])
    expect(b.parameters).toEqual({ showName: false })
  })

  test('Model Builder API parameter validation accepts it (no parameters)', () => {
    const v = validateBlockParameters(BlockTypes.SATURATION_DYNAMIC, {})
    expect(v.valid).toBe(true)
    expect(validateBlockParameters(BlockTypes.SATURATION_DYNAMIC, { flipped: true }).valid).toBe(true)
  })

  test('the model schema accepts a model that contains it', () => {
    const result = validateModelDataWithErrors({
      version: '1.0',
      metadata: { created: '2026-01-01T00:00:00.000Z', description: 'sat' },
      sheets: [{
        id: 'main', name: 'Main',
        blocks: [{ id: 's1', type: 'saturation_dynamic', name: 'Sat', position: { x: 0, y: 0 }, parameters: {} }],
        connections: [],
        extents: { width: 800, height: 600 },
      }],
      globalSettings: { simulationTimeStep: 0.01, simulationDuration: 10 },
    })
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  test('MCP list_block_types lists it with the port names', async () => {
    const info = blockTypeSchemas.find(b => b.type === 'saturation_dynamic')
    expect(info).toBeDefined()
    expect(info!.category).toBe('Discontinuities')
    expect(info!.inputs).toEqual(['up', 'u', 'lo'])
    expect(info!.outputs).toEqual(['y'])
    expect(info!.parameters).toEqual({})
    const res: any = await listBlockTypesTool.handler({ category: 'Discontinuities' })
    expect(res.success).toBe(true)
    expect(res.blockTypes.Discontinuities.map((b: { type: string }) => b.type)).toContain('saturation_dynamic')
  })

  test('the PDF draws it as vector paths, and it is not on the glyph work list', () => {
    expect(getGlyphSpec(block).kind).toBe('draw')
    expect(getGlyphSpec(block).text).toBeUndefined()
    expect(glyphWorkList().some(i => i.blockType === 'saturation_dynamic')).toBe(false)
  })
})

describe('Saturation Dynamic: input shapes and type validation', () => {
  test.each([
    [['double', 'double', 'double']],
    [['double[3]', 'double[3]', 'double[3]']],
    [['double', 'double[3]', 'double']],
    [['double[3]', 'double', 'double[3]']],
    [['double[2][2]', 'double[2][2]', 'double']],
    [['float', 'float', 'float']],
  ])('accepts %j', (types) => {
    expect(saturationDynamicInputError('Sat', types)).toBeNull()
  })

  test.each([
    [['double[3]', 'double[4]', 'double[3]'], 'same dimensions'],
    [['double[3]', 'double[3][1]', 'double'], 'same dimensions'],
    [['double[2][2]', 'double', 'double'], 'cannot be matrices'],
    [['double', 'bool', 'double'], 'boolean'],
  ])('rejects %j', (types, text) => {
    expect(saturationDynamicInputError('Sat', types)).toContain(text)
    expect(validateBlockOperation(block, types)?.severity).toBe('error')
  })

  const sheetWith = (upType: string, uType: string, loType: string) => {
    const src = (id: string, dataType: string, value: unknown) =>
      ({ id, type: 'source', name: id, position: { x: 0, y: 0 }, parameters: { signalType: 'constant', value, dataType } })
    const vec = (t: string) => (t.includes('[') ? Array(Number(t.match(/\[(\d+)\]/)![1])).fill(1) : 1)
    return {
      id: 'main',
      blocks: [
        src('Up', upType, vec(upType)), src('U', uType, vec(uType)), src('Lo', loType, vec(loType)),
        { id: 'sat', type: 'saturation_dynamic', name: 'Sat', position: { x: 0, y: 0 }, parameters: {} },
        { id: 'out', type: 'output_port', name: 'y', position: { x: 0, y: 0 }, parameters: { portName: 'y' } },
      ],
      connections: [
        { id: 'w0', sourceBlockId: 'Up', sourcePortIndex: 0, targetBlockId: 'sat', targetPortIndex: 0 },
        { id: 'w1', sourceBlockId: 'U', sourcePortIndex: 0, targetBlockId: 'sat', targetPortIndex: 1 },
        { id: 'w2', sourceBlockId: 'Lo', sourcePortIndex: 0, targetBlockId: 'sat', targetPortIndex: 2 },
        { id: 'w3', sourceBlockId: 'sat', sourcePortIndex: 0, targetBlockId: 'out', targetPortIndex: 0 },
      ],
    } as any
  }

  test('the canvas validation finds no error for matching vectors, and an error for a size mismatch', () => {
    const ok = validateModelTypeCompatibilityMultiSheet([sheetWith('double[3]', 'double[3]', 'double[3]')])
    expect(ok.errors.filter(e => e.blockId === 'sat')).toEqual([])
    const bad = validateModelTypeCompatibilityMultiSheet([sheetWith('double[3]', 'double[4]', 'double[3]')])
    expect(bad.errors.some(e => e.blockId === 'sat' && /same dimensions/.test(e.message))).toBe(true)
  })

  test('the model validation warns when a limit is not connected', () => {
    const sheet = sheetWith('double', 'double', 'double')
    sheet.connections = sheet.connections.filter((w: { id: string }) => w.id !== 'w2')
    const result = validateMultiSheetTypeCompatibility([sheet])
    expect(result.warnings.some(w => w.blockId === 'sat' && /2 of 3 required inputs/.test(w.message))).toBe(true)
  })

  test('the shipped FPV Vehicle (PIDSumLimit, double[3]) has no Saturation Dynamic error', () => {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const model = JSON.parse(fs.readFileSync(path.join(__dirname, '../reference-models/fpv-vehicle.json'), 'utf8'))
    const sheets = model.data.sheets
    const ids = new Set<string>()
    const visit = (sh: any) => {
      for (const b of sh.blocks || []) {
        if (b.type === 'saturation_dynamic') ids.add(b.id)
        for (const n of b.parameters?.sheets || []) visit(n)
      }
    }
    sheets.forEach(visit)
    expect(ids.has('pid__PIDSumLimit')).toBe(true)
    const canvas = validateModelTypeCompatibilityMultiSheet(sheets)
    expect(canvas.errors.filter(e => e.blockId && ids.has(e.blockId))).toEqual([])
    const beforeRun = validateMultiSheetTypeCompatibility(sheets)
    expect([...beforeRun.errors, ...beforeRun.warnings].filter(e => e.blockId && ids.has(e.blockId))).toEqual([])
  })

  test('the check before a simulation run also finds a size mismatch', () => {
    const bad = validateMultiSheetTypeCompatibility([sheetWith('double[3]', 'double[4]', 'double[3]')])
    expect(bad.errors.some(e => e.blockId === 'sat' && /same dimensions/.test(e.message))).toBe(true)
  })

  test('when lo > up the generated C gives lo (fmax is outermost)', () => {
    const code = mod.generateComputation(block, ['UP', 'U', 'LO'], ['double', 'double', 'double'])
    expect(code).toContain('= fmax(LO, fmin(UP, U));')
    // The same expression in JavaScript, as an independent check of the order
    const y = (up: number, u: number, lo: number) => Math.max(lo, Math.min(up, u))
    expect(y(1, 5, 2)).toBe(2)
    expect(y(1, -5, 2)).toBe(2)
    expect(y(3, 2, -3)).toBe(2)
  })
})

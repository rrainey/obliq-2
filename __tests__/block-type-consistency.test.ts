/**
 * Each block type must be known in the same places: the block module factory
 * (code generation, port counts), the block type registry (drag-and-drop and
 * the Model Builder API), the palette (BlockLibrarySidebar), the factory's
 * list of supported types and the MCP server's block list.
 *
 * The test reads the block types of the factory from the `case` labels of
 * BlockModuleFactory.createInstance, so that a new module is found even when
 * it is not in getSupportedBlockTypes().
 *
 * KNOWN_GAPS lists the gaps that exist now. A new gap makes the test fail. When
 * you close a gap, remove it from KNOWN_GAPS.
 */

import fs from 'fs'
import path from 'path'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'
import { blockTypeRegistry } from '@/lib/blockTypeRegistry'
import { blockTypes as paletteEntries } from '@/components/BlockLibrarySidebar'
import { blockTypeSchemas } from '../mcp-server/src/tools/block-types'
import { REGULAR_BLOCK_TYPES, validateModelDataWithErrors } from '@/lib/modelSchema'

/** Block types in the `case` labels of BlockModuleFactory.createInstance(). */
function factoryBlockTypes(): string[] {
  const src = fs.readFileSync(path.join(__dirname, '../src/lib/blocks/BlockModuleFactory.ts'), 'utf8')
  const body = src.slice(src.indexOf('createInstance('), src.indexOf('static isSupported('))
  return [...body.matchAll(/case '([a-z0-9_]+)':/g)].map(m => m[1])
}

const KNOWN_GAPS = {
  // inertia_diag_pack is kept in the background on purpose (owner decision):
  // it has a module, but no registry entry, palette entry or MCP entry.
  // Has a module, but no registry entry: createBlock() and the Model Builder
  // API reject it. Used only by imported models.
  factoryNotInRegistry: ['inertia_diag_pack'],
  // Has a module, but is not on the palette. The four other types are in the
  // registry and the MCP list; the owner has not decided on the palette.
  factoryNotInPalette: [
    'derivative',
    'for_iterator_subsystem',
    'inertia_diag_pack',
    'iteration_index',
    'variable_transport_delay',
  ],
  // Has a module, but the MCP server does not list it
  factoryNotInMcp: ['inertia_diag_pack'],
  // On the palette, but not in the registry. model_reference is a subsystem
  // that the drop handler makes from a 'subsystem' block, so this is correct.
  paletteNotInRegistry: ['model_reference'],
}

describe('block type consistency: factory, registry, palette, MCP', () => {
  const factory = factoryBlockTypes()
  const registry = Object.keys(blockTypeRegistry)
  const palette = paletteEntries.map(b => b.id)
  const mcp = blockTypeSchemas.map(b => b.type)
  const missing = (from: string[], inList: string[]) => from.filter(t => !inList.includes(t)).sort()

  test('the factory has the block types of the case labels', () => {
    expect(factory.length).toBeGreaterThan(40)
    for (const t of factory) expect(BlockModuleFactory.isSupported(t)).toBe(true)
  })

  test('getSupportedBlockTypes() lists each block type of the factory', () => {
    expect(missing(factory, BlockModuleFactory.getSupportedBlockTypes())).toEqual([])
  })

  test('each block type of the factory has a registry entry (known gaps only)', () => {
    expect(missing(factory, registry)).toEqual(KNOWN_GAPS.factoryNotInRegistry)
  })

  test('each block type of the factory is on the palette (known gaps only)', () => {
    expect(missing(factory, palette)).toEqual(KNOWN_GAPS.factoryNotInPalette)
  })

  test('each block type of the factory is in the MCP list (known gaps only)', () => {
    expect(missing(factory, mcp)).toEqual(KNOWN_GAPS.factoryNotInMcp)
  })

  test('each palette entry has a registry entry (known gaps only)', () => {
    expect(missing(palette, registry)).toEqual(KNOWN_GAPS.paletteNotInRegistry)
  })

  test('each registry entry has a module, except comment', () => {
    expect(missing(registry, factory)).toEqual(['comment'])
  })

  test('each MCP block type has a registry entry with the same category', () => {
    expect(missing(mcp, registry)).toEqual([])
    for (const info of blockTypeSchemas) {
      const def = blockTypeRegistry[info.type as keyof typeof blockTypeRegistry]
      expect({ type: info.type, category: info.category }).toEqual({ type: info.type, category: def.category })
    }
  })

  test('the Discontinuities blocks have the same category on the palette and in the registry', () => {
    const discontinuities = registry.filter(
      t => blockTypeRegistry[t as keyof typeof blockTypeRegistry].category === 'Discontinuities')
    expect(discontinuities.sort()).toEqual(['edge_detect', 'quantizer', 'rate_limiter', 'relay', 'saturation_dynamic'])
    for (const t of discontinuities) {
      expect({ t, category: paletteEntries.find(b => b.id === t)?.category }).toEqual({ t, category: 'Discontinuities' })
    }
  })

  test('the model schema accepts each registered block type', () => {
    const subsystemTypes = ['subsystem', 'for_iterator_subsystem']
    expect(missing(registry, [...REGULAR_BLOCK_TYPES, ...subsystemTypes])).toEqual([])
    expect([...REGULAR_BLOCK_TYPES].sort()).toEqual(registry.filter(t => !subsystemTypes.includes(t)).sort())
    // A model with one block of each regular type passes the schema
    const result = validateModelDataWithErrors({
      version: '1.0',
      metadata: { created: '2026-01-01T00:00:00.000Z', description: 'all types' },
      sheets: [{
        id: 'main', name: 'Main',
        blocks: REGULAR_BLOCK_TYPES.map((type, i) => ({ id: `b${i}`, type, name: `B${i}`, position: { x: 0, y: 0 }, parameters: {} })),
        connections: [],
        extents: { width: 800, height: 600 },
      }],
      globalSettings: { simulationTimeStep: 0.01, simulationDuration: 10 },
    })
    expect(result.errors).toEqual([])
  })

  test('the model schema rejects a type that is not registered (inertia_diag_pack)', () => {
    expect((REGULAR_BLOCK_TYPES as readonly string[]).includes('inertia_diag_pack')).toBe(false)
  })
})

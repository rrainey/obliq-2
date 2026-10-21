/**
 * Model references in the editor: reference blocks follow their model's
 * ports (wires re-indexed by name), wires to removed ports are dropped only
 * on request, and type validation sees through a loaded model reference.
 */
import { useModelStore } from '@/lib/modelStore'
import { publishReferencedModels, type ReferencedModelEntry } from '@/lib/referencedModels'
import { validateModelTypeCompatibilityMultiSheet } from '@/lib/typeCompatibilityValidator'
import { harnessModel, plantModel } from './support/modelRefFixtures'

const st = () => useModelStore.getState()

function load(entries: Record<string, ReferencedModelEntry>, harness = harnessModel()) {
  const sheets = harness.sheets as any
  useModelStore.setState({
    sheets,
    activeSheetId: 'main',
    blocks: sheets[0].blocks,
    wires: sheets[0].connections,
    referencedModels: entries,
  })
  publishReferencedModels(entries)
}

const plantEntry = (data = plantModel()): Record<string, ReferencedModelEntry> => ({
  'plant@latest': { key: 'plant@latest', modelId: 'plant', version: null, status: 'ok', name: 'Plant', data, hash: 'h1', latestVersion: 1 },
})

const block = (id: string) => st().sheets[0]!.blocks.find(b => b.id === id)!
const wire = (id: string) => st().sheets[0]!.connections.find(c => c.id === id)!

describe('model references in the editor', () => {
  test('a new reference takes its model’s ports and name', () => {
    load(plantEntry())
    st().applyReferencedInterfaces()
    expect(block('P1').parameters).toMatchObject({ inputPorts: ['u'], outputPorts: ['y', 'sq', 'sq2', 'y2'], modelRefName: 'Plant' })
    expect(st().blocks.find(b => b.id === 'P1')!.parameters?.outputPorts).toHaveLength(4) // active sheet copy too
  })

  test('a reordered interface re-indexes the wires by name', () => {
    const h = harnessModel()
    Object.assign(h.sheets[0]!.blocks.find((x: any) => x.id === 'P1')!.parameters, {
      inputPorts: ['u'],
      outputPorts: ['y2', 'y', 'sq', 'sq2'],
    })
    load(plantEntry(), h)
    st().applyReferencedInterfaces()
    expect(block('P1').parameters?.outputPorts).toEqual(['y', 'sq', 'sq2', 'y2'])
    expect(wire('h3').sourcePortIndex).toBe(3) // was y2
    expect(wire('h4').sourcePortIndex).toBe(2) // was sq2
  })

  test('wires to a removed port keep the block unchanged, unless dropping them is asked for', () => {
    const h = harnessModel()
    Object.assign(h.sheets[0]!.blocks.find((x: any) => x.id === 'P1')!.parameters, {
      inputPorts: ['u'],
      outputPorts: ['y', 'sq', 'sq2', 'old'],
    })
    load(plantEntry(), h)
    expect(st().applyReferencedInterfaces().removedWires).toBe(0)
    expect(block('P1').parameters?.outputPorts).toEqual(['y', 'sq', 'sq2', 'old'])

    expect(st().applyReferencedInterfaces('P1').removedWires).toBe(1) // h4 used "old"
    expect(block('P1').parameters?.outputPorts).toEqual(['y', 'sq', 'sq2', 'y2'])
    expect(st().sheets[0]!.connections.some(c => c.id === 'h4')).toBe(false)
  })

  test('type validation types a loaded model reference’s outputs', () => {
    const untyped = (sheets: any[]) =>
      JSON.stringify(validateModelTypeCompatibilityMultiSheet(sheets)).match(/Unable to determine/g)?.length ?? 0

    load(plantEntry())
    st().applyReferencedInterfaces()
    expect(untyped(st().sheets)).toBe(0)

    // Not loaded: the reference's outputs cannot be typed
    load({})
    expect(untyped(st().sheets)).toBeGreaterThan(0)
  })
})

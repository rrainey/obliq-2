/**
 * Subsystem reference helpers — resolve, sync schema, delete guards.
 */

import { BlockData } from '@/components/BlockNode'
import {
  createReferenceParametersFromDefinition,
  definitionHasReferences,
  getSubsystemDeleteBlockReason,
  isSubsystemDefinition,
  isSubsystemReference,
  resolveSubsystemDefinition,
  resolveSubsystemSheets,
  syncAllReferencesToDefinition,
  syncReferenceParameterSchema,
  upgradeToAtomicSegregated
} from '@/lib/subsystemReference'
import { validateModelData } from '@/lib/modelSchema'

function defBlock(
  id: string,
  name: string,
  params: Record<string, unknown> = {}
): BlockData {
  return {
    id,
    type: 'subsystem',
    name,
    position: { x: 0, y: 0 },
    parameters: {
      inputPorts: ['u'],
      outputPorts: ['y'],
      sheets: [
        {
          id: 'main',
          name: 'Main',
          blocks: [],
          connections: [],
          extents: { width: 400, height: 300 }
        }
      ],
      codeGenStrategy: 'segregated_atomic',
      parameters: [
        {
          name: 'gain',
          dataType: 'double',
          signalType: 'double',
          value: 1,
          defaultValue: '1'
        }
      ],
      ...params
    }
  }
}

describe('subsystemReference helpers', () => {
  test('isSubsystemReference / isSubsystemDefinition', () => {
    const def = defBlock('d1', 'Blade')
    const ref: BlockData = {
      id: 'r1',
      type: 'subsystem',
      name: 'Blade_2',
      position: { x: 10, y: 10 },
      parameters: createReferenceParametersFromDefinition(def)
    }
    expect(isSubsystemDefinition(def)).toBe(true)
    expect(isSubsystemReference(def)).toBe(false)
    expect(isSubsystemReference(ref)).toBe(true)
    expect(isSubsystemDefinition(ref)).toBe(false)
  })

  test('resolveSubsystemDefinition and sheets', () => {
    const def = defBlock('d1', 'Blade')
    const ref: BlockData = {
      id: 'r1',
      type: 'subsystem',
      name: 'Blade_2',
      position: { x: 0, y: 0 },
      parameters: createReferenceParametersFromDefinition(def)
    }
    const all = [def, ref]
    expect(resolveSubsystemDefinition(ref, all)?.id).toBe('d1')
    expect(resolveSubsystemSheets(ref, all)).toHaveLength(1)
    expect(resolveSubsystemSheets(ref, all)[0]!.id).toBe('main')
    // Dangling
    expect(resolveSubsystemDefinition(ref, [ref])).toBeUndefined()
  })

  test('syncReferenceParameterSchema keeps values, adds defaults, drops removed', () => {
    const def = defBlock('d1', 'Blade', {
      parameters: [
        {
          name: 'gain',
          dataType: 'double',
          signalType: 'double',
          value: 1,
          defaultValue: '1'
        },
        {
          name: 'bias',
          dataType: 'double',
          signalType: 'double',
          value: 0,
          defaultValue: '0'
        }
      ]
    })
    const ref: BlockData = {
      id: 'r1',
      type: 'subsystem',
      name: 'Blade_2',
      position: { x: 0, y: 0 },
      parameters: {
        isReference: true,
        referencedSubsystemId: 'd1',
        sheets: [],
        inputPorts: ['u'],
        outputPorts: ['y'],
        parameters: [
          {
            name: 'gain',
            dataType: 'double',
            signalType: 'double',
            value: 7.5,
            defaultValue: '7.5'
          },
          {
            name: 'obsolete',
            dataType: 'double',
            signalType: 'double',
            value: 99,
            defaultValue: '99'
          }
        ]
      }
    }
    const synced = syncReferenceParameterSchema(def, ref)
    expect(synced.map(p => p.name)).toEqual(['gain', 'bias'])
    expect(synced.find(p => p.name === 'gain')!.value).toBe(7.5)
    expect(synced.find(p => p.name === 'bias')!.value).toBe(0)
  })

  test('syncAllReferencesToDefinition updates all refs', () => {
    const def = defBlock('d1', 'Blade', {
      parameters: [
        {
          name: 'k',
          dataType: 'double',
          signalType: 'double',
          value: 2,
          defaultValue: '2'
        }
      ],
      inputPorts: ['a', 'b'],
      outputPorts: ['y']
    })
    const ref: BlockData = {
      id: 'r1',
      type: 'subsystem',
      name: 'Blade_2',
      position: { x: 0, y: 0 },
      parameters: createReferenceParametersFromDefinition(defBlock('d1', 'Blade'))
    }
    // ref still has old schema (gain only) until sync
    const updated = syncAllReferencesToDefinition('d1', [def, ref])
    const r = updated.find(b => b.id === 'r1')!
    expect(r.parameters?.inputPorts).toEqual(['a', 'b'])
    expect((r.parameters?.parameters as any[]).map((p: any) => p.name)).toEqual([
      'k'
    ])
  })

  test('definitionHasReferences and delete guard message', () => {
    const def = defBlock('d1', 'Blade')
    const ref: BlockData = {
      id: 'r1',
      type: 'subsystem',
      name: 'Blade_2',
      position: { x: 0, y: 0 },
      parameters: createReferenceParametersFromDefinition(def)
    }
    expect(definitionHasReferences('d1', [def, ref])).toBe(true)
    expect(getSubsystemDeleteBlockReason('d1', [def, ref])).toMatch(
      /Cannot delete subsystem "Blade"/
    )
    expect(getSubsystemDeleteBlockReason('d1', [def])).toBeUndefined()
    expect(getSubsystemDeleteBlockReason('r1', [def, ref])).toBeUndefined()
  })

  test('upgradeToAtomicSegregated', () => {
    const flat = defBlock('d1', 'Blade', { codeGenStrategy: 'flatten' })
    expect(upgradeToAtomicSegregated(flat).parameters?.codeGenStrategy).toBe(
      'segregated_atomic'
    )
  })

  test('model schema accepts reference without sheets', () => {
    const def = defBlock('d1', 'Blade')
    const refParams = createReferenceParametersFromDefinition(def)
    const data = {
      name: 't',
      description: '',
      version: '2.2',
      metadata: { created: new Date().toISOString() },
      sheets: [
        {
          id: 's',
          name: 'Main',
          extents: { width: 800, height: 600 },
          blocks: [
            def,
            {
              id: 'r1',
              type: 'subsystem',
              name: 'Blade_2',
              position: { x: 100, y: 0 },
              parameters: refParams
            }
          ],
          connections: []
        }
      ],
      globalSettings: {
        simulationTimeStep: 0.01,
        simulationDuration: 1,
        integrationAlgorithm: 'rk4'
      },
      parameters: [],
      dataStores: []
    }
    expect(() => validateModelData(data)).not.toThrow()
  })

  test('model schema rejects reference that still embeds sheets', () => {
    const data = {
      name: 't',
      description: '',
      version: '2.2',
      metadata: { created: new Date().toISOString() },
      sheets: [
        {
          id: 's',
          name: 'Main',
          extents: { width: 800, height: 600 },
          blocks: [
            {
              id: 'r1',
              type: 'subsystem',
              name: 'Bad',
              position: { x: 0, y: 0 },
              parameters: {
                isReference: true,
                referencedSubsystemId: 'd1',
                inputPorts: ['u'],
                outputPorts: ['y'],
                sheets: [
                  {
                    id: 'x',
                    name: 'X',
                    blocks: [],
                    connections: [],
                    extents: { width: 1, height: 1 }
                  }
                ],
                parameters: []
              }
            }
          ],
          connections: []
        }
      ],
      globalSettings: {
        simulationTimeStep: 0.01,
        simulationDuration: 1,
        integrationAlgorithm: 'rk4'
      },
      parameters: []
    }
    expect(() => validateModelData(data)).toThrow(/must not embed sheets/)
  })
})

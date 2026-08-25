/**
 * Deep paste remapping: nested subsystem ids + Foo_2 name uniquify.
 */

import { BlockData } from '../src/components/BlockNode'
import { WireData } from '../src/components/Wire'
import {
  collectIdsFromSheets,
  uniquifyName,
  remapClipboardSelection,
} from '../src/lib/clipboardRemap'
import type { Sheet } from '../src/lib/modelStore'

function blk(
  id: string,
  type: string,
  name: string,
  extra: Partial<BlockData> = {}
): BlockData {
  return {
    id,
    type,
    name,
    position: { x: 0, y: 0 },
    parameters: {},
    ...extra,
  }
}

describe('clipboardRemap', () => {
  test('uniquifyName keeps original then suffixes _2, _3', () => {
    const used = new Set<string>()
    expect(uniquifyName('Foo', used)).toBe('Foo')
    expect(uniquifyName('Foo', used)).toBe('Foo_2')
    expect(uniquifyName('Foo', used)).toBe('Foo_3')
  })

  test('collectIdsFromSheets walks nested subsystem sheets', () => {
    const sheets: Sheet[] = [
      {
        id: 'main',
        name: 'Main',
        extents: { width: 1, height: 1 },
        connections: [{ id: 'w-root', sourceBlockId: 'a', sourcePortIndex: 0, targetBlockId: 'b', targetPortIndex: 0 }],
        blocks: [
          blk('a', 'source', 'A'),
          {
            ...blk('sub', 'subsystem', 'Sub'),
            parameters: {
              sheets: [
                {
                  id: 'inner-sheet',
                  name: 'Inner',
                  extents: { width: 1, height: 1 },
                  blocks: [blk('subsystem_1429', 'sum', 'Add')],
                  connections: [
                    {
                      id: 'w-inner',
                      sourceBlockId: 'subsystem_1429',
                      sourcePortIndex: 0,
                      targetBlockId: 'subsystem_1429',
                      targetPortIndex: 0,
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ]
    const ids = collectIdsFromSheets(sheets)
    expect(ids.has('main')).toBe(true)
    expect(ids.has('sub')).toBe(true)
    expect(ids.has('subsystem_1429')).toBe(true)
    expect(ids.has('inner-sheet')).toBe(true)
    expect(ids.has('w-inner')).toBe(true)
  })

  test('remapClipboardSelection remaps nested subsystem ids away from collisions', () => {
    const nestedId = 'subsystem_1429'
    const clipboardBlocks: BlockData[] = [
      {
        ...blk('sub-root', 'subsystem', 'Plant'),
        position: { x: 10, y: 20 },
        parameters: {
          sheets: [
            {
              id: 'sheet-nested',
              name: 'Nested',
              extents: { width: 100, height: 100 },
              blocks: [blk(nestedId, 'sum', 'Add2')],
              connections: [],
            },
          ],
        },
      },
    ]
    const wires: WireData[] = []

    // Target already contains the same nested id (prior paste / import)
    const existingIds = new Set([nestedId, 'sheet-nested', 'sub-root', 'other'])
    const existingNames = new Set(['Plant'])

    const once = remapClipboardSelection({
      blocks: clipboardBlocks,
      wires,
      existingIds,
      existingNames,
      positionOffset: { x: 5, y: 5 },
    })

    expect(once.blocks).toHaveLength(1)
    expect(once.blocks[0].id).not.toBe('sub-root')
    expect(once.blocks[0].name).toBe('Plant_2')
    expect(once.blocks[0].position).toEqual({ x: 15, y: 25 })

    const innerSheets = once.blocks[0].parameters?.sheets as Sheet[]
    expect(innerSheets).toHaveLength(1)
    expect(innerSheets[0].id).not.toBe('sheet-nested')
    expect(innerSheets[0].blocks[0].id).not.toBe(nestedId)
    // New id must not collide with ids that were already in the target
    expect(existingIds.has(innerSheets[0].blocks[0].id)).toBe(false)

    // Paste again into a model that now includes the first paste's ids
    const idsAfterFirst = new Set(existingIds)
    const collect = (blocks: BlockData[]) => {
      for (const b of blocks) {
        idsAfterFirst.add(b.id)
        for (const sh of (b.parameters?.sheets as Sheet[]) || []) {
          idsAfterFirst.add(sh.id)
          for (const ib of sh.blocks || []) idsAfterFirst.add(ib.id)
        }
      }
    }
    collect(once.blocks)

    const twice = remapClipboardSelection({
      blocks: clipboardBlocks,
      wires,
      existingIds: idsAfterFirst,
      existingNames: new Set(['Plant', 'Plant_2']),
      positionOffset: { x: 0, y: 0 },
    })
    const inner2 = (twice.blocks[0].parameters?.sheets as Sheet[])[0]
    expect(inner2.blocks[0].id).not.toBe(nestedId)
    expect(inner2.blocks[0].id).not.toBe(innerSheets[0].blocks[0].id)
    expect(twice.blocks[0].name).toBe('Plant_3')
  })

  test('remapClipboardSelection remaps top-level wires to new block ids', () => {
    const result = remapClipboardSelection({
      blocks: [
        blk('a', 'source', 'Src', { position: { x: 0, y: 0 } }),
        blk('b', 'sum', 'Sum', { position: { x: 10, y: 0 } }),
      ],
      wires: [
        {
          id: 'w1',
          sourceBlockId: 'a',
          sourcePortIndex: 0,
          targetBlockId: 'b',
          targetPortIndex: 0,
        },
      ],
      existingIds: new Set(),
      existingNames: new Set(),
      positionOffset: { x: 0, y: 0 },
    })
    expect(result.wires).toHaveLength(1)
    expect(result.wires[0].id).not.toBe('w1')
    expect(result.blocks.map(b => b.id)).toEqual(
      expect.arrayContaining([
        result.wires[0].sourceBlockId,
        result.wires[0].targetBlockId,
      ])
    )
    expect(result.blockIdMap.get('a')).toBe(result.wires[0].sourceBlockId)
    expect(result.blockIdMap.get('b')).toBe(result.wires[0].targetBlockId)
  })
})

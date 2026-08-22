/**
 * Mask/workspace resolution inside Constant vectors (H-1 mpr_deg).
 */

import * as fs from 'fs'
import * as path from 'path'
import { parseMdl, walkBlocks } from '../src/lib/mdl2obliq'
import { mapBlock, parseMaskParams } from '../src/lib/mdl2obliq/mapper'

describe('mdl2obliq Constant mask vectors', () => {
  const mdlPath = path.join(__dirname, '../saturn-1B/saturn_ib_stack.mdl')
  const model = parseMdl(fs.readFileSync(mdlPath, 'latin1'), mdlPath)

  function findEngine(n: number) {
    let eng: any = null
    walkBlocks(model.root, (b, path) => {
      if (
        b.name === `Engine ${n}` &&
        path.some(p => p.includes('S-IB')) &&
        path.some(p => p.includes('H-1'))
      ) {
        eng = b
      }
    })
    return eng
  }

  test('Engine Mount Point Rotation resolves mpr_deg inside [mpr_deg 0 0]', () => {
    const expected = [0, -90, -180, -270]
    for (let n = 1; n <= 4; n++) {
      const eng = findEngine(n)
      expect(eng).toBeTruthy()
      const mask = parseMaskParams(eng)
      const mount = eng.system.blocks.find((b: any) =>
        String(b.name).includes('Mount Point')
      )
      expect(mount.params.Value).toMatch(/mpr_deg/)
      const mapped = mapBlock(mount, { maskEnv: mask })
      expect(mapped.parameters?.value).toEqual([expected[n - 1], 0, 0])
    }
  })

  test('Installation location resolves r_m vector mask', () => {
    const eng = findEngine(1)
    const mask = parseMaskParams(eng)
    const loc = eng.system.blocks.find((b: any) =>
      String(b.name).includes('Installation location')
    )
    expect(loc.params.Value.trim()).toBe('r_m')
    const mapped = mapBlock(loc, { maskEnv: mask })
    expect(mapped.parameters?.value).toEqual([0, -1.704, 1.704])
  })
})

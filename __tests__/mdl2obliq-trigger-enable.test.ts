/**
 * Triggered/Enabled subsystem control ports use DstPort "trigger"|"enable".
 * Those must not collide with data Inport 1 (MULTIPLE_INPUT_CONNECTIONS).
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  emitObliqFromSystem,
  parseMdl,
  walkBlocks
} from '../src/lib/mdl2obliq'

const MDL = path.join(__dirname, '../saturn-1B/saturn_ib_stack.mdl')

describe('mdl2obliq trigger/enable DstPort', () => {
  const model = parseMdl(fs.readFileSync(MDL, 'latin1'), MDL)

  test('parse keeps DstPort trigger as dstSpecial (not port 1)', () => {
    let tt: any = null
    walkBlocks(model.root, (b, path) => {
      if (
        b.name === 'Triggered Timer' &&
        path.some(p => p.includes('Engine 1'))
      ) {
        tt = b
      }
    })
    expect(tt?.system).toBeDefined()
    const trig = tt.system.lines.find(
      (L: any) =>
        L.dstBlock === 'Timer Initialization' && L.dstSpecial === 'trigger'
    )
    const data = tt.system.lines.find(
      (L: any) =>
        L.dstBlock === 'Timer Initialization' && !L.dstSpecial && L.dstPort === 1
    )
    expect(trig).toBeTruthy()
    expect(trig.srcBlock).toBe('bStart')
    expect(data).toBeTruthy()
    expect(data.srcBlock).toBe('Clock')
  })

  test('emit routes trigger to enable pin (−1), Clock stays on data port 0', () => {
    let eng: any = null
    walkBlocks(model.root, (b, path) => {
      if (b.name === 'Engine 1' && path.some(p => p.includes('H-1'))) eng = b
    })
    expect(eng?.system).toBeDefined()
    const result = emitObliqFromSystem(eng.system, {
      strict: true,
      modelName: 'engine1_ti_test',
      // Engine-1 alone has unrelated type gaps; this test is about trigger wiring
      validate: false,
      expandMuxVectors: false
    })
    expect(result.errors).toEqual([])

    // Find Timer_Initialization subsystem + its inbound wires
    const sheet = result.model.sheets[0]!
    const findSub = (blocks: any[]): any => {
      for (const b of blocks) {
        if (b.type === 'subsystem' && /Timer_Initialization/i.test(b.name)) {
          return b
        }
        if (b.type === 'subsystem') {
          for (const sh of b.parameters?.sheets || []) {
            const hit = findSub(sh.blocks || [])
            if (hit) return hit
          }
        }
      }
      return null
    }
    // Search all nested sheets' connections by collecting flat
    const allBlocks = new Map<string, any>()
    const allConns: any[] = []
    const walk = (sh: any) => {
      for (const b of sh.blocks || []) {
        allBlocks.set(b.id, b)
        if (b.type === 'subsystem') {
          for (const nested of b.parameters?.sheets || []) walk(nested)
        }
      }
      allConns.push(...(sh.connections || []))
    }
    walk(sheet)

    const tis = [...allBlocks.values()].filter(
      b => b.type === 'subsystem' && b.name === 'Timer_Initialization'
    )
    expect(tis.length).toBeGreaterThanOrEqual(1)
    const ti = tis[0]
    const inbound = allConns.filter(c => c.targetBlockId === ti.id)
    const enableWires = inbound.filter(c => c.targetPortIndex === -1)
    const dataWires = inbound.filter(c => c.targetPortIndex === 0)
    expect(enableWires.length).toBe(1)
    expect(dataWires.length).toBe(1)
    // No duplicate on the same data port
    expect(inbound.filter(c => c.targetPortIndex === 0).length).toBe(1)
  })
})

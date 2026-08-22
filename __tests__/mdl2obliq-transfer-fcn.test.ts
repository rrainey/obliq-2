/**
 * TransferFcn must carry Numerator/Denominator into Obliq transfer_function
 * parameters (not empty {} via the MAPPED default branch).
 */

import * as fs from 'fs'
import * as path from 'path'
import { parseMdl, walkBlocks } from '../src/lib/mdl2obliq'
import { mapBlock } from '../src/lib/mdl2obliq/mapper'

const MDL = path.join(__dirname, '../saturn-1B/saturn_ib_stack.mdl')

describe('mdl2obliq TransferFcn mapping', () => {
  const model = parseMdl(fs.readFileSync(MDL, 'latin1'), MDL)

  function findNamedTransferFcn(name: string) {
    let found: any = null
    walkBlocks(model.root, b => {
      if (b.blockType === 'TransferFcn' && b.name === name && !found) {
        found = b
      }
    })
    return found
  }

  test('A Actuator Denominator survives mapBlock; Numerator defaults to [1]', () => {
    const block = findNamedTransferFcn('A Actuator')
    expect(block).toBeTruthy()
    expect(block.params.Denominator).toMatch(/0\.00001942/)
    expect(block.params.Numerator).toBeUndefined()

    const mapped = mapBlock(block)
    expect(mapped.type).toBe('transfer_function')
    expect(mapped.parameters?.numerator).toEqual([1])
    expect(mapped.parameters?.denominator).toEqual([
      0.00001942, 0.0007963, 0.05576, 1
    ])
  })

  test('B Actuator maps same 3rd-order den as A Actuator', () => {
    const block = findNamedTransferFcn('B Actuator')
    expect(block).toBeTruthy()
    const mapped = mapBlock(block)
    expect(mapped.type).toBe('transfer_function')
    expect(mapped.parameters?.denominator).toHaveLength(4)
    expect(mapped.parameters?.denominator?.[0]).toBeCloseTo(0.00001942, 10)
    expect(mapped.parameters?.numerator).toEqual([1])
  })

  test('explicit Numerator is preserved when present', () => {
    let withNum: any = null
    walkBlocks(model.root, b => {
      if (
        b.blockType === 'TransferFcn' &&
        b.params.Numerator &&
        b.params.Denominator &&
        !withNum
      ) {
        withNum = b
      }
    })
    expect(withNum).toBeTruthy()
    const mapped = mapBlock(withNum)
    expect(mapped.type).toBe('transfer_function')
    expect(mapped.parameters?.numerator?.length).toBeGreaterThanOrEqual(1)
    expect(mapped.parameters?.denominator?.length).toBeGreaterThanOrEqual(2)
    // Must not be the empty-params default that produced 1/(s+1) fallback
    expect(mapped.parameters).not.toEqual({})
    expect(JSON.stringify(mapped.parameters)).not.toBe('{}')
  })

  test('does not use MAPPED default empty parameters for TransferFcn', () => {
    const block = findNamedTransferFcn('A Actuator')
    const mapped = mapBlock(block)
    const keys = Object.keys(mapped.parameters || {})
    expect(keys).toEqual(expect.arrayContaining(['numerator', 'denominator']))
  })
})

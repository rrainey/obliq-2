import { mapBlock } from '../src/lib/mdl2obliq/mapper'
import type { MdlBlock } from '../src/lib/mdl2obliq/types'
import { C99ExpressionParser } from '../src/lib/c99ExpressionParser'
import { C99ExpressionValidator } from '../src/lib/c99ExpressionValidator'

describe('T_to_GMST Gain / fmod', () => {
  test('Gain "1 / 240.0" evaluates to 1/240', () => {
    const block = {
      blockType: 'Gain',
      name: 'seconds to\ndegrees',
      params: { Gain: '1 / 240.0' }
    } as unknown as MdlBlock
    const d = mapBlock(block)
    expect(d.type).toBe('scale')
    expect(d.parameters?.gain).toBeCloseTo(1 / 240, 12)
  })

  test('fmod(in(0),in(1)) validates', () => {
    const ast = new C99ExpressionParser('fmod(in(0),in(1))').parse()
    const v = new C99ExpressionValidator(2).validate(ast)
    expect(v.valid).toBe(true)
    expect(v.errors).toEqual([])
  })

  test('Math Operator mod maps to positive-remainder floor expression', () => {
    const block = {
      blockType: 'Math',
      name: 'Math\nFunction',
      params: { Operator: 'mod' }
    } as unknown as MdlBlock
    const d = mapBlock(block)
    expect(d.type).toBe('evaluate')
    expect(String(d.parameters?.expression)).toContain('floor')
    expect(String(d.parameters?.expression)).not.toContain('fmod')
  })
})

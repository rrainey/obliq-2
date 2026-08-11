// __tests__/data-store-blocks.test.ts

import { DataStoreWriteBlockModule } from '@/lib/blocks/DataStoreWriteBlockModule'
import { DataStoreReadBlockModule } from '@/lib/blocks/DataStoreReadBlockModule'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'
import { BlockData } from '@/components/BlockNode'
import { collectDataStores, refineDataStoreTypes, isValidStoreName } from '@/lib/dataStoreUtils'
import { ModelFlattener } from '@/lib/codegen/ModelFlattener'
import { HeaderGenerator } from '@/lib/codegen/HeaderGenerator'
import { TypePropagator } from '@/lib/codegen/TypePropagator'
import { validateBlockParameters } from '@/lib/blockParameterValidator'
import { BlockTypes } from '@/lib/blockTypeRegistry'
import { CodeGenerator } from '@/lib/codegen/CodeGenerator'

describe('Data Store Blocks (P5)', () => {
  const writeMod = new DataStoreWriteBlockModule()
  const readMod = new DataStoreReadBlockModule()

  const writeBlock = (name = 'nIGMMode'): BlockData => ({
    id: 'w1',
    name: 'WriteMode',
    type: 'data_store_write',
    position: { x: 0, y: 0 },
    parameters: { storeName: name, dataType: 'double', initialValue: '0' }
  })

  const readBlock = (name = 'nIGMMode'): BlockData => ({
    id: 'r1',
    name: 'ReadMode',
    type: 'data_store_read',
    position: { x: 0, y: 0 },
    parameters: { storeName: name, dataType: 'double' }
  })

  test('registered in factory', () => {
    expect(BlockModuleFactory.isSupported('data_store_write')).toBe(true)
    expect(BlockModuleFactory.isSupported('data_store_read')).toBe(true)
  })

  test('write is sink, read is source', () => {
    expect(writeMod.getOutputPortCount(writeBlock())).toBe(0)
    expect(writeMod.getInputPortCount(writeBlock())).toBe(1)
    expect(readMod.getInputPortCount(readBlock())).toBe(0)
    expect(readMod.getOutputPortCount(readBlock())).toBe(1)
  })

  test('write codegen assigns data_stores', () => {
    const code = writeMod.generateComputation(
      writeBlock(),
      ['model->signals.Src'],
      ['double']
    )
    expect(code).toContain('model->data_stores.nIGMMode = model->signals.Src')
  })

  test('read codegen loads data_stores', () => {
    const code = readMod.generateComputation(readBlock(), [], [])
    expect(code).toContain('model->signals.ReadMode = model->data_stores.nIGMMode')
  })

  test('collectDataStores from blocks (P5-1)', () => {
    const stores = collectDataStores(
      [{ block: writeBlock('tau_1_sec') }, { block: readBlock('tau_1_sec') }],
      []
    )
    expect(stores.some(s => s.name === 'tau_1_sec')).toBe(true)
  })

  test('isValidStoreName (P5-6)', () => {
    expect(isValidStoreName('nIGMMode')).toBe(true)
    expect(isValidStoreName('1bad')).toBe(false)
    expect(isValidStoreName('has space')).toBe(false)
  })

  test('invalid storeName rejected in validation', () => {
    const result = validateBlockParameters(BlockTypes.DATA_STORE_WRITE, {
      storeName: 'bad-name'
    })
    expect(result.valid).toBe(false)
  })

  test('flatten + header emit data_stores struct (P5-1)', () => {
    const sheets = [{
      id: 'main',
      name: 'Main',
      extents: { width: 800, height: 600 },
      blocks: [
        {
          id: 'src',
          name: 'Src',
          type: 'source',
          position: { x: 0, y: 0 },
          parameters: { value: '42', dataType: 'double' }
        },
        writeBlock('nIGMMode'),
        readBlock('nIGMMode'),
        {
          id: 'out',
          name: 'Out',
          type: 'output_port',
          position: { x: 0, y: 0 },
          parameters: { portName: 'out' }
        }
      ],
      connections: [
        { id: 'c1', sourceBlockId: 'src', sourcePortIndex: 0, targetBlockId: 'w1', targetPortIndex: 0 },
        { id: 'c2', sourceBlockId: 'r1', sourcePortIndex: 0, targetBlockId: 'out', targetPortIndex: 0 }
      ]
    }]

    const flattener = new ModelFlattener()
    const { model } = flattener.flattenModel(sheets as any, 'test_model', [])
    expect(model.dataStores?.some(s => s.name === 'nIGMMode')).toBe(true)

    const typeMap = new TypePropagator(model).propagate()
    const header = new HeaderGenerator(model, typeMap).generate()
    expect(header).toContain('data_stores')
    expect(header).toContain('nIGMMode')
    expect(header).toContain('_data_stores_t')
  })

  test('full codegen includes write and read (P5)', () => {
    const sheets = [{
      id: 'main',
      name: 'Main',
      extents: { width: 800, height: 600 },
      blocks: [
        {
          id: 'src',
          name: 'Src',
          type: 'source',
          position: { x: 0, y: 0 },
          parameters: { value: '7', dataType: 'double' }
        },
        writeBlock('shared'),
        readBlock('shared'),
        {
          id: 'out',
          name: 'Out',
          type: 'output_port',
          position: { x: 0, y: 0 },
          parameters: { portName: 'y' }
        }
      ],
      connections: [
        { id: 'c1', sourceBlockId: 'src', sourcePortIndex: 0, targetBlockId: 'w1', targetPortIndex: 0 },
        { id: 'c2', sourceBlockId: 'r1', sourcePortIndex: 0, targetBlockId: 'out', targetPortIndex: 0 }
      ]
    }]

    const gen = new CodeGenerator({ modelName: 'ds_test' })
    const result = gen.generate(sheets as any, [])
    expect(result.header).toContain('data_stores')
    expect(result.source).toContain('data_stores.shared')
    expect(result.source).toMatch(/data_stores\.shared\s*=/)
  })
})

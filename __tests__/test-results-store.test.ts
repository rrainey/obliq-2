// Assert results in the model store: they go stale when the model's behaviour
// changes, but not when blocks are only moved or sheets are switched.

import { useModelStore } from '@/lib/modelStore'
import type { BlockData } from '@/components/BlockNode'
import type { TestRunResults } from '@/lib/simulation/assertResults'

const st = () => useModelStore.getState()

const results: TestRunResults = {
  results: [{
    blockId: 'a', name: 'A', qualifiedName: 'A', status: 'passed', checks: 10, failures: 0,
    firstFailTime: null, firstFailValue: null, firstFailIndex: null, worstViolation: 0, stopsOnFailure: false,
  }],
  stoppedBy: null,
  stepsRun: 10,
}

function setup() {
  const inner: BlockData = { id: 'k', type: 'scale', name: 'K', position: { x: 0, y: 0 }, parameters: { gain: 2 } }
  const sub: BlockData = {
    id: 'sub', type: 'subsystem', name: 'Sub', position: { x: 0, y: 0 },
    parameters: { inputPorts: [], outputPorts: [], sheets: [{ id: 'subsheet', name: 'Sub', blocks: [inner], connections: [], extents: { width: 400, height: 300 } }] },
  }
  const assert: BlockData = { id: 'a', type: 'assert', name: 'A', position: { x: 10, y: 10 }, parameters: { lower: -1, upper: 1 } }
  const blocks = [assert, sub]
  useModelStore.setState({
    sheets: [{ id: 'main', name: 'Main', blocks, connections: [], extents: { width: 1000, height: 800 } }],
    activeSheetId: 'main',
    blocks,
    wires: [],
    testResults: null,
  })
  st().setTestResults(results)
}

describe('test results staleness', () => {
  test('fresh results are not stale', () => {
    setup()
    st().checkTestResultsStale()
    expect(st().testResults).toMatchObject({ stale: false, stepsRun: 10 })
  })

  test('moving a block keeps them fresh', () => {
    setup()
    st().updateBlock('a', { position: { x: 200, y: 300 } })
    st().checkTestResultsStale()
    expect(st().testResults!.stale).toBe(false)
  })

  test('switching sheets keeps them fresh', () => {
    setup()
    st().switchToSheet('subsheet')
    st().checkTestResultsStale()
    expect(st().testResults!.stale).toBe(false)
    st().switchToSheet('main')
    st().checkTestResultsStale()
    expect(st().testResults!.stale).toBe(false)
  })

  test('changing a parameter makes them stale, also on another sheet', () => {
    setup()
    st().updateBlock('a', { parameters: { lower: -2, upper: 1 } })
    st().checkTestResultsStale()
    expect(st().testResults!.stale).toBe(true)

    setup()
    st().switchToSheet('subsheet')
    st().updateBlock('k', { parameters: { gain: 3 } })
    st().checkTestResultsStale()
    expect(st().testResults!.stale).toBe(true)
  })

  test('changing simulation settings makes them stale; clearing removes them', () => {
    setup()
    useModelStore.setState({ globalSettings: { ...st().globalSettings, simulationDuration: 99 } })
    st().checkTestResultsStale()
    expect(st().testResults!.stale).toBe(true)
    st().setTestResults(null)
    expect(st().testResults).toBeNull()
  })
})

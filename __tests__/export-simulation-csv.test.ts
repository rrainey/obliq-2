/**
 * CSV export from stored SimulationResults (post-run path)
 */

import {
  exportSimulationResultsAsCSV,
  exportGlobalSimulationResultsAsCSV
} from '@/lib/simulation/exportSimulationCsv'
import { SimulationResults } from '@/lib/simulationTypes'
import { BlockData } from '@/components/BlockNode'

function block(
  id: string,
  type: string,
  name: string
): BlockData {
  return {
    id,
    type,
    name,
    position: { x: 0, y: 0 }
  }
}

describe('exportSimulationResultsAsCSV', () => {
  const blocks = [
    block('log_h', 'signal_logger', 'log_altitude'),
    block('log_m', 'signal_logger', 'log_mass'),
    block('disp_q', 'signal_display', 'disp_qbar'),
    block('sum1', 'sum', 'sum_ignored')
  ]

  const results: SimulationResults = {
    timePoints: [0, 0.05, 0.1],
    finalTime: 0.1,
    signalData: new Map([
      ['log_h', [30, 40, 50]],
      ['log_m', [590000, 589000, 588000]],
      ['disp_q', [0, 10, 20]],
      // sum is in signalData but not a logger/display — should be skipped if present
      ['sum1', [1, 2, 3]]
    ])
  }

  test('returns null for empty results', () => {
    expect(exportSimulationResultsAsCSV(null, blocks)).toBeNull()
    expect(
      exportSimulationResultsAsCSV(
        { timePoints: [], finalTime: 0, signalData: new Map() },
        blocks
      )
    ).toBeNull()
  })

  test('builds multi-column CSV with time and logger names', () => {
    const csv = exportSimulationResultsAsCSV(results, blocks)
    expect(csv).toBeTruthy()
    const lines = csv!.split('\n')
    expect(lines[0]).toBe('time,log_altitude,log_mass,disp_qbar')
    expect(lines).toHaveLength(4)
    expect(lines[1]).toMatch(/^0,30,590000,0$/)
    expect(lines[2]).toMatch(/^0\.050000,40,589000,10$/)
    expect(lines[3]).toMatch(/^0\.100000,50,588000,20$/)
  })

  test('can export loggers only', () => {
    const csv = exportSimulationResultsAsCSV(results, blocks, {
      includeDisplays: false,
      includeLoggers: true
    })
    expect(csv!.split('\n')[0]).toBe('time,log_altitude,log_mass')
  })

  test('vector columns expand to [i] headers', () => {
    const vecResults: SimulationResults = {
      timePoints: [0, 1],
      finalTime: 1,
      signalData: new Map([['log_h', [[1, 2, 3], [4, 5, 6]]]])
    }
    const csv = exportSimulationResultsAsCSV(vecResults, [
      block('log_h', 'signal_logger', 'log_V')
    ])
    expect(csv!.split('\n')[0]).toBe('time,log_V[0],log_V[1],log_V[2]')
    expect(csv!.split('\n')[1]).toBe('0,1,2,3')
  })

  test('exportGlobalSimulationResultsAsCSV single sheet', () => {
    const global = new Map([['main', results]])
    const csv = exportGlobalSimulationResultsAsCSV(global, [
      { id: 'main', name: 'Main', blocks }
    ])
    expect(csv).toContain('log_altitude')
    expect(csv).toContain('log_mass')
  })
})

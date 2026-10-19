/**
 * Simulation settings are part of the model: changing them marks it dirty, and
 * autosave / Save persist the current values (compile reads them from there).
 */

jest.mock('@/lib/modelApi', () => ({
  modelApi: {
    putAutosave: jest.fn(async () => '2026-10-18T00:00:00.000Z'),
    save: jest.fn(async (id: string) => ({
      model: { id, name: 'M', latest_version: 2, created_at: '', updated_at: '' },
      version: 2,
      hash: 'h2'
    }))
  },
  ModelApiError: class extends Error {}
}))

import { modelApi } from '@/lib/modelApi'
import { useModelStore, DEFAULT_GLOBAL_SETTINGS, normalizeGlobalSettings } from '@/lib/modelStore'
import type { Model, ModelVersion } from '@/lib/types'

const model = {
  id: 'm1',
  name: 'M',
  storage_kind: 'managed',
  file_path: null,
  file_format: 'wrapper',
  file_hash: 'h1',
  file_mtime_ms: 0,
  latest_version: 1,
  autosave_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
} as Model

const load = (globalSettings?: unknown) => {
  const versionData: ModelVersion = {
    id: 'm1@1',
    model_id: 'm1',
    version: 1,
    created_at: model.created_at,
    data: {
      sheets: [{ id: 'main', name: 'Main', blocks: [], connections: [], extents: { width: 1000, height: 800 } }],
      parameters: [],
      ...(globalSettings !== undefined ? { globalSettings } : {})
    }
  }
  useModelStore.getState().initializeFromModel(model, versionData)
  useModelStore.setState({ autoSaveEnabled: true, fileHash: 'h1' })
}

beforeEach(() => jest.clearAllMocks())

describe('normalizeGlobalSettings', () => {
  it('fills defaults for missing or invalid fields', () => {
    expect(normalizeGlobalSettings(undefined)).toEqual(DEFAULT_GLOBAL_SETTINGS)
    expect(
      normalizeGlobalSettings({ simulationTimeStep: -1, simulationDuration: 50, integrationAlgorithm: 'x', debugMath: 1 })
    ).toEqual({ simulationTimeStep: 0.01, simulationDuration: 50, integrationAlgorithm: 'rk4', debugMath: true })
  })
})

describe('simulation settings in the model store', () => {
  it('loads settings from the model data and starts clean', () => {
    load({ simulationTimeStep: 0.005, simulationDuration: 1000, integrationAlgorithm: 'euler', debugMath: true })
    const s = useModelStore.getState()
    expect(s.globalSettings).toEqual({
      simulationTimeStep: 0.005,
      simulationDuration: 1000,
      integrationAlgorithm: 'euler',
      debugMath: true
    })
    expect(s.isDirty).toBe(false)
    expect(s.checkIfDirty()).toBe(false)
  })

  it('marks dirty only when a value changes', () => {
    load(DEFAULT_GLOBAL_SETTINGS)
    useModelStore.getState().setGlobalSettings({ debugMath: false, simulationDuration: 10 })
    expect(useModelStore.getState().isDirty).toBe(false)

    useModelStore.getState().setGlobalSettings({ debugMath: true })
    expect(useModelStore.getState().isDirty).toBe(true)
    // The periodic autosave check recomputes dirtiness from a hash: it must see the change
    expect(useModelStore.getState().checkIfDirty()).toBe(true)

    useModelStore.getState().markAsClean()
    expect(useModelStore.getState().checkIfDirty()).toBe(false)
  })

  it('autosave persists the current settings (not fixed defaults)', async () => {
    load(DEFAULT_GLOBAL_SETTINGS)
    useModelStore.getState().setGlobalSettings({ integrationAlgorithm: 'euler', debugMath: true, simulationTimeStep: 0.002 })
    await useModelStore.getState().saveAutoSave()
    const [, data] = (modelApi.putAutosave as jest.Mock).mock.calls[0]
    expect(data.globalSettings).toEqual({
      simulationTimeStep: 0.002,
      simulationDuration: 10,
      integrationAlgorithm: 'euler',
      debugMath: true
    })
  })

  it('Save persists the store settings, with explicit values taking precedence', async () => {
    load(DEFAULT_GLOBAL_SETTINGS)
    useModelStore.getState().setGlobalSettings({ debugMath: true })
    await useModelStore.getState().saveModel({ simulationTimeStep: 0.02, simulationDuration: 20 })
    const [, data] = (modelApi.save as jest.Mock).mock.calls[0]
    expect(data.globalSettings).toEqual({
      simulationTimeStep: 0.02,
      simulationDuration: 20,
      integrationAlgorithm: 'rk4',
      debugMath: true
    })
    const s = useModelStore.getState()
    expect(s.globalSettings.simulationDuration).toBe(20)
    expect(s.checkIfDirty()).toBe(false)
  })
})

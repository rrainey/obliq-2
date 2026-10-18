// lib/types.ts

// Model metadata (SQLite `models` index; content lives in the model file)
export interface Model {
  id: string
  name: string
  /** 'managed' → ~/.config/obliq-2/models/<id>/model.json; 'linked' → file_path */
  storage_kind: 'managed' | 'linked'
  file_path: string | null
  file_format: 'wrapper' | 'bare'
  file_hash: string | null
  file_mtime_ms: number | null
  /** Highest recorded snapshot version (the model file itself may be newer). */
  latest_version: number
  autosave_at: string | null
  created_at: string
  updated_at: string
}

// Model version data (a snapshot under versions/, or the current file)
export interface ModelVersion {
  id: string
  model_id: string
  version: number
  data: any // This will be the actual model data (sheets, etc.)
  created_at: string
}

// Combined model with version data (for UI use)
export interface ModelWithVersion extends Model {
  versionData?: ModelVersion
  availableVersions?: number[]
}

// For backward compatibility during migration
export interface LegacyModel extends Model {
  data?: any
}

export interface Breadcrumb {
  sheetId: string
  sheetName: string
  path: string[]
}

export interface SheetPath {
  breadcrumbs: Breadcrumb[]
  currentSheet: {
    id: string
    name: string
    isRoot: boolean
    parentId: string | null
  }
}
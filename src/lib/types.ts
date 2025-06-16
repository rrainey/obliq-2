// lib/types.ts

// Model metadata (stored in models table)
export interface Model {
  id: string
  user_id: string
  name: string
  latest_version: number
  created_at: string
  updated_at: string
}

// Model version data (stored in model_versions table)
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
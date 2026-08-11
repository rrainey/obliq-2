/**
 * Parse and normalize model JSON for UI import (export / sample fixtures).
 *
 * Accepts:
 * - Full export/fixture: { name?, data: { sheets, ... }, ... }
 * - Bare model data: { version?, sheets, parameters?, ... }
 *
 * Soft validation only — does not reject unknown block types so new blocks
 * (divide, atmosphere, etc.) can be imported from fixtures.
 */

export interface ImportedModelPayload {
  /** Display name for models.name (may be empty if caller should prompt) */
  name: string
  /** JSON stored in model_versions.data */
  data: Record<string, unknown>
  /** Source description for UI messages */
  sourceLabel: string
}

export class ModelImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelImportError'
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sheetLooksValid(sheet: unknown): boolean {
  if (!isPlainObject(sheet)) return false
  if (typeof sheet.id !== 'string' || !sheet.id) return false
  if (typeof sheet.name !== 'string') return false
  // blocks / connections may be missing on broken files — require arrays if present
  if (sheet.blocks !== undefined && !Array.isArray(sheet.blocks)) return false
  if (sheet.connections !== undefined && !Array.isArray(sheet.connections)) return false
  return true
}

/**
 * Extract sheets array from model data (top-level only).
 */
function getSheets(data: Record<string, unknown>): unknown[] | null {
  if (!Array.isArray(data.sheets)) return null
  return data.sheets
}

/**
 * Normalize model data for storage: ensure required defaults, preserve extras.
 */
export function normalizeModelData(raw: Record<string, unknown>): Record<string, unknown> {
  const sheets = getSheets(raw)
  if (!sheets || sheets.length === 0) {
    throw new ModelImportError('Model data must include a non-empty "sheets" array.')
  }

  for (let i = 0; i < sheets.length; i++) {
    if (!sheetLooksValid(sheets[i])) {
      throw new ModelImportError(
        `Invalid sheet at index ${i}: each sheet needs string "id" and "name", and optional blocks/connections arrays.`
      )
    }
  }

  // Ensure each sheet has blocks/connections arrays
  const normalizedSheets = sheets.map((s) => {
    const sheet = s as Record<string, unknown>
    return {
      ...sheet,
      blocks: Array.isArray(sheet.blocks) ? sheet.blocks : [],
      connections: Array.isArray(sheet.connections) ? sheet.connections : [],
      extents:
        isPlainObject(sheet.extents) &&
        typeof sheet.extents.width === 'number' &&
        typeof sheet.extents.height === 'number'
          ? sheet.extents
          : { width: 1200, height: 800 },
    }
  })

  const version =
    typeof raw.version === 'string' && raw.version.trim()
      ? raw.version
      : '2.2'

  const metadata = isPlainObject(raw.metadata)
    ? {
        ...raw.metadata,
        created:
          typeof raw.metadata.created === 'string'
            ? raw.metadata.created
            : new Date().toISOString(),
      }
    : {
        created: new Date().toISOString(),
        description: 'Imported model',
      }

  const globalSettings = isPlainObject(raw.globalSettings)
    ? {
        simulationTimeStep:
          typeof raw.globalSettings.simulationTimeStep === 'number'
            ? raw.globalSettings.simulationTimeStep
            : 0.01,
        simulationDuration:
          typeof raw.globalSettings.simulationDuration === 'number'
            ? raw.globalSettings.simulationDuration
            : 10,
        integrationAlgorithm:
          raw.globalSettings.integrationAlgorithm === 'euler' ||
          raw.globalSettings.integrationAlgorithm === 'rk4'
            ? raw.globalSettings.integrationAlgorithm
            : 'rk4',
      }
    : {
        simulationTimeStep: 0.01,
        simulationDuration: 10,
        integrationAlgorithm: 'rk4' as const,
      }

  const parameters = Array.isArray(raw.parameters) ? raw.parameters : []
  const dataStores = Array.isArray(raw.dataStores) ? raw.dataStores : []

  return {
    ...raw,
    version,
    metadata,
    sheets: normalizedSheets,
    parameters,
    dataStores,
    globalSettings,
  }
}

/**
 * Derive a default model name from a file path or URL.
 */
export function nameFromFileName(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, '').replace(/\.json$/i, '')
  return base.trim() || 'Imported Model'
}

/**
 * Parse a JSON string or already-parsed object into an import payload.
 */
export function parseModelImport(
  input: string | unknown,
  options?: { fileName?: string }
): ImportedModelPayload {
  let parsed: unknown

  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input)
    } catch {
      throw new ModelImportError('File is not valid JSON.')
    }
  } else {
    parsed = input
  }

  if (!isPlainObject(parsed)) {
    throw new ModelImportError('Model JSON must be an object.')
  }

  let name = ''
  let dataRaw: Record<string, unknown>
  let sourceLabel = 'model data'

  if (isPlainObject(parsed.data) && Array.isArray(parsed.data.sheets)) {
    // Export / fixture wrapper: { name, data: { sheets, ... } }
    dataRaw = parsed.data
    name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
    sourceLabel = 'export / sample fixture'
  } else if (Array.isArray(parsed.sheets)) {
    // Bare model data
    dataRaw = parsed
    name = typeof parsed.name === 'string' ? (parsed.name as string).trim() : ''
    sourceLabel = 'model data object'
  } else {
    throw new ModelImportError(
      'Unrecognized model JSON. Expected either { "name", "data": { "sheets": [...] } } ' +
        'or a data object with a top-level "sheets" array.'
    )
  }

  if (!name && options?.fileName) {
    name = nameFromFileName(options.fileName)
  }

  const data = normalizeModelData(dataRaw)

  return {
    name: name || nameFromFileName(options?.fileName || 'Imported Model'),
    data,
    sourceLabel,
  }
}

/**
 * Read a File as text and parse as model import.
 */
export async function parseModelImportFile(file: File): Promise<ImportedModelPayload> {
  if (file.size > 25 * 1024 * 1024) {
    throw new ModelImportError('File is too large (max 25 MB).')
  }
  const text = await file.text()
  return parseModelImport(text, { fileName: file.name })
}

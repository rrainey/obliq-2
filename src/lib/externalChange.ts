import type { FileStatus } from '@/lib/modelApi'

/**
 * What the editor should do about the latest reported status of its model file.
 *
 * - `none`    nothing (no status yet, busy, or the report is stale)
 * - `clear`   the file matches what the editor holds; dismiss any banner
 * - `missing` the file is gone
 * - `banner`  the file changed and there are unsaved edits; ask the user
 * - `reload`  the file changed and there is nothing to lose; reload silently
 */
export type ExternalChangeAction = 'none' | 'clear' | 'missing' | 'banner' | 'reload'

export interface ExternalChangeInput {
  status: FileStatus | null
  /** Hash of the file content the editor last loaded or saved. */
  fileHash: string | null
  /** Modification time (ms) of that same file version, from the model record. */
  knownMtimeMs: number | null | undefined
  /** Hashes of file versions this editor held earlier in the session (loaded or saved). */
  previousHashes?: ReadonlySet<string>
  /** A save or a reload/overwrite is in progress. */
  busy: boolean
  hasUnsavedEdits: boolean
  saveConflict: boolean
}

export function decideExternalChange(input: ExternalChangeInput): ExternalChangeAction {
  const { status, fileHash, knownMtimeMs, previousHashes, busy, hasUnsavedEdits, saveConflict } = input
  if (!status || busy) return 'none'
  if (status.status === 'missing') return 'missing'

  // Status reports (the watcher's events, focus re-checks) can arrive after
  // the editor's own save has already landed, still describing the version it
  // replaced. Such a report is stale, not an outside change: it is older than
  // the version the editor holds AND names content the editor itself held.
  // Requiring both keeps real changes visible -- new content always passes,
  // and a revert to earlier content carries a newer modification time.
  const stale =
    knownMtimeMs != null &&
    status.mtimeMs < knownMtimeMs &&
    status.hash !== fileHash &&
    (previousHashes?.has(status.hash) ?? false)
  if (stale) return 'none'

  if (!fileHash || status.hash === fileHash) return saveConflict ? 'none' : 'clear'
  return hasUnsavedEdits ? 'banner' : 'reload'
}

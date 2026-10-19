import { decideExternalChange, type ExternalChangeInput } from '@/lib/externalChange'

const base: ExternalChangeInput = {
  status: { status: 'ok', hash: 'h1', mtimeMs: 2000 },
  fileHash: 'h1',
  knownMtimeMs: 2000,
  previousHashes: new Set(['h0', 'h1']),
  busy: false,
  hasUnsavedEdits: false,
  saveConflict: false,
}
const decide = (over: Partial<ExternalChangeInput>) => decideExternalChange({ ...base, ...over })

describe('decideExternalChange', () => {
  it('does nothing without a status or while busy', () => {
    expect(decide({ status: null })).toBe('none')
    expect(decide({ busy: true, status: { status: 'ok', hash: 'x', mtimeMs: 9999 } })).toBe('none')
  })

  it('clears when the file matches what the editor holds', () => {
    expect(decide({})).toBe('clear')
    expect(decide({ saveConflict: true })).toBe('none')
  })

  it('reports a missing file', () => {
    expect(decide({ status: { status: 'missing' } })).toBe('missing')
  })

  it('reloads silently or asks, depending on unsaved edits', () => {
    const outside = { status: 'changed', hash: 'h2', mtimeMs: 3000 } as const
    expect(decide({ status: outside })).toBe('reload')
    expect(decide({ status: outside, hasUnsavedEdits: true })).toBe('banner')
  })

  it('ignores a late report about the version the editor just replaced (save race)', () => {
    // Saved h1 at t=2000; the watcher's report about the pre-save file (h0, t=1000)
    // arrives after the save response.
    expect(decide({ status: { status: 'ok', hash: 'h0', mtimeMs: 1000 } })).toBe('none')
  })

  it('still sees new content even if its modification time is older (e.g. rsync -a)', () => {
    expect(decide({ status: { status: 'ok', hash: 'h9', mtimeMs: 500 } })).toBe('reload')
  })

  it('still sees a revert to earlier content, which carries a newer time', () => {
    expect(decide({ status: { status: 'ok', hash: 'h0', mtimeMs: 3000 } })).toBe('reload')
  })
})

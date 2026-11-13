// Parameters that a block's properties dialog must keep when it saves.
//
// Most block dialogs build a new parameters object from their own fields,
// and the editor writes it as the block's parameters. Without a merge, a save
// removes the parameters that the canvas or the layout sets and that no
// dialog shows: the flip (`flipped`), the name display (`showName`), and on a
// subsystem the resize (`width`, `height`) and its own sample time
// (`sampleTimeSec`, set through the Model Builder API).

/** Parameters of every block that no dialog edits. */
const CANVAS_PARAMETERS = ['flipped', 'showName'] as const
/** Parameters of a subsystem that its dialog does not edit. */
const SUBSYSTEM_PARAMETERS = ['width', 'height', 'sampleTimeSec'] as const

/**
 * The parameters to store after a dialog save: the dialog's `next`
 * parameters, plus the canvas parameters of `previous` that `next` does not
 * have. A key that `next` has (also with the value undefined) is the
 * dialog's own choice and is not changed.
 */
export function mergeDialogParameters(
  blockType: string,
  previous: Record<string, any> | null | undefined,
  next: Record<string, any>,
): Record<string, any> {
  const out: Record<string, any> = { ...next }
  const keep: readonly string[] = blockType === 'subsystem'
    ? [...CANVAS_PARAMETERS, ...SUBSYSTEM_PARAMETERS]
    : CANVAS_PARAMETERS
  for (const key of keep) {
    if (!(key in out) && previous?.[key] !== undefined) out[key] = previous[key]
  }
  return out
}

/**
 * A full save of a dialog that owns some parameters and must keep all others
 * (the subsystem dialog): the previous parameters, then the dialog's own.
 */
export function withPreviousParameters(
  previous: Record<string, any> | null | undefined,
  own: Record<string, any>,
): Record<string, any> {
  return { ...(previous || {}), ...own }
}

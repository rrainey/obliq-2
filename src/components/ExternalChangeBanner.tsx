'use client'

import { Alert, Button, Group, Text } from '@mantine/core'
import { IconAlertTriangle, IconFileOff } from '@tabler/icons-react'

export type ExternalChangeKind = 'changed' | 'missing'

interface ExternalChangeBannerProps {
  kind: ExternalChangeKind
  /** Path shown for linked models (null for models in Obliq storage). */
  filePath: string | null
  busy?: boolean
  onReload: () => void
  onOverwrite: () => void
  onSaveAs: () => void
}

/**
 * Shown when the model file changed (or vanished) on disk while the editor
 * holds unsaved edits, or when a save was rejected because of such a change.
 */
export default function ExternalChangeBanner({
  kind,
  filePath,
  busy,
  onReload,
  onOverwrite,
  onSaveAs,
}: ExternalChangeBannerProps) {
  if (kind === 'missing') {
    return (
      <Alert color="red" icon={<IconFileOff size={18} />} title="Model file is missing" radius={0}>
        <Text size="sm" mb="xs">
          {filePath ? <>The linked file <code>{filePath}</code> no longer exists.</> : 'The model file no longer exists.'}{' '}
          Your edits are still in the editor. Restore the file, or save a copy to keep your work.
        </Text>
        <Group gap="xs">
          <Button size="xs" onClick={onSaveAs} disabled={busy}>
            Save as new model…
          </Button>
        </Group>
      </Alert>
    )
  }

  return (
    <Alert color="orange" icon={<IconAlertTriangle size={18} />} title="Model changed on disk" radius={0}>
      <Text size="sm" mb="xs">
        {filePath ? <>The file <code>{filePath}</code></> : 'This model'} was modified outside this editor
        (a script, the Model Builder API, or another tab) while you have unsaved edits.
        The disk version is kept in the version history either way.
      </Text>
      <Group gap="xs">
        <Button size="xs" variant="default" onClick={onReload} disabled={busy}>
          Reload from disk (discard my edits)
        </Button>
        <Button size="xs" color="orange" onClick={onOverwrite} loading={busy}>
          Keep mine (overwrite)
        </Button>
        <Button size="xs" variant="light" onClick={onSaveAs} disabled={busy}>
          Save mine as new model…
        </Button>
      </Group>
    </Alert>
  )
}

// components/TuneLayoutDialog.tsx
'use client'

import { useState } from 'react'
import { Modal, Radio, Button, Stack, Group, Text, Divider, Alert } from '@mantine/core'
import { IconInfoCircle, IconWand, IconAlertTriangle } from '@tabler/icons-react'
import {
  DEFAULT_TUNE_OPTIONS,
  isNoOp,
  type TuneLayoutOptions,
  type TuneScope,
  type PortLabelChoice,
} from '@/lib/layout/tuneModelLayout'

interface TuneLayoutDialogProps {
  opened: boolean
  /** True when the active sheet sits inside a subsystem. */
  insideSubsystem: boolean
  tuning?: boolean
  /** How many sheets a given scope covers, for the warning below. */
  sheetsInScope?: (scope: TuneScope) => number
  onClose: () => void
  onTune: (options: TuneLayoutOptions) => void
}

/** Radio groups are yes/no, so booleans are carried as these two strings. */
const YES = 'yes'
const NO = 'no'
const asBool = (v: string) => v === YES
const asChoice = (b: boolean) => (b ? YES : NO)

export default function TuneLayoutDialog({
  opened,
  insideSubsystem,
  tuning = false,
  sheetsInScope,
  onClose,
  onTune,
}: TuneLayoutDialogProps) {
  const [cleanUpLayout, setCleanUpLayout] = useState(DEFAULT_TUNE_OPTIONS.cleanUpLayout)
  const [resizeSubsystems, setResizeSubsystems] = useState(DEFAULT_TUNE_OPTIONS.resizeSubsystems)
  const [subsystemPortLabels, setSubsystemPortLabels] =
    useState<PortLabelChoice>(DEFAULT_TUNE_OPTIONS.subsystemPortLabels)
  const [hideBlockNames, setHideBlockNames] = useState(DEFAULT_TUNE_OPTIONS.hideBlockNames)
  const [scope, setScope] = useState<TuneScope>(DEFAULT_TUNE_OPTIONS.scope)

  const options: TuneLayoutOptions = {
    cleanUpLayout, resizeSubsystems, subsystemPortLabels, hideBlockNames, scope,
  }
  const nothingSelected = isNoOp(options)
  const affected = sheetsInScope?.(scope) ?? 1

  return (
    <Modal opened={opened} onClose={onClose} title="Tune Model Layout" size="lg" centered>
      <Stack gap="lg">
        <Radio.Group
          label="Clean up block layout"
          value={asChoice(cleanUpLayout)}
          onChange={v => setCleanUpLayout(asBool(v))}
        >
          <Stack gap="xs" mt="xs">
            <Radio value={YES} label="Yes, optimize the data pathways left to right" />
            <Radio value={NO} label="No, leave the layout as-is" />
          </Stack>
        </Radio.Group>

        <Radio.Group
          label="Resize Subsystems"
          value={asChoice(resizeSubsystems)}
          onChange={v => setResizeSubsystems(asBool(v))}
        >
          <Stack gap="xs" mt="xs">
            <Radio value={YES} label="Yes, resize Subsystem blocks to better fit its ports" />
            <Radio value={NO} label="Do not resize Subsystem blocks" />
          </Stack>
        </Radio.Group>

        <Radio.Group
          label="Subsystem Ports Labeling"
          value={subsystemPortLabels}
          onChange={v => setSubsystemPortLabels(v as PortLabelChoice)}
        >
          <Stack gap="xs" mt="xs">
            <Radio value="show" label="Show port names" />
            <Radio value="hide" label="Hide port names" />
            <Radio value="asis" label="Leave as-is" />
          </Stack>
        </Radio.Group>

        <Radio.Group
          label="Hide unnecessary block names"
          value={asChoice(hideBlockNames)}
          onChange={v => setHideBlockNames(asBool(v))}
        >
          <Stack gap="xs" mt="xs">
            <Radio value={YES} label="Yes, hide names on all but Subsystem blocks" />
            <Radio value={NO} label="No, leave as-is" />
          </Stack>
        </Radio.Group>

        <Divider />

        <Radio.Group
          label="Scope"
          value={scope}
          onChange={v => setScope(v as TuneScope)}
        >
          <Stack gap="xs" mt="xs">
            <Radio value="sheet" label="Current sheet" />
            <Radio
              value="subsystem"
              label={insideSubsystem
                ? 'Current Subsystem'
                : 'Current Subsystem (not in one — tunes the entire model)'}
            />
            <Radio value="model" label="Entire model" />
          </Stack>
        </Radio.Group>

        {affected > 1 ? (
          <Alert variant="light" color="yellow" icon={<IconAlertTriangle />}>
            <Text size="sm">
              This will rewrite <strong>{affected} sheets</strong>, including sheets
              inside subsystems that are not currently open. Tuning cannot be undone,
              so save first if you want a version to return to. Choose a narrower
              scope, or Cancel, if that is more than you intended.
            </Text>
          </Alert>
        ) : (
          <Alert variant="light" color="gray" icon={<IconInfoCircle />}>
            <Text size="sm">
              Tuning rewrites block positions, sizes, and name visibility in place
              on this sheet. It cannot be undone, so save first if you want a
              version to return to.
            </Text>
          </Alert>
        )}

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={tuning}>
            Cancel
          </Button>
          <Button
            onClick={() => onTune(options)}
            loading={tuning}
            disabled={nothingSelected}
            leftSection={<IconWand size={16} />}
          >
            Tune Now
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

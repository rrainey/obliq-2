// components/TuneLayoutDialog.tsx
'use client'

import { useState } from 'react'
import { Modal, Radio, Button, Stack, Group, Text, Divider, Alert, NumberInput, Checkbox, Loader } from '@mantine/core'
import { IconInfoCircle, IconWand, IconAlertTriangle } from '@tabler/icons-react'
import {
  DEFAULT_TUNE_OPTIONS,
  isNoOp,
  type TuneLayoutOptions,
  type TuneScope,
  type PortLabelChoice,
  type LayoutEngine,
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
  const [maxPortSpacing, setMaxPortSpacing] = useState(DEFAULT_TUNE_OPTIONS.maxPortSpacing)
  const [subsystemPortLabels, setSubsystemPortLabels] =
    useState<PortLabelChoice>(DEFAULT_TUNE_OPTIONS.subsystemPortLabels)
  const [hideBlockNames, setHideBlockNames] = useState(DEFAULT_TUNE_OPTIONS.hideBlockNames)
  const [scope, setScope] = useState<TuneScope>(DEFAULT_TUNE_OPTIONS.scope)
  const [engine, setEngine] = useState<LayoutEngine>(DEFAULT_TUNE_OPTIONS.engine ?? 'elk')
  const [useSubsystemFunctions, setUseSubsystemFunctions] = useState(DEFAULT_TUNE_OPTIONS.useSubsystemFunctions ?? true)
  const [mirrorReturnPath, setMirrorReturnPath] = useState(DEFAULT_TUNE_OPTIONS.mirrorReturnPath ?? true)
  const [tidySignalLabels, setTidySignalLabels] = useState(DEFAULT_TUNE_OPTIONS.tidySignalLabels ?? false)

  const options: TuneLayoutOptions = {
    cleanUpLayout, resizeSubsystems, maxPortSpacing, subsystemPortLabels, hideBlockNames, scope,
    // The engine applies only to the clean-up
    engine: cleanUpLayout ? engine : 'classic',
    useSubsystemFunctions,
    mirrorReturnPath,
    // The tidy needs the ELK clean-up
    tidySignalLabels: cleanUpLayout && engine === 'elk' && tidySignalLabels,
  }
  const nothingSelected = isNoOp(options)
  const affected = sheetsInScope?.(scope) ?? 1

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Tune Model Layout"
      size="lg"
      centered
      // The dialog stays open, and cannot be closed, until the tuning is complete
      closeOnClickOutside={!tuning}
      closeOnEscape={!tuning}
      withCloseButton={!tuning}
    >
      {/* No option can change while the tuning runs */}
      <Stack gap="lg" style={tuning ? { pointerEvents: 'none' } : undefined} aria-busy={tuning}>
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

        {cleanUpLayout && (
          <Radio.Group
            label="Layout engine"
            value={engine}
            onChange={v => setEngine(v as LayoutEngine)}
          >
            <Stack gap="xs" mt="xs">
              <Radio
                value="elk"
                label="ELK Layered"
                description="Routes wires around blocks. Puts Sheet Labels, constants and displays next to the block that they connect to."
              />
              <Radio value="classic" label="Classic" description="The layout engine of earlier releases. It does not route wires around blocks." />
            </Stack>
          </Radio.Group>
        )}

        {cleanUpLayout && engine === 'elk' && (
          <Checkbox
            label="Use subsystem functions for signal flow order"
            description="Puts each control loop in the order controller, actuator, plant, from left to right. Sensors and compensators go on the return path. Uses the Subsystem Function of each subsystem, or the suggested function."
            checked={useSubsystemFunctions}
            onChange={e => setUseSubsystemFunctions(e.currentTarget.checked)}
          />
        )}

        {cleanUpLayout && engine === 'elk' && useSubsystemFunctions && (
          <Checkbox
            label="Mirror feedback-path blocks"
            description="Puts the return path of each control loop on a row below the forward path. Flips its blocks, so that the inputs are on the right and the outputs on the left. The layout sets or removes the flip on each block in scope."
            checked={mirrorReturnPath}
            onChange={e => setMirrorReturnPath(e.currentTarget.checked)}
          />
        )}

        {cleanUpLayout && engine === 'elk' && (
          <Checkbox
            label="Tidy signal labels (changes the model)"
            description="Replaces a long wire that crosses many other wires with a Sheet Label Sink and Source. Keeps an edit only when the sheet has fewer crossings. Keeps the drawn wires of the forward path and of the return row, and one wire between two connected subsystems. The simulation does not change. This can take some seconds for each large sheet."
            checked={tidySignalLabels}
            onChange={e => setTidySignalLabels(e.currentTarget.checked)}
          />
        )}

        <Radio.Group
          label="Resize Subsystems"
          value={asChoice(resizeSubsystems)}
          onChange={v => setResizeSubsystems(asBool(v))}
        >
          <Stack gap="xs" mt="xs">
            <Radio value={YES} label="Yes, resize Subsystem blocks to better fit its ports" />
            {resizeSubsystems && (
              <NumberInput
                ml={28}
                maw={260}
                size="xs"
                label="Maximum port spacing (px)"
                description="How far apart a resized Subsystem may spread its ports (natural spacing is 20)"
                value={maxPortSpacing}
                onChange={v => setMaxPortSpacing(typeof v === 'number' && v > 0 ? v : DEFAULT_TUNE_OPTIONS.maxPortSpacing)}
                min={20}
                max={400}
                step={10}
                allowDecimal={false}
              />
            )}
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
          {tuning && (
            <Group gap="xs" mr="auto" role="status" aria-live="polite">
              <Loader size="xs" />
              <Text size="sm" c="dimmed">
                {options.tidySignalLabels
                  ? 'Tuning the layout. This can take up to a minute.'
                  : 'Tuning the layout. Wait until it is complete.'}
              </Text>
            </Group>
          )}
          <Button variant="default" onClick={onClose} disabled={tuning}>
            Cancel
          </Button>
          <Button
            onClick={() => onTune(options)}
            loading={tuning}
            disabled={nothingSelected && !tuning}
            leftSection={<IconWand size={16} />}
          >
            Tune Now
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

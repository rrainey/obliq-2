'use client'

import { useEffect, useMemo, useState } from 'react'
import { Alert, Badge, Button, Group, Loader, Modal, SegmentedControl, Select, Stack, Text } from '@mantine/core'
import { IconExternalLink, IconInfoCircle, IconAlertTriangle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'
import { modelApi, type ModelListItem } from '@/lib/modelApi'
import { modelInterface, type ModelInterface } from '@/lib/modelReferences'

interface ModelReferenceConfigProps {
  block: BlockData
  /** The model being edited, which cannot reference itself */
  currentModelId?: string
  /** Wires on this block, by port side and index, to warn about removed ports */
  connectedPorts: { inputs: number[]; outputs: number[] }
  onUpdate: (parameters: Record<string, any>, opts: { dropMissingWires: boolean }) => void
  onClose: () => void
}

/** Editor URL of a model, at a saved version when pinned. */
export function modelEditorUrl(modelId: string, version: number | null): string {
  return `/models/${encodeURIComponent(modelId)}${version ? `?version=${version}` : ''}`
}

export default function ModelReferenceConfig({ block, currentModelId, connectedPorts, onUpdate, onClose }: ModelReferenceConfigProps) {
  const p = block.parameters || {}
  const [models, setModels] = useState<ModelListItem[] | null>(null)
  const [modelId, setModelId] = useState<string | null>(p.modelRef?.modelId || null)
  const [pinned, setPinned] = useState<boolean>(typeof p.modelRef?.version === 'number')
  const [version, setVersion] = useState<number | null>(typeof p.modelRef?.version === 'number' ? p.modelRef.version : null)
  const [iface, setIface] = useState<ModelInterface | null>(null)
  const [loadingIface, setLoadingIface] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    modelApi.list().then(setModels).catch(e => setError(e.message))
  }, [])

  const choices = useMemo(() => {
    const list = (models || []).filter(m => m.id !== currentModelId)
    const dupes = new Set(list.map(m => m.name).filter((n, i, a) => a.indexOf(n) !== i))
    return list
      .map(m => ({ value: m.id, label: dupes.has(m.name) ? `${m.name} (${m.id.slice(0, 8)})` : m.name }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [models, currentModelId])

  const selected = models?.find(m => m.id === modelId)
  const versions = selected?.availableVersions || []
  const effectiveVersion = pinned ? version ?? versions[0] ?? null : null

  // The chosen model's interface (its top-level ports) at the chosen version
  useEffect(() => {
    if (!modelId) {
      setIface(null)
      return
    }
    let cancelled = false
    setLoadingIface(true)
    const load = effectiveVersion
      ? modelApi.getVersion(modelId, effectiveVersion).then(v => v.data)
      : modelApi.getCurrent(modelId).then(c => c.data)
    load
      .then(data => !cancelled && setIface(modelInterface(data)))
      .catch(e => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoadingIface(false))
    return () => {
      cancelled = true
    }
  }, [modelId, effectiveVersion])

  // Wires on ports the chosen model does not have (by the block's cached names)
  const cachedIn: string[] = p.inputPorts || []
  const cachedOut: string[] = p.outputPorts || []
  const missing = iface
    ? [
        ...connectedPorts.inputs.map(i => cachedIn[i]).filter(n => n !== undefined && !iface.inputs.includes(n!)),
        ...connectedPorts.outputs.map(i => cachedOut[i]).filter(n => n !== undefined && !iface.outputs.includes(n!)),
      ]
    : []
  const uniqueMissing = [...new Set(missing)]

  const handleSave = () => {
    if (!modelId || !selected) {
      setError('Choose a model')
      return
    }
    onUpdate(
      {
        ...p,
        modelRef: { modelId, version: effectiveVersion, name: selected.name },
        modelRefName: selected.name,
        sheets: [],
        codeGenStrategy: undefined,
      },
      { dropMissingWires: uniqueMissing.length > 0 }
    )
    onClose()
  }

  return (
    <Modal opened={true} onClose={onClose} title={`Configure Model Reference: ${block.name}`} size="lg" centered>
      <Stack gap="md">
        {error && (
          <Alert icon={<IconInfoCircle size={16} />} color="red" variant="light" withCloseButton onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Text size="sm" c="dimmed">
          Embeds another saved model. The block&apos;s ports are that model&apos;s top-level Input and Output Ports. To
          change the model, open it in its own tab; this model picks up its changes when you return. When this model
          runs, its own simulation settings apply; the referenced model&apos;s are ignored.
        </Text>

        <Select
          label="Model"
          placeholder={models ? 'Choose a model' : 'Loading models…'}
          data={choices}
          value={modelId}
          onChange={v => {
            setModelId(v)
            setVersion(null)
          }}
          searchable
          nothingFoundMessage="No other models"
          allowDeselect={false}
        />

        <div>
          <Text size="sm" fw={500} mb={4}>
            Version
          </Text>
          <Group gap="sm" align="center">
            <SegmentedControl
              value={pinned ? 'pinned' : 'latest'}
              onChange={v => setPinned(v === 'pinned')}
              data={[
                { value: 'latest', label: 'Latest' },
                { value: 'pinned', label: 'Pinned' },
              ]}
            />
            {pinned && (
              <Select
                aria-label="Pinned version"
                data={versions.map(v => ({ value: String(v), label: `v${v}` }))}
                value={effectiveVersion ? String(effectiveVersion) : null}
                onChange={v => setVersion(v ? Number(v) : null)}
                disabled={versions.length === 0}
                placeholder={versions.length === 0 ? 'No saved versions' : undefined}
                w={140}
                allowDeselect={false}
              />
            )}
          </Group>
          <Text size="xs" c="dimmed" mt={4}>
            {pinned
              ? 'Uses that saved version until you change it.'
              : 'Follows the model’s latest save.'}
          </Text>
        </div>

        {modelId && (
          <div>
            <Text size="sm" fw={500} mb={4}>
              Ports
            </Text>
            {loadingIface || !iface ? (
              <Loader size="sm" />
            ) : iface.inputs.length + iface.outputs.length === 0 ? (
              <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
                This model has no Input or Output Port blocks on its top-level sheets, so the block has no ports.
              </Alert>
            ) : (
              <Stack gap={4}>
                <Group gap={4}>
                  <Text size="xs" c="dimmed" w={56}>Inputs</Text>
                  {iface.inputs.length ? iface.inputs.map(n => <Badge key={`i-${n}`} variant="light" size="sm">{n}</Badge>) : <Text size="xs">none</Text>}
                </Group>
                <Group gap={4}>
                  <Text size="xs" c="dimmed" w={56}>Outputs</Text>
                  {iface.outputs.length ? iface.outputs.map(n => <Badge key={`o-${n}`} variant="light" color="grape" size="sm">{n}</Badge>) : <Text size="xs">none</Text>}
                </Group>
              </Stack>
            )}
          </div>
        )}

        {uniqueMissing.length > 0 && (
          <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
            Wires use {uniqueMissing.length === 1 ? 'a port' : 'ports'} this model does not have:{' '}
            {uniqueMissing.map(n => `“${n}”`).join(', ')}. Saving removes those wires.
          </Alert>
        )}

        <Group justify="space-between">
          <Button
            variant="subtle"
            leftSection={<IconExternalLink size={16} />}
            disabled={!modelId}
            onClick={() => modelId && window.open(modelEditorUrl(modelId, effectiveVersion), '_blank', 'noopener')}
          >
            Open model
          </Button>
          <Group>
            <Button variant="default" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!modelId || (pinned && !effectiveVersion)}>Save</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}

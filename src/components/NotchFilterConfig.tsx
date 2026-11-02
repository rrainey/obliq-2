'use client'

import { useState } from 'react'
import { Modal, NumberInput, Button, Stack, Group, Text } from '@mantine/core'
import { BlockData } from './BlockNode'

interface NotchFilterConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function NotchFilterConfig({ block, onUpdate, onClose }: NotchFilterConfigProps) {
  const p = block.parameters || {}
  const [q, setQ] = useState<number>(p.q ?? 5)
  const [sampleTime, setSampleTime] = useState<number>(p.sampleTime ?? 0)

  return (
    <Modal opened onClose={onClose} title={`Configure ${block.name}`} centered>
      <Stack>
        <Text size="sm" c="dimmed">
          Inputs: signal, center_Hz and weight. Weight 1 gives the full notch, and weight 0 passes the signal.
        </Text>
        <NumberInput label="Q" description="Centre frequency divided by the bandwidth" value={q} min={0.1} step={0.5} decimalScale={3} onChange={v => setQ(Number(v))} />
        <NumberInput label="Sample time (s)" description="0 uses the enclosing sample scope, or the model step" value={sampleTime} min={0} step={0.0005} decimalScale={6} onChange={v => setSampleTime(Number(v))} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onUpdate({ ...p, q, sampleTime }); onClose() }} disabled={!(q > 0)}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

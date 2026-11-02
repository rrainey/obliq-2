'use client'

import { useState } from 'react'
import { Modal, NumberInput, Button, Stack, Group, Text } from '@mantine/core'
import { BlockData } from './BlockNode'

interface SpectrumPeaksConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function SpectrumPeaksConfig({ block, onUpdate, onClose }: SpectrumPeaksConfigProps) {
  const p = block.parameters || {}
  const [count, setCount] = useState<number>(p.count ?? 3)
  const [windowSize, setWindowSize] = useState<number>(p.windowSize ?? 72)
  const [minHz, setMinHz] = useState<number>(p.minHz ?? 100)
  const [maxHz, setMaxHz] = useState<number>(p.maxHz ?? 600)
  const [updateEvery, setUpdateEvery] = useState<number>(p.updateEvery ?? 12)
  const [sampleTime, setSampleTime] = useState<number>(p.sampleTime ?? 0)
  const valid = count >= 1 && windowSize >= 8 && minHz > 0 && maxHz > minHz && updateEvery >= 1

  return (
    <Modal opened onClose={onClose} title={`Configure ${block.name}`} centered>
      <Stack>
        <Text size="sm" c="dimmed">
          Output: double[count], the frequencies of the strongest peaks in Hz, in frequency order.
        </Text>
        <NumberInput label="Peak count" value={count} min={1} step={1} allowDecimal={false} onChange={v => setCount(Number(v))} />
        <NumberInput label="Window size (samples)" description="An even number. The bin width is the DFT rate divided by this value" value={windowSize} min={8} step={2} allowDecimal={false} onChange={v => setWindowSize(Number(v))} />
        <NumberInput label="Minimum frequency (Hz)" value={minHz} min={0} onChange={v => setMinHz(Number(v))} />
        <NumberInput label="Maximum frequency (Hz)" value={maxHz} min={0} onChange={v => setMaxHz(Number(v))} />
        <NumberInput label="Update every (samples)" value={updateEvery} min={1} step={1} allowDecimal={false} onChange={v => setUpdateEvery(Number(v))} />
        <NumberInput label="Sample time (s)" description="0 uses the enclosing sample scope, or the model step" value={sampleTime} min={0} step={0.0005} decimalScale={6} onChange={v => setSampleTime(Number(v))} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onUpdate({ ...p, count, windowSize, minHz, maxHz, updateEvery, sampleTime }); onClose() }} disabled={!valid}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

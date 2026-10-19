'use client'

import { useState } from 'react'
import { Modal, NumberInput, TextInput, Select, Button, Stack, Group, Alert, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'
import { parseType } from '@/lib/typeValidator'

interface RandomNoiseConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

/** "0.5", "[1, 2, 3]" or "1, 2, 3" → number or number[]; null if malformed. */
export function parseScalarOrVector(text: string): number | number[] | null {
  const body = text.trim().replace(/^\[/, '').replace(/\]$/, '').trim()
  if (body === '') return null
  const parts = body.split(/[,\s]+/).filter(Boolean)
  const nums = parts.map(Number)
  if (nums.some(n => !Number.isFinite(n))) return null
  return nums.length === 1 ? nums[0]! : nums
}

const formatValue = (v: unknown, fallback: number): string =>
  Array.isArray(v) ? `[${v.join(', ')}]` : String(v ?? fallback)

export default function RandomNoiseConfig({ block, onUpdate, onClose }: RandomNoiseConfigProps) {
  const p = block.parameters || {}
  const [dataType, setDataType] = useState<string>(p.dataType || 'double')
  const [distribution, setDistribution] = useState<string>(p.distribution || 'gaussian')
  const [amplitudeMode, setAmplitudeMode] = useState<string>(p.amplitudeMode || 'stdDev')
  const [mean, setMean] = useState<string>(formatValue(p.mean, 0))
  const [stdDev, setStdDev] = useState<string>(formatValue(p.stdDev, 1))
  const [noiseDensity, setNoiseDensity] = useState<string>(formatValue(p.noiseDensity, 0))
  const [sampleTime, setSampleTime] = useState<number>(p.sampleTime ?? 0)
  const [seed, setSeed] = useState<number>(p.seed ?? 1)
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    let t: ReturnType<typeof parseType> | null = null
    try {
      t = parseType(dataType.trim())
    } catch {
      t = null
    }
    if (!t || t.baseType !== 'double' || t.isMatrix) {
      setError('Data type must be double or double[N]')
      return
    }
    const width = t.isArray && t.arraySize ? t.arraySize : 1
    const check = (label: string, text: string, nonNegative: boolean) => {
      const v = parseScalarOrVector(text)
      if (v === null) throw new Error(`${label}: enter a number or a list like [1, 2, 3]`)
      const list = Array.isArray(v) ? v : [v]
      if (Array.isArray(v) && v.length !== width) {
        throw new Error(`${label}: a list must have ${width} element${width === 1 ? '' : 's'} to match ${dataType}`)
      }
      if (nonNegative && list.some(n => n < 0)) throw new Error(`${label} must be ≥ 0`)
      return v
    }
    try {
      const params = {
        dataType: dataType.trim(),
        distribution,
        amplitudeMode,
        mean: check('Mean', mean, false),
        stdDev: amplitudeMode === 'stdDev' ? check('Standard deviation', stdDev, true) : p.stdDev ?? 1,
        noiseDensity:
          amplitudeMode === 'density' ? check('Noise density', noiseDensity, true) : p.noiseDensity ?? 0,
        sampleTime,
        seed,
      }
      if (!(sampleTime >= 0)) throw new Error('Sample time must be ≥ 0')
      if (!Number.isInteger(seed) || seed < 0) throw new Error('Seed must be a non-negative integer')
      onUpdate(params)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal opened={true} onClose={onClose} title={`Configure Random Noise: ${block.name}`} size="md" centered>
      <Stack gap="md">
        {error && (
          <Alert icon={<IconInfoCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        )}

        <Text size="sm" c="dimmed">
          White noise from a seeded generator, held for one sample period. The same seed always
          gives the same sequence. A vector output draws an independent value per element.
        </Text>

        <TextInput
          label="Data Type"
          value={dataType}
          onChange={(e) => setDataType(e.target.value)}
          placeholder="double or double[3]"
          description="double for a scalar, double[N] for a vector"
        />

        <Select
          label="Distribution"
          value={distribution}
          onChange={(v) => setDistribution(v || 'gaussian')}
          data={[
            { value: 'gaussian', label: 'Gaussian (normal)' },
            { value: 'uniform', label: 'Uniform (mean ± √3·σ, same variance)' },
          ]}
          allowDeselect={false}
        />

        <TextInput
          label="Mean"
          value={mean}
          onChange={(e) => setMean(e.target.value)}
          description="A number, or one value per element: [0, 0, 0]"
        />

        <Select
          label="Amplitude"
          value={amplitudeMode}
          onChange={(v) => setAmplitudeMode(v || 'stdDev')}
          data={[
            { value: 'stdDev', label: 'Standard deviation σ' },
            { value: 'density', label: 'Noise density N (σ = N/√Ts)' },
          ]}
          allowDeselect={false}
        />

        {amplitudeMode === 'stdDev' ? (
          <TextInput
            label="Standard deviation σ"
            value={stdDev}
            onChange={(e) => setStdDev(e.target.value)}
            description="A number, or one value per element"
          />
        ) : (
          <TextInput
            label="Noise density N (units/√Hz)"
            value={noiseDensity}
            onChange={(e) => setNoiseDensity(e.target.value)}
            description="Datasheet white-noise density, e.g. a gyro's rad/s/√Hz. Ts is the sample time, or the model step."
          />
        )}

        <NumberInput
          label="Sample time (s)"
          value={sampleTime}
          onChange={(v) => setSampleTime(typeof v === 'number' ? v : 0)}
          decimalScale={10}
          min={0}
          description="How long each value is held; 0 draws a new value every model step"
        />

        <NumberInput
          label="Seed"
          value={seed}
          onChange={(v) => setSeed(typeof v === 'number' ? v : 1)}
          allowDecimal={false}
          min={0}
          description="Give each noise block its own seed so their sequences are independent"
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

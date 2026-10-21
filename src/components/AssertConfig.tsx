'use client'

import { useState } from 'react'
import { Modal, TextInput, Select, Button, Stack, Group, Alert, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'

interface AssertConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

/** "" → null (unbounded / not set); a number → number; anything else → NaN. */
export function parseOptionalNumber(text: string): number | null {
  const t = text.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

const show = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

export default function AssertConfig({ block, onUpdate, onClose }: AssertConfigProps) {
  const p = block.parameters || {}
  const [mode, setMode] = useState<string>(p.mode || 'bounds')
  const [lower, setLower] = useState<string>(show(p.lower ?? -1))
  const [upper, setUpper] = useState<string>(show(p.upper ?? 1))
  const [absTol, setAbsTol] = useState<string>(show(p.absTol ?? 1e-6))
  const [relTol, setRelTol] = useState<string>(show(p.relTol ?? 0))
  const [checkFrom, setCheckFrom] = useState<string>(show(p.checkFrom ?? 0))
  const [checkUntil, setCheckUntil] = useState<string>(show(p.checkUntil))
  const [onFailure, setOnFailure] = useState<string>(p.onFailure || 'record')
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    const num = (label: string, text: string, opts: { optional?: boolean; nonNegative?: boolean } = {}) => {
      const v = parseOptionalNumber(text)
      if (v === null) {
        if (opts.optional) return null
        throw new Error(`${label}: enter a number`)
      }
      if (Number.isNaN(v)) throw new Error(`${label}: enter a number${opts.optional ? ' or leave it blank' : ''}`)
      if (opts.nonNegative && v < 0) throw new Error(`${label} must be ≥ 0`)
      return v
    }
    try {
      // Keep the other modes' values so switching back restores them
      const params: Record<string, any> = { ...p, mode, onFailure }
      if (mode === 'bounds') {
        params.lower = num('Lower bound', lower, { optional: true })
        params.upper = num('Upper bound', upper, { optional: true })
        if (params.lower !== null && params.upper !== null && params.lower > params.upper) {
          throw new Error('Lower bound must not exceed the upper bound')
        }
      } else if (mode === 'near') {
        params.absTol = num('Absolute tolerance', absTol, { nonNegative: true })
        params.relTol = num('Relative tolerance', relTol, { nonNegative: true })
      }
      params.checkFrom = num('Check from', checkFrom, { nonNegative: true })
      params.checkUntil = num('Check until', checkUntil, { optional: true, nonNegative: true })
      if (params.checkUntil !== null && params.checkUntil < params.checkFrom) {
        throw new Error('Check until must not be before Check from')
      }
      onUpdate(params)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal opened={true} onClose={onClose} title={`Configure Assert: ${block.name}`} size="md" centered>
      <Stack gap="md">
        {error && (
          <Alert icon={<IconInfoCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        )}

        <Text size="sm" c="dimmed">
          Checks its input at every time step of a run and records whether it ever failed. Vectors and
          matrices are checked element by element. Asserts are left out of exported C code unless
          OBLIQ_ASSERTS is defined.
        </Text>

        <Select
          label="Check"
          value={mode}
          onChange={(v) => setMode(v || 'bounds')}
          data={[
            { value: 'bounds', label: 'Within bounds: Lower ≤ u ≤ Upper' },
            { value: 'near', label: 'Near expected: |u − expected| ≤ AbsTol + RelTol·|expected|' },
            { value: 'true', label: 'True: u is true or non-zero' },
          ]}
          allowDeselect={false}
        />

        {mode === 'bounds' && (
          <Group grow>
            <TextInput
              label="Lower bound"
              value={lower}
              onChange={(e) => setLower(e.target.value)}
              description="Blank for no lower bound"
            />
            <TextInput
              label="Upper bound"
              value={upper}
              onChange={(e) => setUpper(e.target.value)}
              description="Blank for no upper bound"
            />
          </Group>
        )}

        {mode === 'near' && (
          <Group grow>
            <TextInput
              label="Absolute tolerance"
              value={absTol}
              onChange={(e) => setAbsTol(e.target.value)}
            />
            <TextInput
              label="Relative tolerance"
              value={relTol}
              onChange={(e) => setRelTol(e.target.value)}
              description="Fraction of |expected|"
            />
          </Group>
        )}

        <Group grow>
          <TextInput
            label="Check from (s)"
            value={checkFrom}
            onChange={(e) => setCheckFrom(e.target.value)}
          />
          <TextInput
            label="Check until (s)"
            value={checkUntil}
            onChange={(e) => setCheckUntil(e.target.value)}
            description="Blank for the end of the run"
          />
        </Group>

        <Select
          label="On failure"
          value={onFailure}
          onChange={(v) => setOnFailure(v || 'record')}
          data={[
            { value: 'record', label: 'Record and continue' },
            { value: 'stop', label: 'Stop the simulation' },
          ]}
          allowDeselect={false}
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  )
}

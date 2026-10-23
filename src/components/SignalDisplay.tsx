// components/SignalDisplay.tsx

'use client'

import { useMemo, useState } from 'react'
import { Modal, NumberInput, Button, Stack, Group, Alert } from '@mantine/core'
import { useMantineColorScheme } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'
import SignalPlot from './SignalPlot'
import {
  DARK_PLOT_THEME,
  LIGHT_PLOT_THEME,
  plotYRange,
  resultsToColumns,
  signalToColumns,
} from '@/lib/plots/signalPlot'

interface SignalDisplayProps {
  block: BlockData
  /** Samples as { time, value } objects */
  signalData?: { time: number; value: number | number[] | boolean | boolean[] }[]
  /**
   * Or the results' shared time points and this block's values. Preferred:
   * these arrays keep their identity between renders, so the plot is only
   * rebuilt when a run produces new results.
   */
  timePoints?: number[]
  values?: Array<number | number[] | boolean | boolean[]>
  isRunning?: boolean
}

const NO_SAMPLES: NonNullable<SignalDisplayProps['signalData']> = []

export default function SignalDisplay({ block, signalData = NO_SAMPLES, timePoints, values, isRunning = false }: SignalDisplayProps) {
  const { colorScheme } = useMantineColorScheme()
  const theme = colorScheme === 'dark' ? DARK_PLOT_THEME : LIGHT_PLOT_THEME
  const maxSamples = block.parameters?.maxSamples || 1000

  // Results to plot columns (the last maxSamples samples)
  const columns = useMemo(
    () => (timePoints && values ? resultsToColumns(timePoints, values, maxSamples) : signalToColumns(signalData, maxSamples)),
    [timePoints, values, signalData, maxSamples]
  )
  const count = columns.times.length

  const ariaLabel = useMemo(() => {
    if (count === 0) return `${block.name}: no data`
    const [lo, hi] = plotYRange(columns.series)
    const what = columns.isVector ? `${columns.series.length}-element vector` : 'signal'
    return `${block.name}: ${what}, ${count} samples from ${columns.times[0]!.toFixed(2)} s to ${columns.times[count - 1]!.toFixed(2)} s, values about ${lo.toPrecision(3)} to ${hi.toPrecision(3)}`
  }, [block.name, columns, count])

  return (
    <div
      className="rounded-lg shadow-md p-4"
      style={{ backgroundColor: theme.background }}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium" style={{ color: theme.text }}>{block.name}</h3>
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Recording
            </span>
          )}
          <span className="text-xs" style={{ color: theme.textMuted }}>
            {count} / {maxSamples} samples
          </span>
        </div>
      </div>

      <SignalPlot columns={columns} theme={theme} height={256} ariaLabel={ariaLabel} />

      {columns.isVector && (
        <div className="mt-2 text-xs" style={{ color: theme.textMuted }}>
          Displaying {columns.series.length} vector elements. Click an element in the legend to hide or show it; drag across the plot to zoom in time, double-click to reset.
        </div>
      )}
      {!columns.isVector && count > 0 && (
        <div className="mt-2 text-xs" style={{ color: theme.textMuted }}>
          Drag across the plot to zoom in time; double-click to reset.
        </div>
      )}
    </div>
  )
}

// Configuration component for Signal Display blocks
interface SignalDisplayConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export function SignalDisplayConfig({ block, onUpdate, onClose }: SignalDisplayConfigProps) {
  const [maxSamples, setMaxSamples] = useState(block.parameters?.maxSamples || 1000)

  const handleSave = () => {
    onUpdate({ maxSamples })
    onClose()
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Signal Display: ${block.name}`}
      centered
    >
      <Stack gap="md">
        <NumberInput
          label="Maximum Samples"
          value={maxSamples}
          onChange={(val) => setMaxSamples(typeof val === 'number' ? val : 1000)}
          min={10}
          max={10000}
          description="Number of data points to display (10-10000)"
        />

        <Alert variant="light" color="blue" icon={<IconInfoCircle />} title="Signal Display">
          Shows real-time signal values during simulation.
          Vector signals will be displayed as multiple lines with different colors.
        </Alert>

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
'use client'

import { Tooltip } from '@mantine/core'
import { IconCheck, IconX, IconMinus } from '@tabler/icons-react'
import { useModelStore } from '@/lib/modelStore'
import { formatSimTime } from '@/lib/simulation/assertResults'

/**
 * Pass/fail mark in the corner of an Assert block after a run. Faded once the
 * model has changed since that run.
 */
export default function AssertStatusBadge({ blockId }: { blockId: string }) {
  const result = useModelStore(s => s.testResults?.results.find(r => r.blockId === blockId))
  const stale = useModelStore(s => s.testResults?.stale ?? false)
  if (!result) return null

  const failed = result.status === 'failed'
  const passed = result.status === 'passed'
  const color = failed ? '#e03131' : passed ? '#2f9e44' : '#868e96'
  const Icon = failed ? IconX : passed ? IconCheck : IconMinus
  const label = failed
    ? `Failed: first at t = ${formatSimTime(result.firstFailTime ?? 0)} s, ${result.failures} of ${result.checks} steps`
    : passed
      ? `Passed: ${result.checks} steps checked`
      : 'Not checked: no step fell inside the check window'

  return (
    <Tooltip label={stale ? `${label} (last run; the model has changed since)` : label} withArrow>
      <div
        aria-label={label}
        style={{
          position: 'absolute',
          top: -9,
          right: -9,
          width: 18,
          height: 18,
          borderRadius: 9,
          background: color,
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: stale ? 0.4 : 1,
          zIndex: 5,
        }}
      >
        <Icon size={12} stroke={3} />
      </div>
    </Tooltip>
  )
}

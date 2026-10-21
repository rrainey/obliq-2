'use client'

import { useState } from 'react'
import { Alert, Badge, Button, Modal, Stack, Table, Text, Tooltip } from '@mantine/core'
import { IconAlertTriangle, IconChecklist } from '@tabler/icons-react'
import { useModelStore } from '@/lib/modelStore'
import type { Sheet } from '@/lib/simulationTypes'
import { AssertResult, formatSimTime, summarizeAsserts } from '@/lib/simulation/assertResults'

interface TestResultsButtonProps {
  iconOnly?: boolean
  /** Select and show a block, switching sheets if needed */
  onNavigate: (target: { blockId: string; sheetId?: string }) => void
}

/** Id of the sheet (at any depth) holding a block. */
export function findSheetOfBlock(sheets: Sheet[], blockId: string): string | undefined {
  for (const sheet of sheets) {
    for (const block of sheet.blocks) {
      if (block.id === blockId) return sheet.id
      const nested = block.parameters?.sheets
      if (Array.isArray(nested)) {
        const found = findSheetOfBlock(nested as Sheet[], blockId)
        if (found) return found
      }
    }
  }
  return undefined
}

const STATUS_BADGE: Record<AssertResult['status'], { color: string; label: string }> = {
  failed: { color: 'red', label: 'Failed' },
  passed: { color: 'green', label: 'Passed' },
  not_checked: { color: 'gray', label: 'Not checked' },
}

const ORDER: Record<AssertResult['status'], number> = { failed: 0, not_checked: 1, passed: 2 }

function firstFailure(r: AssertResult): string {
  if (r.firstFailTime === null) return '—'
  const index = r.firstFailIndex !== null ? ` [${r.firstFailIndex}]` : ''
  const value = r.firstFailValue === null ? '' : `, value${index} ${Number(r.firstFailValue.toPrecision(6))}`
  return `t = ${formatSimTime(r.firstFailTime)} s${value}`
}

/**
 * "Tests: N passed, M failed" after a run of a model with Assert blocks, opening
 * a panel that lists each Assert. Hidden when the last run had none.
 */
export default function TestResultsButton({ iconOnly, onNavigate }: TestResultsButtonProps) {
  const testResults = useModelStore(s => s.testResults)
  const [open, setOpen] = useState(false)
  if (!testResults || testResults.results.length === 0) return null

  const { results, stoppedBy, stale } = testResults
  const sum = summarizeAsserts(results)
  const color = stale ? 'gray' : sum.failed > 0 ? 'red' : sum.notChecked > 0 ? 'yellow' : 'green'
  const text = `Tests: ${sum.passed} passed, ${sum.failed} failed` + (sum.notChecked > 0 ? `, ${sum.notChecked} not checked` : '')
  const sorted = [...results].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.qualifiedName.localeCompare(b.qualifiedName))

  const go = (blockId: string) => {
    setOpen(false)
    onNavigate({ blockId, sheetId: findSheetOfBlock(useModelStore.getState().sheets, blockId) })
  }

  return (
    <>
      <Tooltip label={stale ? `${text} (last run; the model has changed since)` : text}>
        <Button
          variant="light"
          color={color}
          leftSection={<IconChecklist size={16} />}
          onClick={() => setOpen(true)}
          aria-label={text}
        >
          {iconOnly ? `${sum.passed}/${results.length}` : `${sum.passed}/${results.length} passed`}
        </Button>
      </Tooltip>

      <Modal opened={open} onClose={() => setOpen(false)} title="Test Results" size="xl" centered>
        <Stack gap="sm">
          <Text size="sm">{text}</Text>
          {stale && (
            <Alert color="gray" variant="light" icon={<IconAlertTriangle size={16} />}>
              These results are from the last run. The model has changed since; run it again to update them.
            </Alert>
          )}
          {stoppedBy && (
            <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
              The run stopped at t = {formatSimTime(stoppedBy.time)} s when Assert &ldquo;{stoppedBy.name}&rdquo; failed.
              Later steps were not run.
            </Alert>
          )}
          <Table highlightOnHover striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Status</Table.Th>
                <Table.Th>Assert</Table.Th>
                <Table.Th>First failure</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Failed / checked steps</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Worst violation</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sorted.map(r => (
                <Table.Tr
                  key={r.blockId || r.qualifiedName}
                  onClick={() => r.blockId && go(r.blockId)}
                  style={{ cursor: r.blockId ? 'pointer' : undefined }}
                  title="Show this block"
                >
                  <Table.Td>
                    <Badge color={STATUS_BADGE[r.status].color} variant="light">
                      {STATUS_BADGE[r.status].label}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={500}>{r.name}</Text>
                    {r.qualifiedName !== r.name && (
                      <Text size="xs" c="dimmed">{r.qualifiedName}</Text>
                    )}
                  </Table.Td>
                  <Table.Td><Text size="sm">{firstFailure(r)}</Text></Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}><Text size="sm">{r.failures} / {r.checks}</Text></Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>
                    <Text size="sm">{r.failures > 0 ? Number(r.worstViolation.toPrecision(4)) : '—'}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      </Modal>
    </>
  )
}

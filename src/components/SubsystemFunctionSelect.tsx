// components/SubsystemFunctionSelect.tsx
'use client'

// The "Subsystem Function" field of the subsystem and model reference dialogs.
// The value is the `subsystemFunction` parameter (subsystemRole.ts). The
// empty choice shows the function that the rules suggest.

import { useMemo } from 'react'
import { Select } from '@mantine/core'
import type { BlockData } from './BlockNode'
import type { WireData } from './Wire'
import {
  SUBSYSTEM_FUNCTIONS,
  SUBSYSTEM_FUNCTION_LABELS,
  ROLE_CONFIDENCE_THRESHOLD,
  sheetSubsystemRoles,
  isSubsystemFunction,
  type DefinitionLookup,
  type SubsystemFunction,
} from '@/lib/layout/subsystemRole'

const NOT_SET = 'not_set'

interface SubsystemFunctionSelectProps {
  block: BlockData
  /** The blocks and wires of the sheet that holds the block, for the suggestion. */
  sheetBlocks: BlockData[]
  sheetWires: WireData[]
  /** Finds the definition of a subsystem reference. Default: the sheet's blocks. */
  lookup?: DefinitionLookup
  value: SubsystemFunction | null
  onChange: (value: SubsystemFunction | null) => void
}

export default function SubsystemFunctionSelect({
  block, sheetBlocks, sheetWires, lookup, value, onChange,
}: SubsystemFunctionSelectProps) {
  // The suggestion ignores the stored value of this block, so that the empty
  // choice always shows what the rules give
  const suggestion = useMemo(() => {
    const blocks = sheetBlocks.some(b => b.id === block.id) ? sheetBlocks : [...sheetBlocks, block]
    const unset = blocks.map(b => (b.id === block.id
      ? { ...b, parameters: { ...(b.parameters || {}), subsystemFunction: undefined } }
      : b))
    return sheetSubsystemRoles(unset, sheetWires, lookup ? { lookup } : {}).get(block.id)?.suggestion ?? null
  }, [block, sheetBlocks, sheetWires, lookup])

  const confident = !!suggestion?.role && suggestion.confidence >= ROLE_CONFIDENCE_THRESHOLD
  const notSetLabel = confident
    ? `Not set (suggested: ${SUBSYSTEM_FUNCTION_LABELS[suggestion!.role!]})`
    : 'Not set (no suggestion)'
  const description = value
    ? 'The layout uses this value for the left-to-right order of a control loop. Simulation and code generation do not use it.'
    : confident
      ? `The layout uses the suggestion (confidence ${Math.round(suggestion!.confidence * 100)} %): ${suggestion!.reasons.join('; ')}.`
      : 'The layout does not use a function for this subsystem. Set one to put a control loop in order: controller, actuator, plant.'

  return (
    <Select
      label="Subsystem Function"
      value={value ?? NOT_SET}
      onChange={v => onChange(isSubsystemFunction(v) ? v : null)}
      data={[
        { value: NOT_SET, label: notSetLabel },
        ...SUBSYSTEM_FUNCTIONS.map(f => ({ value: f, label: SUBSYSTEM_FUNCTION_LABELS[f] })),
      ]}
      description={description}
      allowDeselect={false}
    />
  )
}

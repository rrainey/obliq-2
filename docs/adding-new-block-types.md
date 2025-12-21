# Adding New Block Types to Obliq

This document describes the complete process for adding a new block type to Obliq. It covers all the files that need to be created or modified across the main application, model builder APIs, and MCP server.

## Overview

Adding a new block type requires modifications to multiple files across three main areas:

1. **Main Application & UI** - Block module, registry, library sidebar, visual rendering
2. **Code Generation & Validation** - Type propagation, validation, C code generation
3. **MCP Server** - Block type documentation for AI assistants

---

## Part 1: Main Application & UI

### 1.1 Create the Block Module 

This module in `src/lib/blocks` implements aspects of signal data type proagation and is the principal module defining code generation.

**File:** `src/lib/blocks/{BlockName}BlockModule.ts`

Create a new file implementing the `IBlockModule` interface:

```typescript
// lib/blocks/UnitsConversionBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class UnitsConversionBlockModule implements IBlockModule {

  generateComputation(block: BlockData, inputs: string[], inputTypes?: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    // Generate C code for the block's computation
    return `    ${outputName} = ${inputs[0]} * factor;\n`
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Return the output type based on input types
    if (inputTypes.length === 0) {
      return 'double' // Default type
    }
    return inputTypes[0]
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    return false // Set true if block needs state variables
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    return [] // Return state struct members in header file if needed
  }

  generateInitialization(block: BlockData): string {
    return '' // Return initialization C code if needed
  }

  getInputPortCount(block: BlockData): number {
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    return 1
  }

  getInputPortLabels(block: BlockData): string[] | undefined {
    return ['in']
  }

  getOutputPortLabels(block: BlockData): string[] | undefined {
    return ['out']
  }
}
```

### 1.2 Register in Block Module Factory

**File:** `src/lib/blocks/BlockModuleFactory.ts`

#### Add import (around line 29):
```typescript
import { UnitsConversionBlockModule } from './UnitsConversionBlockModule'
```

#### Add case in createInstance() switch (around line 160):
```typescript
case 'units_conversion':
  return new UnitsConversionBlockModule()
```

#### Add to getSupportedBlockTypes() array (around line 207):
```typescript
static getSupportedBlockTypes(): string[] {
  return [
    'sum',
    'multiply',
    // ... other types ...
    'units_conversion'  // Add new type here
  ]
}
```

### 1.3 Register in Block Type Registry

**File:** `src/lib/blockTypeRegistry.ts`

#### Add to BlockTypes enum (around line 72):
```typescript
export const BlockTypes = {
  // ... existing types ...

  // Aerospace blocks
  ORIENTATION_CONVERSION: 'orientation_conversion',
  UNITS_CONVERSION: 'units_conversion',  // Add new constant

  // ... rest of types ...
} as const;
```

#### Add registry entry (around line 515):
```typescript
[BlockTypes.UNITS_CONVERSION]: {
  type: BlockTypes.UNITS_CONVERSION,
  displayName: 'Units Conversion',
  category: 'Aerospace',
  defaultParameters: {
    conversionType: 'deg_to_rad',
    category: 'angle'
  },
  inputs: [{ name: 'input' }],
  outputs: [{ name: 'output' }],
  description: 'Converts between SI and American/Imperial engineering units'
},
```

### 1.4 Add to Block Library Sidebar

**File:** `src/components/BlockLibrarySidebar.tsx`

Add entry to the `BLOCK_LIBRARY` array (around line 271):

```typescript
{
  id: 'units_conversion',
  name: 'Units Conversion',
  category: 'Aerospace',
  description: 'Convert between SI and American/Imperial engineering units',
  icon: 'U',
  vectorSupport: 'full'  // 'full', 'partial', or 'scalar'
},
```

### 1.5 Add Visual Rendering (Optional)

**File:** `src/components/BlockNode.tsx`

If the block needs special visual rendering on its face (like showing the conversion type):

#### Add display logic in getBlockSymbol() (around line 390):
```typescript
// Handle units conversion block - display the conversion label
if (data.type === 'units_conversion') {
  const convType: string = data.parameters?.conversionType || 'deg_to_rad'
  const convDisplay: Record<string, string> = {
    'deg_to_rad': 'deg→rad',
    'rad_to_deg': 'rad→deg',
    // ... all conversion display labels ...
  }
  return (
    <div className="text-xs font-mono">
      { convDisplay[convType] || convType }
    </div>
  )
}
```

#### Add fallback symbol (around line 416):
```typescript
const symbols: Record<string, string> = {
  // ... existing symbols ...
  'units_conversion': 'Units', // Fallback for units conversion
}
```

### 1.6 Add Configuration Dialog (If Needed)

**File:** `src/components/{BlockName}Config.tsx`

Create a configuration component if the block has configurable parameters:

```typescript
// components/UnitsConversionConfig.tsx

'use client'

import { useState } from 'react'
import { Modal, Select, Button, Stack, Group } from '@mantine/core'
import { BlockData } from './BlockNode'

interface UnitsConversionConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function UnitsConversionConfig({
  block,
  onUpdate,
  onClose
}: UnitsConversionConfigProps) {
  const [conversionType, setConversionType] = useState(
    block?.parameters?.conversionType || 'deg_to_rad'
  )

  const handleSave = () => {
    onUpdate({ conversionType })
    onClose()
  }

  return (
    <Modal opened={true} onClose={onClose} title="Configure Block">
      <Stack gap="md">
        <Select
          label="Conversion Type"
          value={conversionType}
          onChange={(val) => setConversionType(val || 'deg_to_rad')}
          data={[/* options */]}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
```

#### Register in page.tsx (around line 42, 1332, 2025):

```typescript
// Import
import UnitsConversionConfig from '@/components/UnitsConversionConfig'

// Add to configurable block list
const configurableBlocks = [
  // ... existing ...
  'units_conversion'
]

// Add rendering
{configuringBlock?.type === 'units_conversion' && (
  <UnitsConversionConfig
    block={configuringBlock}
    onUpdate={handleBlockParameterUpdate}
    onClose={() => setConfiguringBlock(null)}
  />
)}
```

---

## Part 2: Code Generation & Validation

### 2.1 Add to Signal Type Propagation

**File:** `src/lib/signalTypePropagation.ts`

This file requires updates in **5 locations**:

#### Location 1: getBlockInitialOutputType() switch (around line 73):
```typescript
case 'sum':
case 'multiply':
case 'scale':
case 'limit':
case 'integrator':
case 'units_conversion':  // Add here
case 'transfer_function':
  // These blocks output type depends on their inputs
  return null
```

#### Location 2: determineProcessingBlockOutputType() switch (around line 191):
```typescript
case 'scale':
case 'limit':
case 'integrator':
case 'units_conversion':  // Add here
  // Output type matches input type
  return typeToString(parsedTypes[0])
```

#### Location 3: getBlockOutputPortCount() switch (around line 1516):
```typescript
case 'sum':
case 'multiply':
case 'scale':
case 'limit':
case 'integrator':
case 'units_conversion':  // Add here
case 'transfer_function':
  return 1
```

#### Location 4: getBlockInputPortCount() switch (around line 1579):
```typescript
case 'scale':
case 'limit':
case 'units_conversion':  // Add here
case 'transfer_function':
  return 1
```

#### Location 5: getMultiSheetBlockOutputType() switch (around line 1837):
```typescript
case 'limit':
case 'integrator':
case 'units_conversion':  // Add here
case 'transfer_function':
  // Process each element independently
  return parsedInputs.length > 0 ? typeToString(parsedInputs[0]) : null
```

---

## Part 3: MCP Server

### 3.1 Document Block Type

**File:** `mcp-server/src/tools/block-types.ts`

Add comprehensive documentation in the `BLOCK_TYPES` array (around line 715):

```typescript
{
  type: 'units_conversion',
  displayName: 'Units Conversion',
  category: 'Aerospace',
  description: 'Converts between SI and American/Imperial engineering units. Select a category first, then choose the specific conversion.',
  parameters: {
    category: {
      type: 'string',
      description: 'Unit category',
      default: 'angle',
      enum: [
        'angle',
        'temperature',
        'length',
        'velocity',
        // ... all categories
      ]
    },
    conversionType: {
      type: 'string',
      description: 'Specific conversion to perform. Available conversions depend on category:\n' +
        '  angle: deg_to_rad, rad_to_deg, rev_to_rad, rev_to_deg\n' +
        '  temperature: c_to_f, f_to_c, c_to_k, k_to_c\n' +
        // ... all conversions by category
      default: 'deg_to_rad',
      enum: [
        // All conversion types
        'deg_to_rad', 'rad_to_deg', 'rev_to_rad', 'rev_to_deg',
        'c_to_f', 'f_to_c', 'c_to_k', 'k_to_c',
        // ... etc
      ]
    }
  },
  inputs: ['input'],
  outputs: ['output']
},
```

---

## Summary Checklist

### New Block Implementation Checklist

| Step | File | Action |
|------|------|--------|
| 1 | `src/lib/blocks/{Name}BlockModule.ts` | Create block module |
| 2 | `src/lib/blocks/BlockModuleFactory.ts` | Add import |
| 3 | `src/lib/blocks/BlockModuleFactory.ts` | Add switch case |
| 4 | `src/lib/blocks/BlockModuleFactory.ts` | Add to getSupportedBlockTypes() |
| 5 | `src/lib/blockTypeRegistry.ts` | Add to BlockTypes enum |
| 6 | `src/lib/blockTypeRegistry.ts` | Add registry entry |
| 7 | `src/components/BlockLibrarySidebar.tsx` | Add to BLOCK_LIBRARY |
| 8 | `src/components/BlockNode.tsx` | Add visual rendering (optional) |
| 9 | `src/components/{Name}Config.tsx` | Create config dialog (optional) |
| 10 | `src/app/models/[id]/page.tsx` | Register config dialog (optional) |
| 11 | `src/lib/signalTypePropagation.ts` | Location 1: getBlockInitialOutputType() |
| 12 | `src/lib/signalTypePropagation.ts` | Location 2: determineProcessingBlockOutputType() |
| 13 | `src/lib/signalTypePropagation.ts` | Location 3: getBlockOutputPortCount() |
| 14 | `src/lib/signalTypePropagation.ts` | Location 4: getBlockInputPortCount() |
| 15 | `src/lib/signalTypePropagation.ts` | Location 5: getMultiSheetBlockOutputType() |
| 16 | `mcp-server/src/tools/block-types.ts` | Add MCP documentation |

### Quick Reference: Block Type Categories

When adding blocks, use one of these categories:
- `Sources` - Signal generators (source, input_port)
- `Sinks` - Signal consumers (output_port, signal_display, signal_logger)
- `Arithmetic` - Math operations (sum, multiply, scale, abs, uminus)
- `Control` - Control flow (if, condition, limit)
- `Matrix` - Matrix operations (matrix_multiply, transpose, mux, demux)
- `Vector` - Vector operations (mag, cross, dot)
- `Trig` - Trigonometric functions (trig)
- `Lookup` - Table lookups (lookup_1d, lookup_2d)
- `Transfer Functions` - Dynamic systems (transfer_function, integrator)
- `Aerospace` - Domain-specific (orientation_conversion, units_conversion)
- `Annotation` - Documentation (comment)
- `Connectivity` - Signal routing (sheet_label_sink, sheet_label_source, subsystem)

---

This highlights the importance of verifying all registration points when troubleshooting block-related issues.

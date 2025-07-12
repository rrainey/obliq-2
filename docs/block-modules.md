# Block Module System

## Overview

The block module system provides a unified interface for all block-specific behavior in the obliq-2 application. Each block type has a corresponding module that implements the `IBlockModule` interface, centralizing code generation, simulation execution, and port management.

## Architecture

### Core Interface

All block modules implement the `IBlockModule` interface defined in `lib/blocks/BlockModule.ts`:

```typescript
interface IBlockModule {
  // Code generation methods
  generateComputation(block: BlockData, inputs: string[]): string
  getOutputType(block: BlockData, inputTypes: string[]): string
  generateStructMember(block: BlockData, outputType: string): string | null
  requiresState(block: BlockData): boolean
  generateStateStructMembers(block: BlockData, outputType: string): string[]
  generateInitialization?(block: BlockData): string
  
  // Simulation execution
  executeSimulation(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void
  
  // Port management
  getInputPortCount(block: BlockData): number
  getOutputPortCount(block: BlockData): number
  getInputPortLabels?(block: BlockData): string[] | undefined
  getOutputPortLabels?(block: BlockData): string[] | undefined
}
```

### Factory Pattern

The `BlockModuleFactory` manages singleton instances of all block modules:

```typescript
const module = BlockModuleFactory.getBlockModule('sum')
```

### Adapter Pattern

Two adapter classes provide clean interfaces to the rest of the application:

1. **BlockSimulationAdapter** - Delegates simulation execution
2. **PortCountAdapter** - Provides port count and label information

## Adding a New Block Type

To add a new block type, follow these steps:

### 1. Create the Module

Create a new file `lib/blocks/MyNewBlockModule.ts`:

```typescript
import { IBlockModule, BlockModuleUtils } from './BlockModule'

export class MyNewBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    const outputName = `model->signals.${BlockModuleUtils.sanitizeIdentifier(block.name)}`
    // Generate C code for computation
    return `    ${outputName} = /* your computation */;\n`
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // Return the C type of the output
    return 'double'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // Return struct member declaration if needed
    return BlockModuleUtils.generateStructMember(block.name, outputType)
  }

  requiresState(block: BlockData): boolean {
    // Return true if block needs state variables
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    // Return array of state struct members if needed
    return []
  }

  executeSimulation(
    blockState: BlockState,
    inputs: (number | number[] | boolean | boolean[] | number[][])[],
    simulationState: SimulationState
  ): void {
    // Implement simulation logic
    const result = /* compute result */
    blockState.outputs[0] = result
  }

  getInputPortCount(block: BlockData): number {
    // Return number of input ports
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    // Return number of output ports
    return 1
  }

  /**
   * Is this a direct feedthrough block? (optional; assumed to be 'true' if the 
   * function is undefined for a given Block).
   * This indicates that the block's output can be computed directly from its inputs
   * without needing to store state or perform integration.
   * This can be called during block execution order analysis to help identify algebraic
   * loops in a model.
   * @param block - The block data containing parameters
   * @returns Array of port labels or undefined to use default numbering
   */
  isDirectFeedthrough?(block: BlockData): boolean {
    return true
  }
}
```

### 2. Register in Factory

Add your block to `BlockModuleFactory.ts`:

```typescript
case 'my_new_block':
  return new MyNewBlockModule()
```

### 3. Add to Supported Types

Update the `getSupportedBlockTypes()` array to include your block type.

### 4. Add UI Components

Create the visual representation in `BlockLibrarySidebar` and any custom rendering logic.

## Dynamic Ports

Some blocks support dynamic port counts based on parameters:

### Mux Block
- Input ports = rows × columns
- Configured via `parameters.rows` and `parameters.cols`

### Demux Block
- Output ports determined by input signal dimensions
- Updates dynamically during simulation

### Subsystem Block
- Input/output ports based on `parameters.inputPorts` and `parameters.outputPorts`
- Optional enable port when `parameters.showEnableInput` is true

## Port Labels

Blocks can provide custom port labels by implementing the optional methods:

```typescript
getInputPortLabels?(block: BlockData): string[] | undefined {
  // Return array of labels matching port count
  return ['X', 'Y', 'Z']
}
```

Examples:
- **Demux**: Shows position labels like "row1_col2"
- **Subsystem**: Shows configured port names

## Utility Functions

The `BlockModuleUtils` class provides common functions:

- `sanitizeIdentifier(name)` - Convert to valid C identifier
- `parseType(typeString)` - Parse C type strings
- `generateStructMember(name, type)` - Generate struct declarations
- `generateElementWiseOperation(...)` - Generate loops for vector/matrix ops

## Testing

Each block module should have comprehensive tests covering:

1. Code generation for all input type combinations
2. Simulation behavior for edge cases
3. Port count calculations
4. Type propagation rules

Example test structure:

```typescript
describe('MyNewBlockModule', () => {
  let module: MyNewBlockModule
  
  beforeEach(() => {
    module = new MyNewBlockModule()
  })
  
  describe('generateComputation', () => {
    it('should generate correct code for scalar inputs', () => {
      // Test implementation
    })
  })
  
  describe('executeSimulation', () => {
    it('should compute correct output', () => {
      // Test implementation
    })
  })
})
```

## Best Practices

1. **Type Safety**: Always validate input types in simulation
2. **Error Handling**: Provide clear error messages for invalid inputs
3. **Performance**: Use utility functions for common operations
4. **Consistency**: Follow naming patterns from existing modules
5. **Documentation**: Include JSDoc comments for complex logic
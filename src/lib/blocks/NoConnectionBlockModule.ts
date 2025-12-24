// lib/blocks/NoConnectionBlockModule.ts

import { BlockData } from '@/components/BlockNode'
import { IBlockModule } from './BlockModule'

/**
 * No Connection Block Module
 *
 * This block serves as a marker to indicate that an output signal is intentionally
 * unused. It has no effect in the simulation - it simply documents that the signal
 * is not needed elsewhere in the model.
 *
 * Connection Rules:
 * - When an output is connected to a "No Connection" block, no other connections
 *   can be made from that output.
 * - Attempting to add connections to an output already connected to "No Connection"
 *   should generate an error.
 *
 * This block generates no code in the output.
 */
export class NoConnectionBlockModule implements IBlockModule {
  generateComputation(block: BlockData, inputs: string[]): string {
    // No Connection blocks don't generate any code
    // They are only markers for unused signals
    return `    // No Connection: ${block.name} (signal intentionally unused)\n`
  }

  getOutputType(block: BlockData, inputTypes: string[]): string {
    // No Connection blocks have no outputs
    return 'void'
  }

  generateStructMember(block: BlockData, outputType: string): string | null {
    // No Connection blocks don't need signal storage
    return null
  }

  requiresState(block: BlockData): boolean {
    // No Connection blocks don't need state
    return false
  }

  generateStateStructMembers(block: BlockData, outputType: string): string[] {
    return []
  }

  generateInitialization(block: BlockData): string {
    return ''
  }

  getInputPortCount(block: BlockData): number {
    // No Connection blocks have exactly 1 input
    return 1
  }

  getOutputPortCount(block: BlockData): number {
    // No Connection blocks have no outputs (they are sinks)
    return 0
  }

  getInputPortLabels?(block: BlockData): string[] | undefined {
    return undefined
  }

  getOutputPortLabels?(block: BlockData): string[] | undefined {
    return undefined
  }
}

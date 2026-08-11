/**
 * Resolve C signals-struct member name for a block output port.
 * Multi-output blocks (atmosphere, orientation euler, etc.) use name_suffix.
 */

import { BlockData } from '@/components/BlockNode'
import { BlockModuleFactory } from '@/lib/blocks/BlockModuleFactory'
import { CCodeBuilder } from '@/lib/codegen/CCodeBuilder'

/**
 * @param blockName - Block display/flattened name used for signal naming
 * @param blockType - Block type string
 * @param portIndex - Output port index (0-based)
 * @param block - Optional full block data (needed for dynamic labels/port counts)
 */
export function getSignalMemberName(
  blockName: string,
  blockType: string,
  portIndex: number = 0,
  block?: BlockData
): string {
  const safeName = CCodeBuilder.sanitizeIdentifier(blockName)

  try {
    if (!BlockModuleFactory.isSupported(blockType)) {
      return safeName
    }
    const mod = BlockModuleFactory.getBlockModule(blockType)
    const stub: BlockData =
      block ||
      ({
        id: 'tmp',
        name: blockName,
        type: blockType,
        position: { x: 0, y: 0 },
        parameters: {},
      } as BlockData)

    const nOut = mod.getOutputPortCount(stub)
    if (nOut <= 1) {
      return safeName
    }

    // Orientation euler multi-out uses fixed suffixes (not full labels)
    if (blockType === 'orientation_conversion') {
      const eulerSuffix = ['phi', 'theta', 'psi']
      return `${safeName}_${eulerSuffix[portIndex] ?? portIndex}`
    }

    const labels = mod.getOutputPortLabels?.(stub)
    if (labels && labels[portIndex] !== undefined) {
      const suffix = CCodeBuilder.sanitizeIdentifier(labels[portIndex])
      return `${safeName}_${suffix}`
    }

    return `${safeName}_${portIndex}`
  } catch {
    return safeName
  }
}

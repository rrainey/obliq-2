'use client'

import { Tooltip } from '@mantine/core'
import { useModelStore } from '@/lib/modelStore'
import { isModelReference, modelRefOf } from '@/lib/modelReferences'
import { modelRefKey } from '@/lib/referencedModels'
import type { BlockData } from './BlockNode'

/**
 * Corner badge on a model reference block: which version it uses ("latest",
 * "v3"), whether a newer version exists, and whether the model is missing.
 */
export default function ModelReferenceBadge({ data }: { data: BlockData }) {
  const ref = modelRefOf(data)
  const entry = useModelStore(s => (ref ? s.referencedModels[modelRefKey(ref)] : undefined))
  if (!isModelReference(data)) return null

  const name = entry?.name || data.parameters?.modelRefName
  let text: string
  let color: string
  let tip: string
  if (!ref) {
    text = 'no model'
    color = '#868e96'
    tip = 'No model chosen: open the block’s properties to choose one'
  } else if (!entry || entry.status === 'loading') {
    text = ref.version ? `v${ref.version}` : 'latest'
    color = '#868e96'
    tip = `Loading ${name || 'model'}…`
  } else if (entry.status === 'missing') {
    text = 'missing'
    color = '#e03131'
    tip = `Model ${name ? `"${name}" ` : ''}${ref.version ? `version ${ref.version} ` : ''}not found. Choose another model in the block’s properties.`
  } else if (entry.status === 'error') {
    text = 'error'
    color = '#e03131'
    tip = entry.error || 'The referenced model could not be loaded'
  } else if (ref.version && entry.latestVersion && entry.latestVersion > ref.version) {
    text = `v${ref.version} · newer`
    color = '#f08c00'
    tip = `${name}: pinned to v${ref.version}; v${entry.latestVersion} is the latest`
  } else {
    text = ref.version ? `v${ref.version}` : 'latest'
    color = '#1c7ed6'
    tip = ref.version ? `${name}, version ${ref.version}` : `${name}, latest save`
  }

  return (
    <Tooltip label={tip} withArrow multiline maw={280}>
      <div
        aria-label={tip}
        style={{
          position: 'absolute',
          top: -9,
          left: 6,
          padding: '0 6px',
          height: 16,
          lineHeight: '16px',
          borderRadius: 8,
          background: color,
          color: 'white',
          fontSize: 10,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          zIndex: 5,
        }}
      >
        {text}
      </div>
    </Tooltip>
  )
}

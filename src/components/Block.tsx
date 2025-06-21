// components/Block.tsx
export interface BlockData {
  id: string
  type: string
  name: string
  position: { x: number; y: number }
  parameters?: Record<string, any>
}

export interface PortInfo {
  blockId: string
  portIndex: number
  isOutput: boolean
}

'use client'

export interface WireData {
  id: string
  sourceBlockId: string
  sourcePortIndex: number
  targetBlockId: string
  targetPortIndex: number
}

interface WireProps {
  wire: WireData
  sourcePosition: { x: number; y: number }
  targetPosition: { x: number; y: number }
  isSelected?: boolean
  onSelect?: (wireId: string) => void
  onDelete?: (wireId: string) => void
}

export default function Wire({
  wire,
  sourcePosition,
  targetPosition,
  isSelected = false,
  onSelect,
  onDelete
}: WireProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onSelect) {
      onSelect(wire.id)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (onDelete) {
        onDelete(wire.id)
      }
    }
  }

  // Calculate control points for smooth Bezier curve
  const dx = targetPosition.x - sourcePosition.x
  const controlOffset = Math.max(50, Math.abs(dx) * 0.3)
  
  const controlPoint1 = {
    x: sourcePosition.x + controlOffset,
    y: sourcePosition.y
  }
  
  const controlPoint2 = {
    x: targetPosition.x - controlOffset,
    y: targetPosition.y
  }

  const pathData = `M ${sourcePosition.x} ${sourcePosition.y} C ${controlPoint1.x} ${controlPoint1.y}, ${controlPoint2.x} ${controlPoint2.y}, ${targetPosition.x} ${targetPosition.y}`

  return (
    <g>
      {/* Background path for easier clicking */}
      <path
        d={pathData}
        stroke="transparent"
        strokeWidth="10"
        fill="none"
        className="cursor-pointer"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      />
      
      {/* Visible wire */}
      <path
        d={pathData}
        stroke={isSelected ? "#3b82f6" : "#374151"}
        strokeWidth={isSelected ? "3" : "2"}
        fill="none"
        className="pointer-events-none"
        strokeDasharray={isSelected ? "5,5" : "none"}
      />
      
      {/* Arrow head at target */}
      <polygon
        points={`${targetPosition.x},${targetPosition.y} ${targetPosition.x - 8},${targetPosition.y - 4} ${targetPosition.x - 8},${targetPosition.y + 4}`}
        fill={isSelected ? "#3b82f6" : "#374151"}
        className="pointer-events-none"
      />
    </g>
  )
}
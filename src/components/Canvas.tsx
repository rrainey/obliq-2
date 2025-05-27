// components/Canvas.tsx 
'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import Block, { BlockData, PortInfo } from './Block'
import Wire, { WireData } from './Wire'
import { validateConnection, validatePortForConnection, detectAlgebraicLoop } from '@/lib/connectionValidation'

interface CanvasProps {
  width?: number
  height?: number
  blocks?: BlockData[]
  wires?: WireData[]
  selectedBlockId?: string | null
  selectedWireId?: string | null
  onDrop?: (x: number, y: number, blockType: string) => void
  onBlockMove?: (id: string, position: { x: number; y: number }) => void
  onBlockSelect?: (id: string | null) => void
  onBlockDoubleClick?: (id: string) => void
  onWireCreate?: (sourcePort: PortInfo, targetPort: PortInfo) => void
  onWireSelect?: (wireId: string | null) => void
  onWireDelete?: (wireId: string) => void
}

export default function Canvas({ 
  width = 1000, 
  height = 800, 
  blocks = [],
  wires = [],
  selectedBlockId = null,
  selectedWireId = null,
  onDrop,
  onBlockMove,
  onBlockSelect,
  onBlockDoubleClick,
  onWireCreate,
  onWireSelect,
  onWireDelete
}: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 })
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionStart, setConnectionStart] = useState<PortInfo | null>(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [connectionError, setConnectionError] = useState<string | null>(null)

  // Handle mouse wheel for zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.1, Math.min(3, zoom * delta))
    setZoom(newZoom)
  }, [zoom])

  // Handle mouse down for panning
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) { // Left mouse button
      // Cancel any active connection
      if (isConnecting) {
        setIsConnecting(false)
        setConnectionStart(null)
        return
      }
      
      // Deselect any selected block/wire if clicking on empty canvas
      if (onBlockSelect) {
        onBlockSelect(null)
      }
      if (onWireSelect) {
        onWireSelect(null)
      }
      setIsPanning(true)
      setLastPanPoint({ x: e.clientX, y: e.clientY })
    }
  }, [onBlockSelect, onWireSelect, isConnecting])

  // Handle mouse move for panning and connection preview
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      const x = (e.clientX - rect.left - pan.x) / zoom
      const y = (e.clientY - rect.top - pan.y) / zoom
      setMousePosition({ x, y })
    }

    if (isPanning) {
      const deltaX = e.clientX - lastPanPoint.x
      const deltaY = e.clientY - lastPanPoint.y
      setPan(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }))
      setLastPanPoint({ x: e.clientX, y: e.clientY })
    }
  }, [isPanning, lastPanPoint, pan, zoom])

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  // Handle drag over for drop functionality
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  // Handle drop for adding blocks
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (onDrop && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      const x = (e.clientX - rect.left - pan.x) / zoom
      const y = (e.clientY - rect.top - pan.y) / zoom
      const blockType = e.dataTransfer.getData('text/plain')
      onDrop(x, y, blockType)
    }
  }, [onDrop, pan, zoom])

  // Get port position for wire rendering
  const getPortPosition = useCallback((blockId: string, portIndex: number, isOutput: boolean) => {
    const block = blocks.find(b => b.id === blockId)
    if (!block) return { x: 0, y: 0 }
    
    const portOffsetY = portIndex * 6 // Spacing between ports
    return {
      x: block.position.x + (isOutput ? 80 : 0), // Block width is 80px
      y: block.position.y + 32 + portOffsetY - (portIndex * 2) // Center vertically
    }
  }, [blocks])

  // Handle port clicks for wire creation
  const handlePortClick = useCallback((portInfo: PortInfo) => {
    if (!isConnecting) {
      // Validate if this port can start a connection
      const validation = validatePortForConnection(portInfo, blocks, wires)
      if (!validation.isValid) {
        setConnectionError(validation.errorMessage || 'Invalid port')
        setTimeout(() => setConnectionError(null), 3000)
        return
      }

      // Start connection from this port
      setIsConnecting(true)
      setConnectionStart(portInfo)
      setConnectionError(null)
    } else if (connectionStart) {
      // Validate the complete connection
      const validation = validateConnection(connectionStart, portInfo, blocks, wires)
      
      if (!validation.isValid) {
        setConnectionError(validation.errorMessage || 'Invalid connection')
        setTimeout(() => setConnectionError(null), 3000)
        setIsConnecting(false)
        setConnectionStart(null)
        return
      }

      // Check for algebraic loops
      const newWire: WireData = {
        id: 'temp',
        sourceBlockId: connectionStart.isOutput ? connectionStart.blockId : portInfo.blockId,
        sourcePortIndex: connectionStart.isOutput ? connectionStart.portIndex : portInfo.portIndex,
        targetBlockId: connectionStart.isOutput ? portInfo.blockId : connectionStart.blockId,
        targetPortIndex: connectionStart.isOutput ? portInfo.portIndex : connectionStart.portIndex
      }

      const loopValidation = detectAlgebraicLoop(newWire, wires)
      if (!loopValidation.isValid) {
        setConnectionError(loopValidation.errorMessage || 'Would create algebraic loop')
        setTimeout(() => setConnectionError(null), 3000)
        setIsConnecting(false)
        setConnectionStart(null)
        return
      }

      // Valid connection - create the wire
      if (onWireCreate) {
        const sourcePort = connectionStart.isOutput ? connectionStart : portInfo
        const targetPort = connectionStart.isOutput ? portInfo : connectionStart
        onWireCreate(sourcePort, targetPort)
      }
      
      setIsConnecting(false)
      setConnectionStart(null)
      setConnectionError(null)
    }
  }, [isConnecting, connectionStart, onWireCreate, blocks, wires])

  // Add wheel event listener
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel, { passive: false })
      return () => canvas.removeEventListener('wheel', handleWheel)
    }
  }, [handleWheel])

  // Grid pattern for background
  const gridSize = 20

  return (
    <div 
      ref={canvasRef}
      className="w-full h-full relative overflow-hidden bg-gray-50 cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Canvas SVG */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0'
        }}
      >
        <defs>
          <pattern 
            id="grid" 
            width={gridSize} 
            height={gridSize} 
            patternUnits="userSpaceOnUse"
          >
            <path 
              d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} 
              fill="none" 
              stroke="#e5e7eb" 
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect 
          width={width} 
          height={height} 
          fill="url(#grid)" 
        />
        
        {/* Canvas content - Wires and connection preview */}
        <g id="canvas-content">
          {/* Render existing wires */}
          {wires.map(wire => {
            const sourcePos = getPortPosition(wire.sourceBlockId, wire.sourcePortIndex, true)
            const targetPos = getPortPosition(wire.targetBlockId, wire.targetPortIndex, false)
            return (
              <Wire
                key={wire.id}
                wire={wire}
                sourcePosition={sourcePos}
                targetPosition={targetPos}
                isSelected={wire.id === selectedWireId}
                onSelect={onWireSelect}
                onDelete={onWireDelete}
              />
            )
          })}
          
          {/* Connection preview while dragging */}
          {isConnecting && connectionStart && (
            <Wire
              wire={{
                id: 'preview',
                sourceBlockId: connectionStart.blockId,
                sourcePortIndex: connectionStart.portIndex,
                targetBlockId: 'mouse',
                targetPortIndex: 0
              }}
              sourcePosition={getPortPosition(connectionStart.blockId, connectionStart.portIndex, connectionStart.isOutput)}
              targetPosition={mousePosition}
              isSelected={false}
            />
          )}
        </g>
      </svg>

      {/* Render Blocks */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0'
        }}
      >
        <div className="relative pointer-events-auto">
          {blocks.map(block => (
            <Block
              key={block.id}
              block={block}
              isSelected={block.id === selectedBlockId}
              onMove={onBlockMove}
              onSelect={onBlockSelect}
              onDoubleClick={onBlockDoubleClick}
              onPortClick={handlePortClick}
            />
          ))}
        </div>
      </div>

      {/* Canvas Controls */}
      <div className="absolute top-4 right-4 bg-white rounded-lg shadow-md p-2 space-y-2">
        <button
          onClick={() => setZoom(prev => Math.min(3, prev * 1.2))}
          className="block w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded"
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={() => setZoom(prev => Math.max(0.1, prev * 0.8))}
          className="block w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded"
          title="Zoom Out"
        >
          −
        </button>
        <button
          onClick={() => {
            setZoom(1)
            setPan({ x: 0, y: 0 })
          }}
          className="block w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded text-xs"
          title="Reset View"
        >
          ⌂
        </button>
      </div>

      {/* Connection Error Display */}
      {connectionError && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg">
          {connectionError}
        </div>
      )}

      {/* Connection Status */}
      {isConnecting && (
        <div className="absolute bottom-4 left-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg">
          Click an input port to complete connection (or click canvas to cancel)
        </div>
      )}

      {/* Zoom indicator */}
      <div className="absolute bottom-4 right-4 bg-white rounded-md shadow-md px-2 py-1 text-xs text-gray-600">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  )
}
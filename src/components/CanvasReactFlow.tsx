// components/CanvasReactFlow.tsx - ReactFlow-based Canvas implementation

'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  Connection,
  Edge,
  Node,
  NodeDragHandler,
  OnConnect,
  OnEdgesChange,
  OnNodesChange,
  OnSelectionChangeFunc,
  Panel,
  useStoreApi,
  MarkerType,
  useViewport,
} from 'reactflow'
import 'reactflow/dist/style.css'

import BlockNode, { nodeTypes, blockDataToNode, wireDataToEdge, BlockNodeData } from './BlockNode'
import { edgeTypes, createCustomEdge, updateEdgeData, CustomEdgeData, CustomEdgeWrapper } from './CustomEdge'
import { BlockData, PortInfo } from './Block'
import { WireData } from './Wire'
import { validateConnection, detectAlgebraicLoop } from '@/lib/connectionValidation'
import { propagateSignalTypes, SignalType } from '@/lib/signalTypePropagation'
import { validateWireConnection, TypeCompatibilityError } from '@/lib/typeCompatibilityValidator'

interface CanvasReactFlowProps {
  blocks?: BlockData[]
  wires?: WireData[]
  selectedBlockId?: string | null
  selectedWireId?: string | null
  onDrop?: (x: number, y: number, blockType: string) => void
  onBlockMove?: (id: string, position: { x: number; y: number }) => void
  onBlockSelect?: (id: string | null) => void
  onBlockDoubleClick?: (id: string) => void
  onBlockDelete?: (id: string) => void
  onWireCreate?: (sourcePort: PortInfo, targetPort: PortInfo) => void
  onWireSelect?: (wireId: string | null) => void
  onWireDelete?: (wireId: string) => void
}

// Inner component that has access to ReactFlow instance
function CanvasReactFlowInner({
  blocks = [],
  wires = [],
  selectedBlockId = null,
  selectedWireId = null,
  onDrop,
  onBlockMove,
  onBlockSelect,
  onBlockDoubleClick,
  onBlockDelete,
  onWireCreate,
  onWireSelect,
  onWireDelete,
}: CanvasReactFlowProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { project, getNode } = useReactFlow()
  const store = useStoreApi()
  const viewport = useViewport()
  const [connectionError, setConnectionError] = useState<string | null>(null)

  // Convert blocks and wires to ReactFlow format with enhanced edge data
  const initialNodes = blocks.map(blockDataToNode)
  const initialEdges = wires.map(wire => {
    // Run type propagation to get signal types
    const propagationResult = propagateSignalTypes(blocks, wires)
    const signalType = propagationResult.signalTypes.get(wire.id)
    
    let edgeData: CustomEdgeData = {}
    
    // Add type error information if available
    if (signalType) {
      // Check for type errors in the propagation result
      const wireError = propagationResult.errors.find(e => e.wireId === wire.id)
      if (wireError) {
        edgeData.typeError = {
          message: wireError.message,
          severity: wireError.severity,
          details: signalType ? {
            actualType: signalType.type,
            expectedType: undefined // Will be filled if we have more context
          } : undefined
        }
      }
      
      edgeData.sourceType = signalType.type
      edgeData.targetType = signalType.type // Same type flows through the wire
    }
    
    return {
      ...wireDataToEdge(wire),
      type: 'default', // Use custom default edge
      data: edgeData,
    }
  })

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync external blocks with ReactFlow state
  useEffect(() => {
    setNodes(blocks.map(block => ({
      ...blockDataToNode(block),
      selected: block.id === selectedBlockId
    })))
  }, [blocks, selectedBlockId, setNodes])

  useEffect(() => {
    // Run type propagation once for all wires
    const propagationResult = propagateSignalTypes(blocks, wires)
    
    const newEdges = wires.map(wire => {
      const signalType = propagationResult.signalTypes.get(wire.id)
      
      let edgeData: CustomEdgeData = {}
      
      if (signalType) {
        // Check for type errors
        const wireError = propagationResult.errors.find(e => e.wireId === wire.id)
        if (wireError) {
          edgeData.typeError = {
            message: wireError.message,
            severity: wireError.severity,
            details: signalType ? {
              actualType: signalType.type,
              expectedType: undefined
            } : undefined
          }
        }
        
        edgeData.sourceType = signalType.type
        edgeData.targetType = signalType.type
        
        // Add signal name if it's from a named port
        const sourceBlock = blocks.find(b => b.id === wire.sourceBlockId)
        if (sourceBlock?.type === 'input_port' || sourceBlock?.type === 'output_port') {
          edgeData.signalName = sourceBlock.parameters?.signalName || sourceBlock.name
        }
      }
      
      return {
        ...wireDataToEdge(wire),
        type: 'step',
        data: edgeData,
      }
    })
    setEdges(newEdges)
  }, [wires, blocks, setEdges])

  // Handle connection validation
  const isValidConnection = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || 
        connection.sourceHandle === null || connection.targetHandle === null) {
      return false
    }

    // Extract port indices from handle IDs
    const sourcePortIndex = parseInt(connection.sourceHandle.split('-')[1])
    const targetPortIndex = parseInt(connection.targetHandle.split('-')[1])

    // Create PortInfo objects
    const sourcePort: PortInfo = {
      blockId: connection.source,
      portIndex: sourcePortIndex,
      isOutput: true,
    }

    const targetPort: PortInfo = {
      blockId: connection.target,
      portIndex: targetPortIndex,
      isOutput: false,
    }

    // Validate connection
    const validation = validateConnection(sourcePort, targetPort, blocks, wires)
    
    if (!validation.isValid) {
      setConnectionError(validation.errorMessage || 'Invalid connection')
      setTimeout(() => setConnectionError(null), 3000)
      return false
    }

    // Check for algebraic loops
    const newWire: WireData = {
      id: 'temp',
      sourceBlockId: connection.source,
      sourcePortIndex,
      targetBlockId: connection.target,
      targetPortIndex,
    }

    const loopValidation = detectAlgebraicLoop(newWire, wires)
    if (!loopValidation.isValid) {
      setConnectionError(loopValidation.errorMessage || 'Would create algebraic loop')
      setTimeout(() => setConnectionError(null), 3000)
      return false
    }

    return true
  }, [blocks, wires])

  // Handle new connections
  const onConnect: OnConnect = useCallback((connection) => {
    if (!connection.source || !connection.target || 
        connection.sourceHandle === null || connection.targetHandle === null) {
      return
    }

    // Extract port indices
    const sourcePortIndex = parseInt(connection.sourceHandle.split('-')[1])
    const targetPortIndex = parseInt(connection.targetHandle.split('-')[1])

    if (onWireCreate) {
      onWireCreate(
        {
          blockId: connection.source,
          portIndex: sourcePortIndex,
          isOutput: true,
        },
        {
          blockId: connection.target,
          portIndex: targetPortIndex,
          isOutput: false,
        }
      )
    }
  }, [onWireCreate])

  // Handle node drag
  const onNodeDrag: NodeDragHandler = useCallback((event, node) => {
    // Real-time position update during drag if needed
  }, [])

  // Handle node drag stop
  const onNodeDragStop: NodeDragHandler = useCallback((event, node) => {
    if (onBlockMove) {
      onBlockMove(node.id, node.position)
    }
  }, [onBlockMove])

  // Handle selection changes
  const onSelectionChange: OnSelectionChangeFunc = useCallback(({ nodes, edges }) => {
    if (nodes.length > 0) {
      onBlockSelect?.(nodes[0].id)
      onWireSelect?.(null)
    } else if (edges.length > 0) {
      onWireSelect?.(edges[0].id)
      onBlockSelect?.(null)
    } else {
      onBlockSelect?.(null)
      onWireSelect?.(null)
    }
  }, [onBlockSelect, onWireSelect])

  // Handle node double click
  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (onBlockDoubleClick) {
      onBlockDoubleClick(node.id)
    }
  }, [onBlockDoubleClick])

  // Handle drag over
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy' // Change from 'move' to 'copy'
  }, [])

  // Handle drop
  const onDropHandler = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      if (!reactFlowWrapper.current) return

      // Try both data types for compatibility
      const blockType = event.dataTransfer.getData('application/reactflow') || 
                       event.dataTransfer.getData('text/plain')
      
      console.log('Dropped block type:', blockType) // Debug log
      
      if (!blockType) {
        console.log('No block type found in drag data')
        return
      }

      const bounds = reactFlowWrapper.current.getBoundingClientRect()
      const position = project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      })

      console.log('Drop position:', position) // Debug log

      if (onDrop) {
        onDrop(position.x, position.y, blockType)
      }
    },
    [project, onDrop]
  )

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Delete selected nodes/edges
      if (event.key === 'Delete' || event.key === 'Backspace') {
        // Use the nodes and edges from component state
        const selectedNodes = nodes.filter((n: Node) => n.selected)
        const selectedEdges = edges.filter((e: Edge) => e.selected)

        if (selectedNodes.length > 0 && onBlockDelete) {
          selectedNodes.forEach((node: Node) => onBlockDelete(node.id))
        }

        if (selectedEdges.length > 0 && onWireDelete) {
          selectedEdges.forEach((edge: Edge) => onWireDelete(edge.id))
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [nodes, edges, onBlockDelete, onWireDelete])

  // Remove old edge styling code since we're using custom edges
  return (
    <div className="w-full h-full" ref={reactFlowWrapper}>
      <CustomEdgeWrapper />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onSelectionChange={onSelectionChange}
        onNodeDoubleClick={onNodeDoubleClick}
        onDragOver={onDragOver}
        onDrop={onDropHandler}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        isValidConnection={isValidConnection}
        deleteKeyCode={['Delete', 'Backspace']}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        fitView
        attributionPosition="top-right"
        className="react-flow-drop-target"
        selectNodesOnDrag={false}
        nodesDraggable={true}
        elementsSelectable={true}
        onNodeClick={(event, node) => {
          if (onBlockSelect) {
            onBlockSelect(node.id)
          }
        }}
        onPaneClick={() => {
          if (onBlockSelect) {
            onBlockSelect(null)
          }
          if (onWireSelect) {
            onWireSelect(null)
          }
        }}
      >
        <Background 
          variant={BackgroundVariant.Dots} 
          gap={20} 
          size={1}
          color="#e5e7eb"
        />
        
        <Controls 
          position="top-right"
          showInteractive={false}
        />

        {/* Connection Error Display */}
        {connectionError && (
          <Panel position="top-center" className="bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg">
            {connectionError}
          </Panel>
        )}

        {/* Custom Controls Panel */}
        <Panel position="bottom-right" className="bg-white rounded-md shadow-md px-2 py-1 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <span>Zoom: {Math.round(viewport.zoom * 100)}%</span>
          </div>
        </Panel>

        {/* Instructions Panel */}
        <Panel position="bottom-left" className="bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          Drag blocks from the library • Click and drag to pan • Scroll to zoom • Delete key removes selection
        </Panel>
      </ReactFlow>
    </div>
  )
}

// Main component wrapped with ReactFlowProvider
export default function CanvasReactFlow(props: CanvasReactFlowProps) {
  return (
    <ReactFlowProvider>
      <CanvasReactFlowInner {...props} />
    </ReactFlowProvider>
  )
}
// components/CanvasReactFlow.tsx - Updated to handle enable port connections

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
  SelectionMode,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useComputedColorScheme } from '@mantine/core'

import BlockNode, { nodeTypes, blockDataToNode, wireDataToEdge, BlockNodeData } from './BlockNode'
import { edgeTypes, createCustomEdge, updateEdgeData, CustomEdgeData, CustomEdgeWrapper } from './CustomEdge'
import { BlockData, PortInfo } from './BlockNode'
import { WireData } from './Wire'
import { validateConnection, detectAlgebraicLoop } from '@/lib/connectionValidation'
import { propagateSignalTypesMultiSheet } from '@/lib/signalTypePropagation'
import { useModelStore } from '@/lib/modelStore'
import { validateWireConnection, TypeCompatibilityError } from '@/lib/typeCompatibilityValidator'
import BlockContextMenu from './BlockContextMenu'
import WireContextMenu from './WireContextMenu'
import PaneContextMenu from './PaneContextMenu'
import { computeAutoLayout } from '@/lib/layout/autoLayout'

interface CanvasReactFlowProps {
  blocks?: BlockData[]
  wires?: WireData[]
  selectedBlockId?: string | null
  selectedBlockIds?: string[]  // Feature 4: Multiple block selection
  selectedWireId?: string | null
  selectedWireIds?: string[]   // Feature 4: Connections between selected blocks
  sheets?: Array<{ id: string; name: string }>
  onDrop?: (x: number, y: number, blockType: string) => void
  onBlockMove?: (id: string, position: { x: number; y: number }) => void
  onBlocksMove?: (moves: Array<{ id: string; position: { x: number; y: number } }>) => void  // Feature 4: Multi-block move
  onBlockSelect?: (id: string | null) => void
  onBlocksSelect?: (ids: string[]) => void  // Feature 4: Multi-selection callback
  onBlockDoubleClick?: (id: string) => void
  onBlockDelete?: (id: string) => void
  onWireCreate?: (sourcePort: PortInfo, targetPort: PortInfo) => void
  onWireSelect?: (wireId: string | null) => void
  onWireDelete?: (wireId: string) => void
  onWireRoutingChange?: (wireId: string, routing: { midpointOffset?: number; waypoints?: { x: number; y: number }[] } | undefined) => void
  onSheetNavigate?: (sheetId: string) => void
  onClearSelection?: () => void  // Feature 4: Clear selection callback
  // Feature 5: Clipboard callbacks
  onCopy?: () => void
  onCut?: () => void
  onPaste?: (position?: { x: number; y: number }) => void
  // Feature 7: Block rename callback
  onBlockRename?: (blockId: string, newName: string) => { success: boolean; error?: string }
}

// Context menu state type
type ContextMenu = {
  nodeId: string
  top?: number
  left?: number
  right?: number
  bottom?: number
}

// Wire context menu state type
type WireContextMenu = {
  wireId: string
  top?: number
  left?: number
  right?: number
  bottom?: number
}

// Pane (empty canvas) context menu state type
type PaneContextMenuState = {
  top?: number
  left?: number
  right?: number
  bottom?: number
}

// Highlighted net identifier (source block + port)
type HighlightedNet = {
  sourceBlockId: string
  sourcePortIndex: number
} | null

// Inner component that has access to ReactFlow instance
function CanvasReactFlowInner({
  blocks = [],
  wires = [],
  selectedBlockId = null,
  selectedBlockIds = [],  // Feature 4
  selectedWireId = null,
  selectedWireIds = [],   // Feature 4
  sheets = [],
  onDrop,
  onBlockMove,
  onBlocksMove,           // Feature 4: Multi-block move
  onBlockSelect,
  onBlocksSelect,         // Feature 4
  onBlockDoubleClick,
  onBlockDelete,
  onWireCreate,
  onWireSelect,
  onWireDelete,
  onWireRoutingChange,
  onSheetNavigate,
  onClearSelection,       // Feature 4
  onCopy,                 // Feature 5
  onCut,                  // Feature 5
  onPaste,                // Feature 5
  onBlockRename,          // Feature 7
}: CanvasReactFlowProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { project, getNode } = useReactFlow()
  const store = useStoreApi()
  const viewport = useViewport()
  const [connectionError, setConnectionError] = useState<string | null>(null)

  // Get color scheme from Mantine for ReactFlow theming
  const colorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true })

  // Get all sheets from model store for multi-sheet type propagation
  const modelSheets = useModelStore(state => state.sheets)

  // Resize mode state (which block, if any, is showing corner resize handles)
  const resizingBlockId = useModelStore(state => state.resizingBlockId)
  const setResizingBlockId = useModelStore(state => state.setResizingBlockId)

  // Context menu state - following ReactFlow pattern
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)

  // Wire context menu state
  const [wireContextMenu, setWireContextMenu] = useState<WireContextMenu | null>(null)

  // Pane context menu state (empty canvas right-click)
  const [paneContextMenu, setPaneContextMenu] = useState<PaneContextMenuState | null>(null)

  // Highlighted net state - tracks which source port's connections are highlighted
  const [highlightedNet, setHighlightedNet] = useState<HighlightedNet>(null)

  // Feature 7: Rename dialog state
  const [renameDialog, setRenameDialog] = useState<{
    blockId: string
    currentName: string
    newName: string
    error: string | null
  } | null>(null)

  // Convert wires to the format needed for port name rendering
  const wiresForNodes = wires.map(w => ({
    id: w.id,
    sourceBlockId: w.sourceBlockId,
    sourcePortIndex: w.sourcePortIndex,
    targetBlockId: w.targetBlockId,
    targetPortIndex: w.targetPortIndex,
  }))

  // Convert blocks and wires to ReactFlow format with enhanced edge data
  const initialNodes = blocks.map((block) => blockDataToNode(block, wiresForNodes, blocks))

  // Run type propagation ONCE for all wires (not inside the map!)
  const sheetsForInitialPropagation = modelSheets && modelSheets.length > 0
    ? modelSheets.map(s => ({ blocks: s.blocks, connections: s.connections }))
    : [{ blocks, connections: wires }]
  const initialPropagationResult = propagateSignalTypesMultiSheet(sheetsForInitialPropagation)

  const initialEdges = wires.map(wire => {
    const signalType = initialPropagationResult.signalTypes.get(wire.id)

    const edgeData: CustomEdgeData = {}

    // Add type error information if available
    if (signalType) {
      // Check for type errors in the propagation result
      const wireError = initialPropagationResult.errors.find(e => e.wireId === wire.id)
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
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Track dragging state to detect when multi-node drag ends
  const isDraggingRef = useRef(false)
  const draggedNodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  // Custom onNodesChange handler that detects multi-node drag completion
  // This is a workaround for ReactFlow bug where onSelectionDragStop doesn't fire
  // when onSelectionChange is also set (see https://github.com/xyflow/xyflow/issues/4945)
  const onNodesChange = useCallback((changes: any[]) => {
    // First apply changes to ReactFlow's internal state
    onNodesChangeInternal(changes)

    // Check for position changes (dragging)
    const positionChanges = changes.filter(
      (c: any) => c.type === 'position' && c.dragging !== undefined
    )

    if (positionChanges.length > 0) {
      const isDragging = positionChanges.some((c: any) => c.dragging === true)
      const stoppedDragging = positionChanges.some((c: any) => c.dragging === false)

      if (isDragging && !isDraggingRef.current) {
        // Drag started
        isDraggingRef.current = true
        draggedNodePositionsRef.current.clear()
      }

      // Track positions during drag
      positionChanges.forEach((c: any) => {
        if (c.position) {
          draggedNodePositionsRef.current.set(c.id, c.position)
        }
      })

      if (stoppedDragging && isDraggingRef.current) {
        // Drag ended - save all moved positions
        isDraggingRef.current = false
        const moves = Array.from(draggedNodePositionsRef.current.entries()).map(
          ([id, position]) => ({ id, position })
        )

        console.log('[onNodesChange] Drag ended, moves:', moves)

        if (moves.length > 1 && onBlocksMove) {
          // Multi-node move
          console.log('[onNodesChange] Calling onBlocksMove for', moves.length, 'nodes')
          onBlocksMove(moves)
        } else if (moves.length === 1 && onBlockMove) {
          // Single node move
          console.log('[onNodesChange] Calling onBlockMove for single node')
          onBlockMove(moves[0].id, moves[0].position)
        }

        draggedNodePositionsRef.current.clear()
      }
    }
  }, [onNodesChangeInternal, onBlockMove, onBlocksMove])

  // Sync external blocks with ReactFlow state
  useEffect(() => {
    // Convert wires to the format needed for port name rendering
    const currentWiresForNodes = wires.map(w => ({
      id: w.id,
      sourceBlockId: w.sourceBlockId,
      sourcePortIndex: w.sourcePortIndex,
      targetBlockId: w.targetBlockId,
      targetPortIndex: w.targetPortIndex,
    }))

    setNodes(blocks.map(block => ({
      ...blockDataToNode(block, currentWiresForNodes, blocks),
      // Feature 4: Support both single and multi-selection
      selected: selectedBlockIds.length > 0
        ? selectedBlockIds.includes(block.id)
        : block.id === selectedBlockId
    })))
  }, [blocks, wires, selectedBlockId, selectedBlockIds, setNodes])

  // Handler for wire routing changes from editable edges
  const handleWireRoutingChange = useCallback((wireId: string, routing: CustomEdgeData['routing']) => {
    if (onWireRoutingChange) {
      onWireRoutingChange(wireId, routing)
    }
  }, [onWireRoutingChange])

  useEffect(() => {
    // Run type propagation once for all wires - use multi-sheet for proper sheet label handling
    const sheetsForPropagation = modelSheets && modelSheets.length > 0
      ? modelSheets.map(s => ({ blocks: s.blocks, connections: s.connections }))
      : [{ blocks, connections: wires }]
    const propagationResult = propagateSignalTypesMultiSheet(sheetsForPropagation)

    const newEdges = wires.map(wire => {
      const signalType = propagationResult.signalTypes.get(wire.id)

      const edgeData: CustomEdgeData = {}

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

      // Special styling for enable connections
      if (wire.targetPortIndex === -1) {
        edgeData.sourceType = 'bool' // Enable ports always expect boolean
        edgeData.isEnableConnection = true
      }

      // Special styling for reset connections
      if (wire.targetPortIndex === -2) {
        edgeData.sourceType = 'bool' // Reset ports always expect boolean
        edgeData.isResetConnection = true
      }

      // Add routing data and callback for editable edges
      edgeData.routing = wire.routing
      edgeData.onRoutingChange = handleWireRoutingChange

      // Add highlighting info - wire is highlighted if it shares the same source as highlightedNet
      if (highlightedNet &&
          wire.sourceBlockId === highlightedNet.sourceBlockId &&
          wire.sourcePortIndex === highlightedNet.sourcePortIndex) {
        edgeData.isHighlighted = true
      }

      return {
        ...wireDataToEdge(wire),
        type: 'editableStep',
        data: edgeData,
      }
    })
    setEdges(newEdges)
  }, [wires, blocks, modelSheets, setEdges, handleWireRoutingChange, highlightedNet])

  // Handle connection validation
  const isValidConnection = useCallback((connection: Connection) => {
    //console.log('=== isValidConnection called ===')
    //console.log('Connection attempt:', connection)
    
    if (!connection.source || !connection.target || 
        connection.sourceHandle === null || connection.targetHandle === null) {
      return false
    }

    // Extract port indices from handle IDs
    let sourcePortIndex = 0
    let targetPortIndex = 0
    
    // Parse source port index
    if (connection.sourceHandle.startsWith('output-')) {
      sourcePortIndex = parseInt(connection.sourceHandle.split('-')[1])
    }

    // Parse target port index
    // Special control ports: -1 = enable (top), -2 = reset (bottom)
    // x(0) is a normal left-side data port (input-1), not a control port
    if (connection.targetHandle === '_enable_') {
      targetPortIndex = -1 // Special enable port (top edge)
    } else if (connection.targetHandle === '_reset_') {
      targetPortIndex = -2 // Special reset port (bottom edge)
    } else if (connection.targetHandle.startsWith('input-')) {
      targetPortIndex = parseInt(connection.targetHandle.split('-')[1])
    }

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

    // Get the current edges from ReactFlow state instead of props
    // Map special handle IDs to port indices: -1 = enable, -2 = reset
    const currentWires = edges.map(edge => ({
      id: edge.id,
      sourceBlockId: edge.source,
      sourcePortIndex: parseInt(edge.sourceHandle?.split('-')[1] || '0'),
      targetBlockId: edge.target,
      targetPortIndex: edge.targetHandle === '_enable_' ? -1 :
                       edge.targetHandle === '_reset_' ? -2 :
                       parseInt(edge.targetHandle?.split('-')[1] || '0'),
    }))
    
    //console.log('Current wires for validation:', currentWires)
    //console.log('Props wires:', wires)
    
    // Validate connection using currentWires instead of wires prop
    const validation = validateConnection(sourcePort, targetPort, blocks, currentWires)
    
    //console.log('Validation result:', validation)
    
    if (!validation.isValid) {
      setConnectionError(validation.errorMessage || 'Invalid connection')
      setTimeout(() => setConnectionError(null), 3000)
      return false
    }

    // Check for algebraic loops (unless it's an enable or reset control connection)
    if (targetPortIndex !== -1 && targetPortIndex !== -2) {
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
    }

    return true
  }, [blocks, wires, edges])

  // Handle new connections
  const onConnect: OnConnect = useCallback((connection) => {
    if (!connection.source || !connection.target || 
        connection.sourceHandle === null || connection.targetHandle === null) {
      return
    }

    // Extract port indices
    let sourcePortIndex = 0
    let targetPortIndex = 0
    
    // Parse source port index
    if (connection.sourceHandle.startsWith('output-')) {
      sourcePortIndex = parseInt(connection.sourceHandle.split('-')[1])
    }

    // Parse target port index
    // Special control ports: -1 = enable (top), -2 = reset (bottom)
    if (connection.targetHandle === '_enable_') {
      targetPortIndex = -1 // Special enable port (top edge)
    } else if (connection.targetHandle === '_reset_') {
      targetPortIndex = -2 // Special reset port (bottom edge)
    } else if (connection.targetHandle.startsWith('input-')) {
      targetPortIndex = parseInt(connection.targetHandle.split('-')[1])
    }

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

const handleEdgesChange = useCallback((changes: any[]) => {
  console.log('=== handleEdgesChange called ===')
  console.log('Changes:', changes)
  console.log('Current edges before change:', edges.map(e => ({ id: e.id, source: e.source, target: e.target })))
  
  // First apply the changes to ReactFlow's internal state
  onEdgesChange(changes)
  
  // Then handle deletions to update our external state
  const deletions = changes.filter(change => change.type === 'remove')
  console.log('Deletions detected:', deletions)
  
  deletions.forEach(deletion => {
    console.log(`Calling onWireDelete for wire: ${deletion.id}`)
    if (onWireDelete) {
      onWireDelete(deletion.id)
    }
  })
}, [onEdgesChange, onWireDelete, edges])

  // Handle node context menu - following ReactFlow example pattern
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault()

      if (!reactFlowWrapper.current) return

      const pane = reactFlowWrapper.current.getBoundingClientRect()

      setPaneContextMenu(null)
      setContextMenu({
        nodeId: node.id,
        top: event.clientY - pane.top,
        left: event.clientX - pane.left,
      })
    },
    [setContextMenu]
  )

  // Handle pane (empty canvas) context menu
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault()
      if (!reactFlowWrapper.current) return
      const pane = reactFlowWrapper.current.getBoundingClientRect()
      setContextMenu(null)
      setWireContextMenu(null)
      setPaneContextMenu({
        top: event.clientY - pane.top,
        left: event.clientX - pane.left,
      })
    },
    []
  )

  // Handle edge/wire context menu
  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault()

      if (!reactFlowWrapper.current) return

      const pane = reactFlowWrapper.current.getBoundingClientRect()

      // Close any open block context menu
      setContextMenu(null)
      setPaneContextMenu(null)

      setWireContextMenu({
        wireId: edge.id,
        top: event.clientY - pane.top,
        left: event.clientX - pane.left,
      })
    },
    [setWireContextMenu, setContextMenu]
  )

  // Handle highlight connections toggle
  const handleHighlightConnections = useCallback((wireId: string) => {
    const wire = wires.find(w => w.id === wireId)
    if (!wire) return

    // Check if this net is already highlighted
    if (highlightedNet &&
        highlightedNet.sourceBlockId === wire.sourceBlockId &&
        highlightedNet.sourcePortIndex === wire.sourcePortIndex) {
      // Toggle off - clear highlighting
      setHighlightedNet(null)
    } else {
      // Highlight this net (all wires from same source port)
      setHighlightedNet({
        sourceBlockId: wire.sourceBlockId,
        sourcePortIndex: wire.sourcePortIndex,
      })
    }
  }, [wires, highlightedNet])

  // Handle remove custom routing
  const handleRemoveCustomRouting = useCallback((wireId: string) => {
    if (onWireRoutingChange) {
      onWireRoutingChange(wireId, undefined)
    }
  }, [onWireRoutingChange])

  // Auto-layout: reorganize blocks on the current sheet.
  const handleReorganize = useCallback(() => {
    const moves = computeAutoLayout(blocks, wires)
    if (moves.length === 0) return
    if (onBlocksMove) {
      onBlocksMove(moves)
    } else if (onBlockMove) {
      for (const m of moves) onBlockMove(m.id, m.position)
    }
  }, [blocks, wires, onBlocksMove, onBlockMove])

  // Close context menu when clicking on the pane - Feature 4: Clear all selection
  const onPaneClick = useCallback(() => {
    setContextMenu(null)
    setWireContextMenu(null)
    setPaneContextMenu(null)
    setResizingBlockId(null)
    // Feature 4: Use clearSelection if available, otherwise fall back to individual clears
    if (onClearSelection) {
      onClearSelection()
    } else {
      if (onBlocksSelect) {
        onBlocksSelect([])
      } else if (onBlockSelect) {
        onBlockSelect(null)
      }
      if (onWireSelect) {
        onWireSelect(null)
      }
    }
  }, [onBlockSelect, onBlocksSelect, onWireSelect, onClearSelection, setResizingBlockId])

  // Exit resize mode on Escape
  useEffect(() => {
    if (!resizingBlockId) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setResizingBlockId(null)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [resizingBlockId, setResizingBlockId])

  // Handle node drag
  const onNodeDrag: NodeDragHandler = useCallback((event, node) => {
    // Close context menus when dragging starts
    setContextMenu(null)
    setWireContextMenu(null)
  }, [])

  // Note: We handle drag stop through onNodesChange instead of onNodeDragStop/onSelectionDragStop
  // due to ReactFlow bug where onSelectionDragStop doesn't fire when onSelectionChange is set
  // See: https://github.com/xyflow/xyflow/issues/4945

  // Handle selection changes - Feature 4: Support multi-selection
  const onSelectionChange: OnSelectionChangeFunc = useCallback(({ nodes, edges }) => {
    if (nodes.length > 0) {
      // Feature 4: Use multi-selection callback if available
      if (onBlocksSelect) {
        onBlocksSelect(nodes.map(n => n.id))
      } else if (onBlockSelect) {
        // Fallback to single selection for backward compatibility
        onBlockSelect(nodes[0].id)
      }
      onWireSelect?.(null)
    } else if (edges.length > 0) {
      onWireSelect?.(edges[0].id)
      if (onBlocksSelect) {
        onBlocksSelect([])
      } else {
        onBlockSelect?.(null)
      }
    } else {
      if (onBlocksSelect) {
        onBlocksSelect([])
      } else {
        onBlockSelect?.(null)
      }
      onWireSelect?.(null)
    }
  }, [onBlockSelect, onBlocksSelect, onWireSelect])

  // Handle node double click
  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (onBlockDoubleClick) {
      onBlockDoubleClick(node.id)
    }
  }, [onBlockDoubleClick])

  // Handle drag over
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  // Handle drop
  const onDropHandler = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      if (!reactFlowWrapper.current) return

      const blockType = event.dataTransfer.getData('application/reactflow') || 
                       event.dataTransfer.getData('text/plain')
      
      if (!blockType) {
        return
      }

      const bounds = reactFlowWrapper.current.getBoundingClientRect()
      const position = project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      })

      if (onDrop) {
        onDrop(position.x, position.y, blockType)
      }
    },
    [project, onDrop]
  )

  // Handle keyboard shortcuts - Feature 4: Added Escape and Ctrl+A
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if user is typing in an input field
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable) {
        return
      }

      // Feature 4: Escape - Clear selection
      if (event.key === 'Escape') {
        event.preventDefault()
        if (onClearSelection) {
          onClearSelection()
        } else if (onBlocksSelect) {
          onBlocksSelect([])
        } else if (onBlockSelect) {
          onBlockSelect(null)
        }
        if (onWireSelect) {
          onWireSelect(null)
        }
        return
      }

      // Feature 4: Ctrl+A - Select all blocks on current sheet
      if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
        event.preventDefault()
        if (onBlocksSelect && blocks.length > 0) {
          onBlocksSelect(blocks.map(b => b.id))
        }
        return
      }

      // Feature 5: Ctrl+C - Copy selection
      if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
        event.preventDefault()
        if (onCopy && selectedBlockIds.length > 0) {
          onCopy()
        }
        return
      }

      // Feature 5: Ctrl+X - Cut selection
      if ((event.ctrlKey || event.metaKey) && event.key === 'x') {
        event.preventDefault()
        if (onCut && selectedBlockIds.length > 0) {
          onCut()
        }
        return
      }

      // Feature 5: Ctrl+V - Paste
      if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
        event.preventDefault()
        if (onPaste) {
          onPaste()
        }
        return
      }

      // Delete selected nodes/edges
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()

        const selectedNodes = nodes.filter((n: Node) => n.selected)
        const selectedEdges = edges.filter((e: Edge) => e.selected)

        if (selectedNodes.length > 0 && onBlockDelete) {
          selectedNodes.forEach((node: Node) => onBlockDelete(node.id))
        }

        if (selectedEdges.length > 0 && onWireDelete) {
          console.log('Deleting selected edges:', selectedEdges.map(e => e.id))
          selectedEdges.forEach((edge: Edge) => onWireDelete(edge.id))
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [nodes, edges, blocks, selectedBlockIds, onBlockDelete, onWireDelete, onBlockSelect, onBlocksSelect, onWireSelect, onClearSelection, onCopy, onCut, onPaste])
  

  // Get the block data for context menu
  const contextMenuBlock = contextMenu ? blocks.find(b => b.id === contextMenu.nodeId) : null

  // Get available sheets for the current block
  const getAvailableSheets = useCallback((block: BlockData) => {
    if (block.type !== 'subsystem') {
      return []
    }
    
    // Get sheets from the subsystem's parameters instead of searching all sheets
    return block.parameters?.sheets || []
  }, [])

  return (
    <div className={`w-full h-full ${colorScheme === 'dark' ? 'react-flow-dark' : ''}`} ref={reactFlowWrapper}>
      <CustomEdgeWrapper />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDrag={onNodeDrag}
        onSelectionChange={onSelectionChange}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onDragOver={onDragOver}
        onDrop={onDropHandler}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        isValidConnection={isValidConnection}
        // Feature 4: Multi-selection configuration
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        selectionKeyCode="Alt"  // Alt+Drag to draw selection rectangle
        selectionOnDrag={true}  // Enable drag selection
        selectionMode={SelectionMode.Partial}  // Select nodes that intersect with selection box
        panOnDrag={[1, 2]}      // Pan with middle/right mouse button, or left without Alt
        fitView
        attributionPosition="top-right"
        className="react-flow-drop-target"
        selectNodesOnDrag={false}
        nodesDraggable={true}
        elementsSelectable={true}
        onNodeClick={(event, node) => {
          // Feature 4: Handle Shift+Click for toggle selection
          if (event.shiftKey && onBlocksSelect) {
            const currentSelection = selectedBlockIds || []
            if (currentSelection.includes(node.id)) {
              // Remove from selection
              onBlocksSelect(currentSelection.filter(id => id !== node.id))
            } else {
              // Add to selection
              onBlocksSelect([...currentSelection, node.id])
            }
          } else if (onBlocksSelect) {
            // Single click replaces selection
            onBlocksSelect([node.id])
          } else if (onBlockSelect) {
            onBlockSelect(node.id)
          }
        }}
      >
        <Background 
          variant={BackgroundVariant.Dots} 
          gap={20} 
          size={1}
        />
        
        <Controls 
          position="top-right"
          showInteractive={false}
        />

        {/* Connection Error Display */}
        {connectionError && (
          <Panel position="top-center" className="bg-red-500 dark:bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg">
            {connectionError}
          </Panel>
        )}

        {/* Custom Controls Panel */}
        <Panel position="bottom-right" className="bg-white dark:bg-gray-800 rounded-md shadow-md px-2 py-1 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <span>Zoom: {Math.round(viewport.zoom * 100)}%</span>
          </div>
        </Panel>

        {/* Instructions Panel */}
        <Panel position="bottom-left" className="bg-blue-500 dark:bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {resizingBlockId
            ? 'Resize mode: drag any corner handle • Esc or click canvas to exit'
            : 'Drag blocks from library • Alt+Drag to select • Shift+Click to add • Ctrl+A select all • Delete removes selection'}
        </Panel>
      </ReactFlow>

      {/* Render context menu as sibling to ReactFlow */}
      {contextMenu && contextMenuBlock && (
        <BlockContextMenu
          nodeId={contextMenu.nodeId}
          top={contextMenu.top}
          left={contextMenu.left}
          right={contextMenu.right}
          bottom={contextMenu.bottom}
          block={contextMenuBlock}
          availableSheets={getAvailableSheets(contextMenuBlock)}
          onClose={() => setContextMenu(null)}
          onPropertiesClick={(blockId) => {
            console.log('Properties clicked for:', blockId)
            if (onBlockDoubleClick) {
              onBlockDoubleClick(blockId)
            }
            setContextMenu(null)
          }}
          onRenameClick={(blockId) => {
            const block = blocks.find(b => b.id === blockId)
            if (block) {
              setRenameDialog({
                blockId,
                currentName: block.name,
                newName: block.name,
                error: null
              })
            }
            setContextMenu(null)
          }}
          onResizeClick={(blockId) => {
            setResizingBlockId(blockId)
            setContextMenu(null)
          }}
          onSheetNavigate={(sheetId) => {
            if (onSheetNavigate) {
              onSheetNavigate(sheetId)
            }
            setContextMenu(null)
          }}
        />
      )}

      {/* Wire context menu */}
      {wireContextMenu && (
        <WireContextMenu
          wireId={wireContextMenu.wireId}
          top={wireContextMenu.top}
          left={wireContextMenu.left}
          right={wireContextMenu.right}
          bottom={wireContextMenu.bottom}
          isHighlighted={
            highlightedNet !== null &&
            (() => {
              const wire = wires.find(w => w.id === wireContextMenu.wireId)
              return wire !== undefined &&
                wire.sourceBlockId === highlightedNet.sourceBlockId &&
                wire.sourcePortIndex === highlightedNet.sourcePortIndex
            })()
          }
          hasCustomRouting={
            (() => {
              const wire = wires.find(w => w.id === wireContextMenu.wireId)
              return wire !== undefined && wire.routing !== undefined &&
                (wire.routing.midpointOffset !== undefined ||
                 (wire.routing.waypoints !== undefined && wire.routing.waypoints.length > 0))
            })()
          }
          onClose={() => setWireContextMenu(null)}
          onHighlightConnections={handleHighlightConnections}
          onRemoveCustomRouting={handleRemoveCustomRouting}
          onDelete={(wireId) => {
            if (onWireDelete) {
              onWireDelete(wireId)
            }
            setWireContextMenu(null)
          }}
        />
      )}

      {/* Pane (empty canvas) context menu */}
      {paneContextMenu && (
        <PaneContextMenu
          top={paneContextMenu.top}
          left={paneContextMenu.left}
          right={paneContextMenu.right}
          bottom={paneContextMenu.bottom}
          onClose={() => setPaneContextMenu(null)}
          onReorganize={() => {
            handleReorganize()
            setPaneContextMenu(null)
          }}
        />
      )}

      {/* Feature 7: Rename Dialog */}
      {renameDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-96">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Rename Block
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Block Name
              </label>
              <input
                type="text"
                value={renameDialog.newName}
                onChange={(e) => setRenameDialog({
                  ...renameDialog,
                  newName: e.target.value,
                  error: null
                })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && renameDialog.newName.trim()) {
                    handleRenameSubmit()
                  } else if (e.key === 'Escape') {
                    setRenameDialog(null)
                  }
                }}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white ${
                  renameDialog.error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
                autoFocus
              />
              {renameDialog.error && (
                <p className="mt-1 text-sm text-red-500">{renameDialog.error}</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRenameDialog(null)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameSubmit}
                disabled={!renameDialog.newName.trim()}
                className="px-4 py-2 text-sm bg-blue-500 text-white hover:bg-blue-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  function handleRenameSubmit() {
    if (!renameDialog || !renameDialog.newName.trim()) return

    if (onBlockRename) {
      const result = onBlockRename(renameDialog.blockId, renameDialog.newName.trim())
      if (result.success) {
        setRenameDialog(null)
      } else {
        setRenameDialog({
          ...renameDialog,
          error: result.error || 'Failed to rename block'
        })
      }
    } else {
      setRenameDialog(null)
    }
  }
}

// Main component wrapped with ReactFlowProvider
export default function CanvasReactFlow(props: CanvasReactFlowProps) {
  return (
    <ReactFlowProvider>
      <CanvasReactFlowInner {...props} />
    </ReactFlowProvider>
  )
}
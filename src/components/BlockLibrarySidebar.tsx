'use client'

import { useState } from 'react'

interface BlockType {
  id: string
  name: string
  category: string
  description: string
  icon: string
  vectorSupport?: 'full' | 'scalar-only' | 'element-wise'
}

const blockTypes: BlockType[] = [
  // Math Operations
  { 
    id: 'sum', 
    name: 'Sum', 
    category: 'Math', 
    description: 'Add multiple inputs', 
    icon: '∑',
    vectorSupport: 'full'
  },
  { 
    id: 'multiply', 
    name: 'Multiply', 
    category: 'Math', 
    description: 'Multiply inputs', 
    icon: '×',
    vectorSupport: 'full'
  },
  { 
    id: 'scale', 
    name: 'Scale', 
    category: 'Math', 
    description: 'Multiply by constant', 
    icon: 'K',
    vectorSupport: 'full'
  },
  
  // Dynamic Systems
  { 
    id: 'transfer_function', 
    name: 'Transfer Function', 
    category: 'Dynamic', 
    description: 'Laplace transfer function', 
    icon: 'H(s)',
    vectorSupport: 'element-wise'
  },
  
  // Sources & Sinks
  { 
    id: 'input_port', 
    name: 'Input Port', 
    category: 'Ports', 
    description: 'External input', 
    icon: '→',
    vectorSupport: 'full'
  },
  { 
    id: 'output_port', 
    name: 'Output Port', 
    category: 'Ports', 
    description: 'External output', 
    icon: '⇥',
    vectorSupport: 'full'
  },
  { 
    id: 'source', 
    name: 'Source', 
    category: 'Sources', 
    description: 'Constant or signal generator', 
    icon: '◦',
    vectorSupport: 'full'
  },
  
  // Display & Logging
  { 
    id: 'signal_display', 
    name: 'Signal Display', 
    category: 'Display', 
    description: 'Plot signal values', 
    icon: '📊',
    vectorSupport: 'full'
  },
  { 
    id: 'signal_logger', 
    name: 'Signal Logger', 
    category: 'Display', 
    description: 'Log signal data', 
    icon: '📝',
    vectorSupport: 'full'
  },
  
  // Lookup Tables
  { 
    id: 'lookup_1d', 
    name: '1-D Lookup', 
    category: 'Lookup', 
    description: '1D interpolation table (scalar only)', 
    icon: '1D',
    vectorSupport: 'scalar-only'
  },
  { 
    id: 'lookup_2d', 
    name: '2-D Lookup', 
    category: 'Lookup', 
    description: '2D interpolation table (scalar only)', 
    icon: '2D',
    vectorSupport: 'scalar-only'
  },
  
  // Subsystems
  { 
    id: 'subsystem', 
    name: 'Subsystem', 
    category: 'Hierarchy', 
    description: 'Nested model block', 
    icon: '📦',
    vectorSupport: 'full'
  },
  { 
    id: 'sheet_label_sink', 
    name: 'Sheet Label Sink', 
    category: 'Sheet Labels', 
    description: 'Capture a signal and make it available by name across sheets', 
    icon: '↓L',
    vectorSupport: 'full'
  },
  { 
    id: 'sheet_label_source', 
    name: 'Sheet Label Source', 
    category: 'Sheet Labels', 
    description: 'Output a signal captured by a Sheet Label Sink with matching name', 
    icon: '↑L',
    vectorSupport: 'full'
  },
]

const categories = Array.from(new Set(blockTypes.map(block => block.category)))

interface DraggableBlockProps {
  blockType: BlockType
}

function DraggableBlock({ blockType }: DraggableBlockProps) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', blockType.id)
    e.dataTransfer.effectAllowed = 'copy'
  }

  // Get vector support badge
  const getVectorBadge = () => {
    switch (blockType.vectorSupport) {
      case 'full':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800" title="Supports scalar and vector signals">
            V
          </span>
        )
      case 'element-wise':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800" title="Processes vectors element-wise">
            E
          </span>
        )
      case 'scalar-only':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800" title="Scalar inputs only">
            S
          </span>
        )
      default:
        return null
    }
  }

  // Get extended tooltip
  const getTooltip = () => {
    let tooltip = blockType.description
    switch (blockType.vectorSupport) {
      case 'full':
        tooltip += '\n✓ Supports both scalar and vector signals'
        break
      case 'element-wise':
        tooltip += '\n✓ Processes vector signals element-by-element'
        break
      case 'scalar-only':
        tooltip += '\n⚠ Requires scalar inputs only'
        break
    }
    return tooltip
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="p-3 bg-white border border-gray-200 rounded-lg cursor-grab hover:bg-gray-50 hover:border-blue-300 transition-colors group"
      title={getTooltip()}
    >
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center text-blue-700 font-mono text-sm group-hover:bg-blue-200">
          {blockType.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-gray-900 truncate">
              {blockType.name}
            </div>
            {getVectorBadge()}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {blockType.description}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BlockLibrarySidebar() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const filteredBlocks = blockTypes.filter(block => {
    const matchesSearch = block.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         block.description.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = !selectedCategory || block.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  return (
    <div className="w-64 h-full bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Block Library</h2>
        
        {/* Search */}
        <input
          type="text"
          placeholder="Search blocks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Category Filter */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-2 py-1 text-xs rounded-full ${
              !selectedCategory
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-2 py-1 text-xs rounded-full ${
                selectedCategory === category
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Block List */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {filteredBlocks.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-sm">No blocks found</div>
              <div className="text-xs mt-1">Try adjusting your search or filter</div>
            </div>
          ) : (
            filteredBlocks.map(blockType => (
              <DraggableBlock key={blockType.id} blockType={blockType} />
            ))
          )}
        </div>
      </div>

      {/* Footer with Legend */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-500 text-center mb-2">
          Drag blocks onto the canvas
        </div>
        <div className="flex justify-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-800">V</span>
            <span className="text-gray-600">Vector</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-800">E</span>
            <span className="text-gray-600">Element-wise</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded font-medium bg-yellow-100 text-yellow-800">S</span>
            <span className="text-gray-600">Scalar only</span>
          </div>
        </div>
      </div>
    </div>
  )
}
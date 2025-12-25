'use client'

import { useState } from 'react'
import {
  Box,
  Text,
  TextInput,
  Button,
  Badge,
  Group,
  Stack,
  ScrollArea,
  Paper,
  Flex,
  useMantineColorScheme
} from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'

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
  {
    id: 'evaluate',
    name: 'Evaluate',
    category: 'Math',
    description: 'Custom expression evaluator',
    icon: 'f(x)',
    vectorSupport: 'scalar-only'
  },
   {
    id: 'abs',
    name: 'Absolute Value',
    category: 'Math',
    description: 'Absolute value of scalar input',
    icon: '|x|',
    vectorSupport: 'scalar-only'
  },
  {
    id: 'uminus',
    name: 'Unary Minus',
    category: 'Math',
    description: 'Negates input signal',
    icon: '-x',
    vectorSupport: 'full'
  },

  // Signal Processing
  {
    id: 'limit',
    name: 'Limit',
    category: 'Signal',
    description: 'Clamp signal to range',
    icon: '⊏⊐',
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
  {
    id: 'discrete_transform',
    name: 'Discrete Transform',
    category: 'Dynamic',
    description: 'Z-transform with sample interval',
    icon: 'H(z)',
    vectorSupport: 'element-wise'
  },
  {
    id: 'integrator',
    name: 'Integrator',
    category: 'Dynamic',
    description: 'Integrate signal over time',
    icon: '∫',
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
  {
    id: 'clock',
    name: 'Clock',
    category: 'Sources',
    description: 'Simulation time output',
    icon: '⏱',
    vectorSupport: 'scalar-only'
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
  {
    id: 'no_connection',
    name: 'No Connection',
    category: 'Sinks',
    description: 'Mark signal as unused',
    icon: '✕',
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

  {
    id: 'trig',
    name: 'Trig Function',
    category: 'Math',
    description: 'Compute trigonometric functions; angles are radians',
    icon: 'sin(x)',
    vectorSupport: 'scalar-only'
  },

  // Matrix Operations
  {
    id: 'matrix_multiply',
    name: 'Matrix Multiply',
    category: 'Matrix',
    description: 'Matrix multiplication (scalar×matrix or matrix×matrix)',
    icon: '⊗',
    vectorSupport: 'full'
  },
   {
    id: 'transpose',
    name: 'Transpose',
    category: 'Matrix',
    description: 'Matrix/vector transpose operation',
    icon: 'Aᵀ',
    vectorSupport: 'full'
  },
  {
    id: 'mux',
    name: 'Mux',
    category: 'Matrix',
    description: 'Combine scalars into vector/matrix',
    icon: '▦',
    vectorSupport: 'full'
  },
  {
    id: 'demux',
    name: 'Demux',
    category: 'Matrix',
    description: 'Split vector/matrix into scalars',
    icon: '▥',
    vectorSupport: 'full'
  },
  {
    id: 'mag',
    name: 'Magnitude',
    category: 'Vector',
    description: 'Calculate magnitude of a vector',
    icon: '|v|',
    vectorSupport: 'full'
  },
  {
    id: 'cross',
    name: 'Cross Product',
    category: 'Vector',
    description: 'Calculate cross product of two vectors',
    icon: 'A×B',
    vectorSupport: 'full'
  },
   {
    id: 'dot',
    name: 'Dot Product',
    category: 'Vector',
    description: 'Calculate dot product of two vectors (a scalar result)',
    icon: 'A.B',
    vectorSupport: 'full'
  },

  // Aerospace
  {
    id: 'orientation_conversion',
    name: 'Orientation Conversion',
    category: 'Aerospace',
    description: 'Convert between Euler angles, DCM, and Quaternion representations',
    icon: 'E↔q',
    vectorSupport: 'full'
  },
  {
    id: 'units_conversion',
    name: 'Units Conversion',
    category: 'Aerospace',
    description: 'Convert between SI and American/Imperial engineering units',
    icon: 'U',
    vectorSupport: 'full'
  },
  {
    id: 'body2quaternion_rates',
    name: 'Body→Quat Rates',
    category: 'Aerospace',
    description: 'Convert body angular rates (P,Q,R) to quaternion rates given orientation quaternion',
    icon: 'ω→q̇',
    vectorSupport: 'full'
  },

  // Control Flow
  {
    id: 'if',
    name: 'If',
    category: 'Control',
    description: 'Conditional signal selection',
    icon: '?:',
    vectorSupport: 'full'
  },
  {
    id: 'condition',
    name: 'Condition',
    category: 'Control',
    description: 'Compare signal to constant',
    icon: 'x1 ? c',
    vectorSupport: 'scalar-only'
  },

  // Annotation
  {
    id: 'comment',
    name: 'Comment',
    category: 'Annotation',
    description: 'Text annotation with Markdown/LaTeX',
    icon: '📝'
  },

]

const categories = Array.from(new Set(blockTypes.map(block => block.category)))

interface DraggableBlockProps {
  blockType: BlockType
}

function DraggableBlock({ blockType }: DraggableBlockProps) {
  const { colorScheme } = useMantineColorScheme()
  const isDark = colorScheme === 'dark'

  const handleDragStart = (e: React.DragEvent) => {
    // Set the block type data for ReactFlow
    e.dataTransfer.setData('text/plain', blockType.id)
    e.dataTransfer.setData('application/reactflow', blockType.id)
    e.dataTransfer.effectAllowed = 'copy'

    // Create a custom drag image
    const dragImage = document.createElement('div')
    dragImage.className = 'p-2 bg-blue-500 text-white rounded shadow-lg'
    dragImage.textContent = blockType.name
    dragImage.style.position = 'absolute'
    dragImage.style.top = '-1000px'
    document.body.appendChild(dragImage)

    e.dataTransfer.setDragImage(dragImage, 0, 0)

    // Clean up the drag image after a short delay
    setTimeout(() => {
      document.body.removeChild(dragImage)
    }, 0)
  }

  // Get vector support badge
  const getVectorBadge = () => {
    switch (blockType.vectorSupport) {
      case 'full':
        return (
          <Badge size="xs" color="green" variant="light" title="Supports scalar and vector signals">
            V
          </Badge>
        )
      case 'element-wise':
        return (
          <Badge size="xs" color="blue" variant="light" title="Processes vectors element-wise">
            E
          </Badge>
        )
      case 'scalar-only':
        return (
          <Badge size="xs" color="yellow" variant="light" title="Scalar inputs only">
            S
          </Badge>
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
    <Paper
      draggable
      onDragStart={handleDragStart}
      p="sm"
      withBorder
      shadow="xs"
      style={{ cursor: 'grab' }}
      title={getTooltip()}
    >
      <Flex align="center" gap="sm" style={{ pointerEvents: 'none' }}>
        <Box
          w={32}
          h={32}
          style={(theme) => ({
            backgroundColor: isDark ? theme.colors.blue[9] : theme.colors.blue[1],
            borderRadius: theme.radius.sm,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'monospace',
            fontSize: theme.fontSizes.sm,
            color: isDark ? theme.colors.blue[2] : theme.colors.blue[7],
          })}
        >
          {blockType.icon}
        </Box>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap={8}>
            <Text size="sm" fw={500} truncate>
              {blockType.name}
            </Text>
            {getVectorBadge()}
          </Group>
          <Text size="xs" c="dimmed" truncate>
            {blockType.description}
          </Text>
        </Box>
      </Flex>
    </Paper>
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
    <Box w="100%" h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Text size="lg" fw={600} mb="sm">Block Library</Text>

        {/* Search */}
        <TextInput
          placeholder="Search blocks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.currentTarget.value)}
          leftSection={<IconSearch size={16} />}
          size="sm"
        />
      </Box>

      {/* Category Filter */}
      <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Group gap={4}>
          <Button
            size="xs"
            variant={!selectedCategory ? 'light' : 'subtle'}
            color={!selectedCategory ? 'blue' : 'gray'}
            onClick={() => setSelectedCategory(null)}
            radius="xl"
          >
            All
          </Button>
          {categories.map(category => (
            <Button
              key={category}
              size="xs"
              variant={selectedCategory === category ? 'light' : 'subtle'}
              color={selectedCategory === category ? 'blue' : 'gray'}
              onClick={() => setSelectedCategory(category)}
              radius="xl"
            >
              {category}
            </Button>
          ))}
        </Group>
      </Box>

      {/* Block List */}
      <ScrollArea style={{ flex: 1 }} p="md">
        <Stack gap="sm">
          {filteredBlocks.length === 0 ? (
            <Box py="xl" ta="center">
              <Text size="sm" c="dimmed">No blocks found</Text>
              <Text size="xs" c="dimmed" mt={4}>Try adjusting your search or filter</Text>
            </Box>
          ) : (
            filteredBlocks.map(blockType => (
              <DraggableBlock key={blockType.id} blockType={blockType} />
            ))
          )}
        </Stack>
      </ScrollArea>

      {/* Footer with Legend and Instructions */}
      <Box p="md" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
        <Text size="xs" c="dimmed" ta="center" mb="xs">
          <Text span fw={500}>Drag blocks onto the canvas</Text>
          <br />
          Click and hold to drag - Release over canvas to place
        </Text>
        <Group justify="center" gap="md">
          <Group gap={4}>
            <Badge size="xs" color="green" variant="light">V</Badge>
            <Text size="xs" c="dimmed">Vector</Text>
          </Group>
          <Group gap={4}>
            <Badge size="xs" color="blue" variant="light">E</Badge>
            <Text size="xs" c="dimmed">Element-wise</Text>
          </Group>
          <Group gap={4}>
            <Badge size="xs" color="yellow" variant="light">S</Badge>
            <Text size="xs" c="dimmed">Scalar only</Text>
          </Group>
        </Group>
      </Box>
    </Box>
  )
}

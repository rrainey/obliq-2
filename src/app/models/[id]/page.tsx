'use client'

import { useUser } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { Model } from '@/lib/types'
import { BlockData, PortInfo } from '@/components/Block'
import { WireData } from '@/components/Wire'
import Canvas from '@/components/Canvas'
import BlockLibrarySidebar from '@/components/BlockLibrarySidebar'
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface ModelEditorPageProps {
  params: Promise<{
    id: string
  }>
}

export default function ModelEditorPage({ params }: ModelEditorPageProps) {
  const { user, loading } = useUser()
  const router = useRouter()
  const [model, setModel] = useState<Model | null>(null)
  const [modelLoading, setModelLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<BlockData[]>([])
  const [wires, setWires] = useState<WireData[]>([])
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null)
  
  // Unwrap the params Promise
  const { id } = use(params)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (model?.data?.sheets?.[0]) {
      const sheet = model.data.sheets[0]
      setBlocks(sheet.blocks || [])
      setWires(sheet.connections || [])
    }
  }, [model])

  useEffect(() => {
    if (user && id) {
      fetchModel()
    }
  }, [user, id])

  const handleCanvasDrop = (x: number, y: number, blockType: string) => {
    const newBlock: BlockData = {
      id: `${blockType}_${Date.now()}`,
      type: blockType,
      name: `${blockType.charAt(0).toUpperCase() + blockType.slice(1)}${blocks.length + 1}`,
      position: { x, y }
    }
    
    setBlocks(prev => [...prev, newBlock])
    console.log('Block added:', newBlock)
  }

  const handleBlockMove = (blockId: string, position: { x: number; y: number }) => {
    setBlocks(prev => prev.map(block => 
      block.id === blockId ? { ...block, position } : block
    ))
  }

  const handleBlockSelect = (blockId: string | null) => {
    setSelectedBlockId(blockId)
    setSelectedWireId(null) // Deselect wire when selecting block
  }

  const handleWireCreate = (sourcePort: PortInfo, targetPort: PortInfo) => {
    const newWire: WireData = {
      id: `wire_${Date.now()}`,
      sourceBlockId: sourcePort.blockId,
      sourcePortIndex: sourcePort.portIndex,
      targetBlockId: targetPort.blockId,
      targetPortIndex: targetPort.portIndex
    }
    
    setWires(prev => [...prev, newWire])
    console.log('Wire created:', newWire)
  }

  const handleWireSelect = (wireId: string | null) => {
    setSelectedWireId(wireId)
    setSelectedBlockId(null) // Deselect block when selecting wire
  }

  const handleWireDelete = (wireId: string) => {
    setWires(prev => prev.filter(wire => wire.id !== wireId))
    setSelectedWireId(null)
    console.log('Wire deleted:', wireId)
  }

  const handleBlockDoubleClick = (blockId: string) => {
    console.log('Block double-clicked:', blockId)
    // TODO: Open properties panel in later tasks
  }

  const fetchModel = async () => {
    try {
      const { data, error } = await supabase
        .from('models')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          setError('Model not found')
        } else {
          throw error
        }
        return
      }

      setModel(data)
    } catch (error) {
      console.error('Error fetching model:', error)
      setError('Failed to load model')
    } finally {
      setModelLoading(false)
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            href="/models"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Back to Models
          </Link>
        </div>
      </div>
    )
  }

  if (modelLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading model...</div>
      </div>
    )
  }

  if (!model) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Model Not Found</h1>
          <Link
            href="/models"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Back to Models
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <Link
                href="/models"
                className="text-blue-600 hover:text-blue-800"
              >
                ← Back to Models
              </Link>
              <h1 className="text-xl font-semibold text-gray-900">
                {model.name}
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
                Save
              </button>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                Run Simulation
              </button>
              <button className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700">
                Generate Code
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex h-screen">
        {/* Block Library Sidebar */}
        <BlockLibrarySidebar />

        {/* Canvas Area */}
        <div className="flex-1 relative">
          <Canvas 
            blocks={blocks}
            wires={wires}
            selectedBlockId={selectedBlockId}
            selectedWireId={selectedWireId}
            onDrop={handleCanvasDrop}
            onBlockMove={handleBlockMove}
            onBlockSelect={handleBlockSelect}
            onBlockDoubleClick={handleBlockDoubleClick}
            onWireCreate={handleWireCreate}
            onWireSelect={handleWireSelect}
            onWireDelete={handleWireDelete}
          />
        </div>

        {/* Properties Panel */}
        <div className="w-64 bg-white shadow-sm border-l">
          <div className="p-4 border-b">
            <h2 className="text-lg font-medium text-gray-900">Properties</h2>
          </div>
          <div className="p-4">
            <p className="text-sm text-gray-500">Properties panel coming soon...</p>
          </div>
        </div>
      </div>
    </div>
  )
}
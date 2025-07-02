// app/models/page.tsx
'use client'

import { useUser } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { Model, ModelVersion, ModelWithVersion } from '@/lib/types'
import { createDefaultModel } from '@/lib/defaultModel'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { MoreVertical, Edit2, Trash2 } from 'lucide-react'

export default function ModelsPage() {
  const { user, loading } = useUser()
  const router = useRouter()
  const [models, setModels] = useState<ModelWithVersion[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [selectedVersions, setSelectedVersions] = useState<Record<string, number>>({})
  const [loadingVersions, setLoadingVersions] = useState<Record<string, boolean>>({})
  const [showNewModelDialog, setShowNewModelDialog] = useState(false)
  const [newModelName, setNewModelName] = useState('')
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (user) {
      fetchModels()
    }
  }, [user])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchModels = async () => {
    try {
      // Fetch models metadata
      const { data: modelsData, error: modelsError } = await supabase
        .from('models')
        .select('*')
        .order('updated_at', { ascending: false })

      if (modelsError) throw modelsError

      if (!modelsData || modelsData.length === 0) {
        setModels([])
        setModelsLoading(false)
        return
      }

      // Fetch available versions for each model
      const modelsWithVersions: ModelWithVersion[] = await Promise.all(
        modelsData.map(async (model) => {
          const { data: versions, error: versionsError } = await supabase
            .from('model_versions')
            .select('version')
            .eq('model_id', model.id)
            .gt('version', 0) // Exclude auto-save (version 0)
            .order('version', { ascending: false })

          if (versionsError) {
            console.error(`Error fetching versions for model ${model.id}:`, versionsError)
            return { ...model, availableVersions: [] }
          }

          return {
            ...model,
            availableVersions: versions?.map(v => v.version) || []
          }
        })
      )

      setModels(modelsWithVersions)
      
      // Initialize selected versions to latest for each model
      const initialVersions: Record<string, number> = {}
      modelsWithVersions.forEach(model => {
        initialVersions[model.id] = model.latest_version || 1
      })
      setSelectedVersions(initialVersions)
      
    } catch (error) {
      console.error('Error fetching models:', error)
    } finally {
      setModelsLoading(false)
    }
  }

  const createNewModel = async () => {
    if (!user || creating || !newModelName.trim()) return

    setCreating(true)
    try {
      const defaultData = createDefaultModel()

      // Create model metadata
      const { data: modelData, error: modelError } = await supabase
        .from('models')
        .insert({
          user_id: user.id,
          name: newModelName.trim(),
          latest_version: 1
        })
        .select()
        .single()

      if (modelError) throw modelError

      // Create version 1 with the default data
      const { error: versionError } = await supabase
        .from('model_versions')
        .insert({
          model_id: modelData.id,
          version: 1,
          data: defaultData
        })

      if (versionError) throw versionError

      // Navigate to the new model editor
      router.push(`/models/${modelData.id}`)
    } catch (error) {
      console.error('Error creating model:', error)
      alert('Failed to create model. Please try again.')
    } finally {
      setCreating(false)
      setShowNewModelDialog(false)
      setNewModelName('')
    }
  }

  const handleRename = async () => {
    if (!selectedModel || !renameValue.trim()) return

    try {
      const { error } = await supabase
        .from('models')
        .update({ name: renameValue.trim() })
        .eq('id', selectedModel.id)

      if (error) throw error

      // Update local state
      setModels(models.map(model => 
        model.id === selectedModel.id 
          ? { ...model, name: renameValue.trim() }
          : model
      ))

      setShowRenameDialog(false)
      setSelectedModel(null)
      setRenameValue('')
    } catch (error) {
      console.error('Error renaming model:', error)
      alert('Failed to rename model. Please try again.')
    }
  }

  const handleDelete = async () => {
    if (!selectedModel) return

    try {
      const { error } = await supabase
        .from('models')
        .delete()
        .eq('id', selectedModel.id)

      if (error) throw error

      // Update local state
      setModels(models.filter(model => model.id !== selectedModel.id))

      setShowDeleteDialog(false)
      setSelectedModel(null)
    } catch (error) {
      console.error('Error deleting model:', error)
      alert('Failed to delete model. Please try again.')
    }
  }

  const openRenameDialog = (model: Model) => {
    setSelectedModel(model)
    setRenameValue(model.name)
    setShowRenameDialog(true)
    setActiveDropdown(null)
  }

  const openDeleteDialog = (model: Model) => {
    setSelectedModel(model)
    setShowDeleteDialog(true)
    setActiveDropdown(null)
  }

  const handleVersionChange = (modelId: string, version: number) => {
    setSelectedVersions(prev => ({ ...prev, [modelId]: version }))
  }

  const handleModelClick = async (e: React.MouseEvent, model: ModelWithVersion) => {
    e.preventDefault()
    
    const selectedVersion = selectedVersions[model.id] || model.latest_version || 1
    
    // If selected version is different from latest, pass it as a query param
    if (selectedVersion !== model.latest_version) {
      router.push(`/models/${model.id}?version=${selectedVersion}`)
    } else {
      router.push(`/models/${model.id}`)
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="md:flex md:items-center md:justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold text-gray-900">My Models</h1>
            <p className="mt-2 text-gray-600">
              Visual modeling and simulation projects
            </p>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4 space-x-3">
            <button
              onClick={() => setShowNewModelDialog(true)}
              className="inline-flex items-center px-4 py-2 border-2 border-blue-600 rounded-md shadow-sm text-sm font-medium text-white bg-blue-700 hover:bg-blue-800"
            >
              New Model
            </button>
            <Link
              href="/tokens"
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <svg
                className="mr-2 h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
              API Keys
            </Link>
          </div>
        </div>

        <div className="mt-8">
          {modelsLoading ? (
            <div className="text-center py-12">
              <div className="text-lg text-gray-500">Loading models...</div>
            </div>
          ) : models.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-lg text-gray-500 mb-4">No models yet</div>
              <p className="text-gray-400">Create your first model to get started</p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {models.map((model) => (
                <div
                  key={model.id}
                  className="relative bg-white rounded-lg shadow hover:shadow-md transition-shadow"
                >
                  <div className="p-6 pb-20">
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {model.name}
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Updated {new Date(model.updated_at).toLocaleDateString()}
                    </p>
                    
                    {/* Version Selector */}
                    {model.availableVersions && model.availableVersions.length > 0 && (
                      <div className="mb-4">
                        <label className="text-xs text-gray-600 mb-1 block">Version</label>
                        <select
                          value={selectedVersions[model.id] || model.latest_version || 1}
                          onChange={(e) => handleVersionChange(model.id, parseInt(e.target.value))}
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {model.availableVersions.map(version => (
                            <option key={version} value={version}>
                              Version {version} {version === model.latest_version ? '(latest)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    
                    <button
                      onClick={(e) => handleModelClick(e, model)}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Open model →
                    </button>
                  </div>
                  
                  {/* Dropdown menu */}
                  <div className="absolute top-2 right-2" ref={dropdownRef}>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        setActiveDropdown(activeDropdown === model.id ? null : model.id)
                      }}
                      className="p-2 hover:bg-gray-100 rounded-full"
                    >
                      <MoreVertical className="w-5 h-5 text-gray-500" />
                    </button>
                    
                    {activeDropdown === model.id && (
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                        <button
                          onClick={() => openRenameDialog(model)}
                          className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        >
                          <Edit2 className="w-4 h-4 mr-2" />
                          Rename
                        </button>
                        <button
                          onClick={() => openDeleteDialog(model)}
                          className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New Model Dialog */}
      {showNewModelDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Create New Model</h2>
            <input
              type="text"
              value={newModelName}
              onChange={(e) => setNewModelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newModelName.trim()) {
                  createNewModel()
                }
              }}
              placeholder="Enter model name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="mt-4 flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowNewModelDialog(false)
                  setNewModelName('')
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={createNewModel}
                disabled={!newModelName.trim() || creating}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Dialog */}
      {showRenameDialog && selectedModel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Rename Model</h2>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameValue.trim()) {
                  handleRename()
                }
              }}
              placeholder="Enter new name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="mt-4 flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowRenameDialog(false)
                  setSelectedModel(null)
                  setRenameValue('')
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                disabled={!renameValue.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && selectedModel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Delete Model</h2>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete "{selectedModel.name}"? This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowDeleteDialog(false)
                  setSelectedModel(null)
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
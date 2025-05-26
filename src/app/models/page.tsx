'use client'

import { useUser } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { Model } from '@/lib/types'
import { createDefaultModel } from '@/lib/defaultModel'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ModelsPage() {
  const { user, loading } = useUser()
  const router = useRouter()
  const [models, setModels] = useState<Model[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const [creating, setCreating] = useState(false)

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

  const fetchModels = async () => {
    try {
      const { data, error } = await supabase
        .from('models')
        .select('*')
        .order('updated_at', { ascending: false })

      if (error) throw error
      setModels(data || [])
    } catch (error) {
      console.error('Error fetching models:', error)
    } finally {
      setModelsLoading(false)
    }
  }

  const createNewModel = async () => {
    if (!user || creating) return

    setCreating(true)
    try {
      const defaultData = createDefaultModel()
      const modelName = `New Model ${new Date().toLocaleDateString()}`

      const { data, error } = await supabase
        .from('models')
        .insert({
          user_id: user.id,
          name: modelName,
          data: defaultData
        })
        .select()
        .single()

      if (error) throw error

      // Navigate to the new model editor
      router.push(`/models/${data.id}`)
    } catch (error) {
      console.error('Error creating model:', error)
      alert('Failed to create model. Please try again.')
    } finally {
      setCreating(false)
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
          <div className="mt-4 flex md:mt-0 md:ml-4">
            <button
              onClick={createNewModel}
              disabled={creating}
              className="inline-flex items-center px-4 py-2 border-2 border-blue-600 rounded-md shadow-sm text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating...' : 'New Model'}
            </button>
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
                <Link
                  key={model.id}
                  href={`/models/${model.id}`}
                  className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow"
                >
                  <div className="p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {model.name}
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Updated {new Date(model.updated_at).toLocaleDateString()}
                    </p>
                    <div className="text-sm text-blue-600 hover:text-blue-800">
                      Open model →
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
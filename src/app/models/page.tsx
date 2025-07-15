// app/models/page.tsx
'use client'

import { useUser } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { Model, ModelVersion, ModelWithVersion } from '@/lib/types'
import { createDefaultModel } from '@/lib/defaultModel'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  Container, 
  Title, 
  Text, 
  Button, 
  Grid, 
  Card, 
  Select, 
  Menu, 
  ActionIcon,
  Modal,
  TextInput,
  Group,
  Stack,
  Center,
  Loader,
  Box
} from '@mantine/core'
import { 
  IconDotsVertical, 
  IconEdit, 
  IconTrash, 
  IconPlus,
  IconKey,
  IconArrowRight
} from '@tabler/icons-react'

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
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [renameValue, setRenameValue] = useState('')

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
  }

  const openDeleteDialog = (model: Model) => {
    setSelectedModel(model)
    setShowDeleteDialog(true)
  }

  const handleVersionChange = (modelId: string, version: string | null) => {
    if (version) {
      setSelectedVersions(prev => ({ ...prev, [modelId]: parseInt(version) }))
    }
  }

  const handleModelOpen = async (model: ModelWithVersion) => {
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
      <Center h="100vh">
        <Loader size="lg" />
      </Center>
    )
  }

  return (
    <Box mih="100vh" style={{ backgroundColor: '#f8f9fa' }}>
      <Container size="xl" py="xl">
        <Group justify="space-between" mb="xl">
          <div>
            <Title order={1} size="h2">My Models</Title>
            <Text c="dimmed" mt="xs">
              Visual modeling and simulation projects
            </Text>
          </div>
          <Group>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setShowNewModelDialog(true)}
            >
              New Model
            </Button>
            <Button
              component={Link}
              href="/tokens"
              variant="default"
              leftSection={<IconKey size={16} />}
            >
              API Keys
            </Button>
          </Group>
        </Group>

        {modelsLoading ? (
          <Center py={60}>
            <Stack align="center">
              <Loader size="lg" />
              <Text c="dimmed">Loading models...</Text>
            </Stack>
          </Center>
        ) : models.length === 0 ? (
          <Center py={60}>
            <Stack align="center">
              <Text size="lg" c="dimmed" mb="xs">No models yet</Text>
              <Text c="dimmed">Create your first model to get started</Text>
            </Stack>
          </Center>
        ) : (
          <Grid>
            {models.map((model) => (
              <Grid.Col key={model.id} span={{ base: 12, sm: 6, lg: 4 }}>
                <Card shadow="sm" radius="md" withBorder h={180} >
                  <Stack gap="xs" h="100%">
                    <Group justify="space-between" align="flex-start">
                      <div style={{ flex: 1 }}>
                        <Text fw={500} size="lg" lineClamp={1}>
                          {model.name}
                        </Text>
                        <Text size="sm" c="dimmed">
                          Updated {new Date(model.updated_at).toLocaleDateString()}
                        </Text>
                      </div>
                      <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray">
                            <IconDotsVertical size={18} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<IconEdit size={16} />}
                            onClick={() => openRenameDialog(model)}
                          >
                            Rename
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconTrash size={16} />}
                            color="red"
                            onClick={() => openDeleteDialog(model)}
                          >
                            Delete
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>

                    <Button
                      variant="light"
                      rightSection={<IconArrowRight size={16} />}
                      onClick={() => handleModelOpen(model)}
                      fullWidth
                    >
                      Open Model
                    </Button>

                    {model.availableVersions && model.availableVersions.length > 0 && (
                      <Select
                        size="xs"
                        value={String(selectedVersions[model.id] || model.latest_version || 1)}
                        onChange={(value) => handleVersionChange(model.id, value)}
                        data={model.availableVersions.map(version => ({
                          value: String(version),
                          label: `Version ${version}${version === model.latest_version ? ' (latest)' : ''}`
                        }))}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </Stack>
                </Card>
              </Grid.Col>
            ))}
          </Grid>
        )}
      </Container>

      {/* New Model Modal */}
      <Modal
        opened={showNewModelDialog}
        onClose={() => {
          setShowNewModelDialog(false)
          setNewModelName('')
        }}
        title="Create New Model"
        centered
      >
        <Stack>
          <TextInput
            value={newModelName}
            onChange={(e) => setNewModelName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newModelName.trim()) {
                createNewModel()
              }
            }}
            placeholder="Enter model name"
            data-autofocus
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setShowNewModelDialog(false)
                setNewModelName('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={createNewModel}
              disabled={!newModelName.trim() || creating}
              loading={creating}
            >
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Rename Modal */}
      <Modal
        opened={showRenameDialog && !!selectedModel}
        onClose={() => {
          setShowRenameDialog(false)
          setSelectedModel(null)
          setRenameValue('')
        }}
        title="Rename Model"
        centered
      >
        <Stack>
          <TextInput
            value={renameValue}
            onChange={(e) => setRenameValue(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameValue.trim()) {
                handleRename()
              }
            }}
            placeholder="Enter new name"
            data-autofocus
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setShowRenameDialog(false)
                setSelectedModel(null)
                setRenameValue('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={!renameValue.trim()}
            >
              Rename
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={showDeleteDialog && !!selectedModel}
        onClose={() => {
          setShowDeleteDialog(false)
          setSelectedModel(null)
        }}
        title="Delete Model"
        centered
      >
        <Stack>
          <Text>
            Are you sure you want to delete "{selectedModel?.name}"? This action cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setShowDeleteDialog(false)
                setSelectedModel(null)
              }}
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleDelete}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  )
}
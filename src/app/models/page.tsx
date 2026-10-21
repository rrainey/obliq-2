// app/models/page.tsx
'use client'

import { useUser } from '@/lib/auth'
import { modelApi, type ModelListItem } from '@/lib/modelApi'
import { Model } from '@/lib/types'
import { createDefaultModel } from '@/lib/defaultModel'
import {
  parseModelImportFile,
  ModelImportError,
  type ImportedModelPayload,
} from '@/lib/modelImport'
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
  Box,
  Badge,
  Tooltip,
  Alert,
  useMantineColorScheme,
  useComputedColorScheme
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconDotsVertical,
  IconEdit,
  IconTrash,
  IconPlus,
  IconKey,
  IconArrowRight,
  IconCopy,
  IconSun,
  IconMoon,
  IconFileImport,
  IconLink,
  IconLinkOff
} from '@tabler/icons-react'

export default function ModelsPage() {
  const { user, loading, error: sessionError } = useUser()
  const router = useRouter()
  const { setColorScheme } = useMantineColorScheme()
  const computedColorScheme = useComputedColorScheme('light', { getInitialValueInEffect: true })
  const [models, setModels] = useState<ModelListItem[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [selectedVersions, setSelectedVersions] = useState<Record<string, number>>({})
  const [loadingVersions, setLoadingVersions] = useState<Record<string, boolean>>({})
  const [showNewModelDialog, setShowNewModelDialog] = useState(false)
  const [newModelName, setNewModelName] = useState('')
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  // Models that reference the one being deleted (null while checking)
  const [deleteDependents, setDeleteDependents] = useState<Array<{ id: string; name: string }> | null>(null)
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [duplicateName, setDuplicateName] = useState('')
  const [duplicating, setDuplicating] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importName, setImportName] = useState('')
  const [importPayload, setImportPayload] = useState<ImportedModelPayload | null>(null)
  const [importFileLabel, setImportFileLabel] = useState('')
  const [importing, setImporting] = useState(false)
  const [importParseError, setImportParseError] = useState<string | null>(null)
  const importFileInputRef = useRef<HTMLInputElement>(null)
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [linkPath, setLinkPath] = useState('')
  const [linkName, setLinkName] = useState('')
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      fetchModels()
    }
  }, [user])

  const fetchModels = async () => {
    try {
      // Models come back ordered by updated_at desc, with availableVersions (desc)
      const modelsWithVersions = await modelApi.list()

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

      // Create the model (writes its file and version 1)
      const modelData = await modelApi.create(newModelName.trim(), defaultData)

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
      await modelApi.rename(selectedModel.id, renameValue.trim())

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
      await modelApi.remove(selectedModel.id)

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
    setDeleteDependents(null)
    setShowDeleteDialog(true)
    modelApi.dependents(model.id).then(setDeleteDependents).catch(() => setDeleteDependents([]))
  }

  const openDuplicateDialog = (model: Model) => {
    setSelectedModel(model)
    setDuplicateName(`${model.name} (Copy)`)
    setShowDuplicateDialog(true)
  }

  const handleDuplicate = async () => {
    if (!selectedModel || !user || duplicating || !duplicateName.trim()) return

    setDuplicating(true)
    try {
      // Get the selected version (or latest) for the model to duplicate
      const selectedVersion = selectedVersions[selectedModel.id] || selectedModel.latest_version || 1

      // Duplicate the current model file, or the selected snapshot if an older version is selected
      await modelApi.duplicate(
        selectedModel.id,
        duplicateName.trim(),
        selectedVersion !== selectedModel.latest_version ? selectedVersion : undefined
      )

      // Refresh the models list
      await fetchModels()

      setShowDuplicateDialog(false)
      setSelectedModel(null)
      setDuplicateName('')
    } catch (error) {
      console.error('Error duplicating model:', error)
      alert('Failed to duplicate model. Please try again.')
    } finally {
      setDuplicating(false)
    }
  }

  const handleVersionChange = (modelId: string, version: string | null) => {
    if (version) {
      setSelectedVersions(prev => ({ ...prev, [modelId]: parseInt(version) }))
    }
  }

  const resetImportDialog = () => {
    setShowImportDialog(false)
    setImportName('')
    setImportPayload(null)
    setImportFileLabel('')
    setImportParseError(null)
    if (importFileInputRef.current) {
      importFileInputRef.current.value = ''
    }
  }

  const openImportDialog = () => {
    setImportName('')
    setImportPayload(null)
    setImportFileLabel('')
    setImportParseError(null)
    setShowImportDialog(true)
  }

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportParseError(null)
    setImportPayload(null)
    setImportFileLabel(file.name)

    try {
      const payload = await parseModelImportFile(file)
      setImportPayload(payload)
      setImportName(payload.name)
    } catch (error) {
      const message =
        error instanceof ModelImportError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Failed to read model file'
      setImportParseError(message)
      setImportPayload(null)
    }
  }

  const handleImportModel = async () => {
    if (!user || importing || !importPayload || !importName.trim()) return

    setImporting(true)
    try {
      const modelData = await modelApi.create(importName.trim(), importPayload.data)

      notifications.show({
        title: 'Model imported',
        message: `"${importName.trim()}" created as a new model`,
        color: 'green',
      })

      resetImportDialog()
      router.push(`/models/${modelData.id}`)
    } catch (error) {
      console.error('Error importing model:', error)
      notifications.show({
        title: 'Import failed',
        message: error instanceof Error ? error.message : 'Failed to import model',
        color: 'red',
      })
    } finally {
      setImporting(false)
    }
  }

  const resetLinkDialog = () => {
    setShowLinkDialog(false)
    setLinkPath('')
    setLinkName('')
    setLinkError(null)
  }

  // Register an existing model JSON file in place (it is read and saved where it lives)
  const handleLinkFile = async () => {
    if (linking || !linkPath.trim()) return

    setLinking(true)
    setLinkError(null)
    try {
      const model = await modelApi.link(linkPath.trim(), linkName.trim() || undefined)
      notifications.show({
        title: 'File linked',
        message: `"${model.name}" opens and saves ${model.file_path}`,
        color: 'green',
      })
      resetLinkDialog()
      router.push(`/models/${model.id}`)
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : 'Failed to link file')
    } finally {
      setLinking(false)
    }
  }

  // Detach a linked model: copy its current content into Obliq storage
  const handleUnlink = async (model: ModelListItem) => {
    try {
      await modelApi.unlink(model.id)
      notifications.show({
        title: 'Copied into Obliq storage',
        message: `"${model.name}" no longer reads or writes ${model.file_path}`,
        color: 'green',
      })
      await fetchModels()
    } catch (error) {
      notifications.show({
        title: 'Unlink failed',
        message: error instanceof Error ? error.message : 'Failed to unlink model',
        color: 'red',
      })
    }
  }

  const handleModelOpen = async (model: ModelListItem) => {
    const selectedVersion = selectedVersions[model.id] || model.latest_version || 1
    
    // If selected version is different from latest, pass it as a query param
    if (selectedVersion !== model.latest_version) {
      router.push(`/models/${model.id}?version=${selectedVersion}`)
    } else {
      router.push(`/models/${model.id}`)
    }
  }

  if (!loading && !user) {
    return (
      <Center h="100vh">
        <Text c="red">{sessionError || 'Could not start local session'}</Text>
      </Center>
    )
  }

  if (loading || !user) {
    return (
      <Center h="100vh">
        <Loader size="lg" />
      </Center>
    )
  }

  const toggleColorScheme = () => {
    setColorScheme(computedColorScheme === 'light' ? 'dark' : 'light')
  }

  return (
    <Box mih="100vh" bg={computedColorScheme === 'dark' ? 'dark.8' : 'gray.0'}>
      <Container size="xl" py="xl">
        <Group justify="space-between" mb="xl">
          <div>
            <Title order={1} size="h2">My Models</Title>
            <Text c="dimmed" mt="xs">
              Visual modeling and simulation projects
            </Text>
          </div>
          <Group>
            <ActionIcon
              onClick={toggleColorScheme}
              variant="default"
              size="lg"
              aria-label="Toggle color scheme"
            >
              {computedColorScheme === 'light' ? <IconMoon size={18} /> : <IconSun size={18} />}
            </ActionIcon>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setShowNewModelDialog(true)}
            >
              New Model
            </Button>
            <Button
              variant="default"
              leftSection={<IconFileImport size={16} />}
              onClick={openImportDialog}
            >
              Import
            </Button>
            <Button
              variant="default"
              leftSection={<IconLink size={16} />}
              onClick={() => setShowLinkDialog(true)}
            >
              Link File
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
              <Text c="dimmed" mb="md">
                Create a new model or import a JSON export / sample fixture
              </Text>
              <Group>
                <Button leftSection={<IconPlus size={16} />} onClick={() => setShowNewModelDialog(true)}>
                  New Model
                </Button>
                <Button
                  variant="default"
                  leftSection={<IconFileImport size={16} />}
                  onClick={openImportDialog}
                >
                  Import Model
                </Button>
              </Group>
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
                        <Group gap={6} wrap="nowrap">
                          <Text fw={500} size="lg" lineClamp={1}>
                            {model.name}
                          </Text>
                          {model.storage_kind === 'linked' && (
                            <Tooltip label={model.file_path || 'Linked file'} withinPortal>
                              <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
                                linked
                              </Badge>
                            </Tooltip>
                          )}
                          {model.file_missing && (
                            <Tooltip label={`File not found: ${model.file_path}`} withinPortal>
                              <Badge size="xs" variant="filled" color="red" style={{ flexShrink: 0 }}>
                                missing
                              </Badge>
                            </Tooltip>
                          )}
                        </Group>
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
                            leftSection={<IconCopy size={16} />}
                            onClick={() => openDuplicateDialog(model)}
                          >
                            Duplicate...
                          </Menu.Item>
                          {model.storage_kind === 'linked' && (
                            <Menu.Item
                              leftSection={<IconLinkOff size={16} />}
                              onClick={() => handleUnlink(model)}
                              disabled={model.file_missing}
                            >
                              Copy into Obliq storage
                            </Menu.Item>
                          )}
                          <Menu.Divider />
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

      {/* Link File Modal */}
      <Modal opened={showLinkDialog} onClose={resetLinkDialog} title="Link Model File" centered>
        <Stack>
          <Text size="sm" c="dimmed">
            Register a model JSON file that lives elsewhere on this machine (for example, one generated
            by a script). Obliq opens and saves it in place, keeping its format; version history and
            autosave are stored under ~/.config/obliq-2.
          </Text>
          <TextInput
            label="Absolute file path"
            placeholder="/home/you/src/project/model.json"
            value={linkPath}
            onChange={(e) => setLinkPath(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLinkFile()
            }}
            error={linkError}
            data-autofocus
          />
          <TextInput
            label="Name (optional)"
            description="Defaults to the name in the file, or the file name"
            value={linkName}
            onChange={(e) => setLinkName(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={resetLinkDialog}>
              Cancel
            </Button>
            <Button onClick={handleLinkFile} loading={linking} disabled={!linkPath.trim()}>
              Link
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
            Are you sure you want to delete &quot;{selectedModel?.name}&quot;? This action cannot be undone.
          </Text>
          {selectedModel?.storage_kind === 'linked' && (
            <Text size="sm" c="dimmed">
              The linked file <code>{selectedModel.file_path}</code> is not deleted; only its Obliq
              version history and autosave are removed.
            </Text>
          )}
          {deleteDependents && deleteDependents.length > 0 && (
            <Alert color="orange" variant="light" title="Other models use this model">
              {deleteDependents.map(d => d.name).join(', ')}{' '}
              {deleteDependents.length === 1 ? 'embeds' : 'embed'} it through a model reference. After deleting,{' '}
              {deleteDependents.length === 1 ? 'that reference shows' : 'those references show'} “missing” and{' '}
              {deleteDependents.length === 1 ? 'that model' : 'those models'} will not build until you choose another model.
            </Alert>
          )}
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

      {/* Duplicate Model Modal */}
      <Modal
        opened={showDuplicateDialog && !!selectedModel}
        onClose={() => {
          setShowDuplicateDialog(false)
          setSelectedModel(null)
          setDuplicateName('')
        }}
        title="Duplicate Model"
        centered
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Create a copy of &ldquo;{selectedModel?.name}&rdquo;
          </Text>
          <TextInput
            label="New Model Name"
            value={duplicateName}
            onChange={(e) => setDuplicateName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && duplicateName.trim()) {
                handleDuplicate()
              }
            }}
            placeholder="Enter name for the duplicate"
            data-autofocus
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setShowDuplicateDialog(false)
                setSelectedModel(null)
                setDuplicateName('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDuplicate}
              disabled={!duplicateName.trim() || duplicating}
              loading={duplicating}
            >
              Duplicate
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Import Model Modal */}
      <Modal
        opened={showImportDialog}
        onClose={resetImportDialog}
        title="Import Model"
        centered
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Import creates a <strong>new</strong> model from an obliq-2 export or a sample
            fixture under <code>docs/sample-models/</code> (e.g. Saturn slices). It does not
            replace an existing model.
          </Text>

          <input
            ref={importFileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleImportFileChange}
          />

          <Group>
            <Button
              variant="default"
              leftSection={<IconFileImport size={16} />}
              onClick={() => importFileInputRef.current?.click()}
            >
              Choose JSON file
            </Button>
            {importFileLabel && (
              <Text size="sm" c="dimmed" style={{ flex: 1 }} lineClamp={1}>
                {importFileLabel}
              </Text>
            )}
          </Group>

          {importParseError && (
            <Text size="sm" c="red">
              {importParseError}
            </Text>
          )}

          {importPayload && !importParseError && (
            <Text size="sm" c="dimmed">
              Detected {importPayload.sourceLabel}
              {Array.isArray(importPayload.data.sheets)
                ? ` · ${(importPayload.data.sheets as unknown[]).length} sheet(s)`
                : ''}
            </Text>
          )}

          <TextInput
            label="Model name"
            value={importName}
            onChange={(e) => setImportName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && importPayload && importName.trim()) {
                handleImportModel()
              }
            }}
            placeholder="Name for the new model"
            disabled={!importPayload}
            data-autofocus={!!importPayload}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={resetImportDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleImportModel}
              disabled={!importPayload || !importName.trim() || importing}
              loading={importing}
            >
              Import
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  )
}
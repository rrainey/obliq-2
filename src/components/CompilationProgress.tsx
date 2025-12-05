/**
 * Compilation Progress Component
 *
 * Displays real-time compilation progress with Server-Sent Events
 */

'use client'

import { useState, useEffect } from 'react'
import { Progress, Text, Stack, Paper, Group, Badge, Loader } from '@mantine/core'
import { IconCheck, IconClock, IconRocket } from '@tabler/icons-react'

interface CompilationProgressProps {
  modelId: string
  version?: number  // Optional version - 0 for auto-save, undefined for latest saved version
  optimizationLevel?: 'O0' | 'O1' | 'O2' | 'O3'
  onComplete?: (result: { wasmData: string; jsData: string; metadata: any }) => void
  onError?: (error: string, details?: string) => void
}

interface ProgressEvent {
  step: string
  progress: number
  message: string
}

const STEP_DESCRIPTIONS: Record<string, string> = {
  'fetch': 'Fetching model...',
  'cache-check': 'Checking cache...',
  'cache-hit': 'Cache hit!',
  'cache-miss': 'Cache miss',
  'codegen': 'Generating C code...',
  'codegen-complete': 'Code generated',
  'write-files': 'Writing files...',
  'compile': 'Compiling to WASM...',
  'compile-complete': 'Compiled successfully',
  'read-output': 'Reading output...',
  'cache-store': 'Caching result...',
  'complete': 'Complete!'
}

export default function CompilationProgress({
  modelId,
  version,
  optimizationLevel = 'O2',
  onComplete,
  onError
}: CompilationProgressProps) {
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState<string>('')
  const [message, setMessage] = useState<string>('Starting compilation...')
  const [isComplete, setIsComplete] = useState(false)
  const [isCacheHit, setIsCacheHit] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startTime] = useState(Date.now())
  const [elapsedTime, setElapsedTime] = useState(0)

  useEffect(() => {
    // Update elapsed time every 100ms
    const timer = setInterval(() => {
      setElapsedTime(Date.now() - startTime)
    }, 100)

    return () => clearInterval(timer)
  }, [startTime])

  useEffect(() => {
    // SSE doesn't support POST, so we need to use fetch with streaming
    const controller = new AbortController()

    const startStreaming = async () => {
      try {
        const response = await fetch('/api/compile-wasm-stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            modelId,
            version,
            optimizationLevel
          }),
          signal: controller.signal
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) {
          throw new Error('No response body')
        }

        let buffer = ''
        let currentEvent = ''

        while (true) {
          const { done, value } = await reader.read()

          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')

          // Keep last incomplete line in buffer
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.substring(7).trim()
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6))

                if (currentEvent === 'progress') {
                  handleProgress(data)
                } else if (currentEvent === 'complete') {
                  handleComplete(data)
                } else if (currentEvent === 'error') {
                  handleError(data)
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', e)
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          setError('Connection error')
          setMessage('Connection error')
          if (onError) {
            onError('Connection error')
          }
        }
      }
    }

    // Helper functions
    const handleProgress = (data: ProgressEvent) => {
      setProgress(data.progress)
      setCurrentStep(data.step)
      setMessage(data.message)

      if (data.step === 'cache-hit') {
        setIsCacheHit(true)
      }
    }

    const handleComplete = (data: any) => {
      setIsComplete(true)
      setProgress(100)
      setMessage('Compilation complete!')

      if (onComplete) {
        onComplete(data)
      }
    }

    const handleError = (data: any) => {
      setError(data.error)
      setMessage(`Error: ${data.error}`)

      if (onError) {
        onError(data.error, data.details)
      }
    }

    startStreaming()

    // Cleanup
    return () => {
      controller.abort()
    }
  }, [modelId, version, optimizationLevel, onComplete, onError])

  const formatTime = (ms: number) => {
    if (ms < 1000) {
      return `${ms}ms`
    }
    return `${(ms / 1000).toFixed(1)}s`
  }

  const getStepColor = () => {
    if (error) return 'red'
    if (isComplete) return 'green'
    if (isCacheHit) return 'blue'
    return 'cyan'
  }

  const getStepDescription = () => {
    return STEP_DESCRIPTIONS[currentStep] || message
  }

  return (
    <Paper p="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={600} size="sm">
            {error ? 'Compilation Failed' : isComplete ? 'Compilation Complete' : 'Compiling...'}
          </Text>

          {isCacheHit && !error && (
            <Badge color="blue" variant="light" leftSection={<IconRocket size={12} />}>
              Cache Hit
            </Badge>
          )}

          {!error && (
            <Group gap="xs">
              <IconClock size={14} />
              <Text size="xs" c="dimmed">
                {formatTime(elapsedTime)}
              </Text>
            </Group>
          )}
        </Group>

        <Progress value={progress} size="lg" color={getStepColor()} animated={!isComplete && !error} />

        <Group justify="space-between">
          <Text size="sm" c={error ? 'red' : 'dimmed'}>
            {getStepDescription()}
          </Text>

          {!error && !isComplete && (
            <Loader size="xs" />
          )}

          {isComplete && (
            <IconCheck size={16} color="green" />
          )}
        </Group>

        {error && (
          <Text size="xs" c="red">
            {error}
          </Text>
        )}
      </Stack>
    </Paper>
  )
}

// components/SimulationSettingsPanel.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Paper, Text, NumberInput, Stack, Checkbox, Tooltip, SegmentedControl, Group } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import type { IntegrationAlgorithm } from '@/lib/modelSchema'

interface SimulationSettingsPanelProps {
  initialDuration: number
  initialTimeStep: number
  initialIntegrationAlgorithm?: IntegrationAlgorithm
  onChange: (settings: { duration: string; timeStep: string; integrationAlgorithm?: IntegrationAlgorithm }) => void
  useWorker?: boolean
  onWorkerChange?: (useWorker: boolean) => void
  workerAvailable?: boolean
  forceRecompile?: boolean
  onForceRecompileChange?: (forceRecompile: boolean) => void
}

export function validateSimulationSettings(duration: string, timeStep: string) {
  const errors: string[] = []
  
  const durationNum = parseFloat(duration)
  const timeStepNum = parseFloat(timeStep)
  
  if (isNaN(durationNum) || durationNum <= 0) {
    errors.push('Duration must be a positive number')
  }
  
  if (isNaN(timeStepNum) || timeStepNum <= 0) {
    errors.push('Time step must be a positive number')
  }
  
  if (!isNaN(durationNum) && !isNaN(timeStepNum)) {
    if (timeStepNum > durationNum) {
      errors.push('Time step cannot be larger than duration')
    }
    
    const steps = durationNum / timeStepNum
    if (steps > 1000000) {
      errors.push('Too many simulation steps (>1,000,000). Increase time step or decrease duration.')
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

export default function SimulationSettingsPanel({
  initialDuration,
  initialTimeStep,
  initialIntegrationAlgorithm = 'rk4',
  onChange,
  useWorker = false,
  onWorkerChange,
  workerAvailable = false,
  forceRecompile = false,
  onForceRecompileChange
}: SimulationSettingsPanelProps) {
  const [duration, setDuration] = useState<number | string>(initialDuration)
  const [timeStep, setTimeStep] = useState<number | string>(initialTimeStep)
  const [integrationAlgorithm, setIntegrationAlgorithm] = useState<IntegrationAlgorithm>(initialIntegrationAlgorithm)

  // Use useCallback to prevent onChange from being recreated
  const debouncedOnChange = useCallback((
    newDuration: number | string,
    newTimeStep: number | string,
    newAlgorithm: IntegrationAlgorithm
  ) => {
    const timer = setTimeout(() => {
      onChange({
        duration: newDuration.toString(),
        timeStep: newTimeStep.toString(),
        integrationAlgorithm: newAlgorithm
      })
    }, 100)

    return () => clearTimeout(timer)
  }, [onChange])

  // Handle duration change
  const handleDurationChange = useCallback((value: number | string) => {
    setDuration(value)
    debouncedOnChange(value, timeStep, integrationAlgorithm)
  }, [timeStep, integrationAlgorithm, debouncedOnChange])

  // Handle time step change
  const handleTimeStepChange = useCallback((value: number | string) => {
    setTimeStep(value)
    debouncedOnChange(duration, value, integrationAlgorithm)
  }, [duration, integrationAlgorithm, debouncedOnChange])

  // Handle integration algorithm change
  const handleAlgorithmChange = useCallback((value: string) => {
    const algo = value as IntegrationAlgorithm
    setIntegrationAlgorithm(algo)
    debouncedOnChange(duration, timeStep, algo)
  }, [duration, timeStep, debouncedOnChange])
  
  return (
    <Paper p="sm" withBorder>
      <Text fw={600} mb="sm">Simulation Settings</Text>
      <Stack gap="sm">
        <NumberInput
          label="Duration (seconds)"
          value={duration}
          onChange={handleDurationChange}
          min={0.001}
          max={10000}
          step={1}
          decimalScale={3}
          size="sm"
          description="Total simulation time"
        />
        
        <NumberInput
          label="Time Step (seconds)"
          value={timeStep}
          onChange={handleTimeStepChange}
          min={0.0001}
          max={1}
          step={0.001}
          decimalScale={4}
          size="sm"
          description="Integration time step"
        />

        {/* Integration Algorithm Selection */}
        <div>
          <Text size="sm" fw={500} mb={4}>Integration Algorithm</Text>
          <SegmentedControl
            value={integrationAlgorithm}
            onChange={handleAlgorithmChange}
            data={[
              { label: 'RK4 (4th Order)', value: 'rk4' },
              { label: 'Euler (1st Order)', value: 'euler' }
            ]}
            size="xs"
            fullWidth
          />
          <Text size="xs" c="dimmed" mt={4}>
            {integrationAlgorithm === 'rk4'
              ? 'Higher accuracy, recommended for most applications'
              : 'Faster but less accurate, suitable for simple systems'}
          </Text>
        </div>

        {/* Show calculated steps */}
        {typeof duration === 'number' && typeof timeStep === 'number' && timeStep > 0 && (
          <Text size="xs" c="dimmed">
            Steps: {Math.ceil(duration / timeStep).toLocaleString()}
          </Text>
        )}

        {/* Web Worker toggle */}
        {onWorkerChange && (
          <Tooltip
            label={
              workerAvailable
                ? 'Run simulation in background thread for responsive UI (experimental)'
                : 'Web Workers not available in this browser'
            }
            withArrow
          >
            <Checkbox
              label={
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Use Web Worker
                  <IconInfoCircle size={14} style={{ opacity: 0.6 }} />
                </span>
              }
              checked={useWorker}
              onChange={(e) => {
                const newValue = e.currentTarget.checked
                onWorkerChange(newValue)
                // Store preference in localStorage
                if (typeof window !== 'undefined') {
                  localStorage.setItem('obliq-use-workers', String(newValue))
                }
              }}
              disabled={!workerAvailable}
              size="sm"
            />
          </Tooltip>
        )}

        {/* Force Recompile toggle */}
        {onForceRecompileChange && (
          <Tooltip
            label="Bypass WASM cache and force fresh compilation. Use this if you suspect stale compiled code."
            withArrow
            multiline
            w={250}
          >
            <Checkbox
              label={
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Force Recompile
                  <IconInfoCircle size={14} style={{ opacity: 0.6 }} />
                </span>
              }
              checked={forceRecompile}
              onChange={(e) => onForceRecompileChange(e.currentTarget.checked)}
              size="sm"
            />
          </Tooltip>
        )}
      </Stack>
    </Paper>
  )
}
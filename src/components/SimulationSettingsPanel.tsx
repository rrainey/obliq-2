// components/SimulationSettingsPanel.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { Paper, Text, NumberInput, Stack, Checkbox, Tooltip } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'

interface SimulationSettingsPanelProps {
  initialDuration: number
  initialTimeStep: number
  onChange: (settings: { duration: string; timeStep: string }) => void
  useWorker?: boolean
  onWorkerChange?: (useWorker: boolean) => void
  workerAvailable?: boolean
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
  onChange,
  useWorker = false,
  onWorkerChange,
  workerAvailable = false
}: SimulationSettingsPanelProps) {
  const [duration, setDuration] = useState<number | string>(initialDuration)
  const [timeStep, setTimeStep] = useState<number | string>(initialTimeStep)
  
  // Use useCallback to prevent onChange from being recreated
  const debouncedOnChange = useCallback((newDuration: number | string, newTimeStep: number | string) => {
    const timer = setTimeout(() => {
      onChange({
        duration: newDuration.toString(),
        timeStep: newTimeStep.toString()
      })
    }, 100)
    
    return () => clearTimeout(timer)
  }, [onChange])
  
  // Handle duration change
  const handleDurationChange = useCallback((value: number | string) => {
    setDuration(value)
    debouncedOnChange(value, timeStep)
  }, [timeStep, debouncedOnChange])
  
  // Handle time step change
  const handleTimeStepChange = useCallback((value: number | string) => {
    setTimeStep(value)
    debouncedOnChange(duration, value)
  }, [duration, debouncedOnChange])
  
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
      </Stack>
    </Paper>
  )
}
// components/SimulationSettingsPanel.tsx
'use client'

import { useState, useEffect } from 'react'

interface SimulationSettings {
  duration: string
  timeStep: string
}

interface SimulationSettingsPanelProps {
  initialDuration?: number
  initialTimeStep?: number
  onChange: (settings: { duration: string; timeStep: string }) => void
}

export default function SimulationSettingsPanel({
  initialDuration = 10.0,
  initialTimeStep = 0.01,
  onChange
}: SimulationSettingsPanelProps) {
  const [settings, setSettings] = useState<SimulationSettings>({
    duration: initialDuration.toString(),
    timeStep: initialTimeStep.toString()
  })

  // Update local state when props change
  useEffect(() => {
    setSettings({
      duration: initialDuration.toString(),
      timeStep: initialTimeStep.toString()
    })
  }, [initialDuration, initialTimeStep])

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSettings = { ...settings, duration: e.target.value }
    setSettings(newSettings)
    onChange(newSettings)
  }

  const handleTimeStepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSettings = { ...settings, timeStep: e.target.value }
    setSettings(newSettings)
    onChange(newSettings)
  }

  return (
    <div className="p-4 border-b">
      <h3 className="font-medium mb-3 text-gray-900">Simulation Settings</h3>
      
      <div className="space-y-3">
        <div>
          <label 
            htmlFor="sim-duration" 
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Duration (seconds)
          </label>
          <input
            id="sim-duration"
            type="text"
            value={settings.duration}
            onChange={handleDurationChange}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm 
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="10.0"
          />
        </div>

        <div>
          <label 
            htmlFor="sim-timestep" 
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Time Step (seconds)
          </label>
          <input
            id="sim-timestep"
            type="text"
            value={settings.timeStep}
            onChange={handleTimeStepChange}
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm 
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="0.01"
          />
        </div>

        <div className="text-xs text-gray-500 mt-2">
          Settings will be validated when you save or run simulation
        </div>
      </div>
    </div>
  )
}

// Validation utility function
export function validateSimulationSettings(duration: string, timeStep: string): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []
  
  // Parse values
  const durationNum = parseFloat(duration)
  const timeStepNum = parseFloat(timeStep)
  
  // Validate duration
  if (isNaN(durationNum)) {
    errors.push('Duration must be a valid number')
  } else if (durationNum <= 0) {
    errors.push('Duration must be greater than 0')
  }
  
  // Validate time step
  if (isNaN(timeStepNum)) {
    errors.push('Time Step must be a valid number')
  } else if (timeStepNum <= 0) {
    errors.push('Time Step must be greater than 0')
  }
  
  // Validate relationship
  if (!isNaN(durationNum) && !isNaN(timeStepNum) && timeStepNum > durationNum) {
    errors.push('Time Step must be less than or equal to Duration')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}
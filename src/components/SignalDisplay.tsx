// components/SignalDisplay.tsx

'use client'

import { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { BlockData } from './BlockNode'

interface SignalDisplayProps {
  block: BlockData
  signalData?: { time: number; value: number | number[] | boolean | boolean[] }[]
  isRunning?: boolean
}

// Color palette for multi-line plots
const LINE_COLORS = [
  '#ef4444', // red
  '#10b981', // green
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
]

export default function SignalDisplay({ block, signalData = [], isRunning = false }: SignalDisplayProps) {
  const [chartData, setChartData] = useState<any[]>([])
  const [vectorSize, setVectorSize] = useState(1)
  const [isVector, setIsVector] = useState(false)
  
  const maxSamples = block.parameters?.maxSamples || 1000
  const displayName = block.name

  console.log('SignalDisplay maxSamples:', maxSamples, 'from block:', block)

useEffect(() => {
  if (signalData.length === 0) {
    setChartData([])
    return
  }
  
  console.log('SignalDisplay useEffect - signalData:', {
    length: signalData.length,
    isArray: Array.isArray(signalData),
    first: signalData[0],
    last: signalData[signalData.length - 1]
  })
  
  // Determine if we're dealing with vector data
  const firstValue = signalData[0]?.value
  const isVectorData = Array.isArray(firstValue)
  setIsVector(isVectorData)
  
  if (isVectorData) {
    const size = (firstValue as any[]).length
    setVectorSize(size)
    
    // Transform vector data for multi-line chart
    console.log('About to slice with maxSamples:', maxSamples)
    const slicedData = signalData.slice(-maxSamples)
    console.log('After slice:', slicedData.length, 'samples')
  

    const transformedData = slicedData.map((point, index) => {
      const dataPoint: any = { 
        time: point.time,  // Keep as number, not string
      }
      
      if (Array.isArray(point.value)) {
        point.value.forEach((val, i) => {
          dataPoint[`element_${i}`] = typeof val === 'number' ? val : (val ? 1 : 0)
        })
      }
      
      return dataPoint
    })
    
    console.log('Final transformedData length:', transformedData.length)
    console.log('Sample of transformed data:', transformedData.slice(0, 3))
    console.log('Chart data being set with', transformedData.length, 'points')
    
    setChartData(transformedData)
  } else {
      // Transform scalar data
      const transformedData = signalData.slice(-maxSamples).map((point) => ({
        time: point.time,
        value: typeof point.value === 'number' ? point.value : (point.value ? 1 : 0)
      }))
      
      setChartData(transformedData)
    }
  }, [signalData, maxSamples])
  
  // Calculate Y-axis domain
const getYDomain = () => {
  if (chartData.length === 0) return [-1, 1]
  
  let min = Infinity
  let max = -Infinity
  
  console.log('getYDomain - checking data, isVector:', isVector, 'vectorSize:', vectorSize)
  
  chartData.forEach((point, idx) => {
    if (idx < 3) console.log('Point sample:', point) // Log first few points
    
    if (isVector) {
      for (let i = 0; i < vectorSize; i++) {
        const val = point[`element_${i}`]
        if (typeof val === 'number') {
          min = Math.min(min, val)
          max = Math.max(max, val)
        }
      }
    } else {
      if (typeof point.value === 'number') {
        min = Math.min(min, point.value)
        max = Math.max(max, point.value)
      }
    }
  })
  
  console.log('getYDomain result:', { min, max })
  
  // Add some padding
  const range = max - min
  const padding = range * 0.1 || 0.1
  return [min - padding, max + padding]
}
  
  const yDomain = getYDomain()

  console.log('SignalDisplay render - chartData:', {
  length: chartData.length,
  sample: chartData.slice(0, 3),
  hasData: chartData.length > 0
})

console.log('Y-axis domain:', yDomain)
console.log('First few data points:', chartData.slice(0, 5))
console.log('Last few data points:', chartData.slice(-5))
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md dark:shadow-gray-900 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">{displayName}</h3>
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <span className="w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full animate-pulse" />
              Recording
            </span>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {chartData.length} / {maxSamples} samples
          </span>
        </div>
      </div>
      
      <div className="h-64">
        <ResponsiveContainer width="100%" height={256}>
          <LineChart
              key={`chart-${chartData.length}-${vectorSize}`}  
              data={chartData}
              margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
            >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="time"
              label={{ value: 'Time (s)', position: 'insideBottom', offset: -5 }}
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
              tickFormatter={(value) => value.toFixed(2)}
            />
            <YAxis 
              domain={yDomain}
              label={{ value: 'Value', angle: -90, position: 'insideLeft' }}
              tick={{ fontSize: 12 }}
              stroke="#6b7280"
              tickFormatter={(value) => value.toFixed(2)}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '12px'
              }}
              formatter={(value: any) => typeof value === 'number' ? value.toFixed(4) : value}
            />
            
           {isVector ? (
            // Remove the fragment and render Lines directly
            [
              <Legend 
                key="legend"
                wrapperStyle={{ fontSize: '12px' }}
                iconType="line"
              />,
              ...Array.from({ length: vectorSize }).map((_, i) => (
                <Line
                  key={`element_${i}`}
                  type="monotone"
                  dataKey={`element_${i}`}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  name={`Element ${i}`}
                />
              ))
            ]
          ) : (
            <Line
              type="monotone"
              dataKey="value"
              stroke={LINE_COLORS[0]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {isVector && (
        <div className="mt-2 text-xs text-gray-600">
          Displaying {vectorSize} vector elements
        </div>
      )}
    </div>
  )
}

// Configuration component for Signal Display blocks
interface SignalDisplayConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export function SignalDisplayConfig({ block, onUpdate, onClose }: SignalDisplayConfigProps) {
  const [maxSamples, setMaxSamples] = useState(block.parameters?.maxSamples || 1000)
  
  const handleSave = () => {
    onUpdate({ maxSamples })
    onClose()
  }
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-96">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Configure Signal Display: {block.name}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Maximum Samples
            </label>
            <input
              type="number"
              min="10"
              max="10000"
              value={maxSamples}
              onChange={(e) => setMaxSamples(parseInt(e.target.value) || 1000)}
              className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Number of data points to display (10-10000)
            </p>
          </div>
          
          <div className="bg-blue-50 p-3 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>Signal Display:</strong> Shows real-time signal values during simulation. 
              Vector signals will be displayed as multiple lines with different colors.
            </p>
          </div>
        </div>
        
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
// components/UnitsConversionConfig.tsx

'use client'

import { useState, useMemo } from 'react'
import { Modal, Select, Button, Stack, Group, Alert, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { BlockData } from './BlockNode'
import { UNITS_CONVERSION_CATALOG, getConversionInfo } from '@/lib/blocks/UnitsConversionBlockModule'

interface UnitsConversionConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function UnitsConversionConfig({
  block,
  onUpdate,
  onClose
}: UnitsConversionConfigProps) {
  // Get initial values from block parameters
  const initialConversionType = block?.parameters?.conversionType || 'deg_to_rad'
  const initialInfo = getConversionInfo(initialConversionType)
  const initialCategory = initialInfo?.category || 'angle'

  const [category, setCategory] = useState(initialCategory)
  const [conversionType, setConversionType] = useState(initialConversionType)

  // Build category options
  const categoryOptions = useMemo(() => {
    return Object.entries(UNITS_CONVERSION_CATALOG).map(([key, value]) => ({
      value: key,
      label: value.label
    }))
  }, [])

  // Build conversion options for selected category
  const conversionOptions = useMemo(() => {
    const categoryData = UNITS_CONVERSION_CATALOG[category as keyof typeof UNITS_CONVERSION_CATALOG]
    if (!categoryData) return []

    return Object.entries(categoryData.conversions).map(([key, value]) => ({
      value: key,
      label: value.label,
      description: value.description
    }))
  }, [category])

  // Get info about selected conversion
  const selectedConversion = useMemo(() => {
    return getConversionInfo(conversionType)
  }, [conversionType])

  const handleCategoryChange = (newCategory: string | null) => {
    if (!newCategory) return
    setCategory(newCategory)

    // Select the first conversion in the new category
    const categoryData = UNITS_CONVERSION_CATALOG[newCategory as keyof typeof UNITS_CONVERSION_CATALOG]
    if (categoryData) {
      const firstConversion = Object.keys(categoryData.conversions)[0]
      setConversionType(firstConversion)
    }
  }

  const handleConversionChange = (newConversion: string | null) => {
    if (newConversion) {
      setConversionType(newConversion)
    }
  }

  const handleSave = () => {
    const parameters = {
      ...block.parameters,
      conversionType,
      category
    }
    onUpdate(parameters)
    onClose()
  }

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Units Conversion: ${block?.name || 'Block'}`}
      size="lg"
      centered
    >
      <Stack gap="md">
        <Select
          label="Category"
          value={category}
          onChange={handleCategoryChange}
          data={categoryOptions}
          searchable
        />

        <Select
          label="Conversion"
          value={conversionType}
          onChange={handleConversionChange}
          data={conversionOptions.map(conv => ({ value: conv.value, label: conv.label }))}
          searchable
        />

        {selectedConversion && (
          <Alert variant="light" color="blue" icon={<IconInfoCircle />} title={selectedConversion.label}>
            <Text size="sm">{selectedConversion.description}</Text>
          </Alert>
        )}

        <Alert variant="light" color="gray" title="Conversion Categories">
          <Text size="sm">
            <strong>Angle:</strong> deg, rad, rev
          </Text>
          <Text size="sm">
            <strong>Temperature:</strong> C, F, K, R
          </Text>
          <Text size="sm">
            <strong>Length:</strong> m, ft, in, km, mi, nmi
          </Text>
          <Text size="sm">
            <strong>Velocity:</strong> m/s, ft/s, kts, mph, km/h
          </Text>
          <Text size="sm">
            <strong>Angular Velocity:</strong> rad/s, deg/s, rpm
          </Text>
          <Text size="sm">
            <strong>Acceleration:</strong> m/s2, ft/s2, g
          </Text>
          <Text size="sm">
            <strong>Mass:</strong> kg, lbm, slug
          </Text>
          <Text size="sm">
            <strong>Force:</strong> N, lbf
          </Text>
          <Text size="sm">
            <strong>Pressure:</strong> Pa, psi, atm, inHg, mbar
          </Text>
          <Text size="sm">
            <strong>Area:</strong> m2, ft2, in2, km2, mi2, ha, acre
          </Text>
          <Text size="sm">
            <strong>Volume:</strong> m3, ft3, L, gal, in3
          </Text>
          <Text size="sm">
            <strong>Energy:</strong> J, BTU, ft-lbf
          </Text>
          <Text size="sm">
            <strong>Power:</strong> W, hp, BTU/h
          </Text>
          <Text size="sm">
            <strong>Torque:</strong> N-m, lb-ft, lb-in
          </Text>
          <Text size="sm">
            <strong>Density:</strong> kg/m3, lb/ft3, slug/ft3
          </Text>
          <Text size="sm">
            <strong>Flow Rate:</strong> m3/s, CFM, L/min, GPM
          </Text>
        </Alert>

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

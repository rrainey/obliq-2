// components/ExportPdfDialog.tsx
'use client'

import { useMemo, useState } from 'react'
import {
  Modal, TextInput, Select, Button, Stack, Group, Text, Checkbox, Divider, Alert,
} from '@mantine/core'
import { IconFileTypePdf, IconInfoCircle } from '@tabler/icons-react'
import {
  PAGE_SIZES,
  DEFAULT_PAGE_SIZE_ID,
  DEFAULT_ORIENTATION,
  type PageOrientation,
} from '@/lib/export/pageSizes'
import type { PrintScope } from '@/lib/export/sheetTree'
import type { PdfExportOptions, PdfScaling } from '@/lib/export/pdfRenderer'

interface ExportPdfDialogProps {
  opened: boolean
  modelName: string
  defaultFileName: string
  /** True when the active sheet sits inside a subsystem. */
  insideSubsystem: boolean
  exporting?: boolean
  onClose: () => void
  onExport: (options: PdfExportOptions) => void
}

const SCALING_OPTIONS: Array<{ value: PdfScaling; label: string }> = [
  { value: '100', label: '100%' },
  { value: '50', label: '50%' },
  { value: 'fit', label: 'Scale sheet to fit print area' },
]

export default function ExportPdfDialog({
  opened,
  modelName,
  defaultFileName,
  insideSubsystem,
  exporting = false,
  onClose,
  onExport,
}: ExportPdfDialogProps) {
  const [fileName, setFileName] = useState(defaultFileName)
  const [orientation, setOrientation] = useState<PageOrientation>(DEFAULT_ORIENTATION)
  const [pageSizeId, setPageSizeId] = useState(DEFAULT_PAGE_SIZE_ID)
  const [scaling, setScaling] = useState<PdfScaling>('100')
  const [fitLargeSheets, setFitLargeSheets] = useState(false)
  const [scope, setScope] = useState<PrintScope>('model')
  const [includeSubsystemSummaries, setIncludeSubsystemSummaries] = useState(false)
  // Truncation is off by default: shortened text cannot be found by a reader
  // searching the produced PDF.
  const [truncateBlockNames, setTruncateBlockNames] = useState(false)
  const [truncateInBlockText, setTruncateInBlockText] = useState(false)

  const pageSizeData = useMemo(
    () =>
      ['US', 'ISO', 'Blueprint'].map(group => ({
        group,
        items: PAGE_SIZES.filter(p => p.group === group).map(p => ({
          value: p.id,
          label: p.label,
        })),
      })),
    []
  )

  const scopeData = useMemo(
    () => [
      { value: 'model', label: 'Entire model' },
      {
        value: 'subsystem',
        label: insideSubsystem
          ? 'Current subsystem'
          : 'Current subsystem (not in one — exports entire model)',
      },
      { value: 'sheet', label: 'Current sheet' },
    ],
    [insideSubsystem]
  )

  const handleExport = () => {
    onExport({
      fileName: fileName.trim() || defaultFileName,
      orientation,
      pageSizeId,
      scaling,
      fitLargeSheets,
      scope,
      includeSubsystemSummaries,
      allowTruncation: {
        blockNames: truncateBlockNames,
        inBlockText: truncateInBlockText,
      },
    })
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Export as PDF: ${modelName}`}
      size="lg"
      centered
    >
      <Stack gap="md">
        <TextInput
          label="File name"
          value={fileName}
          onChange={e => setFileName(e.target.value)}
          placeholder="model.pdf"
          description="A .pdf extension is added if you leave it off"
        />

        <Divider label="Page" labelPosition="left" />

        <Group grow align="flex-start">
          <Select
            label="Orientation"
            value={orientation}
            onChange={v => setOrientation((v || 'landscape') as PageOrientation)}
            data={[
              { value: 'landscape', label: 'Landscape' },
              { value: 'portrait', label: 'Portrait' },
            ]}
            allowDeselect={false}
          />
          <Select
            label="Page size"
            value={pageSizeId}
            onChange={v => setPageSizeId(v || DEFAULT_PAGE_SIZE_ID)}
            data={pageSizeData}
            searchable
            allowDeselect={false}
          />
        </Group>

        <Select
          label="Scaling"
          value={scaling}
          onChange={v => setScaling((v || '100') as PdfScaling)}
          data={SCALING_OPTIONS}
          allowDeselect={false}
        />

        <Checkbox
          label="Scale large sheets to fit the printing area"
          description="Applies only to sheets that would otherwise overflow the page"
          checked={fitLargeSheets}
          onChange={e => setFitLargeSheets(e.currentTarget.checked)}
          disabled={scaling === 'fit'}
        />

        <Divider label="Content" labelPosition="left" />

        <Select
          label="Print scope"
          value={scope}
          onChange={v => setScope((v || 'model') as PrintScope)}
          data={scopeData}
          allowDeselect={false}
        />

        <Checkbox
          label="Include subsystem summary pages"
          description="Adds a page per subsystem listing its ports, parameters, and sheets"
          checked={includeSubsystemSummaries}
          onChange={e => setIncludeSubsystemSummaries(e.currentTarget.checked)}
        />

        <Divider label="Allow Text Truncation" labelPosition="left" />

        <Text size="xs" c="dimmed">
          Disabled by default. Text left untruncated may overflow its block on a
          scaled-down sheet, but stays findable when searching the PDF.
        </Text>

        <Checkbox
          label="Block names"
          description="Shorten long block names with an ellipsis"
          checked={truncateBlockNames}
          onChange={e => setTruncateBlockNames(e.currentTarget.checked)}
        />

        <Checkbox
          label="In-block information"
          description="Shorten port names and in-block expressions with an ellipsis"
          checked={truncateInBlockText}
          onChange={e => setTruncateInBlockText(e.currentTarget.checked)}
        />

        <Alert variant="light" color="gray" icon={<IconInfoCircle />}>
          <Text size="sm">
            One page per sheet, drawn as vector output so blueprint sizes stay sharp.
            Each page is footed with its subsystem path in full, then the model name,
            sheet name, page number, and print date.
          </Text>
        </Alert>

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={exporting}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            loading={exporting}
            leftSection={<IconFileTypePdf size={16} />}
          >
            Export
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

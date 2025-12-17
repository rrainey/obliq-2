'use client'

import { useState } from 'react'
import { Modal, Textarea, NumberInput, ColorInput, Button, Stack, Group, Text, Paper, SimpleGrid, Checkbox, Code } from '@mantine/core'
import { BlockData } from './BlockNode'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

interface CommentConfigProps {
  block: BlockData
  onUpdate: (parameters: Record<string, any>) => void
  onClose: () => void
}

export default function CommentConfig({ block, onUpdate, onClose }: CommentConfigProps) {
  const [text, setText] = useState(block.parameters?.text || '# Comment\n\nAdd your notes here...')
  const [width, setWidth] = useState<number>(block.parameters?.width || 200)
  const [height, setHeight] = useState<number>(block.parameters?.height || 100)
  const [autoHeight, setAutoHeight] = useState<boolean>(block.parameters?.autoHeight ?? true)
  const [backgroundColor, setBackgroundColor] = useState(block.parameters?.backgroundColor || '#fffde7')
  const [borderColor, setBorderColor] = useState(block.parameters?.borderColor || '#ffd54f')
  const [showPreview, setShowPreview] = useState(true)

  const handleSave = () => {
    const parameters: Record<string, any> = {
      text,
      width,
      autoHeight,
      backgroundColor,
      borderColor
    }
    // Only include height if autoHeight is false
    if (!autoHeight) {
      parameters.height = height
    }
    onUpdate(parameters)
    onClose()
  }

  const colorPresets = [
    { name: 'Yellow Note', bg: '#fffde7', border: '#ffd54f' },
    { name: 'Blue Note', bg: '#e3f2fd', border: '#64b5f6' },
    { name: 'Green Note', bg: '#e8f5e9', border: '#81c784' },
    { name: 'Pink Note', bg: '#fce4ec', border: '#f48fb1' },
    { name: 'Purple Note', bg: '#f3e5f5', border: '#ba68c8' },
    { name: 'Gray Note', bg: '#f5f5f5', border: '#bdbdbd' },
    { name: 'Canvas (Transparent)', bg: 'canvas', border: 'none' },
  ]

  const isTransparent = backgroundColor === 'canvas'
  const hasNoBorder = borderColor === 'none'

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Configure Comment: ${block.name}`}
      size="xl"
      centered
    >
      <SimpleGrid cols={2} spacing="md">
        {/* Left column: Editor */}
        <Stack gap="md">
          <Textarea
            label="Markdown Content"
            value={text}
            onChange={(e) => setText(e.target.value)}
            minRows={10}
            autosize
            maxRows={15}
            placeholder="Enter markdown text..."
            description="Supports GitHub Flavored Markdown and LaTeX math ($...$ inline, $$...$$ block)"
            styles={{ input: { fontFamily: 'monospace' } }}
          />

          <SimpleGrid cols={2}>
            <NumberInput
              label="Width (px)"
              value={width}
              onChange={(val) => setWidth(typeof val === 'number' ? val : 200)}
              min={100}
              max={800}
            />
            <div>
              <Checkbox
                label="Auto-fit height"
                checked={autoHeight}
                onChange={(e) => setAutoHeight(e.currentTarget.checked)}
                mb="xs"
              />
              {!autoHeight && (
                <NumberInput
                  label="Min Height (px)"
                  value={height}
                  onChange={(val) => setHeight(typeof val === 'number' ? val : 100)}
                  min={50}
                  max={600}
                />
              )}
            </div>
          </SimpleGrid>

          <div>
            <Text size="sm" fw={500} mb="xs">Color Theme</Text>
            <Group gap="xs">
              {colorPresets.map((preset) => {
                const isPresetTransparent = preset.bg === 'canvas'
                const isPresetNoBorder = preset.border === 'none'
                return (
                  <Paper
                    key={preset.name}
                    p="xs"
                    style={{
                      cursor: 'pointer',
                      backgroundColor: isPresetTransparent ? '#ffffff' : preset.bg,
                      border: isPresetNoBorder ? '2px dashed #999' : `2px solid ${preset.border}`,
                      outline: backgroundColor === preset.bg && borderColor === preset.border ? '2px solid var(--mantine-color-blue-5)' : 'none',
                      outlineOffset: 2,
                      backgroundImage: isPresetTransparent
                        ? 'linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)'
                        : 'none',
                      backgroundSize: isPresetTransparent ? '8px 8px' : 'auto',
                    }}
                    onClick={() => {
                      setBackgroundColor(preset.bg)
                      setBorderColor(preset.border)
                    }}
                    title={preset.name}
                  >
                    <Text size="xs">{preset.name.split(' ')[0]}</Text>
                  </Paper>
                )
              })}
            </Group>
          </div>

          <SimpleGrid cols={2}>
            <div>
              <Text size="sm" fw={500} mb="xs">Background Color</Text>
              <Checkbox
                label="Transparent (Canvas)"
                checked={isTransparent}
                onChange={(e) => setBackgroundColor(e.currentTarget.checked ? 'canvas' : '#fffde7')}
                mb="xs"
              />
              {!isTransparent && (
                <ColorInput
                  value={backgroundColor}
                  onChange={setBackgroundColor}
                  format="hex"
                />
              )}
            </div>
            <div>
              <Text size="sm" fw={500} mb="xs">Border Color</Text>
              <Checkbox
                label="No Border"
                checked={hasNoBorder}
                onChange={(e) => setBorderColor(e.currentTarget.checked ? 'none' : '#ffd54f')}
                mb="xs"
              />
              {!hasNoBorder && (
                <ColorInput
                  value={borderColor}
                  onChange={setBorderColor}
                  format="hex"
                />
              )}
            </div>
          </SimpleGrid>
        </Stack>

        {/* Right column: Preview */}
        <Stack gap="md">
          <Group justify="space-between">
            <Text size="sm" fw={500}>Preview</Text>
            <Button variant="subtle" size="xs" onClick={() => setShowPreview(!showPreview)}>
              {showPreview ? 'Hide' : 'Show'} Preview
            </Button>
          </Group>

          {showPreview && (
            <div
              style={{
                width: Math.min(width, 360),
                minHeight: autoHeight ? undefined : Math.min(height, 300),
                maxHeight: autoHeight ? undefined : 400,
                overflow: autoHeight ? 'visible' : 'auto',
                padding: 12,
                backgroundColor: isTransparent ? 'transparent' : backgroundColor,
                border: hasNoBorder ? 'none' : `2px solid ${borderColor}`,
                borderRadius: hasNoBorder ? '0' : '8px',
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  h1: ({ children }) => <h1 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{children}</h1>,
                  h2: ({ children }) => <h2 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{children}</h2>,
                  h3: ({ children }) => <h3 style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>{children}</h3>,
                  p: ({ children }) => <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>{children}</p>,
                  ul: ({ children }) => <ul style={{ listStyle: 'disc inside', fontSize: '0.875rem', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>{children}</ul>,
                  ol: ({ children }) => <ol style={{ listStyle: 'decimal inside', fontSize: '0.875rem', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>{children}</ol>,
                  code: ({ children }) => <code style={{ backgroundColor: 'var(--mantine-color-gray-1)', padding: '0.125rem 0.25rem', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'monospace' }}>{children}</code>,
                  blockquote: ({ children }) => <blockquote style={{ borderLeft: '4px solid var(--mantine-color-gray-3)', paddingLeft: '0.75rem', fontStyle: 'italic', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{children}</blockquote>,
                }}
              >
                {text}
              </ReactMarkdown>
            </div>
          )}

          <Paper p="sm" withBorder>
            <Text size="xs" fw={500} mb="xs">Markdown Quick Reference:</Text>
            <Stack gap={2}>
              <Text size="xs"><Code># Heading</Code> - Large heading</Text>
              <Text size="xs"><Code>## Subheading</Code> - Subheading</Text>
              <Text size="xs"><Code>**bold**</Code> - <strong>bold text</strong></Text>
              <Text size="xs"><Code>*italic*</Code> - <em>italic text</em></Text>
              <Text size="xs"><Code>- item</Code> - Bullet list</Text>
              <Text size="xs"><Code>1. item</Code> - Numbered list</Text>
              <Text size="xs"><Code>`code`</Code> - Inline code</Text>
              <Text size="xs"><Code>$E=mc^2$</Code> - Inline LaTeX</Text>
              <Text size="xs"><Code>$$\int_0^1 x dx$$</Code> - Block LaTeX</Text>
            </Stack>
          </Paper>
        </Stack>
      </SimpleGrid>

      <Group justify="flex-end" gap="sm" mt="md">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave}>
          Save
        </Button>
      </Group>
    </Modal>
  )
}

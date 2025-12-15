'use client'

import { useState } from 'react'
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
  const [width, setWidth] = useState(block.parameters?.width || 200)
  const [height, setHeight] = useState(block.parameters?.height || 100)
  const [backgroundColor, setBackgroundColor] = useState(block.parameters?.backgroundColor || '#fffde7')
  const [borderColor, setBorderColor] = useState(block.parameters?.borderColor || '#ffd54f')
  const [showPreview, setShowPreview] = useState(true)

  const handleSave = () => {
    const parameters = {
      text,
      width,
      height,
      backgroundColor,
      borderColor
    }
    onUpdate(parameters)
    onClose()
  }

  // Preset color themes
  const colorPresets = [
    { name: 'Yellow Note', bg: '#fffde7', border: '#ffd54f' },
    { name: 'Blue Note', bg: '#e3f2fd', border: '#64b5f6' },
    { name: 'Green Note', bg: '#e8f5e9', border: '#81c784' },
    { name: 'Pink Note', bg: '#fce4ec', border: '#f48fb1' },
    { name: 'Purple Note', bg: '#f3e5f5', border: '#ba68c8' },
    { name: 'Gray Note', bg: '#f5f5f5', border: '#bdbdbd' },
    { name: 'Canvas (Transparent)', bg: 'canvas', border: 'none' },
  ]

  // Check for special values
  const isTransparent = backgroundColor === 'canvas'
  const hasNoBorder = borderColor === 'none'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-[800px] max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Configure Comment: {block.name}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Left column: Editor */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Markdown Content
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full h-64 px-3 py-2 border-2 border-gray-400 rounded-md text-sm font-mono bg-white text-gray-900 focus:border-blue-600 focus:outline-none resize-none"
                placeholder="Enter markdown text..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Supports GitHub Flavored Markdown and LaTeX math ($...$ inline, $$...$$ block)
              </p>
            </div>

            {/* Size controls */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Width (px)
                </label>
                <input
                  type="number"
                  min={100}
                  max={800}
                  value={width}
                  onChange={(e) => setWidth(parseInt(e.target.value) || 200)}
                  className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Height (px)
                </label>
                <input
                  type="number"
                  min={50}
                  max={600}
                  value={height}
                  onChange={(e) => setHeight(parseInt(e.target.value) || 100)}
                  className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-sm bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Color presets */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Color Theme
              </label>
              <div className="flex flex-wrap gap-2">
                {colorPresets.map((preset) => {
                  const isPresetTransparent = preset.bg === 'canvas'
                  const isPresetNoBorder = preset.border === 'none'
                  return (
                    <button
                      key={preset.name}
                      onClick={() => {
                        setBackgroundColor(preset.bg)
                        setBorderColor(preset.border)
                      }}
                      className={`px-3 py-1 text-xs rounded ${
                        backgroundColor === preset.bg && borderColor === preset.border
                          ? 'ring-2 ring-blue-500'
                          : ''
                      }`}
                      style={{
                        backgroundColor: isPresetTransparent ? '#ffffff' : preset.bg,
                        border: isPresetNoBorder ? '2px dashed #999' : `2px solid ${preset.border}`,
                        backgroundImage: isPresetTransparent
                          ? 'linear-gradient(45deg, #e0e0e0 25%, transparent 25%), linear-gradient(-45deg, #e0e0e0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e0e0 75%), linear-gradient(-45deg, transparent 75%, #e0e0e0 75%)'
                          : 'none',
                        backgroundSize: isPresetTransparent ? '8px 8px' : 'auto',
                        backgroundPosition: isPresetTransparent ? '0 0, 0 4px, 4px -4px, -4px 0px' : 'auto',
                      }}
                      title={preset.name}
                    >
                      {preset.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Custom colors */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Background Color
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="transparent-bg"
                    checked={isTransparent}
                    onChange={(e) => setBackgroundColor(e.target.checked ? 'canvas' : '#fffde7')}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <label htmlFor="transparent-bg" className="text-sm text-gray-600">
                    Transparent (Canvas)
                  </label>
                </div>
                {!isTransparent && (
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={backgroundColor}
                      onChange={(e) => setBackgroundColor(e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={backgroundColor}
                      onChange={(e) => setBackgroundColor(e.target.value)}
                      className="flex-1 px-3 py-2 border-2 border-gray-400 rounded-md text-sm font-mono bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Border Color
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="no-border"
                    checked={hasNoBorder}
                    onChange={(e) => setBorderColor(e.target.checked ? 'none' : '#ffd54f')}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <label htmlFor="no-border" className="text-sm text-gray-600">
                    No Border
                  </label>
                </div>
                {!hasNoBorder && (
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={borderColor}
                      onChange={(e) => setBorderColor(e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={borderColor}
                      onChange={(e) => setBorderColor(e.target.value)}
                      className="flex-1 px-3 py-2 border-2 border-gray-400 rounded-md text-sm font-mono bg-white text-gray-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right column: Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Preview
              </label>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {showPreview ? 'Hide' : 'Show'} Preview
              </button>
            </div>

            {showPreview && (
              <div
                className="p-3 overflow-auto"
                style={{
                  width: Math.min(width, 360),
                  minHeight: Math.min(height, 300),
                  maxHeight: 400,
                  backgroundColor: isTransparent ? 'transparent' : backgroundColor,
                  border: hasNoBorder ? 'none' : `2px solid ${borderColor}`,
                  borderRadius: hasNoBorder ? '0' : '8px',
                  // Show a subtle pattern for transparent background in preview
                  backgroundImage: isTransparent
                    ? 'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)'
                    : 'none',
                  backgroundSize: isTransparent ? '20px 20px' : 'auto',
                  backgroundPosition: isTransparent ? '0 0, 0 10px, 10px -10px, -10px 0px' : 'auto',
                }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    h1: ({ children }) => <h1 className="text-lg font-bold text-gray-800 mb-2">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-base font-bold text-gray-800 mb-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-bold text-gray-800 mb-1">{children}</h3>,
                    p: ({ children }) => <p className="text-sm text-gray-700 mb-2">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-inside text-sm mb-2 pl-2">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside text-sm mb-2 pl-2">{children}</ol>,
                    code: ({ children }) => <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
                    blockquote: ({ children }) => <blockquote className="border-l-4 border-gray-300 pl-3 italic text-gray-600 text-sm mb-2">{children}</blockquote>,
                  }}
                >
                  {text}
                </ReactMarkdown>
              </div>
            )}

            {/* Markdown help */}
            <div className="mt-4 bg-gray-50 p-3 rounded-md text-xs text-gray-600">
              <p className="font-medium mb-2">Markdown Quick Reference:</p>
              <ul className="space-y-1">
                <li><code className="bg-gray-200 px-1"># Heading</code> - Large heading</li>
                <li><code className="bg-gray-200 px-1">## Subheading</code> - Subheading</li>
                <li><code className="bg-gray-200 px-1">**bold**</code> - <strong>bold text</strong></li>
                <li><code className="bg-gray-200 px-1">*italic*</code> - <em>italic text</em></li>
                <li><code className="bg-gray-200 px-1">- item</code> - Bullet list</li>
                <li><code className="bg-gray-200 px-1">1. item</code> - Numbered list</li>
                <li><code className="bg-gray-200 px-1">`code`</code> - Inline code</li>
                <li><code className="bg-gray-200 px-1">$E=mc^2$</code> - Inline LaTeX</li>
                <li><code className="bg-gray-200 px-1">$$\int_0^1 x dx$$</code> - Block LaTeX</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6 pt-4 border-t">
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

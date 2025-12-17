// components/CommentNode.tsx - Comment block with Markdown rendering

'use client'

import { memo, CSSProperties } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

export interface CommentNodeData {
  id: string
  type: 'comment'
  name: string
  parameters?: {
    text?: string
    width?: number
    height?: number
    autoHeight?: boolean      // When true, height auto-expands to fit text
    backgroundColor?: string  // 'canvas' for transparent background
    borderColor?: string      // 'none' for no border
  }
}

export interface CommentNodeProps {
  data: CommentNodeData
  selected?: boolean
}

/**
 * CommentNode - A special block that renders Markdown text
 * No inputs/outputs, just visual annotation on the canvas
 */
export const CommentNode: React.FC<CommentNodeProps> = memo(({ data, selected }) => {
  const {
    text = '# Comment\n\nAdd your notes here...',
    width = 200,
    height = 100,
    autoHeight = true,
    backgroundColor = '#fffde7',
    borderColor = '#ffd54f'
  } = data.parameters || {}

  // Handle special values: 'canvas' for transparent bg, 'none' for no border
  const isTransparent = backgroundColor === 'canvas'
  const hasNoBorder = borderColor === 'none'

  const containerStyle: CSSProperties = {
    position: 'relative',
    width: width,
    minHeight: autoHeight ? undefined : height,
    backgroundColor: isTransparent ? 'transparent' : backgroundColor,
    border: hasNoBorder ? 'none' : `2px solid ${borderColor}`,
    borderRadius: hasNoBorder ? '0' : '8px',
    padding: '12px',
    boxShadow: selected
      ? '0 0 0 2px #3b82f6, 0 0 0 4px rgba(59, 130, 246, 0.3)'
      : (isTransparent && hasNoBorder ? 'none' : '0 2px 4px rgba(0,0,0,0.1)'),
    overflow: 'visible',
    cursor: 'default',
  }

  // Custom components for ReactMarkdown to style the output
  const markdownComponents = {
    // Headers
    h1: ({ children, ...props }: any) => (
      <h1 className="text-lg font-bold text-gray-800 mb-2 mt-0" {...props}>{children}</h1>
    ),
    h2: ({ children, ...props }: any) => (
      <h2 className="text-base font-bold text-gray-800 mb-2 mt-2" {...props}>{children}</h2>
    ),
    h3: ({ children, ...props }: any) => (
      <h3 className="text-sm font-bold text-gray-800 mb-1 mt-2" {...props}>{children}</h3>
    ),
    // Paragraphs
    p: ({ children, ...props }: any) => (
      <p className="text-sm text-gray-700 mb-2 leading-relaxed" {...props}>{children}</p>
    ),
    // Lists
    ul: ({ children, ...props }: any) => (
      <ul className="list-disc list-inside text-sm text-gray-700 mb-2 pl-2" {...props}>{children}</ul>
    ),
    ol: ({ children, ...props }: any) => (
      <ol className="list-decimal list-inside text-sm text-gray-700 mb-2 pl-2" {...props}>{children}</ol>
    ),
    li: ({ children, ...props }: any) => (
      <li className="mb-1" {...props}>{children}</li>
    ),
    // Code
    code: ({ inline, children, ...props }: any) => (
      inline
        ? <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-gray-800" {...props}>{children}</code>
        : <code className="block bg-gray-100 p-2 rounded text-xs font-mono text-gray-800 overflow-x-auto mb-2" {...props}>{children}</code>
    ),
    pre: ({ children, ...props }: any) => (
      <pre className="bg-gray-100 p-2 rounded text-xs font-mono overflow-x-auto mb-2" {...props}>{children}</pre>
    ),
    // Blockquote
    blockquote: ({ children, ...props }: any) => (
      <blockquote className="border-l-4 border-gray-300 pl-3 italic text-gray-600 text-sm mb-2" {...props}>{children}</blockquote>
    ),
    // Table (GFM)
    table: ({ children, ...props }: any) => (
      <div className="overflow-x-auto mb-2">
        <table className="min-w-full text-xs border-collapse" {...props}>{children}</table>
      </div>
    ),
    thead: ({ children, ...props }: any) => (
      <thead className="bg-gray-100" {...props}>{children}</thead>
    ),
    th: ({ children, ...props }: any) => (
      <th className="border border-gray-300 px-2 py-1 text-left font-semibold" {...props}>{children}</th>
    ),
    td: ({ children, ...props }: any) => (
      <td className="border border-gray-300 px-2 py-1" {...props}>{children}</td>
    ),
    // Links
    a: ({ children, href, ...props }: any) => (
      <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
    ),
    // Horizontal rule
    hr: (props: any) => (
      <hr className="border-t border-gray-300 my-2" {...props} />
    ),
    // Strong/Bold
    strong: ({ children, ...props }: any) => (
      <strong className="font-bold" {...props}>{children}</strong>
    ),
    // Emphasis/Italic
    em: ({ children, ...props }: any) => (
      <em className="italic" {...props}>{children}</em>
    ),
  }

  return (
    <div style={containerStyle} className="comment-node">
      {/* Markdown content - Comment blocks never show their name */}
      <div
        className={autoHeight ? 'markdown-content' : 'markdown-content overflow-y-auto'}
        style={autoHeight ? undefined : { maxHeight: height - 24 }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={markdownComponents}
        >
          {text}
        </ReactMarkdown>
      </div>
    </div>
  )
})

CommentNode.displayName = 'CommentNode'

export default CommentNode

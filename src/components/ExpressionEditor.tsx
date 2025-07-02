// components/ExpressionEditor.tsx

'use client'

import { useEffect, useRef } from 'react'
import { c99Tokenizer, C99TokenType } from '@/lib/c99Tokenizer'

interface ExpressionEditorProps {
  value: string
  onChange: (value: string) => void
  error?: boolean
  placeholder?: string
}

export default function ExpressionEditor({ 
  value, 
  onChange, 
  error = false,
  placeholder 
}: ExpressionEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Tokenize and highlight
  const getHighlightedHTML = (text: string): string => {
    if (!text) return ''
    
    try {
      const tokens = c99Tokenizer(text)
      let html = ''
      let lastPos = 0
      
      for (const token of tokens) {
        // Add any text before this token
        if (token.column > lastPos) {
          html += escapeHtml(text.substring(lastPos, token.column))
        }
        
        // Add the token with appropriate styling
        const tokenText = token.value
        const className = getTokenClass(token.type)
        
        if (className) {
          html += `<span class="${className}">${escapeHtml(tokenText)}</span>`
        } else {
          html += escapeHtml(tokenText)
        }
        
        lastPos = token.column + tokenText.length
      }
      
      return html
    } catch {
      return escapeHtml(text)
    }
  }

  const getTokenClass = (type: C99TokenType): string => {
    switch (type) {
      case C99TokenType.INTEGER_LITERAL:
      case C99TokenType.FLOAT_LITERAL:
        return 'text-blue-600'
      
      case C99TokenType.IDENTIFIER:
        return 'text-purple-600'
      
      case C99TokenType.PLUS:
      case C99TokenType.MINUS:
      case C99TokenType.STAR:
      case C99TokenType.SLASH:
      case C99TokenType.PERCENT:
      case C99TokenType.EQ_EQ:
      case C99TokenType.NOT_EQ:
      case C99TokenType.LESS:
      case C99TokenType.GREATER:
      case C99TokenType.LESS_EQ:
      case C99TokenType.GREATER_EQ:
      case C99TokenType.AMP_AMP:
      case C99TokenType.PIPE_PIPE:
      case C99TokenType.BANG:
        return 'text-green-600 font-bold'
      
      case C99TokenType.LPAREN:
      case C99TokenType.RPAREN:
        return 'text-gray-600 font-bold'
      
      default:
        return ''
    }
  }

  const escapeHtml = (text: string): string => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return text.replace(/[&<>"']/g, m => map[m])
  }

  // For this simplified version, we'll just use a styled textarea
  // A full implementation would use a contenteditable div with proper cursor handling
  
  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2 border-2 rounded text-sm font-mono bg-white text-gray-900 focus:outline-none ${
          error 
            ? 'border-red-500 focus:border-red-600' 
            : 'border-gray-400 focus:border-blue-600'
        }`}
        placeholder={placeholder}
        rows={4}
        spellCheck={false}
      />
    </div>
  )
}